/**
 * The internal order, tested against the spreadsheet it replaces.
 *
 * The 2019 sheet was one row per consultant-assignment and seventy-five
 * month columns. Every test below is a question that sheet could not
 * answer, phrased the way it was actually asked at the time.
 */

import { describe, it, expect } from 'vitest'
import {
  resultOf, live, byPerson, byCustomer, byMonth, allocate, standing,
  signed, reversalOf, monthKey, type Posting, type PostingKind,
} from '@/lib/order'

let seq = 0
function post(over: Partial<Posting> & { kind: PostingKind; amountCents: number }): Posting {
  return {
    id: `p${++seq}`,
    postedAt: new Date('2019-03-15T00:00:00Z'),
    says: 'a posting',
    ...over,
  }
}

/** Billed, and paid, for one person at one client. */
function placement(opts: {
  person: string
  client: string
  revenue: number
  pay: number
  month?: string
}): Posting[] {
  const at = new Date(`${opts.month ?? '2019-03'}-15T00:00:00Z`)
  return [
    post({
      kind: 'REVENUE', amountCents: signed('REVENUE', opts.revenue),
      personId: opts.person, personName: opts.person,
      clientCompanyId: opts.client, clientName: opts.client, postedAt: at,
    }),
    post({
      kind: 'PAY', amountCents: signed('PAY', opts.pay),
      personId: opts.person, personName: opts.person,
      clientCompanyId: opts.client, clientName: opts.client, postedAt: at,
    }),
  ]
}

// ── The two questions the sheet could not answer ────────────────────

describe('One customer with several consultants adds up', () => {

  it('six people at one client is one customer, not six unrelated rows', () => {
    // In the sheet the client lived inside the consultant's name —
    // "Vani Pasala - wipro" — so this could only be done by matching a
    // string, and nobody did.
    const ps = [
      ...placement({ person: 'vani', client: 'wipro', revenue: 960_000, pay: 720_000 }),
      ...placement({ person: 'sarath', client: 'wipro', revenue: 800_000, pay: 560_000 }),
      ...placement({ person: 'vinay', client: 'wipro', revenue: 888_000, pay: 672_000 }),
    ]
    const wipro = byCustomer(ps)
    expect(wipro).toHaveLength(1)
    expect(wipro[0].label).toBe('wipro')
    expect(wipro[0].revenueCents).toBe(960_000 + 800_000 + 888_000)
    expect(wipro[0].grossCents).toBe(2_648_000 - 1_952_000)
  })

  it('and the same postings still answer per consultant', () => {
    const ps = [
      ...placement({ person: 'vani', client: 'wipro', revenue: 960_000, pay: 720_000 }),
      ...placement({ person: 'sarath', client: 'wipro', revenue: 800_000, pay: 560_000 }),
    ]
    expect(byPerson(ps).map((s) => s.label)).toEqual(['vani', 'sarath'])
  })
})

describe('One consultant across several customers has a total', () => {

  it('a person moved from one client to another is still one person', () => {
    const ps = [
      ...placement({ person: 'prasanna', client: 'idc', revenue: 998_200, pay: 611_800, month: '2018-11' }),
      ...placement({ person: 'prasanna', client: 'att', revenue: 1_054_000, pay: 737_800, month: '2019-01' }),
    ]
    const rows = byPerson(ps)
    expect(rows).toHaveLength(1)
    expect(rows[0].revenueCents).toBe(2_052_200)
  })

  it('a rate change part way through does not fork the person in two', () => {
    // In the sheet it did. "Vinay Rao S" appears at 40.39 and again at
    // 28.80, two rows, no total between them.
    const ps = [
      ...placement({ person: 'vinay', client: 'idc', revenue: 969_360, pay: 483_840, month: '2018-05' }),
      ...placement({ person: 'vinay', client: 'idc', revenue: 692_400, pay: 484_680, month: '2018-12' }),
    ]
    expect(byPerson(ps)).toHaveLength(1)
    expect(byPerson(ps)[0].payCents).toBe(-968_520)
  })
})

// ── The rows that were not really rows ──────────────────────────────

