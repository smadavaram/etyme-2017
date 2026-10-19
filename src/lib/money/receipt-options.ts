/**
 * What the "Record an invoice receipt" form may offer, read from the
 * paying firm's own record.
 *
 * A clerk keying in a supplier's invoice picks, in order: the supplier,
 * the buy line the invoice is for, and then what each line of the
 * invoice bills — a week this firm accepted, an expense approved on that
 * line, or a milestone accepted on the order the line draws on. Each is
 * offered with what the check will hold it to beside it: the hours this
 * firm accepted and the agreed rate on those days, the amount approved,
 * the amount agreed. The clerk then types what the supplier's invoice
 * states, and the check says where the two differ.
 *
 * Nothing here decides anything. The same check (`checkKeyedReceipt`)
 * runs when the form asks before saving and again when it saves, so an
 * offer here that the check would refuse is still refused, in its own
 * sentence. A week offered is one this firm accepted; a week it has not
 * is listed apart, not offered, with the sentence that says who must
 * accept it.
 */

import { prisma } from '@/lib/db'
import { payersBook } from '@/lib/money/payers-acceptance-read'
import { buyRatePeriods } from '@/lib/money/keyed-receipt'
import { priceByDay } from '@/lib/contract-rate'
import { ladderFor } from '@/lib/work-chain-read'
import { descend } from '@/lib/work-chain'
import { termsFor, ORDER_HEADER_SELECT, AGREEMENT_TERMS_SELECT } from '@/lib/money/order-terms'
import { decimalsFor } from '@/lib/money'
import { legBills, payersOwn } from '@/lib/money/expense-acceptance'
import { acceptancesOn, legsFor } from '@/lib/money/expense-acceptance-read'
import { formatDay } from '@/lib/format-date'
import { alreadyReceived, alreadyOnABill, type ReceiptAlready, type BillOnRecord } from '@/lib/money/billed-elsewhere'

/** How far back the form looks for weeks: half a year. A week older than that is keyed in as a total. */
export const WEEKS_BACK_DAYS = 182

export interface SupplierOption {
  id: string
  name: string
  lines: BuyLineOption[]
}

export interface BuyLineOption {
  buyContractId: string
  /** Who the line pays for, by name. */
  people: string[]
  rateMinor: number | null
  currency: string
  orderNumber: string | null
  state: string
  /** Net days on the agreement, the order or the line, and what they run from; null where nothing says. */
  netDays: number | null
  netFrom: string | null
}

export interface WeekOption {
  timesheetId: string
  personName: string
  weekOf: string
  weekEnds: string
  hoursAccepted: number
  /** The agreed rate on every day of it, or null where it changed inside the week. */
  rateMinor: number | null
  /** Where it cannot be offered as one line, the sentence. */
  says: string | null
  /** The live invoice receipt that already holds it, where one does. */
  heldBy: string | null
}

export interface WaitingOption {
  timesheetId: string
  personName: string
  weekOf: string
}

export interface SumOption {
  id: string
  says: string
  amountMinor: number
  heldBy: string | null
}

export interface LineOptions {
  weeks: WeekOption[]
  /** Weeks this firm has not accepted, never offered, and the sentence. */
  waiting: WaitingOption[]
  waitingSays: string | null
  /** Expenses this firm accepted, at what it accepted. */
  expenses: SumOption[]
  /** Expenses approved on the line that this firm has not accepted, never offered, each in a sentence. */
  expensesToAccept: { id: string; says: string }[]
  milestones: SumOption[]
}

