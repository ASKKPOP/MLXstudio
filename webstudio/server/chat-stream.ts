/**
 * MLX Studio Web — Chat streaming engine.
 * Mirrors the SSE-consuming logic from panel/src/main/ipc/chat.ts,
 * but pushes events to SSE clients instead of Electron IPC windows.
 */
import { randomUUID } from 'crypto'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { db, type Message, type ChatOverrides } from './database.js'
import { broadcaster } from './events.js'
import { sessionManager, connectHost } from './sessions.js'

const DEFAULT_PORT = 8000

// Active requests keyed by chatId
const activeRequests = new Map<string, {
  controller: AbortController
  startedAt: number
  timeoutMs: number
  responseId?: string
  endpoint?: { host: string; port: number }
  baseUrl?: string
  authHeaders?: Record<string, string>
}>()

// ask_user resolvers
const askUserResolvers = new Map<string, (answer: string) => void>()

export function answerUser(chatId: string, answer: string): void {
  const resolve = askUserResolvers.get(chatId)
  if (resolve) { askUserResolvers.delete(chatId); resolve(answer) }
}

export function abortChat(chatId: string): boolean {
  const entry = activeRequests.get(chatId)
  if (!entry) return false
  try { entry.controller.abort() } catch { }
  activeRequests.delete(chatId)
  return true
}

export function isChatStreaming(chatId: string): boolean {
  return activeRequests.has(chatId)
}

export function abortByEndpoint(host: string, port: number): number {
  let count = 0
  for (const [chatId, entry] of activeRequests) {
    if (entry.endpoint?.host === host && entry.endpoint?.port === port) {
      try { entry.controller.abort() } catch { }
      activeRequests.delete(chatId)
      count++
    }
  }
  return count
}

// ── Streaming fetch (same as Electron version) ─────────────────────────────

async function streamingFetch(url: string, init: {
  method: string
  headers: Record<string, string>
  body: string
  signal?: AbortSignal
}): Promise<{ ok: boolean; status: number; body: ReadableStream<Uint8Array> | null; text: () => Promise<string> }> {
  const parsed = new URL(url)
  const isHttps = parsed.protocol === 'https:'
  const reqFn = isHttps ? httpsRequest : httpRequest
  const bodyBuf = Buffer.from(init.body, 'utf-8')

  return new Promise((resolve, reject) => {
    if (init.signal?.aborted) {
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
      return
    }
    let settled = false
    const settle = (fn: () => void) => { if (!settled) { settled = true; fn() } }

    const req = reqFn({
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: init.method,
      agent: false,
      headers: { ...init.headers, 'Content-Length': bodyBuf.length.toString() }
    }, (res) => {
      const ok = (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300
      if (!ok) {
        let data = ''
        res.on('data', (c) => { data += c.toString() })
        res.on('end', () => settle(() => resolve({ ok, status: res.statusCode ?? 0, body: null, text: () => Promise.resolve(data) })))
        return
      }
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          res.on('data', (c: Buffer) => controller.enqueue(new Uint8Array(c)))
          res.on('end', () => { try { controller.close() } catch { } })
          res.on('error', (e) => { try { controller.error(e) } catch { } })
          res.on('close', () => { if (!res.complete) try { controller.error(new Error('Connection closed early')) } catch { } })
        },
        cancel() { res.destroy() }
      })
      settle(() => resolve({ ok: true, status: 200, body: stream, text: () => Promise.reject(new Error('Streaming')) }))
    })

    req.on('error', (e) => settle(() => reject(e)))
    if (init.signal) {
      init.signal.addEventListener('abort', () => {
        req.destroy()
        settle(() => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })))
      }, { once: true })
    }
    req.end(bodyBuf)
  })
}

// ── Auth helpers ────────────────────────────────────────────────────────────

function getAuthHeaders(sessionId?: string): Record<string, string> {
  if (!sessionId) return {}
  try {
    const session = db.getSession(sessionId)
    if (!session) return {}
    const config = JSON.parse(session.config)
    if (session.type === 'remote' && session.remoteApiKey) {
      const h: Record<string, string> = { 'Authorization': `Bearer ${session.remoteApiKey}` }
      if (session.remoteOrganization) h['OpenAI-Organization'] = session.remoteOrganization
      return h
    } else if (config.apiKey) {
      return { 'Authorization': `Bearer ${config.apiKey}` }
    }
  } catch { }
  return {}
}

