import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  resolve: {
    alias: { '@app': resolve(__dirname, 'app') },
  },
  test: {
    globals: true,
    passWithNoTests: true,
    exclude: ['tests/e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['app/utils/**', 'app/api/**'],
    },
    projects: [
      {
        resolve: {
          alias: { '@app': resolve(__dirname, 'app') },
        },
        test: {
          include: ['tests/unit/**'],
          environment: 'jsdom',
        },
      },
      {
        resolve: {
          alias: { '@app': resolve(__dirname, 'app') },
        },
        test: {
          include: ['tests/api/**'],
          exclude: ['tests/api/__fixtures__/**', 'tests/e2e/**', 'node_modules/**'],
          environment: 'node',
        },
      },
    ],
  },
})
