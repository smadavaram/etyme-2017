import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildExport, toCsv, missingIds, type SheetToPay } from '@/lib/payroll-export'
import type { ExemptAssertion } from '@/lib/worker-classification'

/**
 * Etyme does not run payroll and should not. What it knows is what is
 * owed and to whom — the hours, whose signature stands behind them, at
 * what rate — which is the part the provider cannot work out.
 *
 * A payroll file is acted on. It becomes a bank transfer, usually the
 * same week, and nobody reads it first. Three things were wrong with the
 * one this produced, and all three would have reached a bank:
 *
 *   it paid people the rate the CLIENT is billed, not their own;
 *   it called everybody a W2, so a company could be paid as a person;
 *   it valued every hour flat, so a 45-hour week billed at a premium was
 *   paid without one and the employer silently owed the difference.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`)

const week = (over: Partial<SheetToPay['weeks'][number]> = {}) => ({
  weekOf: '2026-08-03',
  regularHours: 40,
  leaveHours: 0,
  overHours: 0,
  client: { treatment: null, appliedBps: null },
  ...over,
})

const nonexempt: ExemptAssertion = {
  status: 'NONEXEMPT',
  basis: null,
  assertedByCompanyId: 'co-1',
  assertedByCompanyName: 'Brightmoor',
  assertedByName: 'Renata Kowal',
  assertedAt: d('2026-07-01'),
  note: null,
  reviewBy: null,
}

const exempt: ExemptAssertion = {
  ...nonexempt,
  status: 'EXEMPT',
  basis: 'COMPUTER',
  note: 'Writes and tests systems software to their own design; no timekeeping duties.',
}

function row(over: Partial<SheetToPay> = {}): SheetToPay {
  return {
    personName: 'Rohan Menon',
    payrollId: 'E10041',
    contractType: 'W2',
    weAreTheEmployer: true,
    periodStart: d('2026-08-01'),
    periodEnd: d('2026-08-15'),
    weeks: [week(), week({ weekOf: '2026-08-10' })],
    submittedHours: 80,
    acceptedHours: null,
    employerAcceptedAt: d('2026-08-16'),
    payRateCents: 7800,
    payModel: 'FIXED_HOURLY',
    paidOnSalaryBasis: false,
    rule: 'US_FLSA',
    assertion: null,
    currency: 'USD',
    costCode: 'EA-4100',
    orderNumber: 'SO-2026-014',
    employerName: 'Brightmoor',
    clientName: 'Northbend Athletic',
    ...over,
  }
}

describe('what goes in the file', () => {
  it('pays the rate on the buy contract, and never the rate the client is billed', () => {
    // This is the defect that mattered most: `rateCents` was the sell
    // contract's bill rate, so every file paid consultants what the
    // client was charged for them.
    const e = buildExport('ADP', [row({ payRateCents: 9_600 })])
    expect(e.lines[0].rateCents).toBe(9_600)
    expect(e.totalCents).toBe(80 * 9_600)
  })

  it('leaves somebody off rather than paying them at the rate the client was charged', () => {
    const e = buildExport('ADP', [row({ payRateCents: null })])
    expect(e.lines).toHaveLength(0)
    expect(e.skipped[0].why).toContain('what the client is billed for them is not their wage')
    expect(e.skipped[0].action).toContain('Put a pay rate on')
  })

  it('exports the accepted hours, not the submitted ones', () => {
    const e = buildExport('ADP', [row({ submittedHours: 80, acceptedHours: 76 })])
    expect(e.lines[0].hours).toBe(76)
  })

  it('falls back to submitted where the employer accepted them as they were', () => {
    expect(buildExport('ADP', [row()]).lines[0].hours).toBe(80)
  })

  it('takes the hours an employer struck out off the ordinary hours, never off the premium', () => {
    // 45 hours in the second week, 5 of them over the line and priced at
    // time and a half. The employer accepts 82 of the 85 filed.
    const e = buildExport('ADP', [
      row({
        weeks: [week(), week({ weekOf: '2026-08-10', regularHours: 40, overHours: 5, client: { treatment: 'PREMIUM', appliedBps: 15_000 } })],
        assertion: nonexempt,
        submittedHours: 85,
        acceptedHours: 82,
      }),
    ])
    // Three hours came off the ordinary hours; the five over the line
    // are untouched and still carry the statutory premium.
    expect(e.lines[0].hours).toBe(77)
    expect(e.lines[0].overtimeHours).toBe(5)
    expect(e.lines[0].overtimeCents).toBe(Math.round(5 * 7800 * 1.5))
  })

  it('totals the money from the hours actually going out', () => {
    const e = buildExport('ADP', [row({ acceptedHours: 76 })])
    expect(e.totalCents).toBe(76 * 7800)
    expect(e.says).toBe('1 person, 76 hours, $5,928.00 for ADP.')
  })
})

describe('a week over the line', () => {
  it('a week under the line asks nobody anything, even where nobody has said whether they are exempt', () => {
    // Almost every week is under forty hours. Refusing them all because
    // an exempt flag is blank is the rule that gets switched off in week
    // one, so the hours check runs first.
    const e = buildExport('ADP', [row({ assertion: null })])
    expect(e.lines).toHaveLength(1)
    expect(e.skipped).toHaveLength(0)
  })

  it('a week over the line on somebody nobody has classified is left off the file and named', () => {
    const e = buildExport('ADP', [
      row({ assertion: null, weeks: [week({ overHours: 5 })] }),
    ])
    expect(e.lines).toHaveLength(0)
    expect(e.skipped[0].action).toContain('whether they are exempt from overtime')
  })

  it('a nonexempt employee is owed time and a half in money, whatever the client agreed to be billed', () => {
    const e = buildExport('ADP', [
      row({
        assertion: nonexempt,
        weeks: [week({ overHours: 5, client: { treatment: 'PREMIUM', appliedBps: 15_000 } })],
      }),
    ])
    expect(e.lines[0].overtimeHours).toBe(5)
    expect(e.lines[0].overtimeCents).toBe(Math.round(5 * 7800 * 1.5))
    expect(e.lines[0].regularCents).toBe(40 * 7800)
  })

  it('a client banking overtime as time off does not reduce what a nonexempt employee is paid', () => {
    // Comp time in lieu of overtime pay is lawful for public agencies
    // only (29 U.S.C. §207(o)). The client's treatment is a billing fact
    // on a different contract.
    const e = buildExport('ADP', [
      row({
        assertion: nonexempt,
        weeks: [week({ overHours: 5, client: { treatment: 'TIME_OFF', appliedBps: 0 } })],
      }),
    ])
    expect(e.lines[0].overtimeCents).toBe(Math.round(5 * 7800 * 1.5))
    // And the file says what mirroring the client would have underpaid.
    expect(e.uncoveredPremiumCents).toBe(Math.round(5 * 7800 * 1.5))
  })

  it('a client paying the usual rate for overtime does not reduce it either', () => {
    // The same defect as time off, and the one that looks innocuous: a
    // client agreeing 1.0× does not change what the employer owes, it
    // only decides who carries the half.
    const e = buildExport('ADP', [
      row({
        assertion: nonexempt,
        weeks: [week({ overHours: 5, client: { treatment: 'SAME_RATE', appliedBps: 10_000 } })],
      }),
    ])
    expect(e.lines[0].overtimeCents).toBe(Math.round(5 * 7800 * 1.5))
    expect(e.uncoveredPremiumCents).toBe(Math.round(5 * 7800 * 0.5))
  })

  it('an employer who promised more than the law requires pays what they promised', () => {
    // Statute is a floor and not a ceiling. Double time agreed on the
    // buy contract beats time and a half, and the file says which one
    // governed rather than quietly paying the smaller.
    const e = buildExport('ADP', [
      row({
        assertion: nonexempt,
        contractPremiumBps: 20_000,
        weeks: [week({ overHours: 5, client: { treatment: 'SAME_RATE', appliedBps: 10_000 } })],
      }),
    ])
    expect(e.lines[0].overtimeCents).toBe(5 * 7800 * 2)
    expect(e.lines[0].totalCents).toBe(40 * 7800 + 5 * 7800 * 2)
    expect(e.caveats.join(' ')).toContain('their own terms govern these hours')
  })

  it('an employer who promised less than the law requires still pays the floor', () => {
    // A term is not a waiver. §207 rights cannot be bargained away.
    const e = buildExport('ADP', [
      row({
        assertion: nonexempt,
        contractPremiumBps: 10_000,
        weeks: [week({ overHours: 5, client: { treatment: 'SAME_RATE', appliedBps: 10_000 } })],
      }),
    ])
    expect(e.lines[0].overtimeCents).toBe(Math.round(5 * 7800 * 1.5))
    expect(e.caveats.join(' ')).not.toContain('their own terms govern')
  })

  it("an exempt employee's overtime is the contract's to price, and the salary caveat travels with the file", () => {
    const e = buildExport('ADP', [
      row({ assertion: exempt, weeks: [week({ overHours: 5 })] }),
    ])
    expect(e.lines[0].overtimeCents).toBe(5 * 7800)
    expect(e.caveats.join(' ')).toContain('§541.602')
    // Paid hourly while claiming an exemption is the fact that most
    // often defeats it on review, and the file says so rather than
    // quietly going along.
    expect(e.caveats.join(' ')).toContain('paid by the hour rather than on a salary')
  })

  it('the federal figure is a floor and the file says so, rather than returning a clean number nobody audits', () => {
    const e = buildExport('ADP', [
      row({ assertion: nonexempt, weeks: [week({ overHours: 5, client: { treatment: 'SAME_RATE', appliedBps: 10_000 } })] }),
    ])
    expect(e.caveats.join(' ')).toContain('§207(e)')
    expect(e.caveats.join(' ')).toContain('floor rather than the answer')
  })

  it('the whole sheet waits where one of its weeks cannot be priced', () => {
    // Paying three weeks of four and saying nothing reads as a full
    // payment to everybody, including the person being paid.
    const e = buildExport('ADP', [
      row({ assertion: null, weeks: [week(), week({ weekOf: '2026-08-10', overHours: 6 })] }),
    ])
    expect(e.lines).toHaveLength(0)
    expect(e.skipped).toHaveLength(1)
  })
})

describe('what it refuses to export', () => {
  it('a corp-to-corp consultant never lands on a wage file', () => {
    // A corporation on an ADP run is a company being paid as a person.
    const e = buildExport('ADP', [row({ contractType: 'C2C' })])
    expect(e.lines).toHaveLength(0)
    expect(e.skipped[0].why).toContain('works through their own company')
    expect(e.skipped[0].action).toBe('Settle it through accounts payable, not payroll.')
  })

  it("a sub-vendor's own employee is their employer's to pay, not ours", () => {
    const e = buildExport('ADP', [row({ weAreTheEmployer: false })])
    expect(e.lines).toHaveLength(0)
    expect(e.skipped[0].why).toContain('employed by somebody else')
  })

  it('leaves out hours nobody accepted, and names who', () => {
    // A file that quietly omits somebody is how a contractor goes unpaid
    // for a fortnight and nobody can say why.
    const e = buildExport('ADP', [row(), row({ personName: 'Sade Aluko', employerAcceptedAt: null })])
    expect(e.lines).toHaveLength(1)
    expect(e.skipped[0]).toMatchObject({
      personName: 'Sade Aluko',
      why: 'Nobody has accepted these hours for pay yet.',
    })
    expect(e.says).toMatch(/1 left out, each with a reason on the row\.$/)
  })

  it('leaves out a sheet accepted at zero', () => {
    const e = buildExport('ADP', [row({ acceptedHours: 0 })])
    expect(e.lines).toHaveLength(0)
    expect(e.skipped[0].why).toBe('Accepted at zero hours.')
  })

  it('says how many were left out when there is nothing to send', () => {
    const e = buildExport('ADP', [row({ employerAcceptedAt: null })])
    expect(e.says).toBe('Nothing to send. 1 person is left out, each for a reason on the row.')
  })

  it('says plainly when there was simply nothing', () => {
    expect(buildExport('ADP', []).says).toBe('Nothing to send. No accepted hours in this period.')
  })
})

describe('the file each provider will actually take', () => {
  it('gives hours over the line their own column on ADP, so the premium is not paid to nobody', () => {
    const csv = toCsv(buildExport('ADP', [
      row({ assertion: nonexempt, weeks: [week({ overHours: 5, client: { treatment: 'SAME_RATE', appliedBps: 10_000 } })] }),
    ]))
    expect(csv.split('\n')[0]).toBe(
      'Co Code,File #,Name,Reg Hours,O/T Hours,Rate,Period Start,Period End,Dept'
    )
    expect(csv.split('\n')[1]).toBe(',E10041,Rohan Menon,40,5,78.00,2026-08-01,2026-08-15,EA-4100')
  })

  it('writes Paychex a row per earnings code, which is how they price it', () => {
    const csv = toCsv(buildExport('PAYCHEX', [
      row({ assertion: nonexempt, weeks: [week({ overHours: 5, client: { treatment: 'PREMIUM', appliedBps: 15_000 } })] }),
    ]))
    const rows = csv.split('\n')
    expect(rows[0]).toBe(
      'Employee ID,Employee Name,Earnings Code,Hours,Rate,Amount,Pay Period End,Cost Center'
    )
    expect(rows[1]).toContain('REG')
    expect(rows[2]).toContain('OT')
    expect(rows[2]).toContain('585.00')
  })

  it('writes everything we know on the generic one', () => {
    const csv = toCsv(buildExport('GENERIC', [row()]))
    expect(csv.split('\n')[0]).toContain('overtime_amount')
    expect(csv.split('\n')[1]).toContain('SO-2026-014')
  })

  it('survives a name with a comma in it', () => {
    const csv = toCsv(buildExport('GENERIC', [row({ personName: 'Menon, Rohan' })]))
    expect(csv).toContain('"Menon, Rohan"')
  })
})

describe('before it is sent', () => {
  it('names anybody with no payroll id, because ADP drops those rows silently', () => {
    const e = buildExport('ADP', [row(), row({ personName: 'Lucia Braga', payrollId: null })])
    expect(missingIds(e)).toEqual(['Lucia Braga'])
  })

  it('says nothing when everybody has one', () => {
    expect(missingIds(buildExport('ADP', [row()]))).toEqual([])
  })
})

describe('where the employer says whether somebody is exempt', () => {
  const route = readFileSync(
    join(process.cwd(), 'src/app/api/contracts/[id]/exempt/route.ts'),
    'utf8'
  )

  it('the assertion is the employer’s own, recorded on the contract that employs them', () => {
    // Keyed on the employment relationship, so the same person can be
    // exempt at one employer and not at another.
    expect(route).toContain('buyContractId_personId')
    expect(route).toContain('employerCompanyId: contract.companyId')
    expect(route).toContain('NOT_ON_THIS_CONTRACT')
  })

  it('every refusal comes from one place, so the screen and the file cannot disagree', () => {
    // NO_BASIS_NAMED for exempt with nothing named, NEEDS_A_REASON where
    // the pay shape contradicts it, NOT_A_STATUS for a third value.
    // `checkAssertion` decides all three; this route only carries them.
    expect(route).toContain('checkAssertion({')
    expect(route).toContain('verdict.code')
    expect(route).not.toContain("=== 'EXEMPT' && !body.basis")
  })

  it('what the screen said on the day is kept with the row, so the position is re-derivable', () => {
    expect(route).toContain('screenOutcome: screen.outcome')
    expect(route).toContain('screenSays: screen.says')
    // And the screen never says exempt — it only rules exemptions out.
    expect(route).toContain('The screen only ever')
  })
})
