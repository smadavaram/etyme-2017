/**
 * Sending a bill: through the three-way check, then to the customer.
 *
 * One door for the Submit button on a bill's page (`POST
 * /api/invoices/:id/submit`), for the Bills page's bulk Submit (`POST
 * /api/invoices/submit`) and for the supplier's twin's `bill.send`
 * (2026-10-18). A person holding `invoices.issue` at the firm that raised
 * a draft may send it from the Bills page themselves — except the Owner
 * the twin drafted it for, who sends it only where nobody else at the firm
 * sends bills (`maySendBill`, 2026-10-26). The twin acts on the Owner's authority, else the Admin's;
 * whoever else issues bills — Accounts Receivable, Finance, Admin — says
 * the yes, and the person it acts for never does. The twin drafts; a
 * person's yes sends; and what "send" does is this file, so a bill the
 * twin drafted and a bill raised on the Bills page reach the customer by
 * the same check and the same writes.
 *
 * Two starting points, one end:
 *
 *   ISSUED  raised on the Bills page. Sending moves it to SUBMITTED.
 *   DRAFT   drafted by the twin. Sending raises it — its issue date, its
 *           due date counted by the agreement's rule from today, the
 *           "bill to raise" date closed — and submits it, in one step.
 *
 * The check runs before anything is written. A bill that does not pass
 * it stays where it was, and the refusal says why in a sentence.
 */

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { matchAndRecord } from '@/lib/invoice-loop'
import { completeCycles } from '@/lib/cycle-complete'
import { invoicesRaisedBy, partiesOf } from '@/lib/money/invoice-parties'
import { ORDER_HEADER_SELECT, SELL_LINE_TERMS_SELECT } from '@/lib/money/order-terms'
import { billDue } from '@/lib/money/bill-generate'
import { fromUnits } from '@/lib/money-display'
import { emit } from '@/lib/events'
import { closeOvertaken } from '@/lib/twin/ledger'
import { writePayerNoticesIn } from '@/lib/notify/bill-delivery'
import { hasPermission } from '@/lib/permissions'
import { NOT_THE_SAMPLE_SEAT } from '@/lib/sample-seat'

type Tx = Prisma.TransactionClient

export type SendCheck =
  | { ok: true; invoice: { id: string; number: string; status: string; matchAttempt: number } }
  | { ok: false; status: 404 | 409; code: string; says: string; checks?: { reason: string }[] }

/**
 * Whether this firm may send this bill now: it raised it, it is in a
 * state that can be sent, and it passes the three-way check. The check is
 * recorded through the harness (lib/invoice-loop) whether it passes or
 * not, the same as the Submit button always has.
 */
export async function mayBeSent(invoiceId: string, companyId: string, from: readonly ('ISSUED' | 'DRAFT')[]): Promise<SendCheck> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, ...invoicesRaisedBy(companyId) },
    select: { id: true, number: true, status: true, matchAttempt: true },
  })
  if (!invoice) {
    return { ok: false, status: 404, code: 'NOT_FOUND', says: 'No such bill of yours. A bill is sent by the firm that raised it.' }
  }
  if (!(from as readonly string[]).includes(invoice.status)) {
    return {
      ok: false, status: 409, code: 'INVALID_STATE',
      says: invoice.status === 'DRAFT'
        ? `Bill ${invoice.number} is still a draft.`
        : `Bill ${invoice.number} has already been sent, or is ${invoice.status.toLowerCase()}, so it cannot be sent again.`,
    }
  }

  // ── The control ──
  // Purchase order, approved timesheet, invoice. An invoice that does not
  // match cannot be sent to a client for payment — not flagged, not warned
  // about. Invoices raised before line-level receipting have no
  // InvoiceLine rows; those are let through with the gap recorded,
  // because retro-blocking historic invoices helps nobody.
  const lineCount = await prisma.invoiceLine.count({ where: { invoiceId } })
  if (lineCount > 0) {
    const attempt = invoice.matchAttempt + 1
    const { result: match } = await matchAndRecord(invoiceId, companyId, attempt)
    await prisma.invoice.update({ where: { id: invoiceId }, data: { matchAttempt: attempt } })
    if (match && !match.matched) {
      return {
        ok: false, status: 409, code: 'MATCH_FAILED',
        says: `This bill does not match its timesheets or purchase order: ${match.summary}`,
        checks: match.checks.filter((c) => c.outcome === 'FAIL'),
      }
    }
  }
  return { ok: true, invoice: { ...invoice, matchAttempt: invoice.matchAttempt + (lineCount > 0 ? 1 : 0) } }
}

