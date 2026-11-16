import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as runsGet, PATCH as runs } from '@/app/api/ap/payment-runs/route'
import { POST as remitPost, PATCH as remitPatch } from '@/app/api/settings/remit-to/route'
import { POST as payrollRun } from '@/app/api/payroll/run/route'
import { POST as offCycle } from '@/app/api/payroll/off-cycle/route'
import { POST as commissionRun } from '@/app/api/payroll/commissions/route'
import { mayPayFirm, bankNotChecked, bankCheckerNamesAt } from '@/lib/setup-gates'
import { mayPayKeyedReceipt } from '@/lib/money/keyed-receipt'
import { checkPayeeBank } from '@/lib/money/bank-check-read'
import { needsVerifiedOwner } from '@/lib/owner-gate'

/**
 * Layer 7 money review, 2026-11-16, on the seeded world through the real
 * routes. A miss here pays the wrong account, so each fault is walked as
 * it happened:
 *  1. a firm makes new, unchecked bank details its default while older
 *     ones stand checked: the gate, the payment run and its file read the
 *     new ones, and hold until they are checked;
 *  2. a waived bank item on a supplier walk checks nothing;
 *  3. every act that pays waits for a verified Owner, payroll included,
 *     and a company formed before the proof rule (as Tapin was) is not
 *     held;
 *  4. a bank change never says the activity log can undo it.
 */

const D = '@demo.etyme.local'
const PAYROLL = `world-brightmoor-payroll${D}`
const FINANCE = `world-brightmoor-finance${D}`

const s: Record<string, any> = {}

const refusedRows = (companyId: string, door: string) =>
  prisma.automationLog.count({ where: { companyId, action: 'PAYMENT_REFUSED', payload: { path: ['door'], equals: door } } })

beforeAll(async () => {
  await freshWorld()
  const brightmoor = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true, name: true } })
  s.payer = brightmoor.id
  // Found by their facts: an open typed-in receipt at Brightmoor that the
  // payment gate passes today.
  const open = await prisma.vendorBill.findMany({
    where: { companyId: brightmoor.id, status: { in: ['RECEIVED', 'APPROVED'] }, paidCents: 0 },
    select: { id: true, vendorCompanyId: true, currency: true, totalCents: true },
    orderBy: { createdAt: 'asc' },
  })
  for (const b of open) {
    if (!(await mayPayKeyedReceipt(b.id))?.ok) continue
    Object.assign(s, { bill: b.id, payee: b.vendorCompanyId, currency: b.currency, owed: b.totalCents })
    break
  }
  if (!s.bill) throw new Error('The seeded world holds no payable typed-in receipt at Brightmoor.')
  // A seat at Brightmoor that may change Brightmoor's own payment details.
  const seat = await prisma.context.findFirst({
    where: { companyId: brightmoor.id, revokedAt: null, role: { permissions: { has: 'settings.manage' } } },
    select: { person: { select: { primaryEmail: true } } },
    orderBy: { grantedAt: 'asc' },
  })
  if (!seat) throw new Error('Brightmoor holds no seat that changes its own payment details.')
  s.settingsSeat = seat.person.primaryEmail
  s.payeeName = (await prisma.company.findUniqueOrThrow({ where: { id: s.payee }, select: { name: true } })).name
  const [finance, payroll] = await Promise.all([
    prisma.person.findFirstOrThrow({ where: { primaryEmail: FINANCE }, select: { id: true, name: true } }),
    prisma.person.findFirstOrThrow({ where: { primaryEmail: PAYROLL }, select: { id: true } }),
  ])
  s.finance = finance
  s.payroll = payroll
}, 600_000)

/** An approved run paying the receipt, assembled by Finance and approved by Payroll. */
async function approvedRun(): Promise<string> {
  const run = await prisma.paymentRun.create({
    data: {
      companyId: s.payer, currency: s.currency, status: 'APPROVED', scheduledFor: new Date(), totalCents: s.owed,
      createdById: s.finance.id, approvedById: s.payroll.id,
      items: { create: [{ vendorBillId: s.bill, amountCents: s.owed }] },
    },
    select: { id: true },
  })
  return run.id
}

async function dropRun(id: string) {
  await prisma.paymentRunItem.deleteMany({ where: { runId: id } })
  await prisma.paymentRun.delete({ where: { id } })
}

