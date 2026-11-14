/**
 * When an email does not leave, Etyme's staff read why and the person who
 * pressed the button reads what to do.
 *
 * The founder, 2026-11-12, inviting three people to his own company: each
 * screen said the email "did not go" and nothing more. The sender threw
 * "Resend returned 403" and never read the provider's answer, the reason
 * was kept where nobody could read it, and staff were never told. These
 * sentences hold the sending half of the fix.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const reported: { place: string; err: unknown; ctx: any }[] = []
vi.mock('@/lib/alerts', () => ({
  reportError: vi.fn(async (place: string, err: unknown, ctx: any) => { reported.push({ place, err, ctx }) }),
}))
vi.mock('@/lib/db', () => ({
  prisma: {
    notification: { findMany: vi.fn() },
    company: { findMany: vi.fn() },
    person: { findMany: vi.fn() },
  },
}))

import { prisma } from '@/lib/db'
import { emailSender } from '@/lib/senders'
import { attemptDelivery, routeFor, type Sender } from '@/lib/notification-delivery'
import {
  MailRefused, mailFailureSays, failureFromNote, failureNote, cleanProviderWords, maskAddress,
  type MailFailureKind,
} from '@/lib/notify/mail-failure'
import { sendEmailNow, NOT_SET_UP_NOTE } from '@/lib/notify/send-now'
import { recentMailFailures, noticeKindOf, MAIL_FAILURES_WHERE, heldBackForNoSender } from '@/lib/notify/mail-failures'
import { NO_MAIL_HERE } from '@/lib/notify/mail-leaves'

const db = prisma as any
const KEY = 're_live_8f3k2LmQpZ7xV9wT4yB1cN6dR0sA'
const FROM = 'notices@notify.etyme.com'
const TO = 'sidhu.partner@gmail.com'
const NOW = new Date('2026-11-12T15:40:00Z')

function answer(status: number, body: unknown): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
}

beforeEach(() => {
  reported.length = 0
  vi.stubEnv('NOTIFY_FROM_EMAIL', FROM)
  vi.stubEnv('RESEND_API_KEY', KEY)
  vi.stubEnv('SENDGRID_API_KEY', '')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

async function refusalFrom(res: Response | Error): Promise<MailRefused> {
  vi.stubGlobal('fetch', vi.fn(async () => { if (res instanceof Error) throw res; return res }))
  try {
    await emailSender()!.send(TO, 'Invited', 'Hello')
  } catch (err) {
    return err as MailRefused
  }
  throw new Error('the send did not fail')
}

describe('The email sender keeps the provider’s own words when it refuses', () => {
  it('the provider’s own message is kept on the failed attempt, without the recipient address or the key', async () => {
    const err = await refusalFrom(answer(403, {
      statusCode: 403, name: 'validation_error',
      message: `The notify.etyme.com domain is not verified. Sending to ${TO} from ${FROM} with key ${KEY} refused.`,
    }))
    expect(err).toBeInstanceOf(MailRefused)
    expect(err.status).toBe(403)
    expect(err.providerName).toBe('Resend')
    expect(err.providerMessage).toContain('domain is not verified')
    for (const secret of [TO, FROM, KEY]) {
      expect(err.message).not.toContain(secret)
      expect(err.providerMessage).not.toContain(secret)
    }
    expect(err.message).toMatch(/^Resend answered 403: /)
  })

  it('a refusal from the second provider is read the same way', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    vi.stubEnv('SENDGRID_API_KEY', 'SG.abcdefghijklmnop.qrstuvwxyz0123456789')
    const err = await refusalFrom(answer(401, { errors: [{ message: 'The provided authorization grant is invalid, expired, or revoked' }] }))
    expect(err.providerName).toBe('SendGrid')
    expect(err.status).toBe(401)
    expect(err.providerMessage).toContain('authorization grant is invalid')
    expect(err.message).not.toContain('SG.')
  })

  it('a provider that never answered is said as not answering, with no status', async () => {
    const err = await refusalFrom(new TypeError('fetch failed'))
    expect(err.status).toBeNull()
    expect(err.kind).toBe('DOWN')
    expect(err.message).toBe('Resend did not answer: fetch failed')
  })

  it('a provider answer that is not JSON is kept as its words', async () => {
    const err = await refusalFrom(answer(502, 'Bad gateway'))
    expect(err.status).toBe(502)
    expect(err.providerMessage).toBe('Bad gateway')
  })

  it('at most three hundred characters of the provider’s words are kept', () => {
    expect(cleanProviderWords('word '.repeat(200)).length).toBeLessThanOrEqual(300)
    expect(new MailRefused('Resend', 422, 'x '.repeat(400)).providerMessage.length).toBeLessThanOrEqual(300)
  })
})

describe('What the delivery record keeps, and who is told', () => {
  it('a notice the provider refused keeps the status and the provider’s words on its row', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => answer(403, { statusCode: 403, message: 'The domain is not verified.' })))
    const route = routeFor({ isConsultant: true, email: TO, teamsWebhookUrl: null })
    const o = await attemptDelivery(route, TO, 'T', 'B', [emailSender()!], NOW, null, { companyId: 'c1', personId: 'p1' })
    expect(o.state).toBe('FAILED')
    expect(o.note).toBe('Resend answered 403: The domain is not verified.')
    expect(o.failure).toEqual({ kind: 'REFUSED', status: 403, provider: 'Resend', words: 'The domain is not verified.' })
    expect(failureFromNote(o.note)).toEqual(o.failure)
  })

  it('a refused send tells Etyme’s staff through the one reporter that mails at most once an hour', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => answer(403, { message: 'The domain is not verified.' })))
    const route = routeFor({ isConsultant: true, email: TO, teamsWebhookUrl: null })
    await attemptDelivery(route, TO, 'T', 'B', [emailSender()!], NOW, null, { companyId: 'c1', personId: 'p1' })
    await vi.waitFor(() => expect(reported).toHaveLength(1))
    expect(reported[0].place).toBe('email: the provider refused a send')
    expect(reported[0].ctx).toEqual({ companyId: 'c1', personId: 'p1' })
    expect(String((reported[0].err as Error).message)).not.toContain(TO)
  })

  it('a failure that is not the provider’s, such as a dead mailbox from another sender, is kept and not reported as the provider', async () => {
    const broken: Sender = { channel: 'EMAIL', async send() { throw new Error('550 mailbox unavailable') } }
    const route = routeFor({ isConsultant: true, email: TO, teamsWebhookUrl: null })
    const o = await attemptDelivery(route, TO, 'T', 'B', [broken], NOW)
    expect(o.note).toContain('550 mailbox unavailable')
    expect(reported).toHaveLength(0)
  })

  it('a note written before the provider’s words were kept is still read for its status', () => {
    expect(failureFromNote('Resend returned 403')).toMatchObject({ status: 403, provider: 'Resend', kind: 'REFUSED', words: null })
  })
})

describe('What a company’s own person reads', () => {
  const says = (kind: MailFailureKind) => mailFailureSays({ kind })

  it('a refusal says nothing was sent and that Etyme has been told', () => {
    for (const status of [401, 403, 422]) {
      expect(mailFailureSays(failureFromNote(failureNote({ provider: 'Resend', status, words: 'API key is invalid' }))))
        .toBe('Etyme’s email sender refused it, so nothing was sent. Etyme has been told.')
    }
  })

  it('a provider that is busy says to try again in a few minutes', () => {
    expect(says(failureFromNote('Resend answered 429: Too many requests').kind))
      .toBe('Etyme’s email sender is busy. Try again in a few minutes.')
  })

  it('a provider that is down or did not answer says to try again in a few minutes', () => {
    const down = 'Etyme’s email sender did not answer. Try again in a few minutes.'
    expect(says(failureFromNote('Resend answered 503: Service unavailable').kind)).toBe(down)
    expect(says(failureFromNote('Resend did not answer: fetch failed').kind)).toBe(down)
  })

  it('a deployment with no email sender says the sentence it says today', () => {
    expect(says('NOT_SET_UP')).toBe(`${NO_MAIL_HERE}.`)
  })

  it('the sentence never repeats the provider’s words, its name or a status code', () => {
    for (const kind of ['REFUSED', 'BUSY', 'DOWN', 'NOT_SET_UP', 'DEMO'] as MailFailureKind[]) {
      const s = says(kind)
      expect(s).not.toMatch(/Resend|SendGrid|\b\d{3}\b|verified|API key/i)
      expect(s).not.toMatch(/desk|program office|sorry/i)
    }
  })
})

describe('One awaited send, for a caller that must not say "emailed" early', () => {
  it('says the email left only after the send has returned', async () => {
    const order: string[] = []
    const slow: Sender = {
      channel: 'EMAIL',
      async send() { await new Promise((r) => setTimeout(r, 5)); order.push('sent') },
    }
    const out = await sendEmailNow({ to: TO, subject: 'S', body: 'B' }, { sender: slow, now: NOW })
    order.push('answered')
    expect(order).toEqual(['sent', 'answered'])
    expect(out).toEqual({ left: true, state: 'SENT', at: NOW, note: null, failure: null })
  })

  it('an invitation the provider refused comes back with the failure and the sentence to show, and staff are told', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => answer(422, { message: 'Invalid `from` field.' })))
    const report = vi.fn(async () => {})
    const out = await sendEmailNow({ to: TO, subject: 'S', body: 'B', companyId: 'tapin' }, { now: NOW, report })
    expect(out.left).toBe(false)
    if (out.left) return
    expect(out.state).toBe('FAILED')
    expect(out.note).toBe('Resend answered 422: Invalid `from` field.')
    expect(mailFailureSays(out.failure)).toBe('Etyme’s email sender refused it, so nothing was sent. Etyme has been told.')
    expect(report).toHaveBeenCalledTimes(1)
  })

  it('a demo address is recorded as skipped, not failed, the sender is never asked and staff are not told', async () => {
    const send = vi.fn(async () => {})
    const report = vi.fn(async () => {})
    const out = await sendEmailNow({ to: 'helena@seed.etyme.invalid', subject: 'S', body: 'B' }, { sender: { channel: 'EMAIL', send }, report })
    expect(out.state).toBe('DEMO_SKIPPED')
    expect(send).not.toHaveBeenCalled()
    expect(report).not.toHaveBeenCalled()
  })

  it('a deployment with no email sender is recorded as not set up and nobody is told it went', async () => {
    const out = await sendEmailNow({ to: TO, subject: 'S', body: 'B' }, { sender: null })
    expect(out).toMatchObject({ left: false, state: 'NOT_CONFIGURED', note: NOT_SET_UP_NOTE })
    if (!out.left) expect(mailFailureSays(out.failure)).toBe(`${NO_MAIL_HERE}.`)
  })

  it('never throws, whatever the sender does', async () => {
    const odd: Sender = { channel: 'EMAIL', async send() { throw 'not an error' } }
    const out = await sendEmailNow({ to: TO, subject: 'S', body: 'B' }, { sender: odd, report: async () => {} })
    expect(out.state).toBe('FAILED')
  })
})

describe('The list of email that did not go, for Etyme’s own staff', () => {
  it('shows when, the kind of notice, the company, the provider’s status and words, and the recipient masked to its first letter and domain', async () => {
    db.notification.findMany.mockResolvedValueOnce([
      {
        id: 'n1', createdAt: NOW, type: 'SYSTEM', title: 'Sharath invited you to Tapin',
        deliveryNote: 'Resend answered 403: The domain is not verified.', companyId: 'tapin', personId: 'p1',
      },
      {
        id: 'n2', createdAt: NOW, type: 'TIMESHEET', title: 'Week to approve',
        deliveryNote: 'Resend returned 401', companyId: null, personId: 'p2',
      },
    ])
    db.company.findMany.mockResolvedValueOnce([{ id: 'tapin', name: 'Tapin' }])
    db.person.findMany.mockResolvedValueOnce([
      { id: 'p1', primaryEmail: 'sidhu871@gmail.com' },
      { id: 'p2', primaryEmail: 'helena@northbend.test' },
    ])
    const rows = await recentMailFailures(50)
    expect(rows[0]).toEqual({
      id: 'n1', at: NOW, kind: 'Invitation', companyName: 'Tapin', provider: 'Resend', status: 403,
      failureKind: 'REFUSED', words: 'The domain is not verified.', recipient: 's…@gmail.com',
    })
    expect(rows[1]).toMatchObject({ kind: 'Timesheet notice', companyName: null, status: 401, recipient: 'h…@northbend.test' })
    const text = JSON.stringify(rows)
    expect(text).not.toContain('sidhu871')
    expect(text).not.toContain('invited you to')
    expect(db.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: MAIL_FAILURES_WHERE, orderBy: { createdAt: 'desc' }, take: 50,
    }))
  })

  it('an invitation that could not be sent because no email sender is set up is listed, said as not set up, with the recipient masked', async () => {
    db.notification.findMany.mockResolvedValueOnce([
      {
        id: 'n3', createdAt: NOW, type: 'SYSTEM', title: 'Kwame invited you to Brightmoor', deliveryState: 'NOT_CONFIGURED',
        deliveryNote: 'No email provider set up, so this was recorded and not sent.', companyId: 'bm', personId: 'p3',
      },
    ])
    db.company.findMany.mockResolvedValueOnce([{ id: 'bm', name: 'Brightmoor' }])
    db.person.findMany.mockResolvedValueOnce([{ id: 'p3', primaryEmail: 'kwame.osei@brightmoor.example' }])
    const rows = await recentMailFailures(50)
    expect(rows[0]).toEqual({
      id: 'n3', at: NOW, kind: 'Invitation', companyName: 'Brightmoor', provider: null, status: null,
      failureKind: 'NOT_SET_UP', words: null, recipient: 'k…@brightmoor.example',
    })
    expect(heldBackForNoSender(rows[0])).toBe(true)
    expect(JSON.stringify(rows)).not.toContain('kwame.osei')
    // The read asks for these rows: held-back invitations beside the failed sends.
    expect(JSON.stringify(MAIL_FAILURES_WHERE)).toContain('NOT_CONFIGURED')
  })

  it('a demo address’s skipped send is never listed as email that did not go', () => {
    const where = JSON.stringify(MAIL_FAILURES_WHERE)
    expect(where).not.toContain('DEMO_SKIPPED')
    expect(MAIL_FAILURES_WHERE.OR).toEqual([
      { deliveryState: 'FAILED' },
      { deliveryState: 'NOT_CONFIGURED', type: 'SYSTEM', title: { contains: ' invited you to ' } },
    ])
  })

  it('only invitations held back for no email sender are listed, not every other notice that could not leave', () => {
    const held = (MAIL_FAILURES_WHERE.OR as any[]).find((w) => w.deliveryState === 'NOT_CONFIGURED')
    expect(held).toMatchObject({ type: 'SYSTEM', title: { contains: ' invited you to ' } })
  })

  it('reads at most two hundred rows however many are asked for', async () => {
    db.notification.findMany.mockResolvedValueOnce([])
    await recentMailFailures(10_000)
    expect(db.notification.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 200 }))
  })

  it('an address is masked to its first letter and its domain, and a broken one to nothing', () => {
    expect(maskAddress('Sharath@Etyme.com')).toBe('S…@etyme.com')
    expect(maskAddress('no-at-sign')).toBeNull()
    expect(maskAddress(null)).toBeNull()
    expect(noticeKindOf('ACCOUNT_MAIL', 'Set your password')).toBe('Account email')
  })
})

describe('The password door’s confirm and reset emails go through the one send (2026-11-12)', () => {
  it('a confirm or reset email the provider refuses keeps the provider’s status and words on its row, and staff are told, through sendEmailNow', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/lib/password-door.ts', 'utf8')
    const mail = src.slice(src.indexOf('async function mail('), src.indexOf('function link(path: string)'))
    expect(mail).toContain('const sent = await sendEmailNow({ to, subject, body, personId, companyId: null })')
    expect(mail).toContain('deliveryState: sent.state, deliveryNote: note')
    expect(mail).not.toMatch(/sender\.send\(/)
  })
})
