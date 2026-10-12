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
import { payersBook } from '@/lib/money/payers-acceptance-read'

export interface PerformContext {
  companyId: string
  action: string
  entity: { type: string; id: string; partyCompanyIds: string[] }
  authorityPersonId: string | null
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
        select: { companyId: true, status: true, buyContractId: true, periodStart: true, periodEnd: true },
      })
      if (!bill || bill.companyId !== c.companyId) return 'That invoice receipt is not on this company’s books.'
      if (bill.status === 'DISPUTED') {
        return 'A check failed on this invoice receipt. The AP desk records an exception with a reason before it can be approved.'
      }
      if (bill.status !== 'RECEIVED') return 'This invoice receipt has already been approved, paid or cancelled.'
      if (bill.buyContractId && bill.periodStart && bill.periodEnd) {
        const book = await payersBook({
          buyContractId: bill.buyContractId, periodStart: bill.periodStart, periodEnd: bill.periodEnd, then: 'pay',
        })
        if (book && book.waiting.length > 0) return book.notAccepted
      }
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

export const PERFORMERS: Readonly<Record<string, Performer>> = {
  'tenure.warning.record': ledgerOnly,
  'invoice_receipt.record': ledgerOnly,
  'summary.draft': ledgerOnly,
  'tenure.warning.notify_program_owner': tellProgramOwner,
  'invoice_receipt.flag_mismatch': flagMismatch,
  'reminder.send': sendReminder,
  'invoice_receipt.approve': approveInvoiceReceipt,
  'tenure.warning.notify_supplier': tellSupplier,
}

/** The supplier on an invoice receipt, for the ledger's party list. */
export async function invoiceSupplierId(invoiceId: string): Promise<string | null> {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: INVOICE_PARTIES_SELECT })
  if (!inv) return null
  return partiesOf({ agreement: inv.engagement?.msa ?? null, order: inv.workOrder }).vendor?.id ?? null
}
