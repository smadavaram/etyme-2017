import { describe, it, expect } from 'vitest'
import { termsFor, periodTermsFor, moneyTermsFor, ORDER_HEADER_SELECT } from '@/lib/money/order-terms'
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
      currency: 'DEFAULT',
      startDate: 'LINE',
      endDate: 'LINE',
    })
    // With no agreement, the level that decided is the copy that answered.
    expect(t.source).toEqual({
      frequency: 'ORDER', anchor: 'ORDER', straddle: 'ORDER',
      paymentTermsDays: 'ORDER', paymentTermsFrom: 'LINE', currency: 'DEFAULT',
    })
    expect(t.label.paymentTermsDays).toBe('on order PO-2026-4417')
  })

  it('what the payment days run from is the order’s where the order says, and the line’s where it does not', () => {
    // The order carries the anchor since 2026-10-18, so the whole of the
    // net-days term can come from one document.
    expect(Object.keys(ORDER_HEADER_SELECT)).toContain('paymentTermsFrom')
    const t = termsFor('SELL', lineOnAnOrder)
    expect(t.paymentTermsFrom).toBe('PERIOD_END')
    expect(t.from.paymentTermsFrom).toBe('LINE')
    const orderSays = termsFor('SELL', { ...lineOnAnOrder, workOrder: { ...lineOnAnOrder.workOrder, paymentTermsFrom: 'INVOICE_DATE' } })
    expect(orderSays.paymentTermsFrom).toBe('INVOICE_DATE')
    expect(orderSays.from.paymentTermsFrom).toBe('ORDER')
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

  it('with no agreement, payment days set on the order beat the same days copied onto the line', () => {
    const terms = resolveBillingTerms({
      company: { name: 'Techpeple', paymentTermsDays: 30, currency: 'USD' },
      agreement: null,
      contract: { paymentTermsDays: 30, paymentTermsFrom: 'PERIOD_END' },
      order: { paymentTermsDays: 45, number: 'PO-2026-4417' },
    })
    expect(terms.paymentTermsDays.value).toBe(45)
    expect(terms.paymentTermsDays.source).toBe('ORDER')
    expect(terms.paymentTermsDays.because).toBe('on order PO-2026-4417')
    expect(terms.paymentTermsDays.overrode).toEqual({ value: 30, source: 'CONTRACT' })
  })

  it('a placement with no order is read from its agreement, then its contract where the contract gives a reason, then the platform', () => {
    const onContract = resolveBillingTerms({
      company: { name: 'Techpeple', paymentTermsDays: 30, currency: 'USD' },
      agreement: { paymentTermsDays: 60, counterpartyName: 'Talvern Medical' },
      contract: { paymentTermsDays: 45, differReason: 'Agreed with Talvern for this one placement' },
      order: null,
    })
    expect(onContract.paymentTermsDays.value).toBe(45)
    expect(onContract.paymentTermsDays.source).toBe('CONTRACT')

    const onAgreement = resolveBillingTerms({
      company: { name: 'Techpeple', paymentTermsDays: 30, currency: 'USD' },
      agreement: { paymentTermsDays: 60, counterpartyName: 'Talvern Medical' },
      contract: null,
      order: null,
    })
    expect(onAgreement.paymentTermsDays.value).toBe(60)
    expect(onAgreement.paymentTermsDays.source).toBe('AGREEMENT')

    const onNothing = resolveBillingTerms({
      company: { name: 'Techpeple', currency: null },
      agreement: null,
      contract: null,
      order: null,
    })
    expect(onNothing.paymentTermsDays.value).toBe(30)
    expect(onNothing.paymentTermsDays.source).toBe('PLATFORM')
  })

  it('an order that says nothing about payment days does not silently win with a blank', () => {
    const terms = resolveBillingTerms({
      company: { name: 'Techpeple', currency: 'USD' },
      agreement: null,
      contract: { paymentTermsDays: 45 },
      order: { paymentTermsDays: null, number: 'PO-2026-4417' },
    })
    expect(terms.paymentTermsDays.value).toBe(45)
    expect(terms.paymentTermsDays.source).toBe('CONTRACT')
  })
})

// ── The agreement first (founder, 2026-10-18) ─────────────────────────
//
// "AR and AP is always based on the agreed MSA between client and supplier
// and supplier and subvendor/candidate." The agreement between the two
// parties on that side sets every term; an order, then a line, may differ
// only with a recorded reason.

/** Northbend Athletic's agreement with Computer Systems: monthly, net 30. */
const NORTHBEND_AGREEMENT = {
  id: 'msa_nb',
  billFrequency: 'MONTHLY',
  billAnchor: 'CALENDAR',
  billStraddle: 'SPLIT',
  paymentTerms: 30,
  paymentTermsFrom: 'PERIOD_END',
  currency: 'USD',
  client: { name: 'Northbend Athletic' },
  vendor: { name: 'Computer Systems Inc' },
}

