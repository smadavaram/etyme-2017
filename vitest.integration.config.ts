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
 * Four files at a time, each in its own worker process with its own
 * database copied from a template the global setup builds once
 * (see __integration__/harness.ts). Tests inside a file still run in
 * order, because a file is one story: a real vendor's first month.
 *
 * ETYME_INTEGRATION_FORKS sets how many files run at once.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__integration__/**/*.test.ts'],
    globalSetup: ['__integration__/global-setup.ts'],
    setupFiles: ['__integration__/setup.ts'],
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: Number(process.env.ETYME_INTEGRATION_FORKS || 4),
        minForks: 1,
      },
    },
    sequence: { concurrent: false },
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
