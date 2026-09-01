import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // .tsx as well, so the screens can be rendered and asserted on. A browser
    // pass is the honest check for a screen and is not reachable from every
    // environment; this is what is reachable from all of them.
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
})