describe('Overtime and on-call belong to the assignment, not beside it', () => {

  it('a premium posts against the same person as the base pay', () => {
    // The sheet gave "Michael R overtime" and "Varun on call" their own
    // rows, detached from the assignment that caused them.
    const ps = [
      ...placement({ person: 'michael', client: 'att', revenue: 1_088_000, pay: 870_400 }),
      post({
        kind: 'PREMIUM', amountCents: signed('PREMIUM', 30_016),
        personId: 'michael', personName: 'michael',
        clientCompanyId: 'att', clientName: 'att',
      }),
    ]
    const rows = byPerson(ps)
    expect(rows).toHaveLength(1)
    expect(rows[0].premiumCents).toBe(-30_016)
    expect(rows[0].grossCents).toBe(1_088_000 - 870_400 - 30_016)
  })
})

// ── Overhead, which sat at the bottom of the page ───────────────────

describe('Overhead is carried into the work that caused it', () => {

  const targets = [
    { key: 'wipro', label: 'wipro', revenueCents: 3_000_000, people: 3 },
    { key: 'att', label: 'att', revenueCents: 1_000_000, people: 1 },
  ]

  it('spreads a pot by share of revenue', () => {
    const a = allocate(-400_000, targets, 'REVENUE')
    expect(a.map((x) => x.amountCents)).toEqual([-300_000, -100_000])
  })

  it('spreads it by headcount when that is the fairer basis', () => {
    const a = allocate(-400_000, targets, 'HEADCOUNT')
    expect(a.map((x) => x.amountCents)).toEqual([-300_000, -100_000])
  })

  it('the parts add back to the pot exactly, to the cent', () => {
    // A cent left on the floor is how a reconciliation fails.
    const odd = [
      { key: 'a', label: 'a', revenueCents: 1, people: 1 },
      { key: 'b', label: 'b', revenueCents: 1, people: 1 },
      { key: 'c', label: 'c', revenueCents: 1, people: 1 },
    ]
    const a = allocate(-100, odd, 'REVENUE')
    expect(a.reduce((n, x) => n + x.amountCents, 0)).toBe(-100)
  })

  it('says which basis was used, because an allocated cost is an opinion', () => {
    expect(allocate(-400_000, targets, 'REVENUE')[0].says).toContain('by share of revenue')
    expect(allocate(-400_000, targets, 'HEADCOUNT')[0].says).toContain('by headcount')
  })

  it('splits evenly rather than dividing by zero, and admits it', () => {
    const none = [
      { key: 'a', label: 'a', revenueCents: 0, people: 0 },
      { key: 'b', label: 'b', revenueCents: 0, people: 0 },
    ]
    const a = allocate(-1000, none, 'REVENUE')
    expect(a.map((x) => x.amountCents)).toEqual([-500, -500])
    expect(a[0].says).toContain('nothing to weigh it by')
  })

  it('a placement can be profitable before overhead and a loss after it', () => {
    const ps = [
      ...placement({ person: 'a', client: 'x', revenue: 1_000_000, pay: 900_000 }),
      post({ kind: 'OVERHEAD', amountCents: signed('OVERHEAD', 150_000) }),
    ]
    const r = resultOf(ps)
    expect(r.grossCents).toBe(100_000)
    expect(r.netCents).toBe(-50_000)
    expect(r.says).toContain('down once')
  })
})

// ── Honesty ─────────────────────────────────────────────────────────

describe('An order with revenue and no cost says so instead of showing a perfect margin', () => {

  it('refuses a percentage where nothing says what the work cost', () => {
    const r = resultOf([post({ kind: 'REVENUE', amountCents: signed('REVENUE', 500_000) })])
    expect(r.costUnknown).toBe(true)
    expect(r.grossPct).toBeNull()
    expect(r.netPct).toBeNull()
  })

  it('says what is missing in words', () => {
    const r = resultOf([post({ kind: 'REVENUE', amountCents: signed('REVENUE', 500_000) })])
    expect(r.says).toBe('$5,000.00 billed and no cost posted against it. Nothing here can tell you what this made.')
  })

  it('an order with a cost on record is graded normally', () => {
    const r = resultOf(placement({ person: 'a', client: 'x', revenue: 1_000_000, pay: 750_000 }))
    expect(r.costUnknown).toBe(false)
    expect(r.grossPct).toBe(25)
  })
})

