import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The release walk of 2026-11-03, fault M1: Helena Marsh's Oct 25–31 week
 * at Techpeple was already on TECH-vv0wk-10, the invoice receipt Computer
 * Systems recorded from Techpeple. "Bill this week" was drawn, and the
 * press drafted IN_I7JW7Y_002 for $412.60 holding only her travel
 * expense, with no hours. The check that finds the earlier bill now runs
 * before the button is drawn, and a press that would bill none of the
 * week's hours refuses in that sentence and drafts nothing.
 */

const generateBill = vi.fn()
vi.mock('@/lib/money/bill-generate', () => ({
  generateBill: (...a: unknown[]) => generateBill(...a),
  BILLABLE_LINE_STATES: ['ACTIVE', 'IN_PROGRESS'],
}))

const week = {
  id: 'ts-helena', personId: 'p-helena', sellContractId: 'line',
  periodStart: new Date('2026-10-25T00:00:00Z'), periodEnd: new Date('2026-10-31T00:00:00Z'),
  assertions: [{ id: 'signed' }],
}
vi.mock('@/lib/db', () => ({
  prisma: {
    timesheet: { findUnique: vi.fn(async () => week) },
    sellContract: { findMany: vi.fn(async () => [{ id: 'line', engagementId: 'eng', state: 'IN_PROGRESS' }]) },
    invoiceLine: { findFirst: vi.fn(async () => null) },
    context: { findMany: vi.fn(async () => []) },
  },
}))

import { weekOnPlan, weekBillFor, billThisWeek } from '@/lib/money/week-bill'

const ALREADY = 'Helena Marsh’s week of Oct 25 is already on invoice TECH-vv0wk-10, which Computer Systems Inc recorded from you, so it is not billed again.'
const expenseOnly = {
  ok: true, status: 200,
  planned: {
    timesheetIds: [], totalMinor: 41_260, expenseCount: 1,
    weeksLeftOff: [{ timesheetId: 'ts-helena', kind: 'HELD' as const, says: ALREADY, billedElsewhere: 'WHOLE' as const }],
  },
  body: { data: {} },
}
const caller = {
  company: { id: 'techpeple', name: 'Techpeple' },
  person: { id: 'bhavesh', name: 'Bhavesh' },
  permissions: ['invoices.issue'],
}

beforeEach(() => generateBill.mockReset())

describe('Bill this week bills the week’s hours, or nothing', () => {
  it('a bill from the week’s days that carries none of its hours is not this week’s bill, and says where the hours are', () => {
    expect(weekOnPlan(expenseOnly.planned, 'ts-helena')).toEqual({ ok: false, code: 'ALREADY_BILLED', says: ALREADY })
    expect(weekOnPlan({ timesheetIds: ['ts-helena'], weeksLeftOff: [] }, 'ts-helena')).toEqual({ ok: true })
    expect(weekOnPlan({ timesheetIds: ['other'], weeksLeftOff: [] }, 'ts-helena').ok).toBe(false)
  })

  it('the button is not drawn on a week whose hours are already on an invoice receipt the payer recorded, and the sentence names it', async () => {
    generateBill.mockResolvedValue(expenseOnly)
    const view = await weekBillFor(caller, 'ts-helena')
    expect(view?.mayBill).toBe(false)
    expect(view?.says).toBe(ALREADY)
  })

  it('a press on that week refuses in the same sentence and drafts no bill, not even the expense alone', async () => {
    generateBill.mockResolvedValue(expenseOnly)
    const out = await billThisWeek(caller, 'ts-helena')
    expect(out.ok).toBe(false)
    expect(!out.ok && out.body.error.message).toBe(ALREADY)
    // Every call the press made was a dry run: nothing was written.
    for (const call of generateBill.mock.calls) expect(call[2]).toMatchObject({ dryRun: true })
  })

  it('a week whose hours are on the bill is still offered and drafted', async () => {
    generateBill.mockImplementation(async (_w: unknown, _s: unknown, o?: { dryRun?: boolean }) =>
      o?.dryRun
        ? { ok: true, status: 200, planned: { timesheetIds: ['ts-helena'], weeksLeftOff: [] }, body: { data: {} } }
        : { ok: true, status: 201, invoiceId: 'inv', planned: { timesheetIds: ['ts-helena'], weeksLeftOff: [] }, body: { data: {} } })
    expect((await weekBillFor(caller, 'ts-helena'))?.mayBill).toBe(true)
    const out = await billThisWeek(caller, 'ts-helena')
    expect(out.ok && out.status).toBe(201)
  })
})
