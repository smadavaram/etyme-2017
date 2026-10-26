/**
 * What each twin act actually does to the record, once the role
 * contract and, where it must, a person have said yes.
 *
 * Three parts per act, so the ledger can keep its promise that an act
 * and its entry stand or fall together:
 *
 *   check   reads the record and returns a sentence where the record says
 *           no — a receipt that did not clear the check, a week not yet
 *           accepted. Read before anything is written.
 *   inTx    the writes, inside the same transaction as the ledger entry
 *           and the automation-log row. Throws to roll all three back.
 *   after   what leaves the database — a notice — once the transaction
 *           has committed, so nobody is told about an act that rolled back.
 *
 * Money is never computed here. An invoice receipt is approved only if
 * money's own three-way check (lib/invoice-match, lib/three-way-match)
 * says it matched and money's own reader (lib/money/payers-acceptance-read)
 * says every week in it was accepted; this file asks and records the yes.
 *
 * An act with no performer cannot be done, whatever its tier. The never
 * acts have none on purpose.
 */

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { notifyBulk, type NotifyParams } from '@/lib/notify'
import { mayPayInvoiceReceipt } from '@/lib/invoice-match'
import { partiesOf, directionFrom } from '@/lib/money/invoice-parties'
import { mayPayKeyedReceipt } from '@/lib/money/keyed-receipt'
import { SUPPLIER_BILL_PERFORMERS } from '@/lib/money/supplier-bills'
import { recordInvoicePayment } from '@/lib/money/invoice-payment'

export interface PerformContext {
  companyId: string
  action: string
  entity: { type: string; id: string; partyCompanyIds: string[] }
  authorityPersonId: string | null
  /**
   * The person saying yes, on a question being decided: the approver
   * written to the question in the same transaction the performer's
   * `inTx` runs in, and the same person in `check` and `after`. Null when
   * the twin acts alone or is only asking, because nobody said yes.
   */
  approverPersonId: string | null
  /** The ledger entry's rule and rationale, for the notice's body. */
  ruleCited: string
  rationale: string
  payload: Record<string, unknown>
}

type Tx = Prisma.TransactionClient

export interface Performer {
  check?: (c: PerformContext) => Promise<string | null>
  inTx?: (tx: Tx, c: PerformContext) => Promise<Record<string, unknown>>
  after?: (c: PerformContext) => Promise<void>
}

const TITLE_MAX = 120

function idsIn(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : []
}

/** People with a live, non-consultant seat at a company, holding a permission where one is named. */
async function deskAt(companyId: string, permission?: string, take = 10): Promise<string[]> {
  const rows = await prisma.context.findMany({
    where: {
      companyId, revokedAt: null, type: { not: 'CONSULTANT' },
      ...(permission ? { role: { permissions: { hasSome: [permission, '*'] } } } : {}),
    },
    select: { personId: true },
    take,
  })
  return [...new Set(rows.map((r) => r.personId))]
}

function tell(personIds: string[], companyId: string, c: PerformContext, title: string, type: NotifyParams['type']): Promise<unknown> {
  return notifyBulk(personIds.map((personId) => ({
    personId,
    companyId,
    type,
    title: title.slice(0, TITLE_MAX),
    body: `${c.ruleCited} ${c.rationale}`.trim(),
    entityId: c.entity.id,
    data: { twinAction: c.action, entityType: c.entity.type, entityId: c.entity.id },
  })))
}

// ── The invoice receipt ───────────────────────────────────────────────

const INVOICE_PARTIES_SELECT = {
  id: true,
  engagement: {
    select: {
      msa: {
        select: {
          vendorId: true, clientId: true,
          vendor: { select: { id: true, name: true } },
          client: { select: { id: true, name: true } },
        },
      },
    },
  },
  workOrder: {
    select: {
      issuedById: true, issuedToId: true,
      issuedBy: { select: { id: true, name: true } },
      issuedTo: { select: { id: true, name: true } },
    },
  },
} as const

/**
 * A receipt is one of two rows. `Invoice` where the supplier is on the
 * platform and sent it to us; `VendorBill` where we keyed in what a
 * supplier sent. Each is checked by money's own reader.
 */
