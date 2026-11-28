/**
 * The job twin's invoice demo at Northbend Athletic: three invoice
 * receipts waiting, two clean and one with an hours mismatch.
 *
 * What the world seed already leaves at Northbend, measured on a fresh
 * world on 2026-10-12: ONE pending invoice receipt — Computer Systems'
 * bill for Helena Marsh's three signed weeks, clean and payable — and
 * two of Lucía Fernández's weeks that Northbend signed at forty hours
 * and Pinnacle Resourcing never billed. This adds Pinnacle's invoices
 * for those two weeks:
 *
 *   PR-2026-0441   the first week, 40 hours at the contract rate   clean
 *   PR-2026-0442   the second week, 41.5 hours against 40 accepted  mismatch, 3.75% over
 *
 * Lucía's third week (44 hours, nobody has signed it) is left unbilled
 * on purpose: billing it would make a receipt the twin calls BLOCKED,
 * and the demo is two clean and one mismatch.
 *
 * Idempotent by fixed reference: each invoice is found by its number
 * before it is written, and each line by its timesheet, so a second run
 * writes nothing. The weeks are read off the record rather than dated
 * here, so this follows whatever day the world was born
 * (lib/seed-days).
 *
 * Wiring: lib/seed-world and lib/seed-programmes are the architect's.
 * Call `seedTwinInvoiceDemo()` once after the three programs are seeded.
 */

import { prisma as db } from '@/lib/db'
import { periodFor } from '@/lib/periods'
import { ORDER_HEADER_SELECT, periodTermsFor, termsFor } from '@/lib/money/order-terms'
import { dueOn } from '@/lib/billing-cascade'
import { day } from '@/lib/seed-days'

/** One receipt in the plan. Hours are the line's; the rate is always the contract's. */
export interface TwinReceiptPlan {
  /** The supplier's invoice number; null where lib/seed-programmes numbers it. */
  number: string | null
  /** Which of Lucía's signed, unbilled weeks, oldest first. */
  week: 0 | 1
  /** Hours on the invoice line. */
  hoursBilled: number
  /** Hours Northbend accepted on that week, as seeded. */
  hoursAccepted: number
  /** What the twin should say. */
  expected: 'CLEAN' | 'MISMATCH'
}

/**
 * The three receipts Northbend holds pending once this has run. The
 * first is written by lib/seed-programmes and is here so the plan reads
 * whole; `writes: false` marks it.
 */
export const NORTHBEND_TWIN_RECEIPTS: ReadonlyArray<TwinReceiptPlan & { writes: boolean; person: string; supplier: string }> = [
  { number: null, week: 0, hoursBilled: 40, hoursAccepted: 40, expected: 'CLEAN', writes: false, person: 'Helena Marsh', supplier: 'computer-systems' },
  { number: 'PR-2026-0441', week: 0, hoursBilled: 40, hoursAccepted: 40, expected: 'CLEAN', writes: true, person: 'Lucía Fernández', supplier: 'pinnacle' },
  { number: 'PR-2026-0442', week: 1, hoursBilled: 41.5, hoursAccepted: 40, expected: 'MISMATCH', writes: true, person: 'Lucía Fernández', supplier: 'pinnacle' },
]

function plusDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000)
}

function firstWorkedDay(t: { periodStart: Date; days: unknown }): Date {
  const first = Object.keys((t.days ?? {}) as Record<string, number>).sort()[0]
  return first ? new Date(`${first}T00:00:00Z`) : t.periodStart
}

export interface TwinSeedResult {
  /** Invoices written by this run; zero on a second run. */
  written: number
  /** A sentence where something the plan needs is missing from the world. */
  skipped: string | null
}

/**
 * Write the two Pinnacle receipts. Refuses in a sentence, writing
 * nothing, where the world does not hold what the plan reads — a seed
 * that invents a week to bill would be a receipt with no receipt behind
 * it.
 */
