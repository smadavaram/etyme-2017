import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { POST as generateInvoice } from '@/app/api/invoices/generate/route'
import { GET as invoiceGet } from '@/app/api/invoices/[id]/route'
import { GET as ownBill } from '@/app/api/invoices/[id]/own-bill/route'
import { GET as coding } from '@/app/api/invoices/[id]/coding/route'
import { POST as reserve } from '@/app/api/payroll/reserve/route'
import { POST as payrollRun } from '@/app/api/payroll/run/route'
import { GET as payrollGet } from '@/app/api/payroll/route'
import { GET as commissionsGet } from '@/app/api/payroll/commissions/route'
import { needsVerifiedOwner, PROVE_OWNERSHIP_HREF } from '@/lib/owner-gate'
import { PAY_TO_BEING_CONFIRMED } from '@/lib/money/pay-to-words'

/**
 * Layer 7 money review, second pass, 2026-11-16. Four faults the first
 * pass named, each a way money could leave for the wrong place or
 * without the Owner the rules wait for, walked on the seeded world
 * through the real routes:
 *  1. a bill printed an older checked account while the firm's default
 *     was new and unchecked, so a client could pay the old account;
 *  2. a bench week paid from a reserve, and a reserve settled on leaving,
 *     paid people with no verified Owner;
 *  3. the Payroll page drew Process where the run route refuses it;
 *  4. payroll's refusals said "Paying a firm", and payroll pays people.
 */

const D = '@demo.etyme.local'
const CSI = `world-computer-systems${D}`
const PAYROLL = `world-brightmoor-payroll${D}`
const DAY = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)
const OLD_LAST4 = '5512'
const NEW_LAST4 = '7731'

const s: Record<string, any> = {}

const ownerSeat = (companyId: string) => prisma.context.findFirst({
  where: { companyId, revokedAt: null, role: { name: 'Owner' } },
  orderBy: { id: 'asc' },
  select: { id: true, person: { select: { primaryEmail: true } } },
})

const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeAll(async () => {
  await freshWorld()
  // Helena Marsh's chain, found by its facts: the line Computer Systems
  // bills the client on, and the line her hours are filed on below it.
  const lines = await prisma.sellContract.findMany({
    where: { person: { name: 'Helena Marsh' }, state: 'IN_PROGRESS' },
    select: { id: true, billRate: true, engagementId: true, personId: true, clientCompanyId: true, companyId: true, company: { select: { slug: true } } },
  })
  s.top = lines.find((l) => l.company.slug === 'world-computer-systems')
  s.bottom = lines.find((l) => l.company.slug === 'world-techpeple')
  if (!s.top || !s.bottom) throw new Error('The seeded world holds no chain for Helena Marsh.')
  s.issuer = s.top.companyId

  // One signed week two months ahead, clear of every seeded week.
  const ahead = new Date(Date.now() + 60 * DAY)
  const first = new Date(Date.UTC(ahead.getUTCFullYear(), ahead.getUTCMonth(), 1))
  const monday = new Date(first.getTime() + (((8 - first.getUTCDay()) % 7) * DAY))
  const signer = await prisma.person.findFirstOrThrow({ where: { name: 'Marcus Oyelaran' }, select: { id: true } })
  const days: Record<string, number> = {}
  for (let d = 0; d < 5; d++) days[iso(new Date(monday.getTime() + d * DAY))] = 8
  const ts = await prisma.timesheet.create({
    data: {
      sellContractId: s.bottom.id, personId: s.bottom.personId,
      periodStart: monday, periodEnd: new Date(monday.getTime() + 6 * DAY),
      days, totalHours: 40, status: 'APPROVED', submittedAt: monday, approvedAt: monday,
    },
  })
  await prisma.workAssertion.create({
    data: { timesheetId: ts.id, companyId: s.top.clientCompanyId, role: 'CLIENT_APPROVAL', hours: 40, rateCents: s.top.billRate, state: 'LIVE', byId: signer.id },
  })
  s.week = monday

  // Computer Systems' payment details: an older checked account, and new
  // details made its default that nobody has checked yet.
  await prisma.remitTo.updateMany({ where: { companyId: s.issuer }, data: { isDefault: false } })
  s.old = (await prisma.remitTo.create({
    data: { companyId: s.issuer, legalName: 'Computer Systems LLC', addressLines: [], country: 'US', bankName: 'Bellrock Bank', accountLast4: OLD_LAST4, isDefault: false, verifiedAt: new Date(), verifiedByCompanyId: s.top.clientCompanyId },
    select: { id: true },
  })).id
  s.fresh = (await prisma.remitTo.create({
    data: { companyId: s.issuer, legalName: 'Computer Systems LLC', addressLines: [], country: 'US', bankName: 'Harborline Savings', accountLast4: NEW_LAST4, isDefault: true, enteredAt: new Date() },
    select: { id: true },
  })).id

  const [issuerOwner, payerOwner] = await Promise.all([ownerSeat(s.issuer), ownerSeat(s.top.clientCompanyId)])
  if (!issuerOwner || !payerOwner) throw new Error('The seeded world holds no Owner seat on both sides of Helena’s bill.')
  s.issuerOwner = issuerOwner
  s.payerOwner = payerOwner

  const brightmoor = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
  s.payer = brightmoor.id
}, 600_000)

