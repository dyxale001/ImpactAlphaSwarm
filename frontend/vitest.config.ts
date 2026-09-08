import { defineConfig } from 'vitest/config'

// Deliberately separate from vite.config.ts so the test runner cannot affect the
// production build. Only the pure logic in src/utils is covered: no DOM, no
// component rendering, no jsdom dependency.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
