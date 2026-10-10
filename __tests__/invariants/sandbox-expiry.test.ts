import { describe, it, expect } from 'vitest'
import { DEMO_DAYS } from '@/lib/demo-seed'
import { DEMO_DAYS as CHAIN_DAYS } from '@/lib/demo-chain'
import { sandboxHandle, sandboxVerdict, warningText, SANDBOX_UNUSED_DAYS, SANDBOX_WARN_DAYS } from '@/lib/sandbox-expiry'

/**
 * A visitor's demo sandbox is removed after thirty days nobody used it,
 * and whoever left an address is told a week before (founder, 2026-09-30).
 */

const NOW = new Date('2026-09-30T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)

describe('how long a visitor’s sandbox is kept', () => {
  it('is kept thirty days from the last time anybody used it, and warned at twenty-three', () => {
    expect(SANDBOX_UNUSED_DAYS).toBe(30)
    expect(SANDBOX_WARN_DAYS).toBe(23)
    // The date a new sandbox is born with is the same thirty days.
    expect(DEMO_DAYS).toBe(SANDBOX_UNUSED_DAYS)
    expect(CHAIN_DAYS).toBe(SANDBOX_UNUSED_DAYS)
  })

  it('a sandbox used two days ago is kept', () => {
    expect(sandboxVerdict({ lastUsedAt: daysAgo(2), warnedAt: null, now: NOW }).act).toBe('KEEP')
  })

  it('a sandbox unused for twenty-three days is warned once, and not again until it is used', () => {
    expect(sandboxVerdict({ lastUsedAt: daysAgo(23), warnedAt: null, now: NOW }).act).toBe('WARN')
    expect(sandboxVerdict({ lastUsedAt: daysAgo(25), warnedAt: daysAgo(2), now: NOW }).act).toBe('KEEP')
    // Used after the warning: the clock starts again, and so does the warning.
    expect(sandboxVerdict({ lastUsedAt: daysAgo(24), warnedAt: daysAgo(40), now: NOW }).act).toBe('WARN')
  })

  it('a sandbox unused for thirty days is removed, warned or not', () => {
    expect(sandboxVerdict({ lastUsedAt: daysAgo(30), warnedAt: daysAgo(7), now: NOW }).act).toBe('REMOVE')
    expect(sandboxVerdict({ lastUsedAt: daysAgo(90), warnedAt: null, now: NOW }).act).toBe('REMOVE')
  })

  it('names the day it goes as thirty days after its last use', () => {
    expect(sandboxVerdict({ lastUsedAt: daysAgo(23), warnedAt: null, now: NOW }).removeOn.toISOString().slice(0, 10)).toBe('2026-10-07')
  })

  it('reads only the addresses the demo door writes, and a chain’s firms as one sandbox', () => {
    expect(sandboxHandle('demo-84d952625583')).toBe('84d952625583')
    expect(sandboxHandle('demo-270fead24d43-msp')).toBe('270fead24d43')
    expect(sandboxHandle('world-nike')).toBeNull()
    expect(sandboxHandle('acme-verify')).toBeNull()
  })

  it('the warning says the day it goes and that opening it keeps it, in plain words', () => {
    const t = warningText({ name: 'Norwood Consulting', removeOn: new Date('2026-10-07T00:00:00Z') })
    expect(t.subject).toBe('Your Etyme demo sandbox is removed on Wednesday, October 7, 2026')
    expect(t.body).toContain('Open it before then to keep it.')
  })
})
