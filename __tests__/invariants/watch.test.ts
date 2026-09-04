import { describe, it, expect } from 'vitest'
import {
  watchVerifications,
  watchPurchaseOrders,
  watchAccess,
  watchPackets,
  ordered,
  digest,
  type Finding,
} from '@/lib/watch'

/**
 * Everything built so far records. A packet reopens when insurance expires
 * — but only when somebody opens the packets page. Access expires and
 * nobody is told. A purchase order runs out and the first anybody hears is
 * a supplier chasing a payment that will not match.
 *
 * That is a filing cabinet. These tests hold the two rules that make it
 * something else: warn before the block rather than after, and say what
 * will happen rather than that something is wrong.
 */

const NOW = new Date('2026-08-19T00:00:00Z')
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000)

describe('insurance and work authorisation', () => {
  const base = {
    id: 'v1', companyId: 'co1', personId: null,
    status: 'CLEAR', subjectName: 'Cloudepa Inc.',
  }

  it('warns two months before insurance lapses, not on the day', () => {
    // Telling somebody the day it lapses means a placement is already
    // blocked and a broker needs a week.
    const f = watchVerifications([{ ...base, type: 'INSURANCE_GL', expiresAt: inDays(50) }], NOW)
    expect(f).toHaveLength(1)
    expect(f[0].kind).toBe('VERIFICATION_EXPIRING')
  })

  it('says nothing about cover that runs for another eight months', () => {
    // A watcher that speaks constantly is one nobody reads.
    expect(watchVerifications([{ ...base, type: 'INSURANCE_GL', expiresAt: inDays(240) }], NOW)).toHaveLength(0)
  })

  it('says what will happen rather than that something is wrong', () => {
    const f = watchVerifications([{ ...base, type: 'INSURANCE_GL', expiresAt: inDays(12) }], NOW)
    expect(f[0].detail).toMatch(/will not be able to place anybody/i)
    expect(f[0].detail).toContain('Cloudepa Inc.')
  })

  it('treats lapsed cover as blocking, because it already stops work', () => {
    const f = watchVerifications([{ ...base, type: 'INSURANCE_WC', expiresAt: inDays(-3) }], NOW)
    expect(f[0].urgency).toBe('BLOCKING')
    expect(f[0].detail).toMatch(/already stopping work/i)
  })

  it('reopens the request rather than only announcing it', () => {
    // The point is that the ask is already waiting when somebody looks.
    const f = watchVerifications([{ ...base, type: 'INSURANCE_GL', expiresAt: inDays(20) }], NOW)
    expect(f[0].action).toBe('REOPEN_PACKET')
  })

  it('only mentions a distant expiry rather than chasing it', () => {
    const f = watchVerifications([{ ...base, type: 'INSURANCE_GL', expiresAt: inDays(55) }], NOW)
    expect(f[0].action).toBe('NOTIFY_ONLY')
  })

  it('is gentler about a check that does not stop work', () => {
    const blocking = watchVerifications([{ ...base, type: 'I9_EVERIFY', expiresAt: inDays(10) }], NOW)
    const not = watchVerifications([{ ...base, type: 'BACKGROUND_CHECK', expiresAt: inDays(10) }], NOW)
    expect(blocking[0].urgency).toBe('BLOCKING')
    expect(not[0].urgency).not.toBe('BLOCKING')
  })

  it('ignores a check that never passed, because it is not cover we hold', () => {
    expect(watchVerifications([{ ...base, type: 'INSURANCE_GL', status: 'FAILED', expiresAt: inDays(5) }], NOW)).toHaveLength(0)
  })

  it('ignores anything with no expiry, because it cannot lapse', () => {
    expect(watchVerifications([{ ...base, type: 'BUSINESS_PARTNER', expiresAt: null }], NOW)).toHaveLength(0)
  })

  it('names the thing in words a person would use', () => {
    const f = watchVerifications([{ ...base, type: 'INSURANCE_WC', expiresAt: inDays(-1) }], NOW)
    expect(f[0].headline).toContain("workers' compensation")
    expect(f[0].headline).not.toContain('INSURANCE_WC')
  })
})

describe('purchase orders running out', () => {
  const base = {
    id: 'po1', companyId: 'co1', number: 'PO-9001', supplierName: 'Cloudepa Inc.',
    amountCents: 100_000_00, endDate: null, status: 'OPEN', liveContracts: 3,
  }

  it('speaks up at eighty-five per cent, before the invoice fails', () => {
    // Nothing else announces this. The invoice simply fails its balance
    // check and the supplier finds out by not being paid.
    const f = watchPurchaseOrders([{ ...base, invoicedCents: 88_000_00 }], NOW)
    expect(f[0].kind).toBe('PO_NEARLY_SPENT')
  })

  it('says nothing at half spent', () => {
    expect(watchPurchaseOrders([{ ...base, invoicedCents: 50_000_00 }], NOW)).toHaveLength(0)
  })

  it('treats an exhausted order as blocking and names what happens next', () => {
    const f = watchPurchaseOrders([{ ...base, invoicedCents: 100_000_00 }], NOW)
    expect(f[0].urgency).toBe('BLOCKING')
    expect(f[0].detail).toMatch(/next invoice will not match/i)
    expect(f[0].detail).toContain('3 contract')
  })

  it('warns before the order runs out of time as well as money', () => {
    const f = watchPurchaseOrders([{ ...base, invoicedCents: 10_000_00, endDate: inDays(5) }], NOW)
    expect(f.some((x) => x.kind === 'PO_ENDING')).toBe(true)
  })

  it('says nothing about a nearly-spent order with nothing billing against it', () => {
    // There is nothing to break.
    expect(watchPurchaseOrders([{ ...base, invoicedCents: 90_000_00, liveContracts: 0 }], NOW)).toHaveLength(0)
  })

  it('ignores a closed order', () => {
    expect(watchPurchaseOrders([{ ...base, invoicedCents: 99_000_00, status: 'CLOSED' }], NOW)).toHaveLength(0)
  })
})

