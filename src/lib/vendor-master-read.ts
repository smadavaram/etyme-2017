/**
 * The database side of lib/vendor-master (record 87, 2026-11-17): reads
 * the rows and hands them to the pure readers. The one writer here is the
 * carry-over of old bank checks, run by hand (scripts/bank-check-carry-over.ts),
 * never by a route or the build.
 *
 * Nothing here decides who may pay. The payment gate, the held receipt's
 * check and the run file move onto `readPayToFor` and `readCheckedFor` in
 * money's next slice.
 */

import { prisma } from '@/lib/db'
import type { PayToRow } from '@/lib/money/pay-to'
import type { PayerCheck } from '@/lib/setup-gate-rules'
import {
  payToFor, checkedFor, customersFrom, changeAnswers, supplierChangedMessage, oldCheckPayer,
  type CustomerAnswer, type OldCheckPayer, type SupplierChangedOut, type WalkBankMark,
} from '@/lib/vendor-master'

type Db = typeof prisma

const PAY_TO_SELECT = {
  id: true, companyId: true, bankName: true, accountName: true, legalName: true, accountLast4: true, verifiedAt: true,
  isDefault: true, createdAt: true,
} as const

/** The payment details this payer pays this supplier, or null where it has none. */
export async function readPayToFor(supplierId: string, payerId: string, db: Db = prisma): Promise<PayToRow | null> {
  const [rows, choices] = await Promise.all([
    db.remitTo.findMany({ where: { companyId: supplierId }, select: PAY_TO_SELECT }),
    db.remitToChoice.findMany({
      where: { supplierCompanyId: supplierId, payerCompanyId: payerId },
      select: { supplierCompanyId: true, payerCompanyId: true, remitToId: true },
    }),
  ])
  const row = payToFor(supplierId, payerId, rows, choices)
  if (!row) return null
  const { isDefault: _d, createdAt: _c, ...out } = row
  return out
}

/** Whether this payer has itself confirmed the details it pays this supplier. */
export async function readCheckedFor(payerId: string, supplierId: string, db: Db = prisma): Promise<PayerCheck> {
  const payTo = await readPayToFor(supplierId, payerId, db)
  if (!payTo) return checkedFor(payerId, null)
  const row = await db.remitTo.findUnique({
    where: { id: payTo.id },
    select: {
      bankName: true, accountName: true, accountLast4: true, routingLast4: true, verifiedAt: true, verifiedByCompanyId: true,
      bankChecks: {
        where: { payerCompanyId: payerId },
        select: { payerCompanyId: true, bankName: true, accountName: true, accountLast4: true, routingLast4: true, checkedAt: true, callbackOutcome: true },
      },
    },
  })
  return checkedFor(payerId, row)
}

/** The firms that must confirm a change to this supplier's bank, by id. */
export async function customersToConfirm(supplierId: string, db: Db = prisma): Promise<string[]> {
  const [rows, agreements] = await Promise.all([
    db.counterparty.findMany({
      where: { OR: [{ companyId: supplierId }, { otherCompanyId: supplierId }] },
      select: { companyId: true, otherCompanyId: true, relationship: true, status: true },
    }),
    db.masterAgreement.findMany({ where: { vendorId: supplierId }, select: { vendorId: true, clientId: true } }),
  ])
  const ids = new Set<string>([...rows.flatMap((r) => [r.companyId, r.otherCompanyId]), ...agreements.map((a) => a.clientId)])
  const onEtyme = ids.size
    ? await db.company.findMany({ where: { id: { in: [...ids] }, claimedAt: { not: null } }, select: { id: true } })
    : []
  return customersFrom({ supplierId, rows, agreements, onEtyme: new Set(onEtyme.map((c) => c.id)) })
}

const CHANGE_SELECT = {
  id: true, companyId: true, state: true, bankName: true, accountName: true, accountLast4: true, routingLast4: true, paymentMethod: true,
} as const

/** Each customer's answer to one change to a supplier's bank, or null where there is no such change. */
export async function bankChangeAnswers(changeId: string, db: Db = prisma): Promise<CustomerAnswer[] | null> {
  const change = await db.bankChangeRequest.findUnique({ where: { id: changeId }, select: CHANGE_SELECT })
  if (!change) return null
  const [payers, checks] = await Promise.all([
    customersToConfirm(change.companyId, db),
    db.bankCheck.findMany({
      where: { bankChangeRequestId: changeId },
      select: {
        payerCompanyId: true, bankChangeRequestId: true, bankName: true, accountName: true, accountLast4: true, routingLast4: true,
        checkedAt: true, callbackAt: true, callbackOutcome: true,
      },
    }),
  ])
  return changeAnswers(change, payers, checks)
}

/**
 * The "supplier changed" message one customer's system would be sent for
 * one change, or why none is made. Reads only that customer's own vendor
 * number for the supplier. Sends nothing and writes nothing.
 */
