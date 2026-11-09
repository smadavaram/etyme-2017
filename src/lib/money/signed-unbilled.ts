import { prisma } from '@/lib/db'
import { weekStart, weekEnd } from '@/lib/overtime'
import { iso, periodFor, type Period } from '@/lib/periods'
import { formatRange } from '@/lib/format-date'
import { billCountsAsBilled, billIsDraftedNotSent } from '@/lib/money/order-ledger'
import { notSentSays } from '@/lib/money/bill-state'
import { ORDER_HEADER_SELECT, SELL_LINE_TERMS_SELECT, periodTermsFor } from '@/lib/money/order-terms'
import { generateBill, shareBillReads, BILLABLE_LINE_STATES, type BillCaller, type BillOutcome, type BillShared } from '@/lib/money/bill-generate'
import { billingPeriodOf, readWeek, type WeekUnpriced } from '@/lib/money/week-price'
import { whereHoursLive } from '@/lib/work-chain'
import { ladderFor } from '@/lib/work-chain-read'

/**
 * Signed, billed, and signed-and-not-billed: one reader, per sell line.
 * The firm's Today figure, the placement, a client's budget and its
 * program all read it.
 *
 * ── The faults this exists for ───────────────────────────────────────
 *
 * The founder's scale audit, 2026-11-08: Rosa Delgado had 1,181 hours
 * signed by Northbend and 80 billed; the $123,312 between them was
 * totaled nowhere. Then the reconciliation found three definitions of the
 * one figure: this reader priced at straight time and left expenses out,
 * the client's budget priced the overtime decided and the expenses it
 * accepted, and the firm's Today page priced with the bill generator. On
 * seeded Northbend, Spent − Billed read $5,653 against $5,800 here.
 *
 * ── The rule ─────────────────────────────────────────────────────────
 *
 *   Signed   = hours the client signed at the top (the live
 *              CLIENT_APPROVAL), on the weeks this line bills (its own,
 *              or the bottom rung's where a supplier stands between).
 *   Billed   = what this line's bills that were sent carry, hours and
 *              expenses (`billCountsAsBilled`, the rule an order's Billed
 *              reads). A draft is not billed.
 *   Signed and not billed = each signed week, and each accepted billable
 *              expense, that no sent bill carries, priced the way the
 *              next bill would price it: by the Bills page's own
 *              generator, on a dry run, called and never copied. So the
 *              decided overtime premium, the payer's accepted hours, the
 *              rate in force that week and the accepted expense amounts
 *              are the generator's own. A week on a draft is the draft's
 *              own figure for it, and says which draft.
 *   Billed over signed = hours a sent bill carries past what was signed
 *              for that week (T3's case: 41.5 billed on a 40-hour week),
 *              said apart, so the reconciliation holds to the cent:
 *              Signed = Billed − Billed over signed + Signed and not billed.
 *
 * Where the generator would leave a week off (the firm above has not
 * accepted it, overtime nobody decided, no rate, the order's ceiling) the
 * week is counted, its amount is null with the reason, and the line's
 * figure says how many weeks are unpriced; it is never guessed.
 *
 * Money is in the line's own currency, never added across currencies.
 * Aging is by whole weeks since the Saturday that ended the week.
 */

export const AGE_BANDS = ['1 week or less', '2 to 4 weeks', '5 to 8 weeks', '9 to 13 weeks', 'Over 13 weeks'] as const
export type AgeBand = (typeof AGE_BANDS)[number]

/** Said once beside any figure this reader prices. */
export const UNBILLED_BASIS =
  'Signed and not billed: each week the client signed, and each expense accepted to bill, that no sent bill carries, ' +
  'priced as the next bill would price it. A draft is not billed until it is sent.'

export function ageBand(weeks: number): AgeBand {
  if (weeks <= 1) return AGE_BANDS[0]
  if (weeks <= 4) return AGE_BANDS[1]
  if (weeks <= 8) return AGE_BANDS[2]
  if (weeks <= 13) return AGE_BANDS[3]
  return AGE_BANDS[4]
}

const A_DAY = 86_400_000

