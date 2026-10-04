import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { billedElsewhere, alreadyOnABill } from '@/lib/money/billed-elsewhere'

/**
 * A bill never covers hours already on a bill to the same firm, however
 * that bill was made.
 *
 * Walked 2026-09-30 as Techpeple: Generate billed Computer Systems $16,992
 * for 144 hours, and its check said nothing had been billed before —
 * while Computer Systems already held Techpeple's invoice INV-CPRLJK for
 * Aug 29 – Sep 26, covering 120 of them. $14,160 owed twice.
 */

const eights = (days: string[]) => Object.fromEntries(days.map((d) => [d, 8]))
const helena = {
  personId: 'helena',
  personName: 'Helena Marsh',
  periodStart: '2026-08-31',
  periodEnd: '2026-09-04',
  days: eights(['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']),
}
const cprljk = {
  number: 'INV-CPRLJK',
  payerName: 'Computer Systems Inc',
  periodStart: '2026-08-29',
  periodEnd: '2026-09-26',
  personIds: ['helena'],
}

describe('a bill never covers hours already on a bill to the same firm, however that bill was made', () => {
  it('a week inside an invoice receipt the firm above recorded from us is not billed again, and the sentence names it', () => {
    const c = billedElsewhere(helena, [cprljk])
    expect(c.covered).toBe('WHOLE')
    expect(c.receipts).toEqual(['INV-CPRLJK'])
    expect(c.says).toBe(
      'Helena Marsh’s week of Aug 31 is already on invoice INV-CPRLJK, which Computer Systems Inc recorded from you, so it is not billed again.'
    )
  })

  it('a week after the receipt’s period is billed as usual', () => {
    const later = { ...helena, periodStart: '2026-09-28', periodEnd: '2026-09-30', days: eights(['2026-09-28', '2026-09-29', '2026-09-30']) }
    expect(billedElsewhere(later, [cprljk]).covered).toBe('NONE')
  })

  it('a week only partly inside a receipt is left off whole and says which days, never split by a guess', () => {
    const edge = { ...cprljk, periodEnd: '2026-09-02' }
    const c = billedElsewhere(helena, [edge])
    expect(c.covered).toBe('PART')
    expect(c.days).toEqual(['2026-08-31', '2026-09-01', '2026-09-02'])
    expect(c.says).toMatch(/^Aug 31, Sep 1, Sep 2 of Helena Marsh’s week of Aug 31 are already on invoice INV-CPRLJK/)
    expect(c.says).toMatch(/Bill the rest by hand/)
  })

  it('a receipt for somebody else’s hours does not hold this person’s week', () => {
    expect(billedElsewhere(helena, [{ ...cprljk, personIds: ['priya'] }]).covered).toBe('NONE')
  })

  it('a receipt that names nobody is read as covering, and says it cannot tell', () => {
    const c = billedElsewhere(helena, [{ ...cprljk, personIds: null }])
    expect(c.covered).toBe('WHOLE')
    expect(c.says).toMatch(/names no person, so it may hold these hours/)
  })

  it('days with no hours on them do not count as billed', () => {
    const weekend = { ...helena, days: { ...helena.days, '2026-08-30': 0 } }
    expect(billedElsewhere(weekend, [{ ...cprljk, periodStart: '2026-08-30', periodEnd: '2026-08-30' }]).covered).toBe('NONE')
  })
})

describe('an invoice receipt is refused where a bill the supplier generated here already holds its hours', () => {
  const generated = {
    number: 'IN_W1ZA7E_001',
    vendorName: 'Techpeple',
    lines: [{ personId: 'helena', personName: 'Helena Marsh', days: helena.days }],
  }

  it('recording Techpeple’s invoice for Aug 29 – Sep 26 after its generated bill holds Aug 31 – Sep 4 is refused in a sentence', () => {
    const r = alreadyOnABill({ periodStart: '2026-08-29', periodEnd: '2026-09-26', personIds: ['helena'] }, [generated])
    expect(r?.bills).toEqual(['IN_W1ZA7E_001'])
    expect(r?.says).toBe(
      'Helena Marsh’s hours for Aug 31 – Sep 4 are already on Techpeple’s bill IN_W1ZA7E_001, so recording this invoice would owe them twice. ' +
        'Pay that bill, or ask Techpeple to cancel it first.'
    )
  })

  it('an invoice receipt for a later period is recorded as usual', () => {
    expect(alreadyOnABill({ periodStart: '2026-09-05', periodEnd: '2026-09-26', personIds: ['helena'] }, [generated])).toBeNull()
  })

  it('an invoice receipt for another person on another line is recorded as usual', () => {
    expect(alreadyOnABill({ periodStart: '2026-08-29', periodEnd: '2026-09-26', personIds: ['priya'] }, [generated])).toBeNull()
  })
})

describe('both doors ask', () => {
  const src = (p: string) => readFileSync(join(__dirname, '..', '..', 'src', p), 'utf8')

  it('bill generation reads the invoice receipts the payer recorded from us before it bills a week', () => {
    const gen = src('app/api/invoices/generate/route.ts')
    expect(gen).toContain('billedElsewhere(')
    expect(gen).toContain('vendorCompanyId: caller.company!.id')
  })

  it('recording an invoice receipt reads the bills the supplier generated here before it is written', () => {
    const intake = src('app/api/ap/bills/route.ts')
    expect(intake.indexOf('alreadyOnABill(')).toBeGreaterThan(-1)
    expect(intake.indexOf('alreadyOnABill(')).toBeLessThan(intake.indexOf('prisma.vendorBill.create('))
  })
})
