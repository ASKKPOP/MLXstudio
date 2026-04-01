/**
 * MLX Studio Web — window.api shim
 *
 * Implements the exact same interface as panel/src/preload/index.ts
 * but uses HTTP calls to the Express management server instead of
 * Electron IPC. The React renderer code is completely unchanged.
 *
 * SSE events from /api/events replace ipcRenderer.on() push events.
 * Each on* method returns an unsubscribe function, identical to preload.
 */

const BASE = '' // Same origin — Vite proxies /api to localhost:3000 in dev

// Install log listeners for engine installation streaming
const installLogListeners = new Set<(d: any) => void>()

// ── SSE connection ──────────────────────────────────────────────────────────
// Single shared EventSource for all push events from the management server.
let _sse: EventSource | null = null
const _listeners = new Map<string, Set<(data: any) => void>>()

function getSse(): EventSource {
  if (_sse) return _sse
  _sse = new EventSource(`${BASE}/api/events`)
  // Let the browser's built-in EventSource reconnect handle drops automatically.
  // Do NOT destroy and recreate _sse on error — that wipes all registered listeners.
  return _sse
}

function sseOn(event: string, cb: (data: any) => void): () => void {
  const sse = getSse()
  const handler = (e: MessageEvent) => {
    try { cb(JSON.parse(e.data)) } catch { cb(e.data) }
  }
  sse.addEventListener(event, handler as EventListener)
  // Track for cleanup
  if (!_listeners.has(event)) _listeners.set(event, new Set())
  _listeners.get(event)!.add(cb)
  return () => {
    sse.removeEventListener(event, handler as EventListener)
    _listeners.get(event)?.delete(cb)
  }
}

// ── HTTP helpers ────────────────────────────────────────────────────────────

async function get(path: string, query?: Record<string, any>): Promise<any> {
  const url = new URL(`${BASE}${path}`, window.location.origin)
  if (query) Object.entries(query).forEach(([k, v]) => v != null && url.searchParams.set(k, String(v)))
  const r = await fetch(url.toString())
  if (!r.ok) { const e = await r.json().catch(() => ({ error: r.statusText })); throw new Error(e.error || r.statusText) }
  return r.json()
}

async function post(path: string, body?: any): Promise<any> {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) { const e = await r.json().catch(() => ({ error: r.statusText })); throw new Error(e.error || r.statusText) }
  return r.json()
}

async function put(path: string, body?: any): Promise<any> {
  const r = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) { const e = await r.json().catch(() => ({ error: r.statusText })); throw new Error(e.error || r.statusText) }
  return r.json()
}