/** Whole weeks between the Saturday that ended a week and today. Never below nought. */
export function ageInWeeks(weekEndIso: string, today: Date): number {
  const end = Date.parse(`${weekEndIso}T00:00:00Z`)
  const day = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Math.max(0, Math.floor((day - end) / (7 * A_DAY)))
}

// ── Inputs to the arithmetic ─────────────────────────────────────────

export interface SheetIn {
  timesheetId: string
  periodStart: Date
  /** Hours the client signed; null where nobody has signed the week at the top. */
  signedHours: number | null
}

export interface BillLineIn {
  timesheetId: string | null
  expenseId: string | null
  hours: number
  amountMinor: number
  invoice: { id: string; number: string; status: string; currency: string }
}

/** What the next bill would make of a week not on a sent bill: the generator's answer. */
export type WeekPrice =
  | { amountMinor: number; billedHours: number; unpriced: null; says: null }
  | { amountMinor: null; billedHours: null; unpriced: WeekUnpriced; says: string | null }
  /** Already on an invoice the payer recorded from this firm: billed, off the platform. */
  | { billedElsewhere: true; says: string }

export interface LineIn {
  sellContractId: string
  personId: string
  personName: string
  currency: string
  billedToName?: string
  atName?: string
  sheets: SheetIn[]
  /** Invoice lines on this sell line, hours and expenses. */
  billLines: BillLineIn[]
  /** Accepted billable expenses the next bill would carry, at their amount: the generator's plan. */
  plannedExpenses?: { expenseId: string; amountMinor: number }[]
}

// ── Output ───────────────────────────────────────────────────────────

export interface UnbilledWeek {
  timesheetId: string
  week: { start: string; end: string; says: string }
  signedHours: number
  /** Hours of the week a sent bill already carries. */
  billedHours: number
  /** Signed − billed. */
  hours: number
  /** What it is worth as the next bill would price it; null where the bill would leave it off. */
  amountMinor: number | null
  /** Hours the next bill would carry for it; null where it would leave the week off. */
  billsHours: number | null
  unpriced: WeekUnpriced | null
  says: string | null
  /** A draft holding this week, and what it holds for it. */
  onDraft: { invoiceId: string; number: string; status: string; hours: number; amountMinor: number; says: string } | null
  ageWeeks: number
  band: AgeBand
}

