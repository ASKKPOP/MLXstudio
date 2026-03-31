import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  root: '.',
  plugins: [react()],
  resolve: {
    alias: {
      // Point to the panel renderer source so we reuse all UI components unchanged
      '@': resolve(__dirname, '../panel/src/renderer/src'),
      // Stub out Electron-specific imports that won't exist in web context
      'electron': resolve(__dirname, 'src/lib/electron-stub.ts'),
    }
  },
  define: {
    // Flag consumed by main.web.tsx to inject webApi
    '__WEB_MODE__': 'true',
    // Prevent process.env references from crashing in browser
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy API calls to management server during dev
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html')
      }
    }
  },
  css: {
    // Ensure Tailwind CSS from panel renderer is processed
  }
})
