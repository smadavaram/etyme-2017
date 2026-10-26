import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isAct, OWED_CHANGED_EVENT, OWED_SETTLE_MS } from '@/lib/owed-count'

/**
 * The Ask Etyme mark reads its number again after an act.
 *
 * Found on the walk, 2026-10-22: Today said "Two things need you" while
 * the mark beside it still said 3. The mark read once a minute, and an
 * approval in between did not move it until a reload or the next minute.
 */

describe('which calls are acts that can change what a seat owes', () => {
  const page = 'https://etyme2040.vercel.app'

  it('a week approved, a card answered and an invoice receipt paid are acts', () => {
    expect(isAct('POST', '/api/timesheets/t1/approve', 200, page)).toBe(true)
    expect(isAct('POST', '/api/twin/approvals/a1', 200, page)).toBe(true)
    expect(isAct('POST', '/api/invoices/i1/payments', 201, page)).toBe(true)
    expect(isAct('PATCH', `${page}/api/supplier-requests/r1`, 200, page)).toBe(true)
  })

  it('a read is never an act, so the mark reading its own number cannot set itself off', () => {
    expect(isAct('GET', '/api/conversations/twin?only=owed', 200, page)).toBe(false)
    expect(isAct(undefined, '/api/decisions', 200, page)).toBe(false)
  })

  it('a refused write changed nothing, so it is not an act', () => {
    expect(isAct('POST', '/api/timesheets/t1/approve', 403, page)).toBe(false)
    expect(isAct('POST', '/api/timesheets/t1/approve', 500, page)).toBe(false)
  })

  it('an error report, a sign-in and a call to another site are not acts', () => {
    expect(isAct('POST', '/api/incidents', 200, page)).toBe(false)
    expect(isAct('POST', '/api/auth/callback/google', 200, page)).toBe(false)
    expect(isAct('POST', 'https://api.example.com/api/anything', 200, page)).toBe(false)
    expect(isAct('POST', '/dashboard/program', 200, page)).toBe(false)
  })
})

describe('the mark on screen after an act', () => {
  let owedNow = 3
  const reads: string[] = []
  const saved: Record<string, unknown> = {}
  /** A response as the store reads it, settled at once rather than streamed. */
  const reply = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
    owedNow = 3
    reads.length = 0
    for (const k of ['window', 'fetch', 'addEventListener', 'dispatchEvent', 'location']) saved[k] = (globalThis as any)[k]
    const g = globalThis as any
    g.window = g
    g.location = { origin: 'http://localhost' }
    const target = new EventTarget()
    g.addEventListener = target.addEventListener.bind(target)
    g.dispatchEvent = target.dispatchEvent.bind(target)
    g.fetch = vi.fn(async (input: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (method === 'GET' && input.startsWith('/api/conversations/twin?only=owed')) {
        reads.push(input)
        return reply(200, { data: { total: owedNow } })
      }
      if (input === '/api/timesheets/t1/approve') { owedNow = 2; return reply(200) }
      if (input === '/api/timesheets/t2/approve') return reply(403)
      return reply(200)
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    for (const [k, v] of Object.entries(saved)) (globalThis as any)[k] = v
  })

  /** Let pending promises run, the fetch stub's and the store's. */
  const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }

  it('a week approved on Today brings the mark from 3 to 2 without waiting for the minute', async () => {
    const { subscribeOwed } = await import('@/components/shell/ask-etyme-mark')
    const seen: (number | null)[] = []
    const stop = subscribeOwed((n) => seen.push(n))
    await settle()
    expect(seen.at(-1)).toBe(3)

    await (globalThis as any).fetch('/api/timesheets/t1/approve', { method: 'POST' })
    await settle()
    vi.advanceTimersByTime(OWED_SETTLE_MS)
    await settle()

    expect(seen.at(-1)).toBe(2)
    expect(reads).toHaveLength(2)
    stop()
  })

  it('a refused approval does not make the mark read again', async () => {
    const { subscribeOwed } = await import('@/components/shell/ask-etyme-mark')
    const stop = subscribeOwed(() => {})
    await settle()
    await (globalThis as any).fetch('/api/timesheets/t2/approve', { method: 'POST' })
    vi.advanceTimersByTime(OWED_SETTLE_MS)
    await settle()
    expect(reads).toHaveLength(1)
    stop()
  })

  it('three acts in a burst are one read, not three', async () => {
    const { subscribeOwed } = await import('@/components/shell/ask-etyme-mark')
    const stop = subscribeOwed(() => {})
    await settle()
    for (const id of ['a1', 'a2', 'a3']) await (globalThis as any).fetch(`/api/twin/approvals/${id}`, { method: 'POST' })
    await settle()
    vi.advanceTimersByTime(OWED_SETTLE_MS)
    await settle()
    expect(reads).toHaveLength(2)
    stop()
  })

  it('a screen whose act is not a call to /api says so with the event, and the mark reads again', async () => {
    const { subscribeOwed } = await import('@/components/shell/ask-etyme-mark')
    const { announceOwedChanged } = await import('@/lib/owed-count')
    const stop = subscribeOwed(() => {})
    await settle()
    owedNow = 1
    announceOwedChanged()
    vi.advanceTimersByTime(OWED_SETTLE_MS)
    await settle()
    expect(reads).toHaveLength(2)
    expect(OWED_CHANGED_EVENT).toBe('etyme:owed-changed')
    stop()
  })
})
