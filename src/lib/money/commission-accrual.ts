/**
 * What each commission row earned in a pay period, read from the record.
 *
 * The rules are `commission-rows` (pure). This reads the facts they need
 * and nothing else:
 *
 *   - the rows in force in the period at the firm (`ContractCommission`);
 *   - the placement each row is on: the sell line itself for a sales
 *     commission, the sell line the buy line funds (`ContractLink`) for a
 *     recruiting one;
 *   - each placement's weeks as the one margin service prices them
 *     (`placementBooks` over a window): the hours the firm above accepted,
 *     what the bill is priced on, and the margin, never a second pricing;
 *   - for a row that accrues on cash, which weeks' bills were paid in full
 *     in the period, and on what day the last payment arrived;
 *   - what was already posted under each row (`OrderPosting` kind
 *     COMMISSION, keyed `commission-row:<row>:<period>`), for the cap and so
 *     a period is posted once.
 *
 * Nothing here writes. The commission run posts what this returns.
 */

import { prisma } from '@/lib/db'
import { DRAWS_NOTHING } from '@/lib/money/bill-state'
import { fromPrismaDecimal } from '@/lib/money'
import { pairsFor, placementBooks, type PlacementBooks } from '@/lib/money/margin'
import { accrueCommission, type CommissionTerms, type PeriodAccrual, type WeekFact } from '@/lib/money/commission-rows'

const DAY = 86_400_000

export interface CommissionPeriod {
  from: Date
  /** The last day of the period, inclusive. */
  to: Date
}

/** The key a row's posting for this period is written under. */
export const periodKey = (p: CommissionPeriod) => `${p.from.toISOString().slice(0, 10)}..${p.to.toISOString().slice(0, 10)}`
export const postingKey = (rowId: string, p: CommissionPeriod) => `commission-row:${rowId}:${periodKey(p)}`

/** The calendar month holding `today`, in UTC, as a pay period. */
export function monthPeriod(today: Date): CommissionPeriod {
  const y = today.getUTCFullYear()
  const m = today.getUTCMonth()
  return { from: new Date(Date.UTC(y, m, 1)), to: new Date(Date.UTC(y, m + 1, 0)) }
}

/** The Sundays whose weeks start inside the period. Pure. */
export function sundaysIn(p: CommissionPeriod): Date[] {
  const out: Date[] = []
  const first = new Date(Date.UTC(p.from.getUTCFullYear(), p.from.getUTCMonth(), p.from.getUTCDate()))
  const offset = (7 - first.getUTCDay()) % 7
  for (let d = first.getTime() + offset * DAY; d <= p.to.getTime(); d += 7 * DAY) out.push(new Date(d))
  return out
}

/** The day a bill was paid in full: the payment that took it to its total. Null where it is not. Pure. */
export function paidInFullOn(total: number, payments: readonly { minor: number; at: Date }[]): Date | null {
  if (total <= 0) return null
  let paid = 0
  for (const p of [...payments].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    paid += p.minor
    if (paid >= total) return p.at
  }
  return null
}

export interface RowAccrual {
  id: string
  kind: CommissionTerms['kind']
  basis: CommissionTerms['basis']
  accrueOn: CommissionTerms['accrueOn']
  terms: CommissionTerms
  earnedBy: { id: string; name: string }
  setBy: { id: string; name: string }
  setAt: Date
  /** The line the row sits on. */
  lineId: string
  side: 'SELL' | 'BUY'
  /** The placements it is earned on: the sell lines whose weeks count. */
  sellContractIds: string[]
  person: { id: string; name: string } | null
  client: { id: string; name: string } | null
  accrual: PeriodAccrual
  /** Posted for this period already, by the commission run. */
  postedCents: number | null
  /** Everything posted under the row before this period. */
  alreadyCents: number
  /** ACCRUED: earned and not yet posted; POSTED; WAITING: on cash, nothing paid yet; NOTHING; BLANK. */
  state: 'ACCRUED' | 'POSTED' | 'WAITING' | 'NOTHING' | 'BLANK'
}

function factOf(b: PlacementBooks, weekStart: Date): WeekFact {
  const e = b.earned
  const awaiting = e.weeksAwaitingPay > 0
  return {
    weekStart,
    currency: b.currency,
    hours: e.hoursBilled,
    billedCents: e.revenueCents,
    marginCents: awaiting ? null : e.marginBlankedBy && e.marginBlankedBy !== 'NOTHING_SIGNED' ? null : (e.marginCents ?? (e.hoursBilled > 0 ? null : 0)),
    marginBlankedBecause: awaiting ? 'the employer has not accepted the week yet' : e.marginRefusedBecause,
  }
}

