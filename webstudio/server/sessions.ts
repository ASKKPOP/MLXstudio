/**
 * MLX Studio Web — Session Manager (no Electron dependency).
 * Mirrors panel/src/main/sessions.ts but emits events via SSE broadcaster
 * instead of IPC, and persists state to the web DB.
 */
import { spawn, type ChildProcess, execSync } from 'child_process'
import { EventEmitter } from 'events'
import { existsSync, readdirSync, statSync } from 'fs'
import { createServer } from 'net'
import { homedir, freemem, totalmem } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { db, type Session } from './database.js'
import { broadcaster } from './events.js'

function normalizePath(p: string): string {
  return p.replace(/\/+$/, '')
}

export function connectHost(host: string): string {
  return host === '0.0.0.0' ? '127.0.0.1' : host
}

export async function resolveUrl(url: string): Promise<string> {
  return url // Simple passthrough — no mDNS complexity needed for web server
}

function estimateModelMemory(modelPath: string): number {
  try {
    const files = readdirSync(modelPath)
    let totalBytes = 0
    for (const file of files) {
      if (file.endsWith('.safetensors')) {
        totalBytes += statSync(join(modelPath, file)).size
      }
    }
    return Math.round(totalBytes * 1.3)
  } catch {
    return 0
  }
}

interface ManagedProcess {
  process: ChildProcess | null
  adoptedPid: number | null
  lastStderr?: string
  exitCode?: number | null
  exitSignal?: string | null
  intentionalStop?: boolean
}

type EnginePath =
  | { type: 'bundled'; pythonPath: string }
  | { type: 'system'; binaryPath: string }

const SEARCH_PATHS = [
  join(homedir(), '.local', 'bin', 'vmlx-engine'),
  '/opt/homebrew/bin/vmlx-engine',
  '/usr/local/bin/vmlx-engine',
  '/usr/bin/vmlx-engine',
  join(homedir(), 'miniforge3', 'bin', 'vmlx-engine'),
  join(homedir(), 'anaconda3', 'bin', 'vmlx-engine'),
  join(homedir(), 'miniconda3', 'bin', 'vmlx-engine'),
]

const LOAD_PROGRESS_PATTERNS: Array<{ pattern: RegExp; label: string; progress: number }> = [
  { pattern: /Loading model:/, label: 'Initializing...', progress: 5 },
  { pattern: /System memory before load/, label: 'Checking memory...', progress: 5 },
  { pattern: /Loading model with (?:Simple|Batched)Engine/, label: 'Creating engine...', progress: 8 },
  { pattern: /Uvicorn running on/, label: 'Server started, loading model...', progress: 20 },
  { pattern: /Loading \d+ safetensors shards/, label: 'Loading weights...', progress: 40 },
  { pattern: /Model loaded successfully/, label: 'Model loaded', progress: 65 },
  { pattern: /BatchedEngine loaded/, label: 'Engine ready', progress: 88 },
  { pattern: /Application startup complete/, label: 'Almost ready...', progress: 92 },
]

class WebSessionManager extends EventEmitter {
  private processes = new Map<string, ManagedProcess>()
  private failCounts = new Map<string, number>()
  private operationLocks = new Map<string, Promise<void>>()
  private creationLock: Promise<void> = Promise.resolve()
  private lastHealthyAt = new Map<string, number>()
  private logBuffers = new Map<string, string[]>()
  private loadProgressState = new Map<string, number>()
  private lastRequestAt = new Map<string, number>()
  private monitorInterval: ReturnType<typeof setInterval> | null = null
  private static readonly LOG_BUFFER_MAX = 2000
  private static readonly MAX_FAIL_COUNT = 60

  constructor() {
    super()
    this.startMonitor()
    // Broadcast all session events through SSE
    this.on('session:created', (d) => broadcaster.broadcast('session:created', d))
    this.on('session:deleted', (d) => broadcaster.broadcast('session:deleted', d))
    this.on('session:starting', (d) => broadcaster.broadcast('session:starting', d))
    this.on('session:ready', (d) => broadcaster.broadcast('session:ready', d))
    this.on('session:stopped', (d) => broadcaster.broadcast('session:stopped', d))
    this.on('session:error', (d) => broadcaster.broadcast('session:error', d))
    this.on('session:health', (d) => broadcaster.broadcast('session:health', d))
    this.on('session:log', (d) => broadcaster.broadcast('session:log', d))
    this.on('session:standby', (d) => broadcaster.broadcast('session:standby', d))
    this.on('session:loadProgress', (d) => broadcaster.broadcast('session:loadProgress', d))
  }

