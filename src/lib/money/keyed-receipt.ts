/**
 * The three-way check on a typed-in invoice receipt — one check, read by
 * every door that records, re-checks, approves or pays one.
 *
 * ── Why this file ────────────────────────────────────────────────────
 *
 * Release walk, 2026-10-18. A supplier's invoice reaches the record two
 * ways: the supplier sends it here as an `Invoice` (checked by
 * `matchInvoice` and paid only through `mayPayInvoiceReceipt`), or the
 * payer keys in what it was sent, as a `VendorBill`. The second path
 * checked at intake and nowhere after. A receipt recorded as disputed
 * was paid by the next request; the same week under a second invoice
 * number was received clean and paid; a $4,720 receipt went through a
 * $1,000 order because the clerk had not typed the order in; and paying
 * one wrote no record of who paid whom.
 *
 * So the intake, the exception queue, the payment and the payment run all
 * ask this one question now, and the gate at the bottom is the payment's
 * answer, the same shape as `payGate` on the platform side.
 *
 * ── Two shapes, one check ────────────────────────────────────────────
 *
 * A receipt typed in as a total and a period is held to its amount: the
 * hours the payer accepted over the period at the agreed rate on each
 * day, exact (`AMOUNT`). Nobody may waive that, because a total cannot say
 * whether the hours or the rate differ.
 *
 * A receipt typed in with lines (`VendorBillLine`, 2026-10-18) is matched
 * line by line by the engine a platform invoice is matched by
 * (`threeWayMatch`): an hours line against the payer's own acceptance of
 * that week at the agreed rate, an expense line against the expense
 * approved on this buy line, a milestone line against the milestone
 * accepted on the order this receipt draws on. The lines must add up to
 * the total.
 *
 * Either shape may carry exceptions (`VendorBillMatchOverride`): a
 * difference the paying team waived with a reason, on exactly the checks
 * a platform invoice's may be waived on. A waiver describes one total; if
 * the total changes it is void.
 */

import { prisma } from '@/lib/db'
import { decimalsFor } from '@/lib/money'
import { priceByDay, ratePeriods, type RatePeriod } from '@/lib/contract-rate'
import { payersBook } from '@/lib/money/payers-acceptance-read'
import { notAcceptedSays, weekWord } from '@/lib/money/payers-acceptance'
import { drawnOnOrder } from '@/lib/money/order-drawn'
import { alreadyReceived, heldSays, type ReceiptAlready, type AcceptedWeekRead } from '@/lib/money/billed-elsewhere'
import { liveWaivers, type KeyedLine, type StoredWaiver } from '@/lib/money/keyed-lines'
import { recompute, type PricedLine, type Working } from '@/lib/invoice-match'
import { receiptFor } from '@/lib/money/rung-billing'
import { carriedOvertime, type TopLeg } from '@/lib/money/client-overtime'
import { topLegsOver } from '@/lib/money/client-overtime-read'
import { ORDER_HEADER_SELECT, SELL_LINE_TERMS_SELECT } from '@/lib/money/order-terms'
import { ladderFor } from '@/lib/work-chain-read'
import { descend } from '@/lib/work-chain'
import { overBillCheck } from '@/lib/purchase-order'
import { amount } from '@/lib/money-display'
import { formatDay } from '@/lib/format-date'
import { billsToPayer, payersOwn } from '@/lib/money/expense-acceptance'
import { acceptancesOn, legsFor, legsOverMany } from '@/lib/money/expense-acceptance-read'
import {
  matchVendorBill, threeWayMatch, OVERRIDABLE,
  type AcceptedWork, type MatchResult, type PurchaseOrderFacts,
  type InvoiceLineFacts, type TimesheetFacts, type ExpenseFacts, type MilestoneFacts,
} from '@/lib/three-way-match'
import type { WaitingWeek } from '@/lib/money/payers-acceptance'
import type { Prisma } from '@prisma/client'

export interface KeyedReceipt {
  /** Null while it is being recorded. */
  id: string | null
  companyId: string
  vendorCompanyId: string
  vendorName: string
  number: string
  buyContractId: string | null
  /** The order the clerk named, if any. Where none, the buy line's own. */
  workOrderId: string | null
  periodStart: Date | null
  periodEnd: Date | null
  currency: string
  totalCents: number
  /** What the supplier's invoice states, where the clerk typed it on a total-only receipt. Never stored. */
  hours?: number | null
  rateCents?: number | null
  /** When it was recorded; an earlier receipt keeps a week over a later one. */
  createdAt?: Date | null
  /** Its lines, where it was typed in with lines. Empty or absent: a total. */
  lines?: KeyedLine[] | null
  /** Exceptions recorded on it, live or not; which still stand is decided here. */
  waivers?: StoredWaiver[] | null
}

export interface KeyedCheck {
  match: MatchResult
  /** Weeks the payer has not accepted, and the sentence; null where every week is. */
  notAccepted: { says: string; waiting: WaitingWeek[] } | null
  /** A refusal nobody can wave through that the match does not carry, e.g. two currencies. */
  hard: { code: string; says: string } | null
  /** The order the receipt draws on — the clerk's, else the buy line's. */
  workOrderId: string | null
  /** The earlier document that already holds this work, where one does. */
  duplicate: { number: string; says: string } | null
  /** An exception recorded for a different total, and so no longer standing — the sentence. */
  voidedWaiver: string | null
  /**
   * The period the receipt covers: the one typed in, else the span of
   * what its lines bill. Null on a total with no period.
   */
  period: { start: Date; end: Date } | null
  /** Whose week or expense each line bills, by line id, read off the record — what a stored line names. */
  linePeople?: Record<string, string>
}

