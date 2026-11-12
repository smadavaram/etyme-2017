/**
 * Ending a person's sessions ends every one of them on its next request
 * (founder, 2026-11-11): "remove them in your directory and they are out
 * here". A session is a 30-day token with no list to revoke it from, so
 * the token carries the session version it was signed in under and every
 * request compares it with the person's own.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  companySignInPolicy: { findMany: vi.fn(), findUnique: vi.fn() },
  identityProvider: { findMany: vi.fn() },
  person: { findUnique: vi.fn(), update: vi.fn() },
  role: { findFirst: vi.fn() },
  context: { findFirst: vi.fn() },
  company: { findUniqueOrThrow: vi.fn(async () => ({ name: 'Tapin' })) },
  accessLog: { createMany: vi.fn(async (_args: any) => ({ count: 1 })) },
  $transaction: vi.fn(),
  incident: { create: vi.fn() },
}))
vi.mock('@/lib/db', () => ({ prisma: db }))

const asCaller = vi.hoisted(() => ({ value: null as any }))
vi.mock('@/lib/api-context', () => ({
  getCallerContext: vi.fn(async () => ({ caller: asCaller.value, error: null })),
  realPersonId: (c: any) => c.person.id,
}))

import { sessionStands } from '@/lib/identity/policy'

beforeEach(() => {
  vi.clearAllMocks()
  db.companySignInPolicy.findMany.mockResolvedValue([])
  db.identityProvider.findMany.mockResolvedValue([])
  db.accessLog.createMany.mockResolvedValue({ count: 1 })
  db.$transaction.mockImplementation(async (fn: any) => fn(db))
})

const jwt = async (token: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
  const { authOptions } = await import('@/lib/auth')
  return authOptions.callbacks!.jwt!({ token, ...extra } as any)
}

describe('a session whose version is behind the person’s is over', () => {
  it('a session signed in before the person’s sessions were ended is refused', () => {
    const v = sessionStands({ door: 'PASSWORD', issuer: null, tokenVersion: 2, personVersion: 3 }, null, 'nina@acmehealth.com')
    expect(v.stands).toBe(false)
  })

  it('a session signed in after it stands', () => {
    expect(sessionStands({ door: 'PASSWORD', issuer: null, tokenVersion: 3, personVersion: 3 }, null, 'nina@acmehealth.com').stands).toBe(true)
  })

  it('a session from before this build carries no version and still stands for a person whose sessions were never ended', () => {
    expect(sessionStands({ door: null, issuer: null, tokenVersion: undefined, personVersion: 0 }, null, 'nina@acmehealth.com').stands).toBe(true)
  })

  it('a session signed in with a password is over once the address’s company becomes directory only', () => {
    const acme = { companyId: 'co', companyName: 'Acme Health', mode: 'SSO_ONLY' as const, issuers: ['https://login.acmehealth.com/v2'] }
    expect(sessionStands({ door: 'PASSWORD', issuer: null, tokenVersion: 0, personVersion: 0 }, acme, 'nina@acmehealth.com').stands).toBe(false)
    expect(sessionStands({ door: 'DIRECTORY', issuer: acme.issuers[0], tokenVersion: 0, personVersion: 0 }, acme, 'nina@acmehealth.com').stands).toBe(true)
  })
})

describe('the session callback reads it on every request', () => {
  it('a token behind the person’s version ends the session: NextAuth answers with no session and clears the cookie', async () => {
    db.person.findUnique.mockResolvedValue({ sessionVersion: 4 })
    await expect(jwt({ email: 'nina@acmehealth.com', sv: 3, door: 'PASSWORD' })).rejects.toThrow('SESSION_ENDED')
  })

  it('a token at the person’s version goes on', async () => {
    db.person.findUnique.mockResolvedValue({ sessionVersion: 4 })
    const t = await jwt({ email: 'nina@acmehealth.com', sv: 4, door: 'PASSWORD' })
    expect(t).toMatchObject({ email: 'nina@acmehealth.com', sv: 4 })
  })

  it('a new sign-in is stamped with the person’s current version and the door it came through', async () => {
    db.person.findUnique.mockResolvedValue({ sessionVersion: 7 })
    const t = await jwt({}, { user: { id: 'u', email: 'Nina@AcmeHealth.com', door: 'PASSWORD' }, account: { provider: 'credentials' } })
    expect(t).toMatchObject({ email: 'nina@acmehealth.com', sv: 7, door: 'PASSWORD' })
  })

  it('a password session for an address whose company is now directory only is ended on its next request', async () => {
    const company = { name: 'Acme Health', domain: 'acmehealth.com', domainVerified: true, claimedDomains: [] }
    db.companySignInPolicy.findMany.mockResolvedValue([{ companyId: 'co', mode: 'SSO_ONLY', company }])
    db.identityProvider.findMany.mockResolvedValue([{ companyId: 'co', issuer: 'https://login.acmehealth.com/v2', company }])
    db.person.findUnique.mockResolvedValue({ sessionVersion: 0 })
    await expect(jwt({ email: 'nina@acmehealth.com', sv: 0, door: 'PASSWORD' })).rejects.toThrow('SESSION_ENDED')
  })
})

describe('disabling a person ends access and sessions', () => {
  it('ending a person’s sessions raises their version and writes the row in the same transaction', async () => {
    db.person.update.mockResolvedValue({ sessionVersion: 5 })
    const { endSessions } = await import('@/lib/identity/read')
    const r = await endSessions({ personId: 'p-nina', actorPersonId: 'p-owner', companyId: 'co', policy: 'OPEN', surface: 'WEB', says: 'Rae signed Nina out everywhere.' })
    expect(r.sessionVersion).toBe(5)
    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect(db.person.update.mock.calls[0][0]).toMatchObject({ where: { id: 'p-nina' }, data: { sessionVersion: { increment: 1 }, sessionsEndedById: 'p-owner' } })
    const row = db.accessLog.createMany.mock.calls[0][0].data[0]
    expect(row).toMatchObject({ action: 'SESSIONS_ENDED', subjectId: 'p-nina', actorPersonId: 'p-owner', actorCompanyId: 'co' })
  })

  it('after the version is raised, the next request from the old session is refused', async () => {
    db.person.update.mockResolvedValue({ sessionVersion: 1 })
    const { endSessions } = await import('@/lib/identity/read')
    await endSessions({ personId: 'p-nina', actorPersonId: 'p-nina', companyId: null, policy: 'OPEN', surface: 'WEB', says: 'Nina signed out everywhere.' })
    db.person.findUnique.mockResolvedValue({ sessionVersion: 1 })
    await expect(jwt({ email: 'nina@acmehealth.com', sv: 0, door: 'PASSWORD' })).rejects.toThrow('SESSION_ENDED')
  })
})

describe('an Admin never ends an Owner\u2019s sessions', () => {
  const admin = { person: { id: 'p-admin', name: 'Vineel' }, company: { id: 'co', name: 'Tapin' }, context: { roleId: 'r-admin' } }

  it('an Admin asking to sign an Owner out everywhere is refused, and nothing is raised', async () => {
    asCaller.value = admin
    db.role.findFirst.mockResolvedValue({ name: 'Admin' })
    db.context.findFirst.mockResolvedValue({ person: { name: 'Sharath' }, role: { name: 'Owner' } })
    const { POST } = await import('@/app/api/settings/sign-in/sessions/route')
    const res = await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ personId: 'p-owner' }) }) as any)
    expect(res.status).toBe(403)
    expect((await res.json()).error.message).toMatch(/Only another Owner ends an Owner's sessions/)
    expect(db.person.update).not.toHaveBeenCalled()
  })

  it('an Admin may sign out a colleague who is not an Owner, and the colleague\u2019s version is raised', async () => {
    asCaller.value = admin
    db.role.findFirst.mockResolvedValue({ name: 'Admin' })
    db.context.findFirst.mockResolvedValue({ person: { name: 'Oliver' }, role: { name: 'Account Manager' } })
    db.person.update.mockResolvedValue({ sessionVersion: 1 })
    const { POST } = await import('@/app/api/settings/sign-in/sessions/route')
    const res = await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ personId: 'p-oliver' }) }) as any)
    expect(res.status).toBe(200)
    expect(db.person.update.mock.calls[0][0].where).toEqual({ id: 'p-oliver' })
  })
})

describe('a sign-in is never stamped with a guessed session version (fault 4, 2026-11-12)', () => {
  it('a failed read of the session version never signs a person in at version 0', async () => {
    db.person.findUnique.mockRejectedValue(new Error('connection reset'))
    await expect(jwt({}, { user: { id: 'u', email: 'sharath@etyme.com', door: 'PASSWORD' }, account: { provider: 'credentials' } }))
      .rejects.toThrow('connection reset')
  })

  it('a first read that fails is read once more, and the sign-in goes on at the person’s real version', async () => {
    db.person.findUnique.mockRejectedValueOnce(new Error('connection reset')).mockResolvedValueOnce({ sessionVersion: 3 })
    const t = await jwt({}, { user: { id: 'u', email: 'sharath@etyme.com', door: 'PASSWORD' }, account: { provider: 'credentials' } })
    expect(t.sv).toBe(3)
  })

  it('where the version cannot be read at sign-in, the sign-in ends with one sentence on the sign-in page', async () => {
    db.person.findUnique.mockRejectedValue(new Error('connection reset'))
    const { authOptions } = await import('@/lib/auth')
    const out = await authOptions.callbacks!.signIn!({
      user: { id: 'u', email: 'sharath@etyme.com' } as any,
      account: { provider: 'google', type: 'oauth', providerAccountId: 'sub' } as any,
      profile: { email_verified: true } as any,
    } as any)
    expect(out).toBe('/login?error=SessionUnread')
    const { signInRefusal } = await import('@/lib/login-doors')
    expect(signInRefusal('SessionUnread')).toBe('Etyme could not finish signing you in. Try again in a minute.')
  })

  it('the version read by the sign-in callback is the one the session carries', async () => {
    db.person.findUnique.mockResolvedValue({ sessionVersion: 2 })
    const { authOptions } = await import('@/lib/auth')
    const user: any = { id: 'u', email: 'sharath@etyme.com' }
    expect(await authOptions.callbacks!.signIn!({ user, account: { provider: 'google', type: 'oauth', providerAccountId: 'sub' } as any, profile: { email_verified: true } as any } as any)).toBe(true)
    db.person.findUnique.mockRejectedValue(new Error('would not be read again'))
    const t = await jwt({}, { user, account: { provider: 'google' } })
    expect(t.sv).toBe(2)
  })

  it('a firm’s address sends a sign-in to the one app address the mailed links use, never to its own host', async () => {
    const { readFileSync } = await import('node:fs')
    const mw = readFileSync('src/middleware.ts', 'utf8')
    expect(mw).toContain('return NextResponse.redirect(new URL(`${path}${request.nextUrl.search}`, appUrl()))')
    expect(mw).not.toContain('`https://${PLATFORM_HOST}`')
    // No redirect for the bare platform host or the deployment's own address: the host does the first, walks use the second.
    expect(mw).not.toMatch(/redirect\([^)]*www\./)
  })
})