  // ── Engine discovery ───────────────────────────────────────────────────

  findEnginePath(): EnginePath | null {
    for (const p of SEARCH_PATHS) {
      if (existsSync(p)) return { type: 'system', binaryPath: p }
    }
    // Try PATH
    try {
      const which = execSync('which vmlx-engine', { encoding: 'utf-8', timeout: 3000 }).trim()
      if (which) return { type: 'system', binaryPath: which }
    } catch { }
    // Try python3 -m vmlx_engine.cli
    try {
      execSync('python3 -c "import vmlx_engine"', { encoding: 'utf-8', timeout: 5000 })
      return { type: 'bundled', pythonPath: 'python3' }
    } catch { }
    return null
  }

  checkInstallation(): { installed: boolean; path?: string; version?: string } {
    const engine = this.findEnginePath()
    if (!engine) return { installed: false }
    try {
      if (engine.type === 'system') {
        const v = execSync(`"${engine.binaryPath}" --version`, { encoding: 'utf-8', timeout: 5000 }).trim()
        return { installed: true, path: engine.binaryPath, version: v }
      } else {
        const v = execSync(`${engine.pythonPath} -c "import vmlx_engine; print(vmlx_engine.__version__)"`, { encoding: 'utf-8', timeout: 5000 }).trim()
        return { installed: true, path: engine.pythonPath, version: v }
      }
    } catch {
      return { installed: true, path: engine.type === 'system' ? engine.binaryPath : engine.pythonPath }
    }
  }

  // ── Logging ────────────────────────────────────────────────────────────

  pushLog(sessionId: string, data: string): void {
    let buf = this.logBuffers.get(sessionId)
    if (!buf) { buf = []; this.logBuffers.set(sessionId, buf) }
    const ts = new Date().toISOString().slice(11, 23)
    for (const line of data.split('\n')) {
      if (!line) continue
      buf.push(`[${ts}] ${line}`)
    }
    if (buf.length > WebSessionManager.LOG_BUFFER_MAX) {
      buf.splice(0, buf.length - WebSessionManager.LOG_BUFFER_MAX)
    }
    this.checkLoadProgress(sessionId, data)
  }

  getLogs(sessionId: string): string[] {
    return this.logBuffers.get(sessionId) || []
  }

  clearLogs(sessionId: string): void {
    this.logBuffers.delete(sessionId)
  }

  private checkLoadProgress(sessionId: string, text: string): void {
    for (const { pattern, label, progress } of LOAD_PROGRESS_PATTERNS) {
      if (pattern.test(text)) {
        const current = this.loadProgressState.get(sessionId) ?? 0
        if (progress > current) {
          this.loadProgressState.set(sessionId, progress)
          this.emit('session:loadProgress', { sessionId, label, progress })
        }
        break
      }
    }
  }

  // ── Operation locks ────────────────────────────────────────────────────

  private withSessionLock(sessionId: string, fn: () => Promise<void>): Promise<void> {
    const prev = this.operationLocks.get(sessionId) ?? Promise.resolve()
    const next = prev.catch(() => { }).then(() => fn())
    const tail = next.catch(() => { })
    this.operationLocks.set(sessionId, tail)
    tail.then(() => {
      if (this.operationLocks.get(sessionId) === tail) this.operationLocks.delete(sessionId)
    })
    return next
  }

  // ── Health monitor ─────────────────────────────────────────────────────

  private startMonitor(): void {
    this.monitorInterval = setInterval(() => this.runHealthCheck(), 5000)
  }

  private async runHealthCheck(): Promise<void> {
    const sessions = db.getSessions()
    for (const session of sessions) {
      if (session.type === 'remote') continue
      const managed = this.processes.get(session.id)
      if (!managed?.process && !managed?.adoptedPid) continue
      if (session.status === 'stopped' || session.status === 'error') continue

      try {
        const res = await fetch(`http://127.0.0.1:${session.port}/health`, { signal: AbortSignal.timeout(5000) })
        if (res.ok) {
          const data = await res.json() as any
          this.failCounts.set(session.id, 0)
          this.lastHealthyAt.set(session.id, Date.now())
          if (session.status !== 'running' && data.running) {
            db.updateSessionStatus(session.id, 'running', { modelName: data.model_name })
            this.emit('session:ready', { sessionId: session.id, port: session.port })
          }
          this.emit('session:health', { sessionId: session.id, running: data.running, modelName: data.model_name })
        } else {
          this.incrementFail(session.id)
        }
      } catch {
        this.incrementFail(session.id)
      }
    }
  }

