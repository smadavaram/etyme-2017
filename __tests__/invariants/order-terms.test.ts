import { describe, it, expect } from 'vitest'
import { termsFor, periodTermsFor, ORDER_HEADER_SELECT } from '@/lib/money/order-terms'
import { periodFor } from '@/lib/periods'
import { resolveBillingTerms } from '@/lib/billing-cascade'

/**
 * A purchase order is a header and its lines. Six fields sat on both and
 * nothing reconciled them; these are the sentences that say which copy
 * answers, and why it is not the same answer for all six.
 */

const day = (iso: string) => new Date(`${iso}T00:00:00Z`)

/** A placement on an order the client raised, billed weekly, net 45. */
const lineOnAnOrder = {
  startDate: day('2026-03-02'),
  endDate: day('2026-09-30'),
  // What the line's own columns say — the copy that used to be read.
  billFrequency: 'MONTHLY',
  billAnchor: 'CALENDAR',
  billStraddle: 'SPLIT',
  paymentTerms: 30,
  paymentTermsFrom: 'PERIOD_END',
  workOrder: {
    id: 'wo_1',
    number: 'PO-2026-4417',
    billFrequency: 'WEEKLY',
    billAnchor: 'CONTRACT_START',
    billStraddle: 'TO_LATER',
    paymentTerms: 45,
    startDate: day('2026-01-01'),
    endDate: day('2026-12-31'),
  },
}

