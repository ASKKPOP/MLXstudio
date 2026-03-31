/**
 * MLX Studio Web — browser entry point.
 *
 * Injects the webApi shim as window.api before React mounts,
 * so all existing renderer components use it transparently.
 * This file is the ONLY web-specific file — all UI components
 * are imported unchanged from ../panel/src/renderer/src/.
 */
import React from 'react'
import ReactDOM from 'react-dom/client'

// Inject web API shim as window.api BEFORE React renders
import { webApi } from './webApi'
;(window as any).api = webApi

// Import the original app entry — all components, contexts, styles unchanged
import App from '@/App'
import { ThemeProvider } from '@/providers/ThemeProvider'
import { I18nProvider } from '@/i18n'
import { AppStateProvider } from '@/contexts/AppStateContext'
import { SessionsProvider } from '@/contexts/SessionsContext'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <SessionsProvider>
          <AppStateProvider>
            <App />
          </AppStateProvider>
        </SessionsProvider>
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>
)
