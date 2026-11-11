/**
 * Enterprise identity, pass 1 (founder, 2026-11-11): a directory-only
 * company's people come in through its own directory and no other door,
 * and an invited public-address seat at a hybrid company never moves money
 * or signs anything. Nothing about one company's policy reaches another.
 *
 * The testing budget allows unit tests for exactly these: the refusal at
 * every door, including the routes called directly; isolation; the
 * session kill (identity-sessions); the ledger (identity-ledger).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const db = vi.hoisted(() => ({
  companySignInPolicy: { findMany: vi.fn(), findUnique: vi.fn() },
  identityProvider: { findMany: vi.fn() },
  person: { findUnique: vi.fn(), findMany: vi.fn() },
  context: { findFirst: vi.fn(), findMany: vi.fn() },
  accessLog: { createMany: vi.fn(async (_args: any) => ({ count: 1 })), create: vi.fn(), findFirst: vi.fn() },
  company: { findFirst: vi.fn(), findMany: vi.fn(async () => []), findUnique: vi.fn() },
  supplierInvite: { findUnique: vi.fn(), findMany: vi.fn(async () => []) },
  signInFailure: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0), create: vi.fn(), deleteMany: vi.fn() },
  emailToken: { findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  automationLog: { create: vi.fn() },
  incident: { create: vi.fn() },
}))
vi.mock('@/lib/db', () => ({ prisma: db }))

const session = vi.hoisted(() => ({ value: null as any }))
vi.mock('next-auth/next', () => ({ getServerSession: vi.fn(async () => session.value) }))
vi.mock('@/lib/permission-grants', () => ({
  seatPermissions: vi.fn(async (_seat: unknown, role: string[]) => ({ permissions: role, granted: [] })),
}))

import { decideDoor, seatRefusal, narrowForPublicSeat, isLimitedPublicSeat, PUBLIC_SEAT_WITHHELD, DOORS, type CompanyPolicy } from '@/lib/identity/policy'
import { PERMISSIONS } from '@/lib/permissions'

const ACME: CompanyPolicy = { companyId: 'co-acme', companyName: 'Acme Health', mode: 'SSO_ONLY', issuers: ['https://login.acmehealth.com/v2'] }
const SMALL: CompanyPolicy = { companyId: 'co-small', companyName: 'Small Talent', mode: 'INVITE_ONLY', issuers: [] }
const HYBRID: CompanyPolicy = { companyId: 'co-tapin', companyName: 'Tapin', mode: 'HYBRID', issuers: [] }

/** The policy rows the reader would find for an address on acmehealth.com. */
function acmeIsDirectoryOnly() {
  const company = { name: 'Acme Health', domain: 'acmehealth.com', domainVerified: true, claimedDomains: [] }
  db.companySignInPolicy.findMany.mockResolvedValue([{ companyId: 'co-acme', mode: 'SSO_ONLY', company }])
  db.identityProvider.findMany.mockResolvedValue([{ companyId: 'co-acme', issuer: 'https://login.acmehealth.com/v2', company }])
}

beforeEach(() => {
  vi.clearAllMocks()
  db.companySignInPolicy.findMany.mockResolvedValue([])
  db.identityProvider.findMany.mockResolvedValue([])
  db.accessLog.createMany.mockResolvedValue({ count: 1 })
  session.value = null
})

const refusedRows = () => db.accessLog.createMany.mock.calls.map((c: any[]) => c[0].data).flat()

