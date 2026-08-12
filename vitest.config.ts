import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
    // Only `src` is a test root. `docs` holds prose, plus work-in-progress
    // tests parked there deliberately for code that does not exist yet.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // The generator soundness sweeps are property tests over tens of thousands
    // of items each, and they are meant to be. They run for a few seconds
    // apiece, which trips the 5s default. The whole suite still finishes in
    // well under half a minute.
    testTimeout: 30_000,
  },
})
