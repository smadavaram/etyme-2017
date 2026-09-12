import { describe, it, expect } from 'vitest'
import { EVENT_TYPES, isKnownEventType } from '@/lib/events'

/**
 * The event log is the one record that has to still be true in 2030.
 *
 * These tests pin the two things that would quietly ruin it: a name that
 * reads like a command instead of a fact, and a name changing after
 * somebody outside has started filtering on it.
 */

describe('what an event is called', () => {
  it('names every event in the past tense, because an event is something that already happened', () => {
    // A name like "invoice.pay" invites a consumer to treat the log as a
    // queue of instructions. Every name here ends in a completed action.
    const presentTenseEndings = [
      '.pay', '.create', '.approve', '.reject', '.send', '.raise',
      '.submit', '.withdraw', '.award', '.extend', '.revoke', '.grant',
      '.expire', '.match', '.request', '.complete', '.publish', '.respond',
      '.join', '.close',
    ]
    const offenders = EVENT_TYPES.filter((t) =>
      presentTenseEndings.some((e) => t.endsWith(e))
    )
    expect(offenders).toEqual([])
  })

  it('gives every event a subject and an action separated by a dot', () => {
    for (const t of EVENT_TYPES) {
      expect(t).toMatch(/^[a-z_]+\.[a-z_]+$/)
    }
  })

  it('has no duplicate event names', () => {
    expect(new Set(EVENT_TYPES).size).toBe(EVENT_TYPES.length)
  })

  it('recognises a real event name', () => {
    expect(isKnownEventType('invoice.paid')).toBe(true)
  })

  it('refuses a name nobody emits, so a typo in a webhook subscription is caught rather than silently receiving nothing', () => {
    expect(isKnownEventType('invoice.payed')).toBe(false)
    expect(isKnownEventType('')).toBe(false)
  })

  it('covers the whole money chain, because an integration that can see an invoice but not its payment is not worth wiring', () => {
    for (const needed of [
      'timesheet.approved',
      'invoice.generated',
      'invoice.matched',
      'invoice.paid',
      'purchase_order.raised',
    ]) {
      expect(isKnownEventType(needed)).toBe(true)
    }
  })

  it('covers the demand chain end to end', () => {
    for (const needed of [
      'requisition.raised',
      'requisition.approved',
      'invitation.sent',
      'submission.created',
      'submission.awarded',
      'contract.created',
    ]) {
      expect(isKnownEventType(needed)).toBe(true)
    }
  })

  it('records access changes, because who could see what is the question an auditor asks first', () => {
    expect(isKnownEventType('access.granted')).toBe(true)
    expect(isKnownEventType('access.revoked')).toBe(true)
  })
})