  private incrementFail(sessionId: string): void {
    const count = (this.failCounts.get(sessionId) ?? 0) + 1
    this.failCounts.set(sessionId, count)
    if (count >= WebSessionManager.MAX_FAIL_COUNT) {
      this.failCounts.delete(sessionId)
      const managed = this.processes.get(sessionId)
      if (managed) {
        this.processes.delete(sessionId)
        db.updateSessionStatus(sessionId, 'error')
        this.emit('session:error', { sessionId, error: 'Server stopped responding to health checks' })
      }
    }
  }

  getLastHealthyAt(sessionId: string): number {
    return this.lastHealthyAt.get(sessionId) || 0
  }

  touchSession(sessionId: string): void {
    this.lastRequestAt.set(sessionId, Date.now())
  }

  // ── Session CRUD ────────────────────────────────────────────────────────

  getSessions(): Session[] {
    return db.getSessions()
  }

  getSession(id: string): Session | null {
    return db.getSession(id)
  }

  getSessionByModelPath(modelPath: string): Session | null {
    const norm = normalizePath(modelPath)
    const sessions = db.getSessions()
    return sessions.find(s => normalizePath(s.modelPath) === norm && (s.status === 'running' || s.status === 'loading' || s.status === 'standby')) ?? null
  }

  async detect(): Promise<Array<{ pid: number; port: number; modelPath: string; healthy: boolean; modelName?: string }>> {
    const detected: Array<{ pid: number; port: number; modelPath: string; healthy: boolean; modelName?: string }> = []
    try {
      const output = execSync('ps aux', { encoding: 'utf-8', timeout: 5000 })
      for (const line of output.split('\n')) {
        if (line.includes('grep')) continue
        const isVmlx = (line.includes('vmlx-engine') && line.includes('serve')) ||
          (line.includes('vmlx_engine') && (line.includes('.cli') || line.includes('.server') || line.includes('--model')))
        if (!isVmlx) continue
        const parsed = this.parsePsLine(line)
        if (!parsed) continue
        let healthy = false
        let modelName: string | undefined
        try {
          const res = await fetch(`http://127.0.0.1:${parsed.port}/health`, { signal: AbortSignal.timeout(2000) })
          if (res.ok) { const d = await res.json() as any; healthy = true; modelName = d.model_name }
        } catch { }
        detected.push({ ...parsed, healthy, modelName })
      }
    } catch { }
    return detected
  }

  private parsePsLine(line: string): { pid: number; port: number; modelPath: string } | null {
    try {
      const parts = line.trim().split(/\s+/)
      const pid = parseInt(parts[1])
      if (isNaN(pid)) return null
      const cmd = parts.slice(10).join(' ')
      let modelPath = ''
      const serveIdx = cmd.indexOf('serve ')
      if (serveIdx !== -1) {
        modelPath = cmd.substring(serveIdx + 6).trim().split(/\s+--/)[0].trim()
      }
      if (!modelPath) {
        const m = cmd.match(/--model\s+(\S+)/)
        if (m) modelPath = m[1]
      }
      if (!modelPath) return null
      modelPath = normalizePath(modelPath)
      let port = 8000
      const pm = cmd.match(/--port\s+(\d+)/)
      if (pm) port = parseInt(pm[1])
      return { pid, port, modelPath }
    } catch { return null }
  }

  async createSession(modelPath: string, config: Record<string, any>): Promise<Session> {
    let unlock!: () => void
    const prev = this.creationLock
    this.creationLock = new Promise<void>(r => { unlock = r })
    await prev
    try {
      return await this._createSessionInner(normalizePath(modelPath), config)
    } finally {
      unlock()
    }
  }