describe('a bill prints the account a payment goes to, and no other', () => {
  it('a bill raised while the firm’s new default payment details are unchecked prints no account, says they are being confirmed, and never prints the older checked account', async () => {
    as(CSI)
    const r = await json(await generateInvoice(req('POST', '/api/invoices/generate', {
      engagementId: s.top.engagementId, periodStart: iso(s.week), periodEnd: iso(new Date(s.week.getTime() + 6 * DAY)),
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    s.bill = r.body.data.invoice.id as string

    // The record: no account was written on the bill.
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: s.bill }, select: { remitToId: true } })).remitToId).toBeNull()

    // The bill's own page, for the firm that issued it.
    as(s.issuerOwner.person.primaryEmail)
    const page = await json(await invoiceGet(req('GET', `/api/invoices/${s.bill}`, undefined, { 'x-context-id': s.issuerOwner.id }), params(s.bill)))
    expect(page.status, JSON.stringify(page.body)).toBe(200)
    expect(page.body.data.invoice.payToSays).toBe(PAY_TO_BEING_CONFIRMED)

    const own = await json(await ownBill(req('GET', `/api/invoices/${s.bill}/own-bill`, undefined, { 'x-context-id': s.issuerOwner.id }), params(s.bill)))
    expect(own.status, JSON.stringify(own.body)).toBe(200)
    expect(own.body.data.remitTo).toBeNull()
    expect(own.body.data.payToSays).toBe(PAY_TO_BEING_CONFIRMED)

    // And for the client that pays it.
    as(s.payerOwner.person.primaryEmail)
    const coded = await json(await coding(req('GET', `/api/invoices/${s.bill}/coding`, undefined, { 'x-context-id': s.payerOwner.id }), params(s.bill)))
    expect(coded.status, JSON.stringify(coded.body)).toBe(200)
    expect(coded.body.data.remitTo).toBeNull()
    expect(coded.body.data.payToSays).toBe(PAY_TO_BEING_CONFIRMED)

    for (const body of [page.body, own.body, coded.body]) expect(JSON.stringify(body)).not.toContain(OLD_LAST4)
  })

  it('once the new default is checked, the same bill prints the new account and never the older one', async () => {
    await prisma.remitTo.update({ where: { id: s.fresh }, data: { verifiedAt: new Date(), verifiedByCompanyId: s.top.clientCompanyId } })

    as(s.issuerOwner.person.primaryEmail)
    const page = await json(await invoiceGet(req('GET', `/api/invoices/${s.bill}`, undefined, { 'x-context-id': s.issuerOwner.id }), params(s.bill)))
    expect(page.body.data.invoice.payToSays).toBe(`Pay to Computer Systems LLC, Harborline Savings, account ending ${NEW_LAST4}, by ACH.`)

    as(s.payerOwner.person.primaryEmail)
    const coded = await json(await coding(req('GET', `/api/invoices/${s.bill}/coding`, undefined, { 'x-context-id': s.payerOwner.id }), params(s.bill)))
    expect(coded.body.data.remitTo).toMatchObject({ bankName: 'Harborline Savings', accountLast4: NEW_LAST4 })
    expect(Object.keys(coded.body.data.remitTo).sort()).toEqual(['accountLast4', 'addressLines', 'bankName', 'country', 'legalName', 'paymentMethod', 'routingLast4', 'taxId'])

    // A bank change after the bill clears the check, and the bill stops printing the account.
    await prisma.remitTo.update({ where: { id: s.fresh }, data: { verifiedAt: null, verifiedByCompanyId: null } })
    as(s.issuerOwner.person.primaryEmail)
    const after = await json(await invoiceGet(req('GET', `/api/invoices/${s.bill}`, undefined, { 'x-context-id': s.issuerOwner.id }), params(s.bill)))
    expect(after.body.data.invoice.payToSays).toBe(PAY_TO_BEING_CONFIRMED)
    expect(JSON.stringify(after.body)).not.toContain(OLD_LAST4)
  })
})

