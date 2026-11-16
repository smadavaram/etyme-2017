import { describe, it, expect, beforeAll, vi } from 'vitest'

/**
 * Layer 7, security and sign-in (founder, 2026-11-16, record 80, answer 1):
 * a client company uses its own directory where it has one, with no
 * password or email-link back door. Proved here end to end, on the real
 * routes and the real database, with a session that goes through the real
 * NextAuth callbacks on every request.
 *
 * The session: `getServerSession` is the one thing a test cannot have, so
 * it is replaced by what NextAuth does on a request. The held token is
 * passed through `authOptions.callbacks.jwt` (which ends a session whose
 * version is behind, or whose door the company no longer allows) and then
 * `callbacks.session`. A throw is answered as nobody, as NextAuth does. The
 * session cookie is kept beside it, so the caller check can read whose
 * cookie it was.
 *
 * The world: Northbend Athletic, seeded with the demo's mock directory,
 * SCIM on, and the group "nb-hiring-managers" mapped to Hiring Manager
 * (lib/identity/seed-mock). A second company, Harborline Tech, is made
 * here with its own directory and SCIM token, on a reserved domain.
 */

const live = vi.hoisted(() => ({ token: null as null | Record<string, unknown>, cookie: null as null | string }))

vi.mock('next-auth/next', () => ({
  getServerSession: async (opts: any) => {
    if (!live.token) return null
    try {
      const token = await opts.callbacks.jwt({ token: { ...live.token } })
      return await opts.callbacks.session({ session: { user: { email: token.email }, expires: '' }, token })
    } catch {
      return null
    }
  },
}))

vi.mock('next/headers', async (orig) => ({
  ...((await orig()) as object),
  cookies: () => ({
    get: (name: string) => (name === 'next-auth.session-token' && live.cookie ? { value: live.cookie } : undefined),
    set: () => undefined,
  }),
}))

// Northbend's addresses are on a reserved name, which the password door
// refuses first as a demo's ("no email can reach this address"). Here they
// read as a real company's, so what answers is the directory rule.
vi.mock('@/lib/password', async (orig) => {
  const real: any = await orig()
  return { ...real, demoEmail: (e: string) => !String(e).toLowerCase().endsWith('@northbend.example') && real.demoEmail(e) }
})

import { NextRequest } from 'next/server'
import { encode } from 'next-auth/jwt'
import { req, json, prisma, freshWorld } from './harness'
import { authOptions } from '@/lib/auth'
import { getCallerContext } from '@/lib/api-context'
import { newScimToken } from '@/lib/identity/scim'
import { mockIssuerFor } from '@/lib/identity/mock-directory'
import { MOCK_GROUP } from '@/lib/identity/seed-mock'
import { directoryOnlySays, directoryTurnedOffSays } from '@/lib/identity/policy'
import { checkPassword, issueSetPassword, resetPassword, signUpCandidate } from '@/lib/password-door'

import { GET as listUsers, POST as addUser } from '@/app/api/scim/v2/Users/route'
import * as oneUser from '@/app/api/scim/v2/Users/[id]/route'
// The handlers' inferred type allows undefined; they never answer with it.
type ById = (r: NextRequest, c: { params: { id: string } }) => Promise<Response>
const readUser = oneUser.GET as ById
const patchUser = oneUser.PATCH as ById
const putUser = oneUser.PUT as ById
const deleteUser = oneUser.DELETE as ById
import { GET as listGroups } from '@/app/api/scim/v2/Groups/route'
import { GET as readGroup, PATCH as patchGroup } from '@/app/api/scim/v2/Groups/[id]/route'

import { GET as requirements } from '@/app/api/requirements/route'
import { GET as submissions } from '@/app/api/submissions/route'
import { GET as timesheets } from '@/app/api/timesheets/route'
import { GET as companies } from '@/app/api/companies/route'
import { GET as invoices } from '@/app/api/invoices/route'
import { GET as today } from '@/app/api/today/route'
import { GET as approvals } from '@/app/api/twin/approvals/route'
import { GET as signInSettings } from '@/app/api/settings/sign-in/route'
import { GET as me } from '@/app/api/me/route'
import { POST as invite } from '@/app/api/access/invite/route'

