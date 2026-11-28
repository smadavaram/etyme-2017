import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

/**
 * A person reads as the person, on every screen that names them (fix list,
 * 2026-11-15, findability and access). Walked through the real routes: a
 * firm's first person is never named after the firm at sign-up; Settings →
 * Owners prints the address beside each name; a grant to somebody invited
 * says it starts when they sign in; and Settings → Sign-in says which
 * default applies where nobody has chosen.
 */

const { POST: enter } = await import('@/app/api/onboarding/route')
const owners = await import('@/app/api/settings/owners/route')
const grants = await import('@/app/api/settings/grants/route')
const signIn = await import('@/app/api/settings/sign-in/overview/route')
const { modeSays } = await import('@/lib/identity/policy')

const FOUNDER = 'dana.whitlock@northwind-staffing.example'
const BRIGHTMOOR_OWNER = 'world-brightmoor@demo.etyme.local'
let northwind = ''

beforeAll(async () => {
  await freshWorld()
  as(FOUNDER)
  const r = await json(await enter(req('POST', '/api/onboarding', { type: 'prime', name: 'Northwind Staffing' })))
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  northwind = r.body.data.companyId
}, 600_000)

describe('the name a firm’s first person is given at sign-up', () => {
  it('a person who signs a company up is never named after the company: the first part of the address stands in', async () => {
    const p = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: FOUNDER }, select: { name: true } })
    expect(p.name).not.toBe('Northwind Staffing')
    expect(p.name).toBe('dana.whitlock')
  })

  it('a person already on Etyme keeps the name they have when they sign another company up', async () => {
    const email = 'lee.okafor@harborline-tech.example'
    await prisma.person.create({ data: { primaryEmail: email, name: 'Lee Okafor' } })
    as(email)
    const r = await json(await enter(req('POST', '/api/onboarding', { type: 'client', name: 'Harborline Tech' })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect((await prisma.person.findUniqueOrThrow({ where: { primaryEmail: email }, select: { name: true } })).name).toBe('Lee Okafor')
  })
})

