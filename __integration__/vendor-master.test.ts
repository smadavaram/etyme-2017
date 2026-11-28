import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, resetDatabase } from './harness'
import {
  readPayToFor, readCheckedFor, customersToConfirm, bankChangeAnswers, supplierChangedMessageFor, oldChecksReport, carryOverOldChecks,
} from '@/lib/vendor-master-read'
import { bankCheckedBy } from '@/lib/setup-gates'

/**
 * Record 87 (2026-11-17), against Postgres: a supplier chooses which
 * account each customer pays, each customer confirms a change for itself,
 * the "supplier changed" message reads the customer's own vendor number,
 * and the carry-over places old checks only where the record names the
 * payer. Made-up firms on reserved domains.
 */

const s: Record<string, string> = {}
const ON = new Date('2026-01-05T09:00:00Z')

async function firm(slug: string, kind: 'VENDOR' | 'CLIENT', onEtyme = true): Promise<string> {
  const c = await prisma.company.create({
    data: { name: slug, slug, kind, currency: 'USD', domain: `${slug}.example`, ...(onEtyme ? { claimedAt: ON } : {}) },
    select: { id: true },
  })
  return c.id
}
const register = (companyId: string, otherCompanyId: string, relationship: string, status = 'ACTIVE', vendorNumber?: string) =>
  prisma.counterparty.create({ data: { companyId, otherCompanyId, relationship, status, ...(vendorNumber ? { vendorNumber } : {}) } })
const remit = (companyId: string, over: Record<string, unknown> = {}) =>
  prisma.remitTo.create({
    data: { companyId, legalName: 'Northwind Staffing LLC', country: 'US', bankName: 'Bellrock Bank', accountName: 'Northwind Staffing LLC', accountLast4: '4821', routingLast4: '0021', ...over },
    select: { id: true },
  })

beforeAll(async () => {
  await resetDatabase()
  s.supplier = await firm('northwind-staffing', 'VENDOR')
  s.a = await firm('harborline-tech', 'CLIENT')
  s.b = await firm('eastfield-ops', 'CLIENT')
  s.oneSided = await firm('one-sided-client', 'CLIENT')
  s.prospect = await firm('prospect-client', 'CLIENT')
  s.shell = await firm('shell-client', 'CLIENT', false)

  // A by agreement, with its vendor number on its own register row.
  await prisma.masterAgreement.create({ data: { vendorId: s.supplier, clientId: s.a } })
  await register(s.a, s.supplier, 'SUPPLIER', 'ACTIVE', 'V-1001')
  // B by both registers.
  await register(s.supplier, s.b, 'CLIENT')
  await register(s.b, s.supplier, 'SUPPLIER')
  // Neither of these trades.
  await register(s.supplier, s.oneSided, 'CLIENT')
  await register(s.supplier, s.prospect, 'CLIENT', 'PROSPECT')
  await register(s.prospect, s.supplier, 'SUPPLIER', 'PROSPECT')
  await prisma.masterAgreement.create({ data: { vendorId: s.supplier, clientId: s.shell } })

  s.default = (await remit(s.supplier, { isDefault: true, createdAt: new Date('2026-02-01T00:00:00Z') })).id
  s.second = (await remit(s.supplier, { accountLast4: '7730', createdAt: new Date('2026-03-01T00:00:00Z') })).id
  await prisma.remitToChoice.create({ data: { supplierCompanyId: s.supplier, payerCompanyId: s.a, remitToId: s.second } })
}, 600_000)

describe('which account each customer pays', () => {
  it("a supplier's account chosen for one customer is the one that customer pays, and another customer pays the default", async () => {
    expect((await readPayToFor(s.supplier, s.a))?.id).toBe(s.second)
    expect((await readPayToFor(s.supplier, s.b))?.id).toBe(s.default)
  })
})

