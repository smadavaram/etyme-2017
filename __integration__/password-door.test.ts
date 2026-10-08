import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { as, req, json, prisma, resetDatabase } from './harness'

import { POST as signUp } from '@/app/api/auth/password/signup/route'
import { POST as resend } from '@/app/api/auth/password/resend/route'
import { POST as askReset } from '@/app/api/auth/password/reset/route'
import { POST as confirmReset } from '@/app/api/auth/password/reset/confirm/route'
import { GET as entry } from '@/app/api/onboarding/route'
import { verifyEmail, checkPassword } from '@/lib/password-door'
import { passwordDoor } from '@/lib/auth'
import { gatherFacts } from '@/lib/readiness-facts'
import { assess } from '@/lib/readiness'

/**
 * A password door, until the single sign-on keys exist (founder,
 * 2026-10-08), walked through the real doors against a real database.
 * Email goes through the real sender with the network stubbed, so the
 * link in each message is read back out of what would have been sent.
 */

const PASSWORD = 'copper kettle rides north'
const OWNER = 'dana@kestrelworks.example'
const COLLEAGUE = 'priya@kestrelworks.example'
const STRANGER = 'lee@otherfirm.example'
const CANDIDATE = 'helena.marsh@gmail.com'

const sent: { to: string; subject: string; text: string }[] = []
const logged: string[] = []
const saved = { resend: process.env.RESEND_API_KEY, from: process.env.NOTIFY_FROM_EMAIL }

function lastLink(to: string, kind: 'verify' | 'reset'): string {
  const mail = [...sent].reverse().find((m) => m.to === to && m.text.includes(`/${kind}/`))
  if (!mail) throw new Error(`no ${kind} email to ${to}`)
  return mail.text.match(new RegExp(`/${kind}/([A-Za-z0-9_-]+)`))![1]
}

const company = (over: Record<string, unknown> = {}) => ({
  as: 'company', email: OWNER, password: PASSWORD, name: 'Kestrel Works', type: 'client',
  country: 'US', currency: 'USD', address: 'kestrel', ...over,
})

