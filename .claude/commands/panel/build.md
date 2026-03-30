# /panel/build — Panel: Build Electron App

Build and package the Electron desktop app.

## Usage
`/panel/build $ARGUMENTS`

## Commands

### Development build (JS bundle only)
```bash
cd panel
npm run build
```
Outputs:
- `panel/dist/main/index.mjs` — main process
- `panel/dist/preload/index.js` — preload script
- `panel/out/renderer/` — renderer (HTML + JS + CSS)

### Unsigned local app (no cert required)
```bash
cd panel
CSC_IDENTITY_AUTO_DISCOVERY=false npm run package
```
Output: `panel/release/mac/vMLX.app`

### Signed DMG for distribution (Apple Developer cert required)
```bash
cd panel
npm run dist
```
Output: `panel/release/vMLX-X.Y.Z-arm64.dmg`

### Run packaged app
```bash
open panel/release/mac/vMLX.app
```

## Key Config Files
| File | Role |
|------|------|
| `panel/package.json` | Build config (`"build"` field) |
| `panel/electron.vite.config.ts` | Vite bundler config |
| `panel/tsconfig.json` | TypeScript config |
| `panel/build/entitlements.mac.plist` | macOS signing entitlements |

## Build Config Summary (package.json)
```json
{
  "appId": "net.vmlx.app",
  "productName": "vMLX",
  "mac": {
    "target": ["dmg", "zip"],
    "hardenedRuntime": true,
    "minimumSystemVersion": "14.0.0"
  }
}
```

## Troubleshooting
| Issue | Fix |
|-------|-----|
| `entitlements.mac.plist: cannot read` | Create `panel/build/entitlements.mac.plist` |
| `better-sqlite3` build fails | Run with `node-gyp` and Xcode CLT installed |
| `bundled-python` missing | Safe to ignore; app installs engine at runtime |
| Code signing error | Use `CSC_IDENTITY_AUTO_DISCOVERY=false` for unsigned build |