describe('billing and paying follow the agreement between each pair', () => {

  it('an order’s net 15 with no reason does not beat the agreement’s net 30', () => {
    const line = {
      ...lineOnAnOrder,
      paymentTerms: 30,
      workOrder: { ...lineOnAnOrder.workOrder, paymentTerms: 15, msa: NORTHBEND_AGREEMENT },
    }
    const t = termsFor('SELL', line)
    expect(t.paymentTermsDays).toBe(30)
    expect(t.source.paymentTermsDays).toBe('AGREEMENT')
    expect(t.label.paymentTermsDays).toBe('from your agreement with Northbend Athletic')
    expect(t.setAside).toContain(
      'Your order says net 15 but gives no reason, so your agreement with Northbend Athletic\u2019s net 30 applies.'
    )
    // And the order's weekly rhythm, with no reason, is set aside too: the
    // agreement bills monthly.
    expect(t.frequency).toBe('MONTHLY')
    expect(t.source.frequency).toBe('AGREEMENT')
    expect(t.says).toContain('under your agreement with Northbend Athletic')
    expect(t.says).toContain('gives no reason')

    // The cascade the bill and the due date read gives the same answer.
    const { billing } = moneyTermsFor('SELL', line, { name: 'Computer Systems Inc' })
    expect(billing.paymentTermsDays.value).toBe(30)
    expect(billing.paymentTermsDays.source).toBe('AGREEMENT')
    expect(billing.setAside.join(' ')).toContain('Your order says net 15 but gives no reason')
  })

  it('a difference from the agreement is applied when its reason is recorded', () => {
    const line = {
      ...lineOnAnOrder,
      workOrder: {
        ...lineOnAnOrder.workOrder, paymentTerms: 15, msa: NORTHBEND_AGREEMENT,
        termsDifferReason: 'Northbend pays this project weekly at net 15, agreed by its CFO on Oct 2',
      },
    }
    const t = termsFor('SELL', line)
    expect(t.paymentTermsDays).toBe(15)
    expect(t.source.paymentTermsDays).toBe('ORDER')
    expect(t.frequency).toBe('WEEKLY')
    expect(t.source.frequency).toBe('ORDER')
    expect(t.setAside).toEqual([])
    const { billing } = moneyTermsFor('SELL', line, { name: 'Computer Systems Inc' })
    expect(billing.paymentTermsDays.value).toBe(15)
    expect(billing.paymentTermsDays.source).toBe('ORDER')
    expect(billing.paymentTermsDays.because).toContain('agreed by its CFO')
    expect(billing.paymentTermsDays.overrode).toEqual({ value: 30, source: 'AGREEMENT' })

    // A line's own reason beats the order beneath the agreement too, and
    // the line is the more specific document.
    const lineReason = termsFor('SELL', {
      ...lineOnAnOrder, paymentTerms: 10, termsDifferReason: 'This one person is paid on receipt plus ten',
      workOrder: { ...lineOnAnOrder.workOrder, msa: NORTHBEND_AGREEMENT },
    })
    expect(lineReason.paymentTermsDays).toBe(10)
    expect(lineReason.source.paymentTermsDays).toBe('LINE')
  })

  it('the agreement’s billing rhythm reaches a line whose order and line say the same or nothing readable', () => {
    const weekly = { ...NORTHBEND_AGREEMENT, billFrequency: 'WEEKLY', billAnchor: 'CALENDAR', billStraddle: 'END' }
    const t = termsFor('SELL', { startDate: day('2026-03-02'), msa: weekly })
    expect([t.frequency, t.straddle]).toEqual(['WEEKLY', 'END'])
    expect(t.source.frequency).toBe('AGREEMENT')
    // A period is read through the same door, so the bill's period follows it.
    expect(periodTermsFor('SELL', { startDate: day('2026-03-02'), msa: weekly }).frequency).toBe('WEEKLY')
  })

  it('an agreement that says nothing about the rhythm leaves the order to answer, as before', () => {
    const silent = { ...NORTHBEND_AGREEMENT, billFrequency: null, billAnchor: null, billStraddle: null }
    const t = termsFor('SELL', { ...lineOnAnOrder, workOrder: { ...lineOnAnOrder.workOrder, msa: silent } })
    expect(t.frequency).toBe('WEEKLY')
    expect(t.source.frequency).toBe('ORDER')
    // While the agreement's net days still stand over the order's.
    expect(t.paymentTermsDays).toBe(30)
    expect(t.source.paymentTermsDays).toBe('AGREEMENT')
  })

  it('a buy line reads the agreement with the sub-vendor, through the order raised to it', () => {
    const withTechpeple = { ...NORTHBEND_AGREEMENT, paymentTerms: 45, client: { name: 'Computer Systems Inc' }, vendor: { name: 'Techpeple' } }
    const t = termsFor('BUY', {
      startDate: day('2026-03-02'), payFrequency: 'MONTHLY',
      workOrder: { id: 'wo_b', number: 'PO-2026-1QJHU', paymentTerms: 60, msa: withTechpeple },
    })
    expect(t.paymentTermsDays).toBe(45)
    expect(t.counterpartyName).toBe('Techpeple')
    expect(t.setAside[0]).toBe('Your order says net 60 but gives no reason, so your agreement with Techpeple\u2019s net 45 applies.')
  })

  it('a W2 line has no agreement above it, so the worker’s own contract sets the terms', () => {
    const t = termsFor('BUY', { startDate: day('2026-03-02'), payFrequency: 'SEMIMONTHLY', paymentTerms: 0, workOrder: null })
    expect(t.frequency).toBe('SEMIMONTHLY')
    expect(t.source.frequency).toBe('LINE')
    expect(t.agreementId).toBeNull()
    expect(t.setAside).toEqual([])
  })
})
