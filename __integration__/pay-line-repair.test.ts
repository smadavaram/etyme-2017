import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as payLine } from '@/app/api/contracts/[id]/pay-line/route'
import { agreeTerms } from './hire-terms-walk'

/**
 * Rajesh Iyer's case, on the seeded world: Brightmoor's own employee
 * awarded to Northbend with no pay on record, so the award wrote the sell
 * line and no buy line. The placement says so, the contract manager is
 * led to the terms page, and stating the pay there writes the line.
 */
describe('a placement with no buy line, on the seeded world', () => {
  let sellId = ''
  let submissionId = ''
  const OWNER = 'world-brightmoor@demo.etyme.local'
  const ask = async () => json(await payLine(req('GET', `/api/contracts/${sellId}/pay-line`), { params: Promise.resolve({ id: sellId }) }))

  beforeAll(async () => {
    await freshWorld()
    const brightmoor = await prisma.company.findFirstOrThrow({ where: { slug: 'world-brightmoor' } })
    const template = await prisma.sellContract.findFirstOrThrow({ where: { companyId: brightmoor.id, requirementId: { not: null } } })
    const person = await prisma.person.create({ data: { name: 'Rajan Ayer', primaryEmail: 'rajan.ayer@seed.etyme.invalid' } })
    await prisma.context.create({ data: { personId: person.id, companyId: brightmoor.id, type: 'EMPLOYEE', grantReason: 'pay line walk' } })
    const sub = await prisma.submission.create({
      data: {
        requirementId: template.requirementId!, personId: person.id, fromCompanyId: brightmoor.id,
        toCompanyId: template.clientCompanyId, kind: 'INTERNAL', rate: 9_500, contractType: 'W2', status: 'PLACED',
      },
    })
    submissionId = sub.id
    const sell = await prisma.sellContract.create({
      data: {
        companyId: brightmoor.id, clientCompanyId: template.clientCompanyId, endClientCompanyId: template.endClientCompanyId,
        personId: person.id, requirementId: template.requirementId, engagementId: template.engagementId, msaId: template.msaId,
        billRate: 9_500, billCurrency: template.billCurrency, paymentTerms: template.paymentTerms, state: 'DRAFT',
        startDate: new Date(), endDate: new Date(Date.now() + 120 * 86_400_000),
      },
    })
    sellId = sell.id
  }, 180_000)

  it('the supplier’s contract manager reads that no buy line stands and is offered the terms page that writes one', async () => {
    as(OWNER)
    const r = await ask()
    expect(r.status).toBe(200)
    expect(r.body.data.hasBuyLine).toBe(false)
    expect(r.body.data.says).toMatch(/^No buy line behind this placement/)
    expect(r.body.data.says).toContain('Rajan Ayer')
    expect(r.body.data.door).toEqual({ href: `/dashboard/submissions/${submissionId}/terms`, label: 'State Rajan Ayer’s pay' })
  })

  it('stating the pay on that page writes the payroll line, with no order, and the placement stops saying so', async () => {
    await agreeTerms({ submissionId, firmEmail: OWNER, personEmail: null, payRate: 6_000 })
    const link = await prisma.contractLink.findFirstOrThrow({ where: { sellContractId: sellId }, include: { buyContract: { include: { candidates: true } } } })
    expect(link.buyContract.contractType).toBe('W2')
    expect(link.buyContract.vendorCompanyId).toBeNull()
    expect(link.buyContract.workOrderId).toBeNull()
    expect(link.buyContract.candidates[0].payRate).toBe(6_000)
    as(OWNER)
    const r = await ask()
    expect(r.body.data).toEqual({ hasBuyLine: true, says: null, door: null })
  })
})