const NB_SLUG = 'world-nike'
const NB_ISSUER = mockIssuerFor(NB_SLUG)
const HB_ISSUER = 'https://login.harborline-tech.example/v2'
const SECRET = 'integration-test-secret'

let nb = { id: '', name: '' }
let hb = { id: '', name: '' }
let nbToken = ''
let hbToken = ''
let hbUserId = ''
let mateo = { id: '', email: 'mateo.silva@northbend.example' }
const INES = 'ines.okafor@northbend.example'

// ── The session, as NextAuth keeps it ────────────────────────────────

const PROVIDER: Record<string, string> = {
  DIRECTORY: 'directory-oidc', PASSWORD: 'credentials', VERIFY_TOKEN: 'credentials',
  EMAIL_LINK: 'email', GOOGLE_SOCIAL: 'google', MICROSOFT_SOCIAL: 'azure-ad', LINKEDIN: 'linkedin',
}

/** A sign-in through one door, through the real sign-in and token callbacks. Returns the callback's answer. */
async function signIn(email: string, door: keyof typeof PROVIDER, issuer: string | null = null): Promise<true | string> {
  const user = { id: email, email, verified: true, door: door === 'VERIFY_TOKEN' ? 'VERIFY_TOKEN' : door === 'PASSWORD' ? 'PASSWORD' : door === 'DIRECTORY' ? 'DIRECTORY' : undefined, issuer }
  const account = { provider: PROVIDER[door], type: 'oauth', providerAccountId: email } as any
  const profile = { email, email_verified: true, iss: issuer ?? undefined } as any
  const said = await authOptions.callbacks!.signIn!({ user: user as any, account, profile })
  if (said !== true) return String(said)
  live.token = (await authOptions.callbacks!.jwt!({ token: {} as any, user: user as any, account, profile, trigger: 'signIn' } as any)) as any
  live.cookie = await encode({ token: live.token as any, secret: SECRET })
  return true
}

function signOut() {
  live.token = null
  live.cookie = null
}

