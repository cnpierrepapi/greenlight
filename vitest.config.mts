import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    // The engine is DOM free by design, so the tests run in node with no
    // environment shim. If a test ever needs jsdom, something has leaked into
    // lib/engine that does not belong there.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
})
