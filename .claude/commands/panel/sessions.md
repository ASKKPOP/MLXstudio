# /panel/sessions — Panel: Session Management

Work with session lifecycle, configuration, and the session UI.

## Usage
`/panel/sessions $ARGUMENTS`

## Source Files
```
panel/src/renderer/src/components/sessions/
  SessionDashboard.tsx       Home screen — all sessions
  SessionView.tsx            Single session detail page
  SessionCard.tsx            Session preview card
  CreateSession.tsx          New session wizard (2 steps)
  SessionSettings.tsx        Session configuration UI
  SessionConfigForm.tsx      Config form fields
  ServerSettingsDrawer.tsx   Advanced server options
  DownloadTab.tsx            Model downloader
  CachePanel.tsx             Cache stats + controls
  PerformancePanel.tsx       Performance metrics/graphs
  BenchmarkPanel.tsx         Benchmark runner + history
  LogsPanel.tsx              Live server log viewer
  EmbeddingsPanel.tsx        Embeddings generation UI
  DirectoryManager.tsx       File/model browser

panel/src/main/sessions.ts       SessionManager class
panel/src/main/ipc/sessions.ts   Session IPC handlers
panel/src/main/database.ts       Session persistence (SQLite)
panel/src/contexts/SessionsContext.tsx  React state
```

## Session Lifecycle
```
Create (wizard) → Saved to SQLite
    │
Start → SessionManager spawns Python subprocess
    │
Running → Health checks every 5s (3-strike failure)
    │
Stop → SIGTERM → 3s wait → SIGKILL
    │
Error → auto-restart (configurable)
```

## Session Data Model (SQLite)
```sql
sessions:
  id, name, model_path, port,
  engine_mode (simple|batched),
  cache_type, kv_quantization,
  disk_cache_enabled, prefix_cache_enabled,
  max_context_length, created_at, status

chats:
  id, session_id, name, created_at

messages:
  id, chat_id, role, content, tool_calls,
  reasoning_content, created_at

chat_overrides:
  chat_id, temperature, top_p, max_tokens,
  system_prompt, enable_thinking
```

## IPC Channels (sessions.ts)
```typescript
sessions:list             // Get all sessions
sessions:create           // Create new session
sessions:start            // Start session subprocess
sessions:stop             // Stop session subprocess
sessions:delete           // Delete session + history
sessions:get-status       // Health + queue info
sessions:get-logs         // Server log tail
sessions:update-config    // Edit session config
```

## Health Monitoring
- Interval: 5 seconds
- Strike limit: 3 consecutive failures
- On 3 strikes: session marked as "error", optionally auto-restarts
- Implemented in: `panel/src/main/process-manager.ts`

## Creating a New Session (2-step wizard)
1. **Step 1**: Pick model (HuggingFace search or local path)
2. **Step 2**: Configure port, engine mode, cache settings
→ Saved to DB, session listed in dashboard