async function del(path: string, body?: any): Promise<any> {
  const r = await fetch(`${BASE}${path}`, {
    method: 'DELETE',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body != null ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) { const e = await r.json().catch(() => ({ error: r.statusText })); throw new Error(e.error || r.statusText) }
  return r.json()
}

// ── window.api implementation ───────────────────────────────────────────────

export const webApi = {

  // ── Settings ──────────────────────────────────────────────────────────
  settings: {
    get: (key: string) => get(`/api/settings/${encodeURIComponent(key)}`).then(r => r.value),
    set: (key: string, value: string) => put(`/api/settings/${encodeURIComponent(key)}`, { value }),
    delete: (key: string) => del(`/api/settings/${encodeURIComponent(key)}`),
  },

  // ── Model Settings (per-model overrides) ──────────────────────────────
  modelSettings: {
    get: (modelPath: string) => get('/api/settings/model/' + encodeURIComponent(modelPath)).catch(() => null),
    getAll: () => get('/api/settings/model-all').catch(() => []),
    save: (modelPath: string, settings: any) => post('/api/settings/model', { modelPath, settings }),
    delete: (modelPath: string) => del('/api/settings/model/' + encodeURIComponent(modelPath)),
  },

  // ── Sessions ──────────────────────────────────────────────────────────
  sessions: {
    list: () => get('/api/sessions'),
    get: (id: string) => get(`/api/sessions/${id}`),
    create: (modelPath: string, config: any) => post('/api/sessions', { modelPath, config }),
    createRemote: (params: any) => post('/api/sessions/remote', params),
    start: (id: string) => post(`/api/sessions/${id}/start`),
    stop: (id: string) => post(`/api/sessions/${id}/stop`),
    delete: (id: string) => del(`/api/sessions/${id}`),
    detect: () => post('/api/sessions/detect'),
    update: (id: string, config: any) => put(`/api/sessions/${id}`, config),
    getLogs: (id: string) => get(`/api/sessions/${id}/logs`),
    clearLogs: (id: string) => del(`/api/sessions/${id}/logs`),
    softSleep: (id: string) => post(`/api/sessions/${id}/soft-sleep`),
    deepSleep: (id: string) => post(`/api/sessions/${id}/deep-sleep`),
    wake: (id: string) => post(`/api/sessions/${id}/wake`),
    touch: (_id: string) => Promise.resolve(), // no-op

    onCreated: (cb: (d: any) => void) => sseOn('session:created', cb),
    onDeleted: (cb: (d: any) => void) => sseOn('session:deleted', cb),
    onStarting: (cb: (d: any) => void) => sseOn('session:starting', cb),
    onReady: (cb: (d: any) => void) => sseOn('session:ready', cb),
    onStopped: (cb: (d: any) => void) => sseOn('session:stopped', cb),
    onError: (cb: (d: any) => void) => sseOn('session:error', cb),
    onHealth: (cb: (d: any) => void) => sseOn('session:health', cb),
    onLog: (cb: (d: any) => void) => sseOn('session:log', cb),
    onStandby: (cb: (d: any) => void) => sseOn('session:standby', cb),
    onLoadProgress: (cb: (d: any) => void) => sseOn('session:loadProgress', cb),
  },

  // ── Chat ──────────────────────────────────────────────────────────────
  chat: {
    createFolder: (name: string, parentId?: string) => post('/api/chat/folders', { name, parentId }),
    getFolders: () => get('/api/chat/folders'),
    deleteFolder: (id: string) => del(`/api/chat/folders/${id}`),

    create: (title: string, modelId: string, folderId?: string, modelPath?: string) =>
      post('/api/chat', { title, modelId, folderId, modelPath }),
    getRecent: (limit = 100) => get('/api/chat/recent', { limit }),
    getByModel: (modelPath: string) => get('/api/chat/by-model', { modelPath }),
    getAll: (folderId?: string) => get('/api/chat', folderId ? { folderId } : undefined),
    get: (id: string) => get(`/api/chat/${id}`),
    update: (id: string, updates: any) => put(`/api/chat/${id}`, updates),
    delete: (id: string) => del(`/api/chat/${id}`),
    search: (query: string) => get('/api/chat/search', { q: query }),

    getMessages: (chatId: string) => get(`/api/chat/${chatId}/messages`),
    addMessage: (chatId: string, role: string, content: string) =>
      post(`/api/chat/${chatId}/messages`, { role, content }),
    sendMessage: (chatId: string, content: string, endpoint?: any, attachments?: any[]) =>
      post(`/api/chat/${chatId}/send`, { content, endpoint, attachments }),
    abort: (chatId: string) => post(`/api/chat/${chatId}/abort`),
    isStreaming: (chatId: string) => get(`/api/chat/${chatId}/streaming`).then(r => r.streaming),
    clearAllLocks: () => Promise.resolve(),

    onStream: (cb: (d: any) => void) => sseOn('chat:stream', cb),
    onComplete: (cb: (d: any) => void) => sseOn('chat:complete', cb),
    onReasoningDone: (cb: (d: any) => void) => sseOn('chat:reasoningDone', cb),
    onTyping: (cb: (d: any) => void) => sseOn('chat:typing', cb),
    onToolStatus: (cb: (d: any) => void) => sseOn('chat:toolStatus', cb),
    onAskUser: (cb: (d: any) => void) => sseOn('chat:askUser', cb),
    answerUser: (chatId: string, answer: string) => post(`/api/chat/${chatId}/answer-user`, { answer }),

    setOverrides: (chatId: string, overrides: any) => put(`/api/chat/${chatId}/overrides`, overrides),
    getOverrides: (chatId: string) => get(`/api/chat/${chatId}/overrides`),
    clearOverrides: (chatId: string) => del(`/api/chat/${chatId}/overrides`),

    saveProfile: (name: string, overrides: any, isDefault?: boolean) =>
      post('/api/chat/profiles', { name, overrides, isDefault }),
    updateProfile: (id: string, name: string, overrides: any, isDefault?: boolean) =>
      put(`/api/chat/profiles/${id}`, { name, overrides, isDefault }),
    getProfiles: () => get('/api/chat/profiles/list'),
    getDefaultProfile: () => get('/api/chat/profiles/default'),
    deleteProfile: (id: string) => del(`/api/chat/profiles/${id}`),

    // File picker — use browser input element
    pickImages: (): Promise<Array<{ dataUrl: string; name: string }>> => {
      return new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'image/*'
        input.multiple = true
        input.onchange = async () => {
          const files = Array.from(input.files || [])
          const result: Array<{ dataUrl: string; name: string }> = []
          for (const file of files) {
            const dataUrl = await new Promise<string>((res) => {
              const reader = new FileReader()
              reader.onload = (e) => res(e.target!.result as string)
              reader.readAsDataURL(file)
            })
            result.push({ dataUrl, name: file.name })
          }
          resolve(result)
        }
        input.oncancel = () => resolve([])
        input.click()
      })
    },
    openDirectory: () => Promise.resolve({ canceled: true, filePaths: [] }),

    export: (chatId: string, format: string) =>
      get(`/api/chat/${chatId}/export`, { format }),
    import: (_modelPath?: string) => Promise.resolve(null),
  },

  // ── Models ────────────────────────────────────────────────────────────
  models: {
    scan: (modelType?: string) => get('/api/models', modelType ? { modelType } : undefined),
    info: (_modelPath: string) => Promise.resolve(null),
    getDirectories: (modelType?: string) => get('/api/models/directories', modelType ? { modelType } : undefined),
    addDirectory: (dirPath: string, _modelType?: string) => post('/api/models/directories', { dirPath }),
    removeDirectory: (dirPath: string, _modelType?: string) => del('/api/models/directories', { dirPath }),
    browseDirectory: () => Promise.resolve(null), // Not available in browser
    detectConfig: (modelPath: string) => get('/api/models/detect-config', { modelPath }),
    detectTypes: (_modelPaths: string[]) => Promise.resolve([]),
    getGenerationDefaults: (modelPath: string) => get('/api/models/generation-defaults', { modelPath }),
    searchHF: (query: string, sortBy?: string, sortDir?: string, modelType?: string) =>
      get('/api/models/search-hf', { query, sortBy, sortDir, modelType }),
    fetchReadme: (repoId: string) => get('/api/models/fetch-readme', { repoId }).then(r => r.readme),
    getRecommendedModels: () => Promise.resolve([]),
    getCollectionModels: (_slug: string) => Promise.resolve([]),
    downloadModel: (_repoId: string) => Promise.resolve({ success: false, error: 'Not supported in web mode' }),
    startDownload: (_repoId: string) => Promise.resolve({ success: false }),
    cancelDownload: (_jobId?: string) => Promise.resolve({ success: false }),
    pauseDownload: (_jobId: string) => Promise.resolve({ success: false }),
    resumeDownload: (_jobId: string) => Promise.resolve({ success: false }),
    getDownloadStatus: () => Promise.resolve([]),
    getDownloadDir: () => Promise.resolve(null),
    setDownloadDir: (_dir: string) => Promise.resolve({ success: false }),
    browseDownloadDir: () => Promise.resolve(null),
    checkImageModel: (_modelName: string, _quantize?: number) => Promise.resolve({ exists: false }),
    downloadImageModel: (_modelName: string, _quantize?: number) => Promise.resolve({ success: false }),
    openDownloadWindow: () => Promise.resolve(null),

    onDownloadProgress: (cb: (d: any) => void) => sseOn('models:downloadProgress', cb),
    onDownloadComplete: (cb: (d: any) => void) => sseOn('models:downloadComplete', cb),
    onDownloadError: (cb: (d: any) => void) => sseOn('models:downloadError', cb),
    onDownloadStarted: (cb: (d: any) => void) => sseOn('models:downloadStarted', cb),
    onDownloadQueued: (cb: (d: any) => void) => sseOn('models:downloadQueued', cb),
    onDownloadPaused: (cb: (d: any) => void) => sseOn('models:downloadPaused', cb),
  },

  // ── Cache ──────────────────────────────────────────────────────────────
  cache: {
    stats: (endpoint?: any, sessionId?: string) => get('/api/proxy/cache/stats', { host: endpoint?.host, port: endpoint?.port, sessionId }),
    entries: (endpoint?: any, sessionId?: string) => get('/api/proxy/cache/entries', { host: endpoint?.host, port: endpoint?.port, sessionId }),
    warm: (prompts: string[], endpoint?: any, sessionId?: string) => post('/api/proxy/cache/warm', { prompts, host: endpoint?.host, port: endpoint?.port, sessionId }),
    clear: (cacheType: string, endpoint?: any, sessionId?: string) => del('/api/proxy/cache', { cacheType, host: endpoint?.host, port: endpoint?.port, sessionId }),
  },

  // ── Audio ──────────────────────────────────────────────────────────────
  audio: {
    transcribe: (opts: any) => post('/api/proxy/audio/transcribe', opts),
    speak: (opts: any) => post('/api/proxy/audio/speak', opts).then(r => r.audioBase64),
    voices: (opts: any) => get('/api/proxy/audio/voices', { model: opts.model, host: opts.endpoint?.host, port: opts.endpoint?.port, sessionId: opts.sessionId }),
  },

  // ── Benchmark ──────────────────────────────────────────────────────────
  benchmark: {
    run: (sessionId: string, endpoint: any, modelPath: string, modelName?: string, options?: any) =>
      post('/api/benchmark/run', { sessionId, endpoint, modelPath, modelName, options }),
    history: (modelPath?: string) => get('/api/benchmark/history', modelPath ? { modelPath } : undefined),
    delete: (id: string) => del(`/api/benchmark/${id}`),
    onProgress: (cb: (d: any) => void) => sseOn('benchmark:progress', cb),
  },

  // ── Embeddings ──────────────────────────────────────────────────────────
  embeddings: {
    embed: (texts: string[], endpoint: any, model?: string, sessionId?: string) =>
      post('/api/proxy/embeddings', { texts, model, host: endpoint?.host, port: endpoint?.port, sessionId }),
  },

  // ── Performance ─────────────────────────────────────────────────────────
  performance: {
    health: (endpoint: any) => get('/api/proxy/health', { host: endpoint?.host, port: endpoint?.port }),
  },

  // ── Templates ───────────────────────────────────────────────────────────
  templates: {
    list: () => get('/api/templates'),
    save: (template: any) => post('/api/templates', template),
    delete: (id: string) => del(`/api/templates/${id}`),
  },

  // ── Developer tools ─────────────────────────────────────────────────────
  developer: {
    info: (_modelPath: string) => Promise.resolve(null),
    doctor: (_modelPath: string, _opts?: any) => Promise.resolve({ success: false, error: 'Not available in web mode. Use the CLI: vmlx-engine doctor <model>' }),
    convert: (_args: any) => Promise.resolve({ success: false, error: 'Not available in web mode. Use the CLI: vmlx-engine convert ...' }),
    cancelOp: () => Promise.resolve(),
    isRunning: () => Promise.resolve({ running: false }),
    getBufferedLogs: () => Promise.resolve({ lines: [], running: false }),
    browseOutputDir: () => Promise.resolve(null),
    onLog: (cb: (d: any) => void) => sseOn('developer:log', cb),
    onComplete: (cb: (d: any) => void) => sseOn('developer:complete', cb),
  },

  // ── App ─────────────────────────────────────────────────────────────────
  app: {
    getVersion: () => get('/api/app/version').then(r => r.version),
    onUpdateAvailable: (_cb: (d: any) => void) => () => { }, // No auto-update in web mode
  },

  // ── Gateway (not applicable in web mode) ────────────────────────────────
  gateway: {
    getStatus: () => Promise.resolve({ port: null, running: false }),
    setPort: (_port: number) => Promise.resolve({ success: false }),
  },

  // ── Engine ──────────────────────────────────────────────────────────────
  engine: {
    checkInstallation: () => get('/api/engine/status'),
    detectInstallers: () => get('/api/engine/installers'),
    checkEngineVersion: () => Promise.resolve({ upToDate: true }),
    installStreaming: (method: string, _action: string, installerPath?: string): Promise<{ success: boolean; error?: string }> => {
      return new Promise((resolve) => {
        // Subscribe to SSE completion event before starting the install
        const unsubDone = sseOn('engine:installDone', (payload: any) => {
          unsubDone()
          resolve({ success: payload.success, error: payload.error })
        })

        // POST to kick off the install (returns immediately; progress via SSE)
        fetch('/api/engine/install', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method, path: installerPath }),
        }).catch(err => {
          unsubDone()
          resolve({ success: false, error: err.message })
        })
      })
    },
    cancelInstall: () => post('/api/engine/install/cancel', {}),
    onInstallLog: (cb: (d: any) => void) => {
      installLogListeners.add(cb)
      // Also listen via SSE for cross-tab support
      const unsub = sseOn('engine:installLog', cb)
      return () => { installLogListeners.delete(cb); unsub() }
    },
    onInstallComplete: (_cb: (d: any) => void) => () => { },
  },

  // ── Image ────────────────────────────────────────────────────────────────
  image: {
    createSession: (modelName: string, sessionType?: string) => post('/api/image/sessions', { modelName, sessionType }),
    getSessions: () => get('/api/image/sessions'),
    getSession: (id: string) => get(`/api/image/sessions/${id}`),
    deleteSession: (id: string) => del(`/api/image/sessions/${id}`),
    getGenerations: (sessionId: string) => get(`/api/image/sessions/${sessionId}/generations`),
    generate: (params: any) => post('/api/image/generate', params),
    edit: (params: any) => post('/api/image/edit', params),
    startServer: (modelName: string, quantize?: number, imageMode?: string, serverSettings?: any) =>
      post('/api/image/server/start', { modelName, quantize, imageMode, serverSettings }),
    stopServer: () => post('/api/image/server/stop'),
    cancelGeneration: () => post('/api/image/cancel'),
    isGenerating: () => get('/api/image/generating'),
    getRunningServer: () => get('/api/image/server/running'),
    getRunningServers: () => get('/api/image/server/running').then(r => r ? [r] : []),
    readFile: (imagePath: string) => get('/api/image/file', { path: imagePath }).then(r => r.base64),
    saveFile: (_imagePath: string) => Promise.resolve(null),
    getModelPaths: () => Promise.resolve([]),
  },

  // ── File System ─────────────────────────────────────────────────────────────
  fs: {
    tree: (dirPath?: string) => get('/api/fs/tree', dirPath ? { path: dirPath } : undefined),
    readFile: (filePath: string) => get('/api/fs/file', { path: filePath }).then((r: any) => r.content as string),
    writeFile: (filePath: string, content: string) => post('/api/fs/file', { path: filePath, content }),
  },

  // ── Terminal ─────────────────────────────────────────────────────────────
  terminal: {
    exec: (cmd: string, cwd?: string, sessionId?: string) =>
      post('/api/terminal/exec', { cmd, cwd, sessionId }),
    onOutput: (cb: (d: any) => void) => sseOn('terminal:output', cb),
    onDone: (cb: (d: any) => void) => sseOn('terminal:done', cb),
  },

  // ── Coding tools (not applicable in web mode) ────────────────────────────
  tools: {
    getCodingToolStatus: () => Promise.resolve([]),
    installCodingTool: (_toolId: string) => Promise.resolve({ success: false }),
    addCodingToolConfig: (_toolId: string, _baseUrl: string, _modelName: string, _port: number | null) => Promise.resolve({ success: false }),
    removeCodingToolConfig: (_toolId: string, _label: string) => Promise.resolve({ success: false }),
    getConfigSnippets: (_baseUrl: string, _modelName: string) => Promise.resolve([]),
  },
}

// Initialize SSE connection eagerly
getSse()
