import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { threeWayMatch, decimalToCents, type MatchInput, type MatchResult } from '@/lib/three-way-match'
import { liveWaivers } from '@/lib/money/keyed-lines'
import { rateInForce } from '@/lib/contract-rate'
import { bandsOf, billableInPeriod, periodFor, type AcceptedCut, type Band, type Period } from '@/lib/periods'
import { lineFor, type Decision } from '@/lib/overtime'
import { ORDER_HEADER_SELECT, SELL_LINE_TERMS_SELECT, periodTermsFor, type OrderHeader, type AgreementTerms } from '@/lib/money/order-terms'
import { receiptFor } from '@/lib/money/rung-billing'
import type { Carried } from '@/lib/money/client-overtime'
import { carriedForLines } from '@/lib/money/client-overtime-read'
import { drawnOnOrder } from '@/lib/money/order-drawn'
import { payersOwn } from '@/lib/money/expense-acceptance'
import { acceptancesOn } from '@/lib/money/expense-acceptance-read'

/**
 * A line as this file needs to read it: the money on it, and the records
 * it was priced from.
 *
 * Deliberately structural rather than a Prisma type — two callers load
 * it, and a shape they both satisfy is what stops them drifting apart.
 */
export interface PricedLine {
  hours: unknown
  rateCents: number
  amountCents: number
  sellContractId: string | null
  /**
   * The contract this line bills — which, in a chain, is not the one
   * the hours were filed on. Its terms price the line: a prime's
   * overtime and straddle with its client are its own, exactly as its
   * rate is. Optional so a caller that has not loaded it falls back to
   * the timesheet's, which is the same row on every direct placement.
   */
  sellContract?: {
    overtimeAfterHours: number | null
    overtimeMultiplierBps: number
    billStraddle: string
    workOrder?: OrderHeader | null
    requirement?: { hoursPerWeek: number | null } | null
  } | null
  timesheet: {
    id: string
    periodStart: Date
    periodEnd: Date
    totalHours: unknown
    days: unknown
    leaveDays: unknown
    sellContractId: string
    overtimeDecisions: {
      sellContractId: string
      weekOf: Date
      treatment: string
      appliedBps: number
      overtimeHours: unknown
      accrualBps: number
    }[]
    sellContract: {
      overtimeAfterHours: number | null
      overtimeMultiplierBps: number
      /**
       * The line's own copy, and the document it sits on. Which of the
       * two answers is `lib/money/order-terms`' decision and not this
       * file's — a week that crosses a month end goes where the purchase
       * order says it goes.
       */
      billStraddle: string
      workOrder?: OrderHeader | null
      /** The job's hours, the line a decided week was judged against where the contract draws none. */
      requirement?: { hoursPerWeek: number | null } | null
    }
  } | null
}

export interface Working {
  /** The two or three lines a paper invoice would have printed. */
  bands: Band[]
  /** What the line is worth above plain hours × rate. */
  premiumCents: number
  /** The hours the pricing bills — never an undecided or banked one. */
  hours: number
}

/**
 * Price a line again from the approval records, and cut the answer into
 * the bands a person would expect to read.
 *
 * One function, two readers. The three-way match asks it whether the
 * line's arithmetic stands up, and the invoice screen asks it what to
 * print under the amount — and because it is the same call, a client
 * cannot be shown a working the match disagrees with.
 *
 * Null where there is nothing to recompute from: no timesheet behind the
 * line, no decision on this leg, or straight-time work. Then the line is
 * hours × rate and always was, which is what every invoice raised before
 * overtime became a decision looks like.
 */
