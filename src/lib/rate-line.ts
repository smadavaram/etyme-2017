/**
 * The line a rate row is on, and who is party to it.
 *
 * `RateHistory.contractId` is polymorphic — a sell line or a buy line —
 * so which firms may write or decide a rate on it is read off the line,
 * never off the caller's own permissions. A permission says what a desk
 * may do at its own firm; it says nothing about another firm's contract.
 *
 * A BUY line has one payer — the firm whose money it is — and the firm
 * it buys from, where there is one. A SELL line has the firm selling and
 * the client buying. Nobody else is a party, and the site the work
 * happens at is not one either.
 */

import { prisma } from '@/lib/db'
import { daysFor } from '@/lib/contract-links'
import { periodFor, type Terms } from '@/lib/periods'
import { ORDER_HEADER_SELECT, periodTermsFor } from '@/lib/money/order-terms'
import { paidBook, paidKey } from '@/lib/payroll-paid'

export interface RateLine {
  /** The firm whose money the rate is. */
  payerId: string
  /** Every firm that is party to the line, the payer included. */
  parties: string[]
  /** What the line itself records, before any change: the pay or bill rate. */
  recordedRateCents: number
  currency: string
  /** The day the line started, for an opening row at its recorded rate. */
  startDate: Date
}

export async function lineFor(contractType: string, contractId: string): Promise<RateLine | null> {
  if (String(contractType).toUpperCase() === 'BUY') {
    const bc = await prisma.buyContract.findUnique({
      where: { id: contractId },
      select: {
        companyId: true, vendorCompanyId: true, payCurrency: true, startDate: true,
        candidates: { select: { payRate: true, payCurrency: true, startDate: true, state: true } },
      },
    })
    if (!bc) return null
    // A rate row sits on the buy line, not on a person, so it can only
    // speak for a line paying one rate. The one live person on it is who
    // it pays; where it names several, the first live one stands in and
    // the approval route says nothing more precise than that.
    const cand = bc.candidates.find((c) => c.state === 'ACTIVE') ?? bc.candidates[0] ?? null
    return {
      payerId: bc.companyId,
      parties: [bc.companyId, ...(bc.vendorCompanyId ? [bc.vendorCompanyId] : [])],
      recordedRateCents: cand?.payRate ?? 0,
      currency: cand?.payCurrency ?? bc.payCurrency,
      startDate: cand?.startDate ?? bc.startDate,
    }
  }
  const sc = await prisma.sellContract.findUnique({
    where: { id: contractId },
    select: { companyId: true, clientCompanyId: true, billRate: true, billCurrency: true, startDate: true },
  })
  if (!sc) return null
  return {
    payerId: sc.clientCompanyId,
    parties: [sc.companyId, sc.clientCompanyId],
    recordedRateCents: sc.billRate,
    currency: sc.billCurrency,
    startDate: sc.startDate,
  }
}

// ── An approved change takes its place in the line's history ──────────
//
// A rate change used to be written as one open-ended row and nothing
// else. The row before it stayed open too, so two rows claimed every day
// after the change and the reader picked whichever started later; and
// where there was no row before it at all — the ordinary case, a line
// that never changed price — nothing recorded what the old rate was
// except the line's own column, which is exactly the column a careless
// fix would overwrite. So an approved change now closes what came
// before it on the day before it starts, and where nothing came before
// it, writes the line's recorded rate as an opening row from the day the
// line began. The line's own rate is never touched: days before the
// change go on reading it, through that row.

type Tx = Pick<typeof prisma, 'rateHistory'>

const DAY = 86_400_000