  private async _createSessionInner(modelPath: string, config: Record<string, any>): Promise<Session> {
    const existing = db.getSessionByModelPath(modelPath)
    if (existing) {
      const merged = { ...JSON.parse(existing.config || '{}'), ...config, modelPath }
      db.upsertSession({ ...existing, config: JSON.stringify(merged), updatedAt: Date.now() })
      return db.getSession(existing.id)!
    }
    const id = randomUUID()
    const host = (config.host as string) || '0.0.0.0'
    const port = (config.port as number) || await this.findAvailablePort()
    const now = Date.now()
    const session: Session = {
      id, modelPath, modelName: config.modelName || modelPath.split('/').pop() || modelPath,
      host, port, status: 'stopped',
      config: JSON.stringify({ ...config, modelPath, port, host }),
      createdAt: now, updatedAt: now, type: 'local'
    }
    db.upsertSession(session)
    this.emit('session:created', session)
    return session
  }

  async createRemoteSession(params: { remoteUrl: string; remoteApiKey?: string; remoteModel: string; remoteOrganization?: string }): Promise<Session> {
    const url = new URL(params.remoteUrl)
    const modelPath = `remote://${params.remoteModel}@${url.host}`
    const existing = db.getSessionByModelPath(modelPath)
    if (existing) {
      db.upsertSession({ ...existing, remoteUrl: params.remoteUrl, remoteApiKey: params.remoteApiKey, remoteModel: params.remoteModel, remoteOrganization: params.remoteOrganization, updatedAt: Date.now() })
      return db.getSession(existing.id)!
    }
    const id = randomUUID()
    const port = await this.findAvailablePort()
    const now = Date.now()
    const session: Session = {
      id, modelPath, modelName: params.remoteModel, host: url.hostname, port,
      status: 'stopped', config: JSON.stringify({ timeout: 300 }), createdAt: now, updatedAt: now,
      type: 'remote', remoteUrl: params.remoteUrl, remoteApiKey: params.remoteApiKey,
      remoteModel: params.remoteModel, remoteOrganization: params.remoteOrganization
    }
    db.upsertSession(session)
    this.emit('session:created', session)
    return session
  }

  async startSession(sessionId: string): Promise<void> {
    const session = db.getSession(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)
    if (session.type === 'remote') {
      return this._connectRemoteSession(session)
    }
    await this.withSessionLock(sessionId, () => this._startSessionInner(sessionId))
  }

  private async _connectRemoteSession(session: Session): Promise<void> {
    if (session.status === 'running' || session.status === 'loading') return
    db.updateSessionStatus(session.id, 'loading')
    this.emit('session:starting', { sessionId: session.id })
    try {
      const healthUrl = `${session.remoteUrl?.replace(/\/+$/, '')}/v1/models`
      const headers: Record<string, string> = {}
      if (session.remoteApiKey) headers['Authorization'] = `Bearer ${session.remoteApiKey}`
      const res = await fetch(healthUrl, { headers, signal: AbortSignal.timeout(10000) })
      if (res.ok) {
        db.updateSessionStatus(session.id, 'running')
        this.emit('session:ready', { sessionId: session.id, port: session.port })
      } else {
        throw new Error(`Remote server returned ${res.status}`)
      }
    } catch (err: any) {
      db.updateSessionStatus(session.id, 'error')
      this.emit('session:error', { sessionId: session.id, error: err.message })
    }
  }

