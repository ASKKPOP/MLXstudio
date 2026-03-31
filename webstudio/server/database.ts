/**
 * MLX Studio Web — SQLite database layer (no Electron dependency).
 * Schema mirrors panel/src/main/database.ts exactly so data is portable.
 */
import Database from 'better-sqlite3'
import { existsSync, mkdirSync, renameSync, unlinkSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'

// Store DB in ~/.mlxstudio/ so it coexists (different file) with Electron app
const DATA_DIR = join(homedir(), '.mlxstudio')
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
const DB_PATH = join(DATA_DIR, 'web-chats.db')

// ── Interfaces (identical to panel/src/main/database.ts) ──────────────────

export interface Chat {
  id: string
  title: string
  folderId?: string
  createdAt: number
  updatedAt: number
  modelId: string
  modelPath?: string
}

export interface Session {
  id: string
  modelPath: string
  modelName?: string
  host: string
  port: number
  pid?: number
  status: 'running' | 'stopped' | 'error' | 'loading' | 'standby'
  config: string
  createdAt: number
  updatedAt: number
  lastStartedAt?: number
  lastStoppedAt?: number
  lastRequestAt?: number
  standbyDepth?: 'soft' | 'deep' | null
  type: 'local' | 'remote'
  remoteUrl?: string
  remoteApiKey?: string
  remoteModel?: string
  remoteOrganization?: string
}

export interface Message {
  id: string
  chatId: string
  role: 'system' | 'user' | 'assistant'
  content: string
  timestamp: number
  tokens?: number
  metricsJson?: string
  toolCallsJson?: string
  reasoningContent?: string
}

export interface Folder {
  id: string
  name: string
  parentId?: string
  color?: string
  icon?: string
  createdAt: number
}

export interface ChatOverrides {
  chatId: string
  temperature?: number
  topP?: number
  topK?: number
  minP?: number
  maxTokens?: number
  repeatPenalty?: number
  systemPrompt?: string
  stopSequences?: string
  wireApi?: string
  maxToolIterations?: number
  builtinToolsEnabled?: boolean
  workingDirectory?: string
  enableThinking?: boolean
  reasoningEffort?: string
  hideToolStatus?: boolean
  webSearchEnabled?: boolean
  braveSearchEnabled?: boolean
  fetchUrlEnabled?: boolean
  fileToolsEnabled?: boolean
  searchToolsEnabled?: boolean
  shellEnabled?: boolean
  toolResultMaxChars?: number
  gitEnabled?: boolean
  utilityToolsEnabled?: boolean
}

export interface ChatProfile {
  id: string
  name: string
  overridesJson: string
  isDefault: boolean
  createdAt: number
  updatedAt: number
}

export interface BenchmarkResult {
  id: string
  sessionId: string
  modelPath: string
  modelName?: string
  resultsJson: string
  createdAt: number
}

export interface ImageSession {
  id: string
  modelName: string
  sessionType?: 'generate' | 'edit'
  createdAt: number
  updatedAt: number
}

export interface ImageGeneration {
  id: string
  sessionId: string
  prompt: string
  negativePrompt?: string
  modelName: string
  width: number
  height: number
  steps: number
  guidance: number
  seed?: number
  strength?: number
  elapsedSeconds?: number
  imagePath: string
  sourceImagePath?: string
  createdAt: number
}

// ── DatabaseManager ────────────────────────────────────────────────────────

class DatabaseManager {
  private db: Database.Database

  constructor() {
    try {
      this.db = new Database(DB_PATH)
      this.initialize()
    } catch (err) {
      console.error('[DB] Database corrupt, recreating:', err)
      const backupPath = `${DB_PATH}.corrupt.${Date.now()}`
      try {
        if (existsSync(DB_PATH)) renameSync(DB_PATH, backupPath)
        if (existsSync(`${DB_PATH}-wal`)) unlinkSync(`${DB_PATH}-wal`)
        if (existsSync(`${DB_PATH}-shm`)) unlinkSync(`${DB_PATH}-shm`)
      } catch (_) { }
      this.db = new Database(DB_PATH)
      this.initialize()
    }
  }

  private initialize(): void {
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        parent_id TEXT,
        color TEXT,
        icon TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        folder_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        model_id TEXT NOT NULL,
        model_path TEXT,
        FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant')),
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        tokens INTEGER,
        metrics_json TEXT,
        tool_calls_json TEXT,
        reasoning_content TEXT,
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS chat_overrides (
        chat_id TEXT PRIMARY KEY,
        temperature REAL,
        top_p REAL,
        top_k INTEGER,
        min_p REAL,
        max_tokens INTEGER,
        repeat_penalty REAL,
        system_prompt TEXT,
        stop_sequences TEXT,
        wire_api TEXT,
        max_tool_iterations INTEGER,
        builtin_tools_enabled INTEGER DEFAULT 0,
        working_directory TEXT,
        enable_thinking INTEGER DEFAULT NULL,
        reasoning_effort TEXT,
        hide_tool_status INTEGER DEFAULT 0,
        web_search_enabled INTEGER DEFAULT 1,
        brave_search_enabled INTEGER DEFAULT 0,
        fetch_url_enabled INTEGER DEFAULT 1,
        file_tools_enabled INTEGER DEFAULT 1,
        search_tools_enabled INTEGER DEFAULT 1,
        shell_enabled INTEGER DEFAULT 1,
        tool_result_max_chars INTEGER,
        git_enabled INTEGER DEFAULT 1,
        utility_tools_enabled INTEGER DEFAULT 1,
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id);
      CREATE INDEX IF NOT EXISTS idx_chats_folder ON chats(folder_id);
      CREATE INDEX IF NOT EXISTS idx_chats_model_path ON chats(model_path);
      CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chat_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        overrides_json TEXT NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        model_path TEXT NOT NULL UNIQUE,
        model_name TEXT,
        host TEXT NOT NULL DEFAULT '0.0.0.0',
        port INTEGER NOT NULL UNIQUE,
        pid INTEGER,
        status TEXT NOT NULL DEFAULT 'stopped'
          CHECK(status IN ('running','stopped','error','loading','standby')),
        config TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_started_at INTEGER,
        last_stopped_at INTEGER,
        last_request_at INTEGER,
        standby_depth TEXT,
        type TEXT NOT NULL DEFAULT 'local',
        remote_url TEXT,
        remote_api_key TEXT,
        remote_model TEXT,
        remote_organization TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

      CREATE TABLE IF NOT EXISTS benchmarks (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        model_path TEXT NOT NULL,
        model_name TEXT,
        results_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_benchmarks_model ON benchmarks(model_path);

      CREATE TABLE IF NOT EXISTS prompt_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS image_sessions (
        id TEXT PRIMARY KEY,
        model_name TEXT NOT NULL,
        session_type TEXT DEFAULT 'generate',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS image_generations (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        prompt TEXT NOT NULL,
        negative_prompt TEXT,
        model_name TEXT NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        steps INTEGER NOT NULL,
        guidance REAL NOT NULL,
        seed INTEGER,
        strength REAL,
        elapsed_seconds REAL,
        image_path TEXT NOT NULL,
        source_image_path TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES image_sessions(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_image_gens_session ON image_generations(session_id);
    `)
  }

  // ── Settings ──────────────────────────────────────────────────────────

  getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value ?? null
  }

  setSetting(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
  }

  deleteSetting(key: string): void {
    this.db.prepare('DELETE FROM settings WHERE key = ?').run(key)
  }

  // ── Folders ───────────────────────────────────────────────────────────

  createFolder(folder: Folder): void {
    this.db.prepare(`
      INSERT INTO folders (id, name, parent_id, color, icon, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(folder.id, folder.name, folder.parentId ?? null, folder.color ?? null, folder.icon ?? null, folder.createdAt)
  }

  getFolders(): Folder[] {
    return (this.db.prepare('SELECT * FROM folders ORDER BY created_at DESC').all() as any[]).map(r => ({
      id: r.id, name: r.name, parentId: r.parent_id ?? undefined,
      color: r.color ?? undefined, icon: r.icon ?? undefined, createdAt: r.created_at
    }))
  }

  deleteFolder(id: string): void {
    this.db.prepare('DELETE FROM folders WHERE id = ?').run(id)
  }

  // ── Chats ─────────────────────────────────────────────────────────────

  createChat(chat: Chat): void {
    this.db.prepare(`
      INSERT INTO chats (id, title, folder_id, created_at, updated_at, model_id, model_path)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(chat.id, chat.title, chat.folderId ?? null, chat.createdAt, chat.updatedAt, chat.modelId, chat.modelPath ?? null)
  }

  getChat(id: string): Chat | null {
    const r = this.db.prepare('SELECT * FROM chats WHERE id = ?').get(id) as any
    if (!r) return null
    return { id: r.id, title: r.title, folderId: r.folder_id ?? undefined, createdAt: r.created_at, updatedAt: r.updated_at, modelId: r.model_id, modelPath: r.model_path ?? undefined }
  }

  getChats(folderId?: string): Chat[] {
    const rows = folderId
      ? this.db.prepare('SELECT * FROM chats WHERE folder_id = ? ORDER BY updated_at DESC').all(folderId) as any[]
      : this.db.prepare('SELECT * FROM chats WHERE folder_id IS NULL ORDER BY updated_at DESC').all() as any[]
    return rows.map(r => ({ id: r.id, title: r.title, folderId: r.folder_id ?? undefined, createdAt: r.created_at, updatedAt: r.updated_at, modelId: r.model_id, modelPath: r.model_path ?? undefined }))
  }

  getRecentChats(limit = 100): Chat[] {
    return (this.db.prepare('SELECT * FROM chats ORDER BY updated_at DESC LIMIT ?').all(limit) as any[]).map(r => ({
      id: r.id, title: r.title, folderId: r.folder_id ?? undefined, createdAt: r.created_at, updatedAt: r.updated_at, modelId: r.model_id, modelPath: r.model_path ?? undefined
    }))
  }

  getChatsByModelPath(modelPath: string): Chat[] {
    return (this.db.prepare('SELECT * FROM chats WHERE model_path = ? ORDER BY updated_at DESC').all(modelPath) as any[]).map(r => ({
      id: r.id, title: r.title, folderId: r.folder_id ?? undefined, createdAt: r.created_at, updatedAt: r.updated_at, modelId: r.model_id, modelPath: r.model_path ?? undefined
    }))
  }

  updateChat(id: string, updates: Partial<Chat>): void {
    const fields: string[] = []
    const values: any[] = []
    if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title) }
    if (updates.folderId !== undefined) { fields.push('folder_id = ?'); values.push(updates.folderId) }
    if (updates.modelPath !== undefined) { fields.push('model_path = ?'); values.push(updates.modelPath) }
    fields.push('updated_at = ?'); values.push(Date.now())
    values.push(id)
    if (fields.length > 1) this.db.prepare(`UPDATE chats SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  }

  deleteChat(id: string): void {
    this.db.prepare('DELETE FROM chats WHERE id = ?').run(id)
  }

  searchChats(query: string): Chat[] {
    const q = `%${query}%`
    return (this.db.prepare(`
      SELECT DISTINCT c.* FROM chats c
      LEFT JOIN messages m ON m.chat_id = c.id
      WHERE c.title LIKE ? OR m.content LIKE ?
      ORDER BY c.updated_at DESC LIMIT 50
    `).all(q, q) as any[]).map(r => ({
      id: r.id, title: r.title, folderId: r.folder_id ?? undefined, createdAt: r.created_at, updatedAt: r.updated_at, modelId: r.model_id, modelPath: r.model_path ?? undefined
    }))
  }

  // ── Messages ──────────────────────────────────────────────────────────

  addMessage(msg: Message): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO messages (id, chat_id, role, content, timestamp, tokens, metrics_json, tool_calls_json, reasoning_content)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(msg.id, msg.chatId, msg.role, msg.content, msg.timestamp, msg.tokens ?? null, msg.metricsJson ?? null, msg.toolCallsJson ?? null, msg.reasoningContent ?? null)
    this.db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(Date.now(), msg.chatId)
  }

  getMessages(chatId: string): Message[] {
    return (this.db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp ASC').all(chatId) as any[]).map(r => ({
      id: r.id, chatId: r.chat_id, role: r.role, content: r.content, timestamp: r.timestamp,
      tokens: r.tokens ?? undefined, metricsJson: r.metrics_json ?? undefined,
      toolCallsJson: r.tool_calls_json ?? undefined, reasoningContent: r.reasoning_content ?? undefined
    }))
  }

  // ── Chat Overrides ─────────────────────────────────────────────────────

  getChatOverrides(chatId: string): ChatOverrides | null {
    const r = this.db.prepare('SELECT * FROM chat_overrides WHERE chat_id = ?').get(chatId) as any
    if (!r) return null
    return {
      chatId: r.chat_id,
      temperature: r.temperature ?? undefined, topP: r.top_p ?? undefined,
      topK: r.top_k ?? undefined, minP: r.min_p ?? undefined,
      maxTokens: r.max_tokens ?? undefined, repeatPenalty: r.repeat_penalty ?? undefined,
      systemPrompt: r.system_prompt ?? undefined, stopSequences: r.stop_sequences ?? undefined,
      wireApi: r.wire_api ?? undefined, maxToolIterations: r.max_tool_iterations ?? undefined,
      builtinToolsEnabled: r.builtin_tools_enabled != null ? !!r.builtin_tools_enabled : undefined,
      workingDirectory: r.working_directory ?? undefined,
      enableThinking: r.enable_thinking != null ? !!r.enable_thinking : undefined,
      reasoningEffort: r.reasoning_effort ?? undefined,
      hideToolStatus: r.hide_tool_status != null ? !!r.hide_tool_status : undefined,
      webSearchEnabled: r.web_search_enabled != null ? !!r.web_search_enabled : undefined,
      braveSearchEnabled: r.brave_search_enabled != null ? !!r.brave_search_enabled : undefined,
      fetchUrlEnabled: r.fetch_url_enabled != null ? !!r.fetch_url_enabled : undefined,
      fileToolsEnabled: r.file_tools_enabled != null ? !!r.file_tools_enabled : undefined,
      searchToolsEnabled: r.search_tools_enabled != null ? !!r.search_tools_enabled : undefined,
      shellEnabled: r.shell_enabled != null ? !!r.shell_enabled : undefined,
      toolResultMaxChars: r.tool_result_max_chars ?? undefined,
      gitEnabled: r.git_enabled != null ? !!r.git_enabled : undefined,
      utilityToolsEnabled: r.utility_tools_enabled != null ? !!r.utility_tools_enabled : undefined,
    }
  }

  setChatOverrides(o: ChatOverrides): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO chat_overrides
        (chat_id, temperature, top_p, top_k, min_p, max_tokens, repeat_penalty,
         system_prompt, stop_sequences, wire_api, max_tool_iterations,
         builtin_tools_enabled, working_directory, enable_thinking, reasoning_effort,
         hide_tool_status, web_search_enabled, brave_search_enabled, fetch_url_enabled,
         file_tools_enabled, search_tools_enabled, shell_enabled, tool_result_max_chars,
         git_enabled, utility_tools_enabled)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      o.chatId, o.temperature ?? null, o.topP ?? null, o.topK ?? null, o.minP ?? null,
      o.maxTokens ?? null, o.repeatPenalty ?? null, o.systemPrompt ?? null,
      o.stopSequences ?? null, o.wireApi ?? null, o.maxToolIterations ?? null,
      o.builtinToolsEnabled != null ? (o.builtinToolsEnabled ? 1 : 0) : null,
      o.workingDirectory ?? null,
      o.enableThinking != null ? (o.enableThinking ? 1 : 0) : null,
      o.reasoningEffort ?? null,
      o.hideToolStatus != null ? (o.hideToolStatus ? 1 : 0) : null,
      o.webSearchEnabled != null ? (o.webSearchEnabled ? 1 : 0) : null,
      o.braveSearchEnabled != null ? (o.braveSearchEnabled ? 1 : 0) : null,
      o.fetchUrlEnabled != null ? (o.fetchUrlEnabled ? 1 : 0) : null,
      o.fileToolsEnabled != null ? (o.fileToolsEnabled ? 1 : 0) : null,
      o.searchToolsEnabled != null ? (o.searchToolsEnabled ? 1 : 0) : null,
      o.shellEnabled != null ? (o.shellEnabled ? 1 : 0) : null,
      o.toolResultMaxChars ?? null,
      o.gitEnabled != null ? (o.gitEnabled ? 1 : 0) : null,
      o.utilityToolsEnabled != null ? (o.utilityToolsEnabled ? 1 : 0) : null
    )
  }

  clearChatOverrides(chatId: string): void {
    this.db.prepare('DELETE FROM chat_overrides WHERE chat_id = ?').run(chatId)
  }

  // ── Chat Profiles ──────────────────────────────────────────────────────

  saveChatProfile(name: string, overridesJson: string, isDefault = false): ChatProfile {
    if (isDefault) this.db.prepare('UPDATE chat_profiles SET is_default = 0').run()
    const now = Date.now()
    const id = randomUUID()
    this.db.prepare(`
      INSERT INTO chat_profiles (id, name, overrides_json, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name, overridesJson, isDefault ? 1 : 0, now, now)
    return { id, name, overridesJson, isDefault, createdAt: now, updatedAt: now }
  }

  updateChatProfile(id: string, name: string, overridesJson: string, isDefault = false): void {
    if (isDefault) this.db.prepare('UPDATE chat_profiles SET is_default = 0 WHERE id != ?').run(id)
    this.db.prepare('UPDATE chat_profiles SET name=?, overrides_json=?, is_default=?, updated_at=? WHERE id=?')
      .run(name, overridesJson, isDefault ? 1 : 0, Date.now(), id)
  }

  getChatProfiles(): ChatProfile[] {
    return (this.db.prepare('SELECT * FROM chat_profiles ORDER BY created_at DESC').all() as any[]).map(r => ({
      id: r.id, name: r.name, overridesJson: r.overrides_json,
      isDefault: !!r.is_default, createdAt: r.created_at, updatedAt: r.updated_at
    }))
  }

  getDefaultChatProfile(): ChatProfile | null {
    const r = this.db.prepare('SELECT * FROM chat_profiles WHERE is_default = 1 LIMIT 1').get() as any
    if (!r) return null
    return { id: r.id, name: r.name, overridesJson: r.overrides_json, isDefault: true, createdAt: r.created_at, updatedAt: r.updated_at }
  }

  deleteChatProfile(id: string): void {
    this.db.prepare('DELETE FROM chat_profiles WHERE id = ?').run(id)
  }

  // ── Sessions ──────────────────────────────────────────────────────────

  getSessions(): Session[] {
    return (this.db.prepare('SELECT * FROM sessions ORDER BY created_at DESC').all() as any[]).map(this.rowToSession)
  }

  getSession(id: string): Session | null {
    const r = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any
    return r ? this.rowToSession(r) : null
  }

  getSessionByModelPath(modelPath: string): Session | null {
    const r = this.db.prepare('SELECT * FROM sessions WHERE model_path = ?').get(modelPath) as any
    return r ? this.rowToSession(r) : null
  }

  upsertSession(s: Session): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO sessions
        (id, model_path, model_name, host, port, pid, status, config, created_at, updated_at,
         last_started_at, last_stopped_at, last_request_at, standby_depth, type,
         remote_url, remote_api_key, remote_model, remote_organization)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      s.id, s.modelPath, s.modelName ?? null, s.host, s.port, s.pid ?? null,
      s.status, s.config, s.createdAt, s.updatedAt,
      s.lastStartedAt ?? null, s.lastStoppedAt ?? null, s.lastRequestAt ?? null,
      s.standbyDepth ?? null, s.type,
      s.remoteUrl ?? null, s.remoteApiKey ?? null, s.remoteModel ?? null, s.remoteOrganization ?? null
    )
  }

  updateSessionStatus(id: string, status: Session['status'], extra?: Partial<Session>): void {
    const fields = ['status = ?', 'updated_at = ?']
    const values: any[] = [status, Date.now()]
    if (extra?.pid !== undefined) { fields.push('pid = ?'); values.push(extra.pid) }
    if (extra?.modelName !== undefined) { fields.push('model_name = ?'); values.push(extra.modelName) }
    if (extra?.lastStartedAt !== undefined) { fields.push('last_started_at = ?'); values.push(extra.lastStartedAt) }
    if (extra?.lastStoppedAt !== undefined) { fields.push('last_stopped_at = ?'); values.push(extra.lastStoppedAt) }
    if (extra?.standbyDepth !== undefined) { fields.push('standby_depth = ?'); values.push(extra.standbyDepth) }
    values.push(id)
    this.db.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  }

  deleteSession(id: string): void {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
  }

  private rowToSession(r: any): Session {
    return {
      id: r.id, modelPath: r.model_path, modelName: r.model_name ?? undefined,
      host: r.host, port: r.port, pid: r.pid ?? undefined, status: r.status,
      config: r.config, createdAt: r.created_at, updatedAt: r.updated_at,
      lastStartedAt: r.last_started_at ?? undefined, lastStoppedAt: r.last_stopped_at ?? undefined,
      lastRequestAt: r.last_request_at ?? undefined,
      standbyDepth: r.standby_depth ?? null,
      type: r.type ?? 'local',
      remoteUrl: r.remote_url ?? undefined, remoteApiKey: r.remote_api_key ?? undefined,
      remoteModel: r.remote_model ?? undefined, remoteOrganization: r.remote_organization ?? undefined,
    }
  }

  // ── Benchmarks ────────────────────────────────────────────────────────

  saveBenchmark(b: BenchmarkResult): void {
    this.db.prepare(`
      INSERT INTO benchmarks (id, session_id, model_path, model_name, results_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(b.id, b.sessionId, b.modelPath, b.modelName ?? null, b.resultsJson, b.createdAt)
  }

  getBenchmarks(modelPath?: string): BenchmarkResult[] {
    const rows = modelPath
      ? this.db.prepare('SELECT * FROM benchmarks WHERE model_path = ? ORDER BY created_at DESC').all(modelPath) as any[]
      : this.db.prepare('SELECT * FROM benchmarks ORDER BY created_at DESC LIMIT 200').all() as any[]
    return rows.map(r => ({ id: r.id, sessionId: r.session_id, modelPath: r.model_path, modelName: r.model_name ?? undefined, resultsJson: r.results_json, createdAt: r.created_at }))
  }

  deleteBenchmark(id: string): void {
    this.db.prepare('DELETE FROM benchmarks WHERE id = ?').run(id)
  }

  // ── Prompt Templates ──────────────────────────────────────────────────

  getTemplates(): { id: string; name: string; content: string; category: string }[] {
    return this.db.prepare('SELECT * FROM prompt_templates ORDER BY name ASC').all() as any[]
  }

  saveTemplate(t: { id: string; name: string; content: string; category: string }): void {
    this.db.prepare('INSERT OR REPLACE INTO prompt_templates (id, name, content, category, created_at) VALUES (?,?,?,?,?)').run(t.id, t.name, t.content, t.category, Date.now())
  }

  deleteTemplate(id: string): void {
    this.db.prepare('DELETE FROM prompt_templates WHERE id = ?').run(id)
  }

  // ── Image Sessions ─────────────────────────────────────────────────────

  createImageSession(s: ImageSession): void {
    this.db.prepare('INSERT INTO image_sessions (id, model_name, session_type, created_at, updated_at) VALUES (?,?,?,?,?)').run(s.id, s.modelName, s.sessionType ?? 'generate', s.createdAt, s.updatedAt)
  }

  getImageSessions(): ImageSession[] {
    return (this.db.prepare('SELECT * FROM image_sessions ORDER BY updated_at DESC').all() as any[]).map(r => ({ id: r.id, modelName: r.model_name, sessionType: r.session_type ?? 'generate', createdAt: r.created_at, updatedAt: r.updated_at }))
  }

  getImageSession(id: string): ImageSession | null {
    const r = this.db.prepare('SELECT * FROM image_sessions WHERE id = ?').get(id) as any
    if (!r) return null
    return { id: r.id, modelName: r.model_name, sessionType: r.session_type ?? 'generate', createdAt: r.created_at, updatedAt: r.updated_at }
  }

  deleteImageSession(id: string): void {
    this.db.prepare('DELETE FROM image_sessions WHERE id = ?').run(id)
  }

  getImageGenerations(sessionId: string): ImageGeneration[] {
    return (this.db.prepare('SELECT * FROM image_generations WHERE session_id = ? ORDER BY created_at DESC').all(sessionId) as any[]).map(r => ({
      id: r.id, sessionId: r.session_id, prompt: r.prompt, negativePrompt: r.negative_prompt ?? undefined,
      modelName: r.model_name, width: r.width, height: r.height, steps: r.steps, guidance: r.guidance,
      seed: r.seed ?? undefined, strength: r.strength ?? undefined, elapsedSeconds: r.elapsed_seconds ?? undefined,
      imagePath: r.image_path, sourceImagePath: r.source_image_path ?? undefined, createdAt: r.created_at
    }))
  }

  saveImageGeneration(g: ImageGeneration): void {
    this.db.prepare(`
      INSERT INTO image_generations
        (id, session_id, prompt, negative_prompt, model_name, width, height, steps, guidance,
         seed, strength, elapsed_seconds, image_path, source_image_path, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(g.id, g.sessionId, g.prompt, g.negativePrompt ?? null, g.modelName, g.width, g.height, g.steps, g.guidance, g.seed ?? null, g.strength ?? null, g.elapsedSeconds ?? null, g.imagePath, g.sourceImagePath ?? null, g.createdAt)
  }
}

export const db = new DatabaseManager()
