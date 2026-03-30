# /build — Full Project Build

Build the entire MLXStudio project (Python engine + Electron panel).

## Steps

1. **Check environment**
   - Verify Node.js ≥18, npm, Python 3.11–3.13 are available
   - Run: `node --version && npm --version && python3 --version`

2. **Install Python dependencies**
   - From project root: `pip install -e ".[dev,jang,image]"`
   - Or with uv: `uv pip install -e ".[dev,jang,image]"`

3. **Install panel dependencies**
   - `cd panel && npm install`

4. **Build Electron app**
   - `npm run build` (runs electron-vite build)
   - Outputs: `panel/dist/` (main+preload), `panel/out/` (renderer)

5. **Package for distribution (optional)**
   - Unsigned local build: `CSC_IDENTITY_AUTO_DISCOVERY=false npm run package`
   - Signed DMG (requires Apple Developer cert): `npm run dist`
   - Output: `panel/release/mac/vMLX.app`

## Key Files
- `pyproject.toml` — Python package config (deps, entry points)
- `panel/package.json` — Electron app config and build scripts
- `panel/build/entitlements.mac.plist` — macOS signing entitlements

## Common Issues
- Missing `panel/build/entitlements.mac.plist` → create it with standard Electron entitlements
- `better-sqlite3` native build fails → electron-builder rebuilds from source automatically
- `bundled-python` missing → safe to ignore for dev builds; app prompts user to install engine

## Expected Output
```
dist/main/index.mjs     ~485 KB
dist/preload/index.js    ~20 KB
out/renderer/index.html   ~0.7 KB
out/renderer/assets/      ~2.7 MB JS, ~87 KB CSS
release/mac/vMLX.app     (if packaged)
```