/**
 * Check one typed-in receipt against the order, the weeks the payer
 * accepted and every other receipt from the same supplier on the line.
 *
 * `then` is what the reader is doing, and it decides one thing: which
 * other receipt keeps a week. Recording, every live receipt already on
 * the record does. Paying, only one recorded earlier or already paid —
 * so where two were let in before this rule, the first is paid and the
 * second is refused, never both and never neither.
 */
export async function checkKeyedReceipt(r: KeyedReceipt, then: 'record' | 'pay'): Promise<KeyedCheck> {
  const currency = r.currency.toUpperCase()
  const buy = r.buyContractId
    ? await prisma.buyContract.findUnique({
        where: { id: r.buyContractId },
        select: { workOrderId: true, supplierSellContractId: true, overtimeMultiplierBps: true },
      })
    : null

  // The order: the clerk's, else the line's own. The walk's $4,720
  // receipt against a $1,000 order went through because the order was
  // only checked where somebody typed it in. A buy line on an order draws
  // on that order whether or not anybody says so.
  const workOrderId = r.workOrderId ?? buy?.workOrderId ?? null
  const order = await orderFacts(r, workOrderId)
  const waivers = liveWaivers(r.waivers ?? [], r.totalCents, currency)
  const others = await otherReceipts(r, then)

  if (r.lines && r.lines.length > 0) {
    return checkLines(r, then, { buy, workOrderId, order, waivers, others })
  }

  let accepted: AcceptedWork | null = null
  let expectedCents: number | null = null
  let overtimeCents = 0
  let hard = order.hard
  let notAccepted: KeyedCheck['notAccepted'] = null
  let weeks: AcceptedWeekRead[] = []

  // ── What we accepted, and what it comes to ─────────────────────────
  //
  // The paying firm's own signature on each week (lib/money/payers-
  // acceptance), each accepted day at the rate in force that day.
  if (r.buyContractId && r.periodStart && r.periodEnd) {
    const book = await payersBook({ buyContractId: r.buyContractId, periodStart: r.periodStart, periodEnd: r.periodEnd, then })
    if (book && book.waiting.length > 0) notAccepted = { says: book.notAccepted, waiting: book.waiting }
    const ours = book?.accepted ?? null
    if (ours) {
      const candidate = await prisma.buyContractCandidate.findFirst({
        where: { buyContractId: r.buyContractId },
        select: { payRate: true, payCurrency: true },
      })
      const periods = await buyRatePeriods(r.buyContractId)
      const priced = candidate
        ? ours.weeks.map((w) =>
            priceByDay({
              contractRateCents: candidate.payRate,
              periods,
              days: w.days,
              hours: w.hours,
              periodStart: w.periodStart,
              periodEnd: w.periodEnd,
            })
          )
        : []
      const rates = new Set(priced.flatMap((p) => p.days.map((d) => d.rateCents)))
      const firstRate = priced.find((p) => p.days.length > 0)?.firstRateCents ?? null
      accepted = {
        hours: ours.hours,
        // One rate where the period had one. Where a change fell inside
        // it, the rate on the first day stands for the rate check and the
        // amount below is priced by day.
        contractRateCents: (rates.size === 1 ? [...rates][0] : firstRate) ?? candidate?.payRate ?? ours.firstRateCents,
        firstDay: ours.firstDay,
        lastDay: ours.lastDay,
        count: ours.count,
      }
      // The overtime the client decided on each week, at this buy line's
      // multiplier, with what we did not accept cut off overtime first —
      // the same pricing as a line (`priceWeek`), week by week.
      if (candidate) {
        const sheets = await prisma.timesheet.findMany({ where: { id: { in: ours.weeks.map((w) => w.id) } }, select: WEEK_SELECT })
        const byId = new Map(sheets.map((t) => [t.id, t]))
        const tops = await topLegsOver(sheets.map((t) => t.sellContractId))
        ours.weeks.forEach((w, k) => {
          const t = byId.get(w.id)
          if (!t) return
          const p = priced[k]
          const rate = p?.firstRateCents ?? candidate.payRate
          const whose = `${t.person?.name ?? 'Somebody'}’s week of ${weekWord(t.periodStart)}`
          const week = priceWeek(t, {
            payerCompanyId: r.companyId,
            top: tops.get(t.sellContractId) ?? null,
            pairMultiplierBps: buy?.overtimeMultiplierBps ?? NaN,
            acceptedHours: w.hours,
            line: { hours: w.hours, rateCents: rate, amountCents: 0 },
          })
          if (week.says) {
            hard ??= { code: 'OVERTIME_UNREAD', says: `${whose}: ${week.says}` }
            return
          }
          const above = week.working?.premiumCents ?? 0
          if (above === 0) return
          if (new Set(p?.days.map((d) => d.rateCents) ?? []).size > 1) {
            hard ??= {
              code: 'RATE_CHANGED_IN_WEEK',
              says:
                `The agreed rate changed inside ${whose}, which has overtime the client decided, so what the ` +
                `week comes to is not priced on a guess.`,
            }
            return
          }
          overtimeCents += above
        })
      }
      if (candidate && candidate.payCurrency.toUpperCase() === currency) {
        // Rounded once per rate across the whole period, then the
        // overtime above it, each week's rounded once.
        const byRate = new Map<number, number>()
        for (const p of priced) for (const d of p.days) byRate.set(d.rateCents, (byRate.get(d.rateCents) ?? 0) + d.hours)
        expectedCents = [...byRate.entries()].reduce((n, [rate, h]) => n + Math.round(h * rate), 0) + overtimeCents
      }
      weeks = ours.weeks.map((w) => ({
        id: w.id,
        personName: w.personName ?? null,
        days: w.days,
        periodStart: w.periodStart.toISOString().slice(0, 10),
        periodEnd: w.periodEnd.toISOString().slice(0, 10),
      }))
    }
  }

  // ── The same work, already received ────────────────────────────────
  const duplicate = r.periodStart && r.periodEnd && weeks.length > 0
    ? alreadyReceived(
        { periodStart: r.periodStart.toISOString().slice(0, 10), periodEnd: r.periodEnd.toISOString().slice(0, 10) },
        weeks,
        others.receipts
      )
    : null

  const match = matchVendorBill({
    bill: {
      id: r.id ?? 'pending',
      number: r.number,
      totalCents: r.totalCents,
      currency,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      hours: r.hours ?? null,
      rateCents: r.rateCents ?? null,
      duplicateOfBillId: duplicate ? duplicate.number : null,
      duplicateSays: duplicate?.says ?? null,
    },
    accepted,
    po: order.po,
    poRequired: false,
    notAccepted: notAccepted?.says ?? null,
    expectedCents,
    overtimeCents,
    overrides: waivers.live,
  })

  return {
    match, notAccepted, hard, workOrderId, duplicate,
    voidedWaiver: waivers.voided,
    period: r.periodStart && r.periodEnd ? { start: r.periodStart, end: r.periodEnd } : null,
  }
}