  private async _startSessionInner(sessionId: string): Promise<void> {
    const session = db.getSession(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)

    const managed = this.processes.get(sessionId)
    if (managed?.process || managed?.adoptedPid) throw new Error('Session is already running')

    const config = JSON.parse(session.config) as Record<string, any>
    config.modelPath = session.modelPath
    config.host = session.host
    config.port = session.port

    const engineResult = this.findEnginePath()
    if (!engineResult) throw new Error('vmlx-engine not found. Install it with: pip install vmlx')

    // Validate model path exists (skip remote/image sessions)
    if (session.type === 'local' && config.modelType !== 'image') {
      if (!existsSync(config.modelPath)) throw new Error(`Model not found: ${config.modelPath}`)
    }

    await this.killByPort(session.port)

    db.updateSessionStatus(sessionId, 'loading', { lastStartedAt: Date.now() })
    this.loadProgressState.delete(sessionId)
    this.emit('session:starting', { sessionId, modelPath: session.modelPath })

    const args = this.buildArgs(config)

    const extraPath = [
      join(homedir(), '.pyenv', 'shims'),
      join(homedir(), '.pyenv', 'bin'),
      '/opt/homebrew/bin',
      '/usr/local/bin',
    ].join(':')

    const spawnEnv: Record<string, string | undefined> = {
      ...process.env,
      PATH: `${extraPath}:${process.env.PATH || ''}`,
    }
    if (config.apiKey) spawnEnv.VLLM_API_KEY = config.apiKey
    const hfToken = db.getSetting('hf_api_key')
    if (hfToken) spawnEnv.HF_TOKEN = hfToken

    let proc: ChildProcess
    if (engineResult.type === 'bundled') {
      proc = spawn(engineResult.pythonPath, ['-s', '-m', 'vmlx_engine.cli', ...args], {
        env: { ...spawnEnv, PYTHONNOUSERSITE: '1', PYTHONPATH: undefined },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      })
    } else {
      proc = spawn(engineResult.binaryPath, args, {
        env: spawnEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      })
    }

    this.processes.set(sessionId, { process: proc, adoptedPid: null })

    const onData = (data: Buffer) => {
      const text = data.toString()
      this.pushLog(sessionId, text)
      this.emit('session:log', { sessionId, data: text })
      // Detect "Application startup complete" → mark ready
      if (text.includes('Application startup complete') || text.includes('Uvicorn running on')) {
        this.waitForReady(sessionId, session.port)
      }
    }

    proc.stdout?.on('data', onData)
    proc.stderr?.on('data', (data) => {
      const text = data.toString()
      this.pushLog(sessionId, text)
      this.emit('session:log', { sessionId, data: text })
      const m = this.processes.get(sessionId)
      if (m) {
        const lines = text.trim().split('\n').filter((l: string) => l.trim())
        const excLine = lines.find((l: string) => /^(RuntimeError|ImportError|ModuleNotFoundError|OSError|ValueError|TypeError|MemoryError|FileNotFoundError):/.test(l.trim()))
        if (excLine) m.lastStderr = excLine.trim()
        else if (!m.lastStderr) m.lastStderr = lines.pop() || ''
      }
    })

    proc.on('exit', (code, signal) => {
      const m = this.processes.get(sessionId)
      const intentional = m?.intentionalStop === true
      this.processes.delete(sessionId)
      this.failCounts.delete(sessionId)
      const crashed = !intentional && (signal === 'SIGKILL' || (code !== null && code !== 0))
      db.updateSessionStatus(sessionId, crashed ? 'error' : 'stopped', { lastStoppedAt: Date.now() })
      if (crashed) {
        const reason = signal === 'SIGKILL'
          ? 'Process killed (SIGKILL) — likely out of memory'
          : `Process exited with code ${code}${m?.lastStderr ? ': ' + m.lastStderr : ''}`
        this.emit('session:error', { sessionId, error: reason })
      }
      this.emit('session:stopped', { sessionId, code, signal })
    })

    proc.on('error', (err) => {
      this.processes.delete(sessionId)
      db.updateSessionStatus(sessionId, 'error')
      this.emit('session:error', { sessionId, error: err.message })
    })

    // Begin polling for readiness
    this.waitForReady(sessionId, session.port)
  }