describe('a line reads its terms from the document it is on', () => {

  it('a line reads its billing rhythm from the document it is on', () => {
    const t = termsFor('SELL', lineOnAnOrder)
    expect(t.frequency).toBe('WEEKLY')
    expect(t.from.frequency).toBe('ORDER')
    expect(t.orderNumber).toBe('PO-2026-4417')
  })

  it('net days come from the document where it has them, and from the line where it does not', () => {
    expect(termsFor('SELL', lineOnAnOrder).paymentTermsDays).toBe(45)
    expect(termsFor('SELL', lineOnAnOrder).from.paymentTermsDays).toBe('ORDER')

    const noDaysOnTheOrder = {
      ...lineOnAnOrder,
      workOrder: { ...lineOnAnOrder.workOrder, paymentTerms: null },
    }
    expect(termsFor('SELL', noDaysOnTheOrder).paymentTermsDays).toBe(30)
    expect(termsFor('SELL', noDaysOnTheOrder).from.paymentTermsDays).toBe('LINE')
  })

  it('net zero days on a document is a term and not a silence', () => {
    // Due on the anchor itself is a real arrangement. Treating zero as
    // "nobody said" would quietly push the client to net 30.
    const dueOnReceipt = {
      ...lineOnAnOrder,
      workOrder: { ...lineOnAnOrder.workOrder, paymentTerms: 0 },
    }
    expect(termsFor('SELL', dueOnReceipt).paymentTermsDays).toBe(0)
    expect(termsFor('SELL', dueOnReceipt).from.paymentTermsDays).toBe('ORDER')
  })

  it('a line with no document reads its own, so nothing written before today moves', () => {
    const { workOrder, ...onItsOwn } = lineOnAnOrder
    const t = termsFor('SELL', onItsOwn)
    expect(t.frequency).toBe('MONTHLY')
    expect(t.anchor).toBe('CALENDAR')
    expect(t.straddle).toBe('SPLIT')
    expect(t.paymentTermsDays).toBe(30)
    expect(t.from.frequency).toBe('LINE')
    expect(t.orderId).toBeNull()
  })

  it('a line that says nothing and has no document is billed the way it was already being billed', () => {
    // The columns are not nullable and their defaults are these three.
    // A caller that selected none of them must not get a different answer
    // from the one the database would have given.
    const t = termsFor('SELL', { startDate: day('2026-03-02') })
    expect([t.frequency, t.anchor, t.straddle]).toEqual(['MONTHLY', 'CALENDAR', 'SPLIT'])
    expect(t.from.frequency).toBe('DEFAULT')
  })

  it('a W2 line has no document and is paid on its own terms, as it always was', () => {
    // You do not raise a purchase order to your own employee, so
    // `BuyContract.workOrderId` is null on roughly half of them.
    const w2 = {
      startDate: day('2026-03-02'),
      endDate: day('2026-09-30'),
      payFrequency: 'SEMIMONTHLY',
      payAnchor: 'CALENDAR',
      payStraddle: 'SPLIT',
      paymentTermsFrom: 'PERIOD_END',
      workOrder: null,
    }
    const t = termsFor('BUY', w2)
    expect(t.frequency).toBe('SEMIMONTHLY')
    expect(t.from.frequency).toBe('LINE')
    expect(t.orderId).toBeNull()
    expect(t.says).toBe('Paid semimonthly.')
  })

  it('a buy line reads the rhythm the document calls billing, because one document is two words for one fact', () => {
    // The order this firm raised to its sub-vendor is billed by the sub
    // on the rhythm we pay it on. The header has one set of columns and
    // they are named for the selling side.
    const subcontract = {
      startDate: day('2026-03-02'),
      endDate: day('2026-09-30'),
      payFrequency: 'MONTHLY',
      payAnchor: 'CALENDAR',
      payStraddle: 'SPLIT',
      workOrder: {
        id: 'wo_2',
        number: 'CLD-PO-2211',
        billFrequency: 'BIWEEKLY',
        billAnchor: 'CALENDAR',
        billStraddle: 'SPLIT',
        paymentTerms: 15,
        startDate: day('2026-01-01'),
        endDate: null,
      },
    }
    const t = termsFor('BUY', subcontract)
    expect(t.frequency).toBe('BIWEEKLY')
    expect(t.from.frequency).toBe('ORDER')
    expect(t.paymentTermsDays).toBe(15)
    expect(t.says).toContain('Paid biweekly, net 15 on order CLD-PO-2211.')
  })

  it("the document's words are translated into the words the period engine speaks", () => {
    // The two rows never shared a vocabulary, which is its own evidence
    // that nothing reconciled them.
    const t = termsFor('SELL', lineOnAnOrder)
    expect(t.anchor).toBe('CONTRACT')   // the header says CONTRACT_START
    expect(t.straddle).toBe('END')      // the header says TO_LATER
    expect(t.unreadable).toEqual([])

    const toEarlier = {
      ...lineOnAnOrder,
      workOrder: { ...lineOnAnOrder.workOrder, billStraddle: 'TO_EARLIER' },
    }
    // The whole week to the earlier period is the period its first day
    // falls in, which the line's vocabulary calls START.
    expect(termsFor('SELL', toEarlier).straddle).toBe('START')
  })

  it('a document billed on dates nobody has written falls back to the line and says the document could not be read', () => {
    // A milestone order in the seeded world carries billFrequency CUSTOM,
    // meaning "the dates are written out in customDates" — and nothing
    // here reads customDates. Inventing a rhythm would be a wrong Tuesday
    // nobody would ever audit.
    const milestoneOrder = {
      ...lineOnAnOrder,
      workOrder: { ...lineOnAnOrder.workOrder, billFrequency: 'CUSTOM' },
    }
    const t = termsFor('SELL', milestoneOrder)
    expect(t.frequency).toBe('MONTHLY')
    expect(t.from.frequency).toBe('LINE')
    expect(t.unreadable).toEqual(['frequency "CUSTOM"'])
    expect(t.says).toContain('which nothing here can read')
  })

  it('every one of the six says where it came from, so a wrong due date names the level to fix', () => {
    const t = termsFor('SELL', lineOnAnOrder)
    expect(t.from).toEqual({
      frequency: 'ORDER',
      anchor: 'ORDER',
      straddle: 'ORDER',
      paymentTermsDays: 'ORDER',
      paymentTermsFrom: 'LINE',
      startDate: 'LINE',
      endDate: 'LINE',
    })
  })

  it('what the payment days run from stays on the line, because the document has no column for it', () => {
    // A schema request, written down rather than faked: WorkOrder has
    // paymentTerms and no paymentTermsFrom, so half a term comes from the
    // document and half from the line until the architect adds one.
    expect(Object.keys(ORDER_HEADER_SELECT)).not.toContain('paymentTermsFrom')
    const t = termsFor('SELL', lineOnAnOrder)
    expect(t.paymentTermsFrom).toBe('PERIOD_END')
    expect(t.from.paymentTermsFrom).toBe('LINE')
  })

  it('an anchor the cascade does not recognize is refused rather than passed on', () => {
    const nonsense = { ...lineOnAnOrder, paymentTermsFrom: 'WHENEVER' }
    expect(termsFor('SELL', nonsense).paymentTermsFrom).toBeNull()
    expect(termsFor('SELL', nonsense).from.paymentTermsFrom).toBe('DEFAULT')
  })
})