describe('Settings, Owners', () => {
  it('every Owner and every person who could take over is listed with the address they sign in with', async () => {
    as(BRIGHTMOOR_OWNER)
    const r = await json(await owners.GET(req('GET', '/api/settings/owners')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.owners.length).toBeGreaterThan(0)
    expect(r.body.data.owners.find((o: any) => o.you)?.email).toBe(BRIGHTMOOR_OWNER)
    for (const o of [...r.body.data.owners, ...r.body.data.others]) expect(o.email, o.name).toEqual(expect.stringContaining('@'))
  })

  it('somebody invited who has not signed in here is never offered to take ownership, and asking for them is refused in a sentence and logged', async () => {
    as(BRIGHTMOOR_OWNER)
    const firm = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
    const role = await prisma.role.findFirstOrThrow({ where: { companyId: firm.id, name: 'Recruiter' }, select: { id: true } })
    const person = await prisma.person.create({ data: { primaryEmail: 'dana.reyes@brightmoor-walk.example', name: 'Dana Reyes' } })
    const seat = await prisma.context.create({ data: { personId: person.id, companyId: firm.id, type: 'EMPLOYEE', roleId: role.id, invitedAt: new Date() } })

    const r = await json(await owners.GET(req('GET', '/api/settings/owners')))
    expect(r.body.data.others.map((o: any) => o.contextId)).not.toContain(seat.id)
    expect(r.body.data.invitedNotSignedIn).toEqual([{ contextId: seat.id, name: 'Dana Reyes', email: 'dana.reyes@brightmoor-walk.example' }])

    const ask = await json(await owners.POST(req('POST', '/api/settings/owners', { action: 'pass', contextId: seat.id, after: 'OWNER', reason: 'A second Owner for cover' })))
    expect(ask.status).not.toBe(201)
    expect(await prisma.ownershipRequest.count({ where: { subjectContextId: seat.id } })).toBe(0)
    expect(ask.body.error.message).toBe('Dana Reyes is invited and has not signed in here yet. Ownership can be passed once they sign in.')
    expect(await prisma.accessLog.count({ where: { subjectId: person.id, actorCompanyId: firm.id, action: 'DESK_CHANGE', allowed: false } })).toBe(1)
  })
})

describe('giving access to somebody invited', () => {
  it('a grant to a person invited and never signed in says it starts once they sign in, with their address', async () => {
    as(BRIGHTMOOR_OWNER)
    const firm = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
    const role = await prisma.role.findFirstOrThrow({ where: { companyId: firm.id, name: 'Recruiter' }, select: { id: true } })
    const email = 'pat.kim@brightmoor-walk.example'
    const person = await prisma.person.create({ data: { primaryEmail: email, name: 'Pat Kim' } })
    const seat = await prisma.context.create({ data: { personId: person.id, companyId: firm.id, type: 'EMPLOYEE', roleId: role.id, invitedAt: new Date() } })

    const list = await json(await grants.GET(req('GET', '/api/settings/grants')))
    expect(list.body.data.people.find((p: any) => p.contextId === seat.id)?.state).toBe('INVITED')

    const r = await json(await grants.POST(req('POST', '/api/settings/grants', { permission: 'margin.read', contextId: seat.id, scope: 'COMPANY', reason: 'Covers for a recruiter from Monday' })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.says).toMatch(/^Saved\. Pat Kim may .+ once they sign in with pat\.kim@brightmoor-walk\.example\. Revoke takes it back in one press\.$/)
    expect(r.body.data.says).not.toContain('may now')
    const log = await prisma.automationLog.findFirstOrThrow({ where: { companyId: firm.id, action: 'PERMISSION_GRANTED', summary: { contains: 'Pat Kim' } }, orderBy: { at: 'desc' }, select: { summary: true } })
    expect(log.summary).toContain('once they sign in with pat.kim@brightmoor-walk.example')
  })

  it('a grant to a person who has signed in still says they may now do it', async () => {
    as(BRIGHTMOOR_OWNER)
    const firm = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
    const role = await prisma.role.findFirstOrThrow({ where: { companyId: firm.id, name: 'Recruiter' }, select: { id: true } })
    const person = await prisma.person.create({ data: { primaryEmail: 'sam.ortiz@brightmoor-walk.example', name: 'Sam Ortiz' } })
    const seat = await prisma.context.create({ data: { personId: person.id, companyId: firm.id, type: 'EMPLOYEE', roleId: role.id } })
    const r = await json(await grants.POST(req('POST', '/api/settings/grants', { permission: 'margin.read', contextId: seat.id, scope: 'COMPANY', reason: 'Runs the numbers' })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.says).toMatch(/^Saved\. Sam Ortiz may now .+\. Revoke takes it back in one press\.$/)
  })
})

describe('Settings, Sign-in, where nobody has chosen how people sign in', () => {
  it('a firm with a verified domain reads the default sentence for its domain under How your people sign in', async () => {
    as(FOUNDER)
    const r = await json(await signIn.GET(req('GET', '/api/settings/sign-in/overview')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.setAt).toBeNull()
    expect(r.body.data.unsetSays).toBe(modeSays('OPEN', 'Northwind Staffing'))
  })

  it('a firm with no verified domain reads that the default applies, invitation only, and why, agreeing with the line under the heading', async () => {
    await prisma.companyDomain.deleteMany({ where: { companyId: northwind } })
    await prisma.company.update({ where: { id: northwind }, data: { domainVerified: false } })
    as(FOUNDER)
    const r = await json(await signIn.GET(req('GET', '/api/settings/sign-in/overview')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.joins).toMatch(/^People join Northwind Staffing by invitation only\./)
    expect(r.body.data.unsetSays).toBe('No choice made yet, so the default applies: invitation only, because no domain is verified.')
  })
})