// ── The order a receipt draws on ─────────────────────────────────────

async function orderFacts(
  r: KeyedReceipt,
  workOrderId: string | null,
): Promise<{ po: PurchaseOrderFacts | null; hard: KeyedCheck['hard'] }> {
  if (!workOrderId) return { po: null, hard: null }
  const currency = r.currency.toUpperCase()
  const order = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    select: {
      id: true, number: true, status: true, amount: true, currency: true,
      startDate: true, endDate: true, issuedById: true,
    },
  })
  if (!order || order.issuedById !== r.companyId) return { po: null, hard: null }
  const drawn = await drawnOnOrder(order, { vendorBillId: r.id })
  const facts = {
    id: order.id,
    number: order.number,
    status: order.status,
    amountCents: Math.round(parseFloat(order.amount.toString()) * 10 ** decimalsFor(order.currency)),
    consumedCents: drawn.cents,
    startDate: order.startDate,
    endDate: order.endDate,
  }
  const ceiling = overBillCheck(
    { billCents: r.totalCents, billCurrency: currency, periodStart: r.periodStart, periodEnd: r.periodEnd, po: { ...facts, currency: order.currency } },
    new Date()
  )
  const currencyRefusal = ceiling.problems.find((p) => !p.overridable)
  if (currencyRefusal) return { po: null, hard: { code: currencyRefusal.code, says: currencyRefusal.says } }
  if (drawn.foreign.length > 0) {
    // Never added across currencies, and never guessed past.
    return {
      po: null,
      hard: {
        code: 'PO_CURRENCY',
        says:
          `Order ${order.number} already has ${drawn.foreign.join(', ')} drawn on it in another currency, so what ` +
          `is left on it cannot be said and this invoice is not checked against it on a guess.`,
      },
    }
  }
  return { po: facts, hard: null }
}

// ── Every other live receipt from this supplier on this line ─────────

interface Others {
  /** As the week check reads them. */
  receipts: ReceiptAlready[]
  /** Every expense and milestone their lines bill, with the receipt holding it. */
  sums: { expenseId: string | null; milestoneId: string | null; receipt: ReceiptAlready }[]
}