/**
 * Every commission row at the firm in force in the period, with what it
 * earned. `earnedById` narrows to one person's own rows (their own page,
 * or a recruiter reading theirs); `sellContractIds` to rows on those
 * placements.
 */
export async function commissionAccruals(
  companyId: string,
  period: CommissionPeriod,
  opts: { earnedById?: string; sellContractIds?: readonly string[] } = {}
): Promise<RowAccrual[]> {
  return (await commissionAccrualsOver(companyId, [period], opts))[0]
}

/** How many windows the margin service prices at once, so a long span never starves the pool. */
const PRICE_AT_ONCE = 6

/**
 * The same answer as `commissionAccruals`, for several periods at once,
 * one list per period in the order given. The rows, the placements, the
 * cash bills and the postings are read once for the whole span and cut per
 * period in memory; the margin service prices each distinct window once,
 * a few at a time. Review of 2026-11-12: Bench profit read every month
 * from the earliest placement on as its own set of reads, so a placement
 * with years behind it cost a set of reads a month.
 */
export async function commissionAccrualsOver(
  companyId: string,
  periods: readonly CommissionPeriod[],
  opts: { earnedById?: string; sellContractIds?: readonly string[] } = {}
): Promise<RowAccrual[][]> {
  if (periods.length === 0) return []
  const spanFrom = new Date(Math.min(...periods.map((p) => p.from.getTime())))
  const spanTo = new Date(Math.max(...periods.map((p) => p.to.getTime())))
  const rows = await prisma.contractCommission.findMany({
    where: {
      companyId,
      ...(opts.earnedById ? { earnedById: opts.earnedById } : {}),
      fromDate: { lte: spanTo },
      OR: [{ toDate: null }, { toDate: { gte: spanFrom } }],
    },
    include: {
      earnedBy: { select: { id: true, name: true } },
      setBy: { select: { id: true, name: true } },
      sellContract: { select: { id: true, companyId: true, person: { select: { id: true, name: true } }, clientCompany: { select: { id: true, name: true } } } },
      buyContract: {
        select: {
          id: true, companyId: true,
          sellLinks: { select: { sellContract: { select: { id: true, companyId: true, person: { select: { id: true, name: true } }, clientCompany: { select: { id: true, name: true } } } } } },
        },
      },
    },
    orderBy: { setAt: 'asc' },
    take: 2000,
  })
  if (rows.length === 0) return periods.map(() => [])

  const placedAll = rows.map((r) => {
    const sells = r.sellContract
      ? [r.sellContract]
      : (r.buyContract?.sellLinks ?? []).map((l) => l.sellContract).filter((s) => s.companyId === companyId)
    return { r, sells }
  }).filter(({ sells }) => !opts.sellContractIds || sells.some((s) => opts.sellContractIds!.includes(s.id)))
  if (placedAll.length === 0) return periods.map(() => [])

  // In force in a period: the row's own days touch it.
  const inForce = (r: { fromDate: Date; toDate: Date | null }, p: CommissionPeriod) =>
    r.fromDate <= p.to && (!r.toDate || r.toDate >= p.from)
  const placedBy = periods.map((p) => placedAll.filter(({ r }) => inForce(r, p)))

  const sellIds = [...new Set(placedAll.flatMap((p) => p.sells.map((s) => s.id)))]
  const pairs = sellIds.length ? await pairsFor(companyId, 'ALL', sellIds) : null

  // ── On cash: every bill on the span's cash placements, read once ─────
  const cashSellsAll = [...new Set(placedAll.filter((p) => p.r.accrueOn === 'CASH').flatMap((p) => p.sells.map((s) => s.id)))]
  const cashBills: { sellContractId: string; week: Date; paidOn: Date | null }[] = []
  if (cashSellsAll.length) {
    const lines = await prisma.invoiceLine.findMany({
      where: { sellContractId: { in: cashSellsAll }, timesheetId: { not: null }, invoice: { status: { notIn: [...DRAWS_NOTHING] } } },
      select: {
        sellContractId: true,
        timesheet: { select: { periodStart: true } },
        invoice: { select: { id: true, total: true, currency: true, payments: { select: { amount: true, receivedAt: true } } } },
      },
      take: 10_000,
    })
    for (const l of lines) {
      if (!l.sellContractId || !l.timesheet) continue
      const cur = l.invoice.currency
      cashBills.push({
        sellContractId: l.sellContractId,
        week: l.timesheet.periodStart,
        paidOn: paidInFullOn(
          fromPrismaDecimal(l.invoice.total, cur).minor,
          l.invoice.payments.map((p) => ({ minor: fromPrismaDecimal(p.amount, cur).minor, at: p.receivedAt })),
        ),
      })
    }
  }

  // ── Which windows each period prices ─────────────────────────────────
  //
  // A row on accepted weeks that covers the whole period reads the period
  // as one window; a row that starts or ends inside it reads week by week,
  // so a week outside its own days is never counted.
  const plans = periods.map((period, i) => {
    const placed = placedBy[i]
    const covers = (r: { fromDate: Date; toDate: Date | null }) => r.fromDate <= period.from && (!r.toDate || r.toDate >= period.to)
    const accepted = placed.filter((p) => p.r.accrueOn === 'ACCEPTED')
    const weekly = accepted.some((p) => !covers(p.r))
    const windows = new Map<string, { from: Date; to: Date }>()
    if (accepted.length) {
      if (weekly) for (const s of sundaysIn(period)) windows.set(s.toISOString(), { from: s, to: new Date(s.getTime() + 7 * DAY) })
      else windows.set(`period:${period.from.toISOString()}`, { from: period.from, to: new Date(period.to.getTime() + DAY) })
    }
    const cashSells = new Set(placed.filter((p) => p.r.accrueOn === 'CASH').flatMap((p) => p.sells.map((s) => s.id)))
    const paidWeeks = new Map<string, Set<string>>() // sell id → week starts (ISO) paid in the period
    for (const b of cashBills) {
      if (!cashSells.has(b.sellContractId)) continue
      if (!b.paidOn || b.paidOn < period.from || b.paidOn.getTime() >= period.to.getTime() + DAY) continue
      const key = b.week.toISOString()
      windows.set(key, { from: b.week, to: new Date(b.week.getTime() + 7 * DAY) })
      paidWeeks.set(b.sellContractId, (paidWeeks.get(b.sellContractId) ?? new Set()).add(key))
    }
    return { period, placed, weekly, windows, paidWeeks }
  })

  // ── The margin service, once per distinct window, a few at a time ────
  const priced = new Map<string, Map<string, WeekFact>>() // window key → sell id → fact
  if (pairs) {
    const all = new Map<string, { from: Date; to: Date }>()
    for (const pl of plans) for (const [k, w] of pl.windows) all.set(k, w)
    const todo = [...all.entries()]
    for (let i = 0; i < todo.length; i += PRICE_AT_ONCE) {
      await Promise.all(todo.slice(i, i + PRICE_AT_ONCE).map(async ([key, w]) => {
        const books = await placementBooks(companyId, { scope: 'ALL', pairs, window: w })
        priced.set(key, new Map(books.map((b) => [b.sellContractId, factOf(b, w.from)])))
      }))
    }
  }

  // ── What was posted under each row, read once ────────────────────────
  const posted = await prisma.orderPosting.findMany({
    where: { companyId, kind: 'COMMISSION', source: 'PAYROLL', reversalOfId: null, OR: placedAll.map((p) => ({ sourceId: { startsWith: `commission-row:${p.r.id}:` } })) },
    select: { sourceId: true, amountCents: true, txAmountCents: true },
  })

  return plans.map(({ period, placed, weekly, windows, paidWeeks }) => {
    const facts = new Map<string, Map<string, WeekFact>>()
    for (const key of windows.keys()) {
      const f = priced.get(key)
      if (f) facts.set(key, f)
    }
    return placed.map(({ r, sells }) => {
      const terms: CommissionTerms = {
        sellContractId: r.sellContractId, buyContractId: r.buyContractId, earnedById: r.earnedById,
        kind: r.kind, basis: r.basis, rateBps: r.rateBps, amountCents: r.amountCents, capCents: r.capCents,
        fromDate: r.fromDate, toDate: r.toDate, accrueOn: r.accrueOn, reason: r.reason,
      }
      const weeks: WeekFact[] = []
      for (const s of sells) {
        if (r.accrueOn === 'CASH') {
          for (const key of paidWeeks.get(s.id) ?? []) {
            const f = facts.get(key)?.get(s.id)
            if (f) weeks.push(f)
          }
        } else {
          for (const [key, byLine] of facts) {
            if (!windowsFromAccepted(key, weekly, period)) continue
            const f = byLine.get(s.id)
            if (f) weeks.push(f)
          }
        }
      }
      const mine = posted.filter((p) => p.sourceId?.startsWith(`commission-row:${r.id}:`))
      const thisKey = postingKey(r.id, period)
      const centsOf = (p: (typeof posted)[number]) => Math.abs(p.txAmountCents ?? p.amountCents)
      const already = mine.filter((p) => p.sourceId !== thisKey).reduce((n, p) => n + centsOf(p), 0)
      const now = mine.find((p) => p.sourceId === thisKey)
      const accrual = accrueCommission(terms, weeks, already)
      const state: RowAccrual['state'] = now
        ? 'POSTED'
        : accrual.earnedCents == null ? 'BLANK'
        : (accrual.amountCents ?? 0) > 0 ? 'ACCRUED'
        : r.accrueOn === 'CASH' && accrual.weeks === 0 ? 'WAITING'
        : 'NOTHING'
      const first = sells[0] ?? null
      return {
        id: r.id, kind: r.kind, basis: r.basis, accrueOn: r.accrueOn, terms,
        earnedBy: r.earnedBy, setBy: r.setBy, setAt: r.setAt,
        lineId: r.sellContractId ?? r.buyContractId!, side: r.sellContractId ? 'SELL' : 'BUY',
        sellContractIds: sells.map((s) => s.id),
        person: first?.person ?? null, client: first?.clientCompany ?? null,
        accrual, postedCents: now ? centsOf(now) : null, alreadyCents: already, state,
      } satisfies RowAccrual
    })
  })
}

