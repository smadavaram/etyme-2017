/**
 * An invitation is accepted where its seat is opened, and nowhere else
 * (2026-11-16).
 *
 * A sign-in by a person wrote INVITE_ACCEPTED at every firm where she held
 * an invited seat with no use date, whichever seat she opened. Firm B
 * invited an address whose owner signs in daily elsewhere; her next
 * sign-in anywhere wrote a row at B, and B's Users & permissions, the seat
 * reader, the sign-in line, Withdraw and the nightly watch read her as
 * having come in at B. B learned she has an account elsewhere, and a
 * manager who never arrived counted as one who can keep the firm open.
 *
 * Now a sign-in writes LOGIN_SUCCEEDED only, and the caller check writes
 * INVITE_ACCEPTED for the one seat the session opened, once.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let accepted: { actorPersonId: string; actorCompanyId: string }[] = []
const db: any = {
  person: { findUnique: vi.fn(async () => ({ id: 'p-dana' })) },
  context: { findMany: vi.fn(async () => [{ id: 'seat-b', companyId: 'co-b', company: { name: 'Northwind Staffing' } }]) },
  companySignInPolicy: { findMany: vi.fn(async () => []), findUnique: vi.fn(async () => null) },
  identityProvider: { findMany: vi.fn(async () => []) },
  accessLog: {
    findFirst: vi.fn(async ({ where }: any) =>
      accepted.find((r) => r.actorPersonId === where.actorPersonId && r.actorCompanyId === where.actorCompanyId) ?? null),
    createMany: vi.fn(async ({ data }: any) => {
      for (const d of data) if (d.action === 'INVITE_ACCEPTED') accepted.push({ actorPersonId: d.actorPersonId, actorCompanyId: d.actorCompanyId })
      return { count: data.length }
    }),
  },
  incident: { create: vi.fn(async () => ({ id: 'i' })) },
  $executeRaw: vi.fn(async () => 1),
  $transaction: vi.fn(async (fn: any) => fn(db)),
}
vi.mock('@/lib/db', () => ({ get prisma() { return db } }))

import { recordSignInLedger, markSeatOpened, opensAnInvitation, defaultSeatOf } from '@/lib/identity/sign-in'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const written = () => (db.accessLog.createMany.mock.calls as any[]).flatMap((c) => c[0].data)
const DANA = { id: 'p-dana', primaryEmail: 'dana@harborline-tech.example' }
const invitedSeat = { id: 'seat-b', companyId: 'co-b', invitedAt: new Date('2026-11-10T09:00:00Z'), lastUsedAt: null }
const at = { companyName: 'Northwind Staffing', policy: 'OPEN' as const, surface: 'WEB' as const }

beforeEach(() => {
  vi.clearAllMocks()
  accepted = []
})

describe('an invitation is accepted where its seat is opened', () => {
  it('signing in at one firm never marks an invited seat at another firm as signed in', async () => {
    await recordSignInLedger({ email: DANA.primaryEmail, door: 'PASSWORD' })
    expect(written().map((r: any) => r.action)).toEqual(['LOGIN_SUCCEEDED'])
    // The sign-in does not even look for the seats she holds.
    expect(db.context.findMany).not.toHaveBeenCalled()
  })

  it('opening an invited seat marks that seat, once', async () => {
    expect(await markSeatOpened(invitedSeat, DANA, at)).toBe(true)
    expect(await markSeatOpened(invitedSeat, DANA, at)).toBe(false)
    const rows = written()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ action: 'INVITE_ACCEPTED', actorPersonId: 'p-dana', actorCompanyId: 'co-b', subjectId: 'p-dana' })
    expect(rows[0].reason).toContain('opened the seat Northwind Staffing invited them to (seat seat-b)')
  })

  it('two requests that open the seat at the same moment take a lock on the seat before they write', async () => {
    await markSeatOpened(invitedSeat, DANA, at)
    const lock = String((db.$executeRaw.mock.calls[0] as any[])[0].join('?'))
    expect(lock).toContain('pg_advisory_xact_lock')
    expect((db.$executeRaw.mock.calls[0] as any[])[1]).toBe('invite-accepted:seat-b')
  })

  it('a seat already used, a seat no invitation made, and a worker’s own seat are passed over with no read', async () => {
    expect(opensAnInvitation({ ...invitedSeat, lastUsedAt: new Date() })).toBe(false)
    expect(opensAnInvitation({ ...invitedSeat, invitedAt: null })).toBe(false)
    expect(opensAnInvitation({ ...invitedSeat, companyId: null })).toBe(false)
    expect(opensAnInvitation(invitedSeat)).toBe(true)
    expect(await markSeatOpened({ ...invitedSeat, lastUsedAt: new Date() }, DANA, at)).toBe(false)
    expect(db.accessLog.findFirst).not.toHaveBeenCalled()
  })

  it('a row that cannot be written never refuses the request', async () => {
    db.accessLog.findFirst.mockRejectedValueOnce(new Error('the database is away'))
    await expect(markSeatOpened(invitedSeat, DANA, at)).resolves.toBe(false)
  })

  it('the caller check marks the seat only after the firm’s sign-in policy let the session use it', () => {
    const src = read('src/lib/api-context.ts')
    const mark = src.indexOf('await markSeatOpened(context, person')
    expect(mark).toBeGreaterThan(0)
    expect(mark).toBeGreaterThan(src.indexOf("code: 'DIRECTORY_ONLY'"))
    expect(mark).toBeGreaterThan(src.indexOf("code: 'LINKEDIN_NOT_FOR_COMPANIES'"))
    // Read off the seat before its use date is written.
    expect(mark).toBeLessThan(src.indexOf('data: { lastUsedAt: new Date() }'))
  })
})

describe('the seat a session opens where she chose none', () => {
  const used = { id: 'seat-a', companyId: 'co-a', invitedAt: null, lastUsedAt: new Date('2026-11-01T09:00:00Z') }
  const fresh = { id: 'seat-b', companyId: 'co-b', invitedAt: new Date('2026-11-15T09:00:00Z'), lastUsedAt: null }

  it('with no seat chosen, the seat she already uses opens before a newer invitation she has not opened', () => {
    expect(defaultSeatOf([fresh, used], new Set())).toBe(used)
  })

  it('an invitation at a firm whose own log holds a row of hers counts as a seat she uses', () => {
    expect(defaultSeatOf([fresh, used], new Set(['seat-b']))).toBe(fresh)
  })

  it('where every seat she may use is an invitation she has not opened, the newest opens, because she has nowhere else to be', () => {
    const older = { ...fresh, id: 'seat-c', companyId: 'co-c' }
    expect(defaultSeatOf([fresh, older], new Set())).toBe(fresh)
    expect(defaultSeatOf([], new Set())).toBeNull()
  })

  it('the caller check opens the default seat by this rule, and a seat chosen in the account menu still wins', () => {
    const src = read('src/lib/api-context.ts')
    expect(src).toContain('defaultSeatOf(open, usedHere)')
    expect(src).toContain('(chosen ? await pick({ id: chosen }) : null) ?? await pickDefault()')
  })
})