/** Every supplier this firm buys from on a buy line, with those lines. */
export async function suppliersFor(companyId: string): Promise<SupplierOption[]> {
  const lines = await prisma.buyContract.findMany({
    where: { companyId, vendorCompanyId: { not: null }, state: { not: 'DRAFT' } },
    select: {
      id: true, state: true, payCurrency: true, paymentTermsFrom: true, payFrequency: true, payAnchor: true, payStraddle: true,
      termsDifferReason: true,
      vendorCompany: { select: { id: true, name: true } },
      candidates: { select: { payRate: true, person: { select: { name: true } } } },
      workOrder: { select: { ...ORDER_HEADER_SELECT, msa: { select: AGREEMENT_TERMS_SELECT } } },
    },
    orderBy: { startDate: 'desc' },
    take: 500,
  })
  const bySupplier = new Map<string, SupplierOption>()
  for (const l of lines) {
    if (!l.vendorCompany) continue
    const terms = termsFor('BUY', {
      payCurrency: l.payCurrency, paymentTermsFrom: l.paymentTermsFrom,
      payFrequency: l.payFrequency, payAnchor: l.payAnchor, payStraddle: l.payStraddle,
      termsDifferReason: l.termsDifferReason,
      workOrder: l.workOrder,
    })
    const rates = [...new Set(l.candidates.map((c) => c.payRate))]
    const s = bySupplier.get(l.vendorCompany.id) ?? { id: l.vendorCompany.id, name: l.vendorCompany.name, lines: [] }
    s.lines.push({
      buyContractId: l.id,
      people: l.candidates.map((c) => c.person?.name ?? 'Somebody'),
      // One rate where the line pays one; where it pays people at several, none is guessed.
      rateMinor: rates.length === 1 ? rates[0] : null,
      currency: l.payCurrency.toUpperCase(),
      orderNumber: l.workOrder?.number ?? null,
      state: l.state,
      netDays: terms.paymentTermsDays,
      netFrom: terms.paymentTermsFrom,
    })
    bySupplier.set(l.vendorCompany.id, s)
  }
  return [...bySupplier.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * What one buy line's invoice may bill: the weeks this firm accepted, the
 * expenses approved on the line and the milestones accepted on its
 * order. Null where the line is not this firm's.
 */
export async function lineOptionsFor(companyId: string, buyContractId: string, now = new Date()): Promise<LineOptions | null> {
  const buy = await prisma.buyContract.findUnique({
    where: { id: buyContractId },
    select: {
      companyId: true, workOrderId: true, supplierSellContractId: true, payCurrency: true, vendorCompanyId: true,
      candidates: { select: { personId: true, payRate: true, payCurrency: true } },
    },
  })
  if (!buy || buy.companyId !== companyId) return null
  const currency = buy.payCurrency.toUpperCase()

  // ── Weeks ───────────────────────────────────────────────────────────
  const from = new Date(now.getTime() - WEEKS_BACK_DAYS * 86_400_000)
  const book = await payersBook({ buyContractId, periodStart: from, periodEnd: now, then: 'record' })
  const accepted = book?.accepted?.weeks ?? []
  const sheets = accepted.length
    ? await prisma.timesheet.findMany({ where: { id: { in: accepted.map((w) => w.id) } }, select: { id: true, personId: true } })
    : []
  const personOf = new Map(sheets.map((t) => [t.id, t.personId]))
  const periods = await buyRatePeriods(buyContractId)
  const held = await weeksHeld(companyId, buyContractId, buy.vendorCompanyId, buy.candidates.map((c) => c.personId), accepted.map((w) => ({
    id: w.id, personName: w.personName ?? null, days: w.days ?? null, periodStart: iso(w.periodStart), periodEnd: iso(w.periodEnd),
  })))

  const weeks: WeekOption[] = accepted
    .map((w) => {
      const candidate = buy.candidates.find((c) => c.personId === personOf.get(w.id)) ?? null
      const name = w.personName ?? 'Somebody'
      if (!candidate) {
        return {
          timesheetId: w.id, personName: name, weekOf: iso(w.periodStart), weekEnds: iso(w.periodEnd),
          hoursAccepted: w.hours, rateMinor: null, heldBy: held.get(w.id) ?? null,
          says: `${name} is not on this buy line, so this week is not billed on it.`,
        }
      }
      const priced = priceByDay({
        contractRateCents: candidate.payRate, periods, days: w.days, hours: w.hours,
        periodStart: w.periodStart, periodEnd: w.periodEnd,
      })
      const rates = [...new Set(priced.days.map((d) => d.rateCents))]
      const one = rates.length === 1 && !priced.note ? rates[0] : rates.length === 0 && !priced.note ? candidate.payRate : null
      return {
        timesheetId: w.id,
        personName: name,
        weekOf: iso(w.periodStart),
        weekEnds: iso(w.periodEnd),
        hoursAccepted: w.hours,
        rateMinor: one,
        heldBy: held.get(w.id) ?? null,
        says: one == null
          ? `The agreed rate changed inside ${name}’s week of ${formatDay(w.periodStart)}, so one line at one rate cannot state it. Record this invoice as a total, which is priced day by day.`
          : null,
      }
    })
    .sort((a, b) => b.weekOf.localeCompare(a.weekOf) || a.personName.localeCompare(b.personName))

  const waiting: WaitingOption[] = (book?.waiting ?? []).map((w) => ({
    timesheetId: w.id, personName: w.personName ?? 'Somebody', weekOf: iso(w.periodStart),
  }))

  // ── Expenses approved on this line ───────────────────────────────────
  // The contracts this line pays for: the payer's own sell lines it
  // funds, and the supplier's contract below it to the bottom of the
  // chain — the same two places the check looks.
  const linked = await prisma.contractLink.findMany({ where: { buyContractId }, select: { sellContractId: true } })
  const below = buy.supplierSellContractId
    ? descend(buy.supplierSellContractId, await ladderFor([buy.supplierSellContractId]))
    : []
  const onLine = [...new Set([...linked.map((x) => x.sellContractId), ...below])]
  const expenseRows = onLine.length
    ? await prisma.expense.findMany({
        where: {
          sellContractId: { in: onLine },
          personId: { in: buy.candidates.map((c) => c.personId) },
          status: 'APPROVED',
        },
        select: {
          id: true, category: true, total: true, periodStart: true, billable: true, companyId: true,
          person: { select: { name: true } },
        },
        orderBy: { periodStart: 'desc' },
        take: 200,
      })
    : []
  // What this firm accepted of each (the founder, 2026-10-19: an expense
  // is accepted like a week), and whether the agreement with the supplier
  // makes the kind billable on this leg. The same reading the check makes
  // (lib/money/keyed-receipt), so the form offers only what it would take.
  const decisions = await acceptancesOn(expenseRows.map((e) => e.id))
  const supplierLeg = buy.supplierSellContractId
    ? (await legsFor([buy.supplierSellContractId])).get(buy.supplierSellContractId) ?? null
    : null
  const offered: { id: string; says: string; amountMinor: number }[] = []
  const expensesToAccept: { id: string; says: string }[] = []
  for (const e of expenseRows) {
    const leg = supplierLeg ? legBills(e, supplierLeg) : { bills: e.billable, says: null }
    if (!leg.bills) continue
    const label = `${e.person?.name ?? 'Somebody'} · ${e.category.toLowerCase()} · ${formatDay(e.periodStart)}`
    const claimed = Math.round(parseFloat(e.total.toString()) * 10 ** decimalsFor(currency))
    // Raised on this firm's own book: its own approval stands.
    if (e.companyId === companyId) {
      offered.push({ id: e.id, says: label, amountMinor: claimed })
      continue
    }
    const own = payersOwn(companyId, decisions.get(e.id) ?? [])
    if (own.kind === 'ACCEPTED') offered.push({ id: e.id, says: label, amountMinor: own.cents })
    else {
      expensesToAccept.push({
        id: e.id,
        says: `${e.person?.name ?? 'Somebody'}’s ${e.category.toLowerCase()} expense of ${formatDay(e.periodStart)} is ${own.kind === 'SENT_BACK' ? 'sent back' : 'not accepted yet'}, so it is not offered. Accept it first.`,
      })
    }
  }

  const milestoneRows = buy.workOrderId
    ? await prisma.orderMilestone.findMany({
        where: { orderId: buy.workOrderId, status: 'ACCEPTED' },
        select: { id: true, name: true, amountCents: true, acceptedAt: true },
        orderBy: { acceptedAt: 'desc' },
        take: 200,
      })
    : []
  const heldSums = await heldOn(companyId, {
    expenseIds: expenseRows.map((e) => e.id),
    milestoneIds: milestoneRows.map((m) => m.id),
  })

  return {
    weeks,
    waiting,
    waitingSays: waiting.length > 0 ? book?.notAccepted ?? null : null,
    expenses: offered.map((e) => ({ ...e, heldBy: heldSums.get(e.id) ?? null })),
    expensesToAccept,
    milestones: milestoneRows.map((m) => ({
      id: m.id,
      says: m.acceptedAt ? `${m.name} · accepted ${formatDay(m.acceptedAt)}` : m.name,
      amountMinor: m.amountCents,
      heldBy: heldSums.get(m.id) ?? null,
    })),
  }
}

/**
 * Which live invoice receipt on this buy line already holds each week, by
 * the timesheet's id — read the way the check reads it (`alreadyReceived`),
 * so a week inside a receipt typed in as a total is shown as held too, not
 * only a week another receipt names on a line. Walk, 2026-10-19: Helena
 * Marsh's three weeks sat inside a total-only receipt, the form offered
 * them as free, and the check then refused every one. And a week on a
 * bill the supplier generated here (`alreadyOnABill`, the intake's own
 * refusal), for the same reason.
 */
async function weeksHeld(
  companyId: string,
  buyContractId: string,
  vendorCompanyId: string | null,
  personIds: string[],
  weeks: { id: string; personName: string | null; days: Record<string, number> | null; periodStart: string; periodEnd: string }[],
): Promise<Map<string, string>> {
  if (weeks.length === 0) return new Map()
  const rows = await prisma.vendorBill.findMany({
    where: { companyId, buyContractId, status: { not: 'CANCELLED' } },
    select: {
      number: true, periodStart: true, periodEnd: true, receivedAt: true,
      vendorCompany: { select: { name: true } },
      lines: { select: { timesheetId: true } },
    },
  })
  const others: ReceiptAlready[] = rows
    // A total with no period holds no week: nothing says which.
    .filter((o) => o.lines.length > 0 || (o.periodStart && o.periodEnd))
    .map((o) => ({
      number: o.number,
      vendorName: o.vendorCompany.name,
      periodStart: iso(o.periodStart ?? o.receivedAt),
      periodEnd: iso(o.periodEnd ?? o.receivedAt),
      receivedAt: o.receivedAt.toISOString(),
      heldTimesheetIds: o.lines.length > 0 ? o.lines.flatMap((l) => (l.timesheetId ? [l.timesheetId] : [])) : null,
    }))
  const from = weeks.reduce((a, w) => (w.periodStart < a ? w.periodStart : a), weeks[0].periodStart)
  const to = weeks.reduce((a, w) => (w.periodEnd > a ? w.periodEnd : a), weeks[0].periodEnd)
  const generated = vendorCompanyId
    ? await prisma.invoice.findMany({
        where: {
          status: { notIn: ['DRAFT', 'CANCELLED', 'VOID'] },
          invoiceLines: {
            some: {
              sellContract: { companyId: vendorCompanyId, clientCompanyId: companyId },
              timesheet: { periodStart: { lte: new Date(`${to}T00:00:00Z`) }, periodEnd: { gte: new Date(`${from}T00:00:00Z`) } },
            },
          },
        },
        select: {
          number: true,
          invoiceLines: {
            where: { sellContract: { companyId: vendorCompanyId, clientCompanyId: companyId }, timesheetId: { not: null } },
            select: { personId: true, person: { select: { name: true } }, timesheet: { select: { days: true } } },
          },
        },
      })
    : []
  const bills: BillOnRecord[] = generated.map((g) => ({
    number: g.number,
    vendorName: '',
    lines: g.invoiceLines.flatMap((l) =>
      l.personId && l.timesheet
        ? [{ personId: l.personId, personName: l.person?.name ?? 'Somebody', days: (l.timesheet.days as Record<string, number>) ?? {} }]
        : []
    ),
  }))
  const out = new Map<string, string>()
  for (const w of weeks) {
    const hit = alreadyReceived({ periodStart: w.periodStart, periodEnd: w.periodEnd }, [w], others)
    if (hit) { out.set(w.id, hit.number); continue }
    const billed = alreadyOnABill({ periodStart: w.periodStart, periodEnd: w.periodEnd, personIds }, bills)
    if (billed) out.set(w.id, billed.bills[0])
  }
  return out
}

/** Which live invoice receipt of this firm's already holds each expense or milestone, by its id. */
async function heldOn(
  companyId: string,
  ids: { timesheetIds?: string[]; expenseIds?: string[]; milestoneIds?: string[] },
): Promise<Map<string, string>> {
  const or = [
    ...(ids.timesheetIds?.length ? [{ timesheetId: { in: ids.timesheetIds } }] : []),
    ...(ids.expenseIds?.length ? [{ expenseId: { in: ids.expenseIds } }] : []),
    ...(ids.milestoneIds?.length ? [{ milestoneId: { in: ids.milestoneIds } }] : []),
  ]
  if (or.length === 0) return new Map()
  const rows = await prisma.vendorBillLine.findMany({
    where: { OR: or, vendorBill: { companyId, status: { not: 'CANCELLED' } } },
    select: { timesheetId: true, expenseId: true, milestoneId: true, vendorBill: { select: { number: true } } },
  })
  const out = new Map<string, string>()
  for (const r of rows) {
    const key = r.timesheetId ?? r.expenseId ?? r.milestoneId
    if (key && !out.has(key)) out.set(key, r.vendorBill.number)
  }
  return out
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
