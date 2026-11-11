import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readIdentityReason } from '@/lib/identity/ledger'

/**
 * Who is let in and who is let out, at the two seat routes
 * (etyme-regulatory, founder 2026-11-11, "Enterprise identity" and
 * "Hybrid is the Owner's choice"):
 *
 *  - an invitation of an address off a directory-only company's own
 *    domain is refused, and its row is written before the refusal goes out;
 *  - ending or pausing a person's last live seat anywhere ends every
 *    session they hold;
 *  - each identity row names the company, the actor, the subject, the
 *    policy and the surface.
 *
 * The routes run for real; only the database, the caller check and the
 * outbound channels are stood in for, and every call is put on one
 * timeline so the order is a fact the test reads.
 */

const timeline: string[] = []
const rows: Array<Record<string, any>> = []
let policies: unknown[] = []
let liveSeatsLeft = 0
let caller: any

const accessLog = {
  createMany: vi.fn(async ({ data }: { data: Array<Record<string, any>> }) => {
    timeline.push(`log:${data[0]?.action}`)
    rows.push(...data)
    return { count: data.length }
  }),
}

const prisma: any = {
  accessLog,
  companySignInPolicy: {
    findMany: vi.fn(async () => policies),
    findUnique: vi.fn(async () => null),
  },
  identityProvider: { findMany: vi.fn(async () => []) },
  company: {
    findUnique: vi.fn(async () => ({ domain: 'corvane.example', name: 'Corvane Packaging' })),
    findUniqueOrThrow: vi.fn(async () => ({ name: 'Corvane Packaging' })),
  },
  person: {
    findUnique: vi.fn(async () => null),
    create: vi.fn(async () => { timeline.push('person.create'); return { id: 'p-new', name: 'Sidhu' } }),
    update: vi.fn(async () => { timeline.push('person.endSessions'); return { sessionVersion: 3 } }),
  },
  context: {
    create: vi.fn(async () => { timeline.push('context.create'); return { id: 'ctx-new' } }),
    findMany: vi.fn(async () => [
      seatRow('ctx-owner', 'p-owner', ['*'], true),
      seatRow('ctx-priya', 'p-priya', ['timesheets.read'], true),
    ]),
    findUnique: vi.fn(async () => ({
      person: { id: 'p-priya', name: 'Priya Raman', primaryEmail: 'priya@corvane.example' },
      role: { name: 'HR' },
    })),
    update: vi.fn(async () => { timeline.push('context.update'); return {} }),
    count: vi.fn(async () => liveSeatsLeft),
  },
  automationLog: { create: vi.fn(async () => ({})) },
  notification: { create: vi.fn(async () => ({})) },
  $transaction: vi.fn(async (fn: (tx: any) => unknown) => fn(prisma)),
}

function seatRow(id: string, personId: string, permissions: string[], signedIn: boolean) {
  return {
    id, personId, roleId: `role-${id}`, lastUsedAt: signedIn ? new Date('2026-11-01') : null, invitedAt: null,
    suspendedAt: null, revokedAt: null, role: { permissions },
    person: { credentials: signedIn ? [{ id: 'c' }] : [] },
  }
}

vi.mock('@/lib/db', () => ({ get prisma() { return prisma } }))
vi.mock('@/lib/alerts', () => ({ reportError: vi.fn() }))
vi.mock('@/lib/events', () => ({ emit: vi.fn() }))
vi.mock('@/lib/notify', () => ({ notify: vi.fn() }))
vi.mock('@/lib/api-context', () => ({
  getCallerContext: vi.fn(async () => ({ caller, error: null })),
  realPersonId: (c: any) => c.person.id,
}))

const SSO_ONLY = [{
  companyId: 'corvane', mode: 'SSO_ONLY',
  company: { name: 'Corvane Packaging', domain: 'corvane.example', domainVerified: true, claimedDomains: [] },
}]

function req(body: unknown): any {
  return { json: async () => body, headers: new Headers() }
}

beforeEach(() => {
  timeline.length = 0
  rows.length = 0
  policies = []
  liveSeatsLeft = 0
  caller = {
    person: { id: 'p-owner', name: 'Margaret Osei' },
    company: { id: 'corvane', name: 'Corvane Packaging', kind: 'CLIENT' },
    permissions: ['*'],
  }
  vi.clearAllMocks()
})

