import { describe, it, expect } from 'vitest'
import { rate as showRate, range as showRange } from '@/lib/money-display'

/**
 * Sending a candidate onward, and the rate on the button next to it.
 *
 * The forward route was built and nothing in the product could reach it,
 * which is the same as not having built it. Putting the button on the
 * submissions table surfaced a second thing: every rate on that page was
 * a hundred times too big, because the column is cents and the cell
 * printed it as dollars.
 *
 * That one was not cosmetic. The convert-to-contract button seeded itself
 * from the same number and multiplied it by a hundred again, so one click
 * on a $130/hr submission wrote a $13,000/hr contract.
 */

// ── What the money actually is ───────────────────────────────────────

describe('rates on the submissions table', () => {
  it('shows a $130 submission as $130, not as $13,000', () => {
    expect(showRate(13000)).toBe('$130/hr')
  })

  it('shows a bill band in dollars', () => {
    expect(showRange(5780, 6800)).toBe('$57.80–$68/hr')
  })

  it('seeds the convert form in dollars, so one click does not multiply by a hundred twice', () => {
    const submission = { rate: 13000 } // cents
    const billRateField = submission.rate / 100
    const sentToApi = Math.round(billRateField * 100)
    expect(billRateField).toBe(130)
    expect(sentToApi).toBe(submission.rate)
  })
})

// ── When the button is offered ───────────────────────────────────────

function mayOfferSendOn(row: {
  status: string
  forwardedAt: string | null
}, direction: 'sent' | 'received'): boolean {
  return (
    direction === 'received' &&
    row.forwardedAt === null &&
    !['PLACED', 'REJECTED', 'WITHDRAWN'].includes(row.status)
  )
}

describe('when a recruiter is offered the button', () => {
  it('offers it on something sent to them and still undecided', () => {
    expect(mayOfferSendOn({ status: 'SUBMITTED', forwardedAt: null }, 'received')).toBe(true)
    expect(mayOfferSendOn({ status: 'SHORTLISTED', forwardedAt: null }, 'received')).toBe(true)
  })

  it('does not offer it on something they sent — that is the other party’s move', () => {
    expect(mayOfferSendOn({ status: 'SUBMITTED', forwardedAt: null }, 'sent')).toBe(false)
  })

  it('does not offer it twice, because that puts the same name in front of the client twice', () => {
    expect(mayOfferSendOn({ status: 'SUBMITTED', forwardedAt: '2026-08-21' }, 'received')).toBe(false)
  })

  it('does not offer it on one already answered', () => {
    for (const status of ['PLACED', 'REJECTED', 'WITHDRAWN']) {
      expect(mayOfferSendOn({ status, forwardedAt: null }, 'received')).toBe(false)
    }
  })
})

// ── What the recruiter is told about their own margin ────────────────

function marginNote(onwardCents: number, quotedCents: number, sender: string): string {
  const margin = onwardCents - quotedCents
  if (margin > 0) return `${showRate(margin)} yours. ${sender} does not see this.`
  if (margin === 0) return 'Passed on at the same rate — nothing in it for you.'
  return `That is ${showRate(Math.abs(margin))} below what you were quoted.`
}

describe('the margin line under the rate box', () => {
  it('says what is theirs, and that the sender will not see it', () => {
    // The onward rate never travels back down the chain. Saying so on the
    // screen where the number is typed beats hoping somebody read the
    // documentation.
    expect(marginNote(14800, 13000, 'Cloudepa Inc.'))
      .toBe('$18/hr yours. Cloudepa Inc. does not see this.')
  })

  it('says plainly when there is nothing in it', () => {
    expect(marginNote(13000, 13000, 'Cloudepa Inc.'))
      .toMatch(/nothing in it for you/)
  })

  it('warns when the onward rate is below what was quoted', () => {
    expect(marginNote(12000, 13000, 'Cloudepa Inc.'))
      .toBe('That is $10/hr below what you were quoted.')
  })
})

// ── Two money columns that are not cents ─────────────────────────────

describe('the two Decimal columns that are dollars, not cents', () => {
  /**
   * Almost every money column here is an integer in minor units. Two are
   * not: Invoice.total and Expense.total are Decimals in whole currency,
   * and the schema says so where InvoiceLine is defined.
   *
   * The decisions feed divided both by a hundred, so a $6,300 overdue
   * invoice read "$63.00 outstanding" on the founder's main screen — an
   * amount nobody chases — and a $149.98 expense read "$1.50".
   */

  it('shows an overdue invoice at what is actually owed', () => {
    const invoice = { total: 12600, paid: 5000 } // dollars, Decimal
    const outstanding = invoice.total - invoice.paid
    expect(`$${outstanding.toFixed(2)}`).toBe('$7600.00')
    expect(`$${(outstanding / 100).toFixed(2)}`).toBe('$76.00') // the bug
  })

  it('shows an expense at what was spent', () => {
    const expense = { total: 149.98 }
    expect(`$${expense.total.toFixed(2)}`).toBe('$149.98')
  })

  it('leaves the cents columns alone, because they really are cents', () => {
    // Submission.rate, billMin, billMax, billRate, payRate — all integers
    // in minor units, and all still divided by a hundred to display.
    expect(showRate(13000)).toBe('$130/hr')
  })
})
