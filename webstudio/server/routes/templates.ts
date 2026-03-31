import { Router } from 'express'
import { db } from '../database.js'

const router = Router()

router.get('/', (_req, res) => res.json(db.getTemplates()))

router.post('/', (req, res) => {
  const { id, name, content, category } = req.body
  db.saveTemplate({ id, name, content, category })
  res.json({ success: true })
})

router.delete('/:id', (req, res) => {
  db.deleteTemplate(req.params.id)
  res.json({ success: true })
})

export default router
