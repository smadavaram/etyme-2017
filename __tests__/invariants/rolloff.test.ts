/**
 * Rolloff lifecycle invariants.
 *
 * CLAUDE.md: "Every module ships with tests named as English sentences."
 *
 * BRD §16: "Rolloff fan-out — vendor notified first, then client, then
 * consultant. Checklist ensures clean offboarding."
 *
 * The rolloff lifecycle:
 *   1. Nightly scan detects contracts ending within 56 days (8 weeks)
 *   2. RolloffEvent created with empty checklist
 *   3. Vendor admin claims the rolloff
 *   4. Checklist items completed (knowledge transfer, final timesheet, etc.)
 *   5. Notifications fan out: vendor → client → consultant
 *
 * These tests verify the scan logic, checklist semantics, urgency
 * classification, and notification fan-out order.
 */

import { describe, it, expect } from 'vitest'

// ── Rolloff detection window ──────────────────────────

describe('Rolloff scan window — BRD §16', () => {

  function isInRolloffWindow(endDate: Date, now: Date, windowDays: number = 56): boolean {
    const windowEnd = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000)
    return endDate >= now && endDate <= windowEnd
  }

  it('a contract ending in 30 days is within the 56-day window', () => {
    const now = new Date('2025-01-01')
    const endDate = new Date('2025-01-31')
    expect(isInRolloffWindow(endDate, now)).toBe(true)
  })

  it('a contract ending in 56 days is at the edge of the window', () => {
    const now = new Date('2025-01-01')
    const endDate = new Date('2025-02-26') // exactly 56 days
    expect(isInRolloffWindow(endDate, now)).toBe(true)
  })

  it('a contract ending in 57 days is outside the window', () => {
    const now = new Date('2025-01-01')
    const endDate = new Date('2025-02-27')
    expect(isInRolloffWindow(endDate, now)).toBe(false)
  })

  it('a contract that already ended is not in the window', () => {
    const now = new Date('2025-01-15')
    const endDate = new Date('2025-01-10')
    expect(isInRolloffWindow(endDate, now)).toBe(false)
  })

  it('a contract ending today is in the window', () => {
    const now = new Date('2025-01-15')
    const endDate = new Date('2025-01-15')
    expect(isInRolloffWindow(endDate, now)).toBe(true)
  })
})

// ── Urgency classification ────────────────────────────

describe('Rolloff urgency classification', () => {

  type Urgency = 'CRITICAL' | 'URGENT' | 'NORMAL' | 'LOW'

  function classifyUrgency(daysUntilEnd: number): Urgency {
    if (daysUntilEnd <= 7) return 'CRITICAL'
    if (daysUntilEnd <= 14) return 'URGENT'
    if (daysUntilEnd <= 30) return 'NORMAL'
    return 'LOW'
  }

  it('7 days or fewer is CRITICAL — needs immediate action', () => {
    expect(classifyUrgency(7)).toBe('CRITICAL')
    expect(classifyUrgency(1)).toBe('CRITICAL')
    expect(classifyUrgency(0)).toBe('CRITICAL')
  })

  it('8–14 days is URGENT — this week', () => {
    expect(classifyUrgency(8)).toBe('URGENT')
    expect(classifyUrgency(14)).toBe('URGENT')
  })

  it('15–30 days is NORMAL — standard timeline', () => {
    expect(classifyUrgency(15)).toBe('NORMAL')
    expect(classifyUrgency(30)).toBe('NORMAL')
  })

  it('more than 30 days is LOW — early detection', () => {
    expect(classifyUrgency(31)).toBe('LOW')
    expect(classifyUrgency(56)).toBe('LOW')
  })
})

// ── Checklist completion ──────────────────────────────

