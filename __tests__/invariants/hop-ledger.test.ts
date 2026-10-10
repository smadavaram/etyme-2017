import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { legsOf, hopsAround, rungView, type HopRung, type PostingLeg } from '@/lib/money/hop-ledger'
import { priceSheets, type SheetToPrice } from '@/lib/money/placement-earned'
import { sameBooks, type PlannedPosting } from '@/lib/order-postings'

/**
 * Every money posting lands on one rung, at that rung's own rate.
 *
 * The outside chain audit of 2026-10-05: the client's signature on Helena
 * Marsh's week was booked to Techpeple, at the bottom of the chain, at
 * Computer Systems' $145; Computer Systems' own acceptance in the middle
 * posted nothing. The ladders below are the audit's.
 */

// Northbend Athletic ← Computer Systems ← Techpeple ← Helena Marsh (W2, $90)
const HELENA: HopRung[] = [
  { sellContractId: 'cs-sells', companyId: 'cs', clientCompanyId: 'northbend', endClientCompanyId: 'northbend', buyContractId: 'cs-buys-techpeple' },
  { sellContractId: 'tp-sells', companyId: 'techpeple', clientCompanyId: 'cs', endClientCompanyId: 'northbend', buyContractId: 'tp-pays-helena' },
]
const RATE: Record<string, number> = { 'cs-sells': 14_500, 'tp-sells': 11_800, 'cs-buys-techpeple': 11_800, 'tp-pays-helena': 9_000 }

// The audit's acceptance test: client ← prime $150 ← sub $130 ← bench $115 ← candidate W2 $90.
const FOUR: HopRung[] = [
  { sellContractId: 'prime-sells', companyId: 'prime', clientCompanyId: 'client', endClientCompanyId: null, buyContractId: 'prime-buys' },
  { sellContractId: 'sub-sells', companyId: 'sub', clientCompanyId: 'prime', endClientCompanyId: 'client', buyContractId: 'sub-buys' },
  { sellContractId: 'bench-sells', companyId: 'bench', clientCompanyId: 'sub', endClientCompanyId: 'client', buyContractId: 'bench-pays' },
]
const FOUR_RATE: Record<string, number> = {
  'prime-sells': 15_000, 'prime-buys': 13_000,
  'sub-sells': 13_000, 'sub-buys': 11_500,
  'bench-sells': 11_500, 'bench-pays': 9_000,
}

/** A week priced the way the books price it: hours times the rate on the line each leg lands on. */
function book(ladder: HopRung[], rates: Record<string, number>, signatures: { companyId: string; role: string }[], hours = 40) {
  const by = new Map<string, { revenue: number; cost: number }>()
  const at = (c: string) => by.get(c) ?? (by.set(c, { revenue: 0, cost: 0 }), by.get(c)!)
  for (const s of signatures) {
    for (const leg of legsOf(s, ladder).legs) {
      if (leg.kind === 'REVENUE') at(leg.companyId).revenue += hours * rates[leg.sellContractId]
      else at(leg.companyId).cost += hours * rates[leg.buyContractId!]
    }
  }
  return by
}

describe('the client’s signature is revenue at the top, at the top rung’s own rate', () => {
  it('Northbend’s signature is revenue to Computer Systems, never to Techpeple', () => {
    const { legs } = legsOf({ companyId: 'northbend', role: 'CLIENT_APPROVAL' }, HELENA)
    expect(legs).toEqual([{ kind: 'REVENUE', companyId: 'cs', sellContractId: 'cs-sells', customerId: 'northbend' }])
  })

  it('on a direct placement the client’s signature and the employer’s acceptance land on the one firm, as before', () => {
    const direct: HopRung[] = [{ sellContractId: 'only', companyId: 'csi', clientCompanyId: 'harlow', endClientCompanyId: null, buyContractId: 'w2' }]
    expect(legsOf({ companyId: 'harlow', role: 'CLIENT_APPROVAL' }, direct).legs).toEqual([
      { kind: 'REVENUE', companyId: 'csi', sellContractId: 'only', customerId: 'harlow' },
    ])
    expect(legsOf({ companyId: 'csi', role: 'EMPLOYER_ACCEPTANCE' }, direct).legs).toEqual([
      { kind: 'PAY', companyId: 'csi', sellContractId: 'only', buyContractId: 'w2', customerId: 'harlow' },
    ])
  })
})