describe('an order is not a person, so a line keeps its own dates', () => {

  it('a person who joins a running order keeps their own start date, because an order is not a person', () => {
    // One header for a five-person project runs the length of the
    // project; the third person on it starts in March. Reading the
    // header's start onto that line would generate months of cycles
    // before anybody worked.
    const t = termsFor('SELL', lineOnAnOrder)
    expect(t.startDate).toEqual(day('2026-03-02'))
    expect(t.endDate).toEqual(day('2026-09-30'))
    expect(t.from.startDate).toBe('LINE')
    expect(t.from.endDate).toBe('LINE')
  })

  it("the document's own window is reported beside the line's dates, so nothing has to be guessed at", () => {
    const t = termsFor('SELL', lineOnAnOrder)
    expect(t.orderWindow).toEqual({ start: day('2026-01-01'), end: day('2026-12-31') })
    expect(t.outsideOrderWindow).toBe(false)
  })

  it('a line that runs past the end of its own document says so rather than being cut short', () => {
    const runsLong = { ...lineOnAnOrder, endDate: day('2027-03-31') }
    const t = termsFor('SELL', runsLong)
    expect(t.outsideOrderWindow).toBe(true)
    // Reported, never applied. Cutting a running placement short because
    // its paper expired is a decision for a person.
    expect(t.endDate).toEqual(day('2027-03-31'))
  })

  it('a line that started before the order that authorizes it says so too', () => {
    const startedFirst = { ...lineOnAnOrder, startDate: day('2025-11-01') }
    expect(termsFor('SELL', startedFirst).outsideOrderWindow).toBe(true)
  })

  it('an open-ended line under an order that ends is not given the order’s end date', () => {
    // No end date, no cycles, is `writeCyclesFor`'s rule. Handing the
    // header's end to an open line would generate a whole series that
    // nobody asked for.
    const openEnded = { ...lineOnAnOrder, endDate: null }
    expect(termsFor('SELL', openEnded).endDate).toBeNull()
  })
})

