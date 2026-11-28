import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, resetDatabase } from './harness'
import { getCallerContext } from '@/lib/api-context'
import { readCompanySeats, peopleOf, countSeats } from '@/lib/company-seats'
import { GET as accessRegister } from '@/app/api/access/route'
import { ADMIN_PERMISSIONS } from '@/lib/company-defaults'
import { formatDay } from '@/lib/format-date'

/**
 * A seat's end date ends it, through the one caller check every route
 * asks (fix list layer 4, 2026-11-15). Users & permissions writes
 * Context.expiresAt with "This ends on <date> unless renewed", and a seat
 * past it still signed in and acted. Dates here are counted from the
 * moment the file runs, never pinned.
 */

const DAY = 86_400_000
const from = (n: number) => new Date(Date.now() + n * DAY)

const OWNER = 'owner@northwind-staffing.example'
const ADMIN = 'admin@northwind-staffing.example'
const GONE = 'recruiter.gone@northwind-staffing.example'
const SOON = 'recruiter.soon@northwind-staffing.example'
const TWO = 'two.seats@northwind-staffing.example'
const LONE = 'lone.admin@harborline-tech.example'

const ids: Record<string, string> = {}

async function person(email: string, name: string) {
  const p = await prisma.person.create({ data: { primaryEmail: email, name }, select: { id: true } })
  // Signed in before, as a working seat has.
  await prisma.credential.create({ data: { personId: p.id, provider: 'GOOGLE', providerId: email, email, lastUsedAt: from(-30) } })
  return p.id
}

async function seat(personId: string, companyId: string, roleId: string, expiresAt: Date | null, key: string) {
  const c = await prisma.context.create({
    data: { personId, companyId, roleId, type: 'EMPLOYEE', expiresAt, grantReason: 'Seated for the end-date walk', grantedAt: from(-60) },
    select: { id: true },
  })
  ids[key] = c.id
}

describe('a seat past its end date is ended at the caller check, and nobody is locked out by a date', () => {
  beforeAll(async () => {
    await resetDatabase()
    const nw = await prisma.company.create({ data: { name: 'Northwind Staffing', slug: 'northwind-end-date', kind: 'VENDOR', currency: 'USD' }, select: { id: true } })
    const hl = await prisma.company.create({ data: { name: 'Harborline Tech', slug: 'harborline-end-date', kind: 'VENDOR', currency: 'USD' }, select: { id: true } })
    ids.northwind = nw.id
    const role = async (companyId: string, name: string, permissions: string[]) =>
      (await prisma.role.create({ data: { companyId, name, permissions }, select: { id: true } })).id
    const nwOwner = await role(nw.id, 'Owner', ['*'])
    const nwAdmin = await role(nw.id, 'Admin', [...ADMIN_PERMISSIONS])
    const nwRecruiter = await role(nw.id, 'Recruiter', ['submissions.write', 'requirements.read', 'governance.read'])
    const hlAdmin = await role(hl.id, 'Admin', [...ADMIN_PERMISSIONS])
    const hlRecruiter = await role(hl.id, 'Recruiter', ['submissions.write', 'requirements.read'])

    // Northwind: an Owner whose date passed, an Admin in date, a recruiter
    // whose date passed, one whose date is tomorrow, and a person with an
    // in-date seat and a newer ended one.
    await seat(await person(OWNER, 'Dana Reyes'), nw.id, nwOwner, from(-10), 'owner')
    await seat(await person(ADMIN, 'Sam Okafor'), nw.id, nwAdmin, from(120), 'admin')
    await seat(await person(GONE, 'Lee Park'), nw.id, nwRecruiter, from(-3), 'gone')
    await seat(await person(SOON, 'Ana Ruiz'), nw.id, nwRecruiter, from(1), 'soon')
    const two = await person(TWO, 'Mira Chen')
    await seat(two, hl.id, hlRecruiter, from(30), 'twoInDate')
    await seat(two, nw.id, nwRecruiter, from(-1), 'twoEnded')
    await prisma.context.update({ where: { id: ids.twoEnded }, data: { grantedAt: from(-1) } })

    // Harborline: one Admin, the only seat that may manage access, past its date.
    await seat(await person(LONE, 'Kit Moreau'), hl.id, hlAdmin, from(-2), 'lone')
  })

  it('a seat past its end date cannot act, and is told in one sentence that its access ended and who renews it', async () => {
    as(GONE)
    const r = await json(await accessRegister(req('GET', '/api/access')))
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('ACCESS_EXPIRED')
    const gone = await prisma.context.findUniqueOrThrow({ where: { id: ids.gone }, select: { expiresAt: true } })
    expect(r.body.error.message).toBe(`Your access at Northwind Staffing ended on ${formatDay(gone.expiresAt!)}. An Owner or Admin there can renew it.`)
    // Read, not stored again: the row is as it was.
    const after = await prisma.context.findUniqueOrThrow({ where: { id: ids.gone }, select: { revokedAt: true, suspendedAt: true } })
    expect(after).toEqual({ revokedAt: null, suspendedAt: null })
  })

  it('a seat past its end date named by the header is refused, even where the person holds another seat', async () => {
    as(TWO)
    const r = await getCallerContext(req('GET', '/api/me', undefined, { 'x-context-id': ids.twoEnded }))
    expect(r.caller).toBeNull()
    expect((await json(r.error!)).body.error.code).toBe('ACCESS_EXPIRED')
  })

  it('with no seat named, a person whose newest seat ended works from the seat still in date', async () => {
    as(TWO)
    const { caller } = await getCallerContext(req('GET', '/api/me'))
    expect(caller!.context.id).toBe(ids.twoInDate)
  })

  it('a seat whose end date is tomorrow still works', async () => {
    as(SOON)
    const { caller, error } = await getCallerContext(req('GET', '/api/me'))
    expect(error).toBeNull()
    expect(caller!.context.id).toBe(ids.soon)
  })

  it('an Owner’s seat is never ended by its date', async () => {
    as(OWNER)
    const r = await json(await accessRegister(req('GET', '/api/access')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
  })

  it('the last seat that may manage access is never ended by its date', async () => {
    as(LONE)
    const { caller, error } = await getCallerContext(req('GET', '/api/me'))
    expect(error).toBeNull()
    expect(caller!.context.id).toBe(ids.lone)
  })

  it('a seat past its end date is not counted as live and is never named as somebody to ask', async () => {
    const seats = await readCompanySeats(ids.northwind)
    const listed = seats.map((s) => s.contextId)
    expect(listed).not.toContain(ids.gone)
    expect(listed).not.toContain(ids.twoEnded)
    expect(listed).toEqual(expect.arrayContaining([ids.owner, ids.admin, ids.soon]))
    expect(countSeats(peopleOf(seats)).withAccess).toBe(3)
    expect(seats.find((s) => s.contextId === ids.owner)!.keptPastEndDate).toBe('OWNER')
  })
})