export interface Sent {
  invoiceId: string
  number: string
  total: number
  currency: string
  dueAt: Date
  submittedAt: Date
  /** It was a draft, and sending raised it. */
  raised: boolean
  /** The payer's people told in the sending; `why` where nobody there could be. */
  payerNotice: { written: number; why: string | null }
}

/** What the due date of a bill being sent is counted from: its agreement, its order, its lines. */
const DUE_SELECT = {
  periodEnd: true,
  engagement: {
    select: {
      msa: {
        select: {
          vendorId: true, clientId: true,
          billFrequency: true, billAnchor: true, billStraddle: true,
          paymentTerms: true, paymentTermsFrom: true, currency: true,
          vendor: { select: { id: true, name: true } },
          client: { select: { id: true, name: true } },
        },
      },
    },
  },
  workOrder: { select: { issuedById: true, issuedToId: true, issuedBy: { select: { id: true, name: true } }, issuedTo: { select: { id: true, name: true } } } },
  invoiceLines: {
    select: {
      sellContractId: true,
      timesheet: { select: { periodEnd: true } },
      sellContract: {
        select: {
          paymentTerms: true, paymentTermsFrom: true, billCurrency: true,
          companyId: true, clientCompanyId: true,
          company: { select: { id: true, name: true } },
          clientCompany: { select: { id: true, name: true } },
          ...SELL_LINE_TERMS_SELECT,
          workOrder: { select: ORDER_HEADER_SELECT },
        },
      },
    },
  },
} as const

type DueRow = Prisma.InvoiceGetPayload<{ select: typeof DUE_SELECT }>

/** The due date a bill would carry if it were sent on `on`, by the agreement's rule, and whether that date has already gone. */
function dueWhenSent(inv: DueRow, on: Date): ReturnType<typeof billDue> {
  const parties = partiesOf({
    agreement: inv.engagement.msa,
    order: inv.workOrder,
    lines: inv.invoiceLines.map((l) => l.sellContract).filter((c): c is NonNullable<typeof c> => c != null),
  })
  const line = inv.invoiceLines.find((l) => l.sellContract)?.sellContract ?? null
  return billDue({
    line,
    engagementAgreement: inv.engagement.msa,
    companyName: parties.vendor?.name ?? 'this company',
    customerName: parties.client?.name ?? 'the client',
    periodEnd: inv.periodEnd,
    issuedAt: on,
  })
}

/**
 * What a draft's due date would be if it were sent on `on`: the sentence a
 * card shows beside Send, and whether the agreement's terms make it already
 * due or past due. Read by the supplier's twin before it asks for a yes,
 * so the card says it first. Null where the bill does not exist.
 */
export async function dueIfSentOn(invoiceId: string, on: Date = new Date()): Promise<{ dueAt: Date; says: string; pastDue: { daysPast: number; says: string } | null } | null> {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: DUE_SELECT })
  if (!inv) return null
  const { due, pastDue } = dueWhenSent(inv, on)
  return { dueAt: due.dueAt, says: due.says, pastDue }
}

/**
 * The writes, inside the caller's transaction. Moves only a bill still
 * in the state the check saw — a second yes, or a person pressing Submit
 * while the twin's question waited, finds it moved and is refused.
 */
