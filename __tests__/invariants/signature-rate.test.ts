import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { signatureRateCents, type RungRate } from '@/app/api/timesheets/signature-rate'

/**
 * What each signature on a week records (decided 2026-10-06,
 * lib/money/hop-ledger): the rate on the rung the signing firm pays on.
 *
 * Helena Marsh's chain: Northbend Athletic pays Computer Systems $145,
 * Computer Systems pays Techpeple $118, Techpeple pays Helena $84.
 */
const ladder: RungRate[] = [
  { sellContractId: 'cs-to-northbend', companyId: 'cs', clientCompanyId: 'northbend', billRateCents: 14_500 },
  { sellContractId: 'tp-to-cs', companyId: 'tp', clientCompanyId: 'cs', billRateCents: 11_800 },
]

describe('the rate each signature records', () => {
  it('each firm’s signature records the rate on the rung it pays, and the client’s is the top contract’s bill rate', () => {
    expect(signatureRateCents({ role: 'CLIENT_APPROVAL', companyId: 'northbend', ladder, ownBuyLineCents: null })).toBe(14_500)
    expect(signatureRateCents({ role: 'PASS_THROUGH', companyId: 'cs', ladder, ownBuyLineCents: 11_800 })).toBe(11_800)
    expect(signatureRateCents({ role: 'EMPLOYER_ACCEPTANCE', companyId: 'tp', ladder, ownBuyLineCents: 8_400 })).toBe(8_400)
  })

  it('the client never records the price of the contract the week is filed on when that is a sub-vendor’s', () => {
    expect(signatureRateCents({ role: 'CLIENT_APPROVAL', companyId: 'northbend', ladder, ownBuyLineCents: null })).not.toBe(11_800)
  })

  it('a firm in the middle with no buy line on record records the price of the rung it buys on', () => {
    expect(signatureRateCents({ role: 'PASS_THROUGH', companyId: 'cs', ladder, ownBuyLineCents: null })).toBe(11_800)
  })

  it('an employer with no pay on record records nothing, never the bill rate', () => {
    expect(signatureRateCents({ role: 'EMPLOYER_ACCEPTANCE', companyId: 'tp', ladder, ownBuyLineCents: null })).toBe(0)
  })

  it('the assert route no longer carries the note that the fix was reverted', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/timesheets/[id]/assert/route.ts'), 'utf8')
    expect(route).not.toMatch(/tried and reverted/)
    expect(route).toMatch(/signatureRateCents/)
  })
})