const scim = (token: string) => ({ authorization: `Bearer ${token}`, 'content-type': 'application/scim+json' })
const off = { schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'], Operations: [{ op: 'replace', path: 'active', value: false }] }
const members = (op: 'add' | 'remove', id: string) =>
  op === 'add'
    ? { schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'], Operations: [{ op: 'add', path: 'members', value: [{ value: id }] }] }
    : { schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'], Operations: [{ op: 'remove', path: `members[value eq "${id}"]` }] }

async function provisionAt(token: string, userName: string, externalId: string) {
  const r = await json(await addUser(req('POST', '/scim/v2/Users', { schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], userName, externalId, displayName: userName.split('@')[0] }, scim(token))))
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return r.body.id as string
}

/** Every route a seat reads through, by the one caller check or the session alone. */
const SEAT_ROUTES: [string, (r: NextRequest) => Promise<Response>][] = [
  ['/api/requirements', requirements as any],
  ['/api/submissions', submissions as any],
  ['/api/timesheets', timesheets as any],
  ['/api/companies', companies as any],
  ['/api/invoices', invoices as any],
  ['/api/today', today as any],
  ['/api/twin/approvals', approvals as any],
  ['/api/settings/sign-in', signInSettings as any],
]

async function refusedRows(personId: string, since: Date) {
  return prisma.accessLog.findMany({ where: { subjectId: personId, allowed: false, at: { gte: since } }, orderBy: { at: 'asc' }, select: { action: true, reason: true, actorCompanyId: true } })
}

beforeAll(async () => {
  await freshWorld()
  delete process.env.DEV_BYPASS_AUTH
  nb = await prisma.company.findUniqueOrThrow({ where: { slug: NB_SLUG }, select: { id: true, name: true } })
  mateo = { ...mateo, id: (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: mateo.email }, select: { id: true } })).id }

  const t = newScimToken()
  await prisma.scimToken.create({ data: { companyId: nb.id, tokenHash: t.tokenHash, last4: t.last4 } })
  nbToken = t.token

  // A second client with its own directory and SCIM, on a reserved domain.
  const made = await prisma.company.create({
    data: {
      name: 'Harborline Tech', slug: 'harborline-tech-directory-test', kind: 'CLIENT',
      domain: 'harborline-tech.example', domainVerified: true,
      roles: { create: [{ name: 'Member', permissions: [] }, { name: 'Hiring Manager', permissions: ['requirements.read'] }] },
    },
    select: { id: true, name: true, roles: { select: { id: true, name: true } } },
  })
  hb = { id: made.id, name: made.name }
  const provider = await prisma.identityProvider.create({ data: { companyId: hb.id, type: 'OIDC', label: 'Harborline directory', issuer: HB_ISSUER, clientId: 'hb', enabled: true } })
  await prisma.companySignInPolicy.create({ data: { companyId: hb.id, mode: 'SSO_ONLY', scim: true, reason: 'Test: its own directory only.' } })
  await prisma.directoryGroupRole.create({ data: { companyId: hb.id, identityProviderId: provider.id, groupId: 'hb-managers', groupName: 'Harborline managers', roleId: made.roles.find((r) => r.name === 'Hiring Manager')!.id } })
  const h = newScimToken()
  await prisma.scimToken.create({ data: { companyId: hb.id, tokenHash: h.tokenHash, last4: h.last4 } })
  hbToken = h.token
  hbUserId = await provisionAt(hbToken, 'rosa.lindgren@harborline-tech.example', 'hb-0001')
}, 300_000)

// ── 1. Removed in the directory: access ends on the next request ─────