export interface LineBilling {
  sellContractId: string
  personId: string
  personName: string
  billedToName: string | null
  atName: string | null
  currency: string
  /** Signed: hours, and money where every part of it is priced (Billed − over-billed + not billed). */
  signed: { hours: number; weeks: number; amountMinor: number | null }
  /** On bills sent: hours lines and expense lines, apart and together. */
  billed: { hours: number; hoursMinor: number; expenseMinor: number; amountMinor: number }
  /** Hours and money a sent bill carries past what was signed for that week. */
  billedOverSigned: { hours: number; amountMinor: number }
  drafted: { hours: number; amountMinor: number; bills: { invoiceId: string; number: string; status: string; hours: number; amountMinor: number }[] }
  notBilled: {
    hours: number
    /** The priced weeks and expenses. Never the whole where `unpriced` > 0. */
    amountMinor: number
    /** Of it, accepted expenses no sent bill carries. */
    expenseMinor: number
    /** Weeks the next bill would leave off, so they have no amount. */
    unpriced: number
    /** Of the not-billed hours, those a draft holds. */
    onDraftHours: number
    weeks: UnbilledWeek[]
    aging: { band: AgeBand; weeks: number; hours: number; amountMinor: number }[]
  }
  says: string | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Pure: one line's signed, billed and signed-and-not-billed, its weeks
 * aged. `priceOf` is the next bill's answer for a week no sent bill
 * carries and no draft holds; the read passes the generator's dry run.
 */
export function lineBillingFrom(line: LineIn, today: Date, priceOf: (timesheetId: string, hours: number) => WeekPrice): LineBilling {
  const ccy = line.currency.toUpperCase()
  const inCcy = line.billLines.filter((b) => b.invoice.currency.toUpperCase() === ccy)
  const sent = inCcy.filter((b) => billCountsAsBilled(b.invoice.status))
  const drafts = inCcy.filter((b) => billIsDraftedNotSent(b.invoice.status))
  const sentHours = sent.filter((b) => b.timesheetId)
  const draftHours = drafts.filter((b) => b.timesheetId)

  const draftBills = new Map<string, { invoiceId: string; number: string; status: string; hours: number; amountMinor: number }>()
  for (const d of drafts) {
    const at = draftBills.get(d.invoice.id) ?? { invoiceId: d.invoice.id, number: d.invoice.number, status: d.invoice.status, hours: 0, amountMinor: 0 }
    at.hours = round2(at.hours + (d.timesheetId ? d.hours : 0))
    at.amountMinor += d.amountMinor
    draftBills.set(d.invoice.id, at)
  }

  const signedSheets = line.sheets.filter((s) => s.signedHours != null)
  const weeks: UnbilledWeek[] = []
  let overHours = 0
  let overMinor = 0
  for (const s of [...signedSheets].sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime())) {
    const signed = s.signedHours ?? 0
    const onSent = sentHours.filter((b) => b.timesheetId === s.timesheetId)
    const billedHours = round2(onSent.reduce((n, b) => n + b.hours, 0))
    if (billedHours > signed && billedHours > 0) {
      const over = round2(billedHours - signed)
      const sentMinor = onSent.reduce((n, b) => n + b.amountMinor, 0)
      overHours = round2(overHours + over)
      overMinor += Math.round((sentMinor * over) / billedHours)
    }
    const hours = round2(Math.max(0, signed - billedHours))
    if (hours <= 0) continue
    const start = weekStart(iso(s.periodStart))
    const end = weekEnd(start)
    const age = ageInWeeks(end, today)
    const base = { timesheetId: s.timesheetId, week: { start, end, says: formatRange(start, end) }, signedHours: signed, billedHours, hours, ageWeeks: age, band: ageBand(age) }

    const onThisDraft = draftHours.filter((d) => d.timesheetId === s.timesheetId)
    if (onThisDraft.length > 0) {
      const inv = onThisDraft[0].invoice
      const h = round2(onThisDraft.reduce((n, d) => n + d.hours, 0))
      const m = onThisDraft.reduce((n, d) => n + d.amountMinor, 0)
      weeks.push({
        ...base, amountMinor: m, billsHours: h, unpriced: null, says: null,
        onDraft: { invoiceId: inv.id, number: inv.number, status: inv.status, hours: h, amountMinor: m, says: notSentSays(inv) },
      })
      continue
    }
    const p = priceOf(s.timesheetId, hours)
    if ('billedElsewhere' in p) continue
    // Part of the week is on a sent bill and the next bill would carry none
    // of the rest (the payer accepted fewer hours than were signed): the
    // rest is not billable, so it is not counted as owed to anybody.
    if (billedHours > 0 && p.amountMinor == null) continue
    weeks.push({ ...base, amountMinor: p.amountMinor, billsHours: p.billedHours, unpriced: p.unpriced, says: p.says, onDraft: null })
  }

  // Expenses: accepted and billable on the next bill, and on no sent bill.
  const expOnSent = new Set(sent.filter((b) => b.expenseId).map((b) => b.expenseId!))
  const expOnDraft = new Map<string, number>()
  for (const d of drafts) if (d.expenseId) expOnDraft.set(d.expenseId, (expOnDraft.get(d.expenseId) ?? 0) + d.amountMinor)
  let expenseMinor = 0
  for (const [, m] of expOnDraft) expenseMinor += m
  for (const e of line.plannedExpenses ?? []) {
    if (expOnSent.has(e.expenseId) || expOnDraft.has(e.expenseId)) continue
    expenseMinor += e.amountMinor
  }

  const aging = AGE_BANDS.map((band) => {
    const inBand = weeks.filter((w) => w.band === band)
    return {
      band,
      weeks: inBand.length,
      hours: round2(inBand.reduce((n, w) => n + w.hours, 0)),
      amountMinor: inBand.reduce((n, w) => n + (w.amountMinor ?? 0), 0),
    }
  })

