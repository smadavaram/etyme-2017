import { describe, it, expect } from 'vitest'
import { recall, remember, type Remembers } from '@/lib/remember'

/**
 * Remembering what somebody chose last time.
 *
 * Small, and every branch here is one that took a page down in some
 * browser somewhere: storage that throws on read, storage that throws on
 * write, and a value written by an older version of the code that no
 * longer means anything.
 */

/** A store that works. */
function working(seed: Record<string, string> = {}): Remembers {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  }
}

/** A browser with site data blocked: the accessor itself throws. */
const hostile: Remembers = {
  getItem() {
    throw new Error('The operation is insecure.')
  },
  setItem() {
    throw new Error('The operation is insecure.')
  },
}

const SIDES = ['sent', 'received'] as const

describe('remembering a reader’s choice', () => {
  it('gives back the fallback when they have never chosen', () => {
    expect(recall('submissions.direction.abc', 'received', SIDES, working())).toBe('received')
  })

  it('gives back what they chose last time instead of the fallback', () => {
    const store = working({ 'etyme.submissions.direction.abc': 'sent' })
    expect(recall('submissions.direction.abc', 'received', SIDES, store)).toBe('sent')
  })

  it('ignores a stored value that is no longer one of the choices', () => {
    const store = working({ 'etyme.submissions.direction.abc': 'inbound' })
    expect(recall('submissions.direction.abc', 'received', SIDES, store)).toBe('received')
  })

  it('keeps one company’s choice separate from another’s', () => {
    const store = working()
    remember('submissions.direction.harlow', 'received', store)
    remember('submissions.direction.cloudepa', 'sent', store)
    expect(recall('submissions.direction.harlow', 'sent', SIDES, store)).toBe('received')
    expect(recall('submissions.direction.cloudepa', 'received', SIDES, store)).toBe('sent')
  })

  it('reads back what it just wrote', () => {
    const store = working()
    remember('submissions.direction.abc', 'sent', store)
    expect(recall('submissions.direction.abc', 'received', SIDES, store)).toBe('sent')
  })

  it('namespaces what it stores so it cannot collide with another app on the domain', () => {
    const store = working()
    remember('submissions.direction.abc', 'sent', store)
    expect(store.getItem('etyme.submissions.direction.abc')).toBe('sent')
    expect(store.getItem('submissions.direction.abc')).toBeNull()
  })

  it('falls back rather than throwing when the browser blocks site data', () => {
    expect(() => recall('anything', 'sent', SIDES, hostile)).not.toThrow()
    expect(recall('anything', 'sent', SIDES, hostile)).toBe('sent')
  })

  it('carries on rather than throwing when the store refuses a write', () => {
    expect(() => remember('anything', 'sent', hostile)).not.toThrow()
  })

  it('falls back rather than throwing when there is no store at all', () => {
    expect(recall('anything', 'received', SIDES, null)).toBe('received')
    expect(() => remember('anything', 'sent', null)).not.toThrow()
  })
})