// ── Endpoint resolution ─────────────────────────────────────────────────────

async function resolveEndpoint(modelPath?: string): Promise<{ host: string; port: number; session?: ReturnType<typeof db.getSession> }> {
  if (modelPath) {
    const session = sessionManager.getSessionByModelPath(modelPath.replace(/\/+$/, ''))
    if (session && session.status === 'running') return { host: session.host, port: session.port, session }
  }
  const processes = await sessionManager.detect()
  const healthy = processes.find(p => p.healthy)
  if (healthy) return { host: '127.0.0.1', port: healthy.port }
  return { host: '127.0.0.1', port: DEFAULT_PORT }
}

// ── Main send message handler ──────────────────────────────────────────────

const TEMPLATE_TOKEN_REGEX = /<\|im_end\|>|<\|im_start\|>|<\|eot_id\|>|<\|end\|>|<\/s>|<s>|<\|endoftext\|>|\[\/INST\]|\[INST\]|<end_of_turn>/g

export interface SendMessageOptions {
  chatId: string
  content: string
  endpoint?: { host: string; port: number }
  attachments?: Array<{ dataUrl: string; name: string }>
}

export async function sendMessage(opts: SendMessageOptions): Promise<void> {
  const { chatId, content, endpoint, attachments } = opts

  // Concurrency guard
  const existing = activeRequests.get(chatId)
  if (existing) {
    const age = Date.now() - existing.startedAt
    const stale = Math.min(existing.timeoutMs + 30_000, 30 * 60 * 1000)
    if (age > stale) {
      try { existing.controller.abort() } catch { }
      activeRequests.delete(chatId)
    } else {
      throw new Error('A message is already being generated for this chat')
    }
  }

  const chat = db.getChat(chatId)
  if (!chat) throw new Error('Chat not found')

  let timeoutSeconds = 300
  let chatSession: ReturnType<typeof db.getSession> | undefined

  if (chat.modelPath) {
    chatSession = sessionManager.getSessionByModelPath(chat.modelPath.replace(/\/+$/, ''))
    if (chatSession) {
      sessionManager.touchSession(chatSession.id)
      try {
        const cfg = JSON.parse(chatSession.config)
        if (cfg.timeout === 0) timeoutSeconds = 86400
        else if (cfg.timeout > 0) timeoutSeconds = cfg.timeout
      } catch { }
    }
  }

  const abortController = new AbortController()
  activeRequests.set(chatId, { controller: abortController, startedAt: Date.now(), timeoutMs: timeoutSeconds * 1000 })
  const fetchTimeout = setTimeout(() => abortController.abort(), timeoutSeconds * 1000)

  try {
    // Resolve endpoint
    const resolved = endpoint
      ? { host: endpoint.host, port: endpoint.port, session: chatSession }
      : await resolveEndpoint(chat.modelPath)
    const resolvedSession = resolved.session
    const isRemote = resolvedSession?.type === 'remote'
    const baseUrl = isRemote && resolvedSession?.remoteUrl
      ? resolvedSession.remoteUrl.replace(/\/+$/, '')
      : `http://${connectHost(resolved.host)}:${resolved.port}`
    const authHeaders = resolvedSession?.id ? getAuthHeaders(resolvedSession.id) : {}

    const entry = activeRequests.get(chatId)
    if (entry) {
      entry.endpoint = { host: resolved.host, port: resolved.port }
      entry.baseUrl = baseUrl
      if (Object.keys(authHeaders).length > 0) entry.authHeaders = authHeaders
    }

    // Health check (skip if recently healthy)
    const recentlyHealthy = resolvedSession?.id
      ? (Date.now() - sessionManager.getLastHealthyAt(resolvedSession.id) < 15_000)
      : false

    if (!recentlyHealthy) {
      const healthUrl = isRemote ? `${baseUrl}/v1/models` : `${baseUrl}/health`
      let ok = false
      const maxRetries = isRemote ? 1 : 15
      for (let i = 0; i < maxRetries; i++) {
        try {
          const r = await fetch(healthUrl, { headers: authHeaders, signal: AbortSignal.timeout(isRemote ? 3000 : 5000) })
          if (r.ok) { ok = true; break }
        } catch { }
        if (i < maxRetries - 1) await new Promise(r => setTimeout(r, isRemote ? 500 : 2000))
      }
      if (!ok && !isRemote) {
        throw new Error(`Server on port ${resolved.port} is not ready. Wait for the green status indicator then try again.`)
      }
    }

    // Save user message
    const hasAttachments = attachments && attachments.length > 0
    const userContent = hasAttachments
      ? JSON.stringify([
        ...(content.trim() ? [{ type: 'text', text: content }] : []),
        ...attachments.map(a => ({ type: 'image_url', image_url: { url: a.dataUrl } })),
      ])
      : content
    const userMessage: Message = { id: randomUUID(), chatId, role: 'user', content: userContent, timestamp: Date.now() }
    db.addMessage(userMessage)

    const assistantMessageId = randomUUID()
    broadcaster.broadcast('chat:typing', { chatId, messageId: assistantMessageId })

    const messages = db.getMessages(chatId)
    const overrides = db.getChatOverrides(chatId)

    // Build request messages
    const requestMessages: any[] = []
    if (overrides?.systemPrompt) requestMessages.push({ role: 'system', content: overrides.systemPrompt })

    for (const m of messages) {
      if (m.role === 'system' && overrides?.systemPrompt) continue
      let msgContent: any = m.content
      if (m.role === 'assistant' && typeof msgContent === 'string') {
        msgContent = msgContent.replace(/\n\n\[Generation interrupted\]$/, '').replace(/^\[Generation interrupted\]$/, '')
        if (!msgContent.trim()) continue
      }
      if (m.role === 'user' && m.content.startsWith('[')) {
        try { const p = JSON.parse(m.content); if (Array.isArray(p) && p[0]?.type) msgContent = p } catch { }
      }
      requestMessages.push({ role: m.role, content: msgContent })
    }

    // Merge consecutive same-role messages
    const merged: typeof requestMessages = []
    for (const msg of requestMessages) {
      const prev = merged[merged.length - 1]
      if (prev && prev.role === msg.role && typeof prev.content === 'string' && typeof msg.content === 'string') {
        prev.content += '\n\n' + msg.content
      } else {
        merged.push({ ...msg })
      }
    }

    const body: Record<string, any> = {
      model: isRemote ? (resolvedSession?.remoteModel || 'default') : 'default',
      messages: merged,
      stream: true,
      stream_options: { include_usage: true },
    }
    if (overrides?.maxTokens) body.max_tokens = overrides.maxTokens
    if (overrides?.temperature != null) body.temperature = overrides.temperature
    if (overrides?.topP != null) body.top_p = overrides.topP
    if (overrides?.topK != null) body.top_k = overrides.topK
    if (overrides?.minP != null) body.min_p = overrides.minP
    if (overrides?.repeatPenalty != null) body.repetition_penalty = overrides.repeatPenalty
    if (overrides?.stopSequences) body.stop = overrides.stopSequences.split(',').map(s => s.trim()).filter(Boolean)

    // Use /v1/responses for local, /v1/chat/completions for remote
    const endpoint_url = isRemote
      ? `${baseUrl}/v1/chat/completions`
      : `${baseUrl}/v1/responses`

    const finalBody = isRemote ? body : { ...body, stream_options: undefined }

    const res = await streamingFetch(endpoint_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(finalBody),
      signal: abortController.signal,
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Server error ${res.status}: ${errText.slice(0, 200)}`)
    }

    // Pre-insert assistant message so periodic saves work
    const assistantMessage: Message = { id: assistantMessageId, chatId, role: 'assistant', content: '', timestamp: Date.now() }
    db.addMessage(assistantMessage)

    // Stream SSE
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let fullContent = ''
    let reasoningContent = ''
    let tokenCount = 0
    let promptTokens = 0
    let firstTokenTime: number | null = null
    const fetchStartTime = Date.now()
    let lastFinishReason: string | undefined

    const periodicSave = setInterval(() => {
      if (fullContent || reasoningContent) {
        db.addMessage({ ...assistantMessage, content: fullContent, reasoningContent: reasoningContent || undefined })
      }
    }, 5000)

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          const data = trimmed.slice(6)
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)

            if (parsed.usage) {
              promptTokens = parsed.usage.prompt_tokens || promptTokens
              if (parsed.usage.completion_tokens != null) tokenCount = parsed.usage.completion_tokens
            }

            const delta = parsed.choices?.[0]?.delta
            const finishReason = parsed.choices?.[0]?.finish_reason
            if (finishReason) lastFinishReason = finishReason

            if (delta?.reasoning_content) {
              reasoningContent += delta.reasoning_content
              broadcaster.broadcast('chat:stream', { chatId, messageId: assistantMessageId, content: fullContent, reasoningContent, delta: '', tokenCount, isReasoning: true })
            }

            if (delta?.content) {
              if (!firstTokenTime) firstTokenTime = Date.now()
              const cleaned = (delta.content as string).replace(TEMPLATE_TOKEN_REGEX, '')
              fullContent += cleaned
              tokenCount++
              broadcaster.broadcast('chat:stream', { chatId, messageId: assistantMessageId, content: fullContent, reasoningContent, delta: cleaned, tokenCount, isReasoning: false })
            }

            // ask_user tool
            if (parsed.type === 'ask_user' || delta?.tool_calls?.[0]?.function?.name === 'ask_user') {
              const question = parsed.question || delta?.tool_calls?.[0]?.function?.arguments
              broadcaster.broadcast('chat:askUser', { chatId, messageId: assistantMessageId, question })
              // Wait for answer
              const answer = await new Promise<string>((resolve) => {
                askUserResolvers.set(chatId, resolve)
              })
              // Include answer in next request (simplified — just append to content)
              fullContent += `\n\n[User answered: ${answer}]`
            }

            if (parsed.type === 'tool_call' || delta?.tool_calls) {
              const toolName = parsed.tool_calls?.[0]?.function?.name || delta?.tool_calls?.[0]?.function?.name || 'tool'
              broadcaster.broadcast('chat:toolStatus', { chatId, messageId: assistantMessageId, phase: 'calling', toolName })
            }
          } catch { }
        }
      }
    } finally {
      clearInterval(periodicSave)
      reader.releaseLock()
    }

    // Compute metrics
    const totalTime = (Date.now() - fetchStartTime) / 1000
    const ttft = firstTokenTime ? (firstTokenTime - fetchStartTime) / 1000 : totalTime
    const genTime = firstTokenTime ? (Date.now() - firstTokenTime) / 1000 : totalTime
    const tps = genTime > 0.01 && tokenCount > 0 ? tokenCount / genTime : 0
    const ppSpeed = ttft > 0.001 && promptTokens > 0 ? promptTokens / ttft : 0

    const metricsJson = JSON.stringify({
      tokenCount, promptTokens, tokensPerSecond: tps.toFixed(1),
      ppSpeed: ppSpeed.toFixed(0), ttft: ttft.toFixed(2), totalTime: totalTime.toFixed(1)
    })

    // Save final message
    db.addMessage({ ...assistantMessage, content: fullContent, reasoningContent: reasoningContent || undefined, metricsJson })
    db.updateChat(chatId, { updatedAt: Date.now() } as any)

    broadcaster.broadcast('chat:complete', {
      chatId, messageId: assistantMessageId, content: fullContent,
      reasoningContent, tokenCount, tokensPerSecond: tps.toFixed(1),
      ttft: ttft.toFixed(2), totalTime: totalTime.toFixed(1), promptTokens, finishReason: lastFinishReason
    })

    if (reasoningContent) {
      broadcaster.broadcast('chat:reasoningDone', { chatId, messageId: assistantMessageId, reasoningContent })
    }

  } catch (err: any) {
    const isAbort = err?.name === 'AbortError'
    if (!isAbort) {
      broadcaster.broadcast('chat:error', { chatId, error: err.message })
    }
    // Save whatever we got
    const partial = `[Generation interrupted]`
    db.addMessage({ id: randomUUID(), chatId, role: 'assistant', content: partial, timestamp: Date.now() })
  } finally {
    clearTimeout(fetchTimeout)
    activeRequests.delete(chatId)
  }
}