export function recompute(
  line: PricedLine,
  period: Period,
  accepted: AcceptedCut | null = null,
  carried: Carried | null = null
): Working | null {
  const ts = line.timesheet
  if (!ts) return null

  // Below the top of a chain (the founder, 2026-10-19): which hours are
  // overtime is the client's answer, and what each is worth is the pair's
  // own multiplier (lib/money/client-overtime). A week that cannot be
  // read that way is not priced at all.
  if (carried && !carried.ok) return null

  // The answers on the leg being billed, or — in a chain, where approval
  // records one decision per timesheet — the ones on the leg the hours
  // live on. Same rule the invoice priced by.
  const ownLeg = ts.overtimeDecisions.filter(
    (d) => d.sellContractId === (line.sellContractId ?? ts.sellContractId)
  )
  const answering = ownLeg.length > 0 ? ownLeg : ts.overtimeDecisions
  // A payer that accepted fewer hours than were worked is priced from
  // the days whether or not anybody decided overtime: the cut is placed
  // on the days (rule 4), and that is what the line is checked against.
  if ((carried ? carried.decisions.length === 0 : answering.length === 0) && !accepted) return null

  const decisions: Decision[] = carried
    ? carried.decisions
    : answering.map((d) => ({
        weekOf: d.weekOf.toISOString().slice(0, 10),
        treatment: d.treatment as Decision['treatment'],
        appliedBps: d.appliedBps,
        overtimeHours: Number(d.overtimeHours),
        accrualBps: d.accrualBps,
      }))

  // Priced on the terms of the contract being billed, the way the
  // generator priced it (`ours` in api/invoices/generate). Reading the
  // timesheet's own contract here judged a prime's line by its sub's
  // agreement.
  const billed = line.sellContract ?? ts.sellContract

  const billable = billableInPeriod(
    {
      id: ts.id,
      periodStart: ts.periodStart,
      periodEnd: ts.periodEnd,
      days: (ts.days as Record<string, number>) ?? {},
      leaveDays: (ts.leaveDays as Record<string, number>) ?? {},
      totalHours: Number(ts.totalHours),
    },
    period,
    periodTermsFor('SELL', {
      startDate: ts.periodStart,
      billStraddle: billed.billStraddle,
      workOrder: billed.workOrder ?? null,
      msa: (billed as { msa?: AgreementTerms | null }).msa ?? null,
      termsDifferReason: (billed as { termsDifferReason?: string | null }).termsDifferReason ?? null,
    }).straddle,
    line.rateCents,
    // The line the week was decided against: the contract's own, else
    // the job's hours where somebody decided it — as the bill was priced.
    // Below the top, the client's line, as its answers were made.
    carried
      ? carried.policy
      : lineFor(billed, billed.requirement ?? ts.sellContract.requirement, { stillToSign: false, decided: decisions.length > 0 }),
    decisions,
    accepted
  )
  if (!billable) return null

  const bands = bandsOf(billable.split, line.rateCents)

  return {
    // Shown only where they add up to what was actually billed. A
    // working a cent out of the amount beside it is the same fault as a
    // line that does not multiply out, and the honest answer is to print
    // the amount and say what it is made of in words instead.
    bands: bands.reduce((n, b) => n + b.amountCents, 0) === line.amountCents ? bands : [],
    premiumCents: billable.value.totalCents - Math.round(Number(line.hours) * line.rateCents),
    hours: billable.hours,
  }
}


/**
 * Load the three records and match them.
 *
 * Kept apart from any route because more than one path needs the same
 * answer — reviewing an invoice, submitting it, approving it for payment —
 * and a control that each caller re-implements is a control that eventually
 * disagrees with itself.
 */
/**
 * One line as the payer decides on it: who, which days, the hours billed
 * against the hours the payer signed, and the rate against the
 * contract's. Returned beside the match so a screen can say "Bills 40 h;
 * 38 h were signed" without re-deriving what the match already knows.
 */