export async function supplierChangedMessageFor(
  payerId: string,
  changeId: string,
  db: Db = prisma,
): Promise<{ ok: true; message: SupplierChangedOut } | { ok: false; says: string }> {
  const change = await db.bankChangeRequest.findUnique({ where: { id: changeId }, select: { ...CHANGE_SELECT, remitTo: { select: { legalName: true } }, company: { select: { name: true } } } })
  if (!change) return { ok: false, says: 'That change is not on record.' }
  const [answers, register] = await Promise.all([
    bankChangeAnswers(changeId, db),
    db.counterparty.findMany({
      where: { companyId: payerId, otherCompanyId: change.companyId, vendorNumber: { not: null } },
      orderBy: [{ relationship: 'desc' }, { id: 'asc' }],
      select: { relationship: true, vendorNumber: true },
    }),
  ])
  const answer = answers?.find((a) => a.payerId === payerId)
  if (!answer) return { ok: false, says: 'Your company does not pay this supplier, so no change goes to your system.' }
  // The payer's SUPPLIER row is where the number is kept (app/api/counterparties/vendor-number).
  const vendorNumber = (register.find((r) => r.relationship === 'SUPPLIER') ?? register[0])?.vendorNumber ?? null
  return supplierChangedMessage({
    payerId, change, answer, vendorNumber, supplierLegalName: change.remitTo?.legalName ?? change.company.name,
  })
}

// ── Old checks: the report and the carry-over ────────────────────────

/** Every old-style check (stamped on the details) and which payer the record names for it. */
export async function oldChecksReport(db: Db = prisma): Promise<OldCheckPayer[]> {
  const rows = await db.remitTo.findMany({
    where: { verifiedAt: { not: null } },
    orderBy: [{ companyId: 'asc' }, { id: 'asc' }],
    select: { id: true, companyId: true, verifiedAt: true, verifiedByCompanyId: true, bankChecks: { select: { payerCompanyId: true } } },
  })
  if (rows.length === 0) return []
  const firms = [...new Set(rows.map((r) => r.companyId))]
  const walks = await db.supplierRequest.findMany({
    where: { OR: [{ supplierCompanyId: { in: firms } }, { firmCompanyId: { in: firms } }] },
    select: { companyId: true, supplierCompanyId: true, firmCompanyId: true, checklist: true },
  })
  const marks: WalkBankMark[] = []
  for (const w of walks) {
    const firm = w.supplierCompanyId ?? w.firmCompanyId
    if (!firm || !Array.isArray(w.checklist)) continue
    for (const item of w.checklist as { key?: unknown; state?: unknown; at?: unknown }[]) {
      if (item?.key !== 'BANK') continue
      const at = typeof item.at === 'string' || item.at instanceof Date ? new Date(item.at as string) : null
      marks.push({ payerCompanyId: w.companyId, firmCompanyId: firm, state: String(item.state ?? ''), at: at && !isNaN(at.getTime()) ? at : null })
    }
  }
  return rows
    .map((r) => oldCheckPayer(r, marks, new Set(r.bankChecks.map((c) => c.payerCompanyId))))
    .filter((r): r is OldCheckPayer => r != null)
}

/**
 * Gives each old check to the payer the record names, as that payer's own
 * `BankCheck`, and to no other. Idempotent: a payer that already holds a
 * check on the row is left as it is. A check the record cannot place is
 * left counted for nobody. No call back is claimed: the carried check
 * records none. `write: false` counts and writes nothing.
 */
export async function carryOverOldChecks(db: Db = prisma, opts: { write: boolean } = { write: false }): Promise<{ named: number; carried: number; unplaced: number }> {
  const report = await oldChecksReport(db)
  const todo = report.filter((r): r is Extract<OldCheckPayer, { payerId: string }> => r.payerId != null && !r.carried)
  const unplaced = report.filter((r) => r.payerId == null).length
  if (!opts.write || todo.length === 0) return { named: todo.length, carried: 0, unplaced }
  let carried = 0
  for (const t of todo) {
    const row = await db.remitTo.findUnique({
      where: { id: t.remitToId },
      select: { bankName: true, accountName: true, accountLast4: true, routingLast4: true, verifiedAt: true, verifiedById: true },
    })
    if (!row?.verifiedAt) continue
    const made = await db.$transaction(async (tx) => {
      const exists = await tx.bankCheck.findUnique({ where: { remitToId_payerCompanyId: { remitToId: t.remitToId, payerCompanyId: t.payerId } }, select: { id: true } })
      if (exists) return false
      await tx.bankCheck.create({
        data: {
          remitToId: t.remitToId, payerCompanyId: t.payerId,
          bankName: row.bankName, accountName: row.accountName, accountLast4: row.accountLast4, routingLast4: row.routingLast4,
          checkedById: row.verifiedById, checkedAt: row.verifiedAt!,
        },
      })
      await tx.automationLog.create({
        data: {
          companyId: t.payerId,
          action: 'BANK_CHECK_CARRIED_OVER',
          summary: 'An earlier check of a supplier’s bank details was recorded as this company’s own check.',
          reason: t.from === 'VERIFIED_BY'
            ? 'The earlier check named this company as the one that made it.'
            : 'This company’s supplier walk marked the bank item at the moment the earlier check was recorded.',
          payload: { remitToId: t.remitToId, supplierId: t.supplierId, from: t.from },
          // The log has no undo for it; a person removes the check by hand.
          reversible: false,
        },
      })
      return true
    })
    if (made) carried++
  }
  return { named: todo.length, carried, unplaced }
}
