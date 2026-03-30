# /panel/dev — Panel: Development Mode

Start the Electron app in development mode with hot reload.

## Usage
`/panel/dev`

## Commands
```bash
cd panel
npm install   # first time only
npm run dev   # electron-vite dev
```

## What Happens
1. `electron-vite dev` starts:
   - Vite dev server for renderer (HMR on `http://localhost:5173`)
   - Watches main process TypeScript for changes
   - Launches Electron window pointed at dev server
2. Changes to `src/renderer/` → instant HMR (no restart)
3. Changes to `src/main/` → Electron restarts automatically

## Key Entry Points
| File | Role |
|------|------|
| `panel/src/main/index.ts` | Electron main process |
| `panel/src/renderer/src/App.tsx` | React root component |
| `panel/src/preload/index.ts` | IPC bridge (contextBridge) |
| `panel/electron.vite.config.ts` | Build config |

## Dev Shortcuts
| Key | Action |
|-----|--------|
| `Cmd+R` | Reload renderer |
| `Cmd+Option+I` | Open DevTools |
| `Cmd+Option+J` | Open DevTools (Console) |

## Environment
- `NODE_ENV=development`
- `VITE_DEV_SERVER_URL=http://localhost:5173`
- Source maps enabled for TypeScript debugging

## IPC Debugging
In DevTools console:
```javascript
// List all IPC channels
window.api  // Inspect the exposed API object
```

## Connect to Python Engine
The app expects the engine at `http://localhost:8000` by default.
Start engine in another terminal:
```bash
vmlx serve mlx-community/Qwen3-0.6B-4bit --port 8000
```
