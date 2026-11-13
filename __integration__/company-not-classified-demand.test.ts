import { describe, it, expect, beforeAll, vi } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

/**
 * A company not classified yet, read from the demand side (the neutral
 * Company, 2026-11-12). It is a record on one firm's Companies list: it is
 * on no Suppliers list, is never sent a job, never has a person put
 * forward to it and is never invited, until the firm extends it. Once it
 * is extended to Supplier it is on Suppliers and in the job picker like
 * any supplier. Nothing here sends an email: the one sender is faked and
 * counted.
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
const kind = await import('@/app/api/companies/[id]/kind/route')
const suppliers = await import('@/app/api/suppliers/route')
const distribute = await import('@/app/api/requisitions/[id]/distribute/route')
const forward = await import('@/app/api/submissions/[id]/forward/route')

const D = '@demo.etyme.local'
const OWNER = `world-brightmoor${D}`

let brightmoor = ''
let techpeple = ''
let recordId = ''
let jobId = ''

const record = async (name: string) =>
  json(await companies.POST(req('POST', '/api/companies', { name, kind: 'UNCLASSIFIED' })))
const supplierIds = async () =>
  ((await json(await suppliers.GET(req('GET', '/api/suppliers')))).body.data.suppliers as any[]).map((s) => s.companyId)

beforeAll(async () => {
  await freshWorld()
  brightmoor = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })).id
  techpeple = (await prisma.company.findFirstOrThrow({ where: { slug: { startsWith: 'world-techpeple' } }, select: { id: true } })).id
  as(OWNER)
  const r = await record('Corrigan Search Partners')
  expect(r.status).toBe(201)
  recordId = r.body.data.company.id
  const job = await prisma.requirement.create({
    data: { companyId: brightmoor, title: 'Payroll analyst (not-classified walk)', status: 'OPEN', approvalState: 'AUTO_APPROVED' },
    select: { id: true },
  })
  jobId = job.id
}, 600_000)

describe('a company not classified yet, on the demand side', () => {
  it('a company not classified yet is not on the Suppliers list', async () => {
    expect(await supplierIds()).not.toContain(recordId)
  })

  it('a job cannot be sent to a company not classified yet, and the refusal says to extend it to Supplier and is logged before it is sent', async () => {
    const before = await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: recordId } })
    const r = await json(
      await distribute.POST(req('POST', `/api/requisitions/${jobId}/distribute`, { vendors: [{ companyId: recordId }] }), { params: Promise.resolve({ id: jobId }) } as any),
    )
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe('Corrigan Search Partners is on your Companies list and is not classified yet. Extend it to Supplier first.')
    expect(await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: recordId } })).toBe(before + 1)
    expect(await prisma.requirementInvitation.count({ where: { toCompanyId: recordId } })).toBe(0)
  })

  it('a person cannot be sent on to a company not classified yet; the refusal says to extend it to Customer and no submission is written to it', async () => {
    const person = await prisma.person.create({ data: { name: 'Odile Farrant', primaryEmail: 'odile.farrant.walk@example.invalid' } })
    const sub = await prisma.submission.create({
      data: { requirementId: jobId, personId: person.id, fromCompanyId: techpeple, toCompanyId: brightmoor, rate: 9000, status: 'SUBMITTED', kind: 'NETWORK' },
      select: { id: true },
    })
    const r = await json(
      await forward.POST(req('POST', `/api/submissions/${sub.id}/forward`, { via: 'ONWARD', toCompanyId: recordId, rate: 11000 }), { params: Promise.resolve({ id: sub.id }) } as any),
    )
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe('Corrigan Search Partners is on your Companies list and is not classified yet. Extend it to Customer first.')
    expect(await prisma.submission.count({ where: { toCompanyId: recordId } })).toBe(0)
  })

  it('pasting a company not classified yet into the supplier list invites nobody and says to set its kind first', async () => {
    const before = await prisma.supplierInvite.count({ where: { companyId: recordId } })
    const r = await json(
      await suppliers.POST(req('POST', '/api/suppliers', { rows: [{ company: 'Corrigan Search Partners', email: 'desk@corrigan.example', contactName: 'Ruth Corrigan', domain: 'corrigan.example' }] })),
    )
    expect(r.status).toBe(409)
    expect(r.body.error.message).toBe('Say what kind of company Corrigan Search Partners is before you invite them.')
    expect(await prisma.supplierInvite.count({ where: { companyId: recordId } })).toBe(before)
    expect(await prisma.company.count({ where: { listedById: brightmoor, name: 'Corrigan Search Partners' } })).toBe(1)
    expect(sent).toEqual([])
  })

  it('a company extended to Supplier is on the Suppliers list, and a job can then be sent to it, with its Kind unchanged', async () => {
    const e = await json(await extend.POST(req('POST', `/api/companies/${recordId}/extend`, { as: 'SUPPLIER' }), { params: { id: recordId } } as any))
    expect(e.status).toBe(201)
    expect(await supplierIds()).toContain(recordId)
    const r = await json(
      await distribute.POST(req('POST', `/api/requisitions/${jobId}/distribute`, { vendors: [{ companyId: recordId }] }), { params: Promise.resolve({ id: jobId }) } as any),
    )
    expect(r.status).toBe(200)
    expect(await prisma.requirementInvitation.count({ where: { toCompanyId: recordId, requirementId: jobId } })).toBe(1)
    expect((await prisma.company.findUniqueOrThrow({ where: { id: recordId } })).kind).toBe('UNCLASSIFIED')
  })

  it('pasting a supplier whose name is already on the Companies list, with a Kind set, reuses that record rather than making a second one', async () => {
    as(OWNER)
    const r = await record('Ashgrove Contract Staff')
    const id = r.body.data.company.id
    await prisma.company.update({ where: { id }, data: { kind: 'VENDOR' } })
    const p = await json(
      await suppliers.POST(req('POST', '/api/suppliers', { rows: [{ company: 'ASHGROVE contract staff', email: 'hello@ashgrove.example', domain: 'ashgrove.example' }] })),
    )
    expect(p.status).toBe(200)
    expect(p.body.data.added[0].companyId).toBe(id)
    expect(await prisma.company.count({ where: { listedById: brightmoor, name: { equals: 'Ashgrove Contract Staff', mode: 'insensitive' } } })).toBe(1)
  })

  it('a recorded company given the Kind Vendor and no position is still refused a job in the same sentence, and is sent one once it is extended to Supplier', async () => {
    as(OWNER)
    const id = (await record('Tolland Bridge Staffing')).body.data.company.id
    const k = await json(await kind.PATCH(req('PATCH', `/api/companies/${id}/kind`, { kind: 'VENDOR' }), { params: { id } } as any))
    expect(k.status, JSON.stringify(k.body)).toBe(200)
    const before = await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: id } })
    const r = await json(
      await distribute.POST(req('POST', `/api/requisitions/${jobId}/distribute`, { vendors: [{ companyId: id }] }), { params: Promise.resolve({ id: jobId }) } as any),
    )
    expect(r.status, JSON.stringify(r.body)).toBe(403)
    expect(r.body.error.message).toBe('Tolland Bridge Staffing is on your Companies list and is not classified yet. Extend it to Supplier first.')
    expect(await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: id } })).toBe(before + 1)
    expect(await prisma.requirementInvitation.count({ where: { toCompanyId: id } })).toBe(0)

    const e = await json(await extend.POST(req('POST', `/api/companies/${id}/extend`, { as: 'SUPPLIER' }), { params: { id } } as any))
    expect(e.status, JSON.stringify(e.body)).toBe(201)
    const again = await json(
      await distribute.POST(req('POST', `/api/requisitions/${jobId}/distribute`, { vendors: [{ companyId: id }] }), { params: Promise.resolve({ id: jobId }) } as any),
    )
    expect(again.status, JSON.stringify(again.body)).toBe(200)
    expect(await prisma.requirementInvitation.count({ where: { toCompanyId: id, requirementId: jobId } })).toBe(1)
    expect((await prisma.company.findUniqueOrThrow({ where: { id } })).kind).toBe('VENDOR')
  })

  it('a recorded company given the Kind Client and no position is still refused a person sent on, and the refusal says to extend it to Customer', async () => {
    as(OWNER)
    const id = (await record('Marlowe Fenn Holdings')).body.data.company.id
    const k = await json(await kind.PATCH(req('PATCH', `/api/companies/${id}/kind`, { kind: 'CLIENT' }), { params: { id } } as any))
    expect(k.status, JSON.stringify(k.body)).toBe(200)
    const person = await prisma.person.create({ data: { name: 'Petra Lindgren', primaryEmail: 'petra.lindgren.walk@example.invalid' } })
    const sub = await prisma.submission.create({
      data: { requirementId: jobId, personId: person.id, fromCompanyId: techpeple, toCompanyId: brightmoor, rate: 9000, status: 'SUBMITTED', kind: 'NETWORK' },
      select: { id: true },
    })
    const r = await json(
      await forward.POST(req('POST', `/api/submissions/${sub.id}/forward`, { via: 'ONWARD', toCompanyId: id, rate: 11000 }), { params: Promise.resolve({ id: sub.id }) } as any),
    )
    expect(r.status, JSON.stringify(r.body)).toBe(403)
    expect(r.body.error.message).toBe('Marlowe Fenn Holdings is on your Companies list and is not classified yet. Extend it to Customer first.')
    expect(await prisma.submission.count({ where: { toCompanyId: id } })).toBe(0)
  })

  it('nothing on this walk was emailed to a company not classified yet', () => {
    expect(sent.some((to) => to.includes('corrigan'))).toBe(false)
  })
})