/**
 * Whether a window key belongs to the accepted-weeks set. Cash windows are
 * keyed by a sheet's own Sunday and may fall outside the period; accepted
 * windows are the period's Sundays, or the period itself.
 */
function windowsFromAccepted(key: string, weekly: boolean, period: CommissionPeriod): boolean {
  if (key.startsWith('period:')) return !weekly
  if (!weekly) return false
  const d = new Date(key)
  return d >= period.from && d.getTime() <= period.to.getTime()
}

/**
 * Commission per placement for the period, for Profitability's "margin
 * after commission". Per sell line: the sum of its rows' amounts in one
 * currency, or null with the reason where any row is blank, in another
 * currency, or covers more than one placement (its share of each cannot be
 * told apart). Pure over the accruals.
 */
export function commissionByPlacement(accruals: readonly RowAccrual[]): Map<string, { cents: number | null; currency: string | null; blankedBecause: string | null }> {
  const out = new Map<string, { cents: number | null; currency: string | null; blankedBecause: string | null }>()
  for (const a of accruals) {
    for (const id of a.sellContractIds) {
      const prev = out.get(id) ?? { cents: 0, currency: null, blankedBecause: null }
      if (prev.cents == null) continue
      const blank = (why: string) => out.set(id, { cents: null, currency: prev.currency, blankedBecause: why })
      if (a.sellContractIds.length > 1) { blank(`${a.earnedBy.name}’s commission covers more than one placement, so its share of this one cannot be told apart.`); continue }
      const cents = a.postedCents ?? a.accrual.amountCents
      if (cents == null) { blank(a.accrual.blankedBecause ?? 'A commission on this placement cannot be worked out for the period.'); continue }
      const cur = a.accrual.currency
      if (cur && prev.currency && cur !== prev.currency) { blank('Its commissions are in two currencies, and two currencies are never added.'); continue }
      out.set(id, { cents: prev.cents + cents, currency: cur ?? prev.currency, blankedBecause: null })
    }
  }
  return out
}

/**
 * A person's own commissions, at every firm whose lines carry one for
 * them, for the period. Read by the person's own page (supply's) and by
 * nobody on behalf of anybody else: the caller passes its own person id.
 * The figure on a share of margin names the margin on the person's own
 * placement only, which a person paid a share of it may see.
 */
export async function ownCommissions(personId: string, period: CommissionPeriod = monthPeriod(new Date())): Promise<RowAccrual[]> {
  const firms = await prisma.contractCommission.findMany({ where: { earnedById: personId }, select: { companyId: true }, distinct: ['companyId'] })
  const out: RowAccrual[] = []
  for (const f of firms) out.push(...(await commissionAccruals(f.companyId, period, { earnedById: personId })))
  return out
}
