import { defineConfig } from 'vitest/config'
import path from 'path'

/**
 * The integration suite: real routes against real Postgres.
 *
 * Separate from the pure suite on purpose. The 3,000+ invariant tests
 * run anywhere in seconds and gate every commit; these need a database
 * and exist to answer the one question the pure suite cannot — does the
 * product actually process a transaction end to end.
 *
 * Serial, one file at a time, because the tests share one database and
 * one story: a real vendor's first month, in order.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__integration__/**/*.test.ts'],
    setupFiles: ['__integration__/setup.ts'],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
