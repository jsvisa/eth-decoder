import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    passWithNoTests: true,
    exclude: ['tests/e2e/**', 'node_modules/**'],
    environmentMatchGlobs: [
      ['tests/unit/**', 'jsdom'],
      ['tests/api/**', 'node'],
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['app/utils/**', 'app/api/**'],
    },
  },
})