describe('a person removed in the company directory loses access on her next request', () => {
  it('a person the directory turns off through SCIM is refused by every route on her next request, in a sentence, and her open session no longer acts', async () => {
    const id = await provisionAt(nbToken, 'dana.reyes@northbend.example', 'nb-0101')
    const dana = await prisma.externalIdentity.findUniqueOrThrow({ where: { id }, select: { personId: true } })
    await patchGroup(req('PATCH', `/scim/v2/Groups/${MOCK_GROUP.groupId}`, members('add', id), scim(nbToken)), { params: { id: MOCK_GROUP.groupId } })

    expect(await signIn('dana.reyes@northbend.example', 'DIRECTORY', NB_ISSUER)).toBe(true)
    const before = await json(await requirements(req('GET', '/api/requirements')))
    expect(before.status, JSON.stringify(before.body)).toBe(200)

    const since = new Date()
    const turned = await json(await patchUser(req('PATCH', `/scim/v2/Users/${id}`, off, scim(nbToken)), { params: { id } }))
    expect(turned.status, JSON.stringify(turned.body)).toBe(200)
    expect(turned.body.active).toBe(false)

    // The same browser, the same cookie: every route refuses her.
    for (const [path, route] of SEAT_ROUTES) {
      const r = await json(await route(req('GET', path)))
      expect([401, 403], `${path}: ${JSON.stringify(r.body)}`).toContain(r.status)
      expect(r.body.error.message, path).toBe(directoryTurnedOffSays(nb.name))
    }
    // The session itself is over: NextAuth answers nobody for it.
    await expect(authOptions.callbacks!.jwt!({ token: { ...live.token } } as any)).rejects.toThrow('SESSION_ENDED')

    // Every refusal is in the record, under her, at Northbend.
    const rows = await refusedRows(dana.personId, since)
    expect(rows.length).toBeGreaterThanOrEqual(SEAT_ROUTES.length)
    for (const row of rows) expect(row.actorCompanyId).toBe(nb.id)
    signOut()
  })

  it('a SCIM removal pauses her seat, ends every session and writes the removal to the identity ledger, all at once', async () => {
    const dana = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: 'dana.reyes@northbend.example' }, select: { id: true, sessionVersion: true, sessionsEndedAt: true } })
    const seat = await prisma.context.findFirstOrThrow({ where: { personId: dana.id, companyId: nb.id }, select: { suspendedAt: true, suspendReason: true } })
    expect(seat.suspendedAt).not.toBeNull()
    expect(seat.suspendReason).toBe('Turned off in the company’s directory.')
    expect(dana.sessionVersion).toBeGreaterThan(0)
    expect(dana.sessionsEndedAt).not.toBeNull()
    const row = await prisma.accessLog.findFirstOrThrow({ where: { subjectId: dana.id, action: 'USER_DEPROVISIONED', allowed: true } })
    expect(row.reason).toContain('surface SCIM')
    expect(row.reason).toContain('turned dana.reyes@northbend.example off (turned off in the directory)')
  })

  it('signing in again by another door after the directory turned her off reaches no seat, and the refusal is written first', async () => {
    const dana = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: 'dana.reyes@northbend.example' }, select: { id: true } })
    // Northbend is hybrid, so the password door itself lets her through.
    expect(await signIn('dana.reyes@northbend.example', 'PASSWORD')).toBe(true)
    const since = new Date()
    const r = await json(await requirements(req('GET', '/api/requirements')))
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('DIRECTORY_OFF')
    expect(r.body.error.message).toBe(directoryTurnedOffSays(nb.name))
    const rows = await refusedRows(dana.id, since)
    expect(rows).toHaveLength(1)
    expect(rows[0].actorCompanyId).toBe(nb.id)
    // Her own menu offers no seat at Northbend.
    const mine = await json(await me(req('GET', '/api/me')))
    expect(mine.body.data.contexts.map((c: any) => c.company?.id)).not.toContain(nb.id)
    signOut()
  })

  it('a person deleted in the directory through SCIM is refused on her next request the same way', async () => {
    const id = await provisionAt(nbToken, 'lena.park@northbend.example', 'nb-0102')
    const { personId } = await prisma.externalIdentity.findUniqueOrThrow({ where: { id }, select: { personId: true } })
    await patchGroup(req('PATCH', `/scim/v2/Groups/${MOCK_GROUP.groupId}`, members('add', id), scim(nbToken)), { params: { id: MOCK_GROUP.groupId } })
    expect(await signIn('lena.park@northbend.example', 'DIRECTORY', NB_ISSUER)).toBe(true)
    expect((await json(await requirements(req('GET', '/api/requirements')))).status).toBe(200)

    const gone = await deleteUser(req('DELETE', `/scim/v2/Users/${id}`, undefined, scim(nbToken)), { params: { id } })
    expect(gone.status).toBe(204)
    const r = await json(await today(req('GET', '/api/today')))
    expect(r.status).toBe(401)
    expect(r.body.error.message).toBe(directoryTurnedOffSays(nb.name))
    expect(await prisma.context.count({ where: { personId, companyId: nb.id, suspendedAt: null, revokedAt: null } })).toBe(0)
    expect(await prisma.accessLog.count({ where: { subjectId: personId, action: 'USER_DEPROVISIONED', reason: { contains: 'deleted in the directory' } } })).toBe(1)
    signOut()
  })
})

// ── 2. A directory group decides the role, on the next request ───────

