/**
 * Proxy routes — thin HTTP proxies to the Python engine.
 * Replaces cache, audio, embeddings, performance IPC handlers.
 */
import { Router } from 'express'
import { db } from '../database.js'
import { connectHost } from '../sessions.js'

const router = Router()

function resolveBaseUrl(endpoint?: { host: string; port: number }): string {
  if (endpoint) return `http://${connectHost(endpoint.host)}:${endpoint.port}`
  // Try to find a running session
  const sessions = db.getSessions()
  const running = sessions.find(s => s.status === 'running' && s.type === 'local')
  if (running) return `http://127.0.0.1:${running.port}`
  return 'http://127.0.0.1:8000'
}

function getAuthHeaders(sessionId?: string): Record<string, string> {
  if (!sessionId) return {}
  try {
    const session = db.getSession(sessionId)
    if (!session) return {}
    const config = JSON.parse(session.config)
    if (session.type === 'remote' && session.remoteApiKey) {
      return { 'Authorization': `Bearer ${session.remoteApiKey}` }
    } else if (config.apiKey) {
      return { 'Authorization': `Bearer ${config.apiKey}` }
    }
  } catch { }
  return {}
}

// ── Cache ──────────────────────────────────────────────────────────────────

router.get('/cache/stats', async (req, res) => {
  const { host, port, sessionId } = req.query
  const baseUrl = resolveBaseUrl(host && port ? { host: host as string, port: Number(port) } : undefined)
  const auth = getAuthHeaders(sessionId as string)
  try {
    const r = await fetch(`${baseUrl}/v1/cache/stats`, { headers: auth, signal: AbortSignal.timeout(30000) })
    res.status(r.status).json(await r.json())
  } catch (err: any) { res.status(500).json({ error: err.message }) }
})

router.get('/cache/entries', async (req, res) => {
  const { host, port, sessionId } = req.query
  const baseUrl = resolveBaseUrl(host && port ? { host: host as string, port: Number(port) } : undefined)
  const auth = getAuthHeaders(sessionId as string)
  try {
    const r = await fetch(`${baseUrl}/v1/cache/entries`, { headers: auth, signal: AbortSignal.timeout(30000) })
    res.status(r.status).json(await r.json())
  } catch (err: any) { res.status(500).json({ error: err.message }) }
})

router.post('/cache/warm', async (req, res) => {
  const { prompts, host, port, sessionId } = req.body
  const baseUrl = resolveBaseUrl(host && port ? { host, port } : undefined)
  const auth = getAuthHeaders(sessionId)
  try {
    const r = await fetch(`${baseUrl}/v1/cache/warm`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ prompts }), signal: AbortSignal.timeout(60000)
    })
    res.status(r.status).json(await r.json())
  } catch (err: any) { res.status(500).json({ error: err.message }) }
})

router.delete('/cache', async (req, res) => {
  const { cacheType, host, port, sessionId } = req.body
  const baseUrl = resolveBaseUrl(host && port ? { host, port } : undefined)
  const auth = getAuthHeaders(sessionId)
  try {
    const r = await fetch(`${baseUrl}/v1/cache?type=${encodeURIComponent(cacheType || 'all')}`, {
      method: 'DELETE', headers: auth, signal: AbortSignal.timeout(10000)
    })
    res.status(r.status).json(await r.json())
  } catch (err: any) { res.status(500).json({ error: err.message }) }
})

// ── Audio ──────────────────────────────────────────────────────────────────

router.post('/audio/transcribe', async (req, res) => {
  const { audioBase64, model, language, host, port, sessionId } = req.body
  const baseUrl = resolveBaseUrl(host && port ? { host, port } : undefined)
  const auth = getAuthHeaders(sessionId)

  const boundary = `----AudioBoundary${Date.now()}`
  const audioBuffer = Buffer.from(audioBase64, 'base64')
  const textPart = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.webm"\r\nContent-Type: audio/webm\r\n\r\n`
  )
  const modelPart = Buffer.from(
    `\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${model || 'whisper-large-v3'}\r\n`
  )
  const langPart = language
    ? Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${language}\r\n`)
    : Buffer.alloc(0)
  const closing = Buffer.from(`--${boundary}--\r\n`)
  const bodyBuffer = Buffer.concat([textPart, audioBuffer, modelPart, langPart, closing])

  try {
    const r = await fetch(`${baseUrl}/v1/audio/transcriptions`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, ...auth },
      body: bodyBuffer,
      signal: AbortSignal.timeout(60000)
    })
    res.status(r.status).json(await r.json())
  } catch (err: any) { res.status(500).json({ error: err.message }) }
})

router.post('/audio/speak', async (req, res) => {
  const { text, model, voice, speed, host, port, sessionId } = req.body
  const baseUrl = resolveBaseUrl(host && port ? { host, port } : undefined)
  const auth = getAuthHeaders(sessionId)
  const params = new URLSearchParams({
    model: model || 'kokoro', input: text, voice: voice || 'af_heart',
    speed: String(speed || 1.0), response_format: 'wav'
  })
  try {
    const r = await fetch(`${baseUrl}/v1/audio/speech`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...auth },
      body: params.toString(), signal: AbortSignal.timeout(120000)
    })
    if (!r.ok) return res.status(r.status).json({ error: await r.text() })
    const buf = Buffer.from(await r.arrayBuffer())
    res.json({ audioBase64: buf.toString('base64') })
  } catch (err: any) { res.status(500).json({ error: err.message }) }
})

router.get('/audio/voices', async (req, res) => {
  const { model, host, port, sessionId } = req.query
  const baseUrl = resolveBaseUrl(host && port ? { host: host as string, port: Number(port) } : undefined)
  const auth = getAuthHeaders(sessionId as string)
  try {
    const r = await fetch(`${baseUrl}/v1/audio/voices?model=${encodeURIComponent((model as string) || 'kokoro')}`, {
      headers: auth, signal: AbortSignal.timeout(10000)
    })
    res.status(r.status).json(await r.json())
  } catch (err: any) { res.status(500).json({ error: err.message }) }
})

// ── Embeddings ─────────────────────────────────────────────────────────────

router.post('/embeddings', async (req, res) => {
  const { texts, model, host, port, sessionId } = req.body
  const baseUrl = resolveBaseUrl(host && port ? { host, port } : undefined)
  const auth = getAuthHeaders(sessionId)
  const input = Array.isArray(texts) && texts.length === 1 ? texts[0] : texts
  try {
    const r = await fetch(`${baseUrl}/v1/embeddings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ model: model || 'default', input }), signal: AbortSignal.timeout(60000)
    })
    res.status(r.status).json(await r.json())
  } catch (err: any) { res.status(500).json({ error: err.message }) }
})

// ── Performance / Health ───────────────────────────────────────────────────

router.get('/health', async (req, res) => {
  const { host, port } = req.query
  const baseUrl = resolveBaseUrl(host && port ? { host: host as string, port: Number(port) } : undefined)
  try {
    const r = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(30000) })
    res.status(r.status).json(await r.json())
  } catch (err: any) { res.status(500).json({ error: err.message }) }
})

export default router