export async function settleApproved(
  tx: Tx,
  row: { id: string; contractType: string; contractId: string; fromDate: Date; changedById: string },
  line: RateLine,
  approvedById: string
): Promise<{ closed: number; opened: boolean }> {
  const dayBefore = new Date(row.fromDate.getTime() - DAY)
  const others = await tx.rateHistory.findMany({
    where: {
      contractType: row.contractType,
      contractId: row.contractId,
      approvalState: 'APPROVED',
      id: { not: row.id },
    },
    orderBy: { fromDate: 'asc' },
  })

  // What was in force until now ends the day before this starts.
  const before = others.filter((r) => r.fromDate < row.fromDate)
  let closed = 0
  for (const r of before) {
    if (r.toDate === null || r.toDate >= row.fromDate) {
      await tx.rateHistory.update({ where: { id: r.id }, data: { toDate: dayBefore } })
      closed++
    }
  }

  // Nothing before it: the line's own rate becomes the opening row, from
  // the day the line began to the day before the change.
  let opened = false
  if (before.length === 0 && line.startDate < row.fromDate && line.recordedRateCents > 0) {
    await tx.rateHistory.create({
      data: {
        contractType: row.contractType,
        contractId: row.contractId,
        rate: line.recordedRateCents,
        rateType: 'HOURLY',
        fromDate: line.startDate,
        toDate: dayBefore,
        reason: 'The rate recorded on the line when it began, written down when it first changed.',
        changedById: row.changedById,
        previousRate: null,
        approvalState: 'APPROVED',
        approvedById,
        approvedAt: new Date(),
      },
    })
    opened = true
  }

  // And where an approved change already starts after this one, this one
  // ends the day before it rather than claiming the same days.
  const next = others.find((r) => r.fromDate > row.fromDate)
  if (next) {
    await tx.rateHistory.update({
      where: { id: row.id },
      data: { toDate: new Date(next.fromDate.getTime() - DAY) },
    })
  }

  return { closed, opened }
}

// ── Which pay periods a pay change reaches ────────────────────────────
//
// On a sell line an approved change is reported as the unpaid invoice
// lines it now prices. A pay line has no invoice lines — it has pay
// periods, and the question a payroll desk asks on the day a backdated
// rise is approved is "which of my runs does this reach, and did I
// already pay any of them at the old rate". Back pay itself is not
// built and waits on the founder; this only says where it would fall.

export interface PeriodReached {
  label: string
  start: string
  end: string
  /** Hours worked in the period on or after the change. */
  hours: number
  /** True where a payroll run already paid some of those hours. */
  paid: boolean
}

export async function payPeriodsReached(buyContractId: string, fromDate: Date, toDate: Date | null): Promise<PeriodReached[]> {
  const bc = await prisma.buyContract.findUnique({
    where: { id: buyContractId },
    include: {
      candidates: { select: { personId: true, startDate: true } },
      workOrder: { select: ORDER_HEADER_SELECT },
      sellLinks: {
        include: {
          sellContract: {
            select: {
              timesheets: {
                where: {
                  periodEnd: { gte: fromDate },
                  assertions: { some: { role: 'EMPLOYER_ACCEPTANCE', state: 'LIVE' } },
                },
                select: { id: true, personId: true, days: true },
              },
            },
          },
        },
      },
    },
  })
  if (!bc) return []

  const book = await paidBook(bc.companyId, [bc.id])
  const links = bc.sellLinks.map((l) => ({
    buyContractId: bc.id,
    sellContractId: l.sellContractId,
    effectiveFrom: l.effectiveFrom,
    effectiveTo: l.effectiveTo,
  }))
  const out = new Map<string, PeriodReached>()
  for (const cand of bc.candidates) {
    const terms: Terms = { ...periodTermsFor('BUY', bc), startedOn: cand.startDate }
    for (const l of bc.sellLinks) {
      for (const t of l.sellContract.timesheets) {
        if (t.personId !== cand.personId) continue
        const days = daysFor(bc.id, links, (t.days ?? {}) as Record<string, number>)
        for (const [day, h] of Object.entries(days)) {
          const at = new Date(`${day.slice(0, 10)}T00:00:00Z`)
          if (Number(h) <= 0 || at < fromDate || (toDate && at > toDate)) continue
          const p = periodFor(at, terms)
          const key = p.start.toISOString()
          const row = out.get(key) ?? {
            label: p.label,
            start: p.start.toISOString().slice(0, 10),
            end: p.end.toISOString().slice(0, 10),
            hours: 0,
            paid: false,
          }
          row.hours = Math.round((row.hours + Number(h)) * 100) / 100
          if (book.unrecorded.size > 0 || book.paid.has(paidKey(bc.id, cand.personId, t.id, day.slice(0, 10)))) row.paid = true
          out.set(key, row)
        }
      }
    }
  }
  return [...out.values()].sort((a, b) => a.start.localeCompare(b.start))
}
