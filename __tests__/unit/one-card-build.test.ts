import { describe, it, expect } from 'vitest'
import { oneCardsFrom, NO_LEDGER_YET, PLAIN_RULE } from '@/lib/notify/one-card/build'
import { cardWordCount, readsAsSentence } from '@/lib/notify/one-card/wording'
import { agentWord, ledgerLine } from '@/lib/notify/one-card/read'

const NOW = new Date('2026-11-26T15:00:00Z')
const row = (o: Record<string, unknown>) => ({ type: 'TIMESHEET_APPROVAL', title: 'Approve timesheet — Helena Marsh', subtitle: '40 hours · Brightmoor · Nov 15–21', entityType: 'TIMESHEET', entityId: 'ts1', dueDate: null, actionUrl: '/dashboard/timesheets?id=ts1', amount: 3200, createdAt: '2026-11-20T10:00:00Z', named: { whose: 'Helena Marsh' }, ...o })
const body = (rows: unknown[]) => ({ data: { decisions: rows, total: rows.length } })

describe('The one-card queue is built from the decisions list the badge counts', () => {
  it('the queue figure is the decisions list total, the number on the Ask Etyme badge', () => {
    const got = oneCardsFrom(body([row({}), row({ entityId: 'ts2' })]), new Map(), NOW)!
    expect(got.total).toBe(2)
    expect(got.cards).toHaveLength(2)
  })
  it('a list that is not the decisions list is read as nothing, never as an empty queue', () => {
    expect(oneCardsFrom({ nope: true }, new Map(), NOW)).toBeNull()
  })
  it('a timesheet card names the person, the hours and how long it has been open, and its act is one press on its own route', () => {
    const c = oneCardsFrom(body([row({})]), new Map(), NOW)!.cards[0]
    expect(c.name).toBe('Helena Marsh')
    expect(c.figure).toBe('40 h')
    expect(c.tag).toBe('Open 6 d')
    expect(c.act).toMatch(/^Approve/)
    expect(c.yes?.url).toMatch(/^\/api\//)
    expect(c.open).toBeNull()
  })
  it('every card is twelve words or fewer and none reads as a sentence', () => {
    const long = row({ entityId: 'ts9', title: 'Approve timesheet — A name that goes on and on and on and on and on and on and on and on', named: { whose: 'A name that goes on and on and on and on and on and on and on and on' } })
    for (const c of oneCardsFrom(body([row({}), long]), new Map(), NOW)!.cards) {
      expect(cardWordCount(c)).toBeLessThanOrEqual(12)
      expect(readsAsSentence(`${c.act} ${c.name}`)).toBe(false)
    }
  })
  it('a receipt to pay with no route of its own reads Pay invoice and its one button opens the receipt', () => {
    const c = oneCardsFrom(body([row({ type: 'INVOICE_RECEIPT_TO_PAY', title: 'Pay invoice receipt — Computer Systems Inc', subtitle: 'Invoice IN-1 · $5,800.00 · due in 19 days', entityId: 'vb1', actionUrl: '/dashboard/ap', named: undefined, dueDate: '2026-12-15T00:00:00.000Z' })]), new Map(), NOW)!.cards[0]
    expect(c.act).toBe('Pay invoice')
    expect(c.figure).toBe('$5,800.00')
    expect(c.tag).toBe('Due in 19 d')
    expect(c.yes).toBeNull()
    expect(c.open?.words).toBe('Pay')
  })
  it('a row with no verdict route offers one button that opens its record, and no Yes', () => {
    const c = oneCardsFrom(body([row({ type: 'SUBMISSION_REVIEW', title: 'Review candidates — Data engineer', entityId: 'rq1', actionUrl: '/dashboard/submissions?requirementId=rq1', named: undefined })]), new Map(), NOW)!.cards[0]
    expect(c.yes).toBeNull()
    expect(c.open?.href).toContain('/dashboard/submissions')
  })
  it('the card with the most urgency and money stands first', () => {
    const q = oneCardsFrom(body([
      row({ entityId: 'quiet', amount: 100, createdAt: '2026-11-26T08:00:00Z' }),
      row({ entityId: 'loud', amount: 9000, createdAt: '2026-11-10T08:00:00Z', dueDate: '2026-11-20' }),
    ]), new Map(), NOW)!
    expect(q.cards[0].key).toBe('TIMESHEET_APPROVAL:loud')
  })
  it('the Why holds the rule, the source and the ledger line, and says so plainly where no ledger line is written yet', () => {
    const none = oneCardsFrom(body([row({})]), new Map(), NOW)!.cards[0].why
    expect(none.rule.length).toBeGreaterThan(0)
    expect(none.source).toContain('40 hours')
    expect(none.ledger).toBe(NO_LEDGER_YET)
    const some = oneCardsFrom(body([row({})]), new Map([['ts1', '2026-11-26 09:14 · AP clerk · Approved week']]), NOW)!.cards[0].why
    expect(some.ledger).toContain('AP clerk')
    expect(PLAIN_RULE).toMatch(/Not now changes nothing/)
  })
  it('the agent reads On, Drafts only or Off from the firm switches', () => {
    expect(agentWord(['OFF', 'ON'])).toBe('On')
    expect(agentWord(['OFF', 'DRAFT_ONLY'])).toBe('Drafts only')
    expect(agentWord([])).toBe('Off')
  })
  it('a ledger line names the day, the person and what was done', () => {
    expect(ledgerLine({ createdAt: new Date('2026-11-26T09:14:30Z'), person: { name: 'Priya' }, action: 'X', summary: 'Paid INV-2041' })).toBe('2026-11-26 09:14 · Priya · Paid INV-2041')
  })
})
