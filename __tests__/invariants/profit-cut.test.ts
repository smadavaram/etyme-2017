import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { bookEarned } from '@/lib/money/margin'
import { placementEarned, type SheetToPrice } from '@/lib/money/placement-earned'
import {
  CUTS, CUT_HEADING, NO_OFFICE, askAbout, cutOf, mayReadCut, periodWindow, profitCut, type CutInput,
} from '@/lib/money/profit-cut'

/**
 * Profitability as a page you can cut ("One app, two tabs", 2026-11-08).
 * Every figure is the margin service's own, added up by a key.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`)
function week(sunday: string, client: number | null, employer: number | null): SheetToPrice {
  const start = d(sunday)
  const days: Record<string, number> = {}
  for (let i = 1; i <= 5; i++) days[new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10)] = 8
  return {
    periodStart: start, periodEnd: new Date(start.getTime() + 6 * 86_400_000), days,
    assertions: [
      ...(client != null ? [{ role: 'CLIENT_APPROVAL', hours: client, rateCents: 0 }] : []),
      ...(employer != null ? [{ role: 'EMPLOYER_ACCEPTANCE', hours: employer, rateCents: 0 }] : []),
    ],
  }
}
const usd = (cents: number) => ({ openingRateCents: cents, periods: [], currency: 'USD' })
const pay = (cents: number, currency = 'USD') => ({ openingRateCents: cents, periods: [], currency, overtime: null })

const helena = placementEarned({ sheets: [week('2026-11-01', 40, 40)], bill: usd(11_800), pay: pay(9_000) })
const omar = placementEarned({ sheets: [week('2026-11-01', 40, 40), week('2026-11-08', 40, 40)], bill: usd(14_500), pay: pay(11_800) })
const rajesh = placementEarned({ sheets: [week('2026-11-01', 40, 40)], bill: usd(13_000), pay: pay(9_500) })

const row = (key: string, label: string, earned: CutInput['earned'], currency = 'USD'): CutInput => ({ key, label, currency, earned })

describe('the table the founder drew', () => {
  it('Helena Marsh’s week reads $4,720 billed, $3,600 paid and $1,120 margin, as the drawing shows', () => {
    const cut = profitCut([row('helena', 'Helena Marsh', helena)])
    expect(cut.lines[0]).toMatchObject({ label: 'Helena Marsh', billedCents: 472_000, paidCents: 360_000, marginCents: 112_000 })
    expect(cut.lines[0].marginPct).toBe(23.7)
  })

  it('billed less paid is the margin on every line, so the three columns always add up', () => {
    const cut = profitCut([row('h', 'Helena Marsh', helena), row('o', 'Omar Haddad', omar), row('r', 'Rajesh Iyer', rajesh)])
    for (const l of cut.lines) expect((l.billedCents ?? 0) - (l.paidCents ?? 0)).toBe(l.marginCents)
  })

  it('profit cut by consultant adds up to the firm’s profit', () => {
    const cut = profitCut([row('h', 'Helena Marsh', helena), row('o', 'Omar Haddad', omar), row('r', 'Rajesh Iyer', rajesh)])
    const sum = cut.lines.reduce((n, l) => n + (l.marginCents ?? 0), 0)
    expect(cut.total!.marginCents).toBe(sum)
    expect(cut.total!.billedCents).toBe(cut.lines.reduce((n, l) => n + (l.billedCents ?? 0), 0))
  })

  it('the firm’s total is the same figure the margin service gives the whole book, so the cut is never a second computation', () => {
    const earned = [helena, omar, rajesh]
    const cut = profitCut(earned.map((e, i) => row(String(i), String(i), e)))
    const book = bookEarned(earned.map((e) => ({ earned: e, currency: 'USD' })))
    expect(cut.total!.marginCents).toBe(book.marginCents)
    expect(cut.total!.billedCents).toBe(book.marginRevenueCents)
    expect(cut.total!.marginPct).toBe(book.pct)
  })

  it('cut by client, two consultants at one client read as one line with both their margins', () => {
    const cut = profitCut([
      row('northbend', 'Northbend Athletic', helena), row('northbend', 'Northbend Athletic', rajesh), row('cav', 'Cavanaugh Glassworks', omar),
    ])
    const nb = cut.lines.find((l) => l.key === 'northbend')!
    expect(nb.placements).toBe(2)
    expect(nb.marginCents).toBe(helena.marginCents! + rajesh.marginCents!)
  })

  it('the biggest margin is on the first line, and a blank margin sorts last because unknown is not small', () => {
    const none = placementEarned({ sheets: [week('2026-11-01', 40, 40)], bill: usd(12_000), pay: null })
    const cut = profitCut([row('h', 'Helena Marsh', helena), row('o', 'Omar Haddad', omar), row('x', 'Nobody priced', none)])
    expect(cut.lines[0].label).toBe('Omar Haddad')
    expect(cut.lines[cut.lines.length - 1].label).toBe('Nobody priced')
  })

  it('the heading says the margin is before admin cost and commission', () => {
    expect(CUT_HEADING).toBe('Margin before admin cost and commission')
  })
})

describe('refusing rather than fabricating', () => {
  it('a placement with no cost behind it blanks its line’s margin instead of reading as a perfect one', () => {
    const none = placementEarned({ sheets: [week('2026-11-01', 40, 40)], bill: usd(12_000), pay: null })
    const cut = profitCut([row('c', 'Client A', helena), row('c', 'Client A', none)])
    expect(cut.lines[0].marginCents).toBeNull()
    expect(cut.lines[0].marginPct).toBeNull()
    expect(cut.lines[0].paidCents).toBeNull()
    expect(cut.lines[0].blankedBecause).toContain('no cost on record')
  })

  it('one unpriced placement blanks the firm’s total margin rather than being averaged in', () => {
    const none = placementEarned({ sheets: [week('2026-11-01', 40, 40)], bill: usd(12_000), pay: null })
    const cut = profitCut([row('h', 'Helena Marsh', helena), row('x', 'Somebody', none)])
    expect(cut.total!.marginCents).toBeNull()
    expect(cut.total!.marginPct).toBeNull()
  })

  it('rupees and dollars are never added: a line billed in two currencies has no figures, and says why', () => {
    const inr = placementEarned({ sheets: [week('2026-11-01', 40, 40)], bill: { openingRateCents: 300_000, periods: [], currency: 'INR' }, pay: pay(200_000, 'INR') })
    const cut = profitCut([row('c', 'Client A', helena), row('c', 'Client A', inr, 'INR')])
    expect(cut.lines[0]).toMatchObject({ billedCents: null, marginCents: null, currency: null })
    expect(cut.lines[0].blankedBecause).toContain('two currencies are never added')
  })

  it('a placement billed in one currency and paid in another has no margin on its line', () => {
    const crossed = placementEarned({ sheets: [week('2026-11-01', 40, 40)], bill: usd(12_000), pay: pay(500_000, 'INR') })
    expect(crossed.marginBlankedBy).toBe('CURRENCY')
    const cut = profitCut([row('x', 'Crossed', crossed)])
    expect(cut.lines[0].marginCents).toBeNull()
  })

  it('a week the client approved and the employer has not accepted is left out of the margin and said in words', () => {
    const waiting = placementEarned({ sheets: [week('2026-11-01', 40, 40), week('2026-11-08', 40, null)], bill: usd(11_800), pay: pay(9_000) })
    const cut = profitCut([row('h', 'Helena Marsh', waiting)])
    expect(cut.lines[0].billedCents).toBe(472_000)
    expect(cut.lines[0].weeksAwaitingPay).toBe(1)
    expect(cut.says).toContain('1 week the client approved is not yet accepted for pay')
  })

  it('a placement that did no work in the period is not a line of it', () => {
    const idle = placementEarned({ sheets: [], bill: usd(11_800), pay: null })
    const cut = profitCut([row('h', 'Helena Marsh', helena), row('i', 'Idle', idle)])
    expect(cut.lines.map((l) => l.label)).toEqual(['Helena Marsh'])
    expect(cut.total!.marginCents).toBe(112_000)
  })

  it('a period with no signed hours says so in a sentence and draws no total', () => {
    const cut = profitCut([])
    expect(cut.total).toBeNull()
    expect(cut.says).toBe('No hours were signed in this period, so nothing has a margin yet.')
  })
})

describe('who reads it', () => {
  it('a client cannot read a supplier’s margin', () => {
    expect(mayReadCut({ kind: 'CLIENT' })).toContain('a client never reads it')
  })

  it('a supplier reads its own cut, and the route still asks for the margin permission first', () => {
    expect(mayReadCut({ kind: 'VENDOR' })).toBeNull()
    const route = readFileSync(join(process.cwd(), 'src/app/api/profitability/route.ts'), 'utf8')
    expect(route.indexOf("'margin.read'")).toBeLessThan(route.indexOf("by === 'cut'"))
  })
})

describe('the cuts and the periods', () => {
  it('the record cannot cut by recruiter yet, so recruiter is said in a sentence and never computed', () => {
    const recruiter = CUTS.find((c) => c.key === 'recruiter')!
    expect(recruiter.cannotBecause).toContain('No placement records who recruited it')
    expect(CUTS.filter((c) => !c.cannotBecause).map((c) => c.label)).toEqual(['Consultant', 'Office', 'Client'])
  })

  it('a line with no office on its contract reads under its own heading, so the office cut still adds up to the firm', () => {
    expect(NO_OFFICE).toBe('Not set on the contract')
    const cut = profitCut([row('none', NO_OFFICE, helena), row('u1', 'Portland practice', omar)])
    expect(cut.total!.marginCents).toBe(helena.marginCents! + omar.marginCents!)
  })

  it('an unknown cut reads as by consultant', () => {
    expect(cutOf('nonsense')).toBe('consultant')
    expect(cutOf('Client')).toBe('client')
  })

  it('this month is the calendar month, and a quarter is its three calendar months', () => {
    const m = periodWindow('month', d('2026-11-08'))
    expect(m.from.toISOString().slice(0, 10)).toBe('2026-11-01')
    expect(m.to.toISOString().slice(0, 10)).toBe('2026-12-01')
    expect(m.says).toBe('November 2026')
    const q = periodWindow('quarter', d('2026-11-08'))
    expect(q.from.toISOString().slice(0, 10)).toBe('2026-10-01')
    expect(q.to.toISOString().slice(0, 10)).toBe('2027-01-01')
    expect(q.says).toBe('October to December 2026')
  })

  it('the quarter of a December day ends on the first of January of the next year', () => {
    expect(periodWindow('quarter', d('2026-12-31')).to.toISOString().slice(0, 10)).toBe('2027-01-01')
  })

  it('“Ask about this table” opens Ask Etyme with a question about the cut on the screen', () => {
    expect(askAbout('client', 'quarter')).toBe('Which client made us the most this quarter?')
    expect(askAbout('consultant', 'month')).toBe('Which consultant made us the most this month?')
    const table = readFileSync(join(process.cwd(), 'src/app/dashboard/profitability/cut-table.tsx'), 'utf8')
    expect(table).toContain('/dashboard/conversations?ask=')
  })
})