describe('a directory group mapped to a role decides her role on her next request', () => {
  let omar = ''
  it('a person added to a group mapped to a role holds that role on her next request, with no new sign-in', async () => {
    omar = await provisionAt(nbToken, 'omar.haddad@northbend.example', 'nb-0103')
    expect(await signIn('omar.haddad@northbend.example', 'DIRECTORY', NB_ISSUER)).toBe(true)
    const first = await json(await requirements(req('GET', '/api/requirements')))
    expect(first.status, 'a seat with no role yet does not read jobs').toBe(403)

    const added = await patchGroup(req('PATCH', `/scim/v2/Groups/${MOCK_GROUP.groupId}`, members('add', omar), scim(nbToken)), { params: { id: MOCK_GROUP.groupId } })
    expect(added.status).toBe(204)
    const c = await getCallerContext(req('GET', '/api/requirements'))
    expect(c.caller?.permissions).toContain('requirements.read')
    expect((await json(await requirements(req('GET', '/api/requirements')))).status).toBe(200)
  })

  it('removed from the group, she loses the role on her next request, and both changes are in the ledger', async () => {
    const removed = await patchGroup(req('PATCH', `/scim/v2/Groups/${MOCK_GROUP.groupId}`, members('remove', omar), scim(nbToken)), { params: { id: MOCK_GROUP.groupId } })
    expect(removed.status).toBe(204)
    const c = await getCallerContext(req('GET', '/api/requirements'))
    expect(c.caller?.permissions ?? []).not.toContain('requirements.read')
    expect((await json(await requirements(req('GET', '/api/requirements')))).status).toBe(403)
    const { personId } = await prisma.externalIdentity.findUniqueOrThrow({ where: { id: omar }, select: { personId: true } })
    const says = (await prisma.accessLog.findMany({ where: { subjectId: personId, action: 'USER_PROVISIONED' }, select: { reason: true } })).map((r) => r.reason ?? '')
    expect(says.some((s) => s.includes(`joined the directory group ${MOCK_GROUP.groupName}`))).toBe(true)
    expect(says.some((s) => s.includes(`left the directory group ${MOCK_GROUP.groupName}`))).toBe(true)
    signOut()
  })
})

// ── 3. Directory only: no back door ──────────────────────────────────