export async function seedTwinInvoiceDemo(): Promise<TwinSeedResult> {
  const client = await db.company.findFirst({ where: { name: 'Northbend Athletic' }, select: { id: true } })
  const supplier = await db.company.findFirst({ where: { name: 'Pinnacle Resourcing' }, select: { id: true } })
  if (!client || !supplier) return { written: 0, skipped: 'Northbend Athletic or Pinnacle Resourcing is not seeded yet.' }

  const contract = await db.sellContract.findFirst({
    where: {
      companyId: supplier.id, clientCompanyId: client.id,
      person: { name: 'Lucía Fernández' },
    },
    orderBy: { startDate: 'desc' },
    select: {
      id: true, engagementId: true, workOrderId: true, billRate: true, personId: true, startDate: true,
      billFrequency: true, billAnchor: true, billStraddle: true, paymentTerms: true,
      workOrder: { select: ORDER_HEADER_SELECT },
    },
  })
  if (!contract || !contract.engagementId) {
    return { written: 0, skipped: 'Lucía Fernández has no live contract from Pinnacle to Northbend Athletic.' }
  }

  // Her weeks Northbend has signed, oldest first. A week already on a
  // line of ours stays in the list, so the plan's indices do not move on
  // a second run.
  const weeks = await db.timesheet.findMany({
    where: {
      sellContractId: contract.id,
      assertions: { some: { state: 'LIVE', companyId: client.id } },
    },
    orderBy: { periodStart: 'asc' },
    select: {
      id: true, periodStart: true, periodEnd: true, days: true, totalHours: true,
      assertions: { where: { state: 'LIVE', companyId: client.id }, select: { hours: true } },
      invoiceLines: { select: { invoice: { select: { number: true } } } },
    },
  })
  const plan = NORTHBEND_TWIN_RECEIPTS.filter((p): p is typeof p & { number: string } => p.writes && p.number !== null)
  const usable = weeks.filter(
    (w) =>
      w.invoiceLines.length === 0 ||
      w.invoiceLines.every((l) => plan.some((p) => p.number === l.invoice.number))
  )
  if (usable.length < 2) {
    return { written: 0, skipped: `Lucía Fernández has ${usable.length} signed week(s) free to bill at Northbend; the demo needs two.` }
  }

  const billTerms = periodTermsFor('SELL', contract)
  const billed = termsFor('SELL', contract)
  let written = 0

  for (const p of plan) {
    if (await db.invoice.findUnique({ where: { number: p.number }, select: { id: true } })) continue
    const t = usable[p.week]
    const accepted = Number(t.assertions[0]?.hours ?? t.totalHours)
    if (accepted !== p.hoursAccepted) {
      return { written, skipped: `The week of ${t.periodStart.toISOString().slice(0, 10)} was accepted at ${accepted} hours, not the ${p.hoursAccepted} the plan reads.` }
    }
    if (await db.invoiceLine.findFirst({ where: { timesheetId: t.id, sellContractId: contract.id } })) continue

    const period = periodFor(firstWorkedDay(t), billTerms)
    const amountCents = Math.round(p.hoursBilled * contract.billRate)
    const issuedAt = plusDays(t.periodEnd, 2).getTime() < day(-1).getTime() ? plusDays(t.periodEnd, 2) : day(-1)
    const due = dueOn({
      anchor: billed.paymentTermsFrom ?? 'PERIOD_END',
      days: billed.paymentTermsDays ?? 30,
      periodEnd: period.end,
      issuedAt,
      receivedAt: null,
      approvedAt: null,
    })

    const inv = await db.invoice.create({
      data: {
        engagementId: contract.engagementId, workOrderId: contract.workOrderId, number: p.number,
        periodStart: period.start, periodEnd: period.end,
        currency: 'USD', total: amountCents / 100, paid: 0,
        issuedAt, submittedAt: issuedAt, dueAt: due.dueAt, status: 'SUBMITTED',
        soldToId: client.id, billToId: client.id, payerId: client.id,
      },
    })
    await db.invoiceLine.create({
      data: {
        invoiceId: inv.id, timesheetId: t.id, sellContractId: contract.id, personId: contract.personId,
        hours: p.hoursBilled, rateCents: contract.billRate, amountCents,
        description: `Lucía Fernández — ${t.periodStart.toISOString().slice(0, 10)} to ${t.periodEnd.toISOString().slice(0, 10)}`,
      },
    })
    written++
  }
  return { written, skipped: null }
}