describe('a firm in the middle accepting a week', () => {
  it('is revenue to the firm below it at that firm’s own sell rate, and cost to itself at its own buy rate', () => {
    const { legs } = legsOf({ companyId: 'cs', role: 'PASS_THROUGH' }, HELENA)
    const revenue = legs.find((l) => l.kind === 'REVENUE')!
    const bought = legs.find((l) => l.kind === 'BOUGHT') as Extract<PostingLeg, { kind: 'BOUGHT' }>
    expect(revenue).toMatchObject({ companyId: 'techpeple', sellContractId: 'tp-sells' })
    expect(bought).toMatchObject({ companyId: 'cs', sellContractId: 'cs-sells', buyContractId: 'cs-buys-techpeple' })
  })

  it('Techpeple’s earned margin on Helena Marsh is on its own $118, never Computer Systems’ $145', () => {
    const week = book(HELENA, RATE, [
      { companyId: 'northbend', role: 'CLIENT_APPROVAL' },
      { companyId: 'cs', role: 'PASS_THROUGH' },
      { companyId: 'techpeple', role: 'EMPLOYER_ACCEPTANCE' },
    ])
    expect(week.get('techpeple')).toEqual({ revenue: 40 * 11_800, cost: 40 * 9_000 })
    expect(week.get('cs')).toEqual({ revenue: 40 * 14_500, cost: 40 * 11_800 })
  })
})

describe('the employer’s acceptance is pay at hop 0', () => {
  it('only the firm that employs the person posts pay, and anybody else’s acceptance posts nothing, in a sentence', () => {
    expect(legsOf({ companyId: 'techpeple', role: 'EMPLOYER_ACCEPTANCE' }, HELENA).legs).toEqual([
      { kind: 'PAY', companyId: 'techpeple', sellContractId: 'tp-sells', buyContractId: 'tp-pays-helena', customerId: 'cs' },
    ])
    const stranger = legsOf({ companyId: 'cs', role: 'EMPLOYER_ACCEPTANCE' }, HELENA)
    expect(stranger.legs).toEqual([])
    expect(stranger.says).toMatch(/Only the firm that employs the person/)
  })
})

describe('the audit’s acceptance test, four hops', () => {
  it('a four-rung chain posts the audit’s table: prime $6,000 against $5,200, sub $5,200 against $4,600, bench $4,600 against $3,600', () => {
    const week = book(FOUR, FOUR_RATE, [
      { companyId: 'client', role: 'CLIENT_APPROVAL' },
      { companyId: 'prime', role: 'PASS_THROUGH' },
      { companyId: 'sub', role: 'PASS_THROUGH' },
      { companyId: 'bench', role: 'EMPLOYER_ACCEPTANCE' },
    ])
    expect(week.get('prime')).toEqual({ revenue: 600_000, cost: 520_000 })
    expect(week.get('sub')).toEqual({ revenue: 520_000, cost: 460_000 })
    expect(week.get('bench')).toEqual({ revenue: 460_000, cost: 360_000 })
    // The client keeps no books here, and nothing posts to it.
    expect(week.has('client')).toBe(false)
  })

  it('no posting is written at another rung’s rate: every leg names the line it lands on, and that line is the posting firm’s own', () => {
    const owner = (line: string) =>
      FOUR.find((r) => r.sellContractId === line)?.companyId ?? FOUR.find((r) => r.buyContractId === line)?.companyId
    for (const s of [
      { companyId: 'client', role: 'CLIENT_APPROVAL' },
      { companyId: 'prime', role: 'PASS_THROUGH' },
      { companyId: 'sub', role: 'PASS_THROUGH' },
      { companyId: 'bench', role: 'EMPLOYER_ACCEPTANCE' },
    ]) {
      for (const leg of legsOf(s, FOUR).legs) {
        expect(owner(leg.sellContractId)).toBe(leg.companyId)
        if (leg.kind !== 'REVENUE') expect(owner(leg.buyContractId!)).toBe(leg.companyId)
      }
    }
  })

  it('a client whose rung is not linked to the hours is refused a posting rather than given the bottom firm’s books', () => {
    // Computer Systems' line was never linked: the ladder is Techpeple's line alone.
    const broken = [HELENA[1]]
    const r = legsOf({ companyId: 'northbend', role: 'CLIENT_APPROVAL' }, broken)
    expect(r.legs).toEqual([])
    expect(r.says).toMatch(/not linked/)
  })
})

describe('a rung reads how many hops lie above and below it, and no rate of theirs', () => {
  it('a rung reads how many hops lie above and below it', () => {
    expect(hopsAround('client', FOUR)).toMatchObject({ hopsAbove: 0, hopsBelow: 3 })
    expect(hopsAround('prime', FOUR)).toMatchObject({ hopsAbove: 0, hopsBelow: 2 })
    expect(hopsAround('sub', FOUR)).toMatchObject({ hopsAbove: 1, hopsBelow: 1 })
    expect(hopsAround('bench', FOUR)).toMatchObject({ hopsAbove: 2, hopsBelow: 0 })
    expect(hopsAround('stranger', FOUR)).toBeNull()
  })

  it('and the answer carries counts and its own two lines, never a rate', () => {
    const at = hopsAround('sub', FOUR)!
    expect(Object.keys(at).sort()).toEqual(['buys', 'hopsAbove', 'hopsBelow', 'sells'])
    expect(at).toEqual({ sells: 'sub-sells', buys: 'bench-sells', hopsAbove: 1, hopsBelow: 1 })
  })
})

