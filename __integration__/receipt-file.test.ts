import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as lines } from '@/app/api/ap/receipts-file/route'

/**
 * Layer 9, slice 1, through the real route as the client's own seats: the
 * file of invoice receipt lines in the client's own codes. The seeded
 * receipts are typed in as a total, so the story gives one a line, a
 * signed week and a cost split, then reads the file.
 */

const D = '@demo.etyme.local'
const PAYROLL = `world-brightmoor-payroll${D}`
const s: Record<string, any> = {}

const COL = (name: string, header: string[]) => header.indexOf(name)
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
  // The signed week the receipt bills: found by its facts, 40 hours at the rate.
  const week = await prisma.timesheet.findFirstOrThrow({
    where: { sellContractId: bill.buyContract!.supplierSellContractId!, status: 'APPROVED', sellContract: { clientCompanyId: payer.id } },
    orderBy: { periodStart: 'desc' },
    select: { id: true, personId: true, sellContractId: true, totalHours: true, sellContract: { select: { billRate: true } }, person: { select: { name: true } } },
  })
  Object.assign(s, { week: week.id, person: week.personId, personName: week.person.name, contract: week.sellContractId, rate: week.sellContract.billRate, hours: Number(week.totalHours) })
  const finance = await prisma.person.findFirstOrThrow({ where: { primaryEmail: `world-brightmoor-finance${D}` }, select: { id: true } })
  s.finance = finance.id
  s.payroll = (await prisma.person.findFirstOrThrow({ where: { primaryEmail: PAYROLL }, select: { id: true } })).id
  s.supplierSeat = (await prisma.context.findFirstOrThrow({ where: { companyId: s.payee, revokedAt: null }, select: { person: { select: { primaryEmail: true } } } })).person.primaryEmail
  // A Brightmoor seat whose role does not release payment runs.
  const hr = await prisma.context.findFirst({
    where: { companyId: payer.id, revokedAt: null, person: { primaryEmail: { startsWith: 'world-brightmoor-' } }, NOT: { role: { permissions: { hasSome: ['payments.record', '*'] } } } },
    select: { person: { select: { primaryEmail: true } } },
  })
  s.noPaySeat = hr?.person.primaryEmail ?? null
  for (const [i, code] of ['CC-A', 'CC-B', 'CC-C'].entries()) {
    s[`cc${i}`] = (await prisma.costCenter.create({ data: { companyId: payer.id, code: `${code}-9`, name: code, glAccount: `61${i}0` }, select: { id: true } })).id
  }
}, 600_000)

const runs: string[] = []
async function approvedRun(status = 'APPROVED'): Promise<string> {
  const run = await prisma.paymentRun.create({
    data: {
      companyId: s.payer, currency: s.currency, status, scheduledFor: new Date(), totalCents: s.total,
      createdById: s.finance, approvedById: status === 'APPROVED' ? s.payroll : null,
      items: { create: [{ vendorBillId: s.bill, amountCents: s.total }] },
    },
    select: { id: true },
  })
  runs.push(run.id)
  return run.id
}
const get = async (run: string, extra = '') => json(await lines(req('GET', `/api/ap/receipts-file?run=${run}${extra}`)))
const counts = async () => ({
  payments: await prisma.payment.count({ where: { vendorBillId: s.bill } }),
  paid: (await prisma.vendorBill.findUniqueOrThrow({ where: { id: s.bill }, select: { paidCents: true } })).paidCents,
  items: await prisma.paymentRunItem.count(),
})

