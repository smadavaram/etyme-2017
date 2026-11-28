import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, resetDatabase } from './harness'
import { mayPayFirmFor } from '@/lib/money/pay-gate'
import { payToOnBillFor, payToRowsFor } from '@/lib/money/pay-to'
import { checkPayeeBank } from '@/lib/money/bank-check-read'

/**
 * Records 86 and 87 against Postgres: each customer pays the account the
 * supplier chose for it, and only on its own confirmation; a bank change
 * waits for this customer's call back and 72 hours after it; a bill
 * prints only what its payer may pay; and the check a customer makes is
 * its own. Made-up firms on reserved domains.
 */

const s: Record<string, string> = {}
const ON = new Date('2026-01-05T09:00:00Z')
const H = 60 * 60 * 1000

async function firm(slug: string, kind: 'VENDOR' | 'CLIENT'): Promise<string> {
  const c = await prisma.company.create({
    data: { name: slug, slug, kind, currency: 'USD', domain: `${slug}.example`, claimedAt: ON },
    select: { id: true },
  })
  return c.id
}
const FACTS = { bankName: 'Bellrock Bank', accountName: 'Northwind Staffing LLC', routingLast4: '0021' }
const remit = (companyId: string, accountLast4: string, over: Record<string, unknown> = {}) =>
  prisma.remitTo.create({ data: { companyId, legalName: 'Northwind Staffing LLC', country: 'US', ...FACTS, accountLast4, ...over }, select: { id: true } })
const ownCheck = (remitToId: string, payerCompanyId: string, accountLast4: string, over: Record<string, unknown> = {}) =>
  prisma.bankCheck.create({ data: { remitToId, payerCompanyId, ...FACTS, accountLast4, ...over } })
async function financeSeat(companyId: string, name: string): Promise<string> {
  const role = await prisma.role.create({ data: { companyId, name: 'Finance', permissions: ['payments.record'] }, select: { id: true } })
  const person = await prisma.person.create({ data: { name, primaryEmail: `${name.split(' ')[0].toLowerCase()}@${companyId}.example` }, select: { id: true } })
  await prisma.context.create({ data: { personId: person.id, companyId, type: 'EMPLOYEE', roleId: role.id } })
  return person.id
}

beforeAll(async () => {
  await resetDatabase()
  s.supplier = await firm('northwind-staffing', 'VENDOR')
  s.a = await firm('harborline-tech', 'CLIENT')
  s.b = await firm('eastfield-ops', 'CLIENT')
  s.aFinance = await financeSeat(s.a, 'Imelda Santoro')
  s.bFinance = await financeSeat(s.b, 'Rosalind Tay')
}, 600_000)

describe('which account, and whose confirmation', () => {
  beforeAll(async () => {
    s.default = (await remit(s.supplier, '4821', { isDefault: true, createdAt: new Date('2026-02-01T00:00:00Z') })).id
    s.second = (await remit(s.supplier, '7730', { createdAt: new Date('2026-03-01T00:00:00Z') })).id
    await prisma.remitToChoice.create({ data: { supplierCompanyId: s.supplier, payerCompanyId: s.a, remitToId: s.second } })
    await ownCheck(s.second, s.a, '7730')
    await ownCheck(s.default, s.b, '4821')
  })

  it('a customer pays the account the supplier chose for it, and another customer pays the default', async () => {
    expect(await mayPayFirmFor(s.a, s.supplier)).toEqual({ ok: true })
    expect(await mayPayFirmFor(s.b, s.supplier)).toEqual({ ok: true })
    expect((await payToOnBillFor(s.supplier, s.a)).row?.accountLast4).toBe('7730')
    expect((await payToOnBillFor(s.supplier, s.b)).row?.accountLast4).toBe('4821')
    expect((await payToRowsFor(s.a, [s.supplier])).get(s.supplier)?.id).toBe(s.second)
    expect((await payToRowsFor(s.b, [s.supplier])).get(s.supplier)?.id).toBe(s.default)
  })

  it("one customer's confirmation never lets another customer pay", async () => {
    // B confirmed the default, which A does not pay; A's check is moved off.
    await prisma.bankCheck.deleteMany({ where: { remitToId: s.second, payerCompanyId: s.a } })
    const held = await mayPayFirmFor(s.a, s.supplier)
    expect(held).toMatchObject({ ok: false, step: 'BANK' })
    if (!held.ok) expect(held.says).toContain('Imelda Santoro checks them before anybody pays')
    expect((await payToOnBillFor(s.supplier, s.a)).row).toBeNull()
    expect((await payToRowsFor(s.a, [s.supplier])).has(s.supplier)).toBe(false)
    expect(await mayPayFirmFor(s.b, s.supplier)).toEqual({ ok: true })
  })
})