describe('the two copies agree on everything the seeded world holds', () => {

  it('the same placement generates the same dates whether the terms are read from the header or the line, when they agree', () => {
    // Every order and line in the seeded world carries the same rhythm
    // and the same net days, so routing every reader through the helper
    // moves no date that has already been written.
    const agreeing = {
      startDate: day('2026-03-02'),
      endDate: day('2026-09-30'),
      billFrequency: 'MONTHLY',
      billAnchor: 'CALENDAR',
      billStraddle: 'SPLIT',
      paymentTerms: 45,
      paymentTermsFrom: 'PERIOD_END',
      workOrder: {
        id: 'wo_3',
        number: 'PO-SEEDED',
        billFrequency: 'MONTHLY',
        billAnchor: 'CALENDAR',
        billStraddle: 'SPLIT',
        paymentTerms: 45,
        startDate: day('2026-01-01'),
        endDate: day('2026-12-31'),
      },
    }
    const { workOrder, ...sameLineWithoutIt } = agreeing

    const withHeader = periodTermsFor('SELL', agreeing)
    const withoutHeader = periodTermsFor('SELL', sameLineWithoutIt)
    expect(withHeader).toEqual(withoutHeader)

    const asked = day('2026-06-17')
    expect(periodFor(asked, withHeader)).toEqual(periodFor(asked, withoutHeader))
    expect(termsFor('SELL', agreeing).paymentTermsDays).toBe(
      termsFor('SELL', sameLineWithoutIt).paymentTermsDays
    )
  })

  it('the day a period is counted from is the day the person started, never the day the order was raised', () => {
    // Only read when the anchor is CONTRACT — which is exactly the case
    // where reading the header's start would move every boundary.
    const t = periodTermsFor('SELL', lineOnAnOrder)
    expect(t.anchor).toBe('CONTRACT')
    expect(t.startedOn).toEqual(day('2026-03-02'))
  })
})

describe('the payment-terms cascade knows about the document', () => {

  it('payment days set on the order beat the same days copied onto the line', () => {
    const terms = resolveBillingTerms({
      company: { name: 'Cloudepa', paymentTermsDays: 30, currency: 'USD' },
      agreement: { paymentTermsDays: 60, counterpartyName: 'Talvern Medical', paymentTermsFrom: 'PERIOD_END' },
      contract: { paymentTermsDays: 30, paymentTermsFrom: 'PERIOD_END' },
      order: { paymentTermsDays: 45, number: 'PO-2026-4417' },
    })
    expect(terms.paymentTermsDays.value).toBe(45)
    expect(terms.paymentTermsDays.source).toBe('ORDER')
    expect(terms.paymentTermsDays.because).toBe('on order PO-2026-4417')
    expect(terms.paymentTermsDays.overrode).toEqual({ value: 30, source: 'CONTRACT' })
  })

  it('a placement with no order is read from its contract, then its agreement, then the platform', () => {
    const onContract = resolveBillingTerms({
      company: { name: 'Cloudepa', paymentTermsDays: 30, currency: 'USD' },
      agreement: { paymentTermsDays: 60, counterpartyName: 'Talvern Medical' },
      contract: { paymentTermsDays: 45 },
      order: null,
    })
    expect(onContract.paymentTermsDays.value).toBe(45)
    expect(onContract.paymentTermsDays.source).toBe('CONTRACT')

    const onAgreement = resolveBillingTerms({
      company: { name: 'Cloudepa', paymentTermsDays: 30, currency: 'USD' },
      agreement: { paymentTermsDays: 60, counterpartyName: 'Talvern Medical' },
      contract: null,
      order: null,
    })
    expect(onAgreement.paymentTermsDays.value).toBe(60)
    expect(onAgreement.paymentTermsDays.source).toBe('AGREEMENT')

    const onNothing = resolveBillingTerms({
      company: { name: 'Cloudepa', currency: null },
      agreement: null,
      contract: null,
      order: null,
    })
    expect(onNothing.paymentTermsDays.value).toBe(30)
    expect(onNothing.paymentTermsDays.source).toBe('PLATFORM')
  })

  it('an order that says nothing about payment days does not silently win with a blank', () => {
    const terms = resolveBillingTerms({
      company: { name: 'Cloudepa', currency: 'USD' },
      agreement: { paymentTermsDays: 60, counterpartyName: 'Talvern Medical' },
      contract: { paymentTermsDays: 45 },
      order: { paymentTermsDays: null, number: 'PO-2026-4417' },
    })
    expect(terms.paymentTermsDays.value).toBe(45)
    expect(terms.paymentTermsDays.source).toBe('CONTRACT')
  })
})
