import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mismatchTitle } from '@/lib/twin/performers'
import { MISMATCH_TITLE, mismatchSays } from '@/app/api/conversations/twin/notices'

/**
 * The paying team's notice about a receipt that does not match names the
 * receipt and the supplier in its own title (second production walk,
 * 2026-10-26), so the app, the email and Teams all say which one.
 */

describe('the twin’s mismatch notice', () => {
  it('a mismatch notice names the receipt and the supplier that sent it in its title, so email and Teams carry them too', () => {
    expect(mismatchTitle({ number: 'PR-2026-0442', supplierName: 'Pinnacle Resourcing' }))
      .toBe('PR-2026-0442 from Pinnacle Resourcing does not match what was accepted')
    // The same words Ask Etyme uses when it names an older notice.
    expect(mismatchTitle({ number: 'PR-2026-0442', supplierName: 'Pinnacle Resourcing' }))
      .toBe(mismatchSays('PR-2026-0442', 'Pinnacle Resourcing'))
    // A part the record lacks is left out, never invented.
    expect(mismatchTitle({ number: 'PR-2026-0442' })).toBe('Invoice receipt PR-2026-0442 does not match what was accepted')
    expect(mismatchTitle({ supplierName: 'Pinnacle Resourcing' })).toBe('An invoice receipt from Pinnacle Resourcing does not match what was accepted')
    // With nothing to name, the old title, which Ask Etyme still names on reading.
    expect(mismatchTitle({})).toBe(MISMATCH_TITLE)
    // The performer writes this title, not a fixed one.
    const src = readFileSync(join(process.cwd(), 'src/lib/twin/performers.ts'), 'utf8')
    expect(src).toContain("tell(desk, c.companyId, c, mismatchTitle(c.payload), 'INVOICE')")
  })
})
