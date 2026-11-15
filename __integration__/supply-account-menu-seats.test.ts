import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, resetDatabase } from './harness'
import { GET as me } from '@/app/api/me/route'
import { getCallerContext } from '@/lib/api-context'
import { ADMIN_PERMISSIONS } from '@/lib/company-defaults'

/**
 * The account menu, read from /api/me, offers only the seats the one
 * caller check would let act now (2026-11-15). A seat past its end date,
 * or a paused one, was still offered, and choosing it silently landed on
 * another firm's menu. Dates here are counted from the moment the file
 * runs, never pinned.
 */

const DAY = 86_400_000
const from = (n: number) => new Date(Date.now() + n * DAY)

const OWNER = 'owner.menu@northwind-staffing.example'
const TWO = 'two.hats.menu@northwind-staffing.example'
const ENDED = 'ended.only.menu@northwind-staffing.example'
const ENDED_NO_WORK = 'ended.nowork.menu@northwind-staffing.example'

const ids: Record<string, string> = {}

async function person(email: string, name: string) {
  const p = await prisma.person.create({ data: { primaryEmail: email, name }, select: { id: true } })
  await prisma.credential.create({ data: { personId: p.id, provider: 'GOOGLE', providerId: email, email, lastUsedAt: from(-30) } })
  return p.id
}

async function seat(personId: string, companyId: string, roleId: string, key: string, over: { expiresAt?: Date | null; suspendedAt?: Date | null; grantedAt?: Date } = {}) {
  const c = await prisma.context.create({
    data: {
      personId, companyId, roleId, type: 'EMPLOYEE', grantReason: 'Seated for the account menu walk',
      expiresAt: over.expiresAt ?? null, suspendedAt: over.suspendedAt ?? null, grantedAt: over.grantedAt ?? from(-60),
    },
    select: { id: true },
  })
  ids[key] = c.id
}

const offeredIds = (body: any) => body.data.contexts.map((c: any) => c.id).sort()

describe('the account menu offers only seats that work now', () => {
  beforeAll(async () => {
    await resetDatabase()
    const nw = await prisma.company.create({ data: { name: 'Northwind Staffing', slug: 'northwind-menu', kind: 'VENDOR', currency: 'USD' }, select: { id: true } })
    const hl = await prisma.company.create({ data: { name: 'Harborline Tech', slug: 'harborline-menu', kind: 'VENDOR', currency: 'USD' }, select: { id: true } })
    const sv = await prisma.company.create({ data: { name: 'Silverpine Health', slug: 'silverpine-menu', kind: 'VENDOR', currency: 'USD' }, select: { id: true } })
    const role = async (companyId: string, name: string, permissions: string[]) =>
      (await prisma.role.create({ data: { companyId, name, permissions }, select: { id: true } })).id
    const nwOwner = await role(nw.id, 'Owner', ['*'])
    const nwAdmin = await role(nw.id, 'Admin', [...ADMIN_PERMISSIONS])
    const nwRecruiter = await role(nw.id, 'Recruiter', ['submissions.write', 'requirements.read'])
    const hlRecruiter = await role(hl.id, 'Recruiter', ['submissions.write', 'requirements.read'])
    const svRecruiter = await role(sv.id, 'Recruiter', ['submissions.write', 'requirements.read'])

    // Somebody else at Northwind manages access, so a date ends a recruiter there.
    await seat(await person('admin.menu@northwind-staffing.example', 'Sam Okafor'), nw.id, nwAdmin, 'admin')

    // An Owner whose date passed: kept open, and offered.
    await seat(await person(OWNER, 'Dana Reyes'), nw.id, nwOwner, 'owner', { expiresAt: from(-10) })

    // Three hats: in date at Harborline, the newest ended at Northwind, one paused at Silverpine.
    const two = await person(TWO, 'Mira Chen')
    await seat(two, hl.id, hlRecruiter, 'inDate', { expiresAt: from(30), grantedAt: from(-20) })
    await seat(two, nw.id, nwRecruiter, 'ended', { expiresAt: from(-1), grantedAt: from(-1) })
    await seat(two, sv.id, svRecruiter, 'paused', { suspendedAt: from(-2), grantedAt: from(-5) })

    // Her only firm seat has ended, and she is on a bench: her own pages are what works.
    const only = await person(ENDED, 'Lee Park')
    await seat(only, nw.id, nwRecruiter, 'onlyEnded', { expiresAt: from(-3) })
    const profile = await prisma.consultantProfile.create({ data: { personId: only, skills: ['Validation'] }, select: { id: true } })
    await prisma.benchListing.create({ data: { consultantId: profile.id, companyId: hl.id, tier: 'MARKETING' } })

    // Her only firm seat has ended and she is on no work: nothing works.
    await seat(await person(ENDED_NO_WORK, 'Ana Ruiz'), nw.id, nwRecruiter, 'noWorkEnded', { expiresAt: from(-3) })
  })

  it('the account menu never offers a seat whose access has ended or is paused', async () => {
    as(TWO)
    const r = await json(await me(req('GET', '/api/me')))
    expect(r.status).toBe(200)
    expect(offeredIds(r.body)).toEqual([ids.inDate])
    expect(r.body.data.activeContext.id).toBe(ids.inDate)
  })

  it('a seat that has ended, named by the menu’s choice, is not the one in use: the seat every route uses is', async () => {
    as(TWO)
    const r = await json(await me(req('GET', '/api/me', undefined, { 'x-context-id': ids.ended })))
    expect(r.body.data.activeContext.id).toBe(ids.inDate)
    const { caller } = await getCallerContext(req('GET', '/api/me'))
    expect(caller!.context.id).toBe(r.body.data.activeContext.id)
  })

  it('an Owner kept open past the end date is still offered', async () => {
    as(OWNER)
    const r = await json(await me(req('GET', '/api/me')))
    expect(offeredIds(r.body)).toEqual([ids.owner])
    expect(r.body.data.activeContext.id).toBe(ids.owner)
  })

  it('a person whose only firm seat has ended is offered her own pages where she has work, the seat the caller check gives her', async () => {
    as(ENDED)
    const r = await json(await me(req('GET', '/api/me')))
    expect(r.status).toBe(200)
    expect(r.body.data.contexts).toHaveLength(1)
    const own = r.body.data.contexts[0]
    expect(own.id).not.toBe(ids.onlyEnded)
    expect(own.company).toBeNull()
    expect(own.type).toBe('CONSULTANT')
    const { caller } = await getCallerContext(req('GET', '/api/me'))
    expect(caller!.context.id).toBe(own.id)
    // Asking again opens no second seat.
    const again = await json(await me(req('GET', '/api/me')))
    expect(offeredIds(again.body)).toEqual([own.id])
  })

  it('a person whose only firm seat has ended and who is on no work is offered no seat at all', async () => {
    as(ENDED_NO_WORK)
    const r = await json(await me(req('GET', '/api/me')))
    expect(r.status).toBe(200)
    expect(r.body.data.contexts).toEqual([])
    expect(r.body.data.activeContext).toBeNull()
  })
})