  const unpriced = weeks.filter((w) => w.amountMinor == null).length
  const weeksMinor = weeks.reduce((n, w) => n + (w.amountMinor ?? 0), 0)
  const notBilledHours = round2(weeks.reduce((n, w) => n + w.hours, 0))
  const onDraftHours = round2(weeks.reduce((n, w) => n + Math.min(w.hours, w.onDraft?.hours ?? 0), 0))
  const hoursMinor = sentHours.reduce((n, b) => n + b.amountMinor, 0)
  const billedExpenseMinor = sent.filter((b) => !b.timesheetId).reduce((n, b) => n + b.amountMinor, 0)
  const billedMinor = hoursMinor + billedExpenseMinor
  const notBilledMinor = weeksMinor + expenseMinor

  const says = weeks.length === 0
    ? null
    : `${weeks.length} signed week${weeks.length === 1 ? '' : 's'} of ${line.personName}’s ` +
      `${weeks.length === 1 ? 'is' : 'are'} not on a sent bill, ${notBilledHours} hours` +
      (onDraftHours > 0 ? `, ${onDraftHours} of them on a draft nobody has sent` : '') +
      (unpriced > 0 ? `; ${unpriced} of those weeks the next bill would leave off, so they have no amount yet` : '') + '.'

  return {
    sellContractId: line.sellContractId,
    personId: line.personId,
    personName: line.personName,
    billedToName: line.billedToName ?? null,
    atName: line.atName ?? null,
    currency: ccy,
    signed: {
      hours: round2(signedSheets.reduce((n, s) => n + (s.signedHours ?? 0), 0)),
      weeks: signedSheets.length,
      amountMinor: unpriced > 0 ? null : billedMinor - overMinor + notBilledMinor,
    },
    billed: { hours: round2(sentHours.reduce((n, b) => n + b.hours, 0)), hoursMinor, expenseMinor: billedExpenseMinor, amountMinor: billedMinor },
    billedOverSigned: { hours: overHours, amountMinor: overMinor },
    drafted: {
      hours: round2(draftHours.reduce((n, b) => n + b.hours, 0)),
      amountMinor: drafts.reduce((n, b) => n + b.amountMinor, 0),
      bills: [...draftBills.values()],
    },
    notBilled: { hours: notBilledHours, amountMinor: notBilledMinor, expenseMinor, unpriced, onDraftHours, weeks, aging },
    says,
  }
}

/** Pure: lines rolled up one currency at a time, never added across currencies. */
export function rollUp(lines: readonly LineBilling[]): {
  currency: string
  signedHours: number
  billedHours: number
  billedMinor: number
  billedOverSignedMinor: number
  notBilledHours: number
  notBilledMinor: number
  unpricedWeeks: number
  onDraftHours: number
  aging: { band: AgeBand; weeks: number; hours: number; amountMinor: number }[]
}[] {
  const by = new Map<string, ReturnType<typeof rollUp>[number]>()
  for (const l of lines) {
    const t = by.get(l.currency) ?? {
      currency: l.currency, signedHours: 0, billedHours: 0, billedMinor: 0, billedOverSignedMinor: 0,
      notBilledHours: 0, notBilledMinor: 0, unpricedWeeks: 0, onDraftHours: 0,
      aging: AGE_BANDS.map((band) => ({ band, weeks: 0, hours: 0, amountMinor: 0 })),
    }
    t.signedHours = round2(t.signedHours + l.signed.hours)
    t.billedHours = round2(t.billedHours + l.billed.hours)
    t.billedMinor += l.billed.amountMinor
    t.billedOverSignedMinor += l.billedOverSigned?.amountMinor ?? 0
    t.notBilledHours = round2(t.notBilledHours + l.notBilled.hours)
    t.notBilledMinor += l.notBilled.amountMinor
    t.unpricedWeeks += l.notBilled.unpriced ?? 0
    t.onDraftHours = round2(t.onDraftHours + l.notBilled.onDraftHours)
    for (const a of l.notBilled.aging) {
      const at = t.aging.find((x) => x.band === a.band)!
      at.weeks += a.weeks
      at.hours = round2(at.hours + a.hours)
      at.amountMinor += a.amountMinor
    }
    by.set(l.currency, t)
  }
  return [...by.values()]
}

// ── The read ─────────────────────────────────────────────────────────