describe('the client’s file of the invoice lines it received, as the client’s own AP seat', () => {
  it('a receipt typed in as a total has no line to code, so it is held and named, and nothing is paid', async () => {
    const run = await approvedRun()
    as(PAYROLL)
    const before = await counts()
    const r = await get(run)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.rows).toBe(0)
    expect(r.body.data.held.map((h: any) => h.billId)).toEqual([s.bill])
    expect(r.body.data.says).toContain('no lines')
    expect(await counts()).toEqual(before)
  })

  it('a coded line split across three cost centers is three rows that add to the line to the cent, with no bank details', async () => {
    await prisma.vendorBillLine.create({
      data: { vendorBillId: s.bill, timesheetId: s.week, personId: s.person, hours: s.hours, rateCents: s.rate, amountCents: s.total },
    })
    await prisma.contractCostAllocation.createMany({
      data: [
        { sellContractId: s.contract, costCenterId: s.cc0, shareBps: 3333 },
        { sellContractId: s.contract, costCenterId: s.cc1, shareBps: 3333 },
        { sellContractId: s.contract, costCenterId: s.cc2, shareBps: 3334 },
      ],
    })
    const run = await approvedRun()
    as(PAYROLL)
    const before = await counts()
    const r = await get(run)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.held).toEqual([])
    const [head, ...rows] = parse(r.body.data.csv)
    expect(rows).toHaveLength(3)
    const cents = rows.map((x) => Math.round(Number(x[COL('amount', head)]) * 100))
    expect(cents.reduce((a, b) => a + b, 0)).toBe(s.total)
    expect(rows.map((x) => x[COL('cost_object', head)]).sort()).toEqual(['CC-A-9', 'CC-B-9', 'CC-C-9'])
    expect(rows.every((x) => x[COL('person', head)] === s.personName)).toBe(true)
    expect(rows.every((x) => x[COL('signed_week', head)] === s.week)).toBe(true)
    expect(rows.every((x) => x[COL('supplier_etyme_id', head)] === s.payee)).toBe(true)
    expect(r.body.data.totals).toEqual([expect.objectContaining({ currency: s.currency, minor: s.total })])
    expect(head.join(' ')).not.toMatch(/bank|last4|routing|account_name/)
    // A read: no payment row, no item, no money moved.
    expect(await counts()).toEqual(before)
  })

  it('choosing and ordering columns changes only the columns, and the csv answer is the same file', async () => {
    const run = await approvedRun()
    as(PAYROLL)
    const all = await get(run)
    // A second download of one run no longer repeats its lines, so each reading has its own run.
    const some = await get(await approvedRun(), '&columns=cost_object,amount,supplier_invoice_number')
    expect(some.status).toBe(200)
    expect(parse(some.body.data.csv)[0]).toEqual(['cost_object', 'amount', 'supplier_invoice_number'])
    expect(some.body.data.rows).toBe(all.body.data.rows)
    expect(some.body.data.totals).toEqual(all.body.data.totals)
    const file = await lines(req('GET', `/api/ap/receipts-file?run=${await approvedRun()}&format=csv&columns=amount`))
    expect(file.headers.get('content-type')).toContain('text/csv')
    const bad = await get(await approvedRun(), '&columns=bank_name')
    expect(bad.status).toBe(422)
    expect(bad.body.error.message).toContain('no column called')
  })

  it('a download writes an access row for the person on the lines', async () => {
    const run = await approvedRun()
    as(PAYROLL)
    const before = await prisma.accessLog.count({ where: { subjectId: s.person, allowed: true, action: 'CONTRACT_VIEW' } })
    await get(run)
    expect(await prisma.accessLog.count({ where: { subjectId: s.person, allowed: true, action: 'CONTRACT_VIEW' } })).toBe(before + 1)
  })

  it('a line with no code of the client’s is held and named, and the file does not guess one', async () => {
    await prisma.contractCostAllocation.deleteMany({ where: { sellContractId: s.contract } })
    const run = await approvedRun()
    as(PAYROLL)
    const r = await get(run)
    expect(r.body.data.rows).toBe(0)
    expect(r.body.data.held[0].lineId).not.toBeNull()
    expect(r.body.data.says).toContain('no cost center or order of yours')
  })

  it('a receipt the payment gate refuses is left out of the file with the gate’s own sentence', async () => {
    await prisma.contractCostAllocation.createMany({ data: [{ sellContractId: s.contract, costCenterId: s.cc0, shareBps: 10_000 }] })
    const run = await approvedRun()
    as(PAYROLL)
    expect((await get(run)).body.data.rows).toBe(1)
    await prisma.vendorBill.update({ where: { id: s.bill }, data: { status: 'CANCELLED' } })
    try {
      const r = await get(run)
      expect(r.body.data.rows).toBe(0)
      expect(r.body.data.held[0].billId).toBe(s.bill)
      expect(r.body.data.held[0].says.length).toBeGreaterThan(20)
    } finally {
      await prisma.vendorBill.update({ where: { id: s.bill }, data: { status: 'APPROVED' } })
    }
  })

  it('a draft run is not downloaded, and says who approves it first', async () => {
    const run = await approvedRun('DRAFT')
    as(PAYROLL)
    const r = await get(run)
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('NOT_APPROVED')
  })

  it('the supplier that issued the receipt is told the run is not found, and the refusal is on the access log first', async () => {
    const run = await approvedRun()
    as(s.supplierSeat)
    const before = await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: s.payer, action: 'CONTRACT_VIEW' } })
    const r = await get(run)
    expect([403, 404]).toContain(r.status)
    expect(JSON.stringify(r.body)).not.toContain('CC-A-9')
    expect(await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: s.payer, action: 'CONTRACT_VIEW' } })).toBeGreaterThan(before)
  })

  it('a seat whose role does not release payment runs is refused in a sentence, and it is logged', async () => {
    expect(s.noPaySeat, 'Brightmoor holds a seat that does not release runs').not.toBeNull()
    const run = await approvedRun()
    as(s.noPaySeat)
    const before = await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: s.payer } })
    const r = await get(run)
    expect(r.status).toBe(403)
    expect(await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: s.payer } })).toBeGreaterThan(before)
  })
})