describe('a directory-only company: every door but its own directory refuses', () => {
  const OTHER_DOORS = DOORS.filter((d) => d !== 'DIRECTORY' && d !== 'INVITE')

  it('every door that is not the company’s directory refuses an address on its verified domain, in one sentence', () => {
    for (const door of OTHER_DOORS) {
      const v = decideDoor({ door, email: 'nina@acmehealth.com', domainCompany: ACME, publicAddress: false })
      expect(v.allowed, door).toBe(false)
      if (!v.allowed) expect(v.says, door).toMatch(/through your company's directory only/)
    }
  })

  it('the company’s own directory lets its person in, and somebody else’s directory does not', () => {
    expect(decideDoor({ door: 'DIRECTORY', email: 'nina@acmehealth.com', domainCompany: ACME, issuer: ACME.issuers[0], publicAddress: false }).allowed).toBe(true)
    expect(decideDoor({ door: 'DIRECTORY', email: 'nina@acmehealth.com', domainCompany: ACME, issuer: 'https://idp.stranger.example', publicAddress: false }).allowed).toBe(false)
  })

  it('there is no break-glass: the staff key and a claim link refuse a directory-only company even for an address off its domain', () => {
    for (const door of ['STAFF_BOOTSTRAP', 'CLAIM_LINK', 'PASSWORD', 'DOMAIN_JOIN'] as const) {
      const v = decideDoor({ door, email: 'ops@etyme.example', domainCompany: null, target: ACME, publicAddress: false })
      expect(v.allowed, door).toBe(false)
    }
  })

  it('a public address cannot be invited into a directory-only company; an address on its own domain can, and then signs in through the directory', () => {
    const gmail = decideDoor({ door: 'INVITE', email: 'sidhu@gmail.com', domainCompany: null, target: ACME, publicAddress: true })
    expect(gmail.allowed).toBe(false)
    if (!gmail.allowed) expect(gmail.says).toMatch(/cannot be invited/)
    expect(decideDoor({ door: 'INVITE', email: 'nina@acmehealth.com', domainCompany: ACME, target: ACME, publicAddress: false }).allowed).toBe(true)
  })

  it('a company with a directory turned on and no mode set reads directory only', () => {
    const v = decideDoor({ door: 'PASSWORD', email: 'nina@acmehealth.com', domainCompany: { ...ACME, mode: null }, publicAddress: false })
    expect(v.allowed).toBe(false)
  })

  it('a company with no policy and no directory answers every door as it did before', () => {
    for (const door of DOORS) {
      expect(decideDoor({ door, email: 'nina@plain.example', domainCompany: { companyId: 'c', companyName: 'Plain', mode: null, issuers: [] }, publicAddress: false }).allowed, door).toBe(true)
    }
  })
})

describe('the routes refuse when called directly, and the row is written before the refusal', () => {
  beforeEach(acmeIsDirectoryOnly)

  it('signing up a company with a password on a directory-only domain is refused by the route', async () => {
    const { POST } = await import('@/app/api/auth/password/signup/route')
    const res = await POST(new NextRequest('http://x/api/auth/password/signup', {
      method: 'POST', body: JSON.stringify({ as: 'company', email: 'nina@acmehealth.com', personName: 'Nina Park', password: 'a long enough password 42' }),
    }))
    expect(res.status).toBe(403)
    expect((await res.json()).error.message).toMatch(/Acme Health signs its people in through your company's directory only/)
    expect(refusedRows().some((r: any) => r.action === 'LOGIN_REFUSED_SSO_ONLY' && r.allowed === false)).toBe(true)
  })

  it('signing up as a candidate on a directory-only domain is refused by the route', async () => {
    const { POST } = await import('@/app/api/auth/password/signup/route')
    const res = await POST(new NextRequest('http://x/api/auth/password/signup', {
      method: 'POST', body: JSON.stringify({ as: 'candidate', email: 'nina@acmehealth.com', name: 'Nina Park', password: 'a long enough password 42' }),
    }))
    expect(res.status).toBe(403)
  })

  it('asking for the sign-up link again on a directory-only domain is refused by the route', async () => {
    const { POST } = await import('@/app/api/auth/password/resend/route')
    const res = await POST(new NextRequest('http://x/api/auth/password/resend', { method: 'POST', body: JSON.stringify({ email: 'nina@acmehealth.com' }) }))
    expect(res.status).toBe(403)
  })

  it('a password sign-in on a directory-only domain is refused before any password is checked', async () => {
    const { checkPassword } = await import('@/lib/password-door')
    const r = await checkPassword('nina@acmehealth.com', 'whatever it is', null)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('DIRECTORY_ONLY')
    expect(db.person.findUnique.mock.calls.some((c: any[]) => c[0]?.select?.passwordHash)).toBe(false)
  })

  it('a Google or Microsoft sign-in on a directory-only domain is sent back to the sign-in page', async () => {
    const { authOptions } = await import('@/lib/auth')
    for (const provider of ['google', 'azure-ad']) {
      const out = await authOptions.callbacks!.signIn!({
        user: { id: 'u', email: 'nina@acmehealth.com' } as any,
        account: { provider, type: 'oauth', providerAccountId: 'sub' } as any,
        profile: { email_verified: true, xms_edov: true } as any,
      } as any)
      expect(out, provider).toBe('/login?error=DirectoryOnly')
    }
  })

  it('the staff key seats nobody on a directory-only domain, the Superadmin included', async () => {
    db.company.findFirst.mockResolvedValue({ id: 'co-acme', slug: 'acme', name: 'Acme Health' })
    db.person.findMany.mockResolvedValue([])
    const { bootstrapCompany } = await import('@/lib/staff-bootstrap')
    const r = await bootstrapCompany({ name: 'Acme Health', domain: 'acmehealth.com', address: 'acme', kind: 'CLIENT', seats: [{ email: 'nina@acmehealth.com', role: 'Owner' }] } as any)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.says).toMatch(/The staff key does not open it either/)
  })

  it('a claim link is refused for an address on a directory-only domain', async () => {
    db.supplierInvite.findUnique.mockResolvedValue({ id: 'i', email: 'nina@acmehealth.com', state: 'PENDING', byId: 'p', by: { name: 'Rae' }, company: { id: 'co-shell', name: 'Acme Health', claimedAt: null, isDemo: false } })
    const { claimOrJoin } = await import('@/lib/company-create')
    const r = await claimOrJoin('tok', { personId: 'p-nina', email: 'nina@acmehealth.com' })
    expect(r.kind).toBe('REFUSED')
  })

  it('a live session signed in by a password cannot use a directory-only company’s seat, and is told why', async () => {
    session.value = { user: { email: 'nina@acmehealth.com', door: 'PASSWORD', issuer: null } }
    db.person.findUnique.mockResolvedValue({ id: 'p-nina', name: 'Nina Park', primaryEmail: 'nina@acmehealth.com', timezone: null })
    db.context.findFirst.mockResolvedValue({
      id: 'ctx', type: 'EMPLOYEE', companyId: 'co-acme', roleId: 'r', personId: 'p-nina', orgUnitId: null, lastUsedAt: new Date(),
      company: { id: 'co-acme', name: 'Acme Health', slug: 'acme', kind: 'CLIENT', outsideAccess: 'ALLOWED', accountWalls: false, isDemo: false, signInPolicy: { mode: 'SSO_ONLY' }, identityProviders: [{ issuer: ACME.issuers[0] }] },
      role: { id: 'r', name: 'Owner', permissions: ['*'] }, orgUnit: null,
    })
    const { getCallerContext } = await import('@/lib/api-context')
    const r = await getCallerContext()
    expect(r.caller).toBeNull()
    expect(r.error!.status).toBe(403)
    expect((await r.error!.json()).error.code).toBe('DIRECTORY_ONLY')
    expect(refusedRows().some((x: any) => x.action === 'LOGIN_REFUSED_SSO_ONLY')).toBe(true)
  })

  it('the same seat opens for a session the company’s own directory signed in', async () => {
    session.value = { user: { email: 'nina@acmehealth.com', door: 'DIRECTORY', issuer: ACME.issuers[0] } }
    db.person.findUnique.mockResolvedValue({ id: 'p-nina', name: 'Nina Park', primaryEmail: 'nina@acmehealth.com', timezone: null })
    db.context.findFirst.mockResolvedValue({
      id: 'ctx', type: 'EMPLOYEE', companyId: 'co-acme', roleId: 'r', personId: 'p-nina', orgUnitId: null, lastUsedAt: new Date(),
      company: { id: 'co-acme', name: 'Acme Health', slug: 'acme', kind: 'CLIENT', outsideAccess: 'ALLOWED', accountWalls: false, isDemo: false, signInPolicy: { mode: 'SSO_ONLY' }, identityProviders: [{ issuer: ACME.issuers[0] }] },
      role: { id: 'r', name: 'Owner', permissions: ['*'] }, orgUnit: null,
    })
    const { getCallerContext } = await import('@/lib/api-context')
    const r = await getCallerContext()
    expect(r.error).toBeNull()
    expect(r.caller!.company).not.toHaveProperty('signInPolicy')
  })
})

describe('invitation only and hybrid admit nobody by domain who was not invited', () => {
  it('an invitation-only company refuses a join by domain and seats an invited address', () => {
    expect(decideDoor({ door: 'DOMAIN_JOIN', email: 'ann@small.example', domainCompany: SMALL, target: SMALL, publicAddress: false }).allowed).toBe(false)
    expect(decideDoor({ door: 'INVITE', email: 'ann@gmail.com', domainCompany: null, target: SMALL, publicAddress: true }).allowed).toBe(true)
  })

  it('a hybrid company seats a public address by invitation only, never by domain', () => {
    expect(decideDoor({ door: 'INVITE', email: 'sidhu@gmail.com', domainCompany: null, target: HYBRID, publicAddress: true }).allowed).toBe(true)
    expect(decideDoor({ door: 'DOMAIN_JOIN', email: 'sidhu@gmail.com', domainCompany: null, target: HYBRID, publicAddress: true }).allowed).toBe(false)
  })
})

describe('isolation: an invited public-address seat never moves money or signs, and nothing crosses companies', () => {
  it('a public-address seat at a hybrid company holds none of the money and signing acts, even with an Owner’s everything', () => {
    const held = narrowForPublicSeat(['*'], PERMISSIONS)
    for (const p of PUBLIC_SEAT_WITHHELD) expect(held, p).not.toContain(p)
    expect(held).not.toContain('*')
    expect(held).toContain('consultants.read')
  })

  it('the limit applies only to a public address at a hybrid company', () => {
    expect(isLimitedPublicSeat(HYBRID, true)).toBe(true)
    expect(isLimitedPublicSeat(HYBRID, false)).toBe(false)
    expect(isLimitedPublicSeat(SMALL, true)).toBe(false)
    expect(isLimitedPublicSeat(null, true)).toBe(false)
  })

  it('every route reads the narrowed permissions: the shared caller check takes the acts off the seat', async () => {
    session.value = { user: { email: 'sidhu@gmail.com', door: 'GOOGLE_SOCIAL', issuer: null } }
    db.person.findUnique.mockResolvedValue({ id: 'p-sidhu', name: 'Sidhu', primaryEmail: 'sidhu@gmail.com', timezone: null })
    db.context.findFirst.mockResolvedValue({
      id: 'ctx', type: 'EMPLOYEE', companyId: 'co-tapin', roleId: 'r', personId: 'p-sidhu', orgUnitId: null, lastUsedAt: new Date(),
      company: { id: 'co-tapin', name: 'Tapin', slug: 'tapin', kind: 'VENDOR', outsideAccess: 'ALLOWED', accountWalls: false, isDemo: false, signInPolicy: { mode: 'HYBRID' }, identityProviders: [] },
      role: { id: 'r', name: 'Admin', permissions: ['payments.record', 'invoices.issue', 'timesheets.approve', 'team.manage'] }, orgUnit: null,
    })
    const { getCallerContext } = await import('@/lib/api-context')
    const r = await getCallerContext()
    expect(r.caller!.permissions).toEqual(['team.manage'])
    expect(r.caller!.rolePermissions).toEqual(['team.manage'])
  })

  it('the same person’s seat at a company with no policy keeps its role, because one company’s choice never reaches another', async () => {
    session.value = { user: { email: 'sidhu@gmail.com', door: 'GOOGLE_SOCIAL', issuer: null } }
    db.person.findUnique.mockResolvedValue({ id: 'p-sidhu', name: 'Sidhu', primaryEmail: 'sidhu@gmail.com', timezone: null })
    db.context.findFirst.mockResolvedValue({
      id: 'ctx2', type: 'EMPLOYEE', companyId: 'co-own', roleId: 'r2', personId: 'p-sidhu', orgUnitId: null, lastUsedAt: new Date(),
      company: { id: 'co-own', name: 'Sidhu LLC', slug: 'sidhu', kind: 'CONSULTANT_CORP', outsideAccess: 'ALLOWED', accountWalls: false, isDemo: false, signInPolicy: null, identityProviders: [] },
      role: { id: 'r2', name: 'Owner', permissions: ['invoices.issue'] }, orgUnit: null,
    })
    const { getCallerContext } = await import('@/lib/api-context')
    const r = await getCallerContext()
    expect(r.caller!.permissions).toEqual(['invoices.issue'])
  })

  it('a directory-only company’s rule never refuses a seat at another company', () => {
    expect(seatRefusal(null, { door: 'PASSWORD', issuer: null })).toBeNull()
    expect(seatRefusal(SMALL, { door: 'PASSWORD', issuer: null })).toBeNull()
    expect(seatRefusal(ACME, { door: 'DIRECTORY', issuer: 'https://idp.stranger.example' })).not.toBeNull()
  })
})

describe('the invited public-address seat reads why on its own menu', () => {
  it('the account menu, on a desktop and on a phone, shows the one sentence /api/me says for a limited seat, and nothing for any other seat', async () => {
    const { readFileSync } = await import('node:fs')
    const line = readFileSync('src/components/shell/superadmin-line.tsx', 'utf8')
    expect(line).toMatch(/export function LimitedSeatLine[\s\S]*if \(!limited\) return null/)
    expect(readFileSync('src/components/session-provider.tsx', 'utf8')).toMatch(/limited: typeof active\?\.limited === 'string' \? active\.limited : null/)
    for (const f of ['src/components/shell/header.tsx', 'src/components/shell/mobile-nav.tsx']) {
      expect(readFileSync(f, 'utf8').match(/<LimitedSeatLine\b/g)?.length, f).toBe(1)
    }
  })
})