// ── Corrections ─────────────────────────────────────────────────────

describe('A wrong posting is cancelled, never edited', () => {

  it('a reversed posting and its reversal both drop out of the total', () => {
    const wrong = post({ kind: 'PAY', amountCents: signed('PAY', 500_000) })
    const fix = { ...reversalOf(wrong, 'wrong rate'), id: 'r1' }
    expect(live([wrong, fix])).toHaveLength(0)
    expect(resultOf([wrong, fix]).payCents).toBe(0)
  })

  it('both stay on the record, because the month may already be reported', () => {
    const wrong = post({ kind: 'PAY', amountCents: signed('PAY', 500_000) })
    const fix = { ...reversalOf(wrong, 'wrong rate'), id: 'r1' }
    expect([wrong, fix]).toHaveLength(2)
    expect(fix.says).toContain('Reverses:')
    expect(fix.says).toContain('wrong rate')
  })

  it('a correction posts to the month the money belonged to, not the month it was spotted', () => {
    const wrong = post({
      kind: 'PAY', amountCents: signed('PAY', 500_000),
      postedAt: new Date('2019-03-15T00:00:00Z'),
    })
    expect(monthKey(reversalOf(wrong, 'wrong rate').postedAt)).toBe('2019-03')
  })
})

// ── Months ──────────────────────────────────────────────────────────

describe('Adding a month is not a change to anything', () => {

  it('months come from the postings, not from columns on a sheet', () => {
    const ps = [
      ...placement({ person: 'a', client: 'x', revenue: 100_000, pay: 70_000, month: '2018-11' }),
      ...placement({ person: 'a', client: 'x', revenue: 100_000, pay: 70_000, month: '2018-12' }),
      ...placement({ person: 'a', client: 'x', revenue: 100_000, pay: 70_000, month: '2019-01' }),
    ]
    expect(byMonth(ps).map((s) => s.label)).toEqual(['Nov 2018', 'Dec 2018', 'Jan 2019'])
  })
})

// ── Signs ───────────────────────────────────────────────────────────

describe('The sign is decided once, not by whoever writes the call', () => {

  it('revenue is money in whichever way the amount was passed', () => {
    expect(signed('REVENUE', 500)).toBe(500)
    expect(signed('REVENUE', -500)).toBe(500)
  })

  it('pay, burden, commission and visa fees are money out', () => {
    for (const k of ['PAY', 'BURDEN', 'PREMIUM', 'COMMISSION', 'VISA', 'OVERHEAD'] as const) {
      expect(signed(k, 500)).toBe(-500)
      expect(signed(k, -500)).toBe(-500)
    }
  })

  it('an expense keeps the sign it was given, because it goes both ways', () => {
    // Billed on to the client is money in. Reimbursed to the person is
    // money out. Only the caller knows which.
    expect(signed('EXPENSE', 500)).toBe(500)
    expect(signed('EXPENSE', -500)).toBe(-500)
  })
})

// ── The budget ──────────────────────────────────────────────────────

describe('An order with a ceiling says where it stands before the next commitment', () => {

  it('reports what is left', () => {
    const s = standing(1_000_000, placement({ person: 'a', client: 'x', revenue: 500_000, pay: 300_000 }))
    expect(s.remainingCents).toBe(700_000)
    expect(s.says).toBe('$7,000.00 left of $10,000.00.')
  })

  it('names the overspend rather than reporting it at month end', () => {
    const s = standing(100_000, placement({ person: 'a', client: 'x', revenue: 500_000, pay: 300_000 }))
    expect(s.overBudget).toBe(true)
    expect(s.says).toBe('$2,000.00 over a $1,000.00 budget.')
  })

  it('an order with no ceiling is not silently treated as overspent', () => {
    const s = standing(null, placement({ person: 'a', client: 'x', revenue: 500_000, pay: 300_000 }))
    expect(s.overBudget).toBe(false)
    expect(s.remainingCents).toBeNull()
  })
})

// ── Two currencies ──────────────────────────────────────────────────
//
// The sheet had an "Indian salary" line. People were paid offshore in
// rupees while US clients were billed in dollars, and both belonged to
// the same project.

