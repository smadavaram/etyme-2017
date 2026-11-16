import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as lines } from '@/app/api/ap/receipts-file/route'
import { POST as answer } from '@/app/api/ap/receipts-file/answer/route'
import { GET as readCoding } from '@/app/api/contracts/[id]/allocations/route'
import { GET as contractsList } from '@/app/api/contracts/route'

/**
 * Fix the coding: the link on a held invoice line opens a contract the
 * payer can read, with its coding panel, and is drawn only for the seats
 * `mayMaintainCodes` names. Through the real routes as the client's seats.
 */

const D = '@demo.etyme.local'
const PAYROLL = `world-brightmoor-payroll${D}`
const OWNER = `world-brightmoor${D}`
const FINANCE = `world-brightmoor-finance${D}`
const ADMIN = `world-brightmoor-admin${D}`
const s: Record<string, any> = {}
const parse = (csv: string) => csv.trim().split('\r\n').map((r) => r.split(','))
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const get = async (run: string, extra = '') => json(await lines(req('GET', `/api/ap/receipts-file?run=${run}${extra}`)))
const read = (f: string) => readFileSync(f, 'utf8')

beforeAll(async () => {
  await freshWorld()
  const payer = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
  s.payer = payer.id
  const bill = await prisma.vendorBill.findFirstOrThrow({
    where: { companyId: payer.id },
    select: { id: true, totalCents: true, currency: true, buyContract: { select: { supplierSellContractId: true } } },
  })
  Object.assign(s, { bill: bill.id, total: bill.totalCents, currency: bill.currency })
  const week = await prisma.timesheet.findFirstOrThrow({
    where: { sellContractId: bill.buyContract!.supplierSellContractId!, status: 'APPROVED', sellContract: { clientCompanyId: payer.id } },
    orderBy: { periodStart: 'desc' },
    select: { id: true, personId: true, sellContractId: true, totalHours: true, sellContract: { select: { billRate: true } } },
  })
  Object.assign(s, { week: week.id, person: week.personId, contract: week.sellContractId, rate: week.sellContract.billRate, hours: Number(week.totalHours) })
  s.owner = (await prisma.person.findFirstOrThrow({ where: { primaryEmail: OWNER }, select: { id: true } })).id
  s.payroll = (await prisma.person.findFirstOrThrow({ where: { primaryEmail: PAYROLL }, select: { id: true } })).id
  s.cc = (await prisma.costCenter.create({ data: { companyId: payer.id, code: 'CC-L-1', name: 'L', glAccount: '6100', profitCenter: 'PC-L' }, select: { id: true } })).id
  await prisma.vendorBillLine.create({ data: { vendorBillId: s.bill, timesheetId: s.week, personId: s.person, hours: s.hours, rateCents: s.rate, amountCents: s.total } })
  s.alloc = (await prisma.contractCostAllocation.create({ data: { sellContractId: s.contract, costCenterId: s.cc, shareBps: 10_000 }, select: { id: true } })).id
  await prisma.companyCoding.upsert({ where: { companyId: payer.id }, create: { companyId: payer.id, companyCode: '1000' }, update: { companyCode: '1000' } })
}, 600_000)

