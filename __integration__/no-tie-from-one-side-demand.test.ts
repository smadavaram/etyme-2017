import { describe, it, expect, beforeAll, vi } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

/**
 * A firm on Etyme is never tied to you from your side alone (review,
 * 2026-11-13), read from the demand side: pasting a supplier list, a job
 * ticked before its last approval, and the supplier list itself. The one
 * sender is faked and counted, so "emails nobody" is a count.
 */

const sent: string[] = []
vi.mock('@/lib/senders', async (orig) => {
  const real: any = await orig()
  return {
    ...real,
    emailSender: () => ({ channel: 'EMAIL', send: async (to: string) => { sent.push(to) } }),
  }
})

const companies = await import('@/app/api/companies/route')
const extend = await import('@/app/api/companies/[id]/extend/route')
const suppliers = await import('@/app/api/suppliers/route')
const join = await import('@/app/api/suppliers/join/route')
const { sendTickedOnClearing } = await import('@/app/api/requisitions/send')
const { createCompany } = await import('@/lib/company-create')

const D = '@demo.etyme.local'
const OWNER = `world-brightmoor${D}`

let brightmoor = ''
let isDemo = false

/** A firm that signed up on its own: its domain verified, its owner seated, nothing to do with Brightmoor. */
const firmOnEtyme = async (name: string, slug: string, domain: string) => {
  const owner = await prisma.person.upsert({ where: { primaryEmail: `owner@${domain}` }, update: {}, create: { primaryEmail: `owner@${domain}`, name: `${name} Owner` } })
  const made = await createCompany({ name, kind: 'VENDOR', slug, domain, byPersonId: owner.id, seatAsOwner: true, claimDomain: true, startsSetup: true })
  await prisma.company.update({ where: { id: made.company.id }, data: { claimedAt: new Date(), isDemo } })
  return { id: made.company.id, slug: made.company.slug }
}
const record = async (name: string) =>
  (await json(await companies.POST(req('POST', '/api/companies', { name, kind: 'UNCLASSIFIED' })))).body.data.company.id as string
const supplierIds = async () =>
  ((await json(await suppliers.GET(req('GET', '/api/suppliers')))).body.data.suppliers as any[]).map((s) => s.companyId)

beforeAll(async () => {
  await freshWorld()
  const b = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true, isDemo: true } })
  brightmoor = b.id
  isDemo = b.isDemo
  as(OWNER)
}, 600_000)