export interface LineFact {
  lineId: string
  kind: 'HOURS' | 'EXPENSE' | 'MILESTONE'
  personId: string | null
  personName: string
  /** The job the line bills, where one is on the contract. */
  jobTitle: string | null
  /** The job request behind the contract — where a question about it is asked. */
  requirementId: string | null
  /** YYYY-MM-DD, the week's own dates on an hours line. */
  periodStart: string | null
  periodEnd: string | null
  hoursBilled: number
  /** What the payer signed. Null where nobody has, or on a line with no hours. */
  hoursSigned: number | null
  rateCents: number
  /** The contract's rate on the day the work was done. Null on a line with no hours. */
  contractRateCents: number | null
  amountCents: number
}

export type MatchWithLines = MatchResult & {
  lines: LineFact[]
  /** Where an exception was recorded for another total and so no longer stands — the sentence. */
  voidedWaiver?: string | null
}

/** Everything the check reads off an invoice, in one load. */
const MATCH_INCLUDE = {
      invoiceLines: {
        include: {
          person: { select: { name: true } },
          // The contract the line bills. In a chain the hours are filed
          // once, on the rung that employs the person, and every rung
          // above bills them at its own rate — so the timesheet's
          // contract is the wrong place to read what this line should
          // cost. It carried the sub's rate: Helena Marsh's $145 line to
          // Northbend Athletic was held to Techpeple's $118 wherever no
          // opening rate-history row happened to mask it.
          sellContract: {
            select: {
              billRate: true, startDate: true,
              // The job the line bills, and the request behind it — what
              // a payer reads a line by and where it asks about one.
              requirementId: true,
              requirement: { select: { title: true, hoursPerWeek: true } },
              // Who pays this line — whose signature on the week is its
              // receipt.
              clientCompanyId: true,
              overtimeAfterHours: true, overtimeMultiplierBps: true,
              billFrequency: true, billAnchor: true, billStraddle: true,
              workOrder: { select: ORDER_HEADER_SELECT },
              // The agreement first, as the bill was priced (2026-10-18).
              ...SELL_LINE_TERMS_SELECT,
            },
          },
          expense: { select: { id: true, status: true, total: true } },
          milestone: { select: { id: true, status: true, amountCents: true } },
          timesheet: {
            select: {
              id: true, status: true, totalHours: true,
              // Both ends. The engine needs to know when the work was
              // done, not just when to price it from.
              periodStart: true, periodEnd: true,
              sellContractId: true,
              // The daily hours and the answers given about the weeks
              // that went over the line, so the extension check can add
              // up a premium somebody signed instead of calling it bad
              // arithmetic.
              days: true, leaveDays: true,
              overtimeDecisions: true,
              // Every live signature on the week. The receipt behind a
              // line is the payer's own, and nobody else's.
              assertions: {
                where: { state: 'LIVE' },
                select: { companyId: true, role: true, hours: true, coversFrom: true, coversTo: true },
              },
              sellContract: {
                select: {
                  billRate: true, startDate: true,
                  requirement: { select: { hoursPerWeek: true } },
                  companyId: true, clientCompanyId: true, endClientCompanyId: true,
                  overtimeAfterHours: true, overtimeMultiplierBps: true,
                  billFrequency: true, billAnchor: true, billStraddle: true,
                  workOrder: { select: ORDER_HEADER_SELECT },
                  ...SELL_LINE_TERMS_SELECT,
                },
              },
            },
          },
        },
      },
      workOrder: true,
      matchOverrides: { include: { by: { select: { name: true } } } },
      engagement: {
        select: { sellContracts: { select: { workOrderId: true }, take: 1 } },
      },
    } satisfies Prisma.InvoiceInclude

type LoadedInvoice = Prisma.InvoiceGetPayload<{ include: typeof MATCH_INCLUDE }>

/** What several invoices share and is read once for all of them. */
interface SharedFacts {
  /** Every standing invoice on each order the invoices draw on. */
  onOrders: Array<{ id: string; workOrderId: string | null; total: { toString(): string } }>
  /** What typed-in invoice receipts drew on each order, in the order's currency. */
  receiptsDrawn: Map<string, number>
  rateRows: Array<{ id: string; contractId: string; rate: number; fromDate: Date; toDate: Date | null; approvalState: string }>
  carried: Map<string, Carried>
  expenseDecisions: Awaited<ReturnType<typeof acceptancesOn>>
}