export async function markSent(
  tx: Tx,
  a: { invoiceId: string; companyId: string; by: { personId: string | null; name: string }; now?: Date }
): Promise<Sent> {
  const now = a.now ?? new Date()
  const inv = await tx.invoice.findUniqueOrThrow({
    where: { id: a.invoiceId },
    select: {
      id: true, number: true, status: true, total: true, currency: true, dueAt: true,
      engagementId: true,
      ...DUE_SELECT,
    },
  })
  const raised = inv.status === 'DRAFT'
  if (inv.status !== 'DRAFT' && inv.status !== 'ISSUED') {
    throw new Error(`ALREADY_MOVED:${inv.status}`)
  }

  let dueAt = inv.dueAt
  if (raised) {
    // Raised today, so dated today: the due date is counted again by the
    // agreement's rule from the day it actually goes, never from the day
    // the twin drafted it.
    dueAt = dueWhenSent(inv, now).due.dueAt
  }

  const moved = await tx.invoice.updateMany({
    where: { id: inv.id, status: inv.status },
    data: {
      status: 'SUBMITTED',
      submittedAt: now,
      ...(raised ? { issuedAt: now, dueAt } : {}),
    },
  })
  if (moved.count !== 1) throw new Error('ALREADY_MOVED')
  // The payer's people who record payments are told in this transaction,
  // so a sent bill cannot exist without its notice (the handoffs run,
  // 2026-10-22). The letter or Teams message still goes after the commit
  // (`sendBillToCustomer`), because a message cannot be called back.
  const told = await writePayerNoticesIn(tx, { invoiceId: inv.id })
  const toClose: Parameters<typeof completeCycles>[1] = []
  // Ask Etyme's open question about sending this bill is overtaken: it is
  // sent. Closed unanswered, so the card goes and a late yes is told why.
  // A yes sending it now already moved its own question, so finds none.
  await closeOvertaken(tx, {
    companyId: a.companyId, entity: { type: 'Invoice', id: inv.id }, action: 'bill.send',
    what: `Bill ${inv.number} was sent by ${a.by.name}.`, by: a.by, now,
  })

  if (raised) {
    // The "bill to raise" date each line was heading for is done now that
    // it is raised — the step generation skips for a draft.
    const latest = new Map<string, Date>()
    for (const l of inv.invoiceLines) {
      if (!l.sellContractId || !l.timesheet) continue
      const was = latest.get(l.sellContractId)
      if (!was || l.timesheet.periodEnd > was) latest.set(l.sellContractId, l.timesheet.periodEnd)
    }
    // Marked with the payer's dates below, in one id-ordered call.
    for (const [sellContractId, periodEnd] of latest) {
      toClose.push({ sellContractId, kind: 'INVOICE_GENERATE', periodEnd })
    }
    // The overtime answers this bill was priced on become history now,
    // when it is sent — not when it was drafted. A draft is the firm's
    // working paper: until it goes, a week's answer may still change, and
    // a draft priced on the old answer then fails its own check here and
    // is withdrawn and drafted again (lib/money/bill-withdraw).
    await stampDecisionsBilled(tx, inv.id)
    await tx.automationLog.create({
      data: {
        companyId: a.companyId,
        action: 'INVOICE_GENERATED',
        summary: `Bill ${inv.number} raised from its draft: ${fromUnits(Number(inv.total), inv.currency)}, due ${dueAt.toISOString().slice(0, 10)}`,
        reason: `Sent by ${a.by.name}`,
        payload: { invoiceId: inv.id, number: inv.number, engagementId: inv.engagementId, fromDraft: true },
        reversible: false,
      },
    })
  }

  // ── The payer's date, on its own buy line ─────────────────────────
  //
  // The firm this bill goes to was expecting an invoice from us: its "invoice
  // receipt to record" date on the buy line that pays us. When that invoice is
  // typed in, the intake closes the date (api/ap/bills); sent here, nothing
  // did, so the payer's timeline read the week as overdue though the bill was
  // sitting on its desk. Closed now, the moment it is sent, for each line it
  // bills — the buy line whose supplier contract is the one this line bills on.
  const sentLatest = new Map<string, { periodEnd: Date; payer: string }>()
  for (const l of inv.invoiceLines) {
    if (!l.sellContractId || !l.timesheet || !l.sellContract) continue
    const was = sentLatest.get(l.sellContractId)
    if (!was || l.timesheet.periodEnd > was.periodEnd) {
      sentLatest.set(l.sellContractId, { periodEnd: l.timesheet.periodEnd, payer: l.sellContract.clientCompanyId })
    }
  }
  for (const [sellContractId, { periodEnd, payer }] of sentLatest) {
    const payersLines = await tx.buyContract.findMany({
      where: { supplierSellContractId: sellContractId, companyId: payer },
      select: { id: true },
    })
    for (const b of payersLines) {
      toClose.push({ buyContractId: b.id, kind: 'VENDOR_BILL_GENERATE', periodEnd })
    }
  }
  // Every reminder this bill answers, in this transaction and in id order,
  // so two bills sent at once cannot each hold a row the other wants.
  await completeCycles(tx, toClose)

  await tx.automationLog.create({
    data: {
      companyId: a.companyId,
      action: 'INVOICE_SUBMITTED',
      summary: `Bill ${inv.number} submitted for client review`,
      reason: `Bill ${inv.number} submitted for client review`,
      payload: {
        invoiceId: inv.id,
        invoiceNumber: inv.number,
        engagementId: inv.engagementId,
        total: Number(inv.total),
        currency: inv.currency,
        submittedBy: a.by.personId,
        submittedAt: now.toISOString(),
      },
      reversible: true,
    },
  })

  return {
    invoiceId: inv.id, number: inv.number, total: Number(inv.total), currency: inv.currency,
    dueAt, submittedAt: now, raised,
    payerNotice: { written: told.written, why: told.why },
  }
}

