/**
 * The facts a card is drawn from, read off the twin's ledger and the
 * record it points at. Every figure here is one the record carries;
 * where it carries none, the fact is null and the card says so.
 */

import { prisma } from '@/lib/db'
import { decimalToCents } from '@/lib/three-way-match'
import { invoiceVerdict, type LineVerdict } from '@/lib/twin/rules/invoice'
import { ruleSetFor } from '@/lib/twin/rule-set'
import { rate } from '@/lib/money-display'
import { appLink } from '@/lib/notify'
import { logBulkAccess } from '@/lib/access-log'
import type { InvoiceApprovalFacts, TenureAlertFacts } from '@/lib/teams/cards'

export const INVOICE_APPROVE = 'invoice_receipt.approve'
export const TENURE_TOLD = 'tenure.warning.notify_program_owner'
export const TENURE_TO_SUPPLIER = 'tenure.warning.notify_supplier'

const hrs = (n: number) => String(Math.round(n * 100) / 100)

/** One sentence per line that does not agree, with the numbers. Pure. */
export function varianceLines(lines: readonly LineVerdict[], currency: string): string[] {
  const out: string[] = []
  for (const l of lines) {
    if (l.hoursOffPct != null && l.hoursOffPct !== 0 && l.hoursAccepted != null) {
      const sign = l.hoursOffPct > 0 ? '+' : ''
      out.push(`${l.personName}: ${hrs(l.hoursBilled)} h billed, ${hrs(l.hoursAccepted)} h accepted (${sign}${Math.round(l.hoursOffPct * 100) / 100}%)`)
    }
    if (l.contractRateCents != null && l.rateCents !== l.contractRateCents) {
      out.push(`${l.personName}: ${rate(l.rateCents, currency)} billed, ${rate(l.contractRateCents, currency)} on the contract`)
    }
    if (l.outcome !== 'CLEAN' && l.on === 'RECEIPT') out.push(`${l.personName}: ${l.ruleCited}`)
  }
  return out
}

/** The ledger's own words for one question, at the reader's company only. */
export async function whyOf(approvalId: string, companyId: string): Promise<{ ruleCited: string; rationale: string } | null> {
  const row = await prisma.twinApproval.findFirst({
    where: { id: approvalId, companyId },
    select: { twinAction: { select: { ruleCited: true, rationale: true } } },
  })
  return row ? { ruleCited: row.twinAction.ruleCited, rationale: row.twinAction.rationale } : null
}

/** Everything the invoice approval card shows, for one pending question. */
export async function invoiceApprovalFacts(approvalId: string, companyId: string): Promise<InvoiceApprovalFacts | null> {
  const a = await prisma.twinApproval.findFirst({
    where: { id: approvalId, companyId, decision: 'PENDING' },
    select: { id: true, twinAction: { select: { action: true, entityType: true, entityId: true, ruleCited: true, rationale: true, payload: true } } },
  })
  if (!a || a.twinAction.action !== INVOICE_APPROVE || a.twinAction.entityType !== 'Invoice') return null
  const payload = (a.twinAction.payload ?? {}) as { number?: string | null; supplierName?: string | null }
  const head = await prisma.invoice.findUnique({
    where: { id: a.twinAction.entityId },
    select: { number: true, total: true, currency: true, dueAt: true },
  })
  const verdict = await invoiceVerdict(a.twinAction.entityId, await ruleSetFor(companyId)).catch(() => null)
  const lines = verdict?.lines ?? []
  const starts = lines.map((l) => l.periodStart).filter((d): d is string => !!d).sort()
  const ends = lines.map((l) => l.periodEnd).filter((d): d is string => !!d).sort()
  const currency = head?.currency ?? 'USD'
  return {
    approvalId: a.id,
    number: head?.number ?? payload.number ?? null,
    supplierName: verdict?.supplierName ?? payload.supplierName ?? null,
    contractors: lines.map((l) => l.personName).filter(Boolean),
    periodStart: starts[0] ?? null,
    periodEnd: ends[ends.length - 1] ?? null,
    amountMinor: head?.total != null ? decimalToCents(head.total) : null,
    currency,
    dueAt: head?.dueAt ? head.dueAt.toISOString() : null,
    variances: varianceLines(lines, currency),
    ruleCited: a.twinAction.ruleCited,
    rationale: a.twinAction.rationale,
  }
}

const DAY = 24 * 60 * 60 * 1000

/** Days from today to the limit, counted the way the warning counted them. */
export function daysUntil(limitOnIso: string | null, now: Date): number | null {
  if (!limitOnIso) return null
  const t = new Date(limitOnIso).getTime()
  if (Number.isNaN(t)) return null
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const on = new Date(t)
  return Math.round((Date.UTC(on.getUTCFullYear(), on.getUTCMonth(), on.getUTCDate()) - today) / DAY)
}

/**
 * The time-limit card's facts for one warning the twin told the program
 * owner. `mayEscalate` says whether the reader may answer the twin's
 * question about writing to the supplier; where not, Escalate opens the
 * person's page instead. The read of the person is logged.
 */
export async function tenureAlertFacts(
  twinActionId: string,
  companyId: string,
  reader: { personId: string; mayEscalate: (approval: { needsPermission: string; authorityPersonId: string | null }) => boolean },
  now: Date = new Date(),
): Promise<TenureAlertFacts | null> {
  const e = await prisma.twinAction.findFirst({
    where: { id: twinActionId, companyId, action: TENURE_TOLD, outcome: 'PERFORMED' },
    select: { id: true, entityType: true, entityId: true, ruleCited: true, rationale: true, payload: true, authorityPersonId: true },
  })
  if (!e || e.entityType !== 'Person') return null
  const p = (e.payload ?? {}) as { tier?: string; daysOnSite?: number; daysToLimit?: number; limitOn?: string; capMonths?: number; suppliers?: string[] }
  const person = await prisma.person.findUnique({ where: { id: e.entityId }, select: { name: true } })
  if (!person) return null
  logBulkAccess([e.entityId], {
    actorPersonId: reader.personId,
    actorCompanyId: companyId,
    action: 'TENURE_VIEW',
    reason: 'A time-limit card from the program manager’s twin, sent in Teams',
  })
  const ask = await prisma.twinApproval.findFirst({
    where: { companyId, decision: 'PENDING', twinAction: { action: TENURE_TO_SUPPLIER, entityType: 'Person', entityId: e.entityId } },
    select: { id: true, needsPermission: true, twinAction: { select: { authorityPersonId: true } } },
  })
  const live = daysUntil(p.limitOn ?? null, now)
  return {
    twinActionId: e.id,
    personName: person.name,
    tier: p.tier ?? 'WARN',
    daysToLimit: live ?? p.daysToLimit ?? 0,
    limitOn: p.limitOn ?? null,
    daysOnSite: typeof p.daysOnSite === 'number' ? p.daysOnSite : null,
    capMonths: typeof p.capMonths === 'number' ? p.capMonths : null,
    suppliers: Array.isArray(p.suppliers) ? p.suppliers.filter((s) => typeof s === 'string') : [],
    ruleCited: e.ruleCited,
    rationale: e.rationale,
    escalateApprovalId: ask && reader.mayEscalate({ needsPermission: ask.needsPermission, authorityPersonId: ask.twinAction.authorityPersonId }) ? ask.id : null,
    link: appLink(`/dashboard/people/${e.entityId}`),
  }
}
