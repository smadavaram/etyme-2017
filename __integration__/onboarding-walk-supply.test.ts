import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { POST as addConsultant } from '@/app/api/consultants/route'
import { GET as bench } from '@/app/api/bench/route'
import { GET as myBenches, PATCH as myBenchesPATCH } from '@/app/api/me/benches/route'
import { POST as flag } from '@/app/api/bench/ours/flag/route'
import { GET as ours } from '@/app/api/bench/ours/route'

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

  it('where no email can be sent, a bench invitation’s link is kept on the notice for staff, and the screen says so', async () => {
    const { LINK_KEPT } = await import('@/lib/notify/account-mail')
    const { INVITE_LINK_KEPT_SAYS } = await import('@/lib/bench-filter')
    const listing = await prisma.benchListing.findFirstOrThrow({ where: { companyId, consultant: { personId: mayaId } } })
    const kept = await prisma.notification.findFirst({ where: { personId: mayaId, entityId: listing.id } })
    expect(kept, 'no notice kept the link').toBeTruthy()
    expect(kept!.body).toContain(LINK_KEPT)
    expect(kept!.body).toMatch(/\/bench-invite\//)
    expect(kept!.deliveryState).toBe('NOT_CONFIGURED')

    // A person with no account at all reads the same, and is never told it went by email.
    as(OWNER)
    const r = await json(await addConsultant(req('POST', '/api/consultants', { name: 'Ike Danso', email: 'ike.danso@walk-bench.test' })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.message).toContain(INVITE_LINK_KEPT_SAYS)
    expect(r.body.data.message).not.toContain('has emailed them')
  })

  it('asking her a second time is refused in a sentence and makes nothing', async () => {
    as(OWNER)
    const r = await json(await addConsultant(req('POST', '/api/consultants', { name: 'Maya Brooks', email: MAYA })))
    expect(r.status).toBe(409)
    expect(r.body.error.message).toBe('Walk Bench Staffing already asked Maya Brooks and is waiting on the answer. Nothing new was sent; the invitation can be sent again from Bench.')
    expect(await prisma.benchListing.count({ where: { companyId, consultant: { personId: mayaId } } })).toBe(1)
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

  it('a worker names a client not yet on Etyme and it is honored the day that company joins', async () => {
    const { honorNamedClients } = await import('@/lib/consultant-portfolio')
    as(MAYA)
    const r = await json(await myBenchesPATCH(req('PATCH', '/api/me/benches', { doNotSubmitName: 'Kettering Molding', note: 'my old boss' })))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data).toMatchObject({ saved: true, kept: true })
    expect(r.body.data.message).toContain('Kettering Molding is not on Etyme yet. It is kept on your list')
    // Typed again in other capitals: still one row.
    await myBenchesPATCH(req('PATCH', '/api/me/benches', { doNotSubmitName: 'kettering molding' }))
    expect(await prisma.doNotSubmit.count({ where: { personId: mayaId, companyName: { equals: 'Kettering Molding', mode: 'insensitive' } } })).toBe(1)
    let page = await json(await myBenches(req('GET', '/api/me/benches')))
    expect(page.body.data.notThese.find((n: any) => n.company.toLowerCase() === 'kettering molding')).toMatchObject({ notOnEtyme: true, companyId: null })

    // The company joins: one company of that name, so her list holds it by its record.
    const kettering = await prisma.company.create({ data: { name: 'Kettering Molding', slug: 'walk-kettering', kind: 'CLIENT', currency: 'USD' } })
    expect(await honorNamedClients(kettering.id, 'Kettering Molding')).toBe(1)
    expect(await prisma.doNotSubmit.findUnique({ where: { personId_companyId: { personId: mayaId, companyId: kettering.id } } })).toBeTruthy()
    page = await json(await myBenches(req('GET', '/api/me/benches')))
    expect(page.body.data.notThese.find((n: any) => n.companyId === kettering.id)).toMatchObject({ company: 'Kettering Molding', notOnEtyme: false })
  })

  it('a name two companies share on joining is left as she typed it, never guessed', async () => {
    const { honorNamedClients } = await import('@/lib/consultant-portfolio')
    as(MAYA)
    await myBenchesPATCH(req('PATCH', '/api/me/benches', { doNotSubmitName: 'Halvard Freight' }))
    const a = await prisma.company.create({ data: { name: 'Halvard Freight', slug: 'walk-halvard-a', kind: 'CLIENT', currency: 'USD' } })
    await prisma.company.create({ data: { name: 'Halvard Freight', slug: 'walk-halvard-b', kind: 'CLIENT', currency: 'USD' } })
    expect(await honorNamedClients(a.id, 'Halvard Freight')).toBe(0)
    expect(await prisma.doNotSubmit.findFirst({ where: { personId: mayaId, companyName: 'Halvard Freight', companyId: null } })).toBeTruthy()
  })
})

describe('a roll-off with no project line', () => {
  it('a delivery manager is offered an employee with no project line, and the flag is refused in a sentence until a release may be kept without one', async () => {
    as(OWNER)
    const page = await json(await ours(req('GET', '/api/bench/ours')))
    expect(page.status, JSON.stringify(page.body)).toBe(200)
    const ezra = page.body.data.team.find((t: any) => t.name === 'Ezra Lund')
    expect(ezra).toMatchObject({ sellContractId: null, client: null })
    // The owner is staff and is not offered.
    expect(page.body.data.team.map((t: any) => t.name)).not.toContain('Odile Varga')

    const day = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)
    const r = await json(await flag(req('POST', '/api/bench/ours/flag', { personId: ezra.personId, rollsOffOn: day })))
    const { Prisma } = await import('@prisma/client')
    const required = Prisma.dmmf.datamodel.models.find((m) => m.name === 'ProjectRelease')!.fields.find((f) => f.name === 'sellContractId')!.isRequired
    if (required) {
      expect(r.status).toBe(409)
      expect(r.body.error.message).toBe('Ezra Lund has no project line on the record, and a roll-off without one cannot be kept yet. Record the project line, then flag the day from it.')
      expect(await prisma.projectRelease.count({ where: { personId: ezra.personId } })).toBe(0)
    } else {
      expect(r.status, JSON.stringify(r.body)).toBe(201)
      expect(r.body.data.says).toMatch(/^Ezra Lund comes off on .*: no project line, free from /)
    }
  })
})