async function otherReceipts(r: KeyedReceipt, then: 'record' | 'pay'): Promise<Others> {
  if (!r.buyContractId) return { receipts: [], sums: [] }
  const rows = await prisma.vendorBill.findMany({
    where: {
      companyId: r.companyId,
      vendorCompanyId: r.vendorCompanyId,
      buyContractId: r.buyContractId,
      // A cancelled receipt holds nothing: its week may be received again.
      status: { not: 'CANCELLED' },
      ...(r.id ? { id: { not: r.id } } : {}),
    },
    select: {
      number: true, periodStart: true, periodEnd: true, receivedAt: true, createdAt: true, paidCents: true,
      lines: { select: { timesheetId: true, expenseId: true, milestoneId: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  const keeping = then === 'record'
    ? rows
    : rows.filter((o) => o.paidCents > 0 || (r.createdAt != null && o.createdAt < r.createdAt))
  const receipts: ReceiptAlready[] = []
  const sums: Others['sums'] = []
  for (const o of keeping) {
    const read: ReceiptAlready = {
      number: o.number,
      vendorName: r.vendorName,
      periodStart: (o.periodStart ?? o.receivedAt).toISOString().slice(0, 10),
      periodEnd: (o.periodEnd ?? o.receivedAt).toISOString().slice(0, 10),
      receivedAt: o.receivedAt.toISOString(),
      heldTimesheetIds: o.lines.length > 0 ? o.lines.flatMap((l) => (l.timesheetId ? [l.timesheetId] : [])) : null,
    }
    // A total with no period holds no week: nothing says which.
    if (o.lines.length > 0 || (o.periodStart && o.periodEnd)) receipts.push(read)
    for (const l of o.lines) if (l.expenseId || l.milestoneId) sums.push({ expenseId: l.expenseId, milestoneId: l.milestoneId, receipt: read })
  }
  return { receipts, sums }
}

export async function buyRatePeriods(buyContractId: string): Promise<RatePeriod[]> {
  return ratePeriods(
    await prisma.rateHistory.findMany({
      where: { contractType: 'BUY', contractId: buyContractId },
      select: { id: true, rate: true, fromDate: true, toDate: true, approvalState: true },
    })
  )
}

// ── A receipt typed in with lines ────────────────────────────────────

const TERMS_SELECT = {
  overtimeAfterHours: true, overtimeMultiplierBps: true, billStraddle: true,
  companyId: true, clientCompanyId: true, endClientCompanyId: true,
  workOrder: { select: ORDER_HEADER_SELECT },
  requirement: { select: { hoursPerWeek: true } },
  ...SELL_LINE_TERMS_SELECT,
} as const

const EXPENSE_OK = ['APPROVED', 'INVOICED', 'PAID']
const MILESTONE_OK = ['ACCEPTED', 'INVOICED']

const plain = (d: Date) => formatDay(d)

/** One week as its overtime is priced on an invoice receipt. */
const WEEK_SELECT = {
  id: true, personId: true, periodStart: true, periodEnd: true, totalHours: true, days: true, leaveDays: true,
  sellContractId: true,
  person: { select: { name: true } },
  overtimeDecisions: {
    select: {
      sellContractId: true, weekOf: true, treatment: true, appliedBps: true, overtimeHours: true, accrualBps: true,
      afterHours: true, decidedByCompanyId: true,
    },
  },
  // Every live signature on the week: the payer's own is the receipt, read
  // the way a bill upward reads it (lib/money/rung-billing).
  assertions: {
    where: { state: 'LIVE' as const },
    select: { companyId: true, role: true, hours: true, coversFrom: true, coversTo: true },
  },
  sellContract: { select: TERMS_SELECT },
} as const

type WeekRow = Prisma.TimesheetGetPayload<{ select: typeof WEEK_SELECT }>

/**
 * What one week on a supplier's invoice to us is worth above its hours at
 * the line's rate — the overtime the client decided, at our own line's
 * multiplier with that supplier — and the hours that pricing bills.
 *
 * The founder, 2026-10-19 (lib/money/client-overtime): which hours are
 * overtime is the answer the client gave when it signed the week, never
 * the supplier's own contract alone; what an overtime hour is worth is
 * this pair's agreement, the multiplier on our buy line. Where we
 * accepted fewer hours than were worked, the cut comes off overtime
 * first and off the last day first, as on any bill (rule 4 of
 * 2026-09-29, `acceptedDays` in lib/periods) — never the worker-pay rule,
 * which is the employer's and is not read here.
 *
 * Null where the week is plain hours × rate: nobody decided overtime on
 * it and we accepted it whole, we accepted more than was worked, it has
 * no daily hours to price, or only some of its days fall under this buy
 * line (`acceptedHours` then differs from our signature). `says` where it
 * cannot be read at all.
 */
function priceWeek(
  t: WeekRow,
  i: { payerCompanyId: string; top: TopLeg | null; pairMultiplierBps: number; acceptedHours: number; line: { hours: number; rateCents: number; amountCents: number } },
): { working: Working | null; says: string | null } {
  const days = (t.days as Record<string, number> | null) ?? {}
  if (!Object.values(days).some((h) => Number(h) > 0)) return { working: null, says: null }
  const sig = receiptFor(i.payerCompanyId, {
    periodStart: t.periodStart,
    periodEnd: t.periodEnd,
    totalHours: Number(t.totalHours),
    days,
    personName: t.person?.name ?? '',
    hoursContract: {
      companyId: t.sellContract.companyId,
      clientCompanyId: t.sellContract.clientCompanyId,
      endClientCompanyId: t.sellContract.endClientCompanyId,
    },
    assertions: t.assertions,
  })
  if (!sig.signed || sig.straight || Math.abs(sig.hours - i.acceptedHours) > 0.005) return { working: null, says: null }
  const carried = carriedOvertime(t.overtimeDecisions, i.top, i.pairMultiplierBps, t.person?.name ?? 'this person')
  if (!carried.ok) return { working: null, says: carried.says }
  const priced: PricedLine = {
    hours: i.line.hours, rateCents: i.line.rateCents, amountCents: i.line.amountCents,
    sellContractId: null,
    sellContract: t.sellContract,
    timesheet: t,
  }
  // The week's own dates: a line bills one whole week.
  return { working: recompute(priced, { start: t.periodStart, end: t.periodEnd, label: '' }, sig.cut, carried), says: null }
}

/**
 * Match a receipt's lines, the way a platform invoice's lines are
 * matched (`threeWayMatch`), against what this payer holds:
 *
 *   an hours line   the week the payer itself accepted (lib/money/payers-
 *                   acceptance), the hours accepted, at the buy line's
 *                   rate in force on those days — a week whose days fall
 *                   under two rates cannot be stated as one line at one
 *                   rate, and is refused rather than priced on a guess;
 *   an expense line an expense approved on this buy line — incurred on a
 *                   contract this line pays for, by a person on it, for
 *                   the client's account — for exactly its amount;
 *   a milestone     a milestone accepted on the order this receipt draws
 *                   on, for exactly its amount.
 *
 * A premium on an hours line is the overtime the client decided when it
 * signed the week, at the multiplier on this buy line (`priceWeek`, the
 * founder's decision of 2026-10-19), whether or not the supplier is on
 * the platform; where we accepted fewer hours than were worked the cut
 * comes off overtime first. A line asking for a premium on hours the
 * client did not decide as overtime fails the arithmetic, which nobody
 * may waive.
 */
async function checkLines(
  r: KeyedReceipt,
  then: 'record' | 'pay',
  ctx: {
    buy: { workOrderId: string | null; supplierSellContractId: string | null; overtimeMultiplierBps: number } | null
    workOrderId: string | null
    order: { po: PurchaseOrderFacts | null; hard: KeyedCheck['hard'] }
    waivers: ReturnType<typeof liveWaivers>
    others: Others
  },
): Promise<KeyedCheck> {
  const lines = r.lines!
  const currency = r.currency.toUpperCase()
  let hard = ctx.order.hard
  let notAccepted: KeyedCheck['notAccepted'] = null
  const says: Record<string, string> = {}
  /** Lines whose receipt is refused before the engine sees them: passed with no id, so RECEIPT fails with the sentence. */
  const unwitnessed = new Set<string>()
  const refuse = (l: KeyedLine, sentence: string) => { says[l.id] = sentence; unwitnessed.add(l.id) }
  const n = (l: KeyedLine) => `Line ${lines.indexOf(l) + 1}`

  const timesheets: Record<string, TimesheetFacts> = {}
  const expenses: Record<string, ExpenseFacts> = {}
  const milestones: Record<string, MilestoneFacts> = {}
  const premium = new Map<string, number | null>()
  const personOf = new Map<string, string>()
  const linePeople: Record<string, string> = {}
  const spans: { start: Date; end: Date }[] = []

  const hoursLines = lines.filter((l) => l.timesheetId)
  const expenseLines = lines.filter((l) => l.expenseId)
  const milestoneLines = lines.filter((l) => l.milestoneId)

  const candidates = r.buyContractId
    ? await prisma.buyContractCandidate.findMany({
        where: { buyContractId: r.buyContractId },
        select: { personId: true, payRate: true, payCurrency: true },
      })
    : []

  if ((hoursLines.length > 0 || expenseLines.length > 0) && !r.buyContractId) {
    hard ??= {
      code: 'NO_BUY_LINE',
      says: 'A week or an expense on an invoice receipt is checked against what was accepted on one buy line. Name the buy line this invoice is for.',
    }
  }

  // ── Hours lines ─────────────────────────────────────────────────────
  const weeksRead: AcceptedWeekRead[] = []
  if (hoursLines.length > 0 && r.buyContractId) {
    const ids = [...new Set(hoursLines.map((l) => l.timesheetId!))]
    const sheets = await prisma.timesheet.findMany({ where: { id: { in: ids } }, select: WEEK_SELECT })
    const byId = new Map(sheets.map((t) => [t.id, t]))
    const from = sheets.reduce<Date | null>((a, t) => (!a || t.periodStart < a ? t.periodStart : a), null)
    const to = sheets.reduce<Date | null>((a, t) => (!a || t.periodEnd > a ? t.periodEnd : a), null)
    const book = from && to
      ? await payersBook({ buyContractId: r.buyContractId, periodStart: from, periodEnd: to, then })
      : null
    const accepted = new Map((book?.accepted?.weeks ?? []).map((w) => [w.id, w]))
    const waiting = (book?.waiting ?? []).filter((w) => ids.includes(w.id))
    if (waiting.length > 0) {
      const payer = await prisma.company.findUnique({ where: { id: r.companyId }, select: { name: true } })
      notAccepted = { says: notAcceptedSays(payer?.name ?? 'This company', waiting, then), waiting }
    }
    const periods = await buyRatePeriods(r.buyContractId)
    // The top of the ladder over each week: whose answer on overtime is the client's.
    const tops = await topLegsOver(sheets.map((t) => t.sellContractId))

    for (const l of hoursLines) {
      const t = byId.get(l.timesheetId!)
      if (!t) { refuse(l, `${n(l)} names a week that is not on the record.`); continue }
      const whose = `${t.person?.name ?? 'Somebody'}’s week of ${weekWord(t.periodStart)}`
      personOf.set(l.id, t.person?.name ?? 'Somebody')
      linePeople[l.id] = t.personId
      spans.push({ start: t.periodStart, end: t.periodEnd })
      if (l.personId && l.personId !== t.personId) {
        refuse(l, `${n(l)} names one person and bills ${whose}. A line is for the person whose week it is.`)
        continue
      }
      const candidate = candidates.find((c) => c.personId === t.personId) ?? null
      const w = accepted.get(t.id)
      const isWaiting = waiting.some((x) => x.id === t.id)
      if (!candidate || (!w && !isWaiting)) {
        refuse(l, `${n(l)} bills ${whose}, which this buy line does not pay for.`)
        continue
      }
      if (!w) {
        // Not accepted by us: RECEIPT fails, and the route refuses first
        // in the sentence that names the week and who must accept it.
        timesheets[t.id] = {
          id: t.id, status: 'SUBMITTED', approvedHours: 0, contractRateCents: candidate.payRate,
          periodStart: t.periodStart, periodEnd: t.periodEnd, alreadyBilledOnInvoiceId: null,
        }
        continue
      }
      if (candidate.payCurrency.toUpperCase() !== currency) {
        hard ??= {
          code: 'CURRENCY',
          says:
            `This invoice is in ${currency}, and ${t.person?.name ?? 'this person'} is paid in ${candidate.payCurrency.toUpperCase()} ` +
            `on this buy line. The two are never compared or added, so it is not checked on a guess.`,
        }
        continue
      }
      const priced = priceByDay({
        contractRateCents: candidate.payRate, periods, days: w.days, hours: w.hours,
        periodStart: w.periodStart, periodEnd: w.periodEnd,
      })
      const rates = [...new Set(priced.days.map((d) => d.rateCents))]
      if (rates.length > 1 || priced.note) {
        hard ??= {
          code: 'RATE_CHANGED_IN_WEEK',
          says:
            `The agreed rate changed inside ${whose}` +
            (rates.length > 1 ? ` (${rates.map((x) => amount(x, currency)).join(' to ')} an hour)` : '') +
            `, so one line at one rate cannot state it. Record this invoice as a total, which is priced day by day.`,
        }
        continue
      }
      // The overtime the client decided, at this buy line's multiplier,
      // with what we did not accept cut off overtime first.
      const week = priceWeek(t, {
        payerCompanyId: r.companyId,
        top: tops.get(t.sellContractId) ?? null,
        pairMultiplierBps: ctx.buy?.overtimeMultiplierBps ?? NaN,
        acceptedHours: w.hours,
        line: { hours: l.hours ?? 0, rateCents: l.rateCents ?? 0, amountCents: l.amountCents },
      })
      if (week.says) { refuse(l, `${n(l)} bills ${whose}. ${week.says}`); continue }
      if (week.working) premium.set(l.id, week.working.premiumCents)

      timesheets[t.id] = {
        id: t.id,
        status: 'APPROVED',
        // The hours the pricing bills: never one the client banked or has
        // not decided.
        approvedHours: week.working?.hours ?? w.hours,
        contractRateCents: rates[0] ?? priced.firstRateCents ?? candidate.payRate,
        periodStart: t.periodStart,
        periodEnd: t.periodEnd,
        alreadyBilledOnInvoiceId: null,
      }
      weeksRead.push({
        id: t.id,
        personName: t.person?.name ?? null,
        days: w.days,
        periodStart: w.periodStart.toISOString().slice(0, 10),
        periodEnd: w.periodEnd.toISOString().slice(0, 10),
      })

    }
  }

  // ── Expense lines ───────────────────────────────────────────────────
  if (expenseLines.length > 0 && r.buyContractId) {
    const ids = [...new Set(expenseLines.map((l) => l.expenseId!))]
    const rows = await prisma.expense.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, status: true, billable: true, total: true, personId: true, sellContractId: true,
        periodStart: true, periodEnd: true, category: true, companyId: true,
        person: { select: { name: true } },
      },
    })
    const byId = new Map(rows.map((e) => [e.id, e]))
    // The contracts this buy line pays for: the payer's own sell lines it
    // funds, and the supplier's contract below it down to the bottom of
    // the chain — the same two places its weeks are found.
    const linked = await prisma.contractLink.findMany({ where: { buyContractId: r.buyContractId }, select: { sellContractId: true } })
    const below = ctx.buy?.supplierSellContractId
      ? descend(ctx.buy.supplierSellContractId, await ladderFor([ctx.buy.supplierSellContractId]))
      : []
    const onThisLine = new Set([...linked.map((x) => x.sellContractId), ...below])
    const people = new Set(candidates.map((c) => c.personId))
    // What this payer itself accepted of each, and whether the supplier
    // bills it on this leg: the receipt for an expense is the payer's own
    // acceptance (the founder, 2026-10-19), and whether the kind is
    // billable is the whole chain's up to the supplier's line — each
    // leg's agreement where it says — as the supplier's own bill reads it
    // (`billsToPayer`).
    const supplierLineId = ctx.buy?.supplierSellContractId ?? null
    const [decisions, chains, supplierLeg] = await Promise.all([
      acceptancesOn(ids),
      legsOverMany(rows.map((e) => e.sellContractId)),
      supplierLineId ? legsFor([supplierLineId]).then((m) => m.get(supplierLineId) ?? null) : Promise.resolve(null),
    ])

    for (const l of expenseLines) {
      const e = byId.get(l.expenseId!)
      if (!e) { refuse(l, `${n(l)} names an expense that is not on the record.`); continue }
      const cents = Math.round(parseFloat(e.total.toString()) * 10 ** decimalsFor(currency))
      const what = `${e.person?.name ?? 'Somebody'}’s ${e.category.toLowerCase()} expense of ${plain(e.periodStart)}`
      personOf.set(l.id, e.person?.name ?? 'Expense')
      linePeople[l.id] = e.personId
      spans.push({ start: e.periodStart, end: e.periodEnd })
      if (!onThisLine.has(e.sellContractId) || !people.has(e.personId)) {
        refuse(l, `${n(l)} bills ${what}, which is not on this buy line.`)
        continue
      }
      if (l.personId && l.personId !== e.personId) {
        refuse(l, `${n(l)} names one person and bills ${what}. A line is for the person whose expense it is.`)
        continue
      }
      const leg = billsToPayer(e, chains.get(e.sellContractId) ?? [], supplierLineId, supplierLeg)
      if (!leg.bills) {
        refuse(l, leg.says
          ? `${n(l)} bills ${what}, which is not billable on this leg: ${leg.says}`
          : `${n(l)} bills ${what}, which was recorded as the firm’s own cost and not billable, so no invoice is paid for it.`)
        continue
      }
      // Raised on the payer's own book (a supplier not on the platform,
      // whose person it carries itself): its own approval is the receipt,
      // because nobody accepts their own. Otherwise, its acceptance.
      const raisedHere = e.companyId === r.companyId
      const own = raisedHere ? null : payersOwn(r.companyId, decisions.get(e.id) ?? [])
      expenses[e.id] = {
        id: e.id, status: e.status, totalCents: cents, periodStart: e.periodStart, periodEnd: e.periodEnd, personName: e.person?.name,
        ...(own ? { acceptedCents: own.kind === 'ACCEPTED' ? own.cents : null } : {}),
      }
      if (!EXPENSE_OK.includes(e.status)) {
        says[l.id] = `${n(l)} bills ${what}, which is ${e.status.toLowerCase()}, not approved, so it is not paid.`
      } else if (own && own.kind === 'SENT_BACK') {
        says[l.id] = `${n(l)} bills ${what}, which your firm sent back${own.reason ? `: ${own.reason}` : ''}. Accept it first, then it is paid.`
      } else if (own && own.kind === 'NONE') {
        says[l.id] = `${n(l)} bills ${what}, which your firm has not accepted. Accept it first, then it is paid.`
      } else if (own && own.kind === 'ACCEPTED' && own.cents !== l.amountCents) {
        says[l.id] = `${n(l)} bills ${amount(l.amountCents, currency)} for ${what}; ${amount(own.cents, currency)} was accepted.`
      } else if (!own && cents !== l.amountCents) {
        says[l.id] = `${n(l)} bills ${amount(l.amountCents, currency)} for ${what}; ${amount(cents, currency)} was approved.`
      }
    }
  }

  // ── Milestone lines ─────────────────────────────────────────────────
  if (milestoneLines.length > 0) {
    const ids = [...new Set(milestoneLines.map((l) => l.milestoneId!))]
    const rows = await prisma.orderMilestone.findMany({
      where: { id: { in: ids } },
      select: { id: true, orderId: true, status: true, amountCents: true, name: true, acceptedAt: true, order: { select: { number: true } } },
    })
    const byId = new Map(rows.map((m) => [m.id, m]))
    for (const l of milestoneLines) {
      const m = byId.get(l.milestoneId!)
      if (!m) { refuse(l, `${n(l)} names a milestone that is not on the record.`); continue }
      personOf.set(l.id, 'Milestone')
      if (m.acceptedAt) spans.push({ start: m.acceptedAt, end: m.acceptedAt })
      if (!ctx.workOrderId || m.orderId !== ctx.workOrderId) {
        refuse(l, `${n(l)} bills the milestone “${m.name}” on order ${m.order.number}, which is not the order this invoice draws on.`)
        continue
      }
      milestones[m.id] = { id: m.id, status: m.status, amountCents: m.amountCents }
      if (!MILESTONE_OK.includes(m.status)) {
        says[l.id] = `${n(l)} bills the milestone “${m.name}”, which has not been accepted, so it is not paid.`
      } else if (m.amountCents !== l.amountCents) {
        says[l.id] = `${n(l)} bills ${amount(l.amountCents, currency)} for the milestone “${m.name}”; it was agreed at ${amount(m.amountCents, currency)}.`
      }
    }
  }

  // ── The period the receipt covers ───────────────────────────────────
  const period = r.periodStart && r.periodEnd
    ? { start: r.periodStart, end: r.periodEnd }
    : spans.length > 0
      ? {
          start: new Date(Math.min(...spans.map((x) => x.start.getTime()))),
          end: new Date(Math.max(...spans.map((x) => x.end.getTime()))),
        }
      : null

  // ── The same work, already held ─────────────────────────────────────
  let duplicate: KeyedCheck['duplicate'] = null
  if (weeksRead.length > 0) {
    const span = {
      periodStart: weeksRead.reduce((a, w) => (w.periodStart < a ? w.periodStart : a), weeksRead[0].periodStart),
      periodEnd: weeksRead.reduce((a, w) => (w.periodEnd > a ? w.periodEnd : a), weeksRead[0].periodEnd),
    }
    duplicate = alreadyReceived(span, weeksRead, ctx.others.receipts)
  }
  if (!duplicate) {
    for (const l of [...expenseLines, ...milestoneLines]) {
      if (unwitnessed.has(l.id)) continue
      const held = ctx.others.sums.find((s) =>
        (l.expenseId && s.expenseId === l.expenseId) || (l.milestoneId && s.milestoneId === l.milestoneId))
      if (held) {
        const e = l.expenseId ? expenses[l.expenseId] : null
        const what = e
          ? `${e.personName ?? 'This'}’s expense of ${amount(e.totalCents, currency)}`
          : 'This milestone'
        duplicate = { number: held.receipt.number, says: heldSays(what, held.receipt) }
        break
      }
    }
  }
  if (!duplicate) {
    // The supplier's own bill, sent here on the platform, for the same
    // expense or milestone: whichever came first, the second owes it again.
    const sumIds = {
      expense: expenseLines.filter((l) => !unwitnessed.has(l.id)).map((l) => l.expenseId!),
      milestone: milestoneLines.filter((l) => !unwitnessed.has(l.id)).map((l) => l.milestoneId!),
    }
    if (sumIds.expense.length + sumIds.milestone.length > 0) {
      const sent = await prisma.invoiceLine.findFirst({
        where: {
          invoice: { status: { notIn: ['DRAFT', 'CANCELLED', 'VOID'] } },
          OR: [
            ...(sumIds.expense.length
              ? [{ expenseId: { in: sumIds.expense }, sellContract: { companyId: r.vendorCompanyId, clientCompanyId: r.companyId } }]
              : []),
            ...(sumIds.milestone.length ? [{ milestoneId: { in: sumIds.milestone } }] : []),
          ],
        },
        select: { expenseId: true, invoice: { select: { number: true } } },
      })
      if (sent) {
        duplicate = {
          number: sent.invoice.number,
          says:
            `${sent.expenseId ? 'This expense' : 'This milestone'} is already on ${r.vendorName}’s bill ${sent.invoice.number}, ` +
            `sent here on Etyme, so this invoice would owe it twice. Paying the same work twice is not a judgment call, ` +
            `so nobody can wave it through.`,
        }
      }
    }
  }

  const facts: InvoiceLineFacts[] = lines.map((l) => {
    const refused = unwitnessed.has(l.id)
    return {
      id: l.id,
      timesheetId: refused ? null : l.timesheetId,
      expenseId: refused ? null : l.expenseId,
      milestoneId: refused ? null : l.milestoneId,
      personName: personOf.get(l.id) ?? (l.milestoneId ? 'Milestone' : l.expenseId ? 'Expense' : 'Somebody'),
      hours: l.hours ?? 0,
      rateCents: l.rateCents ?? 0,
      amountCents: l.amountCents,
      premiumCents: premium.get(l.id) ?? null,
    }
  })

  const now = new Date()
  const match = threeWayMatch({
    invoice: {
      id: r.id ?? 'pending',
      totalCents: r.totalCents,
      periodStart: period?.start ?? now,
      periodEnd: period?.end ?? now,
      contractPeriod: null,
    },
    lines: facts,
    timesheets,
    expenses,
    milestones,
    po: ctx.order.po,
    poRequired: false,
    overrides: ctx.waivers.live,
    heldElsewhere: duplicate?.says ?? null,
    receiptSays: says,
  })

  return { match, notAccepted, hard, workOrderId: ctx.workOrderId, duplicate, voidedWaiver: ctx.waivers.voided, period, linePeople }
}

// ── The payer's gate on a typed-in receipt ────────────────────────────

export type KeyedRefusalCode = 'INVALID_STATE' | 'MATCH_FAILED' | 'NOT_CHECKED'

export type KeyedGate =
  | { ok: true }
  | { ok: false; code: KeyedRefusalCode; says: string }

/**
 * May this typed-in receipt be paid now. No database.
 *
 * Its order: the document's own state, then a refusal the match does not
 * carry, then the check as it stands now. Payment is strict, the same as
 * on the platform side: the accepted hours at the agreed rate, inside the
 * order, received once. The twin's tolerance is not read here.
 *
 * A receipt recorded as disputed is judged on the check run now, not on
 * the word it was stored with: a week accepted since, or an order topped
 * up, is a difference that has gone, and one still there is refused. A
 * difference the paying team waived with a reason passes, as it does on a
 * platform invoice — while the receipt is for the total it was waived at.
 */
/** The refusal the receipt's own state decides, or null. No database. */
export function keyedStateRefusal(
  bill: { number: string; status: string; totalCents: number; paidCents: number },
  vendorName: string,
): KeyedGate | null {
  if (bill.status === 'CANCELLED') {
    return { ok: false, code: 'INVALID_STATE', says: `${vendorName}’s invoice ${bill.number} is cancelled, so it is not paid.` }
  }
  if (bill.status === 'PAID' || bill.totalCents - bill.paidCents <= 0) {
    return { ok: false, code: 'INVALID_STATE', says: `${vendorName}’s invoice ${bill.number} is already paid in full.` }
  }
  return null
}

export function keyedPayGate(
  bill: { number: string; status: string; totalCents: number; paidCents: number; currency: string },
  vendorName: string,
  check: Pick<KeyedCheck, 'match' | 'hard'> & { voidedWaiver?: string | null } | null,
): KeyedGate {
  const byState = keyedStateRefusal(bill, vendorName)
  if (byState) return byState
  if (!check) {
    return {
      ok: false, code: 'NOT_CHECKED',
      says: `${vendorName}’s invoice ${bill.number} could not be checked against its order and its weeks, so it cannot be paid on the check’s say-so.`,
    }
  }
  if (check.hard) {
    return { ok: false, code: 'MATCH_FAILED', says: check.hard.says }
  }
  const failed = check.match.checks.filter((c) => c.outcome === 'FAIL')
  if (failed.length === 0) return { ok: true }
  const waivable = failed.every((c) => OVERRIDABLE[c.code])
  const first = failed.find((c) => !OVERRIDABLE[c.code]) ?? failed[0]
  return {
    ok: false,
    code: 'MATCH_FAILED',
    says:
      `${vendorName}’s invoice ${bill.number} for ${amount(bill.totalCents, bill.currency)} does not pass the check now: ` +
      `${first.reason.replace(/[.\s]+$/, '')}. ` +
      (waivable
        ? `${check.voidedWaiver ? `${check.voidedWaiver} ` : ''}Record an exception with a reason on it if the difference should be paid, or ask ${vendorName} for a corrected invoice.`
        : `Nobody can wave this through.`),
  }
}

/** The bill as the gate reads it. */
export const KEYED_SELECT = {
  id: true, companyId: true, vendorCompanyId: true, number: true, buyContractId: true, workOrderId: true,
  periodStart: true, periodEnd: true, currency: true, totalCents: true, paidCents: true, status: true,
  receivedAt: true, createdAt: true,
  vendorCompany: { select: { name: true } },
  lines: {
    select: {
      id: true, timesheetId: true, expenseId: true, milestoneId: true, personId: true,
      hours: true, rateCents: true, amountCents: true,
    },
    orderBy: { createdAt: 'asc' },
  },
  matchOverrides: {
    select: { code: true, reason: true, createdAt: true, totalCentsAtOverride: true, by: { select: { name: true } } },
  },
} as const

/**
 * May the payer pay this typed-in receipt now — for a caller that holds
 * only the id: the payment, a payment run, and the twin's approval.
 * Writes nothing.
 */
export async function mayPayKeyedReceipt(
  vendorBillId: string,
): Promise<(KeyedGate & { check: KeyedCheck | null }) | null> {
  const b = await prisma.vendorBill.findUnique({ where: { id: vendorBillId }, select: KEYED_SELECT })
  if (!b) return null
  const byState = keyedStateRefusal(b, b.vendorCompany.name)
  if (byState) return { ...byState, check: null }
  const check = await checkKeyedReceipt(asKeyed(b), 'pay')
  return { ...keyedPayGate(b, b.vendorCompany.name, check), check }
}

export function asKeyed(b: {
  id: string; companyId: string; vendorCompanyId: string; number: string; buyContractId: string | null
  workOrderId: string | null; periodStart: Date | null; periodEnd: Date | null; currency: string
  totalCents: number; createdAt: Date; vendorCompany: { name: string }
  lines?: {
    id: string; timesheetId: string | null; expenseId: string | null; milestoneId: string | null; personId: string | null
    hours: { toString(): string } | null; rateCents: number | null; amountCents: number
  }[]
  matchOverrides?: { code: string; reason: string; createdAt: Date; totalCentsAtOverride: number; by: { name: string } }[]
}): KeyedReceipt {
  return {
    id: b.id,
    companyId: b.companyId,
    vendorCompanyId: b.vendorCompanyId,
    vendorName: b.vendorCompany.name,
    number: b.number,
    buyContractId: b.buyContractId,
    workOrderId: b.workOrderId,
    periodStart: b.periodStart,
    periodEnd: b.periodEnd,
    currency: b.currency,
    totalCents: b.totalCents,
    createdAt: b.createdAt,
    // Stored hours are a Decimal to two places; read as a number once, here.
    lines: (b.lines ?? []).map((l) => ({
      id: l.id,
      timesheetId: l.timesheetId,
      expenseId: l.expenseId,
      milestoneId: l.milestoneId,
      personId: l.personId,
      hours: l.hours == null ? null : Number(l.hours.toString()),
      rateCents: l.rateCents,
      amountCents: l.amountCents,
    })),
    waivers: (b.matchOverrides ?? []).map((o) => ({
      code: o.code, reason: o.reason, byName: o.by.name, at: o.createdAt, totalCentsAtOverride: o.totalCentsAtOverride,
    })),
  }
}
