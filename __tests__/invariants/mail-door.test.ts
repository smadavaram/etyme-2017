import { describe, it, expect, afterEach, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import {
  addressing, bareAddress, chaseTooSoonSays, ledgerRowFor, nextChaseAt, sendMail, recordNotSent, isMailHeld,
  CHASE_UNCHECKED_SAYS, CHASE_WINDOW_HOURS, MAIL_MAX_RECIPIENTS, NO_CC_SAYS, NOBODY_NAMED_SAYS, OTHER_SENDER_SAYS,
  TEMPLATE_NOT_NAMED, tooManySays, type MailLedgerRow, type MailDoorDeps,
} from '@/lib/notify/mail-door'
import { MailRefused, failureFromNote, mailFailureSays, heldByTheDoor } from '@/lib/notify/mail-failure'
import { emailSender } from '@/lib/senders'
import { attemptDelivery, routeFor } from '@/lib/notification-delivery'
import { sendEmailNow } from '@/lib/notify/send-now'
import { EMAIL_LINK_HAS_ADAPTER } from '@/lib/readiness'

/**
 * The email law (record 110, 2026-11-22), held at the one door every
 * email leaves through: lib/notify/mail-door.
 *
 * BCC and never CC; the verified sender is the only way out; every send
 * on the mail ledger; a failure is "failed delivery"; no bulk sends; a
 * chase is per record and rate-limited.
 */

const SENDER = 'notices@mail.etyme.test'
const ENV = { RESEND_API_KEY: 'k', NOTIFY_FROM_EMAIL: SENDER }
const NOW = new Date('2026-11-22T18:00:00Z')

/** A door with nothing real behind it: the rows it wrote and the envelopes it handed over. */
function door(over: Partial<MailDoorDeps> = {}) {
  const rows: MailLedgerRow[] = []
  const handed: { from: string; to: string[]; bcc: string[]; subject: string }[] = []
  const deps: MailDoorDeps = {
    env: ENV, now: NOW,
    record: async (row) => { rows.push(row) },
    hand: async (e) => { handed.push(e); return { provider: 'Resend', messageId: 'msg_1' } },
    lastChase: async () => null,
    ...over,
  }
  return { rows, handed, deps }
}

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(process.cwd(), dir))) {
    const p = `${dir}/${name}`
    if (statSync(join(process.cwd(), p)).isDirectory()) sources(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

describe('every email leaves through one door', () => {
  const files = sources('src')

  it('no file but the mail door talks to an email provider to send', () => {
    const SEND_ADDRESSES = [/api\.resend\.com\/emails/, /api\.sendgrid\.com/, /mail\/send/]
    const others = files.filter((f) => f !== 'src/lib/notify/mail-door.ts' && SEND_ADDRESSES.some((r) => r.test(read(f))))
    expect(others).toEqual([])
  })

  it('no file imports a mail library of its own', () => {
    const LIBRARIES = /from ['"](nodemailer|resend|@sendgrid\/mail|postmark|mailgun[^'"]*|@aws-sdk\/client-ses[^'"]*)['"]/
    expect(files.filter((f) => LIBRARIES.test(read(f)))).toEqual([])
  })

  it('the sign-in framework’s own emailed-link door, which would send by another path, stays off', () => {
    expect(EMAIL_LINK_HAS_ADAPTER).toBe(false)
  })

  it('the email sender hands every send to the door and talks to no provider itself', () => {
    const src = read('src/lib/senders.ts')
    expect(src).toContain('sendMail(')
    expect(src).not.toMatch(/fetch\(['"`]https:\/\/api\./)
  })

  it('only the delivery paths hold the email sender’s send, so nothing sends round them', () => {
    const MAY_SEND = [
      'src/lib/notify/send-now.ts', 'src/lib/notification-delivery.ts', 'src/lib/alerts.ts',
      'src/lib/messages.ts', 'src/lib/data-request.ts',
    ]
    const callers = files.filter((f) => /\bsender\.send\(/.test(read(f)))
    expect(callers.sort()).toEqual([...MAY_SEND].sort())
  })

  it('every place that sends an email names its template for the ledger', () => {
    const SENDS = /\b(sendEmailNow|attemptDelivery)\(|\bsender\.send\(/
    const DOOR_ITSELF = ['src/lib/notify/send-now.ts', 'src/lib/notification-delivery.ts']
    const unnamed = files
      .filter((f) => !DOOR_ITSELF.includes(f) && SENDS.test(read(f)))
      .filter((f) => !/template: /.test(read(f)))
    expect(unnamed).toEqual([])
  })
})

describe('BCC and never CC, and no bulk send', () => {
  it('an email to one person is addressed to that person', () => {
    expect(addressing({ to: 'a@firm.test' }, SENDER)).toEqual({ ok: true, from: SENDER, to: ['a@firm.test'], bcc: [] })
  })

  it('on an email to several people only the first is in To and every other is in BCC', () => {
    const plan = addressing({ to: ['a@firm.test', 'b@firm.test'], bcc: ['c@firm.test'] }, SENDER)
    expect(plan).toEqual({ ok: true, from: SENDER, to: ['a@firm.test'], bcc: ['b@firm.test', 'c@firm.test'] })
  })

  it('one address written twice is sent to once', () => {
    const plan = addressing({ to: ['a@firm.test', 'A@Firm.test'], bcc: ['a@firm.test'] }, SENDER)
    expect(plan).toMatchObject({ ok: true, to: ['a@firm.test'], bcc: [] })
  })

  it('an email that names a CC is refused in a sentence, and nothing is handed to the provider', async () => {
    const d = door()
    const sent = await sendMail({ to: 'a@firm.test', cc: ['b@firm.test'], subject: 's', text: 't' }, d.deps)
    expect(sent).toMatchObject({ outcome: 'REFUSED', left: false, note: NO_CC_SAYS })
    expect(d.handed).toEqual([])
  })

  it(`an email to more than ${MAIL_MAX_RECIPIENTS} people is refused as a bulk send, in a sentence`, async () => {
    const d = door()
    const many = Array.from({ length: MAIL_MAX_RECIPIENTS + 1 }, (_, i) => `p${i}@firm.test`)
    const sent = await sendMail({ to: many, subject: 's', text: 't' }, d.deps)
    expect(sent).toMatchObject({ outcome: 'REFUSED', note: tooManySays(MAIL_MAX_RECIPIENTS + 1) })
    expect(sent.note).toMatch(/Send it record by record\.$/)
    expect(d.handed).toEqual([])
  })

  it(`an email to exactly ${MAIL_MAX_RECIPIENTS} people goes, one in To and the rest in BCC`, async () => {
    const d = door()
    const many = Array.from({ length: MAIL_MAX_RECIPIENTS }, (_, i) => `p${i}@firm.test`)
    expect((await sendMail({ to: many, subject: 's', text: 't' }, d.deps)).outcome).toBe('SENT')
    expect(d.handed[0].to).toEqual(['p0@firm.test'])
    expect(d.handed[0].bcc).toHaveLength(MAIL_MAX_RECIPIENTS - 1)
  })

  it('an email that names nobody is refused in a sentence', async () => {
    const d = door()
    expect(await sendMail({ to: [' '], subject: 's', text: 't' }, d.deps)).toMatchObject({ outcome: 'REFUSED', note: NOBODY_NAMED_SAYS })
  })

  it('the provider is handed BCC and never a CC field', async () => {
    const calls: any[] = []
    const fetchWas = globalThis.fetch
    globalThis.fetch = (async (_url: any, init: any) => { calls.push(JSON.parse(init.body)); return new Response(JSON.stringify({ id: 'm1' }), { status: 200 }) }) as any
    try {
      const d = door({ hand: undefined })
      await sendMail({ to: ['a@firm.test', 'b@firm.test'], subject: 's', text: 't' }, d.deps)
      await sendMail({ to: ['a@firm.test', 'b@firm.test'], subject: 's', text: 't' }, { ...d.deps, env: { SENDGRID_API_KEY: 'k', NOTIFY_FROM_EMAIL: SENDER } })
    } finally {
      globalThis.fetch = fetchWas
    }
    expect(calls[0]).toMatchObject({ from: SENDER, to: 'a@firm.test', bcc: ['b@firm.test'] })
    expect(calls[0]).not.toHaveProperty('cc')
    expect(calls[1].personalizations[0]).toEqual({ to: [{ email: 'a@firm.test' }], bcc: [{ email: 'b@firm.test' }] })
    expect(calls[1].from).toEqual({ email: SENDER })
  })
})

describe('the verified sender is the only way out', () => {
  it('an email is sent from the configured verified sender when it names none', async () => {
    const d = door()
    await sendMail({ to: 'a@firm.test', subject: 's', text: 't' }, d.deps)
    expect(d.handed[0].from).toBe(SENDER)
  })

  it('an email that names any other From address is refused in a sentence', async () => {
    const d = door()
    const sent = await sendMail({ to: 'a@firm.test', from: 'someone@other.test', subject: 's', text: 't' }, d.deps)
    expect(sent).toMatchObject({ outcome: 'REFUSED', note: OTHER_SENDER_SAYS })
    expect(d.handed).toEqual([])
  })

  it('the verified sender written with a display name is still the verified sender', () => {
    expect(bareAddress('Etyme <Notices@Mail.Etyme.test>')).toBe(SENDER)
    expect(addressing({ to: 'a@firm.test', from: `Etyme <${SENDER}>` }, SENDER).ok).toBe(true)
  })

  it('with no sender set up nothing is sent, and the ledger says so', async () => {
    const d = door({ env: {} })
    expect((await sendMail({ to: 'a@firm.test', subject: 's', text: 't' }, d.deps)).outcome).toBe('NOT_CONFIGURED')
    expect(d.handed).toEqual([])
    expect(d.rows[0].outcome).toBe('NOT_CONFIGURED')
  })

  it('an invitation that cannot leave is on the mail ledger: not set up where no sender is configured, skipped for a demo address, and no provider is called', async () => {
    const fetched = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetched)
    const about = { template: 'invitation', companyId: 'c1', recordType: 'Invitation', recordId: 'i1' }
    const calls: { outcome: string; to: unknown; template: string | undefined }[] = []
    const notSent = async (m: any, outcome: string) => { calls.push({ outcome, to: m.to, template: m.about?.template }) }
    // No sender configured: the caller answers NOT_CONFIGURED and the door is still told.
    const none = await sendEmailNow({ to: 'a@firm.test', subject: 's', body: 't', about }, { sender: null, notSent })
    expect(none).toMatchObject({ left: false, state: 'NOT_CONFIGURED' })
    // A demo address, with a sender configured: skipped, and the sender is never asked.
    const send = vi.fn(async () => {})
    const demo = await sendEmailNow({ to: 'helena@seed.etyme.invalid', subject: 's', body: 't', about }, { sender: { channel: 'EMAIL', send }, notSent })
    expect(demo).toMatchObject({ left: false, state: 'DEMO_SKIPPED' })
    expect(send).not.toHaveBeenCalled()
    expect(calls).toEqual([
      { outcome: 'NOT_CONFIGURED', to: 'a@firm.test', template: 'invitation' },
      { outcome: 'DEMO_SKIPPED', to: 'helena@seed.etyme.invalid', template: 'invitation' },
    ])
    // The door's own row for each, written with everything the caller said it was for.
    const d = door()
    await recordNotSent({ to: 'a@firm.test', subject: 's', text: 't', about }, 'NOT_CONFIGURED', { env: {}, record: d.deps.record })
    await recordNotSent({ to: 'helena@seed.etyme.invalid', subject: 's', text: 't', about }, 'DEMO_SKIPPED', { env: ENV, record: d.deps.record })
    expect(d.rows.map((r) => [r.outcome, r.toAddresses, r.template, r.companyId, r.recordId])).toEqual([
      ['NOT_CONFIGURED', ['a@firm.test'], 'invitation', 'c1', 'i1'],
      ['DEMO_SKIPPED', ['helena@seed.etyme.invalid'], 'invitation', 'c1', 'i1'],
    ])
    expect(d.rows.every((r) => r.note && r.provider === null)).toBe(true)
    expect(d.handed).toEqual([])
    expect(fetched).not.toHaveBeenCalled()
    // And send-now reaches the door before it answers, in both cases.
    const src = readFileSync(join(process.cwd(), 'src/lib/notify/send-now.ts'), 'utf8')
    expect(src).toMatch(/await notSent\('DEMO_SKIPPED'\)\s+return \{/)
    expect(src).toMatch(/await notSent\('NOT_CONFIGURED'\)\s+return \{/)
    vi.unstubAllGlobals()
  })
})

describe('every send attempt is one row on the mail ledger', () => {
  const about = {
    companyId: 'co_1', actingEntityId: 'ent_1', actorPersonId: 'per_1', heldAs: 'HR', agentKey: null,
    recordType: 'Context', recordId: 'ctx_1', template: 'invitation', templateVersion: 'PASSWORD',
  }

  it('a sent email writes the tenant, the entity, who acted, the sender, the recipients with BCC, the subject, the template and its version, and the record', async () => {
    const d = door()
    await sendMail({ to: ['a@firm.test', 'b@firm.test'], subject: 'You are invited', text: 'the letter', about }, d.deps)
    expect(d.rows).toEqual([{
      companyId: 'co_1', actingEntityId: 'ent_1', actorPersonId: 'per_1', heldAs: 'HR', agentKey: null,
      recordType: 'Context', recordId: 'ctx_1',
      fromAddress: SENDER, toAddresses: ['a@firm.test'], bccAddresses: ['b@firm.test'],
      subject: 'You are invited', template: 'invitation', templateVersion: 'PASSWORD', chase: false,
      outcome: 'SENT', note: null, provider: 'Resend', providerMessageId: 'msg_1',
    }])
  })

  it('the ledger row never holds the letter itself, which may carry a one-time link', async () => {
    const d = door()
    await sendMail({ to: 'a@firm.test', subject: 's', text: 'https://app.etyme.test/reset/SECRET-TOKEN', html: '<a>SECRET-TOKEN</a>', about }, d.deps)
    expect(JSON.stringify(d.rows)).not.toContain('SECRET-TOKEN')
  })

  it('a refused email, a failed one, a demo address and a sent one each write exactly one row', async () => {
    const d = door()
    await sendMail({ to: 'a@firm.test', cc: ['x@firm.test'], subject: 's', text: 't' }, d.deps)
    await sendMail({ to: 'a@firm.test', subject: 's', text: 't' }, { ...d.deps, hand: async () => { throw new MailRefused('Resend', 403, 'no') } })
    await sendMail({ to: 'a@seed.etyme.invalid', subject: 's', text: 't' }, d.deps)
    await sendMail({ to: 'a@firm.test', subject: 's', text: 't' }, d.deps)
    expect(d.rows.map((r) => r.outcome)).toEqual(['REFUSED', 'FAILED_DELIVERY', 'DEMO_SKIPPED', 'SENT'])
  })

  it('a send whose caller named no template is written as not named, never left blank', () => {
    const row = ledgerRowFor({ about: null, from: SENDER, to: ['a@firm.test'], bcc: [], subject: 's', outcome: 'SENT', note: null, provider: null, providerMessageId: null })
    expect(row.template).toBe(TEMPLATE_NOT_NAMED)
    expect(row.actorPersonId).toBeNull()
  })

  it('a ledger row that cannot be written never loses what the send said', async () => {
    const lost: unknown[] = []
    const d = door({ record: async () => { throw new Error('database is down') }, onLedgerLost: (e) => { lost.push(e) } })
    expect((await sendMail({ to: 'a@firm.test', subject: 's', text: 't' }, d.deps)).outcome).toBe('SENT')
    expect(lost).toHaveLength(1)
  })

  it('the mail ledger is read only by company and record together, never by company alone', () => {
    const src = read('src/lib/notify/mail-door.ts')
    const reads = src.match(/prisma\.mailSend\.find\w+\(/g) ?? []
    expect(reads).toHaveLength(2)
    expect(src).toContain('where: { companyId, recordType, recordId }')
    const elsewhere = sources('src').filter((f) => f !== 'src/lib/notify/mail-door.ts' && /\.mailSend\b/.test(read(f)))
    expect(elsewhere).toEqual([])
  })
})

describe('a failure is failed delivery, and silence is never delivery', () => {
  it('a provider that says no is written as failed delivery with its status and cleaned words', async () => {
    const d = door({ hand: async () => { throw new MailRefused('Resend', 403, 'The domain is not verified for bob@firm.test') } })
    const sent = await sendMail({ to: 'a@firm.test', subject: 's', text: 't' }, d.deps)
    expect(sent).toMatchObject({ outcome: 'FAILED_DELIVERY', left: false })
    expect(d.rows[0]).toMatchObject({ outcome: 'FAILED_DELIVERY', provider: 'Resend' })
    expect(d.rows[0].note).toBe('Resend answered 403: The domain is not verified for [address]')
  })

  it('a provider that never answers is failed delivery too', async () => {
    const d = door({ hand: async () => { throw new MailRefused('SendGrid', null, 'fetch failed') } })
    expect((await sendMail({ to: 'a@firm.test', subject: 's', text: 't' }, d.deps)).outcome).toBe('FAILED_DELIVERY')
  })

  it('only an email the provider took is ever written as sent', async () => {
    const d = door({ hand: async () => { throw new Error('anything at all') } })
    await sendMail({ to: 'a@firm.test', subject: 's', text: 't' }, d.deps)
    expect(d.rows.map((r) => r.outcome)).toEqual(['FAILED_DELIVERY'])
  })

  describe('through the paths every caller uses', () => {
    const KEYS = ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'NOTIFY_FROM_EMAIL'] as const
    const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
    const fetchWas = globalThis.fetch
    afterEach(() => {
      for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] }
      globalThis.fetch = fetchWas
      vi.restoreAllMocks()
    })
    const live = (status: number, body: unknown) => {
      for (const k of KEYS) delete process.env[k]
      Object.assign(process.env, ENV)
      globalThis.fetch = (async () => new Response(JSON.stringify(body), { status })) as any
      vi.spyOn(console, 'error').mockImplementation(() => {})
    }

    it('a refused send reaches the caller’s row as FAILED with the provider’s status, so its item reads as not emailed', async () => {
      live(403, { name: 'validation_error', message: 'The domain is not verified' })
      const out = await attemptDelivery(
        routeFor({ isConsultant: true, email: 'a@firm.test', teamsWebhookUrl: null }),
        'a@firm.test', 's', 't', [emailSender()!], NOW, null, { mail: { template: 'test' } },
      )
      expect(out.state).toBe('FAILED')
      expect(out.failure).toMatchObject({ kind: 'REFUSED', status: 403 })
      expect(out.deliveredAt).toBeNull()
    })

    it('an email sent now says it left only where the door said it was sent', async () => {
      live(200, { id: 'm1' })
      expect(await sendEmailNow({ to: 'a@firm.test', subject: 's', body: 't', about: { template: 'test' } }, { report: async () => {} })).toMatchObject({ left: true, state: 'SENT' })
      live(500, {})
      expect(await sendEmailNow({ to: 'a@firm.test', subject: 's', body: 't', about: { template: 'test' } }, { report: async () => {} })).toMatchObject({ left: false, state: 'FAILED' })
    })

    it('an email a rule of the door held reaches the person as Etyme’s own sentence, and staff are not alerted', async () => {
      const told: unknown[] = []
      const held = { channel: 'EMAIL' as const, send: async () => { const e = new Error(NO_CC_SAYS); e.name = 'MailHeld'; throw e } }
      const sent = await sendEmailNow({ to: 'a@firm.test', subject: 's', body: 't' }, { sender: held, report: async (e) => { told.push(e) } })
      expect(sent).toMatchObject({ left: false, state: 'FAILED', note: NO_CC_SAYS })
      expect(sent.left === false && mailFailureSays(sent.failure)).toBe(NO_CC_SAYS)
      expect(told).toEqual([])
    })
  })

  it('a row’s note written by the door reads back as held, in the door’s own sentence', () => {
    for (const says of [NO_CC_SAYS, OTHER_SENDER_SAYS, CHASE_UNCHECKED_SAYS, tooManySays(40), chaseTooSoonSays(NOW)]) {
      expect(heldByTheDoor(says)).toBe(true)
      expect(mailFailureSays(failureFromNote(says))).toBe(says)
    }
    expect(failureFromNote('Resend answered 403: no').kind).toBe('REFUSED')
  })

  it('the door’s refusal is told apart from a provider’s by its shape', () => {
    const e = new Error('x'); e.name = 'MailHeld'
    expect(isMailHeld(e)).toBe(true)
    expect(isMailHeld(new MailRefused('Resend', 403, 'no'))).toBe(false)
  })
})

describe('a chase is per record and rate-limited', () => {
  const chase = { companyId: 'co_1', recordType: 'Invoice', recordId: 'inv_1', template: 'bill', chase: true }

  it(`a reminder about a record goes when none went in the last ${CHASE_WINDOW_HOURS} hours`, async () => {
    const d = door()
    expect((await sendMail({ to: 'ap@client.test', subject: 's', text: 't', about: chase }, d.deps)).outcome).toBe('SENT')
    expect(d.rows[0].chase).toBe(true)
  })

  it('a second reminder about the same record to the same address inside the window is refused in a sentence that says when', async () => {
    const last = new Date(NOW.getTime() - 2 * 3_600_000)
    const asked: unknown[] = []
    const d = door({ lastChase: async (q) => { asked.push(q); return last } })
    const sent = await sendMail({ to: 'ap@client.test', subject: 's', text: 't', about: chase }, d.deps)
    expect(sent.outcome).toBe('REFUSED')
    expect(sent.note).toBe('A reminder about this record was emailed in the last 24 hours, so this one was not sent. The next can go after 2026-11-23 16:00 UTC.')
    expect(d.handed).toEqual([])
    expect(asked[0]).toMatchObject({ recordType: 'Invoice', recordId: 'inv_1', template: 'bill', address: 'ap@client.test' })
  })

  it('a reminder may go again once the window has passed', () => {
    expect(nextChaseAt(new Date(NOW.getTime() - 25 * 3_600_000), NOW)).toBeNull()
    expect(nextChaseAt(null, NOW)).toBeNull()
    expect(nextChaseAt(new Date(NOW.getTime() - 3_600_000), NOW)).toEqual(new Date(NOW.getTime() + 23 * 3_600_000))
  })

  it('where the last reminder cannot be checked nothing is sent, and the sentence says to try again', async () => {
    const d = door({ lastChase: async () => { throw new Error('database is down') } })
    expect(await sendMail({ to: 'ap@client.test', subject: 's', text: 't', about: chase }, d.deps)).toMatchObject({ outcome: 'REFUSED', note: CHASE_UNCHECKED_SAYS })
    expect(d.handed).toEqual([])
  })

  it('the first letter about a record is not a reminder, so the limit never holds it', async () => {
    const d = door({ lastChase: async () => NOW })
    expect((await sendMail({ to: 'ap@client.test', subject: 's', text: 't', about: { ...chase, chase: false } }, d.deps)).outcome).toBe('SENT')
  })

  it('only an earlier reminder that left counts against the limit', () => {
    const src = read('src/lib/notify/mail-door.ts')
    expect(src).toContain("outcome: 'SENT', chase: true,")
  })

  it('sending a bill again and nudging a bench invitation are reminders the door limits', () => {
    expect(read('src/lib/notify/bill-delivery.ts')).toContain('chase: a.resend')
    expect(read('src/app/api/bench/listings/[id]/nudge/route.ts')).toContain('chase: true')
  })
})

describe('every sentence the door says is short and plain', () => {
  it('no sentence runs past twenty-five words', () => {
    const all = [NO_CC_SAYS, NOBODY_NAMED_SAYS, OTHER_SENDER_SAYS, CHASE_UNCHECKED_SAYS, tooManySays(40), chaseTooSoonSays(NOW)]
    for (const says of all) {
      for (const sentence of says.split(/(?<=\.)\s+/)) expect(sentence.split(/\s+/).length, sentence).toBeLessThanOrEqual(25)
    }
  })
})
