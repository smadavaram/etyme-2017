/**
 * The third production walk (2026-10-26) said Ask Etyme runs parallel to
 * the dashboard, and left four small things in what it says. One
 * sentence each.
 */

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { limitsSay, limitCountSays, nearLimit, today, billWithDue, billRows, type Readers, type LimitEntry } from '@/app/api/conversations/twin/ask'
import { digestHeading, digestHeadingOf, tenureTitle } from '@/lib/teams/cards'
import type { BillCardPayload } from '@/lib/money/supplier-bills'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const NOW = new Date('2026-10-26T15:00:00Z')
const day = (iso: string) => iso

const ANDERS: LimitEntry = { personId: 'p-anders', personName: 'Anders Lund', limitOn: '2026-05-25', capMonths: 18, suppliers: ['Halden Systems'], recordedAt: NOW.toISOString() }
const TOBIAS: LimitEntry = { personId: 'p-tobias', personName: 'Tobias Lindqvist', limitOn: '2026-12-25', capMonths: 18, suppliers: ['Brightmoor Staffing'], recordedAt: NOW.toISOString() }

describe('a contractor whose limit has gone is past it, never near it (walk four, item 1)', () => {
  it('Kestrel asking “Who is near the time limit?” reads Anders Lund as past the time limit', () => {
    expect(limitsSay(nearLimit([ANDERS], NOW), day)).toBe(
      'Decide today what happens to Anders Lund; the time limit has passed. One contractor is past the time limit, counted across every supplier. Anders Lund reached the 18-month time limit on 2026-05-25. Checked just now.')
  })

  it('one past and one near are counted apart', () => {
    expect(limitCountSays(nearLimit([ANDERS, TOBIAS], NOW))).toBe('One contractor is past the time limit and one is near it')
    expect(limitCountSays(nearLimit([TOBIAS], NOW))).toBe('One contractor is near the time limit')
  })

  it('the greeting says the second person as past the limit where they are past it', async () => {
    const later: LimitEntry = { ...ANDERS, personId: 'p-two', personName: 'Marta Kowalczyk', limitOn: '2026-06-01' }
    const read = {
      waiting: vi.fn(async () => []), othersWaiting: vi.fn(async () => []), told: vi.fn(async () => ({ told: [], stale: [] })),
      limits: vi.fn(async () => ({ ok: true as const, entries: [ANDERS, later] })),
      spendIn: vi.fn(async () => ({ ok: true as const, receipts: [], undated: 0 })),
    } as unknown as Readers
    const a = await today(read, { now: NOW })
    if (a.kind !== 'NEEDS') throw new Error(a.kind)
    expect((a.more ?? []).map((l) => l.says)).toContain('Anders Lund reached the 18-month time limit on May 25, 2026. One more contractor is past the time limit.')
  })

  it('a Teams card for a person past the limit says past, and the table says “Past the limit”', () => {
    expect(tenureTitle({ personName: 'Anders Lund', daysToLimit: -154, tier: 'BREACH' })).toBe('Anders Lund is past the time limit')
    expect(tenureTitle({ personName: 'Tobias Lindqvist', daysToLimit: 0, tier: 'BREACH' })).toBe('Tobias Lindqvist is at the time limit')
    expect(src('src/app/dashboard/conversations/ask-etyme.tsx')).toContain("r.daysToLimit < 0 ? 'Past the limit' : 'At the limit'")
  })
})

describe('the Teams digest titles a payment as paying (walk four, item 2)', () => {
  it('receipts the twin asks to pay are “to pay”, never “need approval”, and past the limit is said apart from near it', () => {
    expect(digestHeadingOf([{ pay: true }, { pay: true }, { pay: true }], [{ daysToLimit: -154 }, { daysToLimit: 60 }]))
      .toBe('3 invoice receipts to pay · 1 contractor past the time limit · 1 contractor near the time limit')
    expect(digestHeading(3, 1)).toBe('3 invoice receipts need approval · 1 contractor near the time limit')
    expect(src('src/lib/teams/digest.ts')).not.toMatch(/digestHeading\(d\./)
  })
})

const BILL: BillCardPayload = {
  customerName: 'Corveldt Aerospace',
  period: { start: '2026-07-01', end: '2026-07-31', label: 'July 2026' },
  hours: 184, totalMinor: 2502400, currency: 'USD',
  people: [{ personName: 'Karthik Menon', hours: 184, amountMinor: 2502400 }],
  builtFrom: { timesheetIds: ['t1'], weeks: 5, expenses: 0, milestones: 0 },
  dueSays: 'Due Sep 14, 2026 — net 45 from the end of the work period, Jul 31, 2026. That date has passed: sent Oct 20, 2026, it is 36 days past due the day it arrives.',
  pastDue: { daysPast: 36, says: 'That date has passed: sent Oct 20, 2026, it is 36 days past due the day it arrives.' },
  heldBack: null, setAside: [], invoiceId: 'inv-b', invoiceNumber: 'IN_BPCX7Y_001',
}

describe('a drafted bill’s past-due line is read on the day the card is drawn (walk four, item 4)', () => {
  it('the card says today’s due line from money, not the day the twin drafted it', () => {
    const live = { dueSays: 'Due Sep 14, 2026 — net 45 from the end of the work period, Jul 31, 2026. That date has passed: sent Oct 26, 2026, it is 42 days past due the day it arrives.', pastDue: { daysPast: 42, says: 'That date has passed: sent Oct 26, 2026, it is 42 days past due the day it arrives.' } }
    const bill = billWithDue(BILL, live)
    expect(bill.pastDue?.daysPast).toBe(42)
    expect(billRows(bill).find((r) => r.label === 'Due')?.value).toMatch(/42 days past due/)
  })

  it('Ask Etyme and the Teams card both read money’s pastDueOnSendingNow, the chat in one read for every card, and a bill already sent closes its card', () => {
    const due = src('src/app/api/conversations/twin/bill-due.ts')
    expect(due).toContain("import { pastDueOnSendingNowMany, pastDueOnSendingNow } from '@/lib/money/bill-send'")
    expect(due).toContain('out.set(b.key, live ? billWithDue(b.bill, live) : null)')
    const read = src('src/app/api/conversations/twin/read.ts')
    expect(read).toContain('const liveBills = await billsDueToday(')
    expect(read).toContain('mine.filter((r) => liveBills.get(r.id) !== null)')
    const teams = src('src/lib/teams/facts.ts')
    expect(teams).toContain('await billDueToday(stored, a.twinAction.entityId)')
    expect(teams).toMatch(/if \(!bill\) return null/)
  })
})
