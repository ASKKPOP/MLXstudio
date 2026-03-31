/**
 * MLX Studio Web — Management Server
 * Express HTTP server that provides all the API endpoints the React frontend
 * needs. Replaces Electron's IPC layer with REST + SSE.
 *
 * Start with: tsx server/index.ts
 * Default port: 3000
 */
import express from 'express'
import cors from 'cors'
import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { join } from 'path'
import { execSync, spawn } from 'child_process'
import { homedir } from 'os'
import { broadcaster } from './events.js'

// Route handlers
import sessionsRouter from './routes/sessions.js'
import chatRouter from './routes/chat.js'
import modelsRouter from './routes/models.js'
import settingsRouter from './routes/settings.js'
import proxyRouter from './routes/proxy.js'
import benchmarkRouter from './routes/benchmark.js'
import templatesRouter from './routes/templates.js'
import imageRouter from './routes/image.js'
import { sessionManager } from './sessions.js'

const app = express()
const PORT = parseInt(process.env.MLXSTUDIO_PORT || '3000')

app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '100mb' }))
app.use(express.urlencoded({ extended: true, limit: '100mb' }))

// ── SSE event stream ────────────────────────────────────────────────────────
// All push events (session lifecycle, chat tokens, download progress) flow here.
// Browser subscribes once and receives all real-time updates.
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // Disable nginx buffering
  res.flushHeaders()

  const clientId = randomUUID()
  broadcaster.addClient(clientId, res)

  // Heartbeat every 30s to keep connection alive through proxies
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n') } catch { clearInterval(heartbeat) }
  }, 30000)

  req.on('close', () => {
    clearInterval(heartbeat)
    broadcaster.removeClient(clientId)
  })
})

// ── API Routes ──────────────────────────────────────────────────────────────
app.use('/api/sessions', sessionsRouter)
app.use('/api/chat', chatRouter)
app.use('/api/models', modelsRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/proxy', proxyRouter)
app.use('/api/benchmark', benchmarkRouter)
app.use('/api/templates', templatesRouter)
app.use('/api/image', imageRouter)

// ── App info ────────────────────────────────────────────────────────────────
app.get('/api/app/version', (_req, res) => {
  res.json({ version: '1.3.14', mode: 'web' })
})

// Engine status
app.get('/api/engine/status', (_req, res) => {
  res.json(sessionManager.checkInstallation())
})

// Detect available package managers for engine installation
app.get('/api/engine/installers', (_req, res) => {
  const installers: { method: string; path: string; label: string }[] = []

  // Check for uv
  const uvPaths = [
    join(homedir(), '.local', 'bin', 'uv'),
    '/opt/homebrew/bin/uv',
    '/usr/local/bin/uv',
  ]
  let uvPath: string | null = null
  for (const p of uvPaths) {
    if (existsSync(p)) { uvPath = p; break }
  }
  if (!uvPath) {
    try { uvPath = execSync('which uv', { encoding: 'utf-8', timeout: 3000 }).trim() } catch { }
  }
  if (uvPath) installers.push({ method: 'uv', path: uvPath, label: 'Install with uv (recommended)' })

  // Check for pip with Python 3.10+
  for (const pip of ['pip3', 'pip']) {
    try {
      const ver = execSync(`${pip} --version`, { encoding: 'utf-8', timeout: 3000 })
      const match = ver.match(/python (\d+)\.(\d+)/)
      if (match && (parseInt(match[1]) > 3 || (parseInt(match[1]) === 3 && parseInt(match[2]) >= 10))) {
        installers.push({ method: 'pip', path: pip, label: `Install with ${pip}` })
        break
      }
    } catch { }
  }

  res.json(installers)
})

// Stream engine installation via SSE
let installProc: ReturnType<typeof spawn> | null = null
app.post('/api/engine/install', (req, res) => {
  const { method, path: installerPath } = req.body as { method: string; path: string }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (data: string) => {
    try { res.write(`data: ${JSON.stringify({ data })}\n\n`) } catch { }
    broadcaster.broadcast('engine:installLog', { data })
  }

  let cmd: string, args: string[]
  if (method === 'uv') {
    cmd = installerPath
    args = ['pip', 'install', 'vmlx']
  } else {
    cmd = installerPath
    args = ['install', 'vmlx']
  }

  send(`Installing vmlx engine using ${method}...\n`)
  installProc = spawn(cmd, args, { env: { ...process.env, PATH: `${homedir()}/.local/bin:${process.env.PATH}` } })

  installProc.stdout?.on('data', (d) => send(d.toString()))
  installProc.stderr?.on('data', (d) => send(d.toString()))
  installProc.on('close', (code) => {
    if (code === 0) {
      send('\nInstallation complete!\n')
      res.write(`data: ${JSON.stringify({ done: true, success: true })}\n\n`)
    } else {
      res.write(`data: ${JSON.stringify({ done: true, success: false, error: `Process exited with code ${code}` })}\n\n`)
    }
    installProc = null
    res.end()
  })
  installProc.on('error', (err) => {
    res.write(`data: ${JSON.stringify({ done: true, success: false, error: err.message })}\n\n`)
    installProc = null
    res.end()
  })
  req.on('close', () => { installProc?.kill() })
})

app.post('/api/engine/install/cancel', (_req, res) => {
  installProc?.kill()
  installProc = null
  res.json({ ok: true })
})

// ── Serve built frontend in production ──────────────────────────────────────
const distPath = join(import.meta.dirname || process.cwd(), '..', 'dist')
if (existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get('*', (_req, res) => {
    res.sendFile(join(distPath, 'index.html'))
  })
}

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`MLX Studio Web Server running on http://localhost:${PORT}`)
  console.log(`SSE endpoint: http://localhost:${PORT}/api/events`)
  console.log(`Open http://localhost:${PORT} in your browser`)
})

export default app
