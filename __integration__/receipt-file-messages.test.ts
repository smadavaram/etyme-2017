import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as lines } from '@/app/api/ap/receipts-file/route'
import { POST as answer } from '@/app/api/ap/receipts-file/answer/route'
import { GET as supplierState } from '@/app/api/ap/receipts-file/state/route'
import { PUT as saveColumns, GET as readColumns } from '@/app/api/ap/receipts-file/columns/route'

/**
 * Layer 9, slices 2 and 3, through the real routes as the client's own AP
 * seat and the supplier reading the state: a download is a message per
 * line, a sent line is not sent twice, a rejected line is held until it is
 * fixed, and the answer that comes back marks a receipt paid only through
 * the one confirmation, once.
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
    select: { id: true, totalCents: true, vendorCompanyId: true, currency: true, status: true, buyContract: { select: { supplierSellContractId: true } } },
  })
  Object.assign(s, { bill: bill.id, total: bill.totalCents, payee: bill.vendorCompanyId, currency: bill.currency, billStatus: bill.status })
  const week = await prisma.timesheet.findFirstOrThrow({
    where: { sellContractId: bill.buyContract!.supplierSellContractId!, status: 'APPROVED', sellContract: { clientCompanyId: payer.id } },
    orderBy: { periodStart: 'desc' },
    select: { id: true, personId: true, sellContractId: true, totalHours: true, sellContract: { select: { billRate: true } } },
  })
  Object.assign(s, { week: week.id, person: week.personId, contract: week.sellContractId, rate: week.sellContract.billRate, hours: Number(week.totalHours) })
  s.finance = (await prisma.person.findFirstOrThrow({ where: { primaryEmail: `world-brightmoor-finance${D}` }, select: { id: true } })).id
  s.payroll = (await prisma.person.findFirstOrThrow({ where: { primaryEmail: PAYROLL }, select: { id: true } })).id
  s.supplierSeat = (await prisma.context.findFirstOrThrow({ where: { companyId: s.payee, revokedAt: null }, select: { person: { select: { primaryEmail: true } } } })).person.primaryEmail
  const hr = await prisma.context.findFirst({
    where: { companyId: payer.id, revokedAt: null, person: { primaryEmail: { startsWith: 'world-brightmoor-' } }, NOT: { role: { permissions: { hasSome: ['payments.record', '*'] } } } },
    select: { person: { select: { primaryEmail: true } } },
  })
  s.noPaySeat = hr?.person.primaryEmail ?? null
  s.cc = (await prisma.costCenter.create({ data: { companyId: payer.id, code: 'CC-M-9', name: 'M', glAccount: '6100', profitCenter: 'PC-M' }, select: { id: true } })).id
  const l = await prisma.vendorBillLine.create({
    data: { vendorBillId: s.bill, timesheetId: s.week, personId: s.person, hours: s.hours, rateCents: s.rate, amountCents: s.total },
    select: { id: true },
  })
  s.line = l.id
  await prisma.contractCostAllocation.create({ data: { sellContractId: s.contract, costCenterId: s.cc, shareBps: 10_000 } })
  await prisma.companyCoding.upsert({ where: { companyId: payer.id }, create: { companyId: payer.id, companyCode: '1000' }, update: { companyCode: '1000' } })
}, 600_000)

async function newRun(): Promise<string> {
  const run = await prisma.paymentRun.create({
    data: {
      companyId: s.payer, currency: s.currency, status: 'APPROVED', scheduledFor: new Date(), totalCents: s.total,
      createdById: s.finance, approvedById: s.payroll,
      items: { create: [{ vendorBillId: s.bill, amountCents: s.total }] },
    },
    select: { id: true },
  })
  return run.id
}
const get = async (run: string, extra = '') => json(await lines(req('GET', `/api/ap/receipts-file?run=${run}${extra}`)))
const reply = async (body: Record<string, unknown>) => json(await answer(req('POST', '/api/ap/receipts-file/answer', body)))
const messages = (run: string) => prisma.billFeedMessage.findMany({ where: { runId: run }, orderBy: { createdAt: 'asc' } })
const rowIdOf = (csv: string) => { const [h, r] = parse(csv); return r[h.indexOf('etyme_row_id')] }
const today = () => new Date().toISOString().slice(0, 10)

describe('the file is a message, as the client’s own AP seat', () => {
  it('a line in a sent file is never in the next one, and it is listed as already sent', async () => {
    const run = await newRun()
    as(PAYROLL)
    const first = await get(run)
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    expect(first.body.data.rows).toBe(1)
    const again = await get(run)
    expect(again.body.data.rows).toBe(0)
    expect(again.body.data.alreadySent).toHaveLength(1)
    expect(again.body.data.says).toContain('already sent')
    const rows = await messages(run)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ direction: 'OUT', state: 'SENT', lineId: s.line })
  })

  it('two requests at the same moment make one message per line, and both serve the same line', async () => {
    const run = await newRun()
    as(PAYROLL)
    const [a, b] = await Promise.all([get(run), get(run)])
    expect(await prisma.billFeedMessage.count({ where: { runId: run, direction: 'OUT' } })).toBe(1)
    expect(a.body.data.rows + b.body.data.rows).toBeGreaterThanOrEqual(1)
    expect([a.body.data.rows, b.body.data.rows].every((n) => n === 0 || n === 1)).toBe(true)
  })

  it('the file carries the company code, the profit center and the saved column choice, and a request may override it', async () => {
    const run = await newRun()
    as(PAYROLL)
    const put = json(await saveColumns(req('PUT', '/api/ap/receipts-file/columns', { columns: ['etyme_row_id', 'company_code', 'profit_center', 'amount'] })))
    expect((await put).status).toBe(200)
    expect((await json(await readColumns(req('GET', '/api/ap/receipts-file/columns')))).body.data.columns).toEqual(['etyme_row_id', 'company_code', 'profit_center', 'amount'])
    const f = await get(run)
    const [head, row] = parse(f.body.data.csv)
    expect(head).toEqual(['etyme_row_id', 'company_code', 'profit_center', 'amount'])
    expect(row.slice(1, 3)).toEqual(['1000', 'PC-M'])
    const other = await get(await newRun(), '&columns=amount')
    expect(parse(other.body.data.csv)[0]).toEqual(['amount'])
    const bad = json(await saveColumns(req('PUT', '/api/ap/receipts-file/columns', { columns: ['bank_name'] })))
    expect((await bad).status).toBe(422)
    await saveColumns(req('PUT', '/api/ap/receipts-file/columns', { columns: [] }))
  })

  it('a rejected line is held, the supplier reads the reason, and it can be sent again once fixed', async () => {
    const run = await newRun()
    as(PAYROLL)
    const sent = await get(run, '&columns=etyme_row_id,amount')
    const rowId = rowIdOf(sent.body.data.csv)
    const rejected = await reply({ runId: run, csv: `etyme_row_id,status,reason\r\n${rowId},rejected,Wrong GL account\r\n` })
    expect(rejected.status, JSON.stringify(rejected.body)).toBe(200)
    expect(rejected.body.data.recorded).toBe(1)

    // Held: not in the file, and the page says why in the client's words.
    const held = await get(run)
    expect(held.body.data.rows).toBe(0)
    expect(held.body.data.held[0].says).toContain('Wrong GL account')
    const states = await get(run, '&state=1')
    expect(states.body.data.lines[0].says).toBe('Rejected: Wrong GL account')
    expect(states.body.data.lines[0].canSendAgain).toBe(false)

    // The supplier reads the reason, and no code of the client's.
    as(s.supplierSeat)
    const theirs = json(await supplierState(req('GET', `/api/ap/receipts-file/state?bill=${s.bill}`)))
    const t = await theirs
    expect(t.status).toBe(200)
    expect(t.body.data.lines[0].says).toMatch(/^Rejected by .*’s system: Wrong GL account$/)
    expect(t.body.data.lines[0].next).toContain('AP')
    expect(JSON.stringify(t.body)).not.toMatch(/CC-M-9|6100|PC-M/)

    // Fixed: the receipt changed after the rejection. Now it goes again.
    as(PAYROLL)
    await new Promise((r) => setTimeout(r, 20))
    await prisma.vendorBill.update({ where: { id: s.bill }, data: { status: s.billStatus } })
    expect((await get(run, '&state=1')).body.data.lines[0].canSendAgain).toBe(true)
    const again = await get(run, '&again=1')
    expect(again.body.data.rows).toBe(1)
    const all = await messages(run)
    expect(all.filter((m) => m.direction === 'OUT').map((m) => m.state).sort()).toEqual(['SENT', 'SUPERSEDED'])
    expect(new Set(all.map((m) => m.idempotencyKey)).size).toBe(all.length)
    expect((await get(run, '&again=1')).body.data.rows).toBe(0)
  })

  it('a rejected line is fixed by correcting the coding in place, with no new row added', async () => {
    const run = await newRun()
    as(PAYROLL)
    const sent = await get(run, '&columns=etyme_row_id')
    const rowId = rowIdOf(sent.body.data.csv)
    await reply({ runId: run, csv: `etyme_row_id,status,reason\r\n${rowId},rejected,Wrong GL account\r\n` })
    expect((await get(run, '&state=1')).body.data.lines[0].canSendAgain).toBe(false)
    await new Promise((r) => setTimeout(r, 20))
    await prisma.contractCostAllocation.updateMany({ where: { sellContractId: s.contract, costCenterId: s.cc }, data: { glAccount: '6200' } })
    expect((await get(run, '&state=1')).body.data.lines[0].canSendAgain).toBe(true)
    await prisma.contractCostAllocation.updateMany({ where: { sellContractId: s.contract, costCenterId: s.cc }, data: { glAccount: null } })
  })

  it('an answer row for another company’s receipt is refused and logged', async () => {
    const run = await newRun()
    as(PAYROLL)
    await get(run)
    const other = await prisma.vendorBill.findFirst({ where: { companyId: { not: s.payer } }, select: { id: true, companyId: true } })
    expect(other, 'another company holds an invoice receipt').not.toBeNull()
    const foreign = await prisma.vendorBillLine.create({
      data: { vendorBillId: other!.id, amountCents: 100 }, select: { id: true },
    })
    const before = await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: other!.companyId } })
    const r = await reply({ runId: run, csv: `etyme_line_id,status\r\n${foreign.id},accepted\r\n` })
    expect(r.status).toBe(200)
    expect(r.body.data.recorded).toBe(0)
    expect(r.body.data.refused).toHaveLength(1)
    expect(await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: other!.companyId } })).toBeGreaterThan(before)
    expect(await prisma.billFeedMessage.count({ where: { runId: run, direction: 'IN' } })).toBe(0)
  })

  it('an answer row whose amount differs is refused and nothing is written', async () => {
    const run = await newRun()
    as(PAYROLL)
    const f = await get(run, '&columns=etyme_row_id')
    const rowId = rowIdOf(f.body.data.csv)
    const r = await reply({ runId: run, csv: `etyme_row_id,status,amount\r\n${rowId},accepted,0.01\r\n` })
    expect(r.body.data.refused).toHaveLength(1)
    expect(await prisma.billFeedMessage.count({ where: { runId: run, direction: 'IN' } })).toBe(0)
  })

  it('an accepted answer is recorded once, and the same answer twice changes nothing', async () => {
    const run = await newRun()
    as(PAYROLL)
    const rowId = rowIdOf((await get(run, '&columns=etyme_row_id')).body.data.csv)
    const body = { runId: run, csv: `etyme_row_id,status,reference\r\n${rowId},accepted,DOC-1\r\n` }
    expect((await reply(body)).body.data.recorded).toBe(1)
    const twice = await reply(body)
    expect(twice.body.data.recorded).toBe(0)
    expect(twice.body.data.alreadyRecorded).toBe(1)
    expect(await prisma.billFeedMessage.count({ where: { runId: run, direction: 'IN' } })).toBe(1)
    expect((await get(run, '&state=1')).body.data.lines[0].says).toBe('Accepted by your system')
  })

  it('a seat whose role does not release payment runs cannot record an answer, and it is logged', async () => {
    expect(s.noPaySeat).not.toBeNull()
    const run = await newRun()
    as(s.noPaySeat)
    const before = await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: s.payer } })
    const r = await reply({ runId: run, csv: 'etyme_row_id,status\r\nx,paid\r\n' })
    expect(r.status).toBe(403)
    expect(await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: s.payer } })).toBeGreaterThan(before)
  })

  it('the supplier cannot read the state of another firm’s invoice, and the refusal is logged first', async () => {
    as(s.supplierSeat)
    const other = await prisma.vendorBill.findFirst({ where: { vendorCompanyId: { not: s.payee } }, select: { id: true, vendorCompanyId: true } })
    expect(other).not.toBeNull()
    const before = await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: other!.vendorCompanyId } })
    const r = await json(await supplierState(req('GET', `/api/ap/receipts-file/state?bill=${other!.id}`)))
    expect(r.status).toBe(404)
    expect(await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: other!.vendorCompanyId } })).toBeGreaterThan(before)
  })
})

describe('a paid answer, through the one gate', () => {
  async function resetBill() {
    await prisma.payment.deleteMany({ where: { vendorBillId: s.bill } })
    await prisma.vendorBill.update({ where: { id: s.bill }, data: { paidCents: 0, paidAt: null, status: s.billStatus } })
  }

  it('a paid answer marks the receipt paid once, through the one gate, and the same answer twice changes nothing', async () => {
    const run = await newRun()
    as(PAYROLL)
    const rowId = rowIdOf((await get(run, '&columns=etyme_row_id')).body.data.csv)
    const body = { runId: run, csv: `etyme_row_id,status,reference,paid_on\r\n${rowId},paid,BANK-77,${today()}\r\n` }
    const payments = () => prisma.payment.count({ where: { vendorBillId: s.bill } })
    const before = await payments()
    const r = await reply(body)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.refused, JSON.stringify(r.body)).toEqual([])
    expect(r.body.data.paid).toHaveLength(1)
    expect(await payments()).toBe(before + 1)
    const bill = await prisma.vendorBill.findUniqueOrThrow({ where: { id: s.bill }, select: { paidCents: true, status: true } })
    expect(bill).toMatchObject({ paidCents: s.total, status: 'PAID' })
    const paid = await prisma.billFeedMessage.findFirstOrThrow({ where: { runId: run, direction: 'IN' } })
    expect(paid).toMatchObject({ state: 'PAID', externalRef: 'BANK-77' })
    expect((await get(run, '&state=1')).body.data.lines[0].says).toMatch(/^Paid on .*, ref BANK-77$/)

    const twice = await reply(body)
    expect(twice.body.data.recorded).toBe(0)
    expect(await payments()).toBe(before + 1)
    expect(await prisma.billFeedMessage.count({ where: { runId: run, direction: 'IN' } })).toBe(1)

    // The supplier reads it too.
    as(s.supplierSeat)
    const t = await json(await supplierState(req('GET', `/api/ap/receipts-file/state?bill=${s.bill}`)))
    expect(t.body.data.lines[0].says).toMatch(/^Paid on .*, ref BANK-77$/)
    await resetBill()
  })

  it('a paid row with a future date is refused and no payment is written', async () => {
    const run = await newRun()
    as(PAYROLL)
    const rowId = rowIdOf((await get(run, '&columns=etyme_row_id')).body.data.csv)
    const r = await reply({ runId: run, csv: `etyme_row_id,status,reference,paid_on\r\n${rowId},paid,BANK-1,2099-01-01\r\n` })
    expect(r.body.data.refused).toHaveLength(1)
    expect((await prisma.vendorBill.findUniqueOrThrow({ where: { id: s.bill }, select: { paidCents: true } })).paidCents).toBe(0)
  })

  it('a small system types one line for a receipt it never had a file for, and the existing confirmation pays it', async () => {
    const run = await newRun()
    as(PAYROLL)
    const number = (await prisma.vendorBill.findUniqueOrThrow({ where: { id: s.bill }, select: { number: true } })).number
    const r = await reply({ runId: run, receipt: number, paidOn: today(), reference: 'CHQ-5' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.paid).toHaveLength(1)
    expect((await prisma.vendorBill.findUniqueOrThrow({ where: { id: s.bill }, select: { status: true } })).status).toBe('PAID')
    const again = await reply({ runId: run, receipt: number, paidOn: today(), reference: 'CHQ-5' })
    expect(again.body.data.refused[0].says).toContain('already paid')
    await resetBill()
  })
})

describe('the supplier reads its own bill’s lines, found by the number the client keyed', () => {
  async function ownBill() {
    const inv = await prisma.invoice.findFirst({
      where: { engagement: { msa: { vendorId: s.payee, clientId: s.payer } }, status: { not: 'DRAFT' } },
      select: { id: true, number: true },
    })
    return inv
  }
  it('the supplier reads that a line was sent, with the client’s name and the day, and never the client’s codes', async () => {
    const inv = await ownBill()
    expect(inv, 'a seeded bill from the supplier to the payer').not.toBeNull()
    const was = (await prisma.vendorBill.findUniqueOrThrow({ where: { id: s.bill }, select: { number: true } })).number
    await prisma.billFeedMessage.deleteMany({ where: { vendorBillId: s.bill } })
    await prisma.vendorBill.update({ where: { id: s.bill }, data: { number: inv!.number } })
    try {
      as(s.supplierSeat)
      const before = await json(await supplierState(req('GET', `/api/ap/receipts-file/state?invoice=${inv!.id}`)))
      expect(before.status, JSON.stringify(before.body)).toBe(200)
      expect(before.body.data.lines[0].says).toBe('Not sent yet')

      const run = await newRun()
      as(PAYROLL)
      expect((await get(run)).status).toBe(200)
      as(s.supplierSeat)
      const sent = await json(await supplierState(req('GET', `/api/ap/receipts-file/state?invoice=${inv!.id}`)))
      expect(sent.body.data.lines[0].says).toMatch(/^Sent to .+’s system on /)
      expect(sent.body.data.lines[0].says).toContain(sent.body.data.client)
      expect(JSON.stringify(sent.body)).not.toMatch(/CC-M-9|"glAccount"|PC-M|"companyCode"|"profitCenter"/)
    } finally {
      await prisma.vendorBill.update({ where: { id: s.bill }, data: { number: was } })
    }
  })
  it('a bill the client has not keyed reads Not sent yet, and another firm’s bill is refused as missing', async () => {
    const other = await prisma.invoice.findFirst({ where: { engagement: { msa: { vendorId: { not: s.payee } } } }, select: { id: true } })
    expect(other).not.toBeNull()
    as(s.supplierSeat)
    const r = await json(await supplierState(req('GET', `/api/ap/receipts-file/state?invoice=${other!.id}`)))
    expect(r.status).toBe(404)
  })
})

describe('a seat in the client’s program records the answer under the client’s book, where the client’s role pays', () => {
  const APTIVA = `world-aptiva${D}`
  async function seatWith(roleId: string) {
    const office = { id: (await prisma.context.findFirstOrThrow({ where: { person: { primaryEmail: APTIVA }, revokedAt: null }, select: { companyId: true } })).companyId! }
    return prisma.programSeat.create({
      data: { clientCompanyId: s.payer, officeCompanyId: office.id, roleId, grantedById: s.finance, reason: 'Runs the program for the payer' },
      select: { id: true },
    })
  }
  const roleOf = async (personId: string) => (await prisma.context.findFirstOrThrow({ where: { personId, companyId: s.payer, revokedAt: null }, select: { roleId: true } })).roleId!

  it('an MSP seat whose client role records payments marks the receipt paid in the client’s book, once, and the record names the seat', async () => {
    const seat = await seatWith(await roleOf(s.payroll))
    try {
      const run = await newRun()
      as(APTIVA)
      const number = (await prisma.vendorBill.findUniqueOrThrow({ where: { id: s.bill }, select: { number: true } })).number
      const r = await json(await answer(req('POST', `/api/ap/receipts-file/answer?clientCompanyId=${s.payer}`, { runId: run, receipt: number, paidOn: today(), reference: 'SEAT-1' })))
      expect(r.status, JSON.stringify(r.body)).toBe(200)
      expect(r.body.data.paid, JSON.stringify(r.body)).toHaveLength(1)
      const pay = await prisma.payment.findFirstOrThrow({ where: { vendorBillId: s.bill }, select: { payerCompanyId: true, appliedBy: { select: { name: true } } } })
      expect(pay.payerCompanyId).toBe(s.payer)
      const bill = await prisma.vendorBill.findUniqueOrThrow({ where: { id: s.bill }, select: { status: true } })
      expect(bill.status).toBe('PAID')
    } finally {
      await prisma.payment.deleteMany({ where: { vendorBillId: s.bill } })
      await prisma.vendorBill.update({ where: { id: s.bill }, data: { paidCents: 0, paidAt: null, status: s.billStatus } })
      await prisma.programSeat.delete({ where: { id: seat.id } }).catch(() => {})
    }
  })

  it('an MSP seat whose client role does not record payments is refused, logged, and nothing is paid', async () => {
    expect(s.noPaySeat).not.toBeNull()
    const noPay = await prisma.person.findFirstOrThrow({ where: { primaryEmail: s.noPaySeat }, select: { id: true } })
    const seat = await seatWith(await roleOf(noPay.id))
    try {
      const run = await newRun()
      as(APTIVA)
      const before = await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: s.payer } })
      const number = (await prisma.vendorBill.findUniqueOrThrow({ where: { id: s.bill }, select: { number: true } })).number
      const r = await json(await answer(req('POST', `/api/ap/receipts-file/answer?clientCompanyId=${s.payer}`, { runId: run, receipt: number, paidOn: today(), reference: 'SEAT-2' })))
      expect(r.status).toBe(403)
      expect(await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: s.payer } })).toBeGreaterThan(before)
      expect(await prisma.payment.count({ where: { vendorBillId: s.bill } })).toBe(0)
    } finally {
      await prisma.programSeat.delete({ where: { id: seat.id } }).catch(() => {})
    }
  })
})
