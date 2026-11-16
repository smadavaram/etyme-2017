import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as lines } from '@/app/api/ap/receipts-file/route'
import { POST as answer } from '@/app/api/ap/receipts-file/answer/route'
import { GET as readCoding, PATCH as patchCoding } from '@/app/api/contracts/[id]/allocations/route'

/**
 * Layer 9: the paying client corrects a contract’s cost coding in place, and
 * a line held for that coding goes in its next file. Through the real
 * routes as the client’s own seats and as the supplier.
 */

const D = '@demo.etyme.local'
const PAYROLL = `world-brightmoor-payroll${D}`
const s: Record<string, any> = {}
const parse = (csv: string) => csv.trim().split('\r\n').map((r) => r.split(','))

beforeAll(async () => {
  await freshWorld()
  const payer = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
  s.payer = payer.id
  const bill = await prisma.vendorBill.findFirstOrThrow({
    where: { companyId: payer.id },
    select: { id: true, totalCents: true, vendorCompanyId: true, currency: true, buyContract: { select: { supplierSellContractId: true } } },
  })
  Object.assign(s, { bill: bill.id, total: bill.totalCents, payee: bill.vendorCompanyId, currency: bill.currency })
  const week = await prisma.timesheet.findFirstOrThrow({
    where: { sellContractId: bill.buyContract!.supplierSellContractId!, status: 'APPROVED', sellContract: { clientCompanyId: payer.id } },
    orderBy: { periodStart: 'desc' },
    select: { id: true, personId: true, sellContractId: true, totalHours: true, sellContract: { select: { billRate: true } } },
  })
  Object.assign(s, { week: week.id, person: week.personId, contract: week.sellContractId, rate: week.sellContract.billRate, hours: Number(week.totalHours) })
  const mgr = await prisma.context.findFirstOrThrow({
    where: { companyId: payer.id, revokedAt: null, person: { primaryEmail: { startsWith: 'world-brightmoor-' } }, role: { permissions: { hasSome: ['settings.manage', '*'] } } },
    select: { person: { select: { id: true, primaryEmail: true } } },
  })
  s.finance = mgr.person.id
  s.manager = mgr.person.primaryEmail
  s.payroll = (await prisma.person.findFirstOrThrow({ where: { primaryEmail: PAYROLL }, select: { id: true } })).id
  s.supplierSeat = (await prisma.context.findFirstOrThrow({ where: { companyId: s.payee, revokedAt: null }, select: { person: { select: { primaryEmail: true } } } })).person.primaryEmail
  s.cc = (await prisma.costCenter.create({ data: { companyId: payer.id, code: 'CC-E-1', name: 'E', glAccount: '6100', profitCenter: 'PC-E' }, select: { id: true } })).id
  s.other = (await prisma.costCenter.create({ data: { companyId: s.payee, code: 'CC-FOREIGN', name: 'F' }, select: { id: true } })).id
  await prisma.vendorBillLine.create({ data: { vendorBillId: s.bill, timesheetId: s.week, personId: s.person, hours: s.hours, rateCents: s.rate, amountCents: s.total } })
  s.alloc = (await prisma.contractCostAllocation.create({ data: { sellContractId: s.contract, costCenterId: s.cc, shareBps: 10_000 }, select: { id: true } })).id
  await prisma.companyCoding.upsert({ where: { companyId: payer.id }, create: { companyId: payer.id, companyCode: '1000' }, update: { companyCode: '1000' } })
}, 600_000)

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const patch = async (body: Record<string, unknown>) => json(await patchCoding(req('PATCH', `/api/contracts/${s.contract}/allocations`, body), ctx(s.contract)))
const get = async (run: string, extra = '') => json(await lines(req('GET', `/api/ap/receipts-file?run=${run}${extra}`)))
const rowIdOf = (csv: string) => { const [h, r] = parse(csv); return r[h.indexOf('etyme_row_id')] }
async function newRun(): Promise<string> {
  const run = await prisma.paymentRun.create({
    data: { companyId: s.payer, currency: s.currency, status: 'APPROVED', scheduledFor: new Date(), totalCents: s.total, createdById: s.finance, approvedById: s.payroll, items: { create: [{ vendorBillId: s.bill, amountCents: s.total }] } },
    select: { id: true },
  })
  return run.id
}

