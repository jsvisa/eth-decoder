import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    passWithNoTests: true,
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
