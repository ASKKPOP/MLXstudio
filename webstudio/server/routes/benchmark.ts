import { Router } from 'express'
import { randomUUID } from 'crypto'
import { db } from '../database.js'
import { broadcaster } from '../events.js'
import { connectHost } from '../sessions.js'

const router = Router()

const BENCH_PROMPTS = [
  { label: 'Short generation', messages: [{ role: 'user', content: 'Write a haiku about silicon.' }], maxTokens: 64 },
  { label: 'Medium generation', messages: [{ role: 'user', content: 'Explain how a transformer neural network processes a sentence, step by step.' }], maxTokens: 256 },
  { label: 'Long generation', messages: [{ role: 'user', content: 'Write a detailed technical blog post about the advantages and challenges of running large language models on Apple Silicon. Cover memory bandwidth, unified memory architecture, and the role of quantization.' }], maxTokens: 512 },
  {
    label: 'Long prompt (prefill test)',
    messages: [
      { role: 'system', content: 'You are a helpful assistant that summarizes text concisely.' },
      { role: 'user', content: `Summarize the following in 2 sentences:\n\n${'The development of artificial intelligence has progressed through several distinct phases. In the early days, researchers focused on symbolic AI. The emergence of machine learning shifted the paradigm. Deep learning further revolutionized the field. The transformer architecture in 2017 led to LLMs. '.repeat(5)}` }
    ],
    maxTokens: 128
  },
]

async function runBenchPrompt(baseUrl: string, prompt: typeof BENCH_PROMPTS[0], authHeaders: Record<string, string>): Promise<any> {
  const fetchStart = Date.now()
  let firstTokenTime: number | null = null
  let tokenCount = 0
  let promptTokens = 0

  const r = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ model: 'default', messages: prompt.messages, max_tokens: prompt.maxTokens, temperature: 0.7, stream: true, stream_options: { include_usage: true } }),
    signal: AbortSignal.timeout(120000)
  })
  if (!r.ok) throw new Error(`Request failed: ${r.status}`)

  const reader = r.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data: ')) continue
      const data = trimmed.slice(6)
      if (data === '[DONE]') continue
      try {
        const parsed = JSON.parse(data)
        if (parsed.usage?.completion_tokens != null) tokenCount = parsed.usage.completion_tokens
        if (parsed.usage?.prompt_tokens) promptTokens = parsed.usage.prompt_tokens
        if (parsed.choices?.[0]?.delta?.content) {
          if (!firstTokenTime) firstTokenTime = Date.now()
          tokenCount++
        }
      } catch { }
    }
  }

  const totalTime = (Date.now() - fetchStart) / 1000
  const ttft = firstTokenTime ? (firstTokenTime - fetchStart) / 1000 : totalTime
  const genTime = firstTokenTime ? (Date.now() - firstTokenTime) / 1000 : totalTime
  const tps = genTime > 0.01 ? tokenCount / genTime : 0
  const ppSpeed = ttft > 0.001 && promptTokens > 0 ? promptTokens / ttft : 0
  return { label: prompt.label, ttft, tps, promptTokens, completionTokens: tokenCount, totalTime, ppSpeed }
}

// POST /api/benchmark/run
router.post('/run', async (req, res) => {
  const { sessionId, endpoint, modelPath, modelName, options } = req.body
  if (!endpoint) return res.status(400).json({ error: 'endpoint required' })

  const baseUrl = `http://${connectHost(endpoint.host)}:${endpoint.port}`
  const authHeaders: Record<string, string> = {}

  if (options?.flushCache) {
    try {
      await fetch(`${baseUrl}/v1/cache`, { method: 'DELETE', signal: AbortSignal.timeout(10000) })
    } catch { }
  }

  const results: any[] = []
  for (let i = 0; i < BENCH_PROMPTS.length; i++) {
    broadcaster.broadcast('benchmark:progress', { sessionId, current: i + 1, total: BENCH_PROMPTS.length, label: BENCH_PROMPTS[i].label })
    try {
      results.push(await runBenchPrompt(baseUrl, BENCH_PROMPTS[i], authHeaders))
    } catch {
      results.push({ label: BENCH_PROMPTS[i].label, ttft: 0, tps: 0, promptTokens: 0, completionTokens: 0, totalTime: 0, ppSpeed: 0 })
    }
  }

  const benchmark = { id: randomUUID(), sessionId, modelPath, modelName, resultsJson: JSON.stringify(results), createdAt: Date.now() }
  db.saveBenchmark(benchmark)
  res.json({ id: benchmark.id, results, createdAt: benchmark.createdAt })
})

router.get('/history', (req, res) => {
  const { modelPath } = req.query
  const benchmarks = db.getBenchmarks(modelPath as string | undefined)
  res.json(benchmarks.map(b => ({ ...b, results: JSON.parse(b.resultsJson) })))
})

router.delete('/:id', (req, res) => {
  db.deleteBenchmark(req.params.id)
  res.json({ success: true })
})

export default router
