/**
 * The supplier's twin's nightly pass over one firm's bills (2026-10-18).
 *
 * For every bill its agreements say is due (`billsDueAt`): draft it,
 * alone, under the ledger; then ask whoever issues bills to send it. And
 * for every draft still waiting with no question open — a question
 * refused last night because the draft failed the three-way check, say —
 * ask again, once the record allows it. A draft somebody already answered
 * "Not now" to is not asked about again: the ledger's key holds it.
 *
 * A refusal is recorded once, not nightly. A refused question is written
 * with no key (the ledger keeps keys for what was done or asked), so
 * without a guard the same draft would be refused again every night, one
 * new row each time, saying the same thing. Each question carries the
 * ground it was asked on (`askingGround`): who may say yes, whose
 * authority the twin acts on, and the draft's lines with the weeks and
 * signatures behind them. The draft is asked about again only once that
 * ground has moved: a seat that sends bills is added, the authority
 * changes, a week is accepted, the order moves.
 *
 * Everything goes through the twin's one door (`act` in lib/twin/ledger),
 * so this file writes nothing itself. Kept apart from `./supplier-bills`
 * so the performers there can be imported by the ledger without the
 * ledger importing itself.
 */

import { createHash } from 'crypto'
import { prisma } from '@/lib/db'
import { NOT_THE_SAMPLE_SEAT } from '@/lib/sample-seat'
import { formatDay } from '@/lib/format-date'
import { act, type ActResult, type Authority, type Surface } from '@/lib/twin/ledger'
import { supplierAuthorityAt } from '@/lib/twin/run'
import { billsDueAt, cardPayload, draftRule, draftRationale, sendQuestion } from '@/lib/money/supplier-bills'
import { dueIfSentOn } from '@/lib/money/bill-send'
import { fromUnits } from '@/lib/money-display'
import { minorPerUnit } from '@/lib/money'

export interface SupplierBillRun {
  companyId: string
  /** Bills the agreements said were due. */
  due: number
  /** Drafts written tonight. */
  drafted: number
  /** Questions put to a person tonight. */
  asked: number
  /** Drafts refused before on the same ground, so not asked again tonight. */
  unchanged: number
  outcomes: Record<ActResult['outcome'], number>
}

const plain = (d: Date): string => formatDay(d)

/**
 * What a question to send this draft rests on, as one short fingerprint:
 * the seats that may send bills, the person the twin acts for, and the
 * draft's lines with each week's status, its accepted hours and the
 * signatures live on it, and the orders behind them. Two nights with the
 * same fingerprint would be refused for the same reason.
 */
export async function askingGround(companyId: string, invoiceId: string, authority: Authority): Promise<string> {
  const approvers = await prisma.context.findMany({
    where: {
      companyId, revokedAt: null, type: { not: 'CONSULTANT' },
      role: { permissions: { hasSome: ['invoices.issue', '*'] } },
      ...NOT_THE_SAMPLE_SEAT,
    },
    select: { personId: true },
  })
  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      status: true, total: true,
      workOrder: { select: { updatedAt: true } },
      invoiceLines: {
        select: {
          id: true, hours: true, amountCents: true,
          sellContract: { select: { workOrder: { select: { updatedAt: true } } } },
          timesheet: {
            select: {
              status: true, acceptedHours: true,
              assertions: { where: { state: 'LIVE' }, select: { id: true } },
            },
          },
        },
        orderBy: { id: 'asc' },
      },
    },
  })
  const ground = {
    approvers: [...new Set(approvers.map((a) => a.personId))].sort(),
    authority: authority.personId,
    invoice: inv && {
      status: inv.status, total: String(inv.total), order: inv.workOrder?.updatedAt.toISOString() ?? null,
      lines: inv.invoiceLines.map((l) => [
        l.id, String(l.hours), l.amountCents, l.sellContract?.workOrder?.updatedAt.toISOString() ?? null,
        l.timesheet ? [l.timesheet.status, l.timesheet.acceptedHours == null ? null : String(l.timesheet.acceptedHours), l.timesheet.assertions.map((a) => a.id).sort()] : null,
      ]),
    },
  }
  return createHash('sha256').update(JSON.stringify(ground)).digest('hex').slice(0, 24)
}

/** Whether this draft's last question was refused on exactly this ground. */
async function refusedOnSameGround(companyId: string, invoiceId: string, ground: string): Promise<boolean> {
  const last = await prisma.twinAction.findFirst({
    where: { companyId, action: 'bill.send', entityType: 'Invoice', entityId: invoiceId },
    select: { outcome: true, payload: true },
    orderBy: { ts: 'desc' },
  })
  if (!last || last.outcome !== 'REFUSED') return false
  return ((last.payload ?? {}) as Record<string, unknown>).askedOn === ground
}

