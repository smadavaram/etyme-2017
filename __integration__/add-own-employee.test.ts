import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { POST as addConsultant } from '@/app/api/consultants/route'
import { GET as onboarding } from '@/app/api/onboarding/route'

/**
 * Add consultant, "Our own W-2 employee" (tester's list 2026-11-18, item 2).
 * A firm's own W2 is seated at the firm, never asked onto a bench: the
 * employment is the consent. She is told by the invitation letter, and her
 * first sign-in lands on the record the firm made.
 */

const OWNER = 'owner@own-employee.test'
const CLIENT_OWNER = 'owner@own-employee-client.test'
const MAYA = 'maya.ortiz@own-employee.test'

beforeAll(async () => {
  await resetDatabase()
  const firm = await prisma.company.create({ data: { name: 'Larkspur Data Partners', slug: 'larkspur-data', kind: 'VENDOR', currency: 'USD' } })
  const role = await prisma.role.create({ data: { companyId: firm.id, name: 'Owner', permissions: ['*'], isDefault: true } })
  const owner = await prisma.person.create({ data: { name: 'Dana Larkspur', primaryEmail: OWNER } })
  await prisma.context.create({ data: { personId: owner.id, companyId: firm.id, roleId: role.id, type: 'EMPLOYEE', grantReason: 'test' } })

  const client = await prisma.company.create({ data: { name: 'Corvane Test Foods', slug: 'corvane-test', kind: 'CLIENT', currency: 'USD' } })
  const crole = await prisma.role.create({ data: { companyId: client.id, name: 'Owner', permissions: ['*'], isDefault: true } })
  const cowner = await prisma.person.create({ data: { name: 'Cal Corvane', primaryEmail: CLIENT_OWNER } })
  await prisma.context.create({ data: { personId: cowner.id, companyId: client.id, roleId: crole.id, type: 'EMPLOYEE', grantReason: 'test' } })
}, 180_000)

describe('adding our own W-2 employee', () => {
  it('adding our own W-2 employee seats her at the firm with no bench listing', async () => {
    as(OWNER)
    const r = await json(await addConsultant(req('POST', '/api/consultants', {
      name: 'Maya Ortiz', email: MAYA, skills: ['Data engineering'], ownEmployee: true,
    })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.listing).toBeNull()
    const person = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: MAYA }, include: { contexts: { include: { role: true } }, consultant: { include: { listings: true } } } })
    expect(person.contexts).toHaveLength(1)
    expect(person.contexts[0]).toMatchObject({ type: 'EMPLOYEE', revokedAt: null })
    expect(person.contexts[0].role?.name).toBe('Employee')
    expect(person.contexts[0].role?.permissions).toEqual(['assignments.read', 'timesheets.read'])
    expect(person.consultant?.visibility).toBe('INTERNAL')
    expect(person.consultant?.listings).toHaveLength(0)
  })

  it('where email cannot leave, the screen says so and hands over Copy invitation, never "sent"', async () => {
    const seat = await prisma.context.findFirstOrThrow({ where: { person: { primaryEmail: MAYA } } })
    const mails = await prisma.notification.findMany({ where: { entityId: seat.id, channel: 'EMAIL' } })
    expect(mails).toHaveLength(1)
    as(OWNER)
    const again = await json(await addConsultant(req('POST', '/api/consultants', { name: 'Maya Ortiz', email: MAYA, ownEmployee: true })))
    expect(again.status).toBe(409)
    // The first answer, read back from a fresh add of another person.
    const r = await json(await addConsultant(req('POST', '/api/consultants', { name: 'Raj Patel', email: 'raj.patel@own-employee.test', ownEmployee: true })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    if (r.body.data.mail.state === 'SENT') {
      expect(r.body.data.copyText).toBeNull()
    } else {
      expect(r.body.data.copyText).toContain('Larkspur Data Partners')
      expect(r.body.data.message).toContain('Copy invitation')
      expect(r.body.data.message).not.toMatch(/emailed|has been sent/i)
    }
  })

  it('her first sign-in lands on the record the firm made, never a second one', async () => {
    as(MAYA)
    const r = await json(await onboarding(req('GET', '/api/onboarding')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.action).toBe('ALREADY_IN')
    expect(r.body.data.company.name).toBe('Larkspur Data Partners')
    expect(await prisma.person.count({ where: { primaryEmail: MAYA } })).toBe(1)
    expect(await prisma.context.count({ where: { person: { primaryEmail: MAYA } } })).toBe(1)
  })

  it('somebody who already has an account on Etyme is never made our employee from here', async () => {
    await prisma.person.create({ data: { name: 'Old Hand', primaryEmail: 'old.hand@own-employee.test', passwordHash: 'x' } })
    as(OWNER)
    const r = await json(await addConsultant(req('POST', '/api/consultants', { name: 'Old Hand', email: 'old.hand@own-employee.test', ownEmployee: true })))
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('ALREADY_ON_ETYME')
    expect(await prisma.context.count({ where: { person: { primaryEmail: 'old.hand@own-employee.test' } } })).toBe(0)
  })

  it('a client company is refused the own-employee choice in a sentence, and nobody is added', async () => {
    as(CLIENT_OWNER)
    const r = await json(await addConsultant(req('POST', '/api/consultants', { name: 'Tess Client', email: 'tess@own-employee-client.test', ownEmployee: true })))
    expect(r.status).toBe(422)
    expect(r.body.error).toMatchObject({ code: 'CLIENT_HAS_NO_EMPLOYEES', field: 'ownEmployee' })
    expect(await prisma.person.count({ where: { primaryEmail: 'tess@own-employee-client.test' } })).toBe(0)
  })
})
