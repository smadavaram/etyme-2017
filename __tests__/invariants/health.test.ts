/**
 * The health endpoint has to say when email is off, not just when the
 * model key is off.
 *
 * senderStatus() already existed — it is what the settings screen reads
 * — and /api/health never called it. So a deployment could report itself
 * fully healthy while every invitation, every dunning letter, every
 * "you've been submitted" notice silently went nowhere. The first anyone
 * would learn of it is a consultant saying "I never got the invite",
 * which is the same failure shape this file exists to catch in every
 * other corner of the product.
 */

import { describe, it, expect } from 'vitest'
import { senderStatus } from '@/lib/senders'

describe('Delivery status can always be read back, the way settings reads it', () => {

  it('says EMAIL is not configured when neither key is set', () => {
    const before = { resend: process.env.RESEND_API_KEY, sendgrid: process.env.SENDGRID_API_KEY, from: process.env.NOTIFY_FROM_EMAIL }
    delete process.env.RESEND_API_KEY
    delete process.env.SENDGRID_API_KEY
    delete process.env.NOTIFY_FROM_EMAIL

    const s = senderStatus().find((x) => x.channel === 'EMAIL')!
    expect(s.configured).toBe(false)
    expect(s.note).toContain('NOTIFY_FROM_EMAIL')
    expect(s.note).toContain('RESEND_API_KEY')

    if (before.resend) process.env.RESEND_API_KEY = before.resend
    if (before.sendgrid) process.env.SENDGRID_API_KEY = before.sendgrid
    if (before.from) process.env.NOTIFY_FROM_EMAIL = before.from
  })

  it('says EMAIL is configured once a sender and a from address exist', () => {
    const before = { resend: process.env.RESEND_API_KEY, from: process.env.NOTIFY_FROM_EMAIL }
    process.env.RESEND_API_KEY = 're_test_key'
    process.env.NOTIFY_FROM_EMAIL = 'onboarding@resend.dev'

    const s = senderStatus().find((x) => x.channel === 'EMAIL')!
    expect(s.configured).toBe(true)
    expect(s.note).toBe('Email is set up and sending')

    if (before.resend) process.env.RESEND_API_KEY = before.resend
    else delete process.env.RESEND_API_KEY
    if (before.from) process.env.NOTIFY_FROM_EMAIL = before.from
    else delete process.env.NOTIFY_FROM_EMAIL
  })

  it('Teams is always reported as available, because its credential is per-company', () => {
    const s = senderStatus().find((x) => x.channel === 'TEAMS')!
    expect(s.configured).toBe(true)
  })
})

describe('The health endpoint surfaces delivery status, not just the model key', () => {
  const ROUTE = require('node:fs').readFileSync(
    require('node:path').join(process.cwd(), 'src/app/api/health/route.ts'),
    'utf8'
  )

  it('imports and calls senderStatus rather than checking env vars by hand', () => {
    // The bug this fixes: the endpoint checked ANTHROPIC_API_KEY directly
    // but never asked senders.ts what it already knew about email.
    expect(ROUTE).toContain("from '@/lib/senders'")
    expect(ROUTE).toContain('senderStatus()')
  })

  it('reports both channels under a name a person would look for', () => {
    expect(ROUTE).toContain('notifications:')
    expect(ROUTE).toContain('email:')
  })
})
