import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ACTS, UNNAMED_ACT, actHeading } from '@/lib/notify/one-card/acts'
import { oneCardsFrom } from '@/lib/notify/one-card/build'
import { barFigures, oldestDays } from '@/lib/notify/one-card/score-bar'
import { agentCell } from '@/lib/notify/one-card/read'
import { workerCardsFrom } from '@/lib/notify/one-card/worker'
import { cardsFor, type WorkerFacts } from '@/app/api/conversations/twin/worker'

const NOW = new Date('2026-11-26T15:00:00Z')
const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const row = (o: Record<string, unknown>) => ({ type: 'TIMESHEET_APPROVAL', title: 'Approve timesheet — Helena Marsh', subtitle: '40 hours · Brightmoor · Nov 15–21', entityType: 'TIMESHEET', entityId: 'ts1', dueDate: null, actionUrl: '/dashboard/timesheets?id=ts1', amount: 3200, createdAt: '2026-11-21T10:00:00Z', named: { whose: 'Helena Marsh' }, ...o })
const body = (rows: unknown[]) => ({ data: { decisions: rows, total: rows.length } })

/** Every kind of row the queue's sources write: the decisions route and its doc, the decision items, the chat's own cards. */
function kindsOnTheQueue(): string[] {
  const route = src('src/app/api/decisions/route.ts')
  const found = new Set<string>()
  for (const m of route.matchAll(/type: '([A-Z][A-Z_]{3,})'/g)) found.add(m[1])
  for (const m of route.matchAll(/^ \*   ([A-Z][A-Z_]{3,})\s+—/gm)) found.add(m[1])
  for (const m of src('src/lib/decision-items.ts').matchAll(/DECISION_ITEM_CARD = '([A-Z_]+)'/g)) found.add(m[1])
  for (const m of src('src/app/api/conversations/twin/ask.ts').matchAll(/type: '(BILL_SEND)'/g)) found.add(m[1])
  for (const m of src('src/app/api/conversations/twin/ask.ts').matchAll(/export const (?:OWNER_ASK|JOIN_ASK|LINK_REQUEST) = '([A-Z_]+)'/g)) found.add(m[1])
  return [...found]
}

describe('Every card names its act in the trade\'s words', () => {
  it('every row kind on the queue has an act name on its card; none reads Open as its heading', () => {
    const kinds = kindsOnTheQueue()
    expect(kinds.length).toBeGreaterThan(14)
    for (const k of kinds) {
      expect(ACTS[k], `${k} has no act name`).toBeDefined()
      expect(ACTS[k].act).not.toMatch(/^Open\b/)
    }
    for (const [k, a] of Object.entries(ACTS)) expect(a.act, k).not.toMatch(/^Open\b/)
  })
  it('a timesheet, a job request and a supplier read Approve timesheet, Approve job request and Approve supplier', () => {
    expect(actHeading('TIMESHEET_APPROVAL', 'Approve timesheet — A', null)).toBe('Approve timesheet')
    expect(actHeading('REQUISITION_APPROVAL', null, null)).toBe('Approve job request')
    expect(actHeading('SUPPLIER_REVIEW', null, null)).toBe('Approve supplier')
    expect(actHeading('EXPENSE_APPROVAL', null, null)).toBe('Approve expense')
    expect(actHeading('INVOICE_RECEIPT_TO_PAY', null, null)).toBe('Pay invoice')
  })
  it('a kind nobody has named reads Decide, never Open', () => {
    expect(actHeading('SOMETHING_NEW', null, 'Open')).toBe(UNNAMED_ACT)
    expect(UNNAMED_ACT).toBe('Decide')
  })
  it('a card with a one-press act has a button that reads the verb, and a card with none reads its own words', () => {
    const ts = oneCardsFrom(body([row({})]), new Map(), NOW)!.cards[0]
    expect(ts.act).toBe('Approve timesheet')
    expect(ts.verb).toBe('Approve')
    const review = oneCardsFrom(body([row({ type: 'SUBMISSION_REVIEW', title: 'Review candidates — Data engineer', entityId: 'rq1', actionUrl: '/dashboard/submissions?requirementId=rq1', named: undefined })]), new Map(), NOW)!.cards[0]
    expect(review.act).toBe('Review candidates')
    expect(review.verb).toBeNull()
    expect(review.open?.words).not.toBe('')
  })
})