describe('a bank change', () => {
  it('a bank change holds payment until this customer confirms it and for 72 hours after', async () => {
    const sup = await firm('harbor-supplier', 'VENDOR')
    const row = (await remit(sup, '1188', { isDefault: true })).id
    await ownCheck(row, s.a, '1188')
    await ownCheck(row, s.b, '1188')
    expect(await mayPayFirmFor(s.a, sup)).toEqual({ ok: true })

    const change = await prisma.bankChangeRequest.create({
      data: { companyId: sup, remitToId: row, ...FACTS, accountLast4: '1188', beforeAccountLast4: '0001', enteredAt: new Date() },
      select: { id: true },
    })
    const waiting = await mayPayFirmFor(s.a, sup)
    expect(waiting).toMatchObject({ ok: false, step: 'BANK' })
    if (!waiting.ok) expect(waiting.says).toContain('Imelda Santoro confirms the change with a call back. Payment opens 72 hours after that call back.')
    expect((await payToOnBillFor(sup, s.a)).row).toBeNull()
    // The plain check cannot confirm a change: it says the call back.
    const plain = await checkPayeeBank({ payer: { id: s.a, name: 'Harborline Tech' }, payee: { id: sup, name: 'Harbor Supplier' }, by: { personId: s.aFinance, name: 'Imelda Santoro' } })
    expect(plain).toMatchObject({ ok: false, code: 'CHANGE_WAITS' })

    const callback = new Date()
    await prisma.bankCheck.update({
      where: { remitToId_payerCompanyId: { remitToId: row, payerCompanyId: s.a } },
      data: { bankChangeRequestId: change.id, callbackAt: callback, callbackOutcome: 'CONFIRMED', callbackNumberSource: 'OWN_RECORDS', checkedAt: callback },
    })
    const cooling = await mayPayFirmFor(s.a, sup, prisma, new Date(callback.getTime() + 71 * H))
    expect(cooling).toMatchObject({ ok: false, step: 'BANK' })
    if (!cooling.ok) expect(cooling.says).toContain('72 hours after the call back')
    expect(await mayPayFirmFor(s.a, sup, prisma, new Date(callback.getTime() + 72 * H))).toEqual({ ok: true })
    expect((await payToOnBillFor(sup, s.a, prisma, new Date(callback.getTime() + 72 * H))).row?.accountLast4).toBe('1188')
    // B never confirmed the change.
    expect(await mayPayFirmFor(s.b, sup, prisma, new Date(callback.getTime() + 72 * H))).toMatchObject({ ok: false })
  })
})

describe('what a bill prints', () => {
  it('a bill prints the account its payer pays, only once that payer confirmed it', async () => {
    const sup = await firm('bill-supplier', 'VENDOR')
    const row = (await remit(sup, '5512', { isDefault: true, paymentMethod: 'ACH' })).id
    expect(await payToOnBillFor(sup, s.a)).toEqual({ row: null, entered: true })
    await ownCheck(row, s.b, '5512')
    // B's confirmation prints for B and never for A.
    expect((await payToOnBillFor(sup, s.b)).row?.accountLast4).toBe('5512')
    expect(await payToOnBillFor(sup, s.a)).toEqual({ row: null, entered: true })
    // A bill with no payer known prints no account.
    expect(await payToOnBillFor(sup, null)).toEqual({ row: null, entered: true })
  })
})

describe('old checks', () => {
  it('a supplier checked before today by a named customer is still paid by that customer', async () => {
    const sup = await firm('checked-earlier', 'VENDOR')
    await remit(sup, '6604', { isDefault: true, verifiedAt: new Date('2026-10-20T10:00:00Z'), verifiedByCompanyId: s.a })
    expect(await mayPayFirmFor(s.a, sup)).toEqual({ ok: true })
    expect((await payToOnBillFor(sup, s.a)).row?.accountLast4).toBe('6604')
    expect(await mayPayFirmFor(s.b, sup)).toMatchObject({ ok: false, step: 'BANK' })
  })

  it('an old check that names no customer lets nobody pay until that customer checks the details itself', async () => {
    const sup = await firm('checked-by-nobody', 'VENDOR')
    await remit(sup, '6605', { isDefault: true, verifiedAt: new Date('2026-10-20T10:00:00Z') })
    expect(await mayPayFirmFor(s.a, sup)).toMatchObject({ ok: false, step: 'BANK' })
    expect(await mayPayFirmFor(s.b, sup)).toMatchObject({ ok: false, step: 'BANK' })
    const done = await checkPayeeBank({ payer: { id: s.a, name: 'Harborline Tech' }, payee: { id: sup, name: 'Checked By Nobody' }, by: { personId: s.aFinance, name: 'Imelda Santoro' } })
    expect(done.ok).toBe(true)
    expect(await mayPayFirmFor(s.a, sup)).toEqual({ ok: true })
    expect(await mayPayFirmFor(s.b, sup)).toMatchObject({ ok: false })
  })

  it("checking a supplier's bank details records the check as this customer's own, and leaves another customer's earlier check standing", async () => {
    const sup = await firm('two-payers', 'VENDOR')
    const row = (await remit(sup, '6606', { isDefault: true, verifiedAt: new Date('2026-10-20T10:00:00Z'), verifiedByCompanyId: s.a })).id
    const r = await checkPayeeBank({ payer: { id: s.b, name: 'Eastfield Ops' }, payee: { id: sup, name: 'Two Payers' }, by: { personId: s.bFinance, name: 'Rosalind Tay' } })
    expect(r.ok).toBe(true)
    expect(await prisma.bankCheck.findMany({ where: { remitToId: row }, select: { payerCompanyId: true, accountLast4: true, checkedById: true } }))
      .toEqual([{ payerCompanyId: s.b, accountLast4: '6606', checkedById: s.bFinance }])
    expect(await prisma.remitTo.findUnique({ where: { id: row }, select: { verifiedByCompanyId: true } })).toEqual({ verifiedByCompanyId: s.a })
    expect(await mayPayFirmFor(s.a, sup)).toEqual({ ok: true })
    expect(await mayPayFirmFor(s.b, sup)).toEqual({ ok: true })
    // A second check by B is refused: it already stands.
    expect(await checkPayeeBank({ payer: { id: s.b, name: 'Eastfield Ops' }, payee: { id: sup, name: 'Two Payers' }, by: { personId: s.bFinance, name: 'Rosalind Tay' } }))
      .toMatchObject({ ok: false, code: 'ALREADY_CHECKED' })
  })
})
