/**
 * Every identity event is in the access log under a name of its own, with
 * the time, the company, the actor, the subject, the policy that governed
 * it and the surface it happened on (founder, 2026-11-11). A refusal is
 * written before the refusal is sent. An event nothing writes yet says so,
 * and is never reported as wired.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const db = vi.hoisted(() => ({
  companySignInPolicy: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
  identityProvider: { findMany: vi.fn() },
  person: { findUnique: vi.fn() },
  role: { findFirst: vi.fn() },
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
  getSessionIdentity: vi.fn(async () => ({ email: 'owner@example.test', door: 'PASSWORD', issuer: null })),
}))

import { IDENTITY_EVENTS, WRITTEN_BY, identityRow, identityReason, readIdentityReason, isRefusal } from '@/lib/identity/ledger'

const ROOT = join(__dirname, '..', '..')

beforeEach(() => {
  vi.clearAllMocks()
  db.companySignInPolicy.findMany.mockResolvedValue([])
  db.companySignInPolicy.findUnique.mockResolvedValue(null)
  db.identityProvider.findMany.mockResolvedValue([])
  db.accessLog.createMany.mockResolvedValue({ count: 1 })
  db.$transaction.mockImplementation(async (fn: any) => fn(db))
})

describe('the identity events and their names', () => {
  it('the eleven events the founder named are each a name of their own, listed once', () => {
    const eleven = ['SSO_CONFIGURED', 'DOMAIN_VERIFIED', 'USER_PROVISIONED', 'USER_DEPROVISIONED', 'GROUP_ROLE_MAPPED', 'LOGIN_SUCCEEDED',
      'LOGIN_REFUSED_SSO_ONLY', 'INVITE_SENT', 'INVITE_ACCEPTED', 'MEMBERSHIP_REVOKED', 'AUTH_POLICY_CHANGED']
    for (const e of eleven) expect(IDENTITY_EVENTS).toContain(e)
    expect(new Set(IDENTITY_EVENTS).size).toBe(IDENTITY_EVENTS.length)
  })

  it('an event said to be written is written, by name and in full, in the file that is named', () => {
    for (const e of IDENTITY_EVENTS) {
      const file = WRITTEN_BY[e]
      if (!file) continue
      expect(existsSync(join(ROOT, file)), `${e}: ${file}`).toBe(true)
      expect(readFileSync(join(ROOT, file), 'utf8'), `${e} in ${file}`).toContain(`'${e}'`)
    }
  })

  it('an event nothing writes yet is listed as not written in the known limits, so a stub is never read as built', () => {
    const limits = readFileSync(join(ROOT, 'KNOWN-LIMITS.md'), 'utf8').split('## Identity, pass 1')[1] ?? ''
    for (const e of IDENTITY_EVENTS) if (!WRITTEN_BY[e]) expect(limits, e).toContain(e)
  })
})

describe('every row carries the time, company, actor, subject, policy and surface', () => {
  const entry = {
    event: 'AUTH_POLICY_CHANGED' as const, companyId: 'co-tapin', actorPersonId: 'p-sharath', subject: null,
    policy: 'HYBRID' as const, surface: 'WEB' as const, says: 'Sharath changed how Tapin’s people sign in from OPEN to HYBRID: the partners use Gmail.',
  }

  it('a row names its company, its actor and its subject, and a row about nobody names the company', () => {
    const r = identityRow(entry)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.actorCompanyId).toBe('co-tapin')
      expect(r.actorPersonId).toBe('p-sharath')
      expect(r.subject).toEqual({ companyId: 'co-tapin' })
      expect(r.action).toBe('AUTH_POLICY_CHANGED')
    }
  })

  it('the policy and the surface are read back out of the row, and the sentence after them', () => {
    const back = readIdentityReason(identityReason(entry))
    expect(back).toEqual({ policy: 'HYBRID', surface: 'WEB', says: entry.says })
  })

  it('a row that names neither a person nor a company, or says nothing, is refused rather than written', () => {
    expect(identityRow({ ...entry, companyId: null, subject: null }).ok).toBe(false)
    expect(identityRow({ ...entry, says: '  ' }).ok).toBe(false)
  })

  it('a refused sign-in is written refused, and nothing else is', () => {
    for (const e of IDENTITY_EVENTS) {
      const r = identityRow({ ...entry, event: e })
      if (r.ok) expect(r.allowed, e).toBe(!isRefusal(e))
    }
    expect(isRefusal('LOGIN_REFUSED_SSO_ONLY')).toBe(true)
  })
})

describe('a refusal is in the log before it is sent', () => {
  it('a door refused for a directory-only company writes its row before the answer comes back', async () => {
    const company = { name: 'Acme Health', domain: 'acmehealth.com', domainVerified: true, claimedDomains: [] }
    db.companySignInPolicy.findMany.mockResolvedValue([{ companyId: 'co-acme', mode: 'SSO_ONLY', company }])
    db.identityProvider.findMany.mockResolvedValue([{ companyId: 'co-acme', issuer: 'https://login.acmehealth.com/v2', company }])
    db.person.findUnique.mockResolvedValue({ id: 'p-nina' })
    let written = false
    db.accessLog.createMany.mockImplementation(async () => { written = true; return { count: 1 } })
    const { checkDoor } = await import('@/lib/identity/read')
    const v = await checkDoor({ door: 'PASSWORD', email: 'nina@acmehealth.com', surface: 'WEB' })
    expect(v.allowed).toBe(false)
    expect(written).toBe(true)
    const row = db.accessLog.createMany.mock.calls[0][0].data[0]
    expect(row).toMatchObject({ action: 'LOGIN_REFUSED_SSO_ONLY', allowed: false, subjectId: 'p-nina', actorCompanyId: 'co-acme' })
    expect(readIdentityReason(row.reason)).toMatchObject({ policy: 'SSO_ONLY', surface: 'WEB' })
  })

  it('a door that lets somebody in writes no refusal', async () => {
    const { checkDoor } = await import('@/lib/identity/read')
    await checkDoor({ door: 'PASSWORD', email: 'ann@plain-firm.com', surface: 'WEB' })
    expect(db.accessLog.createMany).not.toHaveBeenCalled()
  })
})

describe('the policy is changed by an Owner only, and the change commits with its row', () => {
  const caller = (roleId: string) => ({ person: { id: 'p-sharath', name: 'Sharath' }, company: { id: 'co-tapin', name: 'Tapin' }, context: { roleId } })
  const patch = async (body: unknown) => {
    const { PATCH } = await import('@/app/api/settings/sign-in/route')
    return PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify(body) }) as any)
  }

  it('an Owner choosing hybrid writes the policy and AUTH_POLICY_CHANGED in one transaction, with who and why', async () => {
    asCaller.value = caller('r-owner')
    db.role.findFirst.mockResolvedValue({ name: 'Owner' })
    const res = await patch({ mode: 'HYBRID', reason: 'Our three partners sign in with Gmail.' })
    expect(res.status).toBe(200)
    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect(db.companySignInPolicy.upsert.mock.calls[0][0].create).toMatchObject({ companyId: 'co-tapin', mode: 'HYBRID', setById: 'p-sharath', reason: 'Our three partners sign in with Gmail.' })
    const row = db.accessLog.createMany.mock.calls[0][0].data[0]
    expect(row).toMatchObject({ action: 'AUTH_POLICY_CHANGED', subjectCompanyId: 'co-tapin', actorPersonId: 'p-sharath', actorCompanyId: 'co-tapin' })
    expect(readIdentityReason(row.reason)).toMatchObject({ policy: 'HYBRID', surface: 'WEB' })
    expect(readIdentityReason(row.reason)!.says).toMatch(/from Nothing set to Hybrid: /)
  })

  it('the sign-in page prints a change in the screen’s words, Invitation only, Hybrid and Directory only, even for a row written with the machine names', async () => {
    const { eventSays } = await import('@/lib/identity/screen-words')
    expect(eventSays('Sharath changed how Tapin’s people sign in from INVITE_ONLY to HYBRID: partners.')).toBe('Sharath changed how Tapin’s people sign in from Invitation only to Hybrid: partners.')
    expect(eventSays('from HYBRID to SSO_ONLY')).toBe('from Hybrid to Directory only')
  })

  it('a policy set by nobody named reads "Set on <day>", never "Set by somebody", and a reason ending in a full stop is not given a second one', async () => {
    const { setLine } = await import('@/lib/identity/screen-words')
    expect(setLine({ setBy: null, on: 'Nov 11', reason: 'Seeded for the demo: the mock directory beside the seeded people.' })).toBe('Set on Nov 11: Seeded for the demo: the mock directory beside the seeded people.')
    expect(setLine({ setBy: 'Sharath Madavaram', on: 'Nov 11', reason: null })).toBe('Set by Sharath Madavaram on Nov 11.')
  })

  it('an Admin cannot change it, and nothing is written', async () => {
    asCaller.value = caller('r-admin')
    db.role.findFirst.mockResolvedValue({ name: 'Admin' })
    const res = await patch({ mode: 'HYBRID', reason: 'why not' })
    expect(res.status).toBe(403)
    expect(db.companySignInPolicy.upsert).not.toHaveBeenCalled()
    expect(db.accessLog.createMany).not.toHaveBeenCalled()
  })

  it('directory only is refused while no directory is turned on, because nobody could sign in, the Owner included', async () => {
    asCaller.value = caller('r-owner')
    db.role.findFirst.mockResolvedValue({ name: 'Owner' })
    const res = await patch({ mode: 'SSO_ONLY', reason: 'lock it down' })
    expect(res.status).toBe(422)
    expect((await res.json()).error.message).toMatch(/Connect your company's directory/)
    expect(db.companySignInPolicy.upsert).not.toHaveBeenCalled()
  })
})