describe('a week as one rung sees it', () => {
  const sigs = [
    { companyId: 'northbend', role: 'CLIENT_APPROVAL', hours: 40, rateCents: 14_500 },
    { companyId: 'cs', role: 'PASS_THROUGH', hours: 38, rateCents: 11_800 },
    { companyId: 'techpeple', role: 'EMPLOYER_ACCEPTANCE', hours: 38, rateCents: 9_000 },
  ]

  it('Techpeple is billed on what Computer Systems accepted, not on what the client signed', () => {
    const seen = rungView(HELENA[1], HELENA, sigs)
    expect(seen).toEqual([
      { companyId: 'cs', role: 'CLIENT_APPROVAL', hours: 38, rateCents: 11_800 },
      { companyId: 'techpeple', role: 'EMPLOYER_ACCEPTANCE', hours: 38, rateCents: 9_000 },
    ])
  })

  it('Computer Systems is billed on Northbend’s signature and costed on its own acceptance; Techpeple’s pay is never in its view', () => {
    const seen = rungView(HELENA[0], HELENA, sigs)
    expect(seen.map((a) => [a.companyId, a.role])).toEqual([
      ['northbend', 'CLIENT_APPROVAL'],
      ['cs', 'EMPLOYER_ACCEPTANCE'],
    ])
    expect(seen.some((a) => a.companyId === 'techpeple')).toBe(false)
  })

  it('a firm bills only the hours the firm above it accepted: 38 of 40 bills 38 at its own rate', () => {
    const d = (s: string) => new Date(`${s}T00:00:00Z`)
    const sheet: SheetToPrice = {
      periodStart: d('2026-09-06'), periodEnd: d('2026-09-12'),
      days: { '2026-09-07': 8, '2026-09-08': 8, '2026-09-09': 8, '2026-09-10': 8, '2026-09-11': 8 },
      assertions: rungView(HELENA[1], HELENA, sigs),
    }
    const priced = priceSheets({ sheets: [sheet], bill: { openingRateCents: 11_800, periods: [] }, pay: null })
    expect(priced.billedHours).toBe(38)
    expect(priced.billedCents).toBe(38 * 11_800)
  })
})

describe('rebuilding the books', () => {
  const planned = (o: Partial<PlannedPosting>): PlannedPosting => ({
    kind: 'REVENUE', companyId: 'cs', ownSellContractId: 'cs-sells', buyContractId: null, personId: 'helena',
    clientCompanyId: 'northbend', amountCents: 580_000, txCurrency: 'USD', postedAt: new Date(), says: '', ...o,
  })

  it('a posting already on the books as planned is left exactly as it is', () => {
    expect(
      sameBooks(
        [{ companyId: 'cs', kind: 'REVENUE', txAmountCents: 580_000, txCurrency: 'USD', sellContractId: 'cs-sells', buyContractId: null }],
        [planned({})]
      )
    ).toBe(true)
  })

  it('the client’s signature booked to the bottom firm at the top rate is not the same books, and is rebuilt', () => {
    expect(
      sameBooks(
        [{ companyId: 'techpeple', kind: 'REVENUE', txAmountCents: 580_000, txCurrency: 'USD', sellContractId: 'tp-sells', buyContractId: null }],
        [planned({})]
      )
    ).toBe(false)
  })

  it('a cost is compared signed, the way the books hold it', () => {
    expect(
      sameBooks(
        [{ companyId: 'cs', kind: 'PAY', txAmountCents: -472_000, txCurrency: 'USD', sellContractId: 'cs-sells', buyContractId: 'b' }],
        [planned({ kind: 'PAY', amountCents: 472_000, buyContractId: 'b' })]
      )
    ).toBe(true)
  })
})

describe('the rate on a signature is a record, not a price', () => {
  const src = readFileSync(join(process.cwd(), 'src/lib/order-postings.ts'), 'utf8')
  const plan = src.slice(src.indexOf('export async function planAssertion'), src.indexOf('async function buyLineFor'))

  it('no posting multiplies hours by the rate stored on the signature', () => {
    expect(plan).not.toMatch(/\w+\.rateCents\s*\)|\*\s*\w+\.rateCents/)
    expect(plan).toContain('priceSheets(')
  })

  it('the one reading of WorkAssertion.rateCents is written down where the books are posted', () => {
    const ledger = readFileSync(join(process.cwd(), 'src/lib/money/hop-ledger.ts'), 'utf8')
    expect(ledger).toContain('the rate on the rung the signing firm pays on, as that firm pays it')
    expect(ledger).toContain('No posting reads it')
  })
})