export async function matchInvoice(invoiceId: string): Promise<MatchWithLines | null> {
  return (await matchInvoices([invoiceId])).get(invoiceId) ?? null
}

/**
 * The three-way check on several invoices, read in one pass.
 *
 * The same check as `matchInvoice`, line for line: each invoice is
 * computed alone (`matchFrom`); only the reads are shared. The twin's
 * daily run checked every pending receipt one at a time, five reads a
 * receipt and a dozen statements behind the first (regulatory's profile,
 * 2026-10-20). An invoice that does not exist is absent from the map.
 */
export async function matchInvoices(invoiceIds: readonly string[]): Promise<Map<string, MatchWithLines>> {
  const out = new Map<string, MatchWithLines>()
  const ids = [...new Set(invoiceIds)]
  if (ids.length === 0) return out
  const invoices = await prisma.invoice.findMany({ where: { id: { in: ids } }, include: MATCH_INCLUDE })
  if (invoices.length === 0) return out

  const allLines = invoices.flatMap((i) => i.invoiceLines)
  const orders = [...new Map(invoices.flatMap((i) => (i.workOrderId && i.workOrder ? [[i.workOrder.id, i.workOrder] as const] : []))).values()]
  const orderIds = [...new Set(invoices.flatMap((i) => (i.workOrderId ? [i.workOrderId] : [])))]
  const contractIds = [...new Set(allLines.flatMap((l) => (l.sellContractId ? [l.sellContractId] : [])))]
  const [onOrders, drawn, rateRows, carried, expenseDecisions] = await Promise.all([
    orderIds.length
      ? prisma.invoice.findMany({
          where: { workOrderId: { in: orderIds }, status: { notIn: ['VOID', 'CANCELLED', 'DRAFT'] } },
          select: { id: true, workOrderId: true, total: true },
        })
      : Promise.resolve([]),
    // And the invoice receipts the payer typed in against each order
    // (lib/money/order-drawn): one order filled once by each path was
    // paid twice past its ceiling, because each check counted only its
    // own kind. Only those in the order's currency are added.
    Promise.all(orders.map(async (o) => [o.id, (await drawnOnOrder(o, { only: 'RECEIPTS' })).cents] as const)),
    contractIds.length
      ? prisma.rateHistory.findMany({
          where: { contractType: 'SELL', contractId: { in: contractIds } },
          select: { id: true, contractId: true, rate: true, fromDate: true, toDate: true, approvalState: true },
        })
      : Promise.resolve([]),
    // Below the top of a chain, the client's answer on which hours are
    // overtime, at the multiplier on the seller's own line (the founder,
    // 2026-10-19). A line billing the top is not in the map.
    carriedForLines(allLines),
    acceptancesOn(allLines.flatMap((l) => (l.expenseId ? [l.expenseId] : []))),
  ])
  const facts: SharedFacts = { onOrders, receiptsDrawn: new Map(drawn), rateRows, carried, expenseDecisions }
  for (const inv of invoices) out.set(inv.id, matchFrom(inv, facts))
  return out
}