/**
 * The overtime decisions a draft was priced on, as the generator wrote
 * them down on the draft's own "drafted" log row, stamped billed. A draft
 * written before 2026-10-18 has no list there: its decisions were stamped
 * when it was drafted, so there is nothing left to stamp.
 */
export async function draftDecisionIds(db: Pick<Tx, 'automationLog'>, invoiceId: string): Promise<string[]> {
  const row = await db.automationLog.findFirst({
    where: { action: 'INVOICE_GENERATED', payload: { path: ['invoiceId'], equals: invoiceId } },
    select: { payload: true },
    orderBy: { at: 'asc' },
  })
  const ids = ((row?.payload ?? {}) as Record<string, unknown>).overtimeDecisionIds
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []
}

async function stampDecisionsBilled(tx: Tx, invoiceId: string): Promise<void> {
  const ids = await draftDecisionIds(tx, invoiceId)
  if (ids.length === 0) return
  await tx.overtimeDecision.updateMany({ where: { id: { in: ids }, billedAt: null }, data: { billedAt: new Date() } })
}

/**
 * After a draft is raised and sent, the event a bill raised on the Bills
 * page sends — whoever sent it. Never inside the transaction: an event
 * for a bill that rolled back would have somebody chasing a number that
 * does not exist.
 */
export async function announceRaised(
  invoiceId: string,
  companyId: string,
  actor: { personId: string | null; twin?: boolean }
): Promise<void> {
  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, number: true, total: true, currency: true, dueAt: true, engagementId: true, _count: { select: { invoiceLines: true } } },
  })
  if (!inv) return
  await emit({
    type: 'invoice.generated',
    companyId,
    subjectType: 'Invoice',
    subjectId: inv.id,
    actorPersonId: actor.personId,
    ...(actor.twin ? { actorKind: 'TWIN' as const, actorTwinKind: 'SUPPLIER' as const } : {}),
    payload: {
      number: inv.number, engagementId: inv.engagementId, lineCount: inv._count.invoiceLines,
      total: Number(inv.total), currency: inv.currency, dueAt: inv.dueAt.toISOString(), fromDraft: true,
    },
  })
}

// ── Who may send a bill the twin drafted ─────────────────────────────
//
// The founder's decision of 2026-10-19 (#2) let the Owner say yes to the
// twin's bill where nobody else at the firm sends bills. Coordinator's
// reading, 2026-10-26, reversible by the founder in a sentence: it covers
// the document, not the door. A bill the twin drafted on the Owner's
// authority is the Owner's machine's work, so wherever another seat holds
// `invoices.issue`, that seat sends it and the Owner cannot, whether the
// press is in Ask Etyme, on Today or on the Bills page. Where nobody else
// holds it, the Owner sends, and the answer says the exception applied so
// the ledger can record it. A bill a person drafted by hand is unchanged:
// any seat holding `invoices.issue` sends it.
//
// "The Owner" is the person the twin drafted it for: the draft's
// `bill.draft` ledger entry names them (`authorityPersonId`). A draft with
// no such entry was drafted by a person.

export interface BillSender {
  personId: string
  companyId: string
  /** The caller's permissions at the firm that raised the bill. */
  permissions: readonly string[]
}

