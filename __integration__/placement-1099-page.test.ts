import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as readPlacement } from '@/app/api/placements/[id]/route'

/**
 * A 1099 placement's own page, as the Contracts page reads since
 * dd250c4e5 (the Tapin walk, 2026-11-14): her buy line is paid on her own
 * invoice, so neither the pair nor the buy line's document may say payroll
 * pays her because the firm employs her.
 */

describe('a 1099 placement’s own page never says payroll pays her', () => {
  let owner = ''
  let sellId = ''
  beforeAll(async () => {
    await freshWorld()
    // A buy line with no firm below it, paired with a sell line: one the
    // firm pays itself. The test makes it a 1099 contractor's.
    const link = await prisma.contractLink.findFirstOrThrow({
      where: { buyContract: { vendorCompanyId: null, workOrderId: null } },
      orderBy: [{ sellContractId: 'asc' }],
      select: { sellContractId: true, buyContractId: true, sellContract: { select: { companyId: true } } },
    })
    sellId = link.sellContractId
    await prisma.buyContract.update({ where: { id: link.buyContractId }, data: { contractType: 'IND_1099' } })
    const seat = await prisma.context.findFirstOrThrow({
      where: { companyId: link.sellContract.companyId, revokedAt: null, suspendedAt: null, role: { name: 'Owner' } },
      orderBy: { id: 'asc' },
      select: { person: { select: { primaryEmail: true } } },
    })
    owner = seat.person.primaryEmail!
  }, 240_000)

  it('the placement page pairs her line with what the firm pays her on her own invoice, and her buy line is not paid by payroll', async () => {
    as(owner)
    const { status, body } = await json(await readPlacement(req('GET', `/api/placements/${sellId}`), { params: Promise.resolve({ id: sellId }) }))
    expect(status, JSON.stringify(body).slice(0, 400)).toBe(200)
    const page = JSON.stringify(body)
    expect(page).toContain('Paired with what you pay them on their own invoice, as an independent contractor. They are not your employee.')
    expect(page).toContain('They are paid on their own invoice, as an independent contractor, not by payroll.')
    expect(page).not.toContain('Paired with payroll, because you employ them.')
    expect(page).not.toContain('Payroll pays this line.')
  })
})