describe('a password door, until the single sign-on keys exist', () => {
  beforeAll(async () => {
    await resetDatabase()
    process.env.RESEND_API_KEY = 're_test'
    process.env.NOTIFY_FROM_EMAIL = 'notices@etyme.example'
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      const b = JSON.parse(init.body)
      sent.push({ to: Array.isArray(b.to) ? b.to[0] : b.to, subject: b.subject, text: b.text ?? '' })
      return new Response(JSON.stringify({ id: 'sent' }), { status: 200 })
    }))
    for (const k of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, k).mockImplementation((...args: unknown[]) => { logged.push(args.map(String).join(' ')) })
    }
  }, 900_000)

  afterAll(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    for (const [k, v] of [['RESEND_API_KEY', saved.resend], ['NOTIFY_FROM_EMAIL', saved.from]] as const) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it('a weak password is refused in a sentence that says what makes it weak', async () => {
    const r = await json(await signUp(req('POST', '/api/auth/password/signup', company({ password: 'KestrelWorks2026' }))))
    expect(r.status).toBe(422)
    expect(r.body.error).toMatchObject({ field: 'password', message: 'Do not use the company name in your password.' })
    expect(await prisma.person.count({ where: { primaryEmail: OWNER } })).toBe(0)
  })

  it('a company signs up with a work email, a password and an Etyme address, and nothing is created until the email is verified', async () => {
    const r = await json(await signUp(req('POST', '/api/auth/password/signup', company())))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.says).toBe(`Check your email. We sent a link to ${OWNER}. It works for 24 hours.`)

    const person = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: OWNER }, include: { contexts: true } })
    expect(person.emailVerifiedAt).toBeNull()
    expect(person.passwordHash).toBeNull()
    expect(person.contexts).toEqual([])
    expect(await prisma.company.count({ where: { slug: 'kestrel' } })).toBe(0)
    expect(await prisma.emailToken.count({ where: { personId: person.id, purpose: 'VERIFY', usedAt: null } })).toBe(1)

    const token = lastLink(OWNER, 'verify')
    const v = await verifyEmail(token)
    expect(v).toMatchObject({ ok: true, landing: '/start?welcome=1', says: 'Your email is confirmed. Kestrel Works is live at kestrel.etyme.com.' })

    const made = await prisma.company.findUniqueOrThrow({
      where: { slug: 'kestrel' },
      include: { contexts: { include: { role: true } }, claimedDomains: true },
    })
    expect(made).toMatchObject({ name: 'Kestrel Works', kind: 'CLIENT', country: 'US', currency: 'USD', domain: null, domainVerified: false })
    // No verified domain, so nothing is claimed: the address is the tenant.
    expect(made.claimedDomains).toEqual([])
    expect(made.contexts.map((c) => [c.personId, c.role?.name])).toEqual([[person.id, 'Owner']])

    // Lands in the five steps with step 2 answered on the form.
    as(OWNER)
    const e = await json(await entry(req('GET', '/api/onboarding')))
    expect(e.body.data).toMatchObject({ action: 'ALREADY_IN', company: { slug: 'kestrel' }, setup: { shows: true, next: 'WORK' } })
    expect(e.body.data.setup.record.COMPANY).toMatchObject({ outcome: 'DONE', byId: person.id })
  })

  it('a password is stored as a slow hash and never returned or logged', async () => {
    const p = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: OWNER } })
    expect(p.passwordHash).toMatch(/^\$argon2id\$/)
    expect(p.passwordHash).not.toContain(PASSWORD)
    // Neither the sign-up's answer nor any email nor any log line carries it.
    for (const m of sent) expect(m.text).not.toContain(PASSWORD)
    for (const l of logged) expect(l).not.toContain(PASSWORD)
    // The token is in the email and only its hash is kept.
    const rows = await prisma.notification.findMany({ where: { personId: p.id, channel: 'EMAIL' } })
    expect(rows.length).toBeGreaterThan(0)
    for (const n of rows) expect(n.body).not.toMatch(/\/verify\/|\/reset\//)
  })

  it('an address is lowercase letters, digits and hyphens, never a reserved word, and never taken twice', async () => {
    const taken = await json(await signUp(req('POST', '/api/auth/password/signup', company({ email: STRANGER }))))
    expect(taken.status).toBe(422)
    expect(taken.body.error).toMatchObject({ field: 'address', message: 'kestrel.etyme.com is already somebody else\'s. Choose another, or ask that company to invite you.' })

    const reserved = await json(await signUp(req('POST', '/api/auth/password/signup', company({ email: STRANGER, address: 'demo' }))))
    expect(reserved.body.error.field).toBe('address')

    // Held while a sign-up waits on its link.
    const first = await json(await signUp(req('POST', '/api/auth/password/signup', company({ email: 'sam@harrowgate.example', name: 'Harrowgate', address: 'harrowgate' }))))
    expect(first.status).toBe(200)
    const second = await json(await signUp(req('POST', '/api/auth/password/signup', company({ email: STRANGER, name: 'Other', address: 'harrowgate' }))))
    expect(second.body.error).toMatchObject({ field: 'address', message: "harrowgate.etyme.com is already somebody else's." })
  })

  it('a wrong password and an unknown email get the same sentence', async () => {
    const wrong = await checkPassword(OWNER, 'copper kettle rides south', '10.0.0.1')
    const nobody = await checkPassword('nobody@kestrelworks.example', PASSWORD, '10.0.0.2')
    expect(wrong).toEqual({ ok: false, code: 'NO_MATCH', says: 'That email and password do not match.' })
    expect(nobody).toEqual(wrong)
    expect(await checkPassword(OWNER, PASSWORD, '10.0.0.1')).toMatchObject({ ok: true, email: OWNER })
  })

  it('five wrong tries slow the door for a minute, and the sentence says so', async () => {
    const t0 = new Date(Date.now() + 1000)
    const at = (s: number) => new Date(t0.getTime() + s * 1000)
    for (let i = 0; i < 4; i++) {
      expect(((await checkPassword(OWNER, 'not the password at all', '10.0.0.9', at(i))) as { says?: string }).says).toBe('That email and password do not match.')
    }
    const fifth = await checkPassword(OWNER, 'not the password at all', '10.0.0.9', at(4))
    expect(fifth).toMatchObject({ ok: false, code: 'WAIT', says: 'That email and password do not match. Too many tries. Wait 60 seconds, then try again.' })
    // Even the right password waits.
    expect(await checkPassword(OWNER, PASSWORD, '10.0.0.9', at(34))).toMatchObject({ ok: false, code: 'WAIT', says: 'Too many tries. Wait 30 seconds, then try again.' })
    // Another email from the same address waits too.
    expect(((await checkPassword(COLLEAGUE, PASSWORD, '10.0.0.9', at(34))) as { code?: string }).code).toBe('WAIT')
    // A minute after the last wrong try, the door opens.
    expect(await checkPassword(OWNER, PASSWORD, '10.0.0.9', at(65))).toMatchObject({ ok: true })
  })

  it('a verification link works once and dies after a day; signing up again resends it', async () => {
    const used = lastLink(OWNER, 'verify')
    expect(await verifyEmail(used)).toEqual({ ok: false, says: 'This link was already used. Sign up again with the same email and we send a new one.' })

    const before = sent.filter((m) => m.to === 'sam@harrowgate.example').length
    const again = await json(await signUp(req('POST', '/api/auth/password/signup', company({ email: 'sam@harrowgate.example', name: 'Harrowgate', address: 'harrowgate' }))))
    expect(again.body.data.says).toBe('Check your email. We sent a link to sam@harrowgate.example. It works for 24 hours.')
    expect(sent.filter((m) => m.to === 'sam@harrowgate.example').length).toBe(before + 1)

    const late = await verifyEmail(lastLink('sam@harrowgate.example', 'verify'), new Date(Date.now() + 25 * 3600_000))
    expect(late).toEqual({ ok: false, says: 'This link has expired. Sign up again with the same email and we send a new one.' })
    expect(await prisma.company.count({ where: { slug: 'harrowgate' } })).toBe(0)

    // Signing up again with an email that already has an account answers
    // the same, and tells the mailbox owner instead of the stranger.
    const dupe = await json(await signUp(req('POST', '/api/auth/password/signup', company())))
    expect(dupe.body.data.says).toBe(`Check your email. We sent a link to ${OWNER}. It works for 24 hours.`)
    expect(sent[sent.length - 1]).toMatchObject({ to: OWNER, subject: 'Set your Etyme password' })
    expect(sent[sent.length - 1].text).toContain('You already have an account.')
  })

  it('a reset link works once and dies after an hour', async () => {
    const asked = await json(await askReset(req('POST', '/api/auth/password/reset', { email: OWNER })))
    expect(asked.body.data.says).toBe(`If there is an account for ${OWNER}, we sent a link. It works for 1 hour.`)
    const nobody = await json(await askReset(req('POST', '/api/auth/password/reset', { email: 'nobody@kestrelworks.example' })))
    expect(nobody.body.data.says).toBe('If there is an account for nobody@kestrelworks.example, we sent a link. It works for 1 hour.')

    const token = lastLink(OWNER, 'reset')
    const { resetPassword } = await import('@/lib/password-door')
    expect(await resetPassword(token, 'harbor lantern stays lit', new Date(Date.now() + 61 * 60_000))).toMatchObject({
      ok: false, says: 'This link has expired. Ask for a new one on the reset page.',
    })

    const weak = await json(await confirmReset(req('POST', '/api/auth/password/reset/confirm', { token, password: 'short' })))
    expect(weak.body.error.message).toBe('Use at least 12 characters. This one has 5.')

    const done = await json(await confirmReset(req('POST', '/api/auth/password/reset/confirm', { token, password: 'harbor lantern stays lit' })))
    expect(done.body.data).toEqual({ says: 'Your password is set. Sign in with it now.', email: OWNER })
    expect(JSON.stringify(done.body)).not.toMatch(/argon2/)

    const twice = await json(await confirmReset(req('POST', '/api/auth/password/reset/confirm', { token, password: 'another long phrase here' })))
    expect(twice.status).toBe(410)
    expect(twice.body.error.message).toBe('This link was already used. Ask for a new one on the reset page.')

    expect((await checkPassword(OWNER, PASSWORD, '10.0.1.1')).ok).toBe(false)
    expect((await checkPassword(OWNER, 'harbor lantern stays lit', '10.0.1.1')).ok).toBe(true)
  })

  it('a candidate signs up with an email and a password and lands on their own page once verified', async () => {
    const r = await json(await signUp(req('POST', '/api/auth/password/signup', { as: 'candidate', email: CANDIDATE, password: PASSWORD, name: 'Helena Marsh' })))
    expect(r.status).toBe(200)
    expect(await prisma.context.count({ where: { person: { primaryEmail: CANDIDATE } } })).toBe(0)

    const v = await verifyEmail(lastLink(CANDIDATE, 'verify'))
    expect(v).toMatchObject({ ok: true, landing: '/dashboard/my-work' })
    const p = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: CANDIDATE }, include: { contexts: true, consultant: true } })
    expect(p.name).toBe('Helena Marsh')
    expect(p.contexts.map((c) => [c.type, c.companyId])).toEqual([['CONSULTANT', null]])
    expect(p.consultant).toMatchObject({ skills: [], visibility: 'INTERNAL' })

    // /start sends her to her own page, and never offers to set her up a second time.
    as(CANDIDATE)
    const e = await json(await entry(req('GET', '/api/onboarding')))
    expect(e.body.data).toMatchObject({ action: 'ALREADY_IN', company: null, seat: { type: 'CONSULTANT' } })
  })

  it('an unverified email cannot sign in and is offered the link again', async () => {
    const email = 'omar@brightwell.example'
    await json(await signUp(req('POST', '/api/auth/password/signup', { as: 'candidate', email, password: PASSWORD })))
    expect(await checkPassword(email, PASSWORD, '10.0.2.1')).toEqual({
      ok: false, code: 'UNVERIFIED', says: `Confirm your email first. We sent a link to ${email}.`,
    })

    // Through NextAuth's own door, the refusal carries the code the page reads.
    const authorize = (passwordDoor() as any).options.authorize
    await expect(authorize({ email, password: PASSWORD }, { headers: {} })).rejects.toThrow(
      `UNVERIFIED:Confirm your email first. We sent a link to ${email}.`
    )

    const before = sent.filter((m) => m.to === email).length
    const again = await json(await resend(req('POST', '/api/auth/password/resend', { email })))
    expect(again.body.data.says).toBe(`Check your email. We sent a link to ${email}. It works for 24 hours.`)
    expect(sent.filter((m) => m.to === email).length).toBe(before + 1)

    // The link signs them in through the same door.
    const user = await authorize({ verifyToken: lastLink(email, 'verify') }, { headers: {} })
    expect(user).toMatchObject({ email, verified: true })
    expect((await checkPassword(email, PASSWORD, '10.0.2.1')).ok).toBe(true)
  })

  it('a colleague signing up with the same address and the owner\'s email domain is seated as Member and the owner is told', async () => {
    const r = await json(await signUp(req('POST', '/api/auth/password/signup', company({ email: COLLEAGUE, name: 'Kestrel Works' }))))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const v = await verifyEmail(lastLink(COLLEAGUE, 'verify'))
    expect(v).toMatchObject({ ok: true, says: 'You are in Kestrel Works as Member. You can see your own work now. An owner there gives you a desk.' })

    const kestrel = await prisma.company.findUniqueOrThrow({ where: { slug: 'kestrel' } })
    const seat = await prisma.context.findFirstOrThrow({ where: { person: { primaryEmail: COLLEAGUE } }, include: { role: true } })
    expect(seat).toMatchObject({ companyId: kestrel.id, type: 'EMPLOYEE', role: { name: 'Member' } })
    expect(await prisma.company.count({ where: { name: 'Kestrel Works' } })).toBe(1)

    const owner = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: OWNER } })
    let told = 0
    for (let i = 0; i < 50 && told === 0; i++) {
      told = await prisma.notification.count({ where: { personId: owner.id, companyId: kestrel.id, body: { contains: COLLEAGUE } } })
      if (!told) await new Promise((res) => setTimeout(res, 20))
    }
    expect(told).toBeGreaterThan(0)
  })

  it('a Microsoft or Google sign-in joins an address only through its verified domain', async () => {
    const kestrel = await prisma.company.findUniqueOrThrow({ where: { slug: 'kestrel' } })
    as('ines@kestrelworks.example')
    const before = await json(await entry(req('GET', '/api/onboarding')))
    expect(before.body.data.action).toBe('CREATE')

    await prisma.companyDomain.create({
      data: { companyId: kestrel.id, domain: 'kestrelworks.example', verifiedAt: new Date(), verifiedVia: 'DNS_TXT', joinPolicy: 'AUTO' },
    })
    const after = await json(await entry(req('GET', '/api/onboarding')))
    expect(after.body.data).toMatchObject({ action: 'JOIN', companyId: kestrel.id })
  })

  it('the readiness page counts a password sign-in as a real sign-in and says password among the providers', async () => {
    const facts = await gatherFacts()
    expect(facts.realSignIns).toBeGreaterThanOrEqual(2)
    expect(await prisma.credential.count({ where: { provider: 'PASSWORD', lastUsedAt: { not: null } } })).toBe(facts.realSignIns)
    const signin = assess({ ...facts, env: { ...facts.env, nextauthSecret: true } }).edges.find((e) => e.key === 'signin')!
    expect(signin.state).toBe('PROVEN')
    expect(signin.says).toContain('through password')
  })
})
