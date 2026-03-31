import { Router } from 'express'
import { sessionManager } from '../sessions.js'

const router = Router()

router.get('/', (_req, res) => {
  res.json(sessionManager.getSessions())
})

router.get('/:id', (req, res) => {
  const session = sessionManager.getSession(req.params.id)
  if (!session) return res.status(404).json({ error: 'Session not found' })
  res.json(session)
})

router.post('/', async (req, res) => {
  try {
    const { modelPath, config = {} } = req.body
    if (!modelPath) return res.status(400).json({ error: 'modelPath required' })
    const session = await sessionManager.createSession(modelPath, config)
    res.json({ success: true, session })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/remote', async (req, res) => {
  try {
    const session = await sessionManager.createRemoteSession(req.body)
    res.json({ success: true, session })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/:id/start', async (req, res) => {
  try {
    await sessionManager.startSession(req.params.id)
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/:id/stop', async (req, res) => {
  try {
    await sessionManager.stopSession(req.params.id)
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    await sessionManager.deleteSession(req.params.id)
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.put('/:id', async (req, res) => {
  try {
    await sessionManager.updateSession(req.params.id, req.body)
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.get('/:id/logs', (req, res) => {
  res.json(sessionManager.getLogs(req.params.id))
})

router.delete('/:id/logs', (req, res) => {
  sessionManager.clearLogs(req.params.id)
  res.json({ success: true })
})

router.post('/:id/soft-sleep', async (req, res) => {
  try { await sessionManager.softSleep(req.params.id); res.json({ success: true }) }
  catch (err: any) { res.status(500).json({ success: false, error: err.message }) }
})

router.post('/:id/deep-sleep', async (req, res) => {
  try { await sessionManager.deepSleep(req.params.id); res.json({ success: true }) }
  catch (err: any) { res.status(500).json({ success: false, error: err.message }) }
})

router.post('/:id/wake', async (req, res) => {
  try { await sessionManager.wake(req.params.id); res.json({ success: true }) }
  catch (err: any) { res.status(500).json({ success: false, error: err.message }) }
})

router.post('/detect', async (_req, res) => {
  try { res.json(await sessionManager.detect()) }
  catch { res.json([]) }
})

export default router
