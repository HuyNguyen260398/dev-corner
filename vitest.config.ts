import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Separate from vite.config.ts so the crxjs plugin (extension build) does not run
// during tests. jsdom is used project-wide because the feed/thumbnail parsers in
// src/lib rely on DOMParser, which the service worker provides at runtime but Node
// does not — jsdom supplies it for both the lib and popup tests.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      reporter: ['text', 'html'],
    },
  },
})
