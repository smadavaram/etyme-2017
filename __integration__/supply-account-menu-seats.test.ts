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

/**
 * Signed in is this firm's own record (2026-11-16), on the menu as on every
 * route. Two firms each hold an Admin past her end date and a second Admin
 * invited. At the first the second Admin signs in elsewhere on Etyme and
 * never here; at the second she has come in here. The menu must offer
 * exactly the seats the caller check lets act.
 */
const MARA = 'mara.menu@cove-lane.example'
const IRIS = 'iris.menu@pier-street.example'

describe('the account menu reads signed in at this firm, as the caller check does', () => {
  const seatOf: Record<string, string> = {}

  beforeAll(async () => {
    async function firm(name: string, slug: string) {
      const c = await prisma.company.create({ data: { name, slug, kind: 'VENDOR', currency: 'USD' }, select: { id: true } })
      const admin = (await prisma.role.create({ data: { companyId: c.id, name: 'Admin', permissions: [...ADMIN_PERMISSIONS] }, select: { id: true } })).id
      return { id: c.id, admin }
    }
    async function pastDateAdmin(f: { id: string; admin: string }, email: string, name: string) {
      const p = await person(email, name)
      const c = await prisma.context.create({
        data: { personId: p, companyId: f.id, roleId: f.admin, type: 'EMPLOYEE', grantReason: 'Seated for the account menu walk', expiresAt: from(-1), grantedAt: from(-60) },
        select: { id: true },
      })
      seatOf[email] = c.id
    }
    // Invited here; her account signs in elsewhere on Etyme (a sign-in method used yesterday).
    async function invitedAdmin(f: { id: string; admin: string }, email: string, name: string, cameInHere: boolean) {
      const p = await person(email, name)
      await prisma.context.create({
        data: { personId: p, companyId: f.id, roleId: f.admin, type: 'EMPLOYEE', grantReason: 'Invited for the account menu walk', invitedAt: from(-5), grantedAt: from(-5) },
      })
      if (cameInHere) {
        await prisma.accessLog.create({ data: { subjectId: p, actorPersonId: p, actorCompanyId: f.id, action: 'INVITE_ACCEPTED' } })
      }
    }
    const cove = await firm('Cove Lane Staffing', 'cove-lane-menu')
    await pastDateAdmin(cove, MARA, 'Mara Quinn')
    await invitedAdmin(cove, 'theo.menu@cove-lane.example', 'Theo Brandt', false)
    const pier = await firm('Pier Street Talent', 'pier-street-menu')
    await pastDateAdmin(pier, IRIS, 'Iris Vale')
    await invitedAdmin(pier, 'omar.menu@pier-street.example', 'Omar Nash', true)
  })

  /** The seats among hers the caller check lets act when each is asked for by name. */
  async function seatsTheCallerCheckLetsAct(email: string): Promise<string[]> {
    as(email)
    const all = await prisma.context.findMany({ where: { person: { primaryEmail: email } }, select: { id: true } })
    const acts: string[] = []
    for (const { id } of all) {
      const { caller } = await getCallerContext(req('GET', '/api/me', undefined, { 'x-context-id': id }))
      if (caller?.context.id === id) acts.push(id)
    }
    return acts.sort()
  }

  it('the account menu offers exactly the seats the caller check lets act, reading signed in at this firm, never a sign-in elsewhere', async () => {
    for (const email of [MARA, IRIS]) {
      as(email)
      const r = await json(await me(req('GET', '/api/me')))
      expect(r.status).toBe(200)
      expect(offeredIds(r.body)).toEqual(await seatsTheCallerCheckLetsAct(email))
    }
  })

  it('a manager who signed in elsewhere on Etyme and never here does not end another manager’s seat on the menu', async () => {
    as(MARA)
    const r = await json(await me(req('GET', '/api/me')))
    expect(offeredIds(r.body)).toEqual([seatOf[MARA]])
    expect(r.body.data.activeContext.id).toBe(seatOf[MARA])
  })

  it('a manager who has come in here does end another manager’s seat past its date on the menu', async () => {
    as(IRIS)
    const r = await json(await me(req('GET', '/api/me')))
    expect(offeredIds(r.body)).not.toContain(seatOf[IRIS])
  })
})