describe('at a directory-only company every door but its own directory is refused and logged', () => {
  beforeAll(async () => {
    await prisma.companySignInPolicy.update({ where: { companyId: nb.id }, data: { mode: 'SSO_ONLY' } })
  })

  const refusalsFor = (personId: string, since: Date) =>
    prisma.accessLog.count({ where: { subjectId: personId, action: 'LOGIN_REFUSED_SSO_ONLY', allowed: false, at: { gte: since } } })

  it('a password, an email link, a confirm link, Google, Microsoft and LinkedIn each refuse her address, each with a row written first', async () => {
    for (const door of ['PASSWORD', 'VERIFY_TOKEN', 'EMAIL_LINK', 'GOOGLE_SOCIAL', 'MICROSOFT_SOCIAL', 'LINKEDIN'] as const) {
      const since = new Date()
      expect(await signIn(mateo.email, door), door).toBe('/login?error=DirectoryOnly')
      expect(await refusalsFor(mateo.id, since), door).toBe(1)
      expect(live.token, door).toBeNull()
    }
  })

  it('the password door refuses her before any password is checked, and no password can be set or signed up on her address', async () => {
    const since = new Date()
    const pw = await checkPassword(mateo.email, 'Correct horse battery staple 42', null)
    expect(pw).toMatchObject({ ok: false, code: 'DIRECTORY_ONLY', says: directoryOnlySays(nb.name) })
    // An invitation's set-password link, and a firm's sign-in link, both end at this one door.
    const link = await issueSetPassword(mateo.id, 1, new Date(), nb.id)
    const set = await resetPassword(link.split('/reset/')[1], 'Correct horse battery staple 42')
    expect(set).toMatchObject({ ok: false, status: 403, says: directoryOnlySays(nb.name) })
    expect((await prisma.person.findUniqueOrThrow({ where: { id: mateo.id }, select: { passwordHash: true } })).passwordHash).toBeNull()
    const up = await signUpCandidate({ email: 'new.hire@northbend.example', password: 'Correct horse battery staple 42', name: 'New Hire' })
    expect(up).toMatchObject({ ok: false, status: 403 })
    expect(await refusalsFor(mateo.id, since)).toBe(2)
  })

  it('a session signed in by a password before the company chose directory only is ended on its next request', async () => {
    await prisma.companySignInPolicy.update({ where: { companyId: nb.id }, data: { mode: 'HYBRID' } })
    expect(await signIn(mateo.email, 'PASSWORD')).toBe(true)
    await prisma.companySignInPolicy.update({ where: { companyId: nb.id }, data: { mode: 'SSO_ONLY' } })
    const r = await json(await requirements(req('GET', '/api/requirements')))
    expect(r.status).toBe(401)
    signOut()
  })

  it('a seat at a directory-only company is refused to a password session of somebody off its domain, logged before the refusal', async () => {
    const seat = await prisma.context.findFirstOrThrow({
      where: { companyId: nb.id, revokedAt: null, suspendedAt: null, roleId: { not: null }, person: { primaryEmail: { endsWith: '@demo.etyme.local' } } },
      orderBy: { id: 'asc' },
      select: { id: true, person: { select: { id: true, primaryEmail: true } } },
    })
    expect(await signIn(seat.person.primaryEmail, 'PASSWORD')).toBe(true)
    const since = new Date()
    for (const [path, route] of SEAT_ROUTES) {
      const r = await json(await route(req('GET', path, undefined, { 'x-context-id': seat.id })))
      expect(r.status, path).toBe(403)
      expect(r.body.error.message, path).toBe(directoryOnlySays(nb.name))
    }
    expect(await refusalsFor(seat.person.id, since)).toBe(SEAT_ROUTES.length)
    signOut()
  })

  it('her own directory still lets her in, and another company’s directory does not', async () => {
    expect(await signIn(mateo.email, 'DIRECTORY', NB_ISSUER)).toBe(true)
    expect((await json(await requirements(req('GET', '/api/requirements')))).status).toBe(200)
    signOut()
    expect(await signIn(mateo.email, 'DIRECTORY', HB_ISSUER)).toBe('/login?error=DirectoryOnly')
  })

  it('an invitation to somebody off the company’s domain is refused at the route, logged before the refusal', async () => {
    expect(await signIn(INES, 'DIRECTORY', NB_ISSUER)).toBe(true)
    const r = await json(await invite(req('POST', '/api/access/invite', { email: 'pat.lee@harborline-tech.example', reason: 'Test' })))
    expect(r.status, JSON.stringify(r.body)).toBe(403)
    expect(await prisma.person.count({ where: { primaryEmail: 'pat.lee@harborline-tech.example' } })).toBe(0)
    expect(await prisma.accessLog.count({ where: { action: 'LOGIN_REFUSED_SSO_ONLY', actorCompanyId: nb.id, reason: { contains: 'pat.lee@harborline-tech.example' } } })).toBe(1)
    signOut()
  })
})

// ── 4. SCIM tokens ───────────────────────────────────────────────────

