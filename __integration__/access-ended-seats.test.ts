import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, resetDatabase } from './harness'
import { GET as accessRegister, POST as giveRole } from '@/app/api/access/route'
import { POST as actOnSeat } from '@/app/api/access/[contextId]/route'
import { ADMIN_PERMISSIONS } from '@/lib/company-defaults'
import { formatDay } from '@/lib/format-date'

/**
 * Users & permissions reads a seat's end date (fix list layer 4,
 * 2026-11-15). A seat past its date stopped working at the caller check
 * (ff4980501) and still sat under "with access" on this page while the
 * figure no longer counted it, read lowercase "ended", and offered no way
 * to renew. Dates are counted from the moment the file runs, never pinned.
 */

const DAY = 86_400_000
const from = (n: number) => new Date(Date.now() + n * DAY)

const OWNER = 'owner@northwind-staffing.example'
const ADMIN = 'admin@northwind-staffing.example'
const GONE = 'recruiter.gone@northwind-staffing.example'
const SOON = 'recruiter.soon@northwind-staffing.example'
const OFFICE = 'office.manager@northwind-staffing.example'
const HR = 'hr@northwind-staffing.example'
const KIT = 'kit@harborline-tech.example'
const OLD = 'old.admin@harborline-tech.example'

const ids: Record<string, string> = {}

async function person(email: string, name: string) {
  const p = await prisma.person.create({ data: { primaryEmail: email, name }, select: { id: true } })
  // Signed in before, as a working seat has.
  await prisma.credential.create({ data: { personId: p.id, provider: 'GOOGLE', providerId: email, email, lastUsedAt: from(-30) } })
  return p.id
}

async function seat(email: string, name: string, companyId: string, roleId: string, expiresAt: Date | null, key: string) {
  const c = await prisma.context.create({
    data: { personId: await person(email, name), companyId, roleId, type: 'EMPLOYEE', expiresAt, grantReason: 'Seated for the end-date walk', grantedAt: from(-60) },
    select: { id: true },
  })
  ids[key] = c.id
}

const register = async (email: string) => {
  as(email)
  const r = await json(await accessRegister(req('GET', '/api/access')))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data
}