describe('an invitation asks the company’s sign-in policy before anybody is seated', () => {
  it('a public address cannot be invited into a directory-only company, and the refusal is logged before it is sent', async () => {
    policies = SSO_ONLY
    const { POST } = await import('@/app/api/access/invite/route')
    const res = await POST(req({ email: 'sidhu871@gmail.com' }))
    timeline.push('response')

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.message).toContain('Corvane Packaging signs in through its company’s directory only'.replace('’', "'"))
    expect(body.error.message).toContain('Add the person in your company’s directory instead'.replace('’', "'"))
    // Nobody was made, nobody was seated, and the row came first.
    expect(timeline).toEqual(['log:LOGIN_REFUSED_SSO_ONLY', 'response'])
    expect(rows[0]).toMatchObject({ allowed: false, actorCompanyId: 'corvane', actorPersonId: 'p-owner', subjectCompanyId: 'corvane' })
  })

  it('an invitation that is allowed writes INVITE_SENT with the seat, naming the company, the inviter, the person, the policy and the surface', async () => {
    const { POST } = await import('@/app/api/access/invite/route')
    const res = await POST(req({ email: 'sidhu871@gmail.com' }))
    expect(res.status).toBe(201)
    expect(timeline).toEqual(['person.create', 'context.create', 'log:INVITE_SENT'])
    expect(prisma.context.create.mock.calls[0][0].data.source).toBe('INVITE')
    const row = rows[0]
    expect(row).toMatchObject({ action: 'INVITE_SENT', allowed: true, actorCompanyId: 'corvane', actorPersonId: 'p-owner', subjectId: 'p-new' })
    expect(readIdentityReason(row.reason)).toMatchObject({ policy: 'OPEN', surface: 'WEB' })
    expect(readIdentityReason(row.reason)!.says).toContain('Margaret Osei invited sidhu871@gmail.com')
  })
})

describe('taking a seat away ends the person’s sessions when it was their last', () => {
  it('removing a person’s last live seat ends every session they hold, after the seat ends', async () => {
    liveSeatsLeft = 0
    const { POST } = await import('@/app/api/access/[contextId]/route')
    const res = await POST(req({ action: 'revoke', reason: 'Left the company' }), { params: Promise.resolve({ contextId: 'ctx-priya' }) })
    expect(res.status).toBe(200)
    expect((await res.json()).data.sessionsEnded).toBe(true)
    expect(timeline).toEqual(['context.update', 'log:MEMBERSHIP_REVOKED', 'person.endSessions', 'log:SESSIONS_ENDED'])
    expect(prisma.person.update.mock.calls[0][0]).toMatchObject({ where: { id: 'p-priya' }, data: { sessionVersion: { increment: 1 } } })
  })

  it('pausing a person’s last live seat ends their sessions too, and writes no revoke', async () => {
    const { POST } = await import('@/app/api/access/[contextId]/route')
    const res = await POST(req({ action: 'suspend', reason: 'On leave' }), { params: Promise.resolve({ contextId: 'ctx-priya' }) })
    expect(res.status).toBe(200)
    expect(timeline).toEqual(['context.update', 'person.endSessions', 'log:SESSIONS_ENDED'])
  })

  it('a person who still holds a live seat somewhere else keeps their sessions, and the revoke is still written', async () => {
    liveSeatsLeft = 1
    const { POST } = await import('@/app/api/access/[contextId]/route')
    const res = await POST(req({ action: 'revoke', reason: 'Moved to another client' }), { params: Promise.resolve({ contextId: 'ctx-priya' }) })
    expect((await res.json()).data.sessionsEnded).toBe(false)
    expect(timeline).toEqual(['context.update', 'log:MEMBERSHIP_REVOKED'])
  })

  it('each event written carries the company, the actor, the subject, the policy and the surface', async () => {
    prisma.companySignInPolicy.findUnique.mockResolvedValueOnce({
      mode: 'HYBRID', jit: false, scim: false, requiredAssurance: null, dataRegion: null,
      requireDirectorySuppliers: false, setAt: new Date('2026-11-11'), reason: 'Partners on Gmail', setBy: { name: 'Margaret Osei' },
    })
    const { POST } = await import('@/app/api/access/[contextId]/route')
    await POST(req({ action: 'revoke', reason: 'Left the company' }), { params: Promise.resolve({ contextId: 'ctx-priya' }) })
    expect(rows.map((r) => r.action)).toEqual(['MEMBERSHIP_REVOKED', 'SESSIONS_ENDED'])
    for (const r of rows) {
      expect(r).toMatchObject({ actorCompanyId: 'corvane', actorPersonId: 'p-owner', subjectId: 'p-priya', allowed: true })
      expect(readIdentityReason(r.reason), r.action).toMatchObject({ policy: 'HYBRID', surface: 'WEB' })
    }
    expect(readIdentityReason(rows[0].reason)!.says).toContain('Margaret Osei ended Priya Raman’s seat at Corvane Packaging (HR): Left the company'.replace('’', "'"))
  })

  it('putting a seat back writes no identity event and ends nothing', async () => {
    const { POST } = await import('@/app/api/access/[contextId]/route')
    prisma.context.findMany.mockResolvedValueOnce([
      seatRow('ctx-owner', 'p-owner', ['*'], true),
      { ...seatRow('ctx-priya', 'p-priya', ['timesheets.read'], true), suspendedAt: new Date('2026-11-02') },
    ])
    const res = await POST(req({ action: 'reinstate' }), { params: Promise.resolve({ contextId: 'ctx-priya' }) })
    expect(res.status).toBe(200)
    expect(timeline).toEqual(['context.update'])
  })
})