export async function runSupplierBills(
  companyId: string,
  opts: { surface?: Surface; now?: Date; authority?: Authority } = {}
): Promise<SupplierBillRun> {
  const surface = opts.surface ?? 'CRON'
  const authority = opts.authority ?? (await supplierAuthorityAt(companyId))
  const outcomes: SupplierBillRun['outcomes'] = { PERFORMED: 0, AWAITING_APPROVAL: 0, REFUSED: 0, ALREADY: 0, FAILED: 0 }
  const tally = (r: ActResult) => { outcomes[r.outcome]++; return r }
  let drafted = 0
  let asked = 0
  let unchanged = 0
  /** Drafts already asked about on this run, so a refusal is not repeated in the same night. */
  const triedTonight = new Set<string>()

  const due = await billsDueAt(companyId, opts.now)
  for (const d of due) {
    const card = cardPayload(d)
    const payload = { ...card, engagementId: d.engagementId, sellContractId: d.sellContractId, billingDate: d.billingDate.toISOString().slice(0, 10) }
    const made = tally(await act({
      companyId, twin: 'SUPPLIER', action: 'bill.draft',
      entity: { type: 'SellContract', id: d.sellContractId, partyCompanyIds: [companyId, d.customerId] },
      rule: draftRule(d), rationale: draftRationale(d),
      surface, authority, payload, dedupKey: d.dedupKey,
    }))
    if (made.outcome !== 'PERFORMED') continue
    drafted++
    const invoiceId = String(made.result.invoiceId)
    const invoiceNumber = String(made.result.invoiceNumber)
    triedTonight.add(invoiceId)
    const askedOn = await askingGround(companyId, invoiceId, authority)
    const send = tally(await act({
      companyId, twin: 'SUPPLIER', action: 'bill.send',
      entity: { type: 'Invoice', id: invoiceId, partyCompanyIds: [companyId, d.customerId] },
      rule: draftRule(d),
      rationale: sendQuestion({
        invoiceNumber, customerName: d.customerName, periodLabel: d.period.label,
        totalSays: fromUnits(d.planned.totalMinor / minorPerUnit(d.planned.currency), d.planned.currency),
        hours: d.planned.hours, dueSays: d.planned.dueSays,
      }),
      surface, authority,
      payload: { ...cardPayload(d, { id: invoiceId, number: invoiceNumber }), engagementId: d.engagementId, sellContractId: d.sellContractId, askedOn },
      dedupKey: invoiceId,
      byHand: `Send it from the Bills page: open ${invoiceNumber} and press Send.`,
    }))
    if (send.outcome === 'AWAITING_APPROVAL') asked++
  }

  // Drafts the twin wrote that have no question open and no answer: ask.
  const drafts = await prisma.twinAction.findMany({
    where: { companyId, twinKind: 'SUPPLIER', action: 'bill.draft', outcome: 'PERFORMED', actorType: 'TWIN' },
    select: { payload: true, partyCompanyIds: true },
    orderBy: { ts: 'asc' },
    take: 200,
  })
  for (const row of drafts) {
    const result = ((row.payload ?? {}) as Record<string, any>).result ?? {}
    const invoiceId = typeof result.invoiceId === 'string' ? result.invoiceId : null
    if (!invoiceId || triedTonight.has(invoiceId)) continue
    const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { id: true, number: true, status: true, total: true, currency: true, periodStart: true, periodEnd: true } })
    if (!inv || inv.status !== 'DRAFT') continue
    // Already asked (and waiting, or answered): the key says so and nothing is written.
    const seen = await prisma.twinAction.findFirst({ where: { companyId, action: 'bill.send', dedupKey: invoiceId }, select: { id: true } })
    if (seen) continue
    // Refused before, and nothing it rested on has moved: said once, not nightly.
    const askedOn = await askingGround(companyId, invoiceId, authority)
    if (await refusedOnSameGround(companyId, invoiceId, askedOn)) { unchanged++; continue }
    const p = ((row.payload ?? {}) as Record<string, any>)
    // Asked days after it was drafted, so its due date is read again for
    // today: a period-end term that had time left at the draft may have
    // none now, and the card says so before the yes.
    const due = await dueIfSentOn(invoiceId, opts.now ?? new Date())
    const send = tally(await act({
      companyId, twin: 'SUPPLIER', action: 'bill.send',
      entity: { type: 'Invoice', id: invoiceId, partyCompanyIds: row.partyCompanyIds.length ? row.partyCompanyIds : [companyId] },
      rule: `Bill ${inv.number} for ${plain(inv.periodStart)} to ${plain(inv.periodEnd)} is drafted and has not been sent.`,
      rationale: sendQuestion({
        invoiceNumber: inv.number,
        customerName: typeof p.customerName === 'string' ? p.customerName : 'the customer',
        periodLabel: typeof p.period?.label === 'string' ? p.period.label : `${plain(inv.periodStart)} to ${plain(inv.periodEnd)}`,
        totalSays: fromUnits(Number(inv.total), inv.currency),
        hours: null,
        dueSays: due?.says ?? '',
      }),
      surface, authority,
      payload: { ...p, ...(due ? { dueSays: due.says, pastDue: due.pastDue } : {}), invoiceId, invoiceNumber: inv.number, askedOn },
      dedupKey: invoiceId,
      byHand: `Send it from the Bills page: open ${inv.number} and press Send.`,
    }))
    if (send.outcome === 'AWAITING_APPROVAL') asked++
  }

  return { companyId, due: due.length, drafted, asked, unchanged, outcomes }
}