describe('a SCIM token reaches only its own company', () => {
  it('a revoked SCIM token is refused, and the refusal is in its company’s record before it is answered', async () => {
    const t = newScimToken()
    const row = await prisma.scimToken.create({ data: { companyId: nb.id, tokenHash: t.tokenHash, last4: t.last4, revokedAt: new Date() } })
    const since = new Date()
    const r = await json(await listUsers(req('GET', '/scim/v2/Users', undefined, scim(t.token))))
    expect(r.status).toBe(401)
    const logged = await prisma.accessLog.findMany({ where: { subjectCompanyId: nb.id, allowed: false, at: { gte: since } }, select: { reason: true } })
    expect(logged.some((l) => (l.reason ?? '').includes(`…${row.last4}`) && (l.reason ?? '').includes('revoked'))).toBe(true)
  })

  it('a SCIM token nobody issued is refused and reaches no company', async () => {
    const r = await json(await listUsers(req('GET', '/scim/v2/Users', undefined, scim('etyme_scim_not-a-real-token'))))
    expect(r.status).toBe(401)
    expect(r.body.Resources).toBeUndefined()
  })

  it('a token of one company can never read, change or remove a person of another', async () => {
    const asNb = scim(nbToken)
    expect((await readUser(req('GET', `/scim/v2/Users/${hbUserId}`, undefined, asNb), { params: { id: hbUserId } })).status).toBe(404)
    expect((await patchUser(req('PATCH', `/scim/v2/Users/${hbUserId}`, off, asNb), { params: { id: hbUserId } })).status).toBe(404)
    expect((await putUser(req('PUT', `/scim/v2/Users/${hbUserId}`, { active: false }, asNb), { params: { id: hbUserId } })).status).toBe(404)
    expect((await deleteUser(req('DELETE', `/scim/v2/Users/${hbUserId}`, undefined, asNb), { params: { id: hbUserId } })).status).toBe(404)
    const listed = await json(await listUsers(req('GET', '/scim/v2/Users?filter=userName%20eq%20%22rosa.lindgren%40harborline-tech.example%22', undefined, asNb)))
    expect(listed.body.totalResults).toBe(0)
    const byId = await json(await listUsers(req('GET', `/scim/v2/Users?filter=id%20eq%20%22${hbUserId}%22`, undefined, asNb)))
    expect(byId.body.totalResults).toBe(0)
    // Nor seat her: her address is off Northbend's verified domains.
    const seat = await json(await addUser(req('POST', '/scim/v2/Users', { userName: 'rosa.lindgren@harborline-tech.example', externalId: 'hb-0001' }, asNb)))
    expect(seat.status).toBe(400)

    const ei = await prisma.externalIdentity.findUniqueOrThrow({ where: { id: hbUserId }, select: { disabledAt: true, email: true, personId: true } })
    expect(ei.disabledAt).toBeNull()
    expect(ei.email).toBe('rosa.lindgren@harborline-tech.example')
    expect(await prisma.context.count({ where: { personId: ei.personId, companyId: nb.id } })).toBe(0)
  })

  it('a token of one company can never read another’s group, or move another’s person through a group', async () => {
    const asNb = scim(nbToken)
    expect((await readGroup(req('GET', '/scim/v2/Groups/hb-managers', undefined, asNb), { params: { id: 'hb-managers' } })).status).toBe(404)
    const groups = await json(await listGroups(req('GET', '/scim/v2/Groups', undefined, asNb)))
    expect(groups.body.Resources.map((g: any) => g.id)).not.toContain('hb-managers')
    await patchGroup(req('PATCH', '/scim/v2/Groups/hb-managers', members('add', hbUserId), asNb), { params: { id: 'hb-managers' } })
    await patchGroup(req('PATCH', `/scim/v2/Groups/${MOCK_GROUP.groupId}`, members('add', hbUserId), asNb), { params: { id: MOCK_GROUP.groupId } })
    const { personId } = await prisma.externalIdentity.findUniqueOrThrow({ where: { id: hbUserId }, select: { personId: true } })
    const seat = await prisma.context.findFirstOrThrow({ where: { personId, companyId: hb.id }, select: { role: { select: { name: true } } } })
    expect(seat.role?.name).toBe('Member')
  })

  it('a SCIM change of address is refused where the new address is off the company’s verified domains', async () => {
    const id = await provisionAt(nbToken, 'sam.ortiz@northbend.example', 'nb-0104')
    const moved = await json(await patchUser(req('PATCH', `/scim/v2/Users/${id}`, { schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'], Operations: [{ op: 'replace', path: 'userName', value: 'rosa.lindgren@harborline-tech.example' }] }, scim(nbToken)), { params: { id } }))
    expect(moved.status).toBe(400)
    const put = await json(await putUser(req('PUT', `/scim/v2/Users/${id}`, { userName: 'someone@gmail.com' }, scim(nbToken)), { params: { id } }))
    expect(put.status).toBe(400)
    expect((await prisma.externalIdentity.findUniqueOrThrow({ where: { id }, select: { email: true } })).email).toBe('sam.ortiz@northbend.example')
  })
})