describe('Rupees and dollars are never added together', () => {

  it('refuses to total an order carrying two currencies', () => {
    // Conversion happens once, when the posting is written, at a rate
    // stamped on the row. If two currencies reach this function something
    // upstream stopped converting, and the sum would be a total of
    // nothing that looks perfectly reasonable on a screen.
    const mixed = [
      post({ kind: 'REVENUE', amountCents: 100_000, currency: 'USD' }),
      post({ kind: 'PAY', amountCents: -80_000, currency: 'INR' }),
    ]
    expect(() => resultOf(mixed)).toThrow(/USD and INR|INR and USD/)
  })

  it('totals happily where everything was converted on the way in', () => {
    const ps = [
      post({ kind: 'REVENUE', amountCents: 100_000, currency: 'USD', txCurrency: 'USD' }),
      post({ kind: 'PAY', amountCents: -60_000, currency: 'USD', txCurrency: 'INR', txAmountCents: -5_000_000 }),
    ]
    expect(resultOf(ps).grossCents).toBe(40_000)
  })
})

// ── Earned, and then actually settled ───────────────────────────────
//
// The sheet's second page was entirely this: "to pay 15,680 · paid
// 11,760 · diff -3,920 · date paid". Carried by hand, month after month.

describe('What was earned and what actually moved are two different numbers', () => {

  it('shows a margin on work approved before anybody has paid for it', () => {
    const r = resultOf(placement({ person: 'a', client: 'x', revenue: 1_000_000, pay: 750_000 }))
    expect(r.grossCents).toBe(250_000)
    expect(r.cashCents).toBe(0)
  })

  it('names what is still to collect and what is still owed to people', () => {
    const r = resultOf(placement({ person: 'a', client: 'x', revenue: 1_000_000, pay: 750_000 }))
    expect(r.owedToUsCents).toBe(1_000_000)
    expect(r.weOweCents).toBe(750_000)
    expect(r.cashSays).toBe('Nothing settled. $10,000.00 to collect, $7,500.00 to pay.')
  })

  it('carries a short payment to a consultant, which was the diff column', () => {
    // Owed 15,680, paid 11,760. The -3,920 was kept by hand.
    const ps = [
      post({ kind: 'REVENUE', amountCents: 2_000_000, settledCents: 2_000_000, settledAt: new Date() }),
      post({ kind: 'PAY', amountCents: -1_568_000, settledCents: -1_176_000, settledAt: new Date() }),
    ]
    const r = resultOf(ps)
    expect(r.weOweCents).toBe(392_000)
    expect(r.cashSays).toContain('$3,920.00 still owed to people')
  })

  it('a client paying late shows up as cash behind, not as a worse margin', () => {
    const ps = [
      post({ kind: 'REVENUE', amountCents: 1_000_000 }),
      post({ kind: 'PAY', amountCents: -750_000, settledCents: -750_000, settledAt: new Date() }),
    ]
    const r = resultOf(ps)
    expect(r.grossCents).toBe(250_000)
    expect(r.cashCents).toBe(-750_000)
    expect(r.owedToUsCents).toBe(1_000_000)
  })
})

// ── Back office ─────────────────────────────────────────────────────

describe('Back office, marketing and sales land on the consultants per head', () => {

  it('splits evenly, not by revenue, because admin work does not scale with a rate', () => {
    const targets = [
      { key: 'big', label: 'big biller', revenueCents: 25_000_000, people: 1 },
      { key: 'small', label: 'small biller', revenueCents: 8_000_000, people: 1 },
    ]
    const a = allocate(-2_000_000, targets)
    expect(a.map((x) => x.amountCents)).toEqual([-1_000_000, -1_000_000])
    expect(a[0].says).toContain('per head')
  })

  it('by revenue is still available where a firm wants it', () => {
    const targets = [
      { key: 'big', label: 'big biller', revenueCents: 30_000_000, people: 1 },
      { key: 'small', label: 'small biller', revenueCents: 10_000_000, people: 1 },
    ]
    const a = allocate(-2_000_000, targets, 'REVENUE')
    expect(a.map((x) => x.amountCents)).toEqual([-1_500_000, -500_000])
  })
})
