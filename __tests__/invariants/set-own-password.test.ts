/**
 * Set a password while signed in (fault 5, founder's own sign-in,
 * 2026-11-12). Etyme held no credential of its own as a fallback: a
 * person seated by the staff tool and signed in with Google could get a
 * password only through Forgot your password, which needs mail that was
 * failing. The account menu now says "Set a password", or "Change
 * password" once there is one.
 *
 * The rules run for real (lib/password-door); only the database, the
 * notice and the session token are stood in for, and every write is put on
 * one timeline so the order is a fact the test reads.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const timeline: string[] = []
const people = new Map<string, any>()
const failures: { email: string; at: Date }[] = []
let policies: unknown[] = []

const db: any = {
  person: {
    findUnique: vi.fn(async ({ where }: any) => people.get(where.primaryEmail) ?? null),
    update: vi.fn(async ({ data }: any) => {
      timeline.push('person.update')
      const p = [...people.values()][0]
      if (data.passwordHash) p.passwordHash = data.passwordHash
      if (data.emailVerifiedAt) p.emailVerifiedAt = data.emailVerifiedAt
      if (data.sessionVersion?.increment) p.sessionVersion += data.sessionVersion.increment
      return { sessionVersion: p.sessionVersion }
    }),
  },
  signInFailure: {
    findMany: vi.fn(async ({ where }: any) => failures.filter((f) => f.email === where.email).map((f) => ({ at: f.at }))),
    create: vi.fn(async ({ data }: any) => { failures.push({ email: data.email, at: data.at }); return {} }),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
  companySignInPolicy: { findMany: vi.fn(async () => policies), findUnique: vi.fn(async () => null) },
  identityProvider: { findMany: vi.fn(async () => []) },
  accessLog: {
    createMany: vi.fn(async ({ data }: any) => { timeline.push(`log:${data[0]?.action}`); return { count: data.length } }),
  },
  incident: { create: vi.fn(async () => ({ id: 'i' })) },
  $transaction: vi.fn(async (fn: any) => fn(db)),
}
vi.mock('@/lib/db', () => ({ get prisma() { return db } }))
const notify = vi.hoisted(() => vi.fn(async () => ({ id: 'n' })))
vi.mock('@/lib/notify', () => ({ notify }))
const token = vi.hoisted(() => ({ value: null as any }))
vi.mock('next-auth/jwt', () => ({ getToken: vi.fn(async () => token.value) }))

import { setOwnPassword, versionAfterOwnChange, ownPasswordState, SIGN_IN_AGAIN_TO_SET, NOT_YOUR_CURRENT, FIRST_PASSWORD_MINUTES } from '@/lib/password-door'
import { hashPassword, passwordMatches, DEMO_REFUSAL, RESET_SHUT } from '@/lib/password'
import { seatRefusal } from '@/lib/identity/policy'

const NEW = 'copper kettle rides north'
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const NOW = new Date('2026-11-12T16:00:00Z')

function seat(over: Record<string, unknown> = {}) {
  const p = { id: 'p-sharath', name: 'Sharath', primaryEmail: 'sharath@etyme.com', passwordHash: null, emailVerifiedAt: null, sessionVersion: 0, ...over }
  people.clear()
  people.set(p.primaryEmail, p)
  return p
}

const ask = (over: Record<string, unknown> = {}) => ({
  email: 'sharath@etyme.com', door: 'GOOGLE_SOCIAL' as const, authAt: NOW.getTime() - 60_000, sessionVersion: 0, password: NEW, ...over,
})

beforeEach(() => {
  timeline.length = 0
  failures.length = 0
  policies = []
  vi.clearAllMocks()
  process.env.NEXTAUTH_SECRET = 'a deployment secret of some length'
})

describe('a signed-in person sets a password of their own', () => {
  it('a signed-in person with no password can set one without an email', async () => {
    const p = seat()
    const r = await setOwnPassword(ask(), NOW)
    expect(r).toMatchObject({ ok: true, changed: false })
    expect(await passwordMatches(p.passwordHash, NEW)).toBe(true)
  })

  it('a first password does not raise the session version, so no session is ended', async () => {
    const p = seat({ sessionVersion: 2 })
    await setOwnPassword(ask({ sessionVersion: 2 }), NOW)
    expect(p.sessionVersion).toBe(2)
    expect(db.person.update.mock.calls[0][0].data.sessionVersion).toBeUndefined()
  })

  it('a stale session must sign in again before it may plant a first password', async () => {
    seat()
    const r = await setOwnPassword(ask({ authAt: NOW.getTime() - (FIRST_PASSWORD_MINUTES + 1) * 60_000 }), NOW)
    expect(r).toMatchObject({ ok: false, says: 'Sign in again to set a password.' })
    const none = await setOwnPassword(ask({ authAt: undefined }), NOW)
    expect(none).toMatchObject({ ok: false, says: SIGN_IN_AGAIN_TO_SET })
    expect(db.person.update).not.toHaveBeenCalled()
  })

  it('the email is marked confirmed only where the session came through Google or Microsoft', async () => {
    const g = seat()
    await setOwnPassword(ask({ door: 'GOOGLE_SOCIAL' }), NOW)
    expect(g.emailVerifiedAt).toEqual(NOW)
    const l = seat()
    await setOwnPassword(ask({ door: 'LINKEDIN' }), NOW)
    expect(l.emailVerifiedAt).toBeNull()
  })

  it('a password under the minimum length or containing the email is refused', async () => {
    seat()
    expect(await setOwnPassword(ask({ password: 'short one' }), NOW)).toMatchObject({ ok: false, field: 'password', says: 'Use at least 12 characters. This one has 9.' })
    expect(await setOwnPassword(ask({ password: 'sharath-is-signing-in' }), NOW)).toMatchObject({ ok: false, field: 'password', says: 'Do not use your email address in your password.' })
  })

  it('a password for a demo address is refused', async () => {
    seat({ primaryEmail: 'dana@northbend.example' })
    expect(await setOwnPassword(ask({ email: 'dana@northbend.example' }), NOW)).toMatchObject({ ok: false, says: DEMO_REFUSAL })
  })

  it('a password on a directory-only company’s address is refused in one sentence and the refusal is logged first', async () => {
    seat({ primaryEmail: 'nina@acmehealth.com' })
    const company = { name: 'Acme Health', domain: 'acmehealth.com', domainVerified: true, claimedDomains: [] }
    policies = [{ companyId: 'co', mode: 'SSO_ONLY', company }]
    const r = await setOwnPassword(ask({ email: 'nina@acmehealth.com' }), NOW)
    timeline.push('answer')
    expect(r).toMatchObject({ ok: false, status: 403 })
    if (!r.ok) expect(r.says).toMatch(/Acme Health signs its people in through/)
    expect(timeline).toEqual(['log:LOGIN_REFUSED_SSO_ONLY', 'answer'])
  })

  it('setting a password writes a ledger row naming who and when, before the answer, and never the password', async () => {
    seat()
    await setOwnPassword(ask(), NOW)
    timeline.push('answer')
    expect(timeline).toEqual(['person.update', 'log:PASSWORD_SET', 'answer'])
    const row = db.accessLog.createMany.mock.calls[0][0].data[0]
    expect(row).toMatchObject({ action: 'PASSWORD_SET', actorPersonId: 'p-sharath', subjectId: 'p-sharath' })
    expect(JSON.stringify(db.accessLog.createMany.mock.calls)).not.toContain(NEW)
    expect(read('src/lib/password-door.ts')).not.toMatch(/console\.(log|info|warn|error|debug)/)
  })

  it('the person is told in the app, and by email where email leaves', async () => {
    seat()
    delete process.env.RESEND_API_KEY
    await setOwnPassword(ask(), NOW)
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ personId: 'p-sharath', type: 'SYSTEM', title: 'A password was set on your Etyme account', channel: 'IN_APP' }))
    expect(JSON.stringify(notify.mock.calls)).not.toContain(NEW)
  })
})

describe('a person who has a password changes it', () => {
  it('a person who has a password must give the right current password to change it', async () => {
    seat({ passwordHash: await hashPassword('the old one is long enough') })
    const wrong = await setOwnPassword(ask({ current: 'not the old one at all' }), NOW)
    expect(wrong).toMatchObject({ ok: false, field: 'current', says: NOT_YOUR_CURRENT })
    const right = await setOwnPassword(ask({ current: 'the old one is long enough' }), NOW)
    expect(right).toMatchObject({ ok: true, changed: true })
  })

  it('a wrong current password is slowed down like a wrong sign-in, counted against the person', async () => {
    seat({ passwordHash: await hashPassword('the old one is long enough') })
    let last: any
    for (let i = 0; i < 6; i++) last = await setOwnPassword(ask({ current: `wrong guess number ${i}` }), NOW)
    expect(last.ok).toBe(false)
    expect(last.says).toMatch(/Too many tries\. Wait \d+ seconds?, then try again\./)
    expect(db.signInFailure.create.mock.calls.every((c: any[]) => c[0].data.email === 'sharath@etyme.com' && c[0].data.personId === 'p-sharath')).toBe(true)
  })

  it('changing a password ends the person’s other sessions and keeps this one', async () => {
    const p = seat({ passwordHash: await hashPassword('the old one is long enough'), sessionVersion: 3 })
    const r = await setOwnPassword(ask({ current: 'the old one is long enough', sessionVersion: 3 }), NOW)
    expect(r.ok && r.changed).toBe(true)
    expect(p.sessionVersion).toBe(4)
    const refresh = r.ok ? r.refresh : null
    expect(typeof refresh).toBe('string')
    // This session carries the ticket over; its version is read again on the server.
    const mine = { email: 'sharath@etyme.com', authAt: ask().authAt, sv: 3 }
    expect(await versionAfterOwnChange(mine, refresh, NOW)).toBe(4)
    // Another session of the same person, signed in at another time, cannot use it.
    expect(await versionAfterOwnChange({ ...mine, authAt: mine.authAt - 1000 }, refresh, NOW)).toBeNull()
    // A version from the browser is never taken: a made-up ticket is refused.
    expect(await versionAfterOwnChange(mine, 'v9', NOW)).toBeNull()
  })

  it('a sign-out everywhere after the change is never undone by the ticket', async () => {
    const p = seat({ passwordHash: await hashPassword('the old one is long enough'), sessionVersion: 3 })
    const r = await setOwnPassword(ask({ current: 'the old one is long enough', sessionVersion: 3 }), NOW)
    p.sessionVersion = 5
    expect(await versionAfterOwnChange({ email: 'sharath@etyme.com', authAt: ask().authAt, sv: 3 }, r.ok ? r.refresh : null, NOW)).toBeNull()
  })

  it('the jwt callback carries the session over only through the update trigger, re-reading the version', () => {
    const auth = read('src/lib/auth.ts')
    expect(auth).toContain("if (trigger === 'update' && token.email) {")
    expect(auth).toContain('versionAfterOwnChange(token, (session as { refresh?: unknown } | undefined)?.refresh)')
    expect(auth).toContain('token.authAt = Date.now()')
    // authAt stays in the token: the session the browser reads never carries it.
    expect(auth.slice(auth.indexOf('async session({'))).not.toContain('authAt')
  })
})

describe('a password never opens a directory-only company’s seat', () => {
  it('a password session is refused a directory-only company’s seat on every request, whatever address holds it', () => {
    const corvane = { companyId: 'corvane', companyName: 'Corvane Packaging', mode: 'SSO_ONLY' as const, issuers: ['https://login.corvane.example/v2'] }
    expect(seatRefusal(corvane, { door: 'PASSWORD', issuer: null })).toMatch(/Corvane Packaging/)
    expect(seatRefusal(corvane, { door: 'GOOGLE_SOCIAL', issuer: null })).toMatch(/Corvane Packaging/)
    expect(seatRefusal(corvane, { door: 'DIRECTORY', issuer: corvane.issuers[0] })).toBeNull()
  })
})

describe('the route and the screen', () => {
  it('a browser with no session cannot call the set-password route', async () => {
    token.value = null
    const { PUT, GET } = await import('@/app/api/auth/password/reset/route')
    const { NextRequest } = await import('next/server')
    const put = await PUT(new NextRequest('http://x/api/auth/password/reset', { method: 'PUT', body: JSON.stringify({ password: NEW }) }))
    expect(put.status).toBe(401)
    expect((await put.json()).error.message).toBe(SIGN_IN_AGAIN_TO_SET)
    expect((await GET(new NextRequest('http://x/api/auth/password/reset'))).status).toBe(401)
    expect(db.person.update).not.toHaveBeenCalled()
  })

  it('the route takes the address and the sign-in time from the session token, never from the body', async () => {
    seat()
    token.value = { email: 'sharath@etyme.com', door: 'GOOGLE_SOCIAL', authAt: Date.now() - 30_000, sv: 0 }
    const { PUT } = await import('@/app/api/auth/password/reset/route')
    const { NextRequest } = await import('next/server')
    const res = await PUT(new NextRequest('http://x/api/auth/password/reset', {
      method: 'PUT', body: JSON.stringify({ password: NEW, email: 'someone-else@etyme.com', authAt: Date.now() }),
    }))
    expect(res.status).toBe(200)
    expect(db.person.findUnique.mock.calls.every((c: any[]) => c[0].where.primaryEmail !== 'someone-else@etyme.com')).toBe(true)
  })

  it('the account menu says Set a password until there is one, then Change password, and nothing at a directory-only company', async () => {
    const { passwordLineLabel } = await import('@/components/shell/password-line')
    expect(passwordLineLabel(false)).toBe('Set a password')
    expect(passwordLineLabel(true)).toBe('Change password')
    seat({ primaryEmail: 'nina@acmehealth.com' })
    policies = [{ companyId: 'co', mode: 'SSO_ONLY', company: { name: 'Acme Health', domain: 'acmehealth.com', domainVerified: true, claimedDomains: [] } }]
    const s = await ownPasswordState('nina@acmehealth.com')
    expect(s.allowed).toBe(false)
    // Reading whether the line is drawn writes no refusal.
    expect(db.accessLog.createMany).not.toHaveBeenCalled()
    for (const f of ['src/components/shell/header.tsx', 'src/components/shell/mobile-nav.tsx']) expect(read(f), f).toContain('<PasswordLine')
  })

  it('the screen is one column, asks on the page and never in a browser prompt', () => {
    const page = read('src/app/dashboard/settings/password/page.tsx')
    expect(page).toContain('mx-auto max-w-xl')
    expect(page).toContain('flex flex-col gap-4')
    expect(page).not.toMatch(/\b(alert|confirm|prompt)\(/)
    expect(page).toContain('Current password')
  })

  it('Forgot your password on a deployment that cannot send email says so and points to Set a password', () => {
    expect(RESET_SHUT).toBe('Etyme cannot send email here yet, so a reset link cannot reach you. If you can still sign in with Google or Microsoft, do that, then choose Set a password in the account menu.')
    expect(RESET_SHUT).not.toMatch(/deployment|email sender/)
  })
})