/** The check on one loaded invoice. No database: everything it reads was read above. */
function matchFrom(invoice: LoadedInvoice, facts: SharedFacts): MatchWithLines {

  const inv = invoice

  // What else has drawn on this purchase order. Computed rather than stored:
  // a denormalised balance drifts, and a drifted ceiling is worse than none.
  let consumedCents = 0
  if (invoice.workOrderId) {
    const others = facts.onOrders.filter((o) => o.workOrderId === invoice.workOrderId && o.id !== invoice.id)
    consumedCents = others.reduce((s, i) => s + decimalToCents(i.total), 0)
    // And the invoice receipts the payer typed in against the same order.
    if (invoice.workOrder) consumedCents += facts.receiptsDrawn.get(invoice.workOrder.id) ?? 0
  }

  // The rate the contract carried on the day the work was done. Amendments
  // are effective-dated and approved, so a rate that genuinely changed is
  // expressed on the contract rather than argued about on the invoice.
  const rateRows = facts.rateRows

  function contractedRateFor(contractId: string, fallbackCents: number, asOf: Date): number {
    return rateInForce(
      fallbackCents,
      rateRows
        .filter(r => r.contractId === contractId)
        .map(r => ({
          id: r.id, rateCents: r.rate, fromDate: r.fromDate,
          toDate: r.toDate, approvalState: r.approvalState,
        })),
      asOf
    ).rateCents
  }

  // What the contract says this invoice should be billing.
  //
  // Read from the first line's contract: an invoice consolidates people on
  // one engagement, and an engagement carries one billing cycle. Null when
  // no line has a contract to ask, in which case the check stays silent
  // rather than inventing an opinion.
  const withHours = invoice.invoiceLines.find(l => l.timesheet)
  const terms = withHours?.sellContract ?? withHours?.timesheet?.sellContract
  const contractPeriod = terms ? periodFor(invoice.periodStart, periodTermsFor('SELL', terms)) : null

  const billedPeriod: Period = { start: inv.periodStart, end: inv.periodEnd, label: '' }
  // Below the top of a chain, the client's answer on which hours are
  // overtime, at the multiplier on the seller's own line (the founder,
  // 2026-10-19). A line billing the top is not in the map.
  const carried = facts.carried
  const premiumOn = (line: PricedLine & { id: string }): number | null =>
    recompute(line, billedPeriod, null, carried.get(line.id) ?? null)?.premiumCents ?? null

  // ── The receipt is the payer's signature ────────────────────────────
  //
  // The founder, 2026-09-28 (CLAUDE.md, "What each rung may bill, and
  // when"). A bill upward is matched against the signature of the firm
  // it is addressed to — the client's at the top of a chain and on a
  // direct placement, the firm above's on a rung below — and never
  // against `Timesheet.status`, which turns APPROVED only once the
  // employer at the bottom has accepted. That column held Computer
  // Systems' bill to Northbend, raised on Northbend's signature, until
  // Techpeple two rungs below it had signed.
  //
  // The hours checked are the payer's accepted hours, at every rung:
  // Techpeple's bill for forty where Computer Systems accepted thirty-eight
  // fails the hours check, and so does Computer Systems' bill for forty
  // where Northbend signed thirty-eight.
  const receiptOf = (l: (typeof invoice.invoiceLines)[number]) => {
    const ts = l.timesheet!
    return receiptFor(l.sellContract?.clientCompanyId ?? ts.sellContract.clientCompanyId, {
      periodStart: ts.periodStart,
      periodEnd: ts.periodEnd,
      totalHours: Number(ts.totalHours),
      days: (ts.days as Record<string, number>) ?? {},
      personName: l.person?.name ?? '',
      hoursContract: {
        companyId: ts.sellContract.companyId,
        clientCompanyId: ts.sellContract.clientCompanyId,
        endClientCompanyId: ts.sellContract.endClientCompanyId,
      },
      assertions: ts.assertions,
    })
  }

  // Where the payer accepted fewer hours than were worked, or only some
  // days, the line is checked against the days priced with that cut —
  // the same call generation made (the founder, 2026-09-29, rule 4) — so
  // a bill made by the rule passes, and a bill for the hours worked fails
  // the hours check.
  const cutPricing = (l: (typeof invoice.invoiceLines)[number]): Working | null => {
    const r = receiptOf(l)
    return r.cut ? recompute(l, billedPeriod, r.cut, carried.get(l.id) ?? null) : null
  }
  const approvedOn = (l: (typeof invoice.invoiceLines)[number]): number =>
    cutPricing(l)?.hours ?? receiptOf(l).hours

  // ── A waiver describes one total ────────────────────────────────────
  //
  // The same rule as a typed-in receipt (lib/money/keyed-lines). The
  // exception stored the total it was granted at and was honored whatever
  // the total became, so a waiver granted on $4,800 went on covering the
  // same invoice at $12,000. Now it is void once the total changes, said
  // in a sentence, and somebody records it again if it still stands.
  const waivers = liveWaivers(
    invoice.matchOverrides.map(o => ({
      code: o.code,
      reason: o.reason,
      byName: o.by.name,
      at: o.createdAt,
      totalCentsAtOverride: o.invoiceTotalCentsAtOverride,
    })),
    decimalToCents(invoice.total),
    invoice.currency,
    'invoice'
  )

  // ── What the payer accepted of each expense on the bill ─────────────
  //
  // An expense is accepted like a week (the founder, 2026-10-19): the
  // receipt behind an expense line is the payer's own acceptance — the
  // customer on the line billed — for exactly what it accepted, never the
  // employer's approval of what the worker claimed.
  const expenseDecisions = facts.expenseDecisions
  const expenseReceipt = new Map<string, { cents: number | null; says: string | null }>()
  for (const l of invoice.invoiceLines) {
    if (!l.expense || !l.sellContract) continue
    const own = payersOwn(l.sellContract.clientCompanyId, expenseDecisions.get(l.expense.id) ?? [])
    expenseReceipt.set(l.expense.id, {
      cents: own.kind === 'ACCEPTED' ? own.cents : null,
      says: own.kind === 'ACCEPTED'
        ? null
        : `${l.person?.name ?? 'This'}’s expense: the firm this bill is to has ${own.kind === 'SENT_BACK' ? 'sent it back' : 'not accepted it'}, so there is nothing to pay it against.`,
    })
  }

  const input: MatchInput = {
    invoice: {
      id: invoice.id,
      totalCents: decimalToCents(invoice.total),
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      contractPeriod,
    },
    lines: invoice.invoiceLines.map(l => ({
      id: l.id,
      timesheetId: l.timesheetId,
      expenseId: l.expenseId,
      milestoneId: l.milestoneId,
      personName: l.person?.name ?? (l.milestone ? 'Milestone' : 'Expense'),
      hours: Number(l.hours),
      rateCents: l.rateCents,
      amountCents: l.amountCents,
      // A line priced straight — more hours accepted than worked, which
      // `whatTheRungBills` refuses on any week with overtime in it — has
      // no premium recomputed onto it. A cut week's premium is the one
      // left on its days after the cut.
      premiumCents: !l.timesheet
        ? premiumOn(l)
        : receiptOf(l).straight
          ? 0
          : receiptOf(l).cut
            ? (cutPricing(l)?.premiumCents ?? null)
            : premiumOn(l),
    })),
    milestones: Object.fromEntries(
      invoice.invoiceLines
        .flatMap(l => (l.milestone ? [l.milestone] : []))
        .map(m => [m.id, { id: m.id, status: m.status, amountCents: m.amountCents }])
    ),
    expenses: Object.fromEntries(
      invoice.invoiceLines
        .flatMap(l => (l.expense ? [l.expense] : []))
        .map(e => [e.id, {
          id: e.id, status: e.status, totalCents: decimalToCents(e.total),
          ...(expenseReceipt.has(e.id) ? { acceptedCents: expenseReceipt.get(e.id)!.cents } : {}),
        }])
    ),
    timesheets: Object.fromEntries(
      invoice.invoiceLines
        // An expense line has no timesheet behind it; the engine reads
        // its amount and checks nothing about hours.
        .flatMap(l => (l.timesheet ? [{ ...l, timesheet: l.timesheet }] : []))
        .map(l => [
          l.timesheet.id,
          {
            id: l.timesheet.id,
            // APPROVED to the engine where the payer has signed, whatever
            // the rungs below have or have not done.
            status: receiptOf(l).signed ? 'APPROVED' : l.timesheet.status === 'APPROVED' ? 'SUBMITTED' : l.timesheet.status,
            approvedHours: approvedOn(l),
            periodStart: l.timesheet.periodStart,
            periodEnd: l.timesheet.periodEnd,
            // Resolved as of the work period, not "whatever the contract
            // says today" — otherwise amending a rate retroactively breaks
            // every invoice already paid.
            contractRateCents: contractedRateFor(
              l.sellContractId ?? l.timesheet.sellContractId,
              // The billed contract's own rate where no amendment is in
              // force — never the rung underneath it.
              l.sellContract?.billRate ?? l.timesheet.sellContract.billRate,
              l.timesheet.periodStart
            ),
            // The unique constraint on InvoiceLine.timesheetId means a
            // timesheet reachable from THIS invoice cannot also be on
            // another, so this is always self-referential here. It stays in
            // the engine's input because the engine is also used to check
            // an invoice before its lines are written.
            alreadyBilledOnInvoiceId: invoice.id,
          },
        ])
    ),
    po: invoice.workOrder
      ? {
          id: invoice.workOrder.id,
          number: invoice.workOrder.number,
          status: invoice.workOrder.status,
          amountCents: decimalToCents(invoice.workOrder.amount),
          consumedCents,
          startDate: invoice.workOrder.startDate,
          endDate: invoice.workOrder.endDate,
        }
      : null,
    // A PO is required once the contract being billed was raised against one.
    poRequired: Boolean(invoice.engagement.sellContracts[0]?.workOrderId),
    // Exceptions an AP clerk has recorded, while the invoice is still for
    // the total each was granted at. The engine decides which of them it
    // will honor; a waiver on a duplicate payment is simply ignored.
    overrides: waivers.live,
    receiptSays: Object.fromEntries(
      invoice.invoiceLines.flatMap(l => {
        const says = l.expenseId ? expenseReceipt.get(l.expenseId)?.says : null
        return says ? [[l.id, says]] : []
      })
    ),
  }

  const result = threeWayMatch(input)
  const lines: LineFact[] = invoice.invoiceLines.map((l) => {
    const ts = input.timesheets[l.timesheetId ?? '']
    return {
      lineId: l.id,
      kind: l.timesheet ? 'HOURS' : l.milestone ? 'MILESTONE' : 'EXPENSE',
      personId: l.personId ?? null,
      personName: l.person?.name ?? (l.milestone ? 'Milestone' : 'Expense'),
      jobTitle: l.sellContract?.requirement?.title ?? null,
      requirementId: l.sellContract?.requirementId ?? null,
      periodStart: l.timesheet ? l.timesheet.periodStart.toISOString().slice(0, 10) : null,
      periodEnd: l.timesheet ? l.timesheet.periodEnd.toISOString().slice(0, 10) : null,
      hoursBilled: Number(l.hours),
      hoursSigned: ts && ts.status === 'APPROVED' ? ts.approvedHours : null,
      rateCents: l.rateCents,
      contractRateCents: ts ? ts.contractRateCents : null,
      amountCents: l.amountCents,
    }
  })
  return { ...result, lines, voidedWaiver: waivers.voided }
}

