import { Router } from 'express'
import { db } from '../database.js'

const router = Router()

router.get('/:key', (req, res) => {
  const value = db.getSetting(req.params.key)
  res.json({ key: req.params.key, value })
})

router.put('/:key', (req, res) => {
  const { value } = req.body
  if (value === null || value === undefined) {
    db.deleteSetting(req.params.key)
  } else {
    db.setSetting(req.params.key, String(value))
  }
  res.json({ success: true })
})

router.delete('/:key', (req, res) => {
  db.deleteSetting(req.params.key)
  res.json({ success: true })
})

export default router
