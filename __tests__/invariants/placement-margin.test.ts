import { describe, it, expect } from 'vitest'
import {
  spreadOn, blendedSpread, isLive, scopeSays, sellSideRate, HOURS_IN_A_MONTH,
  type Pair, type SellLine, type BuyLine,
} from '@/lib/money/placement-margin'

// ── Fixtures ──────────────────────────────────────────────────────────
//
// Marcus Whitfield's real seeded numbers, because a fixture that is the
// world's own numbers is a fixture somebody can check against a screen:
// Teleworld Solutions bills Corveldt Aerospace $142/hr and buys him from
// Nimbus Talent at $116/hr, corp-to-corp.

const sell = (over: Partial<SellLine> = {}): SellLine => ({
  id: 'sell-marcus',
  billRateCents: 14_200,
  billCurrency: 'USD',
  state: 'IN_PROGRESS',
  personId: 'p-marcus',
  personName: 'Marcus Whitfield',
  clientId: 'c-corveldt',
  clientName: 'Corveldt Aerospace',
  masterContractId: null,
  ...over,
})

const buy = (over: Partial<BuyLine> = {}): BuyLine => ({
  id: 'buy-marcus',
  payRateCents: 11_600,
  payCurrency: 'USD',
  contractType: 'C2C',
  state: 'IN_PROGRESS',
  vendorName: 'Nimbus Talent',
  masterContractId: null,
  ...over,
})

const pair = (s: Partial<SellLine> = {}, b: Partial<BuyLine> | null = {}): Pair => ({
  sell: sell(s),
  buy: b === null ? null : buy(b),
})

describe('a placement nobody tagged to anything still has a margin', () => {
  it('a firm sees the spread on a placement it never tagged to a master contract', () => {
    const s = spreadOn(pair({ masterContractId: null }, { masterContractId: null }))
    expect(s.refusedBecause).toBeNull()
    expect(s.spreadRateCents).toBe(2_600)
    expect(s.pct).toBe(18.3)
  })

  it('the spread on a placement is the bill rate less the pay rate of the buy line that funds it, and never an average of other placements rates', () => {
    // A second placement at a wildly different pair of rates must not
    // move the first one's figure by a cent.
    const mine = spreadOn(pair())
    const alongside = spreadOn(pair({ id: 'other', billRateCents: 30_000 }, { id: 'other-buy', payRateCents: 5_000 }))
    expect(mine.spreadRateCents).toBe(2_600)
    expect(alongside.spreadRateCents).toBe(25_000)
  })
})

describe('a placement with no cost behind it has no margin, not a perfect one', () => {
  it('a placement with no buy line behind it says so rather than being left out of the book', () => {
    const s = spreadOn(pair({}, null))
    expect(s.pct).toBeNull()
    expect(s.spreadRateCents).toBeNull()
    expect(s.refusedBecause).toMatch(/no buy line/i)
    expect(s.says).toMatch(/Marcus Whitfield/)
  })

  it('a hundred per cent spread is refused as a missing link and never reported as good news', () => {
    const s = spreadOn(pair({}, { payRateCents: 0 }))
    expect(s.pct).not.toBe(100)
    expect(s.pct).toBeNull()
    expect(s.refusedBecause).toMatch(/pay rate/i)
  })

  it('a placement with no bill rate agreed is refused rather than read as a total loss', () => {
    const s = spreadOn(pair({ billRateCents: 0 }))
    expect(s.pct).toBeNull()
    expect(s.refusedBecause).toMatch(/bill rate/i)
  })
})

describe('rupees and dollars are never added', () => {
  it('a placement billed in dollars and paid in rupees refuses a spread rather than subtracting one from the other', () => {
    const s = spreadOn(pair({ billCurrency: 'USD' }, { payCurrency: 'INR' }))
    expect(s.pct).toBeNull()
    expect(s.refusedBecause).toMatch(/USD/)
    expect(s.refusedBecause).toMatch(/INR/)
  })

  it('one placement in a second currency refuses the whole book rather than adding the two together', () => {
    const book = blendedSpread(
      [pair(), pair({ id: 's2', billCurrency: 'INR' }, { id: 'b2', payCurrency: 'INR' })],
      'ALL'
    )
    expect(book.pct).toBeNull()
    expect(book.billRateCents).toBeNull()
    expect(book.totalBillRateCents).toBeNull()
    expect(book.refusedBecause).toMatch(/two currencies|USD.*INR|INR.*USD/i)
  })
})

describe('a book is what the whole book agreed, not an average of averages', () => {
  it('a book spread is the blended bill rate less the blended pay rate, not the mean of each placement percentage', () => {
    // 142 and 200 billed; 116 and 100 paid. Blended: 342 − 216 = 126 on
    // 342, which is 36.8%. The mean of the two placements' own
    // percentages — 18.3% and 50.0% — is 34.2%, and that is the number
    // this refuses to print, because it gives the $142 placement and the
    // $200 one the same weight.
    const book = blendedSpread(
      [pair(), pair({ id: 's2', billRateCents: 20_000 }, { id: 'b2', payRateCents: 10_000 })],
      'ALL'
    )
    expect(book.totalBillRateCents).toBe(34_200)
    expect(book.totalPayRateCents).toBe(21_600)
    expect(book.pct).toBe(36.8)
  })

  it('one unpriced placement blanks the rate on the whole book rather than being averaged in', () => {
    const book = blendedSpread([pair(), pair({ id: 's2' }, null)], 'ALL')
    expect(book.pct).toBeNull()
    expect(book.unpriced).toBe(1)
    expect(book.says).toMatch(/1 of 2|no buy line/i)
  })

  it('a book with nothing in it says there is nothing to read rather than showing a zero', () => {
    const book = blendedSpread([], 'ALL')
    expect(book.pct).toBeNull()
    expect(book.placements).toBe(0)
    expect(book.refusedBecause).toMatch(/no placements/i)
  })
})

