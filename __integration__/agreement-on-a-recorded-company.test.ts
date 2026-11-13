import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

/**
 * Recording an agreement on a company somebody recorded (review,
 * 2026-11-13), walked through the routes on the seeded world as
 * Brightmoor Staffing's Owner. An agreement names a client and a supplier,
 * so it reads the register the way a contract line and an order do: never
 * on another firm's record of a company, and on Brightmoor's own record
 * only once that record holds the position the agreement gives it.
 */

const companies = await import('@/app/api/companies/route')
const extend = await import('@/app/api/companies/[id]/extend/route')
const agreements = await import('@/app/api/contracts/agreements/route')

const OWNER = 'world-brightmoor@demo.etyme.local'
const UNKNOWN = 'Pick the firm the agreement is with. Add them from Companies first if they are not there; they do not need to be on Etyme.'

let brightmoor = ''
let isDemo = false
const record = async (name: string) =>
  json(await companies.POST(req('POST', '/api/companies', { name, kind: 'UNCLASSIFIED' })))
const agree = async (otherCompanyId: string, callerSells: boolean) =>
  json(await agreements.POST(req('POST', '/api/contracts/agreements', { otherCompanyId, callerSells, paymentTerms: 45 })))
const agreementsWith = (id: string) =>
  prisma.masterAgreement.count({ where: { OR: [{ vendorId: brightmoor, clientId: id }, { vendorId: id, clientId: brightmoor }] } })
const refusalsAbout = (companyId: string) => prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: companyId } })

beforeAll(async () => {
  await freshWorld()
  const b = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true, isDemo: true } })
  brightmoor = b.id
  isDemo = b.isDemo
  as(OWNER)
}, 600_000)

describe('an agreement on a company somebody recorded', () => {
  it('an agreement is never recorded against another firm’s record of a company', async () => {
    const other = await prisma.company.findFirstOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })
    const theirs = await prisma.company.create({
      data: { name: 'Quarry Logistics', slug: 'quarry-logistics-walk', kind: 'VENDOR', currency: 'USD', claimedAt: null, listedById: other.id, isDemo },
      select: { id: true },
    })
    const before = await refusalsAbout(theirs.id)

    for (const callerSells of [true, false]) {
      const r = await agree(theirs.id, callerSells)
      // The answer an id nothing has gets, word for word, code and status.
      const nobody = await agree('no-such-company-id', callerSells)
      expect(r.status).toBe(nobody.status)
      expect(r.body.error.code).toBe(nobody.body.error.code)
      expect(r.body.error.message).toBe(UNKNOWN)
      expect(JSON.stringify(r.body)).not.toContain('Quarry')
    }
    expect(await agreementsWith(theirs.id)).toBe(0)
    expect(await prisma.counterparty.count({ where: { companyId: brightmoor, otherCompanyId: theirs.id } })).toBe(0)
    // Written to the access log before the refusal went out.
    expect(await refusalsAbout(theirs.id)).toBe(before + 2)
  })

  it('a company not classified yet is named on an agreement only once it is extended, and the refusal names the step', async () => {
    const made = await record('Lumen Freight Walk')
    expect(made.status).toBe(201)
    const id = made.body.data.id ?? made.body.data.company?.id
    expect(id).toBeTruthy()

    const asClient = await agree(id, true)
    expect(asClient.status).toBe(403)
    expect(asClient.body.error.message).toBe('Lumen Freight Walk is on your Companies list and is not classified yet. Extend it to Customer first.')
    const asSupplier = await agree(id, false)
    expect(asSupplier.body.error.message).toBe('Lumen Freight Walk is on your Companies list and is not classified yet. Extend it to Supplier first.')
    expect(await agreementsWith(id)).toBe(0)
    expect(await prisma.counterparty.count({ where: { companyId: brightmoor, otherCompanyId: id } })).toBe(0)

    // Extended to Customer: the agreement fills the unsigned record Extend
    // wrote, and it is still not a supplier.
    const ext = await json(await (extend.POST as any)(req('POST', `/api/companies/${id}/extend`, { as: 'CUSTOMER' }), { params: { id } }))
    expect(ext.status).toBe(201)
    const nowClient = await agree(id, true)
    expect(nowClient.body?.error, JSON.stringify(nowClient.body)).toBeUndefined()
    expect(nowClient.body.data.filledPlaceholder).toBe(true)
    const stillNotSupplier = await agree(id, false)
    expect(stillNotSupplier.body.error.message).toBe('Lumen Freight Walk is on your Companies list but is not your supplier yet. Extend it to Supplier first.')
    expect(await agreementsWith(id)).toBe(1)
  })
})