  private async waitForReady(sessionId: string, port: number): Promise<void> {
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 2000))
      const managed = this.processes.get(sessionId)
      if (!managed?.process) return // process died
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(3000) })
        if (res.ok) {
          const data = await res.json() as any
          if (data.running) {
            db.updateSessionStatus(sessionId, 'running', {
              pid: managed.process?.pid,
              modelName: data.model_name,
              lastStartedAt: Date.now()
            })
            this.emit('session:ready', { sessionId, port, pid: managed.process?.pid })
            return
          }
        }
      } catch { }
    }
    // Timeout
    db.updateSessionStatus(sessionId, 'error')
    this.emit('session:error', { sessionId, error: 'Server did not become healthy after 4 minutes' })
  }

  private buildArgs(config: Record<string, any>): string[] {
    const args: string[] = ['serve', config.modelPath]
    if (config.host) args.push('--host', config.host)
    if (config.port) args.push('--port', String(config.port))
    if (config.toolCallParser && config.toolCallParser !== 'auto') args.push('--tool-call-parser', config.toolCallParser)
    if (config.reasoningParser && config.reasoningParser !== 'auto') args.push('--reasoning-parser', config.reasoningParser)
    if (config.contextLength) args.push('--max-tokens', String(config.contextLength))
    if (config.timeout != null) args.push('--timeout', String(config.timeout === 0 ? 86400 : config.timeout))
    if (config.cacheLimit) args.push('--cache-limit', String(config.cacheLimit))
    if (config.numLayers != null) args.push('--num-layers', String(config.numLayers))
    if (config.modelType) args.push('--model-type', config.modelType)
    if (config.modelType === 'image') { args.push('--image-mode', 'generate'); return args }
    if (config.mcpConfigPath) args.push('--mcp-config', config.mcpConfigPath)
    return args
  }

  async stopSession(sessionId: string): Promise<void> {
    await this.withSessionLock(sessionId, async () => {
      const managed = this.processes.get(sessionId)
      if (managed?.process) {
        managed.intentionalStop = true
        try { process.kill(-managed.process.pid!, 'SIGTERM') } catch { try { managed.process.kill('SIGTERM') } catch { } }
        await new Promise(r => setTimeout(r, 3000))
        if (managed.process?.exitCode === null) {
          try { managed.process.kill('SIGKILL') } catch { }
        }
      }
      db.updateSessionStatus(sessionId, 'stopped', { lastStoppedAt: Date.now() })
      this.emit('session:stopped', { sessionId })
    })
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.stopSession(sessionId).catch(() => { })
    this.processes.delete(sessionId)
    this.logBuffers.delete(sessionId)
    this.loadProgressState.delete(sessionId)
    db.deleteSession(sessionId)
    this.emit('session:deleted', { sessionId })
  }

  async updateSession(sessionId: string, config: Record<string, any>): Promise<void> {
    const session = db.getSession(sessionId)
    if (!session) throw new Error('Session not found')
    const merged = { ...JSON.parse(session.config || '{}'), ...config }
    db.upsertSession({ ...session, config: JSON.stringify(merged), updatedAt: Date.now() })
  }

  async softSleep(sessionId: string): Promise<void> {
    const session = db.getSession(sessionId)
    if (!session) return
    await fetch(`http://127.0.0.1:${session.port}/admin/soft-sleep`, { method: 'POST', signal: AbortSignal.timeout(10000) }).catch(() => { })
    db.updateSessionStatus(sessionId, 'standby', { standbyDepth: 'soft' })
    this.emit('session:standby', { sessionId, depth: 'soft' })
  }

  async deepSleep(sessionId: string): Promise<void> {
    const session = db.getSession(sessionId)
    if (!session) return
    await fetch(`http://127.0.0.1:${session.port}/admin/deep-sleep`, { method: 'POST', signal: AbortSignal.timeout(10000) }).catch(() => { })
    db.updateSessionStatus(sessionId, 'standby', { standbyDepth: 'deep' })
    this.emit('session:standby', { sessionId, depth: 'deep' })
  }

  async wake(sessionId: string): Promise<void> {
    const session = db.getSession(sessionId)
    if (!session) return
    await fetch(`http://127.0.0.1:${session.port}/admin/wake`, { method: 'POST', signal: AbortSignal.timeout(30000) }).catch(() => { })
    db.updateSessionStatus(sessionId, 'running')
    this.emit('session:ready', { sessionId, port: session.port })
  }

  // ── Port utilities ─────────────────────────────────────────────────────

  private async findAvailablePort(start = 8000): Promise<number> {
    const usedPorts = new Set(db.getSessions().map(s => s.port))
    for (let port = start; port < start + 200; port++) {
      if (usedPorts.has(port)) continue
      if (await this.isPortFree(port)) return port
    }
    throw new Error('No available ports found')
  }

  private isPortFree(port: number): Promise<boolean> {
    return new Promise(resolve => {
      const s = createServer()
      s.once('error', () => resolve(false))
      s.once('listening', () => { s.close(); resolve(true) })
      s.listen(port, '127.0.0.1')
    })
  }

  private async killByPort(port: number): Promise<void> {
    try {
      const out = execSync(`lsof -ti :${port}`, { encoding: 'utf-8', timeout: 3000 }).trim()
      if (out) {
        for (const pid of out.split('\n')) {
          try { process.kill(parseInt(pid), 'SIGTERM') } catch { }
        }
        await new Promise(r => setTimeout(r, 1000))
      }
    } catch { }
  }
}

export const sessionManager = new WebSessionManager()