describe('a figure says whether it counts work that has finished', () => {
  it('a placement that has ended is counted when the book is read to date', () => {
    const ended = pair({ id: 'karthik', state: 'ENDED', billRateCents: 13_600 }, { id: 'karthik-buy', state: 'ENDED', payRateCents: 8_900, contractType: 'W2', vendorName: null })
    const book = blendedSpread([pair(), ended], 'ALL')
    expect(book.placements).toBe(2)
    expect(book.says).toMatch(/finished|to date/i)
  })

  it('a placement that has ended is left out when the book is read live, and the sentence says so', () => {
    const ended = pair({ id: 'karthik', state: 'ENDED' }, { id: 'karthik-buy', state: 'ENDED' })
    const live = [pair(), ended].filter(isLive)
    const book = blendedSpread(live, 'LIVE')
    expect(book.placements).toBe(1)
    expect(book.says).toMatch(/running now|live/i)
    expect(scopeSays('LIVE')).toMatch(/running now|live/i)
  })

  it('a placement whose buy line has ended under a sell line still running is not live, because nothing is paying for it', () => {
    expect(isLive(pair({ state: 'IN_PROGRESS' }, { state: 'ENDED' }))).toBe(false)
  })
})

describe('revenue does not need a cost', () => {
  it('a live placement with no buy line behind it is still counted as revenue, and named as having no margin', () => {
    const r = sellSideRate([pair(), pair({ id: 's2', billRateCents: 20_000 }, null)], 'LIVE')
    expect(r.totalBillRateCents).toBe(34_200)
    expect(r.withoutCost).toBe(1)
    expect(r.says).toMatch(/no buy line/i)
  })

  it('revenue counts the lines a firm sells and never the line its own supplier sells to it', () => {
    // The Teleworld case, as the route now loads it: only the firm's own
    // sell lines reach here, so its supplier's $116/hr line billing it is
    // simply not a pair. One live placement at $142/hr is $22,720 a month
    // at 160 hours, not the $41,280 the Reports page read.
    const r = sellSideRate([pair()], 'LIVE')
    expect(r.totalBillRateCents).toBe(14_200)
    expect(r.monthlyCents).toBe(14_200 * HOURS_IN_A_MONTH)
    expect(r.monthlyCents! / 100).toBe(22_720)
  })

  it('a month of hours nobody has worked is called an assumption in the sentence', () => {
    expect(sellSideRate([pair()], 'LIVE').says).toMatch(/at 160 hours each/)
  })

  it('a book billing in two currencies refuses a revenue figure rather than adding them', () => {
    const r = sellSideRate([pair(), pair({ id: 's2', billCurrency: 'INR' }, { id: 'b2', payCurrency: 'INR' })], 'ALL')
    expect(r.totalBillRateCents).toBeNull()
    expect(r.monthlyCents).toBeNull()
    expect(r.refusedBecause).toMatch(/INR/)
  })
})

describe('a rate on a screen is a rate somebody pays', () => {
  it('a book blended bill rate is the rate across the placements and never the rates added together', () => {
    // $142 and $136. The blended rate is $139, which is a rate. $278 is
    // not a rate anybody pays or is paid, and it was on the screen under
    // the label "blended bill rate" for exactly one commit.
    const book = blendedSpread([pair(), pair({ id: 's2', billRateCents: 13_600 }, { id: 'b2', payRateCents: 8_900, contractType: 'W2', vendorName: null })], 'ALL')
    expect(book.billRateCents).toBe(13_900)
    expect(book.totalBillRateCents).toBe(27_800)
    expect(book.payRateCents).toBe(10_250)
  })

  it('the percentage comes from the sums, so a large placement weighs more than a small one', () => {
    const book = blendedSpread([pair(), pair({ id: 's2', billRateCents: 13_600 }, { id: 'b2', payRateCents: 8_900 })], 'ALL')
    // (27800 - 20500) / 27800 = 26.3%, and the mean of 18.3 and 34.6 is 26.5.
    expect(book.pct).toBe(26.3)
  })

  it('a monthly run rate multiplies the rates added, because every placement bills its own hours', () => {
    const r = sellSideRate([pair(), pair({ id: 's2', billRateCents: 13_600 }, { id: 'b2' })], 'ALL')
    expect(r.totalBillRateCents).toBe(27_800)
    expect(r.billRateCents).toBe(13_900)
    expect(r.monthlyCents).toBe(27_800 * HOURS_IN_A_MONTH)
  })
})
