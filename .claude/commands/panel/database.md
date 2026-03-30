# /panel/database — Panel: SQLite Database

Work with the local SQLite database for chat history and settings persistence.

## Usage
`/panel/database $ARGUMENTS`

## Source Files
| File | Role |
|------|------|
| `panel/src/main/database.ts` | DatabaseManager class, schema, queries |
| `panel/src/main/db/model-settings.ts` | Per-model settings storage |

## Configuration
- Engine: **better-sqlite3** (synchronous, fast)
- Mode: **WAL** (Write-Ahead Logging) for concurrent access
- Location: `~/.mlxstudio/data/vmlx.db`

## Schema
```sql
-- Sessions
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  name TEXT,
  model_path TEXT,
  port INTEGER,
  engine_mode TEXT,   -- 'simple' | 'batched'
  cache_type TEXT,
  created_at INTEGER,
  status TEXT         -- 'stopped' | 'running' | 'error'
);

-- Chats (one session has many chats)
CREATE TABLE chats (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id),
  name TEXT,
  created_at INTEGER
);

-- Messages
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT REFERENCES chats(id),
  role TEXT,             -- 'user' | 'assistant' | 'tool'
  content TEXT,
  tool_calls TEXT,       -- JSON
  reasoning_content TEXT,
  created_at INTEGER
);

-- Per-chat inference overrides
CREATE TABLE chat_overrides (
  chat_id TEXT PRIMARY KEY REFERENCES chats(id),
  temperature REAL,
  top_p REAL,
  max_tokens INTEGER,
  system_prompt TEXT,
  enable_thinking INTEGER  -- boolean
);
```

## Common Queries (DatabaseManager)
```typescript
// Get all sessions
db.getAllSessions()

// Get chats for session
db.getChatsForSession(sessionId)

// Add message
db.addMessage(chatId, role, content, toolCalls?, reasoningContent?)

// Get chat history
db.getMessages(chatId)

// Update chat overrides
db.setChatOverrides(chatId, { temperature: 0.7, maxTokens: 2048 })
```

## Database Migration
Migrations run automatically on startup. Add new migrations in `database.ts`:
```typescript
const MIGRATIONS = [
  { version: 1, sql: `CREATE TABLE ...` },
  { version: 2, sql: `ALTER TABLE messages ADD COLUMN reasoning_content TEXT` },
  // Add new migrations here
]
```

## Backup / Export
```bash
# SQLite backup
sqlite3 ~/.mlxstudio/data/vmlx.db ".backup backup.db"

# Export via app
window.api.export.chatToJson(chatId)
window.api.export.chatToMarkdown(chatId)
```
