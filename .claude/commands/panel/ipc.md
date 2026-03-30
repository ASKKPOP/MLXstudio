# /panel/ipc — Panel: IPC Handlers

Work with the Electron IPC layer between main process and renderer.

## Usage
`/panel/ipc $ARGUMENTS`

## Architecture
```
Renderer (React)
    │  window.api.*
    │
Preload (contextBridge)
  panel/src/preload/index.ts
    │
ipcRenderer.invoke / ipcRenderer.on
    │
Main Process
  panel/src/main/ipc/
    │
  Backend API / DB / filesystem
```

## IPC Handler Files
```
panel/src/main/ipc/
  chat.ts         (~105KB)  Chat messages, streaming, tool calls
  models.ts       (~71KB)   Model download, listing, management
  sessions.ts               Session CRUD, start/stop
  engine.ts                 Engine install, update, version check
  audio.ts                  TTS/STT requests
  image.ts        (~25KB)   Image generation + inpainting
  benchmark.ts              Benchmark execution + results
  cache.ts                  Cache stats, warm-up, clear
  embeddings.ts             Text embedding generation
  export.ts                 Chat export (JSON/Markdown)
  performance.ts            GPU/CPU metrics collection
  developer.ts              Debug tools, log access
  coding-tools.ts (~15KB)   Agentic coding tool integration
  utils.ts                  Shared IPC utilities
```

## Preload Bridge (index.ts)
```typescript
// All exposed methods are under window.api.*
contextBridge.exposeInMainWorld('api', {
  chat: { sendMessage, stopGeneration, getHistory, ... },
  sessions: { list, create, start, stop, ... },
  models: { list, download, search, ... },
  engine: { getStatus, install, update },
  cache: { getStats, clear, warmUp },
  benchmark: { run, getHistory },
  // ... etc
})
```

## Adding a New IPC Channel
1. **Create handler** in `panel/src/main/ipc/mymodule.ts`:
   ```typescript
   ipcMain.handle('mymodule:action', async (event, args) => {
     // implementation
     return result
   })
   ```
2. **Register handler** in `panel/src/main/index.ts`:
   ```typescript
   import './ipc/mymodule'
   ```
3. **Expose in preload** (`panel/src/preload/index.ts`):
   ```typescript
   mymodule: {
     action: (args) => ipcRenderer.invoke('mymodule:action', args),
   }
   ```
4. **Use in renderer**:
   ```typescript
   const result = await window.api.mymodule.action(args)
   ```
5. **Add type** in `panel/src/shared/types/` or renderer types

## Streaming IPC Pattern (for chat)
```typescript
// Main process sends events
event.sender.send('chat:token', { token: '...', done: false })

// Preload listens
ipcRenderer.on('chat:token', (_, data) => callback(data))

// Renderer handles
window.api.chat.onToken((data) => appendToMessage(data))
```

## Security Model
- All IPC exposed via `contextBridge` (no `nodeIntegration`)
- Main process validates all inputs before calling engine
- File paths sanitized, no shell injection