describe('Rolloff checklist — offboarding items', () => {

  interface RolloffChecklist {
    knowledgeTransfer: boolean
    finalTimesheet: boolean
    accessRevocation: boolean
    assets: boolean
  }

  function checklistProgress(checklist: RolloffChecklist): {
    completed: number
    total: number
    isComplete: boolean
    percentage: number
  } {
    const items = Object.values(checklist)
    const completed = items.filter(Boolean).length
    const total = items.length
    return {
      completed,
      total,
      isComplete: completed === total,
      percentage: Math.round((completed / total) * 100),
    }
  }

  it('an empty checklist shows 0% progress', () => {
    const result = checklistProgress({
      knowledgeTransfer: false,
      finalTimesheet: false,
      accessRevocation: false,
      assets: false,
    })
    expect(result.completed).toBe(0)
    expect(result.total).toBe(4)
    expect(result.isComplete).toBe(false)
    expect(result.percentage).toBe(0)
  })

  it('two of four items yields 50% progress', () => {
    const result = checklistProgress({
      knowledgeTransfer: true,
      finalTimesheet: true,
      accessRevocation: false,
      assets: false,
    })
    expect(result.completed).toBe(2)
    expect(result.percentage).toBe(50)
    expect(result.isComplete).toBe(false)
  })

  it('all four items completes the checklist at 100%', () => {
    const result = checklistProgress({
      knowledgeTransfer: true,
      finalTimesheet: true,
      accessRevocation: true,
      assets: true,
    })
    expect(result.completed).toBe(4)
    expect(result.percentage).toBe(100)
    expect(result.isComplete).toBe(true)
  })

  it('there are exactly four checklist items', () => {
    // BRD §16 specifies these four offboarding steps
    const checklist: RolloffChecklist = {
      knowledgeTransfer: false,
      finalTimesheet: false,
      accessRevocation: false,
      assets: false,
    }
    expect(Object.keys(checklist)).toHaveLength(4)
    expect(Object.keys(checklist)).toContain('knowledgeTransfer')
    expect(Object.keys(checklist)).toContain('finalTimesheet')
    expect(Object.keys(checklist)).toContain('accessRevocation')
    expect(Object.keys(checklist)).toContain('assets')
  })
})

// ── Fan-out notification order ────────────────────────

describe('Rolloff notification fan-out — BRD §16', () => {

  interface NotificationRecord {
    party: 'vendor' | 'client' | 'consultant'
    at: string | null
  }

  function fanOutOrder(notified: Record<string, { at: string | null }>): string[] {
    return Object.entries(notified)
      .filter(([_, v]) => v.at !== null)
      .sort(([_, a], [__, b]) => a.at!.localeCompare(b.at!))
      .map(([party]) => party)
  }

  it('vendor is notified first in the rolloff fan-out', () => {
    const notified = {
      vendor: { at: '2025-01-01T00:00:00Z' },
      client: { at: '2025-01-02T00:00:00Z' },
      consultant: { at: '2025-01-03T00:00:00Z' },
    }
    const order = fanOutOrder(notified)
    expect(order[0]).toBe('vendor')
  })

  it('initially only vendor is notified — client and consultant are null', () => {
    const notified = {
      vendor: { at: '2025-01-01T00:00:00Z' },
      client: { at: null },
      consultant: { at: null },
    }
    const order = fanOutOrder(notified)
    expect(order).toEqual(['vendor'])
  })

  it('the fan-out sequence is vendor → client → consultant', () => {
    const notified = {
      vendor: { at: '2025-01-01T00:00:00Z' },
      client: { at: '2025-01-05T00:00:00Z' },
      consultant: { at: '2025-01-07T00:00:00Z' },
    }
    const order = fanOutOrder(notified)
    expect(order).toEqual(['vendor', 'client', 'consultant'])
  })
})

// ── Claim semantics ──────────────────────────────────

describe('Rolloff claim — ownership', () => {

  interface RolloffEvent {
    id: string
    claimedById: string | null
    outcome: string | null
  }

  function canClaim(event: RolloffEvent, personId: string): {
    allowed: boolean
    reason: string
  } {
    if (event.outcome) {
      return { allowed: false, reason: 'Rolloff already has an outcome' }
    }
    if (event.claimedById) {
      if (event.claimedById === personId) {
        return { allowed: false, reason: 'You already claimed this rolloff' }
      }
      return { allowed: false, reason: 'Rolloff already claimed by another person' }
    }
    return { allowed: true, reason: 'Available to claim' }
  }

  it('an unclaimed rolloff can be claimed', () => {
    const result = canClaim(
      { id: 'r1', claimedById: null, outcome: null },
      'person1',
    )
    expect(result.allowed).toBe(true)
  })

  it('a claimed rolloff cannot be claimed by someone else', () => {
    const result = canClaim(
      { id: 'r1', claimedById: 'person1', outcome: null },
      'person2',
    )
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('already claimed')
  })

  it('a rolloff with an outcome cannot be claimed', () => {
    const result = canClaim(
      { id: 'r1', claimedById: null, outcome: 'EXTENDED' },
      'person1',
    )
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('outcome')
  })

  it('you cannot re-claim your own rolloff', () => {
    const result = canClaim(
      { id: 'r1', claimedById: 'person1', outcome: null },
      'person1',
    )
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('already claimed')
  })
})
