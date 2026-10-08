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
  routeFor, attemptDelivery, deliverySummary, demoAddress, DEMO_ADDRESS_NOTE,
  type Sender, type Recipient,
} from '@/lib/notification-delivery'

const NOW = new Date('2026-08-16T09:00:00Z')

function recipient(over: Partial<Recipient> = {}): Recipient {
  return {
    isConsultant: false,
    email: 'd.whitfield@terumobct.com',
    // A Workflows link. The Office 365 Connector kind this used to be
    // was switched off by Microsoft in May 2026; see teams-workflows.test.ts.
    teamsWebhookUrl: 'https://prod-27.westus.logic.azure.com:443/workflows/abc/triggers/manual/paths/invoke?sig=x',
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

describe('No email ever leaves for a reserved demo address (sign-up walk, round two, item 30)', () => {

  it('no email ever leaves for a reserved demo address; the notice is kept and says why it was not sent', async () => {
    const asked: string[] = []
    const recording: Sender = { channel: 'EMAIL', async send(to) { asked.push(to) } }
    for (const to of [
      'eleanor.vance@cavanaugh-glassworks.example',
      'priya@supplier.invalid',
      'karthik@demo.etyme.local',
      'dana@demo.etyme.app',
      'omar@seed.etyme.io',
      'lena@example.com',
      'marcus@mail.example.org',
    ]) {
      const o = await attemptDelivery(
        routeFor(recipient({ teamsWebhookUrl: null, email: to })), to, 'T', 'B', [recording], NOW
      )
      expect(o.state, to).toBe('NOT_CONFIGURED')
      expect(o.note, to).toBe('demo address, nothing sent')
      expect(o.deliveredAt, to).toBeNull()
    }
    expect(asked).toEqual([])
  })

  it('a test address and a real address with the word example in its name are still sent', async () => {
    const asked: string[] = []
    const recording: Sender = { channel: 'EMAIL', async send(to) { asked.push(to) } }
    for (const to of ['dana@cavanaugh.test', 'somebody@myexample.com']) {
      const o = await attemptDelivery(
        routeFor(recipient({ teamsWebhookUrl: null })), to, 'T', 'B', [recording], NOW
      )
      expect(o.state, to).toBe('SENT')
      expect(demoAddress(to), to).toBe(false)
    }
    expect(asked).toEqual(['dana@cavanaugh.test', 'somebody@myexample.com'])
  })

  it('the email sender itself refuses a demo address before it calls the provider, with the same reason', async () => {
    const env = { ...process.env }
    process.env.RESEND_API_KEY = 'test-key'
    process.env.NOTIFY_FROM_EMAIL = 'notices@etyme.test'
    const realFetch = globalThis.fetch
    let called = false
    globalThis.fetch = (async () => { called = true; return new Response('{}') }) as typeof fetch
    try {
      const { emailSender } = await import('@/lib/senders')
      await expect(emailSender()!.send('a@b.example', 'T', 'B')).rejects.toThrow(DEMO_ADDRESS_NOTE)
      expect(called).toBe(false)
    } finally {
      globalThis.fetch = realFetch
      process.env = env
    }
  })
})
