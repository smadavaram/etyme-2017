/**
 * Which way a notification travels, and whether it actually left.
 *
 * Two populations, two channels (CLAUDE.md): business users are reached on
 * their company's Teams channel with email as the fallback; consultants by
 * email only, because they are not in anybody's Teams tenant.
 *
 * The quieter problem these tests exist for: a notification was written
 * with channel EMAIL and nothing ever sent it. Its status said UNREAD,
 * which looks exactly like a message that arrived and was ignored. The
 * system appeared to have told somebody when it had not.
 */

import { describe, it, expect } from 'vitest'
import {
  routeFor, attemptDelivery, deliverySummary,
  type Sender, type Recipient,
} from '@/lib/notification-delivery'

const NOW = new Date('2026-08-16T09:00:00Z')

function recipient(over: Partial<Recipient> = {}): Recipient {
  return {
    isConsultant: false,
    email: 'd.whitfield@terumobct.com',
    teamsWebhookUrl: 'https://outlook.office.com/webhook/abc',
    ...over,
  }
}

const workingEmail: Sender = { channel: 'EMAIL', async send() {} }
const workingTeams: Sender = { channel: 'TEAMS', async send() {} }
const brokenEmail: Sender = {
  channel: 'EMAIL',
  async send() { throw new Error('550 mailbox unavailable') },
}

describe('Business users are reached where they already are', () => {

  it('a company with a Teams channel gets Teams', () => {
    expect(routeFor(recipient()).channel).toBe('TEAMS')
  })

  it('a company without one falls back to email, and says why', () => {
    const r = routeFor(recipient({ teamsWebhookUrl: null }))
    expect(r.channel).toBe('EMAIL')
    expect(r.reason).toContain('No Teams channel set up')
  })

  it('with neither, it stays in the app and says nothing can be sent', () => {
    const r = routeFor(recipient({ teamsWebhookUrl: null, email: null }))
    expect(r.channel).toBe('IN_APP')
    expect(r.blocked).toContain('Nowhere to send this')
  })
})

describe('Consultants are reached by email, never Teams', () => {

  it('a consultant gets email even where a Teams channel exists', () => {
    // They are on a vendor's bench, not in that vendor's Teams tenant.
    const r = routeFor(recipient({ isConsultant: true }))
    expect(r.channel).toBe('EMAIL')
    expect(r.reason).toContain('Consultants are reached by email')
  })

  it('a consultant with no address is flagged rather than silently skipped', () => {
    const r = routeFor(recipient({ isConsultant: true, email: null }))
    expect(r.blocked).toContain('no email address')
  })
})

describe('Whether it left is not the same question as whether it was read', () => {

  it('with a working sender it is sent, and stamped', async () => {
    const o = await attemptDelivery(
      routeFor(recipient()), 'https://hook', 'Title', 'Body', [workingTeams], NOW
    )
    expect(o.state).toBe('SENT')
    expect(o.deliveredAt).toEqual(NOW)
  })

  it('with nothing set up it is NOT_CONFIGURED, never SENT', async () => {
    // The bug this whole file exists for. Nothing sends email, so saying
    // SENT would be a lie, and saying FAILED would send somebody hunting a
    // bounce that never happened.
    const o = await attemptDelivery(
      routeFor(recipient({ teamsWebhookUrl: null })), 'd@terumobct.com', 'T', 'B', [], NOW
    )
    expect(o.state).toBe('NOT_CONFIGURED')
    expect(o.note).toContain('Nothing is set up to send email')
    expect(o.deliveredAt).toBeNull()
  })

  it('a sender that throws is FAILED, and keeps the reason', async () => {
    const o = await attemptDelivery(
      routeFor(recipient({ teamsWebhookUrl: null })), 'd@terumobct.com', 'T', 'B', [brokenEmail], NOW
    )
    expect(o.state).toBe('FAILED')
    expect(o.note).toContain('550 mailbox unavailable')
  })

  it('failed and not-configured are never collapsed together', () => {
    // They lead to different work: one is a broken address, the other is a
    // setup nobody has done.
    const s = deliverySummary([
      { deliveryState: 'FAILED' },
      { deliveryState: 'NOT_CONFIGURED' },
      { deliveryState: 'NOT_CONFIGURED' },
      { deliveryState: 'SENT' },
    ])
    expect(s.failed).toBe(1)
    expect(s.notConfigured).toBe(2)
    expect(s.healthy).toBe(false)
  })

  it('in-app needs no sender and counts as delivered', async () => {
    const o = await attemptDelivery(
      { channel: 'IN_APP', reason: 'x', blocked: null }, null, 'T', 'B', [], NOW
    )
    expect(o.state).toBe('SENT')
  })

  it('in-app that could not reach them any other way is not called delivered', async () => {
    const o = await attemptDelivery(
      routeFor(recipient({ teamsWebhookUrl: null, email: null })), null, 'T', 'B', [], NOW
    )
    expect(o.state).toBe('NOT_CONFIGURED')
  })

  it('everything sent is healthy', () => {
    expect(deliverySummary([{ deliveryState: 'SENT' }, { deliveryState: 'SENT' }]).healthy).toBe(true)
  })
})
