import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { meets, rank, tierWord } from '@/lib/supplier-tier'
import { goneCold, coldSince, COLD_AFTER_DAYS } from '@/lib/openings'

/**
 * Three statuses that were words on the schema: a supplier's tier,
 * which no rule could read; a seat gone cold, which nothing set; a
 * practice or an account, which nobody could create.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe("a supplier's standing with a client", () => {
  it('preferred outranks approved outranks probation; an agreement on file is approved; nothing is nothing', () => {
    expect(rank('PREFERRED', false)).toBeGreaterThan(rank('APPROVED', false))
    expect(rank('APPROVED', false)).toBeGreaterThan(rank('PROBATION', false))
    expect(rank(null, true)).toBe(rank('APPROVED', false))
    expect(rank(null, false)).toBe(-1)
  })

  it('a rule that needs approved passes an agreement, and says so in words', () => {
    expect(meets({ supplierName: 'Pinnacle', tier: null, hasAgreement: true, required: 'APPROVED' })).toEqual({ ok: true, reason: 'Pinnacle is approved by agreement.' })
  })

  it('a rule that needs preferred refuses a merely approved supplier, and says what would do', () => {
    expect(meets({ supplierName: 'Pinnacle', tier: 'APPROVED', hasAgreement: true, required: 'PREFERRED' })).toEqual({
      ok: false, reason: 'Pinnacle is approved. This role needs a supplier that is preferred or better.',
    })
  })

  it('probation set by the client beats the agreement on file', () => {
    expect(meets({ supplierName: 'Brightmoor', tier: 'PROBATION', hasAgreement: true, required: 'APPROVED' }).ok).toBe(false)
  })

  it('a stranger with no agreement and no standing is refused with both facts', () => {
    expect(meets({ supplierName: 'X', tier: null, hasAgreement: false, required: 'APPROVED' }).reason).toContain('no agreement with this client and no standing')
  })

  it('the words a person reads', () => {
    expect([tierWord('PROBATION', true), tierWord('PREFERRED', false), tierWord(null, true), tierWord(null, false)])
      .toEqual(['On probation', 'Preferred', 'Approved by agreement', 'Not rated'])
  })

  it('the VENDOR_TIER rule reads the standing from the client’s register, then the agreement', () => {
    const g = read('src/lib/governance.ts')
    expect(g).toContain("where: { companyId: endClientCompanyId, otherCompanyId: vendorCompanyId, relationship: 'SUPPLIER' }")
    expect(g).toContain('tierMeets({ supplierName: vendorName, tier: standing?.tier, hasAgreement: Boolean(msa), required: String(requiredTier) })')
  })

  it('the suppliers page sets the standing on the row, and refuses a word not on the list', () => {
    expect(read('src/app/dashboard/suppliers/page.tsx')).toContain("body: JSON.stringify({ otherCompanyId: companyId, relationship: 'SUPPLIER', tier })")
    expect(read('src/app/api/counterparties/route.ts')).toContain('A supplier is on probation, approved or preferred — not')
  })
})

describe('a seat goes cold', () => {
  const now = new Date('2026-09-14T00:00:00Z')
  it('six weeks without an advert is cold; five is not', () => {
    expect(goneCold(new Date('2026-07-20T00:00:00Z'), now)).toBe(true)
    expect(goneCold(new Date('2026-08-10T00:00:00Z'), now)).toBe(false)
    expect(COLD_AFTER_DAYS).toBe(45)
  })
  it('the log says how long it has been', () => {
    expect(coldSince(new Date('2026-07-20T00:00:00Z'), now)).toBe('last seen 56 days ago')
  })
  it('runs in the daily job and matches seats only where the window says so', () => {
    expect(read('src/app/api/cron/daily/route.ts')).toContain("path: 'cold-openings'")
    expect(read('src/app/api/cron/cold-openings/route.ts')).toContain("where: { status: 'LIVE', lastSeen: { lt: cutoff } }")
    expect(read('src/app/api/leads/route.ts')).toContain("COLD_AFTER_DAYS as WINDOW_DAYS } from '@/lib/openings'")
  })
})

describe('a unit can be added, of every kind the schema names', () => {
  it('the five kinds, and a sentence for a sixth', () => {
    const r = read('src/app/api/program/units/route.ts')
    expect(r).toContain("const KINDS = ['BU', 'PRACTICE', 'ACCOUNT', 'PROJECT', 'DEPARTMENT'] as const")
    expect(r).toContain('A unit is a business unit, a practice, an account, a project or a department')
  })
  it('the program team page has the form, under the desks', () => {
    const p = read('src/app/dashboard/program/team/page.tsx')
    expect(p.indexOf('<AddUnit teams={team.teams} onAdded={reload} />')).toBeLessThan(p.indexOf('Rules on the money'))
    expect(p).toContain('<option value="PRACTICE">Practice</option>')
  })
})
