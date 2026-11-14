import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as listContracts } from '@/app/api/contracts/route'
import { GET as mayStart } from '@/app/api/contracts/[id]/activate/route'
import { pairLine, describeLine, lineDoes } from '@/lib/order-naming'
import { desksHolding } from '@/lib/permissions'

/**
 * The Tapin walk, 2026-11-14, second round, on a world the test makes:
 * a supplier's person turned into a 1099 contractor, and a supplier that
 * seats nobody in the roles that record or start a placement.
 */

describe('a 1099 line on Contracts says her own invoice and never payroll', () => {
  let owner = ''
  let sellId = ''
  let buyId = ''
  let personName = ''
  beforeAll(async () => {
    await freshWorld()
    // A buy line with no firm below it, paired with a sell line: one the
    // firm pays itself. The test makes it a 1099 contractor's.
    const link = await prisma.contractLink.findFirstOrThrow({
      where: { buyContract: { vendorCompanyId: null } },
      orderBy: [{ sellContractId: 'asc' }],
      select: {
        sellContractId: true, buyContractId: true,
        sellContract: { select: { companyId: true, person: { select: { name: true } } } },
      },
    })
    sellId = link.sellContractId
    buyId = link.buyContractId
    personName = link.sellContract.person.name
    await prisma.buyContract.update({ where: { id: buyId }, data: { contractType: 'IND_1099' } })
    const seat = await prisma.context.findFirstOrThrow({
      where: { companyId: link.sellContract.companyId, revokedAt: null, suspendedAt: null, role: { name: 'Owner' } },
      orderBy: { id: 'asc' },
      select: { person: { select: { primaryEmail: true } } },
    })
    owner = seat.person.primaryEmail!
  }, 240_000)

  it('the sell line is paired with what the firm pays her on her own invoice, never with payroll', async () => {
    as(owner)
    const { status, body } = await json(await listContracts(req('GET', '/api/contracts?side=sell&limit=50')))
    expect(status, JSON.stringify(body)).toBe(200)
    const pages = [body.data.contracts]
    for (let p = 2; p <= (body.data.pagination?.totalPages ?? 1); p++) {
      pages.push((await json(await listContracts(req('GET', `/api/contracts?side=sell&limit=50&page=${p}`)))).body.data.contracts)
    }
    const row = pages.flat().find((r: any) => r.id === sellId)
    expect(row, 'the sell line is on the list').toBeTruthy()
    expect(row.pairedWith.contractType).toBe('IND_1099')
    const said = pairLine({ side: 'SELL', counterpartName: row.pairedWith.counterpartName, contractType: row.pairedWith.contractType })
    expect(said).toMatch(/their own invoice, as an independent contractor/)
    expect(said).not.toMatch(/payroll|because you employ/i)
  })

  it('her buy line says she is paid on her own invoice and is not your employee', async () => {
    as(owner)
    const { status, body } = await json(await listContracts(req('GET', '/api/contracts?side=buy&limit=50')))
    expect(status, JSON.stringify(body)).toBe(200)
    const pages = [body.data.contracts]
    for (let p = 2; p <= (body.data.pagination?.totalPages ?? 1); p++) {
      pages.push((await json(await listContracts(req('GET', `/api/contracts?side=buy&limit=50&page=${p}`)))).body.data.contracts)
    }
    const row = pages.flat().find((r: any) => r.id === buyId)
    expect(row, 'the buy line is on the list').toBeTruthy()
    const line = { side: 'BUY' as const, personName, paidToName: row.vendorCompany?.name ?? null, contractType: row.contractType }
    expect(lineDoes(line, 'BYSTANDER')).toMatch(/They are not your employee\.$/)
    const described = describeLine({ order: row.workOrder, companyId: null, line })
    expect(`${described.heading} ${described.does} ${described.says}`).not.toMatch(/Payroll pays|because you employ|No order, and none is due/)
  })
})

describe('a supplier with no Contract Manager or Resource Manager seated names the Owner or an Admin', () => {
  let hr = ''
  let contractId = ''
  beforeAll(async () => {
    await freshWorld()
    const firm = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true, kind: true } })
    // Nobody seated in the roles that hold the act: the test ends them.
    const holders = desksHolding('assignments.write', firm.kind)
    await prisma.context.updateMany({
      where: { companyId: firm.id, revokedAt: null, role: { name: { in: holders } } },
      data: { revokedAt: new Date() },
    })
    const role = await prisma.role.findFirstOrThrow({ where: { companyId: firm.id, name: 'HR' }, select: { id: true } })
    hr = 'hana.hr@brightmoor.demo.etyme.local'
    const p = await prisma.person.create({ data: { primaryEmail: hr, name: 'Hana Ruiz' }, select: { id: true } })
    await prisma.context.create({ data: { personId: p.id, companyId: firm.id, type: 'EMPLOYEE', roleId: role.id, grantReason: 'Seated for the test' } })
    contractId = (await prisma.sellContract.findFirstOrThrow({ where: { companyId: firm.id }, orderBy: { id: 'asc' }, select: { id: true } })).id
  }, 240_000)

  it('HR, offered no Record a placement button, reads that the Owner or an Admin records one here', async () => {
    as(hr)
    const { status, body } = await json(await listContracts(req('GET', '/api/contracts?side=sell&limit=5')))
    expect(status, JSON.stringify(body)).toBe(200)
    expect(body.data.recordSays).toBe('Recording a placement is for the Owner or an Admin here. Ask one of them.')
  })

  it('HR asking whether a placement may start is told the Owner or an Admin starts it, and is still not offered the button', async () => {
    as(hr)
    const { status, body } = await json(await mayStart(req('GET', `/api/contracts/${contractId}/activate`), { params: Promise.resolve({ id: contractId }) }))
    expect(status, JSON.stringify(body)).toBe(200)
    expect(body.data.may).toBe(false)
    expect(body.data.who).toEqual(['Owner', 'Admin'])
  })
})
