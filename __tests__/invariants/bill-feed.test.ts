import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { mayGoInFile, feedKey, nextGeneration, type FeedMessageRead } from '@/lib/money/bill-feed'

const t = (n: number) => new Date(Date.UTC(2026, 10, n))
const msg = (state: FeedMessageRead['state'], day: number, direction: FeedMessageRead['direction'] = 'OUT'): FeedMessageRead =>
  ({ state, direction, createdAt: t(day) })

describe('the message record for invoice lines', () => {
  it('a line never sent may go in a file', () => {
    expect(mayGoInFile([], null).ok).toBe(true)
  })
  it('a line in a sent file is never in the next one', () => {
    const r = mayGoInFile([msg('SENT', 2)], t(9))
    expect(r.ok).toBe(false)
  })
  it('a line your system accepted or paid is never sent again, however it was changed', () => {
    expect(mayGoInFile([msg('SENT', 2), msg('ACCEPTED', 3, 'IN')], t(9)).ok).toBe(false)
    expect(mayGoInFile([msg('SENT', 2), msg('PAID', 4, 'IN')], t(9)).ok).toBe(false)
  })
  it('a line waiting in a file that has not left is not put in a second file', () => {
    expect(mayGoInFile([msg('QUEUED', 2)], t(9)).ok).toBe(false)
  })
  it('a rejected line may be sent again once it is fixed', () => {
    const history = [msg('SENT', 2), msg('REJECTED', 3, 'IN')]
    expect(mayGoInFile(history, t(5)).ok).toBe(true)
  })
  it('a rejected line that has not been changed stays held, and says so', () => {
    const r = mayGoInFile([msg('SENT', 2), msg('REJECTED', 3, 'IN')], t(1))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.says).toMatch(/rejected/)
    expect(mayGoInFile([msg('REJECTED', 3, 'IN')], null).ok).toBe(false)
  })
  it('a line whose send failed may go again once it is fixed', () => {
    expect(mayGoInFile([msg('FAILED', 3)], t(4)).ok).toBe(true)
    expect(mayGoInFile([msg('FAILED', 3)], t(2)).ok).toBe(false)
  })
  it('a superseded message is history and does not hold the line', () => {
    expect(mayGoInFile([msg('SUPERSEDED', 2)], null).ok).toBe(true)
  })
  it('a line sent again after a fix is held again until its new answer is in', () => {
    const history = [msg('SUPERSEDED', 2), msg('REJECTED', 3, 'IN'), msg('SENT', 6)]
    expect(mayGoInFile(history, t(5)).ok).toBe(false)
  })
  it('two requests for one run make one message', () => {
    const a = feedKey({ runId: 'r1', lineId: 'l1', shareKey: 'cc1', direction: 'OUT', generation: nextGeneration([], 'OUT') })
    const b = feedKey({ runId: 'r1', lineId: 'l1', shareKey: 'cc1', direction: 'OUT', generation: nextGeneration([], 'OUT') })
    expect(a).toBe(b)
  })
  it('a re-send after a fix takes a new key, and another line or share takes its own', () => {
    const first = feedKey({ runId: 'r1', lineId: 'l1', direction: 'OUT', generation: 1 })
    expect(feedKey({ runId: 'r1', lineId: 'l1', direction: 'OUT', generation: nextGeneration([{ direction: 'OUT' }], 'OUT') })).not.toBe(first)
    expect(feedKey({ runId: 'r1', lineId: 'l2', direction: 'OUT', generation: 1 })).not.toBe(first)
    expect(feedKey({ runId: 'r1', lineId: 'l1', shareKey: 'cc2', direction: 'OUT', generation: 1 })).not.toBe(first)
  })
  it('the table holds one row per key, so a second request cannot make a second message', () => {
    const schema = readFileSync('prisma/schema.prisma', 'utf8')
    const m = schema.match(/^model BillFeedMessage \{([\s\S]*?)^\}/m)![1]
    expect(m).toMatch(/idempotencyKey\s+String\s+@unique/)
  })
})
