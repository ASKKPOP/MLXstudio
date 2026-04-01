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
import { readdir, readFile as fsReadFile, writeFile as fsWriteFile, stat } from 'fs/promises'
import { join, resolve, extname } from 'path'
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

// Fire-and-forget engine installation — logs and completion delivered via SSE.
// Avoids Vite dev proxy buffering issues with long-running streaming POST responses.
let installProc: ReturnType<typeof spawn> | null = null
app.post('/api/engine/install', (req, res) => {
  const { method, path: installerPath } = req.body as { method: string; path: string }

  if (installProc) { res.status(409).json({ error: 'Install already in progress' }); return }

  let cmd: string, args: string[]
  if (method === 'uv') {
    cmd = installerPath
    args = ['tool', 'install', 'vmlx']
  } else {
    cmd = installerPath
    args = ['install', 'vmlx']
  }

  const sendLog = (data: string) => broadcaster.broadcast('engine:installLog', { data })

  sendLog(`Installing vmlx using ${method}...\n`)
  installProc = spawn(cmd, args, { env: { ...process.env, PATH: `${homedir()}/.local/bin:${process.env.PATH}` } })

  installProc.stdout?.on('data', (d) => sendLog(d.toString()))
  installProc.stderr?.on('data', (d) => sendLog(d.toString()))
  installProc.on('close', (code) => {
    if (code === 0) {
      sendLog('\nInstallation complete!\n')
      broadcaster.broadcast('engine:installDone', { success: true })
    } else {
      broadcaster.broadcast('engine:installDone', { success: false, error: `Process exited with code ${code}` })
    }
    installProc = null
  })
  installProc.on('error', (err) => {
    broadcaster.broadcast('engine:installDone', { success: false, error: err.message })
    installProc = null
  })

  res.json({ ok: true })
})

app.post('/api/engine/install/cancel', (_req, res) => {
  if (installProc) {
    installProc.kill()
    installProc = null
    broadcaster.broadcast('engine:installDone', { success: false, error: 'Cancelled' })
  }
  res.json({ ok: true })
})

// ── File System ─────────────────────────────────────────────────────────────
// Restrict access to the user's home directory for security.
function isSafePath(p: string): boolean {
  const resolved = resolve(p)
  return resolved.startsWith(homedir()) || resolved === homedir()
}

app.get('/api/fs/tree', async (req, res) => {
  const dirPath = (req.query.path as string) || homedir()
  if (!isSafePath(dirPath)) { res.status(403).json({ error: 'Access denied' }); return }
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    const items = entries
      .filter(e => !e.name.startsWith('.'))
      .map(e => ({
        name: e.name,
        path: join(dirPath, e.name),
        type: (e.isDirectory() ? 'dir' : 'file') as 'dir' | 'file',
        ext: e.isFile() ? extname(e.name) : undefined,
      }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    res.json({ path: dirPath, parent: resolve(dirPath, '..'), items })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/fs/file', async (req, res) => {
  const filePath = req.query.path as string
  if (!filePath || !isSafePath(filePath)) { res.status(403).json({ error: 'Access denied' }); return }
  try {
    const info = await stat(filePath)
    if (info.size > 5 * 1024 * 1024) { res.status(413).json({ error: 'File too large (>5 MB)' }); return }
    const content = await fsReadFile(filePath, 'utf-8')
    res.json({ content })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/fs/file', async (req, res) => {
  const { path: filePath, content } = req.body as { path: string; content: string }
  if (!filePath || !isSafePath(filePath)) { res.status(403).json({ error: 'Access denied' }); return }
  try {
    await fsWriteFile(filePath, content, 'utf-8')
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── Terminal ─────────────────────────────────────────────────────────────────
app.post('/api/terminal/exec', (req, res) => {
  const { cmd, cwd, sessionId = 'default' } = req.body as { cmd: string; cwd?: string; sessionId?: string }
  if (!cmd?.trim()) { res.json({ ok: true }); return }

  const workingDir = (cwd && existsSync(cwd)) ? cwd : homedir()
  const sendOut = (data: string) => broadcaster.broadcast('terminal:output', { data, sessionId })
  const sendDone = (code: number | null) => broadcaster.broadcast('terminal:done', { code, sessionId })

  const proc = spawn('sh', ['-c', cmd], {
    cwd: workingDir,
    env: { ...process.env, PATH: `${homedir()}/.local/bin:${process.env.PATH}`, TERM: 'xterm-color' },
  })

  proc.stdout?.on('data', d => sendOut(d.toString()))
  proc.stderr?.on('data', d => sendOut(d.toString()))
  proc.on('close', code => sendDone(code))
  proc.on('error', err => { sendOut(`Error: ${err.message}\n`); sendDone(null) })

  // Auto-kill after 30 seconds
  const timeout = setTimeout(() => {
    proc.kill()
    sendOut('\n[Timed out after 30 s]\n')
    sendDone(null)
  }, 30000)
  proc.on('close', () => clearTimeout(timeout))

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
