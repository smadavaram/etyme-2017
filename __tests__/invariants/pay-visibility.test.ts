import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { rolesFor } from '@/lib/company-defaults'
import {
  payFiguresFor, payTrail, mayReadPayOf, PAY_WITHHELD_SAYS, READS_PAY,
} from '@/lib/money/pay-visibility'

/**
 * Who reads what a person is paid, on the buy lines list.
 *
 * Found 2026-09-30: `GET /api/contracts?side=buy` gave every buy line's
 * pay rate to any staff seat, so Karthik Menon — a delivery engineer at
 * Teleworld who reads assignments and timesheets and no money — could
 * read what Teleworld pays each of his colleagues.
 */

const perms = (kind: 'VENDOR' | 'GSI', name: string) => {
  const r = rolesFor(kind).find((x) => x.name === name)
  if (!r) throw new Error(`${name} is not a ${kind} role`)
  return r.permissions as string[]
}

const KARTHIK = { permissions: ['assignments.read', 'timesheets.read'], personId: 'karthik' }
const PAYROLL = { permissions: perms('GSI', 'AP & Payroll'), personId: 'desmond' }

const AMARA = { personId: 'amara', payRate: 9_500 }
const FELIX = { personId: 'felix', payRate: 8_800 }
const KARTHIKS_OWN = { personId: 'karthik', payRate: 9_000 }

describe('a pay rate is read by the desks that run pay, and by the person it pays', () => {
  it("a delivery engineer cannot read a colleague's pay from the buy contracts list", () => {
    const line = payFiguresFor(KARTHIK, [AMARA])
    expect(line.payRate).toBeNull()
    expect(line.candidates[0].payRate).toBeNull()
    expect(line.candidates[0].payWithheld).toBe(true)
    expect(line.withheld).toBe(true)
  })

  it('the payroll desk still reads every pay line it runs', () => {
    const one = payFiguresFor(PAYROLL, [AMARA])
    expect(one.payRate).toBe(9_500)
    const shared = payFiguresFor(PAYROLL, [AMARA, FELIX])
    expect(shared.payRateMin).toBe(8_800)
    expect(shared.payRateMax).toBe(9_500)
    expect(shared.withheld).toBe(false)
  })

  it('a worker who is also staff reads their own pay line and nobody else’s', () => {
    expect(payFiguresFor(KARTHIK, [KARTHIKS_OWN]).payRate).toBe(9_000)
    const shared = payFiguresFor(KARTHIK, [KARTHIKS_OWN, AMARA])
    expect(shared.candidates.find((c) => c.personId === 'karthik')!.payRate).toBe(9_000)
    expect(shared.candidates.find((c) => c.personId === 'amara')!.payRate).toBeNull()
  })

  it('a shared buy line with one pay figure withheld shows no pay range rather than a range over the rest', () => {
    const shared = payFiguresFor(KARTHIK, [KARTHIKS_OWN, AMARA, FELIX])
    expect(shared.payRateMin).toBeNull()
    expect(shared.payRateMax).toBeNull()
  })

  it('the account manager, HR, the recruiter and the delivery manager do not read pay; AP & Payroll, Finance and the owner do', () => {
    for (const kind of ['VENDOR', 'GSI'] as const) {
      for (const desk of ['Account Manager', 'HR', 'Recruiter', 'Contract Manager', 'Accounts Receivable']) {
        expect(mayReadPayOf({ permissions: perms(kind, desk), personId: 'x' }, 'y')).toBe(false)
      }
      for (const desk of ['AP & Payroll', 'Finance', 'Owner']) {
        expect(mayReadPayOf({ permissions: perms(kind, desk), personId: 'x' }, 'y')).toBe(true)
      }
    }
    expect(mayReadPayOf({ permissions: perms('GSI', 'Delivery Manager'), personId: 'x' }, 'y')).toBe(false)
  })

  it('the line is still listed with everything but the pay, and the sentence names the desks that read pay, never the permission key', () => {
    const line = payFiguresFor(KARTHIK, [{ ...AMARA, startDate: '2026-01-05', state: 'ACTIVE' }])
    expect(line.candidates[0]).toMatchObject({ personId: 'amara', startDate: '2026-01-05', state: 'ACTIVE' })
    expect(PAY_WITHHELD_SAYS).toContain('AP & Payroll')
    expect(PAY_WITHHELD_SAYS).not.toContain(READS_PAY)
  })
})

describe('every pay figure withheld or shown is on the trail', () => {
  it('every withheld pay figure is a refusal on the trail and every figure shown to somebody else is a read, each person once', () => {
    const t = payTrail(KARTHIK, [AMARA, FELIX, AMARA, KARTHIKS_OWN])
    expect(t.refused.sort()).toEqual(['amara', 'felix'])
    expect(t.read).toEqual([])
    const p = payTrail(PAYROLL, [AMARA, FELIX])
    expect(p.read.sort()).toEqual(['amara', 'felix'])
    expect(p.refused).toEqual([])
  })

  it('a person reading their own pay line is not logged as reading somebody else', () => {
    const t = payTrail(KARTHIK, [KARTHIKS_OWN])
    expect(t).toEqual({ refused: [], read: [] })
  })
})

describe('the routes in money that print a pay figure ask the rule first', () => {
  it('the buy contracts list, the purchase order lines and the overtime-exemption screen each read pay through the one rule', () => {
    for (const f of [
      'src/app/api/contracts/route.ts',
      'src/app/api/purchase-orders/route.ts',
      'src/app/api/contracts/[id]/exempt/route.ts',
    ]) {
      expect(readFileSync(f, 'utf8'), f).toMatch(/pay-visibility/)
    }
  })

  it('the payroll file asks for the payroll desk before it writes anybody’s wages', () => {
    const src = readFileSync('src/app/api/payroll/export/route.ts', 'utf8')
    expect(src).toMatch(/hasPermission\(caller\.permissions, 'payroll\.read'\)/)
  })
})
