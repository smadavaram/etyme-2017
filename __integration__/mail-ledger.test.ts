/**
 * The mail ledger against Postgres (record 110, 2026-11-22). Every send
 * attempt through the one mail door writes one row, and a chase about a
 * record is limited from the rows themselves. The provider is a stand-in:
 * nothing here sends an email.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma, resetDatabase } from './harness'
import { sendMail, mailSendsAbout, CHASE_WINDOW_HOURS, type MailDoorDeps } from '@/lib/notify/mail-door'
import { MailRefused } from '@/lib/notify/mail-failure'
import { emailSender } from '@/lib/senders'
import { attemptDelivery, routeFor } from '@/lib/notification-delivery'

const tag = `ml${Date.now()}`
const SENDER = 'notices@mail.etyme.test'
const ENV = { RESEND_API_KEY: 'k', NOTIFY_FROM_EMAIL: SENDER }
const took: MailDoorDeps['hand'] = async () => ({ provider: 'Resend', messageId: `msg_${tag}` })
const about = (over: Record<string, unknown> = {}) => ({
  companyId: `co_${tag}`, actorPersonId: `per_${tag}`, heldAs: 'Accounts Receivable',
  recordType: 'Invoice', recordId: `inv_${tag}`, template: 'bill', ...over,
})

beforeAll(async () => { await resetDatabase() })

describe('every send attempt is one row on the mail ledger, in the database', () => {
  it('a sent email is on the ledger with its tenant, who acted, the sender, the recipients with BCC, the subject, the template and the record', async () => {
    const sent = await sendMail(
      { to: [`ap.${tag}@client.test`, `cfo.${tag}@client.test`], subject: 'Bill 1042', text: 'the letter', about: about() },
      { env: ENV, hand: took },
    )
    expect(sent.outcome).toBe('SENT')
    const rows = await mailSendsAbout(`co_${tag}`, 'Invoice', `inv_${tag}`)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      companyId: `co_${tag}`, actorPersonId: `per_${tag}`, heldAs: 'Accounts Receivable',
      fromAddress: SENDER, toAddresses: [`ap.${tag}@client.test`], bccAddresses: [`cfo.${tag}@client.test`],
      subject: 'Bill 1042', template: 'bill', templateVersion: '1', chase: false,
      outcome: 'SENT', note: null, provider: 'Resend', providerMessageId: `msg_${tag}`,
    })
  })

  it('an email the provider refused is on the ledger as failed delivery, never as sent', async () => {
    const sent = await sendMail(
      { to: `ap.${tag}@client.test`, subject: 'Bill 1043', text: 't', about: about({ recordId: `inv2_${tag}` }) },
      { env: ENV, hand: async () => { throw new MailRefused('Resend', 422, 'Invalid recipient') } },
    )
    expect(sent.outcome).toBe('FAILED_DELIVERY')
    const rows = await mailSendsAbout(`co_${tag}`, 'Invoice', `inv2_${tag}`)
    expect(rows.map((r) => [r.outcome, r.note])).toEqual([['FAILED_DELIVERY', 'Resend answered 422: Invalid recipient']])
  })

  it('an invitation that cannot leave is on the ledger: not set up where no sender is configured, skipped for a demo address, and no provider is asked', async () => {
    const { sendEmailNow } = await import('@/lib/notify/send-now')
    const asked: string[] = []
    const sender = { channel: 'EMAIL' as const, send: async (to: string) => { asked.push(to) } }
    const none = await sendEmailNow(
      { to: `new.${tag}@client.test`, subject: 'You are invited', body: 't', about: about({ recordType: 'Invitation', recordId: `invite1_${tag}`, template: 'invitation' }) },
      { sender: null },
    )
    expect(none).toMatchObject({ left: false, state: 'NOT_CONFIGURED' })
    const demo = await sendEmailNow(
      { to: `new.${tag}@seed.etyme.invalid`, subject: 'You are invited', body: 't', about: about({ recordType: 'Invitation', recordId: `invite2_${tag}`, template: 'invitation' }) },
      { sender },
    )
    expect(demo).toMatchObject({ left: false, state: 'DEMO_SKIPPED' })
    expect(asked).toEqual([])
    const one = await mailSendsAbout(`co_${tag}`, 'Invitation', `invite1_${tag}`)
    expect(one.map((r) => [r.outcome, r.toAddresses, r.template, r.provider])).toEqual([['NOT_CONFIGURED', [`new.${tag}@client.test`], 'invitation', null]])
    const two = await mailSendsAbout(`co_${tag}`, 'Invitation', `invite2_${tag}`)
    expect(two.map((r) => [r.outcome, r.toAddresses, r.template, r.provider])).toEqual([['DEMO_SKIPPED', [`new.${tag}@seed.etyme.invalid`], 'invitation', null]])
  })

  it('another company reading the same record id reads none of the rows', async () => {
    expect(await mailSendsAbout(`someone_else_${tag}`, 'Invoice', `inv_${tag}`)).toEqual([])
  })
})

describe('a chase about one record is limited from the ledger itself', () => {
  const chase = about({ recordId: `inv3_${tag}`, chase: true })
  const mail = { to: `ap.${tag}@client.test`, subject: 'Bill 1044, sent again', text: 't', about: chase }
  const t0 = new Date('2026-11-22T18:00:00Z')

  it('the first letter and one reminder go, and a second reminder inside the window is refused in a sentence and written down', async () => {
    const first = await sendMail({ ...mail, about: { ...chase, chase: false } }, { env: ENV, hand: took, now: t0 })
    const reminder = await sendMail(mail, { env: ENV, hand: took, now: new Date() })
    const again = await sendMail(mail, { env: ENV, hand: took, now: new Date() })
    expect([first.outcome, reminder.outcome, again.outcome]).toEqual(['SENT', 'SENT', 'REFUSED'])
    expect(again.note).toMatch(new RegExp(`^A reminder about this record was emailed in the last ${CHASE_WINDOW_HOURS} hours, so this one was not sent\\.`))
    const rows = await mailSendsAbout(`co_${tag}`, 'Invoice', `inv3_${tag}`)
    expect(rows.map((r) => r.outcome)).toEqual(['SENT', 'SENT', 'REFUSED'])
  })

  it('the same reminder to a different address, or about a different record, still goes', async () => {
    const other = await sendMail({ ...mail, to: `controller.${tag}@client.test` }, { env: ENV, hand: took })
    const elsewhere = await sendMail({ ...mail, about: { ...chase, recordId: `inv4_${tag}` } }, { env: ENV, hand: took })
    expect([other.outcome, elsewhere.outcome]).toEqual(['SENT', 'SENT'])
  })

  it('a reminder goes again once the window has passed', async () => {
    const later = new Date(Date.now() + (CHASE_WINDOW_HOURS + 1) * 3_600_000)
    expect((await sendMail(mail, { env: ENV, hand: took, now: later })).outcome).toBe('SENT')
  })
})

describe('the paths every caller uses write the ledger too', () => {
  const KEYS = ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'NOTIFY_FROM_EMAIL'] as const
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
  const fetchWas = globalThis.fetch
  afterAll(() => {
    for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] }
    globalThis.fetch = fetchWas
  })

  it('an email sent through the delivery path every notice uses leaves one ledger row, and a refused one reads failed delivery', async () => {
    for (const k of KEYS) delete process.env[k]
    Object.assign(process.env, ENV)
    const route = routeFor({ isConsultant: true, email: `worker.${tag}@mail.test`, teamsWebhookUrl: null })
    const ctx = { companyId: `co_${tag}`, mail: { template: 'notice', recordType: 'Notification', recordId: `n_${tag}` } }

    globalThis.fetch = (async () => new Response(JSON.stringify({ id: 'm_ok' }), { status: 200 })) as any
    const ok = await attemptDelivery(route, `worker.${tag}@mail.test`, 'Your week was approved', 't', [emailSender()!], new Date(), null, ctx)
    globalThis.fetch = (async () => new Response(JSON.stringify({ message: 'Mailbox does not exist' }), { status: 422 })) as any
    const bad = await attemptDelivery(route, `worker.${tag}@mail.test`, 'Your week was approved', 't', [emailSender()!], new Date(), null, ctx)

    expect([ok.state, bad.state]).toEqual(['SENT', 'FAILED'])
    const rows = await mailSendsAbout(`co_${tag}`, 'Notification', `n_${tag}`)
    expect(rows.map((r) => [r.outcome, r.providerMessageId])).toEqual([['SENT', 'm_ok'], ['FAILED_DELIVERY', null]])
    expect(rows.every((r) => r.fromAddress === SENDER && r.actorPersonId === null)).toBe(true)
  })
})
