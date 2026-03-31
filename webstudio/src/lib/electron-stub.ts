/**
 * Stub module — replaces 'electron' import in renderer code when
 * building for the web. The renderer only imports from preload which
 * doesn't reference electron directly, but vite alias safety net.
 */
export const ipcRenderer = null
export const contextBridge = null
export default {}