describe('pasting a supplier list', () => {
  it('a pasted domain of a firm on Etyme that does not work with you writes nothing, emails nobody, and says to ask them to link, logged before the reply', async () => {
    as(OWNER)
    const firm = await firmOnEtyme('Harrowgate Staffing', 'harrowgate-staffing-walk', 'harrowgate.example')
    const refusalsBefore = await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: firm.id } })
    const r = await json(
      await suppliers.POST(req('POST', '/api/suppliers', { rows: [{ company: 'Harrowgate', email: 'desk@harrowgate.example', contactName: 'Mira Holt', domain: 'harrowgate.example' }] })),
    )
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    expect(r.body.error.code).toBe('ALREADY_ON_ETYME')
    expect(r.body.error.message).toBe(
      'That company is on Etyme already, so no copy of it was made. Ask them to link, as your supplier: they are asked, and nothing is on either list until they say yes.',
    )
    expect(r.body.error.refused).toEqual([
      {
        name: 'Harrowgate', email: 'desk@harrowgate.example', code: 'ALREADY_ON_ETYME',
        says: r.body.error.message, askToLink: { name: 'Harrowgate', domain: 'harrowgate.example' },
      },
    ])
    const said = JSON.stringify(r.body)
    expect(said).not.toContain(firm.id)
    expect(said).not.toContain(firm.slug)
    expect(said).not.toContain('Harrowgate Staffing')
    expect(said).not.toContain('alreadyHere')
    expect(await prisma.masterAgreement.count({ where: { OR: [{ vendorId: firm.id, clientId: brightmoor }, { vendorId: brightmoor, clientId: firm.id }] } })).toBe(0)
    expect(await prisma.counterparty.count({ where: { OR: [{ companyId: brightmoor, otherCompanyId: firm.id }, { companyId: firm.id, otherCompanyId: brightmoor }] } })).toBe(0)
    expect(await prisma.companyContact.count({ where: { companyId: brightmoor, atCompanyId: firm.id } })).toBe(0)
    expect(await prisma.supplierInvite.count({ where: { byId: brightmoor, companyId: firm.id } })).toBe(0)
    expect(sent.filter((to) => to.includes('harrowgate'))).toEqual([])
    expect(await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: firm.id } })).toBe(refusalsBefore + 1)
  })

  it('a pasted domain of a firm on Etyme that already works with you is added to that firm as before', async () => {
    as(OWNER)
    const firm = await firmOnEtyme('Wexcombe Talent', 'wexcombe-talent-walk', 'wexcombe.example')
    await prisma.masterAgreement.create({ data: { vendorId: firm.id, clientId: brightmoor, paymentTerms: 30 } })
    const r = await json(
      await suppliers.POST(req('POST', '/api/suppliers', { rows: [{ company: 'Wexcombe Talent', email: 'desk@wexcombe.example', domain: 'wexcombe.example' }] })),
    )
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.added[0]).toMatchObject({ companyId: firm.id, alreadyHere: true })
    expect(await prisma.counterparty.count({ where: { companyId: brightmoor, otherCompanyId: firm.id, relationship: 'SUPPLIER' } })).toBe(1)
    expect(await prisma.company.count({ where: { name: 'Wexcombe Talent' } })).toBe(1)
  })
})

describe('a job ticked before its last approval', () => {
  it('a company whose Supplier position was taken off after it was ticked is not sent the job, the skip is logged, and the send says who was left off and why', async () => {
    as(OWNER)
    const id = await record('Lanyard Hill Recruiting')
    const e = await json(await extend.POST(req('POST', `/api/companies/${id}/extend`, { as: 'SUPPLIER' }), { params: { id } } as any))
    expect(e.status, JSON.stringify(e.body)).toBe(201)
    const job = await prisma.requirement.create({
      data: { companyId: brightmoor, title: 'Benefits analyst (ticked walk)', status: 'OPEN', approvalState: 'AUTO_APPROVED', sendToSupplierIds: [id] },
      select: { id: true },
    })
    // The position comes off while the job waits for its last yes.
    await prisma.counterparty.deleteMany({ where: { companyId: brightmoor, otherCompanyId: id, relationship: 'SUPPLIER' } })
    const owner = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: OWNER }, select: { id: true, name: true } })
    const before = await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: id } })
    const out = await sendTickedOnClearing({ requirementId: job.id, caller: { person: owner }, when: 'it was approved' })
    expect(out).toEqual([])
    expect(await prisma.requirementInvitation.count({ where: { requirementId: job.id, toCompanyId: id } })).toBe(0)
    expect(await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: id } })).toBe(before + 1)
    const log = await prisma.automationLog.findFirstOrThrow({
      where: { companyId: brightmoor, action: 'REQUISITION_DISTRIBUTED', payload: { path: ['requirementId'], equals: job.id } },
      orderBy: { at: 'desc' },
    })
    expect(log.reason).toContain('Left out, no longer a supplier on your list: Lanyard Hill Recruiting')
  })

  it('a company still holding its Supplier position is sent the ticked job as before', async () => {
    as(OWNER)
    const id = await record('Corbel Street Staffing')
    await json(await extend.POST(req('POST', `/api/companies/${id}/extend`, { as: 'SUPPLIER' }), { params: { id } } as any))
    const job = await prisma.requirement.create({
      data: { companyId: brightmoor, title: 'Payroll lead (ticked walk)', status: 'OPEN', approvalState: 'AUTO_APPROVED', sendToSupplierIds: [id] },
      select: { id: true },
    })
    const owner = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: OWNER }, select: { id: true, name: true } })
    const out = await sendTickedOnClearing({ requirementId: job.id, caller: { person: owner }, when: 'it was approved' })
    expect(out.map((o) => o.status)).toEqual(['sent'])
    expect(await prisma.requirementInvitation.count({ where: { requirementId: job.id, toCompanyId: id } })).toBe(1)
  })
})