describe('who confirms a change', () => {
  it("a change to the supplier's bank lists every customer it trades with to confirm it, and no firm it does not trade with", async () => {
    expect(await customersToConfirm(s.supplier)).toEqual([s.a, s.b].sort())
  })

  it("one customer's confirmation never counts for another", async () => {
    const change = await prisma.bankChangeRequest.create({
      data: { companyId: s.supplier, remitToId: s.second, bankName: 'Bellrock Bank', accountName: 'Northwind Staffing LLC', accountLast4: '7730', routingLast4: '0021', paymentMethod: 'ACH' },
      select: { id: true },
    })
    s.change = change.id
    const at = new Date('2026-11-10T15:00:00Z')
    await prisma.bankCheck.create({
      data: {
        remitToId: s.second, payerCompanyId: s.a, bankChangeRequestId: change.id,
        bankName: 'Bellrock Bank', accountName: 'Northwind Staffing LLC', accountLast4: '7730', routingLast4: '0021',
        checkedAt: at, callbackAt: at, callbackOutcome: 'CONFIRMED', callbackNumberSource: 'OWN_RECORDS',
      },
    })
    const answers = await bankChangeAnswers(change.id)
    expect(answers?.find((x) => x.payerId === s.a)).toMatchObject({ state: 'CONFIRMED', payableFrom: new Date('2026-11-13T15:00:00Z') })
    expect(answers?.find((x) => x.payerId === s.b)).toEqual({ payerId: s.b, state: 'WAITING' })

    // The same row read for each payer: A's check is A's alone.
    expect((await readCheckedFor(s.a, s.supplier)).checked).toBe(true)
    expect(await readCheckedFor(s.b, s.supplier)).toEqual({ checked: false, why: 'NOT_CHECKED' })
    expect((await bankCheckedBy(s.a, s.supplier)).checked).toBe(true)
  })

  it('the change message to a customer carries its own vendor number and no full account number', async () => {
    const r = await supplierChangedMessageFor(s.a, s.change)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.message.vendorNumber).toBe('V-1001')
    expect(r.message.accountLast4).toBe('7730')
    expect(Object.keys(r.message)).not.toContain('accountNumber')
    // B has not confirmed and keeps no number: no message.
    expect((await supplierChangedMessageFor(s.b, s.change)).ok).toBe(false)
    // Reading writes nothing.
    expect(await prisma.supplierChangeMessage.count()).toBe(0)
  })
})

describe('the carry-over of old checks', () => {
  beforeAll(async () => {
    const stamped = new Date('2026-10-20T10:00:00Z')
    s.named = (await remit(await firm('named-supplier', 'VENDOR'), { verifiedAt: stamped, verifiedByCompanyId: s.a })).id
    const walked = await firm('walked-supplier', 'VENDOR')
    s.walked = (await remit(walked, { verifiedAt: stamped })).id
    await prisma.supplierRequest.create({
      data: {
        companyId: s.b, name: 'walked-supplier', reason: 'Data engineers', recommendedById: 'someone', token: 'tok-walked-1',
        supplierCompanyId: walked, checklist: [{ key: 'BANK', label: 'Bank details', required: true, by: 'VENDOR', state: 'HELD', at: stamped.toISOString() }],
      },
    })
    s.unplaced = (await remit(await firm('unplaced-supplier', 'VENDOR'), { verifiedAt: stamped })).id
  })

  it('the report says which payer the record names, and which it cannot, writing nothing', async () => {
    const report = await oldChecksReport()
    expect(report.find((r) => r.remitToId === s.named)).toMatchObject({ payerId: s.a, from: 'VERIFIED_BY' })
    expect(report.find((r) => r.remitToId === s.walked)).toMatchObject({ payerId: s.b, from: 'SUPPLIER_WALK' })
    expect(report.find((r) => r.remitToId === s.unplaced)).toMatchObject({ payerId: null, why: 'NO_PAYER_ON_RECORD' })
    expect(await carryOverOldChecks(prisma, { write: false })).toMatchObject({ carried: 0 })
    expect(await prisma.bankCheck.count({ where: { remitToId: { in: [s.named, s.walked, s.unplaced] } } })).toBe(0)
  })

  it('the carry-over gives an old check to the payer the record names, and to no other', async () => {
    await carryOverOldChecks(prisma, { write: true })
    const checks = await prisma.bankCheck.findMany({ where: { remitToId: { in: [s.named, s.walked, s.unplaced] } }, select: { remitToId: true, payerCompanyId: true, callbackOutcome: true } })
    expect(checks.filter((c) => c.remitToId === s.named).map((c) => c.payerCompanyId)).toEqual([s.a])
    expect(checks.filter((c) => c.remitToId === s.walked).map((c) => c.payerCompanyId)).toEqual([s.b])
    expect(checks.filter((c) => c.remitToId === s.unplaced)).toEqual([])
    // No call back is claimed for a carried check.
    expect(checks.every((c) => c.callbackOutcome === null)).toBe(true)
    expect(await prisma.automationLog.count({ where: { action: 'BANK_CHECK_CARRIED_OVER' } })).toBe(2)
  })

  it('the carry-over run twice writes nothing the second time', async () => {
    expect(await carryOverOldChecks(prisma, { write: true })).toMatchObject({ named: 0, carried: 0 })
    expect(await prisma.automationLog.count({ where: { action: 'BANK_CHECK_CARRIED_OVER' } })).toBe(2)
  })
})
