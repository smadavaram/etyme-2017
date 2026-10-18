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
 * Everything goes through the twin's one door (`act` in lib/twin/ledger),
 * so this file writes nothing itself. Kept apart from `./supplier-bills`
 * so the performers there can be imported by the ledger without the
 * ledger importing itself.
 */

import { prisma } from '@/lib/db'
import { formatDay } from '@/lib/format-date'
import { act, type ActResult, type Authority, type Surface } from '@/lib/twin/ledger'
import { supplierAuthorityAt } from '@/lib/twin/run'
import { billsDueAt, cardPayload, draftRule, draftRationale, SUPPLIER_TWIN_NAME } from '@/lib/money/supplier-bills'
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
  outcomes: Record<ActResult['outcome'], number>
}

const plain = (d: Date): string => formatDay(d)

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
    const send = tally(await act({
      companyId, twin: 'SUPPLIER', action: 'bill.send',
      entity: { type: 'Invoice', id: invoiceId, partyCompanyIds: [companyId, d.customerId] },
      rule: draftRule(d),
      rationale:
        `Bill ${invoiceNumber} to ${d.customerName} for ${d.period.label} is drafted: ` +
        `${fromUnits(d.planned.totalMinor / minorPerUnit(d.planned.currency), d.planned.currency)}, ${d.planned.hours} hours. ` +
        `Send it? ${d.planned.dueSays}`,
      surface, authority,
      payload: { ...cardPayload(d, { id: invoiceId, number: invoiceNumber }), engagementId: d.engagementId, sellContractId: d.sellContractId },
      dedupKey: invoiceId,
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
    const p = ((row.payload ?? {}) as Record<string, any>)
    const send = tally(await act({
      companyId, twin: 'SUPPLIER', action: 'bill.send',
      entity: { type: 'Invoice', id: invoiceId, partyCompanyIds: row.partyCompanyIds.length ? row.partyCompanyIds : [companyId] },
      rule: `Bill ${inv.number} for ${plain(inv.periodStart)} to ${plain(inv.periodEnd)} is drafted and has not been sent.`,
      rationale: `Drafted by ${SUPPLIER_TWIN_NAME}: ${fromUnits(Number(inv.total), inv.currency)}. Send it?`,
      surface, authority,
      payload: { ...p, invoiceId, invoiceNumber: inv.number },
      dedupKey: invoiceId,
    }))
    if (send.outcome === 'AWAITING_APPROVAL') asked++
  }

  return { companyId, due: due.length, drafted, asked, outcomes }
}