const approveInvoiceReceipt: Performer = {
  async check(c) {
    if (c.entity.type === 'Invoice') {
      const inv = await prisma.invoice.findUnique({ where: { id: c.entity.id }, select: INVOICE_PARTIES_SELECT })
      if (!inv) return 'That invoice receipt is not on the record.'
      const parties = partiesOf({ agreement: inv.engagement?.msa ?? null, order: inv.workOrder })
      if (directionFrom(parties, c.companyId) !== 'PAYABLE') {
        return 'That invoice is not one this company is being asked to pay.'
      }
      // The AP desk's own gate (money, lib/invoice-match): submitted, not
      // held, not already paid, and through the three-way check. The twin
      // asks the same question the desk asks and adds nothing to it.
      const g = await mayPayInvoiceReceipt(c.entity.id)
      if (!g) return 'That invoice receipt is not on the record.'
      if (!g.ok) return g.says
      return null
    }
    if (c.entity.type === 'VendorBill') {
      const bill = await prisma.vendorBill.findUnique({
        where: { id: c.entity.id },
        select: { companyId: true, status: true },
      })
      if (!bill || bill.companyId !== c.companyId) return 'That invoice receipt is not on this company’s books.'
      if (bill.status === 'DISPUTED') {
        return 'A check failed on this invoice receipt. The AP clerk records an exception with a reason before it can be approved.'
      }
      if (bill.status !== 'RECEIVED') return 'This invoice receipt has already been approved, paid or cancelled.'
      // The one check a typed-in receipt is paid on (money,
      // lib/money/keyed-receipt): the weeks accepted, received once, inside
      // the order's ceiling, at the agreed rate. The twin asks the AP
      // desk's own question and adds nothing to it, so it never approves a
      // duplicate or a receipt past its ceiling.
      const g = await mayPayKeyedReceipt(c.entity.id)
      if (!g) return 'That invoice receipt is not on the record.'
      if (!g.ok) return g.says
      return null
    }
    return 'Only an invoice receipt can be approved this way.'
  },
  async inTx(tx, c) {
    if (c.entity.type === 'VendorBill') {
      // Conditional, so a receipt that moved between the check and now
      // is not approved on a stale reading.
      const moved = await tx.vendorBill.updateMany({
        where: { id: c.entity.id, companyId: c.companyId, status: 'RECEIVED' },
        data: { status: 'APPROVED' },
      })
      if (moved.count !== 1) throw new Error('The invoice receipt changed while it was being approved. Nothing was approved.')
      return { vendorBillStatus: 'APPROVED' }
    }
    // An `Invoice` has no approved-for-payment state on the record. The
    // yes is this entry and the approval beside it; the payment is still
    // recorded by the AP desk through POST /api/invoices/:id/payments,
    // which runs the same check again. Said here, and in KNOWN-LIMITS.md.
    return { invoiceStatusChanged: false, threeWayCheck: 'MATCHED' }
  },
}

// ── Paying an invoice receipt ─────────────────────────────────────────

/** Said to a yes with no bank reference on it (coordinator, 2026-10-26). */
export const NEEDS_BANK_REFERENCE = 'Enter the bank reference so the AP clerk can reconcile it.'

function answerOf(c: PerformContext): { reference: string | null; method: string | null } {
  const a = (c.payload.answer && typeof c.payload.answer === 'object' ? c.payload.answer : {}) as Record<string, unknown>
  const field = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  return { reference: field(a.reference), method: field(a.method) }
}

/**
 * Pay a supplier's invoice that passed the three-way check, on a
 * person's yes. Two halves, each the payment route's own
 * (POST /api/invoices/:id/payments), and nothing of this file's:
 *
 *   check   the gate the route asks before it pays — this company is the
 *           one being asked to pay it, and `mayPayInvoiceReceipt`
 *           (submitted, not held, not paid, through the match, run again
 *           now). The desk is `decideApproval`'s: the person holds
 *           `payments.record` at this company, and is not the person the
 *           twin acts for. Then, on a yes, the bank reference.
 *   inTx    money's one payment write, `recordInvoicePayment`, for the
 *           balance owed, inside the ledger's own transaction, so the
 *           payment and the entry that says who said yes stand or fall
 *           together.
 *
 * Asked, never alone: the check runs once when the twin asks (no person
 * yet, so no reference is wanted) and again on the yes.
 */
const payInvoiceReceipt: Performer = {
  async check(c) {
    if (c.entity.type !== 'Invoice') return 'Only a supplier\u2019s invoice on the record can be paid this way. A typed-in receipt is approved, then paid from its page.'
    const inv = await prisma.invoice.findUnique({ where: { id: c.entity.id }, select: INVOICE_PARTIES_SELECT })
    if (!inv) return 'That invoice receipt is not on the record.'
    const parties = partiesOf({ agreement: inv.engagement?.msa ?? null, order: inv.workOrder })
    if (directionFrom(parties, c.companyId) !== 'PAYABLE') {
      return 'That invoice is not one this company is being asked to pay.'
    }
    const g = await mayPayInvoiceReceipt(c.entity.id)
    if (!g) return 'That invoice receipt is not on the record.'
    if (!g.ok) return g.says
    if (c.approverPersonId && !answerOf(c).reference) return NEEDS_BANK_REFERENCE
    return null
  },
  async inTx(tx, c) {
    if (!c.approverPersonId) throw new Error('A payment is made only on a person\u2019s yes.')
    const { reference, method } = answerOf(c)
    if (!reference) throw new Error(NEEDS_BANK_REFERENCE)
    const [company, person] = await Promise.all([
      tx.company.findUnique({ where: { id: c.companyId }, select: { name: true } }),
      tx.person.findUnique({ where: { id: c.approverPersonId }, select: { name: true } }),
    ])
    const personName = person?.name ?? 'A person'
    const companyName = company?.name ?? 'this company'
    const paid = await recordInvoicePayment(tx, {
      invoiceId: c.entity.id,
      amountCents: null,
      reference,
      method,
      appliedById: c.approverPersonId,
      onBooksOf: c.companyId,
      seatId: null,
      recordedBy: { companyId: c.companyId, companyName, personName },
      reason: `Paid by ${personName} at ${companyName}, saying yes to the twin\u2019s question to pay it. ${c.ruleCited}`.trim().slice(0, 1000),
    })
    // Refused on a fact that moved since the check (paid by hand a moment
    // ago, cancelled): nothing is written, the entry with it.
    if (!paid.ok) throw new Error(paid.says)
    return {
      paymentId: paid.payment.id,
      invoiceStatus: paid.status,
      amountCents: paid.amountCents,
      currency: paid.invoice.currency,
      outstandingCents: paid.invoice.outstandingCents,
      reference,
      method,
    }
  },
}

