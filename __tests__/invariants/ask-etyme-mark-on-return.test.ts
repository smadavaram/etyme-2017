import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mayReadOnReturn, OWED_REFRESH_MS, OWED_RETURN_GAP_MS } from '@/lib/owed-count'

/**
 * The Ask Etyme mark reads its number again when the person comes back to
 * the page (conversation's decided fix, 2026-11-01). A browser slows a tab
 * nobody looks at, so a person returning read a number up to a minute old,
 * or older, beside a Today that had just loaded fresh.
 */

describe('when coming back may read the number again', () => {
  it('coming back to the page reads the mark again only where the last read is ten seconds old or more', () => {
    expect(OWED_RETURN_GAP_MS).toBe(10_000)
    expect(mayReadOnReturn(null, 5)).toBe(true)
    expect(mayReadOnReturn(1_000, 1_000 + OWED_RETURN_GAP_MS - 1)).toBe(false)
    expect(mayReadOnReturn(1_000, 1_000 + OWED_RETURN_GAP_MS)).toBe(true)
  })
})

describe('the mark on screen when the person comes back', () => {
  let owedNow = 3
  const reads: number[] = []
  const saved: Record<string, unknown> = {}
  let doc: EventTarget & { visibilityState: string }
  const reply = (body: unknown) => ({ ok: true, status: 200, json: async () => body })

  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
    owedNow = 3
    reads.length = 0
    for (const k of ['window', 'document', 'fetch', 'addEventListener', 'removeEventListener', 'dispatchEvent', 'location']) saved[k] = (globalThis as any)[k]
    const g = globalThis as any
    g.window = g
    g.location = { origin: 'http://localhost' }
    const win = new EventTarget()
    g.addEventListener = win.addEventListener.bind(win)
    g.removeEventListener = win.removeEventListener.bind(win)
    g.dispatchEvent = win.dispatchEvent.bind(win)
    doc = Object.assign(new EventTarget(), { visibilityState: 'visible' })
    g.document = doc
    g.fetch = vi.fn(async (input: string) => {
      if (input.startsWith('/api/conversations/twin?only=owed')) {
        reads.push(Date.now())
        return reply({ data: { total: owedNow } })
      }
      return reply({})
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    for (const [k, v] of Object.entries(saved)) (globalThis as any)[k] = v
  })

  const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }

  it('a person who comes back to the tab after a while sees the number as it is now, not as it was a minute ago', async () => {
    const { subscribeOwed } = await import('@/components/shell/ask-etyme-mark')
    const seen: (number | null)[] = []
    const stop = subscribeOwed((n) => seen.push(n))
    await settle()
    expect(seen.at(-1)).toBe(3)

    doc.visibilityState = 'hidden'
    doc.dispatchEvent(new Event('visibilitychange'))
    owedNow = 1
    vi.advanceTimersByTime(30_000)
    doc.visibilityState = 'visible'
    doc.dispatchEvent(new Event('visibilitychange'))
    await settle()
    expect(seen.at(-1)).toBe(1)
    expect(reads).toHaveLength(2)
    stop()
  })

  it('focusing the window right after a read asks nothing, and the page going to the background never reads', async () => {
    const { subscribeOwed } = await import('@/components/shell/ask-etyme-mark')
    const stop = subscribeOwed(() => {})
    await settle()
    vi.advanceTimersByTime(OWED_RETURN_GAP_MS - 1_000)
    ;(globalThis as any).dispatchEvent(new Event('focus'))
    doc.visibilityState = 'hidden'
    doc.dispatchEvent(new Event('visibilitychange'))
    await settle()
    expect(reads).toHaveLength(1)
    stop()
  })

  it('the once-a-minute read stays, and nothing listens once no mark is on screen', async () => {
    const { subscribeOwed } = await import('@/components/shell/ask-etyme-mark')
    const stop = subscribeOwed(() => {})
    await settle()
    vi.advanceTimersByTime(OWED_REFRESH_MS)
    await settle()
    expect(reads).toHaveLength(2)
    stop()
    vi.advanceTimersByTime(OWED_REFRESH_MS * 2)
    doc.dispatchEvent(new Event('visibilitychange'))
    ;(globalThis as any).dispatchEvent(new Event('focus'))
    await settle()
    expect(reads).toHaveLength(2)
  })
})