// ── The payer's gate: may this invoice receipt be paid now? ───────────
//
// One gate, read by every door that says "yes, pay it" on an `Invoice`
// a supplier sent: the AP desk recording a payment
// (POST /api/invoices/:id/payments) and the job twin approving a clean
// receipt. Decided 2026-10-12, over adding an "approved for payment"
// status: on an `Invoice` the match IS the approval. The payment door
// re-runs the three-way check at the moment money leaves, and the AP
// desk's decision on a variance is an exception with a reason
// (`InvoiceMatchOverride`, POST /api/invoices/:id/match/override), which
// the check reads as passing. A status beside that would be a second
// gate nothing on the human path sets, and would let a stale "approved"
// stand after the hours under it moved. So a twin's yes is a ledger
// entry over this gate's answer; it moves no status and waives nothing.
//
// Order: the document's own state first (a cancelled or paid invoice
// says so, rather than whatever its re-run match says), then the hold,
// then the match.

export type PayRefusalCode = 'NOT_SUBMITTED' | 'HELD' | 'INVALID_STATE' | 'MATCH_FAILED'

export type PayGate =
  | { ok: true }
  | { ok: false; code: PayRefusalCode; says: string }

/** The refusal the document's status alone decides, or null. No database. */
export function receiptStateRefusal(inv: { number: string; status: string }): PayGate | null {
  switch (inv.status) {
    case 'ISSUED':
      return {
        ok: false, code: 'NOT_SUBMITTED',
        says: `Invoice ${inv.number} has not been submitted yet. Your supplier sends it through the three-way check first; it can be paid once it has.`,
      }
    case 'DRAFT':
      return {
        ok: false, code: 'NOT_SUBMITTED',
        says: `Invoice ${inv.number} is still a draft at your supplier. It can be paid once it is submitted and passes the three-way check.`,
      }
    case 'HELD':
      return {
        ok: false, code: 'HELD',
        says: `Invoice ${inv.number} is on hold. Lift the hold on its page first, then pay it.`,
      }
    case 'CANCELLED':
    case 'VOID':
      return { ok: false, code: 'INVALID_STATE', says: 'Cannot record payment on a cancelled invoice' }
    case 'PAID':
      return { ok: false, code: 'INVALID_STATE', says: 'Invoice is already fully paid' }
    default:
      return null
  }
}

