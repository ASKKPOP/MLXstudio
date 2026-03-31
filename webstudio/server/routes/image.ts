/**
 * Image generation routes — mirrors panel/src/main/ipc/image.ts.
 * File I/O uses ~/.mlxstudio/generated/ (same as Electron version).
 */
import { Router } from 'express'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { homedir } from 'os'
import { mkdirSync, writeFileSync, existsSync, readFileSync, unlinkSync, readdirSync, rmdirSync } from 'fs'
import { db, type ImageSession, type ImageGeneration } from '../database.js'

const router = Router()

let activeImageSessionId: string | null = null
let isGenerating = false
let generationStartTime: number | null = null
let generationController: AbortController | null = null

// ── Image Sessions ──────────────────────────────────────────────────────────

router.post('/sessions', (req, res) => {
  const { modelName, sessionType } = req.body
  const now = Date.now()
  const session: ImageSession = { id: randomUUID(), modelName, sessionType: sessionType || 'generate', createdAt: now, updatedAt: now }
  db.createImageSession(session)
  res.json({ success: true, session })
})

router.get('/sessions', (_req, res) => res.json(db.getImageSessions()))

router.get('/sessions/:id', (req, res) => {
  const s = db.getImageSession(req.params.id)
  if (!s) return res.status(404).json({ error: 'Not found' })
  res.json(s)
})

router.delete('/sessions/:id', (req, res) => {
  const outputDir = join(homedir(), '.mlxstudio', 'generated', req.params.id)
  if (existsSync(outputDir)) {
    try {
      for (const f of readdirSync(outputDir)) unlinkSync(join(outputDir, f))
      rmdirSync(outputDir)
    } catch { }
  }
  db.deleteImageSession(req.params.id)
  res.json({ success: true })
})

router.get('/sessions/:id/generations', (req, res) => res.json(db.getImageGenerations(req.params.id)))

// ── Start/Stop image server ─────────────────────────────────────────────────

router.post('/server/start', async (req, res) => {
  const { modelName, quantize, imageMode, serverSettings } = req.body
  // Image server is managed by the session manager — just create a session for the image model
  try {
    const session = await import('../sessions.js').then(m =>
      m.sessionManager.createSession(modelName, {
        modelType: 'image',
        imageMode: imageMode || 'generate',
        quantize: quantize || 4,
        ...serverSettings
      })
    )
    activeImageSessionId = session.id
    await import('../sessions.js').then(m => m.sessionManager.startSession(session.id))
    res.json({ success: true, sessionId: session.id })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/server/stop', async (_req, res) => {
  if (activeImageSessionId) {
    await import('../sessions.js').then(m => m.sessionManager.stopSession(activeImageSessionId!)).catch(() => { })
    activeImageSessionId = null
  }
  res.json({ success: true })
})

router.get('/server/running', (_req, res) => {
  if (!activeImageSessionId) return res.json(null)
  const session = db.getSession(activeImageSessionId)
  res.json(session ?? null)
})

// ── Generate ────────────────────────────────────────────────────────────────

router.post('/generate', async (req, res) => {
  if (isGenerating) return res.status(409).json({ error: 'Generation already in progress' })
  const { sessionId, prompt, negativePrompt, model, width, height, steps, guidance, seed, count, serverPort } = req.body
  const baseUrl = `http://127.0.0.1:${serverPort}`
  const outputDir = join(homedir(), '.mlxstudio', 'generated', sessionId)
  mkdirSync(outputDir, { recursive: true })

  isGenerating = true
  generationStartTime = Date.now()
  generationController = new AbortController()

  try {
    const body: any = {
      prompt, model, size: `${width}x${height}`,
      n: count || 1,
      num_inference_steps: steps,
      guidance_scale: guidance,
    }
    if (negativePrompt) body.negative_prompt = negativePrompt
    if (seed != null) body.seed = seed

    const r = await fetch(`${baseUrl}/v1/images/generations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: generationController.signal
    })
    if (!r.ok) {
      const errText = await r.text()
      return res.status(r.status).json({ error: errText })
    }

    const data = await r.json() as any
    const images: ImageGeneration[] = []
    for (const item of data.data || []) {
      const base64 = item.b64_json || item.url?.split(',')[1]
      if (!base64) continue
      const filename = `${randomUUID()}.png`
      const imagePath = join(outputDir, filename)
      writeFileSync(imagePath, Buffer.from(base64, 'base64'))
      const gen: ImageGeneration = {
        id: randomUUID(), sessionId, prompt, negativePrompt, modelName: model,
        width, height, steps, guidance, seed,
        elapsedSeconds: (Date.now() - generationStartTime!) / 1000,
        imagePath, createdAt: Date.now()
      }
      db.saveImageGeneration(gen)
      images.push(gen)
    }
    res.json({ success: true, images })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  } finally {
    isGenerating = false
    generationStartTime = null
    generationController = null
  }
})

router.post('/cancel', (_req, res) => {
  if (generationController) generationController.abort()
  isGenerating = false
  res.json({ success: true })
})

router.get('/generating', (_req, res) => res.json({ generating: isGenerating, startTime: generationStartTime }))

// ── File I/O ────────────────────────────────────────────────────────────────

router.get('/file', (req, res) => {
  const { path } = req.query
  if (!path || !existsSync(path as string)) return res.status(404).json({ error: 'Not found' })
  // Security: only serve files inside ~/.mlxstudio/generated/
  const resolved = path as string
  if (!resolved.includes('/.mlxstudio/generated/')) return res.status(403).json({ error: 'Forbidden' })
  const buf = readFileSync(resolved)
  res.json({ base64: buf.toString('base64') })
})

// Serve generated images directly
router.get('/image-file/*', (req, res) => {
  const relPath = req.params[0]
  const imagePath = join(homedir(), '.mlxstudio', 'generated', relPath)
  if (!existsSync(imagePath)) return res.status(404).send('Not found')
  res.sendFile(imagePath)
})

export default router