export type MaySendBill =
  | {
      ok: true
      /** The owner-only exception's reason where it applied (record it on the ledger), else null. */
      ownerException: string | null
    }
  | { ok: false; code: 'FORBIDDEN'; says: string }

const OWNER_SENDS_SAYS =
  'Nobody else at the firm sends bills, so the owner Ask Etyme acts for may send its drafted bill (founder, 2026-10-19).'

/** "A", "A or B", "A, B or C". */
function orList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
}

/** The sentence an Owner reads where somebody else sends the twin's bill. */
export function otherSenderSays(names: string[]): string {
  return (
    `${orList(names)} sends this bill. Ask Etyme drafted it on your authority, ` +
    'so you send it only where nobody else at the firm sends bills.'
  )
}

/**
 * The pure rule, over facts already read.
 *
 *   permitted     the caller holds `invoices.issue` at the raising firm
 *   draftedFor    the person the twin drafted it for, or null where a person drafted it
 *   otherSenders  every other seat at the firm holding `invoices.issue`, by name,
 *                 the person it was drafted for excluded
 */
export function sendVerdict(i: {
  callerId: string
  permitted: boolean
  draftedFor: string | null
  otherSenders: readonly { personId: string; name: string }[]
}): MaySendBill {
  if (!i.permitted) {
    return { ok: false, code: 'FORBIDDEN', says: 'Sending a bill needs a seat that sends bills: Accounts Receivable, Finance or Admin.' }
  }
  if (i.draftedFor === null || i.draftedFor !== i.callerId) return { ok: true, ownerException: null }
  const others = i.otherSenders.filter((o) => o.personId !== i.callerId)
  if (others.length === 0) return { ok: true, ownerException: OWNER_SENDS_SAYS }
  const names = [...new Set(others.map((o) => o.name))].sort((a, b) => a.localeCompare(b))
  return { ok: false, code: 'FORBIDDEN', says: otherSenderSays(names) }
}

/**
 * May this caller send these bills — one answer per bill, in a fixed
 * number of reads however many. For a list (Today) that draws Send per row.
 * Asks nothing about the bill's state or the three-way check: those are
 * `mayBeSent`'s, asked when Send is pressed.
 */
export async function maySendBills(caller: BillSender, invoiceIds: readonly string[]): Promise<Map<string, MaySendBill>> {
  const ids = [...new Set(invoiceIds)]
  const out = new Map<string, MaySendBill>()
  if (ids.length === 0) return out
  const permitted = hasPermission(caller.permissions, 'invoices.issue')
  const drafts = permitted
    ? await prisma.twinAction.findMany({
        where: {
          companyId: caller.companyId, action: 'bill.draft', outcome: 'PERFORMED',
          OR: ids.map((id) => ({ payload: { path: ['result', 'invoiceId'], equals: id } })),
        },
        select: { authorityPersonId: true, payload: true },
      })
    : []
  const draftedFor = new Map<string, string | null>()
  for (const d of drafts) {
    const id = ((d.payload as Record<string, unknown>)?.result as Record<string, unknown> | undefined)?.invoiceId
    if (typeof id === 'string') draftedFor.set(id, d.authorityPersonId ?? null)
  }
  const ownDrafts = [...draftedFor.values()].some((p) => p === caller.personId)
  const senders = ownDrafts
    ? await prisma.context.findMany({
        where: {
          companyId: caller.companyId, revokedAt: null, type: { not: 'CONSULTANT' },
          role: { permissions: { hasSome: ['invoices.issue', '*'] } },
          personId: { not: caller.personId },
          ...NOT_THE_SAMPLE_SEAT,
        },
        select: { personId: true, person: { select: { name: true } } },
      })
    : []
  const otherSenders = senders.map((s) => ({ personId: s.personId, name: s.person.name }))
  for (const id of ids) {
    out.set(id, sendVerdict({ callerId: caller.personId, permitted, draftedFor: draftedFor.get(id) ?? null, otherSenders }))
  }
  return out
}

/** May this caller send this bill: `maySendBills` for one. */
export async function maySendBill(caller: BillSender, invoice: { id: string }): Promise<MaySendBill> {
  return (await maySendBills(caller, [invoice.id])).get(invoice.id)!
}