// ── Telling people ────────────────────────────────────────────────────

const flagMismatch: Performer = {
  async after(c) {
    const desk = await deskAt(c.companyId, 'payments.record')
    await tell(desk, c.companyId, c, 'An invoice receipt does not match what was accepted', 'INVOICE')
  },
}

const sendReminder: Performer = {
  async check(c) {
    const asked = idsIn(c.payload.personIds)
    if (asked.length === 0) return 'A reminder names who it is for.'
    const here = await deskAt(c.companyId, undefined, 500)
    const outside = asked.filter((p) => !here.includes(p))
    return outside.length ? 'A reminder goes only to people with a seat at this company.' : null
  },
  async after(c) {
    await tell(idsIn(c.payload.personIds), c.companyId, c, String(c.payload.title ?? 'Something is waiting on you'), 'SYSTEM')
  },
}

const tellProgramOwner: Performer = {
  async check(c) {
    return c.authorityPersonId ? null : 'There is no program owner on whose authority the twin acts, so there is nobody to tell.'
  },
  async after(c) {
    if (!c.authorityPersonId) return
    await tell([c.authorityPersonId], c.companyId, c, String(c.payload.title ?? 'Somebody is nearing the time limit'), 'CONTRACT')
  },
}

const tellSupplier: Performer = {
  async check(c) {
    const to = idsIn(c.payload.tellCompanyIds)
    if (to.length === 0) return 'Say which supplier to write to.'
    if (to.some((id) => !c.entity.partyCompanyIds.includes(id) || id === c.companyId)) {
      return 'The twin writes only to a supplier on this record.'
    }
    return null
  },
  async after(c) {
    for (const supplierId of idsIn(c.payload.tellCompanyIds)) {
      const desk = await deskAt(supplierId)
      await tell(desk, supplierId, c, String(c.payload.title ?? 'A person you supply is nearing the client’s time limit'), 'CONTRACT')
    }
  },
}

/** Recorded in the ledger and nowhere else: the entry is the act. */
const ledgerOnly: Performer = {}

// ── The supplier's bill ───────────────────────────────────────────────
//
// `bill.draft` and `bill.send` are money's performers (lib/money/supplier-bills):
// drafting reads the agreement's billing date and the weeks signed above
// through money's one cascade, and none of that arithmetic belongs here.
// supplier-bills imports only the Performer type from this file, so there
// is no runtime loop.

export const PERFORMERS: Readonly<Record<string, Performer>> = {
  ...SUPPLIER_BILL_PERFORMERS,
  'tenure.warning.record': ledgerOnly,
  'invoice_receipt.record': ledgerOnly,
  'summary.draft': ledgerOnly,
  'tenure.warning.notify_program_owner': tellProgramOwner,
  'invoice_receipt.flag_mismatch': flagMismatch,
  'reminder.send': sendReminder,
  'invoice_receipt.approve': approveInvoiceReceipt,
  'invoice_receipt.pay': payInvoiceReceipt,
  'tenure.warning.notify_supplier': tellSupplier,
}

/** The supplier on an invoice receipt, for the ledger's party list. */
export async function invoiceSupplierId(invoiceId: string): Promise<string | null> {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: INVOICE_PARTIES_SELECT })
  if (!inv) return null
  return partiesOf({ agreement: inv.engagement?.msa ?? null, order: inv.workOrder }).vendor?.id ?? null
}

/**
 * The supplier on each of several invoice receipts, in one read: a run
 * read them one receipt at a time (simulation, 2026-10-20). A receipt
 * not found is absent from the map.
 */
export async function invoiceSupplierIds(invoiceIds: readonly string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  if (invoiceIds.length === 0) return out
  const rows = await prisma.invoice.findMany({
    where: { id: { in: [...new Set(invoiceIds)] } },
    select: { ...INVOICE_PARTIES_SELECT, id: true },
  })
  for (const inv of rows) {
    out.set(inv.id, partiesOf({ agreement: inv.engagement?.msa ?? null, order: inv.workOrder }).vendor?.id ?? null)
  }
  return out
}
