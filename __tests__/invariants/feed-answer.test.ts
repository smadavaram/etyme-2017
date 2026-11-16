import { describe, it, expect } from 'vitest'
import { parseAnswer, decideAnswer, type SentRow, type AnswerRow } from '@/lib/money/feed-answer'
import { stateInWords, standingOfRows, standingMessage } from '@/lib/money/bill-feed'

const sentRow = (over: Partial<SentRow> = {}): SentRow => ({
  runId: 'run1', billId: 'b1', runItemId: 'i1', number: 'NW-1', vendorName: 'Northwind Staffing', lineId: 'l1', shareKey: 'cc1',
  rowId: 'l1:cc1', generation: 1, currency: 'USD', amountCents: 10_000, state: 'SENT', answeredKeys: [], ...over,
})
const row = (over: Partial<AnswerRow> = {}): AnswerRow => ({
  line: 2, rowId: 'l1:cc1', lineId: '', status: 'paid', reason: '', reference: 'PAY-1', paidOn: '2026-11-10', amount: '', ...over,
})
const today = new Date('2026-11-16T00:00:00Z')
const decide = (rows: AnswerRow[], sent: SentRow[] = [sentRow()], foreign: string[] = [], lines = new Map([['b1', ['l1']]])) =>
  decideAnswer(rows, sent, new Set(foreign), lines, today)

describe('reading the answer from the client’s system', () => {
  it('a file is read by the row id or the line id, with the status, reason, reference and paid date', () => {
    const p = parseAnswer('etyme_row_id,status,reason,reference,paid_on\nl1:cc1,rejected,Wrong GL,,\n')
    expect(p.ok && p.rows[0]).toMatchObject({ rowId: 'l1:cc1', status: 'rejected', reason: 'Wrong GL' })
    const q = parseAnswer('etyme_line_id,status\nl1,accepted\n')
    expect(q.ok && q.rows[0].lineId).toBe('l1')
  })
  it('the client’s own headers are chosen on the way in, and a header that is not in the file is said', () => {
    const p = parseAnswer('Doc,Result,Why\nl1:cc1,paid,\n', { rowId: 'Doc', status: 'Result', reason: 'Why' })
    expect(p.ok && p.rows[0]).toMatchObject({ rowId: 'l1:cc1', status: 'paid' })
    const bad = parseAnswer('a,b\n1,2\n', { status: 'Nope', rowId: 'a' })
    expect(!bad.ok && bad.says).toContain('Nope')
  })
  it('a file that names no row or no status is refused in a sentence', () => {
    expect(parseAnswer('status\npaid\n').ok).toBe(false)
    expect(parseAnswer('etyme_row_id\nl1:cc1\n').ok).toBe(false)
  })
  it('a rejection without its reason is refused, because the supplier reads it', () => {
    const d = decide([row({ status: 'rejected', reason: '' })])
    expect(d.apply).toEqual([])
    expect(d.refused[0].says).toContain('reason')
  })
  it('a rejected row is recorded as rejected and an accepted row as accepted', () => {
    const d = decide([row({ status: 'rejected', reason: 'No such order' })])
    expect(d.apply.map((x) => x.status)).toEqual(['REJECTED'])
    expect(decide([row({ status: 'accepted' })]).apply.map((x) => x.status)).toEqual(['ACCEPTED'])
  })
  it('a row whose amount differs from what was sent is refused and nothing is written', () => {
    const d = decide([row({ amount: '99.00' })])
    expect(d.apply).toEqual([])
    expect(d.refused[0].says).toMatch(/was sent at 100\.00/)
    expect(decide([row({ amount: '100.00' })]).apply).toHaveLength(1)
  })
  it('an answer row for another company’s line is refused and marked to be logged', () => {
    const d = decide([row({ rowId: 'zz:cc9' })], [sentRow()], ['zz'])
    expect(d.apply).toEqual([])
    expect(d.refused[0].foreign).toBe(true)
    expect(d.refused[0].says).not.toMatch(/zz|company called/)
  })
  it('a row that names nothing sent in this run is refused', () => {
    expect(decide([row({ rowId: 'nope:cc1' })]).refused[0].says).toContain('not in a file')
  })
  it('the same answer twice is recognized by its key and changes nothing', () => {
    const first = decide([row()])
    const key = first.apply[0].key
    const second = decide([row()], [sentRow({ answeredKeys: [key] })])
    expect(second.apply).toEqual([])
    expect(second.alreadyRecorded).toHaveLength(1)
  })
  it('a paid row needs a reference and a paid date that has happened', () => {
    expect(decide([row({ reference: '' })]).refused).toHaveLength(1)
    expect(decide([row({ paidOn: '2026-12-31' })]).refused[0].says).toContain('not happened')
    expect(decide([row({ paidOn: 'soon' })]).refused[0].says).toContain('not a paid date')
  })
  it('an invoice is paid whole: paying one share of two is refused until every row says paid', () => {
    const sent = [sentRow(), sentRow({ rowId: 'l1:cc2', shareKey: 'cc2' })]
    const d = decide([row()], sent)
    expect(d.apply).toEqual([])
    expect(d.refused[0].says).toContain('paid whole')
    expect(decide([row(), row({ line: 3, rowId: 'l1:cc2' })], sent).apply).toHaveLength(2)
  })
  it('an invoice with a line that was never in a file cannot be paid by the file', () => {
    const d = decide([row()], [sentRow()], [], new Map([['b1', ['l1', 'l2']]]))
    expect(d.apply).toEqual([])
    expect(d.refused[0].says).toContain('not in a file yet')
  })
})

describe('what a line says about itself', () => {
  const at = (n: number) => new Date(Date.UTC(2026, 10, n))
  it('the payer reads Sent, Accepted by your system, Rejected with the reason, Paid with the day and reference, and why a line is not sent yet', () => {
    expect(stateInWords({ state: 'SENT', direction: 'OUT', createdAt: at(1) }, null)).toBe('Sent')
    expect(stateInWords({ state: 'ACCEPTED', direction: 'IN', createdAt: at(1) }, null)).toBe('Accepted by your system')
    expect(stateInWords({ state: 'REJECTED', direction: 'IN', createdAt: at(1), reason: 'Wrong GL' }, null)).toBe('Rejected: Wrong GL')
    expect(stateInWords({ state: 'PAID', direction: 'IN', createdAt: at(1), answeredAt: at(10), externalRef: 'PAY-9' }, null)).toMatch(/^Paid on .*10.*, ref PAY-9$/)
    expect(stateInWords(null, 'it has no cost center of yours.')).toBe('Not sent yet: it has no cost center of yours.')
  })
  it('the supplier reads the client’s system, never your system', () => {
    expect(stateInWords({ state: 'ACCEPTED', direction: 'IN', createdAt: at(1) }, null, 'SUPPLIER')).toContain('client’s system')
    expect(stateInWords({ state: 'REJECTED', direction: 'IN', createdAt: at(1) }, null, 'SUPPLIER')).toContain('client’s system')
  })
  it('a split line reads its worst row first, and a later answer stands over the send', () => {
    const sent = { state: 'SENT' as const, direction: 'OUT' as const, createdAt: at(1) }
    const rej = { state: 'REJECTED' as const, direction: 'IN' as const, createdAt: at(2), reason: 'x' }
    const paid = { state: 'PAID' as const, direction: 'IN' as const, createdAt: at(2) }
    expect(standingOfRows([paid, rej])?.state).toBe('REJECTED')
    expect(standingOfRows([paid, null])).toBeNull()
    expect(standingMessage([sent, paid])?.state).toBe('PAID')
  })
})
