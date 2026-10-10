import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'

import { POST as raiseRequirement } from '@/app/api/requirements/route'
import { POST as raiseRequisition } from '@/app/api/requisitions/route'

/**
 * A program office acts in the seat a client grants, under the client's
 * rules (CLAUDE.md, 2026-09-14). Its writes are judged by that seat's
 * role, never by its own firm's — the read routes already did this and
 * the write routes did not (architect, 2026-10-05).
 *
 *   Talvern Medical   the client.
 *   Kestrel MSP       the program office. Its own role is the owner's ('*');
 *                     the seat Talvern granted it is the compliance desk,
 *                     which reads job requests and does not write them.
 */

const OFFICE = 'office@kestrel.test'
const co = { client: '', office: '' }
const who = { client: '', office: '' }

beforeAll(async () => {
  await resetDatabase()
  const client = await prisma.company.create({ data: { name: 'Talvern Medical', slug: 'talvern', kind: 'CLIENT', currency: 'USD' } })
  const office = await prisma.company.create({ data: { name: 'Kestrel MSP', slug: 'kestrel', kind: 'MSP', currency: 'USD' } })
  co.client = client.id
  co.office = office.id
  const owner = await prisma.role.create({ data: { companyId: office.id, name: 'Owner', permissions: ['*'], isDefault: true } })
  const clientOwner = await prisma.role.create({ data: { companyId: client.id, name: 'Owner', permissions: ['*'], isDefault: true } })
  const p = await prisma.person.create({ data: { name: 'Kestrel Office', primaryEmail: OFFICE } })
  const c = await prisma.person.create({ data: { name: 'Talvern Program', primaryEmail: 'program@talvern.test' } })
  who.office = p.id
  who.client = c.id
  await prisma.context.create({ data: { personId: p.id, companyId: office.id, roleId: owner.id, type: 'EMPLOYEE', grantReason: 'seat write walk' } })
  await prisma.context.create({ data: { personId: c.id, companyId: client.id, roleId: clientOwner.id, type: 'EMPLOYEE', grantReason: 'seat write walk' } })
}, 240_000)

const body = { title: 'ICU travel nurse — night shift', skills: ['ICU', 'BLS'], location: 'Westminster, CO', months: 6 }

describe('a seat is the desk, and the desk decides what may be written', () => {
  it('with no seat, the office raises a job request of its own on its own role', async () => {
    as(OFFICE)
    const r = await json(await raiseRequirement(req('POST', '/api/requirements', body)))
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300)
  })

  it('a program office seated at a client cannot raise a job request its seat does not allow, whatever its own role holds', async () => {
    const compliance = await prisma.role.create({
      data: { companyId: co.client, name: 'Compliance Officer', permissions: ['requirements.read', 'compliance.read'] },
    })
    await prisma.programSeat.create({
      data: { clientCompanyId: co.client, officeCompanyId: co.office, roleId: compliance.id, grantedById: who.client, reason: 'Compliance desk' },
    })
    as(OFFICE)
    const before = await prisma.requirement.count()
    const viaRequirements = await json(await raiseRequirement(req('POST', '/api/requirements', body)))
    expect(viaRequirements.status).toBe(403)
    expect(viaRequirements.body.error.code).toBe('NOT_HIRING')
    const viaRequisitions = await json(await raiseRequisition(req('POST', '/api/requisitions', body)))
    expect(viaRequisitions.status).toBe(403)
    expect(await prisma.requirement.count()).toBe(before)
  })
})
