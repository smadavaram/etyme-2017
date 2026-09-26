import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  // Next.js leaves JSX alone (`"jsx": "preserve"` in tsconfig) and hands it
  // to its own compiler, which imports the runtime for you. A test rendering
  // a component gets no such favor, so the automatic runtime is named here —
  // otherwise every component file would have to import React to be testable,
  // which is a test detail leaking into product code.
  esbuild: { jsx: 'automatic' },
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    setupFiles: ['__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/db.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/tests': path.resolve(__dirname, './__tests__'),
    },
  },
})