describe('access nobody is using', () => {
  const base = {
    contextId: 'c1', companyId: 'co1', personName: 'Ravi Patel',
    roleName: 'Recruiter', expiresAt: null, lastUsedAt: inDays(-2), grantedAt: inDays(-100),
  }

  it('warns before somebody loses access rather than after', () => {
    const f = watchAccess([{ ...base, expiresAt: inDays(5) }], NOW)
    expect(f[0].kind).toBe('ACCESS_EXPIRING')
  })

  it('says doing nothing is also fine, because that is what an expiry is for', () => {
    const f = watchAccess([{ ...base, expiresAt: inDays(5) }], NOW)
    expect(f[0].detail).toMatch(/doing nothing is also fine/i)
  })

  it('reports access granted a month ago and never once used', () => {
    // Either they do not need it, or nobody told them it was there.
    const f = watchAccess([{ ...base, lastUsedAt: null, grantedAt: inDays(-45) }], NOW)
    expect(f[0].kind).toBe('ACCESS_NEVER_USED')
  })

  it('gives somebody granted access last week time to use it', () => {
    expect(watchAccess([{ ...base, lastUsedAt: null, grantedAt: inDays(-5) }], NOW)).toHaveLength(0)
  })

  it('reports access held but untouched for three months as exposure', () => {
    const f = watchAccess([{ ...base, lastUsedAt: inDays(-120) }], NOW)
    expect(f[0].kind).toBe('ACCESS_DORMANT')
    expect(f[0].detail).toMatch(/exposure rather than access/i)
  })

  it('says nothing about access somebody used yesterday', () => {
    expect(watchAccess([base], NOW)).toHaveLength(0)
  })
})

describe('requests that went quiet', () => {
  const base = {
    id: 'p1', companyId: 'co1', label: 'Bringing on a supplier',
    recipientEmail: 'office@supplier.com', expiresAt: inDays(3),
    createdAt: inDays(-20), outstandingRequired: 2,
  }

  it('says plainly that an expired link looks like a dead page to the recipient', () => {
    // The worst kind of invisible: to the sender an expired link and an
    // ignored request look identical, so they conclude the supplier is
    // unresponsive when the supplier saw a dead page.
    const f = watchPackets([{ ...base, expiresAt: inDays(-4) }], NOW)
    expect(f[0].kind).toBe('PACKET_LINK_DEAD')
    expect(f[0].detail).toMatch(/dead page, not a reminder/i)
  })

  it('nudges before the link dies', () => {
    const f = watchPackets([base], NOW)
    expect(f[0].kind).toBe('PACKET_GOING_QUIET')
  })

  it('says nothing about a request already answered', () => {
    expect(watchPackets([{ ...base, outstandingRequired: 0 }], NOW)).toHaveLength(0)
  })

  it('says nothing about one sent yesterday', () => {
    expect(watchPackets([{ ...base, createdAt: inDays(-1), expiresAt: inDays(29) }], NOW)).toHaveLength(0)
  })
})

describe('what to look at first', () => {
  const f = (urgency: Finding['urgency'], daysUntil: number | null, kind = 'X'): Finding => ({
    kind, urgency, companyId: 'c', subjectType: 'T', subjectId: 'i',
    headline: `${kind} ${daysUntil}`, detail: '', action: 'NOTIFY_ONLY', daysUntil,
  })

  it('puts what is already stopping work above what might', () => {
    const sorted = ordered([f('WORTH_KNOWING', 1), f('BLOCKING', 40), f('SOON', 2)])
    expect(sorted.map((x) => x.urgency)).toEqual(['BLOCKING', 'SOON', 'WORTH_KNOWING'])
  })

  it('puts the soonest first within a band', () => {
    const sorted = ordered([f('SOON', 30, 'A'), f('SOON', 2, 'B'), f('SOON', 9, 'C')])
    expect(sorted.map((x) => x.kind)).toEqual(['B', 'C', 'A'])
  })

  it('puts something with no deadline last rather than first', () => {
    const sorted = ordered([f('SOON', null, 'A'), f('SOON', 5, 'B')])
    expect(sorted.map((x) => x.kind)).toEqual(['B', 'A'])
  })
})

describe('the one line somebody is told', () => {
  const f = (urgency: Finding['urgency'], headline: string): Finding => ({
    kind: 'X', urgency, companyId: 'c', subjectType: 'T', subjectId: 'i',
    headline, detail: '', action: 'NOTIFY_ONLY', daysUntil: 1,
  })

  it('says nothing at all when there is nothing', () => {
    // A daily message saying everything is fine is how a daily message
    // stops being read.
    expect(digest([])).toBeNull()
  })

  it('leads with what is already stopping work', () => {
    const d = digest([f('WORTH_KNOWING', 'minor'), f('BLOCKING', 'insurance lapsed')])
    expect(d).toContain('insurance lapsed')
  })

  it('counts the rest rather than listing all of it', () => {
    const d = digest([f('BLOCKING', 'first'), f('BLOCKING', 'second'), f('BLOCKING', 'third')])
    expect(d).toContain('first')
    expect(d).toContain('2 other')
  })
})
