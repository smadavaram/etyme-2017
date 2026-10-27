import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { POST as addConsultant } from '@/app/api/consultants/route'
import { GET as bench } from '@/app/api/bench/route'
import { GET as myBenches, PATCH as myBenchesPATCH } from '@/app/api/me/benches/route'

/**
 * The onboarding walk's supply faults (2026-10-27), through the real
 * routes: a firm asks somebody who signed up herself onto its bench; the
 * owner is staff and not payroll; a worker names a client she will not
 * be sent to.
 */

const OWNER = 'owner@walk-bench.test'
const MAYA = 'maya.brooks@walk-gmail.test'
let companyId = ''
let mayaId = ''
let clientId = ''

beforeAll(async () => {
  await resetDatabase()
  process.env.NEXTAUTH_SECRET = 'integration-test-secret'
  process.env.NEXTAUTH_URL = 'http://localhost:3000'

  const firm = await prisma.company.create({ data: { name: 'Walk Bench Staffing', slug: 'walk-bench', kind: 'VENDOR', currency: 'USD' } })
  companyId = firm.id
  const ownerRole = await prisma.role.create({ data: { companyId, name: 'Owner', permissions: ['*'], isDefault: true } })
  const owner = await prisma.person.create({ data: { name: 'Odile Varga', primaryEmail: OWNER } })
  await prisma.context.create({ data: { personId: owner.id, companyId, roleId: ownerRole.id, type: 'EMPLOYEE', grantReason: 'owner' } })

  // An engineer the firm employs, whose seat reads only their own work.
  const engRole = await prisma.role.create({ data: { companyId, name: 'Engineer', permissions: ['assignments.read', 'timesheets.read'] } })
  const eng = await prisma.person.create({ data: { name: 'Ezra Lund', primaryEmail: 'ezra@walk-bench.test' } })
  await prisma.context.create({ data: { personId: eng.id, companyId, roleId: engRole.id, type: 'EMPLOYEE', grantReason: 'engineer' } })

  // Maya signed up herself: a person and a profile, no firm.
  const maya = await prisma.person.create({ data: { name: 'Maya Brooks', primaryEmail: MAYA } })
  mayaId = maya.id
  await prisma.consultantProfile.create({ data: { personId: mayaId, skills: ['Validation'], visibility: 'INTERNAL' } })

  const client = await prisma.company.create({ data: { name: 'Northbend Walk Athletic', slug: 'walk-client', kind: 'CLIENT', currency: 'USD' } })
  clientId = client.id
}, 180_000)

describe('a firm asks somebody who already has an account', () => {
  it('a firm asks a person who already has an account onto its bench with the same yes, and never makes a second record of her', async () => {
    as(OWNER)
    const r = await json(await addConsultant(req('POST', '/api/consultants', { name: 'M. Brooks', email: MAYA })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.message).toContain('Maya Brooks already has an account')
    expect(await prisma.person.count({ where: { primaryEmail: MAYA } })).toBe(1)
    expect(await prisma.consultantProfile.count({ where: { personId: mayaId } })).toBe(1)
    // Her own name is kept, and she holds no seat at the firm before she answers.
    expect((await prisma.person.findUniqueOrThrow({ where: { id: mayaId } })).name).toBe('Maya Brooks')
    expect(await prisma.context.count({ where: { personId: mayaId, companyId } })).toBe(0)
    const listing = await prisma.benchListing.findFirstOrThrow({ where: { companyId, consultant: { personId: mayaId } } })
    expect(listing.state).toBe('INVITED')
  })

  it('asking her a second time is refused in a sentence and makes nothing', async () => {
    as(OWNER)
    const r = await json(await addConsultant(req('POST', '/api/consultants', { name: 'Maya Brooks', email: MAYA })))
    expect(r.status).toBe(409)
    expect(r.body.error.message).toBe('Walk Bench Staffing already asked Maya Brooks and is waiting on the answer. Nothing new was sent; the invitation can be sent again from Bench.')
    expect(await prisma.benchListing.count({ where: { companyId } })).toBe(1)
  })
})

describe('staff are not roster', () => {
  it('a firm’s owner and managers are never counted on its payroll or its bench unless the work says so', async () => {
    as(OWNER)
    const r = await json(await bench(req('GET', '/api/bench?scope=payroll')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const names = r.body.data.roster.map((p: { name: string }) => p.name)
    expect(names).not.toContain('Odile Varga')
    // The engineer the firm employs stays, with no contract yet.
    expect(names).toContain('Ezra Lund')
    expect(r.body.data.summary.total).toBe(1)
  })
})

describe('a worker names a client she will not be sent to', () => {
  it('a worker can name a client she will not be sent to', async () => {
    as(MAYA)
    const r = await json(await myBenchesPATCH(req('PATCH', '/api/me/benches', { doNotSubmitName: 'northbend walk athletic', note: 'I work there now' })))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.message).toBe('No agency can submit you to Northbend Walk Athletic. None of them is told why, or by whom.')
    const row = await prisma.doNotSubmit.findUniqueOrThrow({ where: { personId_companyId: { personId: mayaId, companyId: clientId } } })
    expect(row.note).toBe('I work there now')
    const page = await json(await myBenches(req('GET', '/api/me/benches')))
    expect(page.body.data.notThese.map((n: { company: string }) => n.company)).toContain('Northbend Walk Athletic')
  })

  it('a name that matches no company on Etyme is answered honestly, and nothing is stored', async () => {
    as(MAYA)
    const before = await prisma.doNotSubmit.count({ where: { personId: mayaId } })
    const r = await json(await myBenchesPATCH(req('PATCH', '/api/me/benches', { doNotSubmitName: 'Halvard Freight' })))
    expect(r.status).toBe(200)
    expect(r.body.data.saved).toBe(false)
    expect(await prisma.doNotSubmit.count({ where: { personId: mayaId } })).toBe(before)
  })
})