async function newRun(): Promise<string> {
  const run = await prisma.paymentRun.create({
    data: { companyId: s.payer, currency: s.currency, status: 'APPROVED', scheduledFor: new Date(), totalCents: s.total, createdById: s.owner, approvedById: s.payroll, items: { create: [{ vendorBillId: s.bill, amountCents: s.total }] } },
    select: { id: true },
  })
  return run.id
}
/** Sends the run's file as the AP clerk, then has the client's system reject every row. */
async function rejectedRun(): Promise<{ run: string; rowIds: string[] }> {
  const run = await newRun()
  as(PAYROLL)
  const csv = (await get(run, '&columns=etyme_row_id')).body.data.csv
  const [h, ...rows] = parse(csv)
  const rowIds = rows.map((r) => r[h.indexOf('etyme_row_id')])
  const body = `etyme_row_id,status,reason\r\n${rowIds.map((r) => `${r},rejected,Wrong GL account`).join('\r\n')}\r\n`
  const a = await answer(req('POST', '/api/ap/receipts-file/answer', { runId: run, csv: body }))
  expect(a.status).toBeLessThan(300)
  return { run, rowIds }
}
async function everyContract(side: string): Promise<string[]> {
  const ids: string[] = []
  for (let page = 1; page < 40; page++) {
    const r = await json(await contractsList(req('GET', `/api/contracts?side=${side}&page=${page}&limit=50`)))
    // The page opens a row whose id, or whose own coding line, is the one the link names.
    ids.push(...r.body.data.contracts.flatMap((c: any) => [c.id, c.codingContractId].filter(Boolean)))
    if (page >= r.body.data.pagination.totalPages) break
  }
  return ids
}

describe('the link on a held invoice line leads to the coding', () => {
  it('the link to fix a line’s coding opens a contract the payer can read, and its coding panel', async () => {
    const { run } = await rejectedRun()
    as(OWNER)
    const held = await get(run, '&state=1')
    expect(held.status, JSON.stringify(held.body)).toBe(200)
    const line = held.body.data.lines[0]
    expect(line.codingHeld).toBe(true)
    expect(line.codingContractId).toBe(s.contract)
    // The side the link names is the side the payer's own contracts list carries that id on.
    expect(await everyContract(line.codingSide), 'the contracts list the payer’s seat gets, on the side the link names').toContain(line.codingContractId)
    const panel = await json(await readCoding(req('GET', `/api/contracts/${line.codingContractId}/allocations`), ctx(line.codingContractId)))
    expect(panel.body.data.may).toBe(true)
    expect(panel.body.data.allocations.length).toBeGreaterThan(0)
  })

  it('the contracts page draws the coding panel on the side the link names, for a line it pays', () => {
    const page = read('src/app/dashboard/contracts/page.tsx')
    expect(page).toMatch(/tab === 'sell' && <AllocationsPanel contractId=\{contract\.id\} \/>/)
    expect(page).toMatch(/tab === 'buy' && contract\.codingContractId && <AllocationsPanel contractId=\{contract\.codingContractId\} \/>/)
    expect(page).toMatch(/c\.id === openId \|\| c\.codingContractId === openId/)
    expect(read('src/app/dashboard/ap/payment-run-file.tsx')).toMatch(/side=\$\{l\.codingSide \?\? 'sell'\}&open=/)
  })

  it('a supplier that pays a sub-vendor is sent to the buy side, where its line is listed and the sell side does not carry it', async () => {
    const { sideWherePayerReadsLine } = await import('@/lib/money/contract-side')
    expect(sideWherePayerReadsLine('CLIENT')).toBe('sell')
    expect(sideWherePayerReadsLine('VENDOR')).toBe('buy')
    const { run } = await rejectedRun()
    as(OWNER)
    const line = (await get(run, '&state=1')).body.data.lines[0]
    expect(line.codingSide).toBe('buy')
    const buyLine = await prisma.buyContract.findFirstOrThrow({ where: { companyId: s.payer, supplierSellContractId: s.contract }, select: { id: true } })
    expect(buyLine.id).not.toBe(s.contract)
    expect(await everyContract('sell'), 'the sell list does not carry the supplier’s line').not.toContain(s.contract)
  })

  it('an Admin is never offered the link and is told who sets the codes', async () => {
    const { run } = await rejectedRun()
    as(ADMIN)
    const r = await get(run, '&state=1')
    if (r.status === 200) {
      expect(r.body.data.mayFixCoding).toBe(false)
      expect(r.body.data.says).toBe('Your Finance team or the Owner sets these.')
      for (const l of r.body.data.lines) expect(l.codingContractId).toBeNull()
    } else {
      // An Admin who does not open Payables never reads the lines at all.
      expect(r.status).toBe(403)
    }
    const screen = read('src/app/dashboard/ap/payment-run-file.tsx')
    expect(screen).not.toContain('Ask the Owner or an Admin')
    expect(screen).toMatch(/codes\.says/)
  })

  it('where a Finance seat exists, the AP clerk is told who sets the codes and is offered no link', async () => {
    const { run } = await rejectedRun()
    as(PAYROLL)
    const r = await get(run, '&state=1')
    expect(r.body.data.mayFixCoding).toBe(false)
    expect(r.body.data.says).toBe('Your Finance team or the Owner sets these.')
    expect(r.body.data.lines[0].codingContractId).toBeNull()
  })

  it('Finance and the Owner are offered the link', async () => {
    const { run } = await rejectedRun()
    for (const who of [FINANCE, OWNER]) {
      as(who)
      const r = await get(run, '&state=1')
      expect(r.status, who).toBe(200)
      expect(r.body.data.mayFixCoding, who).toBe(true)
      expect(r.body.data.lines[0].codingContractId, who).toBe(s.contract)
    }
  })

  it('where no Finance seat exists, the AP clerk is offered the link and an Admin still is not', async () => {
    await prisma.context.updateMany({ where: { companyId: s.payer, person: { primaryEmail: FINANCE } }, data: { revokedAt: new Date() } })
    const { run } = await rejectedRun()
    as(PAYROLL)
    const clerk = await get(run, '&state=1')
    expect(clerk.body.data.mayFixCoding).toBe(true)
    expect(clerk.body.data.lines[0].codingContractId).toBe(s.contract)
    as(ADMIN)
    const admin = await get(run, '&state=1')
    if (admin.status === 200) {
      expect(admin.body.data.mayFixCoding).toBe(false)
      expect(admin.body.data.says).toBe('Your AP clerk or the Owner sets these.')
    }
  })
})