describe('payroll waits for a verified Owner, in payroll’s own words', () => {
  const withProofRule = async <T>(facts: { ownerProofRequiredAt: Date | null; ownerVerifiedAt: Date | null }, f: () => Promise<T>) => {
    const was = await prisma.company.findUniqueOrThrow({ where: { id: s.payer }, select: { ownerProofRequiredAt: true, ownerVerifiedAt: true } })
    await prisma.company.update({ where: { id: s.payer }, data: facts })
    try {
      return await f()
    } finally {
      await prisma.company.update({ where: { id: s.payer }, data: was })
    }
  }
  const refusedRows = (door: string) =>
    prisma.automationLog.count({ where: { companyId: s.payer, action: 'PAYMENT_REFUSED', payload: { path: ['door'], equals: door } } })

  it('a bench week paid from a reserve and a reserve settled on leaving are refused until the company has a verified Owner, each refusal is kept, and nothing is posted', async () => {
    await withProofRule({ ownerProofRequiredAt: new Date(), ownerVerifiedAt: null }, async () => {
      const company = await prisma.company.findUniqueOrThrow({ where: { id: s.payer }, select: { name: true, ownerProofRequiredAt: true, ownerVerifiedAt: true } })
      const gate = needsVerifiedOwner(company, 'PAY_PEOPLE')
      expect(gate.ok).toBe(false)
      const sentence = (gate as { says: string }).says
      const postings = await prisma.orderPosting.count({ where: { companyId: s.payer, kind: 'RESERVE' } })
      as(PAYROLL)
      for (const [action, door] of [['draw', 'RESERVE_DRAW'], ['exit', 'RESERVE_EXIT']] as const) {
        const before = await refusedRows(door)
        const r = await json(await reserve(req('POST', '/api/payroll/reserve', { action, buyContractId: 'any-line', neededCents: 100_00, reason: 'RELEASED' })))
        expect(r.status, JSON.stringify(r.body)).toBe(403)
        expect(r.body.error).toEqual({ code: 'OWNER_NOT_VERIFIED', message: sentence, href: PROVE_OWNERSHIP_HREF })
        expect(await refusedRows(door)).toBe(before + 1)
      }
      // Holding back a share pays nobody, so it is never held.
      const hold = await json(await reserve(req('POST', '/api/payroll/reserve', { action: 'hold' })))
      expect(hold.body?.error?.code, JSON.stringify(hold.body)).toBe('VALIDATION')
      expect(await prisma.orderPosting.count({ where: { companyId: s.payer, kind: 'RESERVE' } })).toBe(postings)
    })
  })

  it('a company formed before the proof rule draws from a reserve as before', async () => {
    await withProofRule({ ownerProofRequiredAt: null, ownerVerifiedAt: null }, async () => {
      as(PAYROLL)
      const r = await json(await reserve(req('POST', '/api/payroll/reserve', { action: 'draw' })))
      expect(r.status, JSON.stringify(r.body)).toBe(422)
      expect(r.body.error.code).toBe('VALIDATION')
    })
  })

  it('a payroll refusal says paying your people waits, never paying a firm', async () => {
    await withProofRule({ ownerProofRequiredAt: new Date(), ownerVerifiedAt: null }, async () => {
      const name = (await prisma.company.findUniqueOrThrow({ where: { id: s.payer }, select: { name: true } })).name
      as(PAYROLL)
      const r = await json(await payrollRun(req('POST', '/api/payroll/run', { buyContractIds: ['any-line'], action: 'approve' })))
      expect(r.status, JSON.stringify(r.body)).toBe(403)
      expect(r.body.error.message).toBe(`Paying your people waits until ${name} has a verified Owner. Prove ownership under Setup → Prove ownership.`)
      expect(r.body.error.message).not.toMatch(/firm/i)
    })
  })

  it('the Payroll page and Commissions are told payroll waits, with the link to Prove ownership, and are offered no Run while it does', async () => {
    await withProofRule({ ownerProofRequiredAt: new Date(), ownerVerifiedAt: null }, async () => {
      as(PAYROLL)
      const page = await json(await payrollGet(req('GET', `/api/payroll?companyId=${s.payer}`)))
      expect(page.status, JSON.stringify(page.body)).toBe(200)
      expect(page.body.data.payWaits).toMatchObject({ href: PROVE_OWNERSHIP_HREF, linkSays: 'Prove ownership' })
      expect(page.body.data.payWaits.says).toMatch(/^Paying your people waits until /)
      const com = await json(await commissionsGet(req('GET', '/api/payroll/commissions')))
      expect(com.status, JSON.stringify(com.body)).toBe(200)
      expect(com.body.data.mayRun).toBe(false)
      expect(com.body.data.payWaits).toMatchObject({ href: PROVE_OWNERSHIP_HREF })
    })
    await withProofRule({ ownerProofRequiredAt: new Date(), ownerVerifiedAt: new Date() }, async () => {
      as(PAYROLL)
      const page = await json(await payrollGet(req('GET', `/api/payroll?companyId=${s.payer}`)))
      expect(page.body.data.payWaits).toBeNull()
      const com = await json(await commissionsGet(req('GET', '/api/payroll/commissions')))
      expect(com.body.data.mayRun).toBe(true)
      expect(com.body.data.payWaits).toBeNull()
    })
  })
})