describe('The score bar reads figures that are true on the record', () => {
  const card = (o: Record<string, unknown>) => ({ dueOn: null as string | null, openedOn: null as string | null, ...o })
  it('Waiting is the queue total, the number on the Ask Etyme badge', () => {
    expect(barFigures([], 7, null, NOW).find((f) => f.label === 'Waiting')?.value).toBe('7')
  })
  it('Oldest is the days the oldest card has been open', () => {
    const cards = [card({ openedOn: '2026-11-21T10:00:00Z' }), card({ openedOn: '2026-11-25T10:00:00Z' })]
    expect(oldestDays(cards, NOW)).toBe(5)
    expect(barFigures(cards, 2, null, NOW).find((f) => f.label === 'Oldest')?.value).toBe('5 d')
  })
  it('Oldest is a dash where no card says when it appeared', () => {
    expect(barFigures([card({})], 1, null, NOW).find((f) => f.label === 'Oldest')?.value).toBe('–')
  })
  it('On time stays a dash until something done had a due date', () => {
    expect(barFigures([], 0, null, NOW).find((f) => f.label === 'On time')?.value).toBe('–')
    expect(barFigures([], 0, 80, NOW).find((f) => f.label === 'On time')?.value).toBe('80%')
  })
  it('Due and Late are drawn only where a card carries a real due date', () => {
    const none = barFigures([card({ openedOn: '2026-11-20' })], 1, null, NOW).map((f) => f.label)
    expect(none).toEqual(['Waiting', 'Oldest', 'On time'])
    const some = barFigures([card({ dueOn: '2026-11-24' }), card({ dueOn: '2026-11-26' })], 2, null, NOW)
    expect(some.map((f) => f.label)).toEqual(['Waiting', 'Oldest', 'Due', 'Late', 'On time'])
    expect(some.find((f) => f.label === 'Late')?.value).toBe('1')
    expect(some.find((f) => f.label === 'Due')?.value).toBe('1')
  })
  it('the bar never reads 0 Due and 0 Late above a waiting card', () => {
    const figs = barFigures(oneCardsFrom(body([row({})]), new Map(), NOW)!.cards, 1, null, NOW)
    expect(figs.map((f) => f.label)).not.toContain('Due')
    expect(figs.find((f) => f.label === 'Waiting')?.value).toBe('1')
  })
})

describe('The agent cell counts the agents switched on', () => {
  it('two agents on read "2 on", and none on reads "Off"', () => {
    expect(agentCell(['ON', 'OFF', 'ON', 'DRAFT_ONLY'])).toEqual({ on: 2, words: '2 on' })
    expect(agentCell(['OFF', 'DRAFT_ONLY'])).toEqual({ on: 0, words: 'Off' })
    expect(agentCell([])).toEqual({ on: 0, words: 'Off' })
  })
})

describe('A worker reads her own queue as cards', () => {
  const facts = {
    returned: [], sent: [], papers: [], interviews: [], stays: [], consent: { asking: [] },
    toFile: [{ periodStart: '2026-11-15', periodEnd: '2026-11-21', ended: true, wholeWeek: true, expectedHours: 40, dueOn: '2026-11-23', site: 'Harlow Health' }],
  } as unknown as WorkerFacts
  it('a week she has not filed is one card that reads File my week and opens her own page', () => {
    const cards = workerCardsFrom(cardsFor(facts))
    expect(cards).toHaveLength(1)
    expect(cards[0].act).toBe('File my week')
    expect(cards[0].yes).toBeNull()
    expect(cards[0].open?.href).toContain('/dashboard')
    expect(cards[0].act).not.toMatch(/^Open/)
  })
})