describe('the screen and the file agree on a line with three shares', () => {
  it('with one of three shares fixed and rejected, the line may be sent again and the file sends that share', async () => {
    const cc2 = (await prisma.costCenter.create({ data: { companyId: s.payer, code: 'CC-L-2', name: 'L2', glAccount: '6200', profitCenter: 'PC-L' }, select: { id: true } })).id
    const cc3 = (await prisma.costCenter.create({ data: { companyId: s.payer, code: 'CC-L-3', name: 'L3', glAccount: '6300', profitCenter: 'PC-L' }, select: { id: true } })).id
    await prisma.contractCostAllocation.update({ where: { id: s.alloc }, data: { shareBps: 3_334 } })
    await prisma.contractCostAllocation.createMany({ data: [
      { sellContractId: s.contract, costCenterId: cc2, shareBps: 3_333 },
      { sellContractId: s.contract, costCenterId: cc3, shareBps: 3_333 },
    ] })
    const run = await newRun()
    as(PAYROLL)
    const [h, ...rows] = parse((await get(run, '&columns=etyme_row_id')).body.data.csv)
    const ids = rows.map((r) => r[h.indexOf('etyme_row_id')])
    expect(ids).toHaveLength(3)
    // Two shares were accepted; the third was rejected. Then its coding is changed.
    const csv = `etyme_row_id,status,reason\r\n${ids[0]},accepted,\r\n${ids[1]},accepted,\r\n${ids[2]},rejected,Wrong GL account\r\n`
    expect((await answer(req('POST', '/api/ap/receipts-file/answer', { runId: run, csv }))).status).toBeLessThan(300)
    expect((await get(run, '&state=1')).body.data.lines[0].canSendAgain, 'before any change').toBe(false)
    await new Promise((r) => setTimeout(r, 20))
    await prisma.contractCostAllocation.update({ where: { id: s.alloc }, data: { glAccount: '6900' } })
    const state = (await get(run, '&state=1')).body.data.lines[0]
    const again = await get(run, '&again=1')
    expect(again.body.data.rows, 'the file sends the share').toBe(1)
    expect(state.canSendAgain, 'the screen offers Send again where the file sends the line').toBe(true)
  })
})
