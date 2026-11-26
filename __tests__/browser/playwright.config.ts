import { defineConfig } from '@playwright/test'
import { readdirSync, existsSync } from 'node:fs'

/**
 * The browser cases (CLAUDE.md, "How work is verified" 8): a form is
 * tested by pressing Save, on the seeded world, against a running
 * production build. Run with
 *
 *   ONE_CARD_URL=http://localhost:3101 ONE_CARD_DB=<the same database the server reads> \
 *     npx playwright test -c __tests__/browser/playwright.config.ts
 *
 * Vitest never picks these up: its include is *.test.ts and these are *.spec.ts.
 */
const CHROME = readdirSync('/opt/pw-browsers')
  .filter((d) => /^chromium-\d+$/.test(d))
  .flatMap((d) => [`/opt/pw-browsers/${d}/chrome-linux64/chrome`, `/opt/pw-browsers/${d}/chrome-linux/chrome`])
  .find(existsSync)

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  timeout: 90_000,
  workers: 1,
  reporter: 'list',
  use: { baseURL: process.env.ONE_CARD_URL ?? 'http://localhost:3101', launchOptions: { executablePath: CHROME } },
})
