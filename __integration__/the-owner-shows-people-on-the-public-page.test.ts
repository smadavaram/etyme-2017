import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

/**
 * The Owner's answer 3 (docs/decisions/92, 2026-11-17): the public page
 * prints the firm, never a person, unless the Owner opts in. Through the
 * settings route as the Owner and as an Admin on the seeded world.
 */

const settings = await import('@/app/api/settings/route')

let companyId = ''
let ownerEmail = ''
let adminEmail = ''
let adminCtx = ''

const read = async () => (await json(await settings.GET(req('GET', '/api/settings')))).body.data.company
const set = async (value: unknown, headers: Record<string, string> = {}) =>
  json(await settings.PATCH(req('PATCH', '/api/settings', { showPeopleOnPage: value }, headers)))

beforeAll(async () => {
  await freshWorld()
  const owner = await prisma.context.findFirstOrThrow({
    where: { type: 'EMPLOYEE', revokedAt: null, role: { name: 'Owner' }, company: { slug: 'world-brightmoor' } },
    include: { person: true },
  })
  companyId = owner.companyId!
  ownerEmail = owner.person.primaryEmail
  const adminRole = await prisma.role.findFirst({ where: { companyId, name: 'Admin' } })
  if (!adminRole) throw new Error('the seeded firm has no Admin role')
  const admin = await prisma.context.findFirst({ where: { companyId, type: 'EMPLOYEE', revokedAt: null, roleId: adminRole.id }, include: { person: true } })
  if (!admin) throw new Error('the seeded firm has no Admin seat')
  adminEmail = admin.person.primaryEmail
  adminCtx = admin.id
}, 600_000)

describe('showing people by name on the public company page', () => {
  it('a seeded company\'s public page shows the firm and no person until its Owner says so', async () => {
    as(ownerEmail)
    expect((await read()).showPeopleOnPage).toBe(false)
  })

  it('an Admin cannot show people\'s names on the company page, and the refusal is logged before it is sent', async () => {
    as(adminEmail)
    const before = await prisma.accessLog.count({ where: { subjectCompanyId: companyId, allowed: false } })
    const r = await set(true, { 'x-context-id': adminCtx })
    expect(r.status, JSON.stringify(r.body)).toBe(403)
    expect(r.body.error.message).toBe('Showing people by name on the public page is the Owner’s to decide. Ask your Owner to turn it on.')
    expect((await prisma.company.findUniqueOrThrow({ where: { id: companyId } })).showPeopleOnPage).toBe(false)
    expect(await prisma.accessLog.count({ where: { subjectCompanyId: companyId, allowed: false } })).toBe(before + 1)
  })

  it('the box is drawn for the Owner and for nobody else', async () => {
    as(adminEmail)
    expect((await read()).mayChangeShowPeople).toBe(false)
    as(ownerEmail)
    expect((await read()).mayChangeShowPeople).toBe(true)
  })

  it('the Owner can show people by name, one boolean changes, and the change is logged', async () => {
    as(ownerEmail)
    const r = await set(true)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const row = await prisma.company.findUniqueOrThrow({ where: { id: companyId } })
    expect(row.showPeopleOnPage).toBe(true)
    const log = await prisma.automationLog.findFirstOrThrow({ where: { companyId, action: 'PUBLIC_PAGE_PEOPLE_CHANGED' } })
    expect(log.summary).toContain('turned on showing people by name on the public page')
  })

  it('the Owner\'s choice is kept on reload', async () => {
    as(ownerEmail)
    expect((await read()).showPeopleOnPage).toBe(true)
    expect((await set(false)).status).toBe(200)
    expect((await read()).showPeopleOnPage).toBe(false)
  })

  it('an answer that is not yes or no is refused in a sentence', async () => {
    as(ownerEmail)
    const r = await set('maybe')
    expect(r.status).toBe(422)
  })
})
