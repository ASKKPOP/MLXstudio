# /dev — Development Mode

Start the full development environment with hot reload.

## Steps

1. **Start Python engine** (terminal 1)
   ```bash
   pip install -e ".[dev]"
   vmlx serve mlx-community/Qwen3-0.6B-4bit --port 8000
   ```

2. **Start Electron app in dev mode** (terminal 2)
   ```bash
   cd panel
   npm install   # if not done yet
   npm run dev   # electron-vite dev with HMR
   ```

## What Dev Mode Provides
- Hot Module Replacement for React renderer
- Auto-reload on main process changes
- DevTools enabled in Electron window
- Source maps for TypeScript debugging

## Key Entry Points
- Main process: `panel/src/main/index.ts`
- Renderer: `panel/src/renderer/src/App.tsx`
- Preload bridge: `panel/src/preload/index.ts`
- Python server: `vmlx_engine/cli.py` → `serve_command()`

## Environment Variables
- `NODE_ENV=development` — auto-set by electron-vite
- `VITE_DEV_SERVER_URL` — set by electron-vite for renderer HMR

## Debugging
- Renderer DevTools: `Cmd+Option+I` in Electron window
- Main process: attach Node.js debugger to port 5858
- Python engine logs: check terminal running `vmlx serve`
