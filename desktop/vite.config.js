import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve, dirname } from 'path'
import { existsSync } from 'fs'

const host = process.env.TAURI_DEV_HOST
const appDir = resolve(__dirname, '../app')

// Plugin: redirect unresolvable '../utils/' imports from app/ pages
// to app/utils/ (fixes incorrect relative paths introduced in Task 2 refactor).
// Special case: '../utils/platform' is redirected to desktop/platform.js so the
// Tauri adapter is used instead of the web adapter.
function appUtilsRedirectPlugin() {
  const desktopDir = __dirname
  return {
    name: 'app-utils-redirect',
    resolveId(source, importer) {
      if (!importer || !importer.startsWith(appDir)) return null
      if (!source.match(/^(\.\.\/)+utils\//)) return null
      const utilsPath = source.replace(/^(\.\.\/)+utils\//, '')
      // Redirect platform imports to the desktop adapter
      if (utilsPath === 'platform' || utilsPath === 'platform.js') {
        return resolve(desktopDir, 'platform.js')
      }
      const target = resolve(appDir, 'utils', utilsPath)
      if (existsSync(target) || existsSync(target + '.js')) {
        return target.endsWith('.js') || target.endsWith('.jsx') ? target : target + '.js'
      }
      return null
    },
  }
}

export default defineConfig({
  root: __dirname,
  plugins: [react(), appUtilsRedirectPlugin()],
  esbuild: {
    loader: 'jsx',
    include: /.*\.(js|jsx)$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  },
  resolve: {
    alias: [
      { find: '@app/utils/platform', replacement: resolve(__dirname, './platform.js') },
      { find: '@app', replacement: resolve(__dirname, '../app') },
      { find: 'next/navigation', replacement: resolve(__dirname, './shims/next-navigation.js') },
      { find: 'next/link', replacement: resolve(__dirname, './shims/next-link.jsx') },
    ],
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
})
