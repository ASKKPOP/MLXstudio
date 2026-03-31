import { Router } from 'express'
import { randomUUID } from 'crypto'
import { db, type Chat, type Message, type Folder } from '../database.js'
import { sendMessage, abortChat, isChatStreaming, answerUser } from '../chat-stream.js'

const router = Router()

// ── Folders ────────────────────────────────────────────────────────────────

router.get('/folders', (_req, res) => res.json(db.getFolders()))

router.post('/folders', (req, res) => {
  const { name, parentId } = req.body
  const folder: Folder = { id: randomUUID(), name, parentId, createdAt: Date.now() }
  db.createFolder(folder)
  res.json(folder)
})

router.delete('/folders/:id', (req, res) => {
  db.deleteFolder(req.params.id)
  res.json({ success: true })
})

// ── Chats ──────────────────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  const { title, modelId, folderId, modelPath } = req.body
  const chat: Chat = { id: randomUUID(), title, modelId, folderId, modelPath, createdAt: Date.now(), updatedAt: Date.now() }
  db.createChat(chat)
  res.json(chat)
})

router.get('/recent', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 100
  res.json(db.getRecentChats(limit))
})

router.get('/by-model', (req, res) => {
  const { modelPath } = req.query
  if (!modelPath) return res.json([])
  res.json(db.getChatsByModelPath(modelPath as string))
})

router.get('/search', (req, res) => {
  const { q } = req.query
  if (!q) return res.json([])
  res.json(db.searchChats(q as string))
})

router.get('/', (req, res) => {
  const { folderId } = req.query
  res.json(db.getChats(folderId as string | undefined))
})

router.get('/:id', (req, res) => {
  const chat = db.getChat(req.params.id)
  if (!chat) return res.status(404).json({ error: 'Not found' })
  res.json(chat)
})

router.put('/:id', (req, res) => {
  db.updateChat(req.params.id, req.body)
  res.json({ success: true })
})

router.delete('/:id', (req, res) => {
  db.deleteChat(req.params.id)
  res.json({ success: true })
})

// ── Messages ───────────────────────────────────────────────────────────────

router.get('/:id/messages', (req, res) => {
  res.json(db.getMessages(req.params.id))
})

router.post('/:id/messages', (req, res) => {
  const { role, content } = req.body
  const chat = db.getChat(req.params.id)
  if (!chat) return res.status(404).json({ error: 'Chat not found' })
  const msg: Message = { id: randomUUID(), chatId: req.params.id, role, content, timestamp: Date.now() }
  db.addMessage(msg)
  res.json(msg)
})

// ── Send (streaming) ────────────────────────────────────────────────────────

router.post('/:id/send', async (req, res) => {
  try {
    const { content, endpoint, attachments } = req.body
    // Fire-and-forget: SSE events carry the stream to browser
    sendMessage({ chatId: req.params.id, content, endpoint, attachments }).catch(err => {
      console.error('[CHAT] sendMessage error:', err.message)
    })
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/:id/abort', (req, res) => {
  abortChat(req.params.id)
  res.json({ success: true })
})

router.get('/:id/streaming', (req, res) => {
  res.json({ streaming: isChatStreaming(req.params.id) })
})

router.post('/:id/answer-user', (req, res) => {
  answerUser(req.params.id, req.body.answer)
  res.json({ success: true })
})

// ── Overrides ──────────────────────────────────────────────────────────────

router.get('/:id/overrides', (req, res) => {
  res.json(db.getChatOverrides(req.params.id))
})

router.put('/:id/overrides', (req, res) => {
  db.setChatOverrides({ chatId: req.params.id, ...req.body })
  res.json({ success: true })
})

router.delete('/:id/overrides', (req, res) => {
  db.clearChatOverrides(req.params.id)
  res.json({ success: true })
})

// ── Profiles ───────────────────────────────────────────────────────────────

router.get('/profiles/list', (_req, res) => res.json(db.getChatProfiles()))
router.get('/profiles/default', (_req, res) => res.json(db.getDefaultChatProfile()))

router.post('/profiles', (req, res) => {
  const { name, overrides, isDefault } = req.body
  const profile = db.saveChatProfile(name, JSON.stringify(overrides), isDefault)
  res.json(profile)
})

router.put('/profiles/:id', (req, res) => {
  const { name, overrides, isDefault } = req.body
  db.updateChatProfile(req.params.id, name, JSON.stringify(overrides), isDefault)
  res.json({ success: true })
})

router.delete('/profiles/:id', (req, res) => {
  db.deleteChatProfile(req.params.id)
  res.json({ success: true })
})

export default router
