/**
 * Model management routes — filesystem scanning + HuggingFace search.
 * No Electron dependencies.
 */
import { Router } from 'express'
import { readdir, stat, access, readFile } from 'fs/promises'
import { existsSync, readFileSync } from 'fs'
import { join, basename } from 'path'
import { homedir } from 'os'
import { db } from '../database.js'

const router = Router()

const BUILTIN_MODEL_PATHS = [
  join(homedir(), '.mlxstudio/models'),
  join(homedir(), '.cache/huggingface/hub'),
  join(homedir(), '.exo/models'),
]

const SETTINGS_KEY = 'model_scan_directories'

async function detectModelFormat(modelPath: string): Promise<'mlx' | 'diffusers' | 'gguf' | 'unknown'> {
  try {
    const files = await readdir(modelPath)
    if (files.includes('model_index.json')) return 'diffusers'
    if (files.includes('transformer') && files.includes('text_encoder')) return 'diffusers'
    if (files.includes('transformer') && files.includes('vae')) return 'diffusers'
    const hasGGUF = files.some(f => f.endsWith('.gguf'))
    const hasSafetensors = files.some(f => f.endsWith('.safetensors'))
    const hasConfig = files.includes('config.json')
    if (hasSafetensors && hasConfig) {
      try {
        const cfg = JSON.parse(readFileSync(join(modelPath, 'config.json'), 'utf-8'))
        if (cfg.model_type || cfg.architectures || cfg.quantization) return 'mlx'
        if (files.some(f => f === 'jang_config.json' || f === 'mxq_config.json')) return 'mlx'
        return 'unknown'
      } catch { return 'unknown' }
    }
    if (hasSafetensors && files.some(f => f === 'jang_config.json' || f === 'mxq_config.json')) return 'mlx'
    if (hasGGUF) return 'gguf'
    return 'unknown'
  } catch { return 'unknown' }
}

async function scanDirectory(dirPath: string, modelType?: string): Promise<any[]> {
  const models: any[] = []
  try {
    await access(dirPath)
    const entries = await readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const fullPath = join(dirPath, entry.name)
      try {
        const fmt = await detectModelFormat(fullPath)
        if (fmt === 'unknown') {
          // Check subdirs (e.g. org/model structure in HF cache)
          const sub = await readdir(fullPath, { withFileTypes: true })
          for (const subEntry of sub) {
            if (!subEntry.isDirectory()) continue
            const subPath = join(fullPath, subEntry.name)
            const subFmt = await detectModelFormat(subPath)
            if (subFmt !== 'unknown') {
              models.push({
                id: subPath, name: `${entry.name}/${subEntry.name}`, path: subPath,
                format: subFmt === 'diffusers' ? 'diffusers' : 'mlx'
              })
            }
          }
          continue
        }
        if (modelType === 'image' && fmt !== 'diffusers') continue
        if (modelType === 'text' && fmt === 'diffusers') continue
        models.push({ id: fullPath, name: entry.name, path: fullPath, format: fmt === 'diffusers' ? 'diffusers' : 'mlx' })
      } catch { }
    }
  } catch { }
  return models
}

// GET /api/models - scan all configured directories
router.get('/', async (req, res) => {
  const { modelType } = req.query
  const extra = (() => {
    try { return JSON.parse(db.getSetting(SETTINGS_KEY) || '[]') } catch { return [] }
  })()
  const dirs = [...BUILTIN_MODEL_PATHS, ...extra]
  const results: any[] = []
  for (const dir of dirs) {
    const found = await scanDirectory(dir, modelType as string | undefined)
    results.push(...found)
  }
  // Deduplicate by path
  const seen = new Set<string>()
  res.json(results.filter(m => { if (seen.has(m.path)) return false; seen.add(m.path); return true }))
})

// GET /api/models/directories
router.get('/directories', (req, res) => {
  const { modelType } = req.query
  const extra = (() => {
    try { return JSON.parse(db.getSetting(SETTINGS_KEY) || '[]') } catch { return [] }
  })()
  res.json([...BUILTIN_MODEL_PATHS, ...extra])
})

// POST /api/models/directories - add
router.post('/directories', (req, res) => {
  const { dirPath } = req.body
  if (!dirPath) return res.status(400).json({ error: 'dirPath required' })
  const dirs: string[] = (() => {
    try { return JSON.parse(db.getSetting(SETTINGS_KEY) || '[]') } catch { return [] }
  })()
  if (!dirs.includes(dirPath)) {
    dirs.push(dirPath)
    db.setSetting(SETTINGS_KEY, JSON.stringify(dirs))
  }
  res.json({ success: true })
})

// DELETE /api/models/directories - remove
router.delete('/directories', (req, res) => {
  const { dirPath } = req.body
  const dirs: string[] = (() => {
    try { return JSON.parse(db.getSetting(SETTINGS_KEY) || '[]') } catch { return [] }
  })()
  db.setSetting(SETTINGS_KEY, JSON.stringify(dirs.filter(d => d !== dirPath)))
  res.json({ success: true })
})

// GET /api/models/detect-config
router.get('/detect-config', async (req, res) => {
  const { modelPath } = req.query
  if (!modelPath || !existsSync(modelPath as string)) return res.json({})
  try {
    const cfg = JSON.parse(readFileSync(join(modelPath as string, 'config.json'), 'utf-8'))
    res.json(cfg)
  } catch { res.json({}) }
})

// GET /api/models/generation-defaults
router.get('/generation-defaults', async (req, res) => {
  const { modelPath } = req.query
  if (!modelPath) return res.json(null)
  try {
    const raw = await readFile(join(modelPath as string, 'generation_config.json'), 'utf-8')
    const cfg = JSON.parse(raw)
    const defaults: any = {}
    if (typeof cfg.temperature === 'number') defaults.temperature = cfg.temperature
    if (typeof cfg.top_p === 'number') defaults.topP = cfg.top_p
    if (typeof cfg.top_k === 'number') defaults.topK = cfg.top_k
    if (typeof cfg.min_p === 'number') defaults.minP = cfg.min_p
    if (typeof cfg.repetition_penalty === 'number') defaults.repeatPenalty = cfg.repetition_penalty
    res.json(Object.keys(defaults).length ? defaults : null)
  } catch { res.json(null) }
})

// GET /api/models/search-hf - HuggingFace search proxy
router.get('/search-hf', async (req, res) => {
  const { query, sortBy = 'downloads', sortDir = 'desc', modelType } = req.query
  if (!query) return res.json([])
  try {
    const hfToken = db.getSetting('hf_api_key')
    const headers: Record<string, string> = {}
    if (hfToken) headers['Authorization'] = `Bearer ${hfToken}`
    let url = `https://huggingface.co/api/models?search=${encodeURIComponent(query as string)}&sort=${sortBy}&direction=${sortDir === 'asc' ? 1 : -1}&limit=20&full=true`
    if (modelType === 'image') url += '&pipeline_tag=text-to-image'
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(10000) })
    if (!r.ok) return res.json([])
    res.json(await r.json())
  } catch { res.json([]) }
})

// GET /api/models/fetch-readme
router.get('/fetch-readme', async (req, res) => {
  const { repoId } = req.query
  if (!repoId) return res.json({ readme: '' })
  try {
    const r = await fetch(`https://huggingface.co/${repoId}/raw/main/README.md`, { signal: AbortSignal.timeout(10000) })
    if (!r.ok) return res.json({ readme: '' })
    res.json({ readme: await r.text() })
  } catch { res.json({ readme: '' }) }
})

export default router
