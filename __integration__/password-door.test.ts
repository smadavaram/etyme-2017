import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { as, req, json, prisma, resetDatabase } from './harness'

import { POST as signUp } from '@/app/api/auth/password/signup/route'
import { POST as resend } from '@/app/api/auth/password/resend/route'
import { POST as askReset } from '@/app/api/auth/password/reset/route'
import { POST as confirmReset } from '@/app/api/auth/password/reset/confirm/route'
import { GET as entry } from '@/app/api/onboarding/route'
import { POST as enter } from '@/app/api/onboarding/route'
import { GET as probe } from '@/app/api/auth/password/signup/route'
import { verifyEmail, checkPassword, resetPassword, issueSetPassword, resetLinkState } from '@/lib/password-door'
import { DEMO_REFUSAL, SUPERSEDED, ALREADY_CONFIRMED, firmAddedYou, SIGNUP_SHUT, RESET_SHUT } from '@/lib/password'
import { ACCOUNT_MAIL } from '@/lib/notify/account-mail'
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
const OWNER = 'dana@kestrelworks.test'
const COLLEAGUE = 'priya@kestrelworks.test'
const STRANGER = 'lee@otherfirm.test'
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
  as: 'company', email: OWNER, password: PASSWORD, personName: 'Dana Reyes', name: 'Kestrel Works', type: 'client',
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
    const first = await json(await signUp(req('POST', '/api/auth/password/signup', company({ email: 'sam@harrowgate.test', name: 'Harrowgate', address: 'harrowgate' }))))
    expect(first.status).toBe(200)
    const second = await json(await signUp(req('POST', '/api/auth/password/signup', company({ email: STRANGER, name: 'Other', address: 'harrowgate' }))))
    expect(second.body.error).toMatchObject({ field: 'address', message: "harrowgate.etyme.com is already somebody else's." })
  })

  it('a wrong password and an unknown email get the same sentence', async () => {
    const wrong = await checkPassword(OWNER, 'copper kettle rides south', '10.0.0.1')
    const nobody = await checkPassword('nobody@kestrelworks.test', PASSWORD, '10.0.0.2')
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
    // Clicked again once the email is confirmed: nothing is wrong, sign in.
    const used = lastLink(OWNER, 'verify')
    expect(await verifyEmail(used)).toEqual({ ok: false, code: 'CONFIRMED', says: 'Your email is already confirmed. Sign in.' })
    const firstHarrowgate = lastLink('sam@harrowgate.test', 'verify')

    const before = sent.filter((m) => m.to === 'sam@harrowgate.test').length
    const again = await json(await signUp(req('POST', '/api/auth/password/signup', company({ email: 'sam@harrowgate.test', name: 'Harrowgate', address: 'harrowgate' }))))
    expect(again.body.data.says).toBe('Check your email. We sent a link to sam@harrowgate.test. It works for 24 hours.')
    expect(sent.filter((m) => m.to === 'sam@harrowgate.test').length).toBe(before + 1)

    // The first link died when the second was sent, and says so.
    expect(await verifyEmail(firstHarrowgate)).toEqual({ ok: false, says: SUPERSEDED })

    const late = await verifyEmail(lastLink('sam@harrowgate.test', 'verify'), new Date(Date.now() + 25 * 3600_000))
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
    const nobody = await json(await askReset(req('POST', '/api/auth/password/reset', { email: 'nobody@kestrelworks.test' })))
    expect(nobody.body.data.says).toBe('If there is an account for nobody@kestrelworks.test, we sent a link. It works for 1 hour.')

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
    const email = 'omar@brightwell.test'
    await json(await signUp(req('POST', '/api/auth/password/signup', { as: 'candidate', email, password: PASSWORD, name: 'Omar Haddad' })))
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
    expect(v).toMatchObject({ ok: true, landing: '/start?welcome=1', says: 'You are in Kestrel Works as Member. Your owner has been told; you will see more once they give you a desk.' })

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
    as('ines@kestrelworks.test')
    const before = await json(await entry(req('GET', '/api/onboarding')))
    expect(before.body.data.action).toBe('CREATE')

    await prisma.companyDomain.create({
      data: { companyId: kestrel.id, domain: 'kestrelworks.test', verifiedAt: new Date(), verifiedVia: 'DNS_TXT', joinPolicy: 'AUTO' },
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
  it('a colleague on a claimed address is asked only email, name and password, and told which company they join as Member', async () => {
    const email = 'ravi@kestrelworks.test'
    const p = await json(await probe(req('GET', `/api/auth/password/signup?email=${encodeURIComponent(email)}`)))
    expect(p.body.data.joins).toEqual({
      address: 'kestrel', company: 'Kestrel Works',
      says: "kestrel is Kestrel Works' address. You will join it as Member once you confirm your email.",
    })
    // Nothing about a company: no name, no type, no country, no address.
    const r = await json(await signUp(req('POST', '/api/auth/password/signup', { as: 'company', email, personName: 'Ravi Iyer', password: PASSWORD })))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const v = await verifyEmail(lastLink(email, 'verify'))
    expect(v).toMatchObject({ ok: true, says: 'You are in Kestrel Works as Member. Your owner has been told; you will see more once they give you a desk.' })
    const seated = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: email }, include: { contexts: { include: { role: true, company: true } } } })
    expect(seated.name).toBe('Ravi Iyer')
    expect(seated.contexts.map((c) => [c.company?.slug, c.role?.name])).toEqual([['kestrel', 'Member']])

    // /start knows the seat is a Member's, so it can say so before the desk.
    as(email)
    const e = await json(await entry(req('GET', '/api/onboarding')))
    expect(e.body.data).toMatchObject({ action: 'ALREADY_IN', company: { name: 'Kestrel Works' }, seat: { role: 'Member' } })
    expect(e.body.data.setup?.shows ?? false).toBe(false)
  })

  it('both forms ask the person\'s own name, and it is their name once they confirm', async () => {
    const noName = await json(await signUp(req('POST', '/api/auth/password/signup', company({ email: 'kai@quillmark.test', personName: '', name: 'Quillmark', address: 'quillmark' }))))
    expect(noName.body.error).toMatchObject({ field: 'personName', message: 'Type your name.' })
    const noCandidateName = await json(await signUp(req('POST', '/api/auth/password/signup', { as: 'candidate', email: 'june@gmail.com', password: PASSWORD })))
    expect(noCandidateName.body.error).toMatchObject({ field: 'name', message: 'Type your name.' })

    await signUp(req('POST', '/api/auth/password/signup', company({ email: 'kai@quillmark.test', personName: 'Kai Lindqvist', name: 'Quillmark', address: 'quillmark' })))
    await verifyEmail(lastLink('kai@quillmark.test', 'verify'))
    expect((await prisma.person.findUniqueOrThrow({ where: { primaryEmail: 'kai@quillmark.test' } })).name).toBe('Kai Lindqvist')
  })

  it('only the newest link for an email works; an older one says a newer link was sent', async () => {
    const email = 'tomas.reyna@gmail.com'
    await signUp(req('POST', '/api/auth/password/signup', { as: 'candidate', email, password: PASSWORD, name: 'Tomas Reyna' }))
    const first = lastLink(email, 'verify')
    await resend(req('POST', '/api/auth/password/resend', { email }))
    const second = lastLink(email, 'verify')
    expect(second).not.toBe(first)
    expect(await verifyEmail(first)).toEqual({ ok: false, says: SUPERSEDED })
    expect(SUPERSEDED).toBe('A newer link was sent to this email. Use the link in the newest email.')
    expect(await verifyEmail(second)).toMatchObject({ ok: true })

    // The same for a reset, and for a link a desk sends with an invitation.
    await askReset(req('POST', '/api/auth/password/reset', { email }))
    const olderReset = lastLink(email, 'reset')
    await askReset(req('POST', '/api/auth/password/reset', { email }))
    const newerReset = lastLink(email, 'reset')
    expect(await resetPassword(olderReset, 'a fresh long phrase here')).toMatchObject({ ok: false, says: SUPERSEDED })
    const person = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: email } })
    const invited = await issueSetPassword(person.id, 72)
    expect(invited).toMatch(/\/reset\/[A-Za-z0-9_-]+$/)
    expect(await resetPassword(newerReset, 'a fresh long phrase here')).toMatchObject({ ok: false, says: SUPERSEDED })
    expect(await resetPassword(invited.split('/reset/')[1], 'a fresh long phrase here')).toMatchObject({ ok: true })
  })

  it('a verify link clicked again after the email is confirmed says so and offers Sign in', async () => {
    const authorize = (passwordDoor() as any).options.authorize
    const used = lastLink(OWNER, 'verify')
    await expect(authorize({ verifyToken: used }, { headers: {} })).rejects.toThrow(`CONFIRMED:${ALREADY_CONFIRMED}`)
  })

  it('a seeded demo person can never set a password; the demo door is the only way into a demo seat', async () => {
    // An address nobody can register, or a demo host, is refused at every door.
    for (const email of ['dana@northbend.example', 'ap@cavanaugh.invalid', 'hr@talvern.local', 'pm@demo.etyme.com']) {
      const up = await json(await signUp(req('POST', '/api/auth/password/signup', company({ email, address: 'seedtry' }))))
      expect(up.status, email).toBe(403)
      expect(up.body.error.message).toBe(DEMO_REFUSAL)
      expect((await json(await askReset(req('POST', '/api/auth/password/reset', { email })))).body.error.message).toBe(DEMO_REFUSAL)
      expect((await json(await resend(req('POST', '/api/auth/password/resend', { email })))).body.error.message).toBe(DEMO_REFUSAL)
      expect(await checkPassword(email, PASSWORD, '10.0.9.1')).toMatchObject({ ok: false, code: 'DEMO' })
    }

  })

  it('a real person a demo firm added can still sign up, reset and sign in; only a reserved demo address is refused', async () => {
    // Round two, item 34: a real address whose only seat is at a seeded
    // firm used to read as demo and was locked out of every door for good.
    const seeded = await prisma.company.create({ data: { name: 'Pellwright Staffing', slug: 'world-pellwright', kind: 'VENDOR', isDemo: true } })
    const email = 'jordan.ames@realmail.test'
    const person = await prisma.person.create({ data: { primaryEmail: email, name: 'Jordan Ames' } })
    await prisma.context.create({ data: { personId: person.id, companyId: seeded.id, type: 'CONSULTANT' } })

    const up = await json(await signUp(req('POST', '/api/auth/password/signup', { as: 'candidate', email, password: PASSWORD, name: 'Jordan Ames' })))
    expect(up.status, JSON.stringify(up.body)).toBe(200)
    const v = await verifyEmail(lastLink(email, 'verify'))
    expect(v).toMatchObject({ ok: true })
    expect(await checkPassword(email, PASSWORD, '10.0.9.2')).toMatchObject({ ok: true })

    const ask = await json(await askReset(req('POST', '/api/auth/password/reset', { email })))
    expect(ask.status).toBe(200)
    const token = lastLink(email, 'reset')
    expect(await resetPassword(token, 'a fresh long phrase here')).toMatchObject({ ok: true })
    expect(await checkPassword(email, 'a fresh long phrase here', '10.0.9.3')).toMatchObject({ ok: true })
  })

  it('a person a firm added signs up once: the password they typed is the one that works, and the mail names the firm', async () => {
    const email = 'rafael.ortiz@gmail.com'
    const firm = await prisma.company.create({ data: { name: 'Brookfield Walk Staffing', slug: 'brookfield-walk', kind: 'VENDOR' } })
    const person = await prisma.person.create({ data: { primaryEmail: email, name: 'Rafael Ortiz' } })
    await prisma.context.create({ data: { personId: person.id, companyId: firm.id, type: 'CONSULTANT' } })
    const r = await json(await signUp(req('POST', '/api/auth/password/signup', { as: 'candidate', email, password: PASSWORD, name: 'Rafael Ortiz' })))
    expect(r.body.data.says).toBe(`Check your email. We sent a link to ${email}. It works for 24 hours.`)
    const mail = sent[sent.length - 1]
    expect(mail).toMatchObject({ to: email, subject: 'Confirm your email for Etyme' })
    expect(mail.text).toContain('Brookfield Walk Staffing added you to its bench. Confirm your email to sign in.')
    expect(mail.text).toContain('It works once, for 24 hours.')
    expect(firmAddedYou('Brookfield Walk Staffing')).toBe('Brookfield Walk Staffing added you to its bench. Confirm your email to sign in.')
    expect(mail.text).not.toContain('You already have an account')
    expect(mail.text).not.toMatch(/\/reset\//)

    // The link signs them in; the password typed on the form is the one that works.
    expect(await verifyEmail(lastLink(email, 'verify'))).toMatchObject({ ok: true })
    expect(await checkPassword(email, PASSWORD, '10.0.9.4')).toMatchObject({ ok: true })
  })

  it('a dead reset link says so on open, before anything is typed', async () => {
    expect(await resetLinkState('made-up-token')).toEqual({ ok: false, says: 'This link does not work. Ask for a new one on the reset page.' })
    const person = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: OWNER } })
    const first = (await issueSetPassword(person.id, 1)).split('/reset/')[1]
    expect(await resetLinkState(first)).toEqual({ ok: true })
    // Opening it does not spend it.
    expect(await resetLinkState(first)).toEqual({ ok: true })
    const second = (await issueSetPassword(person.id, 1)).split('/reset/')[1]
    expect(await resetLinkState(first)).toEqual({ ok: false, says: SUPERSEDED })
    expect(await resetPassword(second, 'another long phrase here')).toMatchObject({ ok: true })
    expect(await resetLinkState(second)).toMatchObject({ ok: false, says: 'This link was already used. Ask for a new one on the reset page.' })
  })

  it('a candidate may become a one-person firm with the same email, and nothing they typed is thrown away', async () => {
    const email = 'amara.diallo@gmail.com'
    await signUp(req('POST', '/api/auth/password/signup', { as: 'candidate', email, password: PASSWORD, name: 'Amara Diallo' }))
    expect(await verifyEmail(lastLink(email, 'verify'))).toMatchObject({ ok: true, landing: '/dashboard/my-work' })

    // A stranger who knows the email but not the password founds nothing and changes nothing.
    await signUp(req('POST', '/api/auth/password/signup', company({ email, personName: 'Amara Diallo', name: 'Not Hers LLC', type: 'solo', address: 'not-hers', password: 'some other long phrase' })))
    expect([...sent].reverse().find((m) => m.to === email)!.text).toContain('You already have an account')

    const r = await json(await signUp(req('POST', '/api/auth/password/signup', company({ email, personName: 'Amara Diallo', name: 'Diallo Nursing LLC', type: 'solo', address: 'diallo-nursing', country: 'US', currency: 'USD' }))))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const mail = [...sent].reverse().find((m) => m.to === email)!
    expect(mail.text).toContain('Confirm your email to set up Diallo Nursing LLC as your own company on Etyme. You sign in with the password you already use.')
    const v = await verifyEmail(lastLink(email, 'verify'))
    expect(v).toMatchObject({ ok: true })
    const firm = await prisma.company.findUniqueOrThrow({ where: { slug: 'diallo-nursing' } })
    expect(firm).toMatchObject({ kind: 'CONSULTANT_CORP', name: 'Diallo Nursing LLC', country: 'US', currency: 'USD' })
    const person = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: email }, include: { contexts: { include: { role: true } } } })
    expect(person.contexts.some((c) => c.companyId === firm.id && c.role?.name === 'Owner')).toBe(true)
    expect(person.contexts.some((c) => c.type === 'CONSULTANT')).toBe(true)
    expect((await prisma.consultantProfile.findUnique({ where: { personId: person.id } }))?.ownCompanyId).toBe(firm.id)
    expect(await checkPassword(email, PASSWORD, '10.0.9.5')).toMatchObject({ ok: true })
  })

  it('the sign-up and reset emails are written down as account mail, never as a notice for the bell', async () => {
    const rows = await prisma.notification.findMany({ where: { channel: 'EMAIL', title: { in: ['Confirm your email for Etyme', 'Set your Etyme password'] } } })
    expect(rows.length).toBeGreaterThan(3)
    for (const n of rows) expect(n.type).toBe(ACCOUNT_MAIL)
  })

  it('a sign-up from a supplier invitation takes that company when confirmed and founds nothing', async () => {
    const client = await prisma.company.create({ data: { name: 'Larkspur Health', slug: 'larkspur', kind: 'CLIENT' } })
    const shell = await prisma.company.create({ data: { name: 'Fenwick Staffing', slug: 'fenwick', kind: 'VENDOR' } })
    await prisma.supplierInvite.create({ data: { companyId: shell.id, byId: client.id, email: 'mara@fenwickstaffing.test', token: 'claim-tok-1' } })
    const companies = await prisma.company.count()

    const r = await json(await signUp(req('POST', '/api/auth/password/signup', { as: 'claim', token: 'claim-tok-1', email: 'mara@fenwickstaffing.test', personName: 'Mara Fenwick', password: PASSWORD })))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const mail = [...sent].reverse().find((m) => m.to === 'mara@fenwickstaffing.test')!
    expect(mail.text).toContain('?then=/claim/claim-tok-1')
    const v = await verifyEmail(lastLink('mara@fenwickstaffing.test', 'verify'))
    expect(v).toMatchObject({ ok: true, landing: '/claim/claim-tok-1' })
    expect(await prisma.company.count()).toBe(companies)

    // The ordinary company form, on the email an invitation went to, does the same.
    await prisma.supplierInvite.create({ data: { companyId: shell.id, byId: client.id, email: 'jo@fenwickstaffing.test', token: 'claim-tok-2' } })
    await prisma.company.update({ where: { id: shell.id }, data: { claimedAt: null } })
    const viaForm = await json(await signUp(req('POST', '/api/auth/password/signup', company({ email: 'jo@fenwickstaffing.test', personName: 'Jo Park', name: 'Fenwick Two', address: 'fenwick-two' }))))
    expect(viaForm.status).toBe(200)
    const v2 = await verifyEmail(lastLink('jo@fenwickstaffing.test', 'verify'))
    expect(v2).toMatchObject({ ok: true })
    expect(await prisma.company.count()).toBe(companies)
    expect(await prisma.company.count({ where: { slug: 'fenwick-two' } })).toBe(0)
  })

  it('the one-person firm may sign up on a personal email and claims no domain', async () => {
    const email = 'nia.okafor@gmail.com'
    const r = await json(await signUp(req('POST', '/api/auth/password/signup', company({ email, personName: 'Nia Okafor', name: 'Okafor Care LLC', type: 'solo', address: 'okafor-care' }))))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    await verifyEmail(lastLink(email, 'verify'))
    const made = await prisma.company.findUniqueOrThrow({ where: { slug: 'okafor-care' }, include: { claimedDomains: true } })
    expect(made).toMatchObject({ kind: 'CONSULTANT_CORP', domain: null })
    expect(made.claimedDomains).toEqual([])
    expect((await prisma.consultantProfile.findFirst({ where: { person: { primaryEmail: email } } }))?.ownCompanyId).toBe(made.id)

    // Any other type on a personal email is refused in a sentence.
    const vendor = await json(await signUp(req('POST', '/api/auth/password/signup', company({ email: 'li.wei@gmail.com', personName: 'Li Wei', name: 'Wei Staffing', type: 'prime', address: 'wei-staffing' }))))
    expect(vendor.body.error.field).toBe('email')

    // The Microsoft or Google door reads the type before sending a personal
    // email to the candidate path.
    as('kofi.mensah@gmail.com')
    const g = await json(await entry(req('GET', '/api/onboarding')))
    expect(g.body.data.action).toBe('CONSULTANT')
    expect(g.body.data.companyTypes.map((t: { key: string }) => t.key)).toEqual(['solo'])
    const made2 = await json(await enter(req('POST', '/api/onboarding', { type: 'solo', name: 'Mensah Engineering LLC' })))
    expect(made2.status, JSON.stringify(made2.body)).toBe(201)
    const firm = await prisma.company.findUniqueOrThrow({ where: { id: made2.body.data.companyId }, include: { claimedDomains: true } })
    expect(firm).toMatchObject({ kind: 'CONSULTANT_CORP', domain: null, name: 'Mensah Engineering LLC' })
    expect(firm.claimedDomains).toEqual([])
    expect(await prisma.context.count({ where: { person: { primaryEmail: 'kofi.mensah@gmail.com' }, type: 'CONSULTANT' } })).toBe(0)
  })

  it('with no email sender, sign-up, reset and asking for the link again say so', async () => {
    const key = process.env.RESEND_API_KEY
    delete process.env.RESEND_API_KEY
    try {
      const up = await json(await signUp(req('POST', '/api/auth/password/signup', company({ email: 'x@nosender.test', address: 'nosender' }))))
      expect(up.status).toBe(503)
      expect(up.body.error.message).toBe(SIGNUP_SHUT)
      const reset = await json(await askReset(req('POST', '/api/auth/password/reset', { email: OWNER })))
      expect(reset.body.error.message).toBe('Password reset is off on this deployment until an email sender is set up.')
      expect(RESET_SHUT).toBe(reset.body.error.message)
      const again = await json(await resend(req('POST', '/api/auth/password/resend', { email: OWNER })))
      expect(again.body.error.message).toBe(SIGNUP_SHUT)
      const p = await json(await probe(req('GET', '/api/auth/password/signup?email=x@nosender.test')))
      expect(p.body.data).toMatchObject({ open: false })
    } finally {
      process.env.RESEND_API_KEY = key
    }
  })
})