describe('the paying client corrects a contract’s cost coding', () => {
  it('the client corrects a contract’s cost coding and the held line goes in its next file', async () => {
    const run = await newRun()
    as(PAYROLL)
    const rowId = rowIdOf((await get(run, '&columns=etyme_row_id')).body.data.csv)
    await answer(req('POST', '/api/ap/receipts-file/answer', { runId: run, csv: `etyme_row_id,status,reason\r\n${rowId},rejected,Wrong GL account\r\n` }))
    const held = await get(run, '&state=1')
    expect(held.body.data.lines[0].canSendAgain).toBe(false)
    expect(held.body.data.lines[0].codingHeld).toBe(true)
    as(s.manager)
    const seen = await get(run, '&state=1')
    if (seen.status === 200) expect(seen.body.data.lines[0].codingContractId, 'the held line links to the contract').toBe(s.contract)
    as(PAYROLL)
    expect((await get(run, '&again=1')).body.data.rows).toBe(0)

    await new Promise((r) => setTimeout(r, 20))
    const before = await prisma.contractCostAllocation.findUniqueOrThrow({ where: { id: s.alloc } })
    as(s.manager)
    const saved = await patch({ allocationId: s.alloc, glAccount: '6200' })
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    expect(saved.body.data.says).toBe('Saved. Lines held for this coding go in your next file.')

    as(PAYROLL)
    expect((await get(run, '&state=1')).body.data.lines[0].canSendAgain).toBe(true)
    const next = await get(run, '&again=1')
    expect(next.body.data.rows).toBe(1)
    expect(next.body.data.csv).toContain('6200')

    const after = await prisma.contractCostAllocation.findUniqueOrThrow({ where: { id: s.alloc } })
    expect(after.glAccount).toBe('6200')
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime())
    expect(await prisma.contractCostAllocation.count({ where: { sellContractId: s.contract } })).toBe(1)
  })

  it('a change writes one log row naming who changed it and holding none of the client’s codes', async () => {
    as(s.manager)
    const n = await prisma.automationLog.count({ where: { companyId: s.payer, action: 'CONTRACT_CODING_CHANGED' } })
    expect((await patch({ allocationId: s.alloc, glAccount: '6300' })).status).toBe(200)
    const rows = await prisma.automationLog.findMany({ where: { companyId: s.payer, action: 'CONTRACT_CODING_CHANGED' } })
    expect(rows).toHaveLength(n + 1)
    const row = rows.find((r) => (r.payload as any).fields?.[0] === 'GL account' && JSON.stringify(r.payload).includes(s.alloc) && r.at.getTime() === Math.max(...rows.map((x) => x.at.getTime())))!
    const text = JSON.stringify(row)
    expect(row.summary).toContain('changed the GL account')
    for (const code of ['6300', '6200', '6100', 'CC-E-1']) expect(text).not.toContain(code)
  })

  it('a supplier is refused, the refusal is logged, and the coding is unchanged', async () => {
    as(s.supplierSeat)
    const before = await prisma.contractCostAllocation.findUniqueOrThrow({ where: { id: s.alloc } })
    const logs = await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: s.payer } })
    const r = await patch({ allocationId: s.alloc, glAccount: '9999' })
    expect(r.status).toBe(403)
    expect(await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: s.payer } })).toBeGreaterThan(logs)
    const after = await prisma.contractCostAllocation.findUniqueOrThrow({ where: { id: s.alloc } })
    expect(after.glAccount).toBe(before.glAccount)
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime())
  })

  it('the AP seat that cannot manage settings is refused and is told whom to ask, with no link', async () => {
    as(PAYROLL)
    const r = await patch({ allocationId: s.alloc, glAccount: '9998' })
    expect(r.status).toBe(403)
    const read = await json(await readCoding(req('GET', `/api/contracts/${s.contract}/allocations`), ctx(s.contract)))
    expect(read.body.data).toEqual({ may: false })
    const run = await newRun()
    await prisma.contractCostAllocation.deleteMany({ where: { sellContractId: s.contract } })
    const held = (await get(run, '&state=1')).body.data.lines[0]
    expect(held.codingHeld).toBe(true)
    expect(held.codingContractId).toBeNull()
    await prisma.contractCostAllocation.create({ data: { id: s.alloc, sellContractId: s.contract, costCenterId: s.cc, shareBps: 10_000, glAccount: '6300' } })
  })

  it('shares that would not add up to 100 percent are refused and nothing is saved', async () => {
    as(s.manager)
    const before = await prisma.contractCostAllocation.findUniqueOrThrow({ where: { id: s.alloc } })
    const r = await patch({ allocationId: s.alloc, sharePct: 80 })
    expect(r.status).toBe(422)
    expect(r.body.error.message).toContain('add up to 100%')
    const after = await prisma.contractCostAllocation.findUniqueOrThrow({ where: { id: s.alloc } })
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime())
  })

  it('another company’s cost center is refused', async () => {
    as(s.manager)
    const r = await patch({ allocationId: s.alloc, costCenterId: s.other })
    expect(r.status).toBe(422)
    expect(r.body.error.message).toBe('That cost center is not one of yours.')
  })

  it('the edit is drawn for the client’s settings seat and for nobody at the supplier', async () => {
    as(s.manager)
    const mine = await json(await readCoding(req('GET', `/api/contracts/${s.contract}/allocations`), ctx(s.contract)))
    expect(mine.body.data.may).toBe(true)
    expect(mine.body.data.allocations).toHaveLength(1)
    as(s.supplierSeat)
    const theirs = await json(await readCoding(req('GET', `/api/contracts/${s.contract}/allocations`), ctx(s.contract)))
    expect(theirs.body.data).toEqual({ may: false })
  })
})