describe('the supplier list', () => {
  it('a company invited as a client and extended only to Customer is on no supplier list', async () => {
    as(OWNER)
    const id = await record('Penhallow Foods')
    const e = await json(await extend.POST(req('POST', `/api/companies/${id}/extend`, { as: 'CUSTOMER' }), { params: { id } } as any))
    expect(e.status, JSON.stringify(e.body)).toBe(201)
    // What /api/clients writes when it invites a client: an invitation from this firm.
    await prisma.company.update({ where: { id }, data: { kind: 'CLIENT' } })
    await prisma.supplierInvite.create({ data: { companyId: id, byId: brightmoor, email: 'ap@penhallow.example', token: `penhallow-${Date.now()}` } })
    expect(await supplierIds()).not.toContain(id)
  })
})

describe('joining two records of one supplier', () => {
  it('a firm on Etyme you do not work with is never offered as the other half of a duplicate, and folding your record into it is refused, logged first, and nothing moves', async () => {
    as(OWNER)
    const firm = await firmOnEtyme('Kestle Ridge Staffing', 'kestle-ridge-walk', 'kestleridge.example')
    // A record Brightmoor listed long ago, invited at the firm's domain and sent a job.
    const shell = await prisma.company.create({
      data: { name: 'Kestle Ridge', slug: `kestle-ridge-shell-${Date.now()}`, kind: 'VENDOR', currency: 'USD', listedById: brightmoor, isDemo },
      select: { id: true },
    })
    await prisma.supplierInvite.create({ data: { companyId: shell.id, byId: brightmoor, email: 'desk@kestleridge.example', domain: 'kestleridge.example', token: `kestle-${Date.now()}` } })
    await prisma.masterAgreement.create({ data: { vendorId: shell.id, clientId: brightmoor, paymentTerms: 30 } })
    const pairs = await json(await join.GET(req('GET', '/api/suppliers/join')))
    expect(pairs.status).toBe(200)
    expect(JSON.stringify(pairs.body)).not.toContain(firm.id)

    const before = await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: firm.id } })
    const r = await json(await join.POST(req('POST', '/api/suppliers/join', { keepId: firm.id, foldId: shell.id })))
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    expect(r.body.error.message).toBe(
      'That company is on Etyme and does not work with you yet, so nothing was joined. Ask them to link from Add company: nothing is on either list until they say yes.',
    )
    expect(await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: firm.id } })).toBe(before + 1)
    expect(await prisma.masterAgreement.count({ where: { vendorId: firm.id, clientId: brightmoor } })).toBe(0)
    expect(await prisma.masterAgreement.count({ where: { vendorId: shell.id, clientId: brightmoor } })).toBe(1)
  })

  it('another firm\u2019s record is not yours to join, and nothing moves', async () => {
    as(OWNER)
    const other = await prisma.company.findFirstOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })
    const theirs = await prisma.company.create({
      data: { name: 'Fallowmere Staffing', slug: `fallowmere-a-${Date.now()}`, kind: 'VENDOR', currency: 'USD', listedById: other.id, isDemo },
      select: { id: true },
    })
    const mine = await prisma.company.create({
      data: { name: 'Fallowmere Staffing', slug: `fallowmere-b-${Date.now()}`, kind: 'VENDOR', currency: 'USD', listedById: brightmoor, isDemo },
      select: { id: true },
    })
    const r = await json(await join.POST(req('POST', '/api/suppliers/join', { keepId: mine.id, foldId: theirs.id })))
    expect(r.status, JSON.stringify(r.body)).toBe(403)
    expect(r.body.error.message).toBe('One of those records is not on your list, so it is not yours to join.')
    expect((await prisma.company.findUniqueOrThrow({ where: { id: theirs.id } })).name).toBe('Fallowmere Staffing')
  })
})
