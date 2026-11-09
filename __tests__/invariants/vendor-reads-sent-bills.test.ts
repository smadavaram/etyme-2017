import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { DRAWS_NOTHING } from '@/lib/money/bill-state'

/**
 * Money's a15098ea1: a bill raised and never sent is owed by nobody, read
 * through the one sent-only list, `DRAWS_NOTHING`. Vendor concentration
 * and counterparty risk read the same list, so a bill that was only
 * drafted or raised is neither a firm's revenue nor what a client owes it.
 */

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')

/** Source with comments stripped, so a quoted old list cannot pass. */
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

const ROUTES = {
  concentration: { file: 'src/app/api/vendors/concentration/route.ts', list: 'NOT_REVENUE' },
  risk: { file: 'src/app/api/vendors/risk/route.ts', list: 'NOT_RECEIVABLE' },
}

describe('vendor concentration and risk read money\'s sent-only list', () => {
  it('a bill raised and never sent is neither revenue nor owed on vendor concentration and risk', () => {
    // The list itself leaves out a drafted and a raised bill.
    expect(DRAWS_NOTHING).toContain('DRAFT')
    expect(DRAWS_NOTHING).toContain('ISSUED')

    for (const { file, list } of Object.values(ROUTES)) {
      const src = code(file)
      expect(src).toMatch(/import \{ DRAWS_NOTHING \} from '@\/lib\/money\/bill-state'/)
      expect(src).toMatch(new RegExp(`const ${list} = \\[\\.\\.\\.DRAWS_NOTHING\\]`))
      // No hand-typed copy of the old list is left behind.
      expect(src).not.toMatch(/\['DRAFT', 'CANCELLED', 'VOID'\]/)
      // And the queries filter bills through it.
      expect(src).toMatch(new RegExp(`notIn: ${list}`))
    }
  })
})