/** The refusal the three-way check decides, or null. No database. */
export function matchRefusal(
  number: string,
  match: { matched: boolean; summary: string; voidedWaiver?: string | null } | null,
): PayGate | null {
  if (!match) {
    return {
      ok: false, code: 'MATCH_FAILED',
      says: `Invoice ${number} could not be checked against its order and its weeks, so it cannot be paid on the check's say-so.`,
    }
  }
  if (match.matched) return null
  return {
    ok: false, code: 'MATCH_FAILED',
    says:
      `Invoice ${number} does not pass the check now: ${match.summary.replace(/[.\s]+$/, '')}. ` +
      (match.voidedWaiver ? `${match.voidedWaiver} ` : '') +
      `Fix it or record an exception with a reason on its page, then pay it.`,
  }
}

/**
 * Both refusals in the gate's order, over facts already loaded. No database.
 *
 * Payment is strict, and that is decided (CLAUDE.md, "Nine decisions",
 * item 3): the job twin's 0.5% hours tolerance decides what the twin
 * raises to a person, never what is paid. This gate pays only what passes
 * the three-way check — the accepted hours at the contract rate — or a
 * difference the AP desk waived with a reason. A client that wants a
 * payment tolerance asks for it, and it becomes a setting with its reason
 * beside it; nothing here reads the twin's tolerance.
 */
export function payGate(
  inv: { number: string; status: string },
  match: { matched: boolean; summary: string; voidedWaiver?: string | null } | null,
): PayGate {
  return receiptStateRefusal(inv) ?? matchRefusal(inv.number, match) ?? { ok: true }
}

/**
 * May the payer pay this invoice receipt now — the AP desk's own answer,
 * for a caller that holds only the id (the twin's approval performer).
 * Who the payer is and whether the caller sits at a desk that pays are
 * the caller's questions, as they are for `matchInvoice`. Writes nothing.
 */
export async function mayPayInvoiceReceipt(
  invoiceId: string,
): Promise<(PayGate & { match: MatchWithLines | null }) | null> {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { number: true, status: true } })
  if (!inv) return null
  const byState = receiptStateRefusal(inv)
  if (byState) return { ...byState, match: null }
  const match = await matchInvoice(invoiceId)
  return { ...payGate(inv, match), match }
}