const LINE_SELECT = {
  id: true, companyId: true, engagementId: true, billRate: true, billCurrency: true, startDate: true, state: true,
  company: { select: { id: true, name: true, kind: true } },
  person: { select: { id: true, name: true } },
  clientCompany: { select: { name: true } },
  endClientCompany: { select: { name: true } },
  billFrequency: true, billAnchor: true, billStraddle: true,
  workOrder: { select: ORDER_HEADER_SELECT },
  ...SELL_LINE_TERMS_SELECT,
} as const

/**
 * Signed, billed and signed-and-not-billed for each of these sell lines.
 * Reads only; every week and expense is priced by the bill generator's
 * dry run under the firm that sells the line, one run per engagement and
 * billing period, the runs of one firm sharing their reads. A line that
 * does not exist is absent from the map. The caller decides who may read
 * it; nothing here checks a seat.
 */
export async function signedAndBilled(sellContractIds: readonly string[], today: Date = new Date()): Promise<Map<string, LineBilling>> {
  const ids = [...new Set(sellContractIds)]
  const out = new Map<string, LineBilling>()
  if (ids.length === 0) return out
  const [lines, rungs] = await Promise.all([
    prisma.sellContract.findMany({ where: { id: { in: ids } }, select: LINE_SELECT }),
    ladderFor(ids),
  ])
  const filedOn = new Map(lines.map((l) => [l.id, whereHoursLive(l.id, rungs)]))
  const [sheets, billLines, expenses] = await Promise.all([
    prisma.timesheet.findMany({
      where: { sellContractId: { in: [...new Set(filedOn.values())] }, assertions: { some: { role: 'CLIENT_APPROVAL', state: 'LIVE' } } },
      select: {
        id: true, sellContractId: true, periodStart: true, periodEnd: true, days: true,
        assertions: { where: { role: 'CLIENT_APPROVAL', state: 'LIVE' }, select: { hours: true }, take: 1 },
      },
    }),
    prisma.invoiceLine.findMany({
      where: { sellContractId: { in: ids }, invoice: { status: { notIn: ['CANCELLED', 'VOID'] as any } } },
      select: {
        sellContractId: true, timesheetId: true, expenseId: true, hours: true, amountCents: true,
        invoice: { select: { id: true, number: true, status: true, currency: true } },
      },
    }),
    prisma.expense.findMany({
      where: { sellContractId: { in: ids }, billable: true, status: { notIn: ['DRAFT', 'REJECTED'] } },
      select: { id: true, sellContractId: true, periodEnd: true },
    }),
  ])

  // Which week and expense each dry run is asked about.
  const draftTs = new Set(billLines.filter((b) => b.timesheetId && billIsDraftedNotSent(b.invoice.status)).map((b) => `${b.sellContractId}:${b.timesheetId}`))
  const billedExp = new Set(billLines.filter((b) => b.expenseId).map((b) => b.expenseId!))
  type Ask = { line: (typeof lines)[number]; period: Period }
  const asks = new Map<string, Ask>()
  const weekPeriod = new Map<string, string>()
  const lineOff = new Map<string, WeekPrice>()
  const ask = (line: (typeof lines)[number], period: Period) => {
    const key = `${line.engagementId}:${iso(period.start)}:${iso(period.end)}`
    if (!asks.has(key)) asks.set(key, { line, period })
    return key
  }
  for (const line of lines) {
    const off = cannotBill(line)
    if (off) { lineOff.set(line.id, off); continue }
    const terms = periodTermsFor('SELL', line)
    for (const ts of sheets.filter((s) => s.sellContractId === filedOn.get(line.id))) {
      const k = `${line.id}:${ts.id}`
      if (draftTs.has(k)) continue
      // A week some of which is on a sent bill still asks the generator about the rest.
      weekPeriod.set(k, ask(line, billingPeriodOf(ts, terms)))
    }
    for (const e of expenses.filter((x) => x.sellContractId === line.id && !billedExp.has(x.id))) ask(line, periodFor(e.periodEnd, terms))
  }

  // One dry run per engagement and period, under the firm that sells the
  // line, the runs of one firm sharing their reads.
  const sharedBy = new Map<string, BillShared>()
  const runs = new Map<string, Promise<BillOutcome>>()
  for (const [key, a] of asks) {
    let shared = sharedBy.get(a.line.companyId)
    if (!shared) {
      const own = [...asks.values()].filter((x) => x.line.companyId === a.line.companyId)
      shared = shareBillReads({
        lineIds: lines.filter((l) => l.companyId === a.line.companyId).map((l) => l.id),
        rungs,
        from: new Date(Math.min(...own.map((x) => x.period.start.getTime()))),
        to: new Date(Math.max(...own.map((x) => x.period.end.getTime()))),
      })
      sharedBy.set(a.line.companyId, shared)
    }
    const caller: BillCaller = { company: { id: a.line.company.id, name: a.line.company.name, kind: a.line.company.kind }, person: { id: null, name: 'Signed and not billed' } }
    runs.set(key, generateBill(caller, { engagementId: a.line.engagementId, periodStart: iso(a.period.start), periodEnd: iso(a.period.end) }, { dryRun: true, shared }))
  }
  const outcomes = new Map<string, BillOutcome>()
  for (const [key, run] of runs) outcomes.set(key, await run)

  for (const line of lines) {
    const filed = filedOn.get(line.id) ?? line.id
    const off = lineOff.get(line.id)
    const plannedExpenses: { expenseId: string; amountMinor: number }[] = []
    const seen = new Set<string>()
    for (const o of outcomes.values()) {
      if (!o.ok) continue
      for (const e of o.planned.expenses ?? []) {
        if (e.sellContractId !== line.id || seen.has(e.expenseId)) continue
        seen.add(e.expenseId)
        plannedExpenses.push({ expenseId: e.expenseId, amountMinor: e.amountMinor })
      }
    }
    out.set(line.id, lineBillingFrom({
      sellContractId: line.id,
      personId: line.person.id,
      personName: line.person.name,
      billedToName: line.clientCompany.name,
      atName: line.endClientCompany?.name ?? line.clientCompany.name,
      currency: (line.billCurrency || 'USD').toUpperCase(),
      sheets: sheets.filter((s) => s.sellContractId === filed).map((s) => ({
        timesheetId: s.id, periodStart: s.periodStart, signedHours: s.assertions[0] ? Number(s.assertions[0].hours) : null,
      })),
      billLines: billLines.filter((b) => b.sellContractId === line.id).map((b) => ({
        timesheetId: b.timesheetId, expenseId: b.expenseId, hours: Number(b.hours), amountMinor: b.amountCents, invoice: b.invoice,
      })),
      plannedExpenses,
    }, today, (timesheetId) => {
      if (off) return off
      const outcome = outcomes.get(weekPeriod.get(`${line.id}:${timesheetId}`) ?? '')
      if (!outcome) return { amountMinor: null, billedHours: null, unpriced: 'refused', says: 'No bill was asked about this week, so no figure is given.' }
      const read = readWeek(outcome, timesheetId)
      if ('billed' in read) return { billedElsewhere: true, says: read.says }
      if ('unpriced' in read) return { amountMinor: null, billedHours: null, unpriced: read.unpriced, says: read.says }
      return { amountMinor: read.amountMinor, billedHours: read.billedHours, unpriced: null, says: null }
    }))
  }
  return out
}

/** Why no bill can be made on this line at all, as the firm's Today page says it; null where one can. */
function cannotBill(line: { billRate: number; engagementId: string | null; state: string; person: { name: string } }): WeekPrice | null {
  if (line.billRate <= 0) return { amountMinor: null, billedHours: null, unpriced: 'no rate', says: `${line.person.name}’s placement has no bill rate, so the week cannot be priced.` }
  if (!line.engagementId) return { amountMinor: null, billedHours: null, unpriced: 'no engagement', says: `${line.person.name}’s placement is on no engagement, so no bill can be made for it yet.` }
  if (!(BILLABLE_LINE_STATES as readonly string[]).includes(line.state)) {
    return {
      amountMinor: null, billedHours: null, unpriced: 'not running',
      says: `${line.person.name}’s placement is not running, and a bill is made only for a running or ended placement, so this week cannot be billed yet.`,
    }
  }
  return null
}