describe('a payment goes to the bank that was checked, and only there', () => {
  it('a supplier that makes new, unchecked bank details its default is not paid on its older checked ones, until the new ones are checked', async () => {
    const before = await prisma.remitTo.findMany({ where: { companyId: s.payee }, select: { id: true, isDefault: true } })
    expect(await mayPayFirm(s.payer, s.payee)).toEqual({ ok: true })

    // The supplier adds new details and makes them its default, as
    // Settings → Payment details writes them: the old default loses the
    // flag and keeps its check, the new one has none.
    await prisma.remitTo.updateMany({ where: { companyId: s.payee, isDefault: true }, data: { isDefault: false } })
    const fresh = (await prisma.remitTo.create({
      data: { companyId: s.payee, legalName: `${s.payeeName} LLC`, addressLines: [], country: 'US', paymentMethod: 'ACH', bankName: 'Harborline Savings', accountLast4: '7731', isDefault: true, enteredAt: new Date() },
      select: { id: true },
    })).id
    expect(await prisma.remitTo.count({ where: { companyId: s.payee, verifiedAt: { not: null } } })).toBeGreaterThan(0)
    let run: string | null = null
    try {
      // The gate reads the new default, never the older checked row.
      const says = bankNotChecked(s.payeeName, await bankCheckerNamesAt(s.payer))
      expect(await mayPayFirm(s.payer, s.payee)).toEqual({ ok: false, says, step: 'BANK' })
      expect(await mayPayKeyedReceipt(s.bill)).toMatchObject({ ok: false })

      // The run's file leaves the receipt out, and prints no older bank in its place.
      run = await approvedRun()
      as(PAYROLL)
      const file = await json(await runsGet(req('GET', `/api/ap/payment-runs?export=${run}`)))
      expect(file.status, JSON.stringify(file.body)).toBe(200)
      expect(file.body.data.rows).toBe(0)
      expect(file.body.data.held.map((h: any) => h.billId)).toEqual([s.bill])

      // Marked paid, the run is refused, nothing is paid, and the refusal is kept.
      const payments = await prisma.payment.count({ where: { vendorBillId: s.bill } })
      const logged = await refusedRows(s.payer, 'RUN_RELEASE')
      const paid = await json(await runs(req('PATCH', '/api/ap/payment-runs', { action: 'pay', id: run, reference: 'ACH-NEW-BANK', paidOn: new Date().toISOString().slice(0, 10) })))
      expect(paid.status, JSON.stringify(paid.body)).toBe(409)
      expect(paid.body.error.code).toBe('BANK_NOT_CHECKED')
      expect(paid.body.error.message).toMatch(/^This run is not released\. .*Bank details not checked/)
      expect(await prisma.payment.count({ where: { vendorBillId: s.bill } })).toBe(payments)
      expect(await refusedRows(s.payer, 'RUN_RELEASE')).toBe(logged + 1)

      // Finance checks from the receipt, and the check lands on the new default, the row the gate reads.
      const checked = await checkPayeeBank({ payer: { id: s.payer, name: 'Brightmoor' }, payee: { id: s.payee, name: s.payeeName }, by: { personId: s.finance.id, name: s.finance.name } })
      expect(checked, JSON.stringify(checked)).toMatchObject({ ok: true })
      expect((await prisma.remitTo.findUniqueOrThrow({ where: { id: fresh } })).verifiedAt).not.toBeNull()
      expect(await mayPayFirm(s.payer, s.payee)).toEqual({ ok: true })

      // And the file now prints the new bank, the one that was checked.
      const again = await json(await runsGet(req('GET', `/api/ap/payment-runs?export=${run}`)))
      expect(again.body.data.rows).toBe(1)
      expect(again.body.data.csv).toContain('7731')
    } finally {
      if (run) await dropRun(run)
      await prisma.remitTo.delete({ where: { id: fresh } })
      for (const r of before) await prisma.remitTo.update({ where: { id: r.id }, data: { isDefault: r.isDefault } })
    }
    expect(await mayPayFirm(s.payer, s.payee)).toEqual({ ok: true })
  })

  it('a waived bank item on the supplier walk never counts as checked, and a held one counts only where the firm has no payment details on Etyme', async () => {
    const firm = await prisma.company.create({
      data: { name: 'Northwind Staffing', slug: `northwind-staffing-${Date.now()}`, kind: 'VENDOR', currency: 'USD', isDemo: true } as any,
      select: { id: true },
    })
    const walk = await prisma.supplierRequest.create({
      data: {
        companyId: s.payer, name: 'Northwind Staffing', reason: 'Bank paid by check this quarter.', recommendedById: s.finance.id,
        state: 'IN_REVIEW', stage: 'FINANCE', decisions: [] as unknown as object,
        checklist: [{ key: 'BANK', state: 'WAIVED', note: 'Paid by check this quarter.' }] as unknown as object,
        token: `waived-${Date.now()}-${Math.random().toString(36).slice(2)}`, firmCompanyId: firm.id,
      } as any,
      select: { id: true },
    })
    try {
      expect(await mayPayFirm(s.payer, firm.id)).toMatchObject({ ok: false, step: 'BANK' })
      await prisma.supplierRequest.update({ where: { id: walk.id }, data: { checklist: [{ key: 'BANK', state: 'HELD' }] as unknown as object } })
      expect(await mayPayFirm(s.payer, firm.id)).toEqual({ ok: true })
      // Once the firm has details on Etyme, those details decide, and nobody checked them.
      await prisma.remitTo.create({ data: { companyId: firm.id, legalName: 'Northwind Staffing LLC', addressLines: [], country: 'US', bankName: 'Bellrock Bank', accountLast4: '4410', isDefault: true } })
      expect(await mayPayFirm(s.payer, firm.id)).toMatchObject({ ok: false, step: 'BANK' })
    } finally {
      await prisma.supplierRequest.delete({ where: { id: walk.id } })
      await prisma.remitTo.deleteMany({ where: { companyId: firm.id } })
      await prisma.company.delete({ where: { id: firm.id } })
    }
  })

  it('a bank change saved in Settings never says the activity log can undo it', async () => {
    as(s.settingsSeat)
    const added = await json(await remitPost(req('POST', '/api/settings/remit-to', { legalName: 'Brightmoor LLC', bankName: 'Harborline Savings', accountLast4: '8812' })))
    expect(added.status, JSON.stringify(added.body)).toBe(201)
    const id = added.body.data.remitTo.id as string
    try {
      const changed = await json(await remitPatch(req('PATCH', '/api/settings/remit-to', { id, bankName: 'Harborline Credit Union' })))
      expect(changed.status, JSON.stringify(changed.body)).toBe(200)
      const rows = await prisma.automationLog.findMany({
        where: { companyId: s.payer, action: { in: ['REMIT_TO_ADDED', 'REMIT_TO_CHANGED'] }, payload: { path: ['remitToId'], equals: id } },
        select: { action: true, reversible: true },
      })
      expect(rows.map((r) => r.action).sort()).toEqual(['REMIT_TO_ADDED', 'REMIT_TO_CHANGED'])
      expect(rows.every((r) => r.reversible === false)).toBe(true)
    } finally {
      await prisma.remitTo.delete({ where: { id } })
    }
  })
})