describe('Users & permissions reads each seat’s end date', () => {
  beforeAll(async () => {
    await resetDatabase()
    const nw = await prisma.company.create({ data: { name: 'Northwind Staffing', slug: 'northwind-ended-seats', kind: 'VENDOR', currency: 'USD' }, select: { id: true } })
    const hl = await prisma.company.create({ data: { name: 'Harborline Tech', slug: 'harborline-ended-seats', kind: 'VENDOR', currency: 'USD' }, select: { id: true } })
    const role = async (companyId: string, name: string, permissions: string[]) =>
      (await prisma.role.create({ data: { companyId, name, permissions }, select: { id: true } })).id
    ids.nwRecruiter = await role(nw.id, 'Recruiter', ['submissions.write', 'requirements.read'])
    const nwOwner = await role(nw.id, 'Owner', ['*'])
    const nwAdmin = await role(nw.id, 'Admin', [...ADMIN_PERMISSIONS])
    const nwOffice = await role(nw.id, 'Office Manager', ['team.manage', 'settings.manage', 'governance.read'])
    const nwHr = await role(nw.id, 'HR', ['governance.read'])
    const hlAdmin = await role(hl.id, 'Admin', [...ADMIN_PERMISSIONS])
    ids.hlRecruiter = await role(hl.id, 'Recruiter', ['submissions.write'])

    // Northwind: an Owner whose date passed, an Admin in date, a recruiter
    // whose date passed and one whose date is tomorrow, an office manager
    // who could manage access and whose date passed, and HR, who reads the
    // register and may not change it.
    await seat(OWNER, 'Dana Reyes', nw.id, nwOwner, from(-10), 'owner')
    await seat(ADMIN, 'Sam Okafor', nw.id, nwAdmin, from(120), 'admin')
    await seat(GONE, 'Lee Park', nw.id, ids.nwRecruiter, from(-3), 'gone')
    await seat(SOON, 'Ana Ruiz', nw.id, ids.nwRecruiter, from(1), 'soon')
    await seat(OFFICE, 'Ines Duarte', nw.id, nwOffice, from(-5), 'office')
    await seat(HR, 'Kofi Mensah', nw.id, nwHr, from(90), 'hr')

    // Harborline: one Admin in date, and a second whose date passed.
    await seat(KIT, 'Kit Moreau', hl.id, hlAdmin, from(60), 'kit')
    await seat(OLD, 'Ola Berg', hl.id, hlAdmin, from(-5), 'old')
  })

  it('a seat past its end date is listed under access ended with the date, never under with access, and the figures agree', async () => {
    const d = await register(ADMIN)
    const endedIds = d.ended.map((e: { contextId: string }) => e.contextId).sort()
    expect(endedIds).toEqual([ids.gone, ids.office].sort())
    const gone = await prisma.context.findUniqueOrThrow({ where: { id: ids.gone }, select: { expiresAt: true } })
    expect(d.ended.find((e: { contextId: string }) => e.contextId === ids.gone).dateLine).toBe(`Ended on ${formatDay(gone.expiresAt!)}`)
    const listed = [...d.people, ...d.waitingForAccess].map((r: { contextId: string }) => r.contextId)
    expect(listed).not.toContain(ids.gone)
    expect(listed).not.toContain(ids.office)
    // The figure and the rows it counts are one set.
    const withAccess = d.summary.figures.find((f: { key: string }) => f.key === 'with-access').value
    expect(withAccess).toBe(d.summary.withAccess)
    expect(d.people.filter((p: { figure: string }) => p.figure === 'with-access')).toHaveLength(withAccess)
    expect(d.summary.peopleSays).toContain('Also listed: 2 people whose access ended, not counted.')
    // A seat whose date is still ahead reads "Ends on <date>".
    const soon = await prisma.context.findUniqueOrThrow({ where: { id: ids.soon }, select: { expiresAt: true } })
    expect(d.people.find((p: { contextId: string }) => p.contextId === ids.soon).dateLine).toBe(`Ends on ${formatDay(soon.expiresAt!)}`)
    // Read, not stored again: the ended row is as it was.
    expect(await prisma.context.findUniqueOrThrow({ where: { id: ids.gone }, select: { revokedAt: true, suspendedAt: true } }))
      .toEqual({ revokedAt: null, suspendedAt: null })
  })

  it('an Owner kept past its date reads why it stays open, never ended', async () => {
    const d = await register(ADMIN)
    const owner = d.people.find((p: { contextId: string }) => p.contextId === ids.owner)
    expect(owner.keptPastEndDate).toBe('OWNER')
    const was = await prisma.context.findUniqueOrThrow({ where: { id: ids.owner }, select: { expiresAt: true } })
    expect(owner.dateLine).toBe(`End date ${formatDay(was.expiresAt!)} has passed. An Owner’s access never ends by date, so it stays open.`)
    expect(owner.dateLine).not.toMatch(/ended/i)
    expect(d.ended.map((e: { contextId: string }) => e.contextId)).not.toContain(ids.owner)
    const finding = d.review.find((r: { contextId: string }) => r.contextId === ids.owner)
    expect(finding.findingWords).toBe('past its end date')
    expect(finding.detail).toBe(owner.dateLine)
  })

  it('who may pause or end never names a seat whose access has ended', async () => {
    const d = await register(HR)
    const why = d.people.find((p: { contextId: string }) => p.contextId === ids.soon).acts.whyNoActs
    expect(why).toBe('Pausing or ending somebody’s access is for the Owner or an Admin here. Ask one of them.')
    expect(why).not.toContain('Office Manager')
  })

  it('a seat that may not change roles reads who may renew an ended seat, from the seats the firm has filled', async () => {
    const d = await register(HR)
    const gone = d.ended.find((e: { contextId: string }) => e.contextId === ids.gone)
    expect(gone.renew).toBe(false)
    expect(gone.whyNoRenew).toBe('Renewing somebody’s access is for the Owner or an Admin here. Ask one of them.')
  })

  it('a seat that may change roles is offered Renew on an ended seat, which opens Change role with the same role', async () => {
    const before = await register(ADMIN)
    const gone = before.ended.find((e: { contextId: string }) => e.contextId === ids.gone)
    expect(gone.renew).toBe(true)
    expect(gone.roleId).toBe(ids.nwRecruiter)
    as(ADMIN)
    const r = await json(await giveRole(req('POST', '/api/access', { contextId: ids.gone, roleId: gone.roleId, days: 30, reason: gone.reason })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const after = await prisma.context.findUniqueOrThrow({ where: { id: ids.gone }, select: { expiresAt: true, roleId: true } })
    expect(after.roleId).toBe(ids.nwRecruiter)
    expect(after.expiresAt!.getTime()).toBeGreaterThan(Date.now())
    expect(r.body.data.message).toBe(`Lee Park’s access as Recruiter is renewed. It ends on ${formatDay(after.expiresAt!)} unless renewed again.`)
    const d = await register(ADMIN)
    expect(d.ended.map((e: { contextId: string }) => e.contextId)).not.toContain(ids.gone)
    expect(d.people.find((p: { contextId: string }) => p.contextId === ids.gone).dateLine).toBe(`Ends on ${formatDay(after.expiresAt!)}`)
  })

  it('a seat in date given the role it already holds is still refused, so Renew is only for a seat whose date has come', async () => {
    as(ADMIN)
    const r = await json(await giveRole(req('POST', '/api/access', { contextId: ids.soon, roleId: ids.nwRecruiter, days: 30, reason: 'Still sources for the delivery team' })))
    expect(r.status).toBe(422)
    expect(r.body.error.message).toBe('Ana Ruiz already works as Recruiter.')
  })

  it('the last seat in date that can give roles is never moved off it on the strength of a seat whose access has ended', async () => {
    as(KIT)
    const r = await json(await giveRole(req('POST', '/api/access', { contextId: ids.kit, roleId: ids.hlRecruiter, days: 30, reason: 'Moving to the recruiting team' })))
    expect(r.status).toBe(422)
    expect(r.body.error.message).toBe('Kit Moreau is the only one here who can give roles. Give that to somebody else first, then change this one.')
  })

  it('the last seat in date that may manage access is never paused on the strength of a seat whose access has ended', async () => {
    as(KIT)
    const r = await json(await actOnSeat(
      req('POST', `/api/access/${ids.kit}`, { action: 'suspend', reason: 'Testing the lockout rule' }),
      { params: Promise.resolve({ contextId: ids.kit }) },
    ))
    expect(r.status).toBe(409)
    expect(r.body.error.message).toContain('They are the only person here who can manage access.')
    expect(await prisma.context.findUniqueOrThrow({ where: { id: ids.kit }, select: { suspendedAt: true } })).toEqual({ suspendedAt: null })
  })
})