describe('every act that pays waits for a verified Owner', () => {
  const withProofRule = async <T>(facts: { ownerProofRequiredAt: Date | null; ownerVerifiedAt: Date | null }, f: () => Promise<T>) => {
    const was = await prisma.company.findUniqueOrThrow({ where: { id: s.payer }, select: { ownerProofRequiredAt: true, ownerVerifiedAt: true } })
    await prisma.company.update({ where: { id: s.payer }, data: facts })
    try {
      return await f()
    } finally {
      await prisma.company.update({ where: { id: s.payer }, data: was })
    }
  }

  const draftRun = async () => (await prisma.paymentRun.create({
    data: {
      companyId: s.payer, currency: s.currency, status: 'DRAFT', scheduledFor: new Date(), totalCents: s.owed, createdById: s.finance.id,
      items: { create: [{ vendorBillId: s.bill, amountCents: s.owed }] },
    },
    select: { id: true },
  })).id

  it('approving a payment run, approving or marking payroll paid, off-cycle pay and a commission run are refused in the gate’s sentence until the company has a verified Owner, and each refusal is kept', async () => {
    await withProofRule({ ownerProofRequiredAt: new Date(), ownerVerifiedAt: null }, async () => {
      const says = needsVerifiedOwner(await prisma.company.findUniqueOrThrow({ where: { id: s.payer }, select: { name: true, ownerProofRequiredAt: true, ownerVerifiedAt: true } }), 'PAY')
      expect(says.ok).toBe(false)
      const sentence = (says as { says: string }).says
      const payrollRows = await prisma.automationLog.count({ where: { companyId: s.payer, action: { in: ['PAYROLL_RUN', 'PAYROLL_OFF_CYCLE'] } } })
      as(PAYROLL)

      const run = await draftRun()
      try {
        const approve = await json(await runs(req('PATCH', '/api/ap/payment-runs', { action: 'approve', id: run })))
        expect(approve.status, JSON.stringify(approve.body)).toBe(403)
        expect(approve.body.error).toMatchObject({ code: 'OWNER_NOT_VERIFIED', message: sentence, href: '/dashboard/settings/setup/ownership' })
        expect((await prisma.paymentRun.findUniqueOrThrow({ where: { id: run } })).status).toBe('DRAFT')
        expect(await refusedRows(s.payer, 'RUN_APPROVE')).toBe(1)
      } finally {
        await dropRun(run)
      }

      for (const [action, door] of [['approve', 'PAYROLL_APPROVE'], ['process', 'PAYROLL_PROCESS']] as const) {
        const r = await json(await payrollRun(req('POST', '/api/payroll/run', { buyContractIds: ['any-line'], action })))
        expect(r.status, JSON.stringify(r.body)).toBe(403)
        expect(r.body.error).toMatchObject({ code: 'OWNER_NOT_VERIFIED', message: sentence })
        expect(await refusedRows(s.payer, door)).toBe(1)
      }
      const off = await json(await offCycle(req('POST', '/api/payroll/off-cycle', {})))
      expect(off.status, JSON.stringify(off.body)).toBe(403)
      expect(off.body.error).toMatchObject({ code: 'OWNER_NOT_VERIFIED', message: sentence })
      expect(await refusedRows(s.payer, 'PAYROLL_OFF_CYCLE')).toBe(1)
      const com = await json(await commissionRun(req('POST', '/api/payroll/commissions', {})))
      expect(com.status, JSON.stringify(com.body)).toBe(403)
      expect(com.body.error).toMatchObject({ code: 'OWNER_NOT_VERIFIED', message: sentence })
      expect(await refusedRows(s.payer, 'COMMISSION_RUN')).toBe(1)

      // Working the figures out pays nobody, so it is never held.
      const calc = await json(await payrollRun(req('POST', '/api/payroll/run', { buyContractIds: ['any-line'], action: 'calculate' })))
      expect(calc.body?.error?.code).not.toBe('OWNER_NOT_VERIFIED')
      // Nothing was paid.
      expect(await prisma.automationLog.count({ where: { companyId: s.payer, action: { in: ['PAYROLL_RUN', 'PAYROLL_OFF_CYCLE'] } } })).toBe(payrollRows)
    })
  })

  it('a company formed before the proof rule, as Tapin was, and a company whose Owner is verified, approve and run payroll as before', async () => {
    for (const facts of [{ ownerProofRequiredAt: null, ownerVerifiedAt: null }, { ownerProofRequiredAt: new Date(), ownerVerifiedAt: new Date() }]) {
      await withProofRule(facts, async () => {
        as(PAYROLL)
        const run = await draftRun()
        try {
          const approve = await json(await runs(req('PATCH', '/api/ap/payment-runs', { action: 'approve', id: run })))
          expect(approve.status, JSON.stringify(approve.body)).toBe(200)
          expect((await prisma.paymentRun.findUniqueOrThrow({ where: { id: run } })).status).toBe('APPROVED')
        } finally {
          await dropRun(run)
        }
        for (const action of ['approve', 'process'] as const) {
          const r = await json(await payrollRun(req('POST', '/api/payroll/run', { buyContractIds: ['any-line'], action })))
          expect(r.body?.error?.code, JSON.stringify(r.body)).not.toBe('OWNER_NOT_VERIFIED')
        }
        const off = await json(await offCycle(req('POST', '/api/payroll/off-cycle', {})))
        expect(off.body?.error?.code, JSON.stringify(off.body)).toBe('VALIDATION')
        const com = await json(await commissionRun(req('POST', '/api/payroll/commissions', {})))
        expect(com.body?.error?.code, JSON.stringify(com.body)).toBe('VALIDATION')
      })
    }
  })
})
