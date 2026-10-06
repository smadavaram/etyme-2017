/**
 * The one margin service.
 *
 * Profitability, Reports, the Payroll spread column and the placement page
 * all ask what a placement earns. Until 2026-10-06 four screens did four
 * pieces of arithmetic: Payroll averaged bill rates in the browser and read
 * a missing one as nought, Profitability priced the hours filed on the
 * firm's own line — which a firm in the middle of a chain has none of, so
 * Computer Systems read nothing for Helena Marsh — and the books posted a
 * chained week to the bottom firm at the top firm's rate. The outside chain
 * audit of 2026-10-05 found all of it from the screens.
 *
 * ── Two numbers, two names ───────────────────────────────────────────
 *
 *   AGREED SPREAD   the rates two firms agreed, per hour: this firm's own
 *                   sell rate less its own buy rate on the same placement
 *                   (`spreadOn`, lib/money/placement-margin). Knows nothing
 *                   about hours.
 *   EARNED MARGIN   what the hours actually earned: the hours the payer
 *                   accepted at this firm's own sell rate, less the hours
 *                   this firm accepted at its own buy rate — or, at hop 0,
 *                   what payroll pays plus the employer's burden — over the
 *                   weeks both sides have signed (`placementEarned`).
 *
 * Never the bare word "margin" beside a figure.
 *
 * ── One rung, one firm ───────────────────────────────────────────────
 *
 * Every figure here is the viewing firm's own: its own sell lines, priced
 * on its own rates, from the signatures on the rung it is party to
 * (`readRungs`, lib/money/placement-pay-terms). It learns how many hops
 * lie above and below it and never what they charge.
 *
 * ── "Billed" is three figures ────────────────────────────────────────
 *
 * Accepted and not yet billed, billed (bills raised), collected (what came
 * back against them). Whether the heading over them is renamed is the
 * founder's decision (decision 6 in the audit); the heading is one
 * constant, `REVENUE_HEADING`, so the rename is a one-word change.
 */

import { prisma } from '@/lib/db'
import { rateInForce, ratePeriods } from '@/lib/contract-rate'
import { placementEarned, priceSheets, type PlacementEarned } from '@/lib/money/placement-earned'
import { placementPayTermsMany, payTermsKey, readRungs } from '@/lib/money/placement-pay-terms'
import { spreadOn, isLive, type Pair, type Scope, type Spread } from '@/lib/money/placement-margin'
import { hopsAround } from '@/lib/money/hop-ledger'
import { burdenRate } from '@/lib/order-postings'
import type { ContractType, Profit } from '@/lib/profitability'
import { amount } from '@/lib/money-display'

/** The two names, and the heading over what has been earned and billed. */
export const AGREED_SPREAD = 'Agreed spread'
export const EARNED_MARGIN = 'Earned margin'
/**
 * The heading over the revenue figures. The audit proposes renaming it
 * (decision 6); the founder has not decided. One word, here, when he does.
 */
export const REVENUE_HEADING = 'Billed'

// ── Billed, as three figures ──────────────────────────────────────────

export interface Billing {
  /** Hours the payer accepted, at this firm's own rate, on no bill yet. */
  acceptedNotBilledCents: number
  /** Bills raised on this line, at what each line on them says. */
  billedCents: number
  /** What came back against those bills. */
  collectedCents: number
  currency: string
  says: string
}

export interface BillLine {
  amountCents: number
  timesheetId: string | null
  invoiceTotalCents: number
  invoicePaidCents: number
  currency: string
}

/**
 * The three figures for one line. `weeks` is each accepted week's revenue
 * at this line's rate, by sheet id; a week on any bill raised on this line
 * is billed, the rest are accepted and not yet billed. Collected is each
 * bill line's share of what was paid on its bill, never more than the line.
 */
export function billingOf(input: {
  currency: string
  weeks: { sheetId: string; revenueCents: number }[]
  lines: BillLine[]
}): Billing {
  const mine = input.lines.filter((l) => l.currency === input.currency)
  const onABill = new Set(mine.map((l) => l.timesheetId).filter((x): x is string => !!x))
  const acceptedNotBilledCents = input.weeks
    .filter((w) => !onABill.has(w.sheetId))
    .reduce((n, w) => n + w.revenueCents, 0)
  const billedCents = mine.reduce((n, l) => n + l.amountCents, 0)
  const collectedCents = mine.reduce((n, l) => {
    if (l.invoiceTotalCents <= 0) return n
    const share = Math.min(1, Math.max(0, l.invoicePaidCents / l.invoiceTotalCents))
    return n + Math.round(l.amountCents * share)
  }, 0)
  const other = input.lines.length - mine.length
  const c = input.currency
  return {
    acceptedNotBilledCents,
    billedCents,
    collectedCents,
    currency: c,
    says:
      `${amount(acceptedNotBilledCents, c)} accepted and not yet billed, ${amount(billedCents, c)} billed, ` +
      `${amount(collectedCents, c)} collected.` +
      (other > 0 ? ` ${other} bill line${other === 1 ? '' : 's'} in another currency left out rather than added.` : ''),
  }
}

/** Three figures over many lines, refused where they are in two currencies. */
export function billingTotal(rows: Billing[]): Billing | null {
  if (rows.length === 0) return null
  if (new Set(rows.map((r) => r.currency)).size > 1) return null
  const c = rows[0].currency
  const sum = (f: (b: Billing) => number) => rows.reduce((n, r) => n + f(r), 0)
  const acceptedNotBilledCents = sum((r) => r.acceptedNotBilledCents)
  const billedCents = sum((r) => r.billedCents)
  const collectedCents = sum((r) => r.collectedCents)
  return {
    acceptedNotBilledCents, billedCents, collectedCents, currency: c,
    says:
      `${amount(acceptedNotBilledCents, c)} accepted and not yet billed, ${amount(billedCents, c)} billed, ` +
      `${amount(collectedCents, c)} collected.`,
  }
}

// ── Earned margin, in the shape every profitability view reads ────────

/**
 * One placement's earned figures as a `Profit`, so the candidate and
 * customer roll-ups in lib/profitability add them as they always have.
 * The percentage is the margin over the revenue of the weeks it covers —
 * never over revenue it has no cost against.
 */
export function profitFrom(e: PlacementEarned, burdenSays: string | null): Profit {
  const costUnknown = e.costCents == null
  const pay = e.costCents ?? 0
  const burden = e.burdenCents ?? 0
  const margin = e.marginCents ?? 0
  const pct =
    e.marginCents == null || !e.marginRevenueCents ? null : Math.round((e.marginCents / e.marginRevenueCents) * 1000) / 10
  const assumptions = [
    ...(costUnknown && e.costRefusedBecause ? [e.costRefusedBecause] : []),
    ...(burden > 0 && burdenSays ? [burdenSays] : []),
  ]
  return {
    costUnknown,
    revenueCents: e.revenueCents,
    payCents: pay,
    burdenCents: burden,
    commissionCents: 0,
    expenseMarginCents: 0,
    costCents: pay + burden,
    marginCents: margin,
    marginPct: pct,
    assumptions,
    says:
      e.marginCents == null
        ? (e.marginRefusedBecause ?? 'No earned margin yet.')
        : `${EARNED_MARGIN}: ${amount(e.marginCents)} on ${amount(e.marginRevenueCents ?? 0)}` +
          (pct == null ? '.' : ` — ${pct.toFixed(1)}%.`),
  }
}

export interface BookEarned {
  revenueCents: number
  marginCents: number | null
  /** The revenue of the weeks the margin covers. */
  marginRevenueCents: number | null
  pct: number | null
  /** Placements with no cost behind them. One blanks the book's rate. */
  unpriced: number
  currency: string | null
  refusedBecause: string | null
  says: string
}

/**
 * The earned margin across a book. One placement with no cost behind it
 * blanks the rate rather than being averaged in, and two currencies are
 * never added.
 */
export function bookEarned(rows: { earned: PlacementEarned; currency: string; revenueCurrency?: string }[]): BookEarned {
  const currencies = new Set(rows.map((r) => r.currency))
  const revenueCents = rows.reduce((n, r) => n + r.earned.revenueCents, 0)
  if (currencies.size > 1) {
    return {
      revenueCents, marginCents: null, marginRevenueCents: null, pct: null, unpriced: 0, currency: null,
      refusedBecause: 'Placements here are billed in more than one currency, and two currencies are never added.',
      says: 'Placements here are billed in more than one currency, so there is no one earned margin across them.',
    }
  }
  const currency = rows[0]?.currency ?? null
  const unpriced = rows.filter((r) => r.earned.costCents == null).length
  const counted = rows.filter((r) => r.earned.marginCents != null)
  const marginCents = counted.reduce((n, r) => n + (r.earned.marginCents ?? 0), 0)
  const marginRevenueCents = counted.reduce((n, r) => n + (r.earned.marginRevenueCents ?? 0), 0)
  if (unpriced > 0) {
    return {
      revenueCents, marginCents, marginRevenueCents, pct: null, unpriced, currency,
      refusedBecause: `${unpriced} placement${unpriced === 1 ? ' has' : 's have'} no cost on record, so the book has no earned margin rate.`,
      says:
        `${amount(revenueCents, currency ?? undefined)} accepted. ${unpriced} placement${unpriced === 1 ? ' has' : 's have'} ` +
        'no cost on record, so this is not a margin on the book — and a hundred per cent would be a missing link, not good news.',
    }
  }
  if (counted.length === 0 || marginRevenueCents === 0) {
    return {
      revenueCents, marginCents: null, marginRevenueCents: null, pct: null, unpriced, currency,
      refusedBecause: 'No week has been signed by both sides yet.',
      says: 'No week has been signed by both sides yet, so nothing has earned a margin.',
    }
  }
  const pct = Math.round((marginCents / marginRevenueCents) * 1000) / 10
  return {
    revenueCents, marginCents, marginRevenueCents, pct, unpriced, currency, refusedBecause: null,
    says: `${EARNED_MARGIN}: ${amount(marginCents, currency ?? undefined)} on ${amount(marginRevenueCents, currency ?? undefined)} — ${pct.toFixed(1)}%.`,
  }
}

// ── The pairs ─────────────────────────────────────────────────────────

export interface Pairs {
  /** Scoped by the caller's `scope`. What a margin is read over. */
  pairs: Pair[]
  /** Unfiltered. A revenue figure asks about the sell line alone. */
  all: Pair[]
  /** Sell lines the award never linked a buy line to. Named, never dropped. */
  unlinked: number
  /** Sell lines with more than one buy line over their life. */
  multiLinked: { sellContractId: string; personName: string; links: number }[]
  totalSellLines: number
}

/**
 * Every placement this company sells, with the buy line that funds it.
 *
 * The pair is the unit, not the person: `ContractLink` is written by the
 * award and says which buy line pays for which sell line. Where a sell line
 * has several links over its life the one covering today is used, else the
 * latest to start, and the count is reported. Only the firm's own sell
 * lines: a supplier's line billing this firm is its cost, never its revenue.
 */
export async function pairsFor(companyId: string, scope: Scope, only?: readonly string[]): Promise<Pairs> {
  const sells = await prisma.sellContract.findMany({
    where: { companyId, ...(only ? { id: { in: [...only] } } : {}) },
    select: {
      id: true, billRate: true, billCurrency: true, state: true,
      startDate: true, endDate: true, projectOrderId: true,
      person: { select: { id: true, name: true } },
      clientCompany: { select: { id: true, name: true } },
      buyLinks: {
        select: {
          effectiveFrom: true, effectiveTo: true,
          buyContract: {
            select: {
              id: true, contractType: true, state: true, payCurrency: true,
              projectOrderId: true, supplierSellContractId: true,
              vendorCompany: { select: { name: true } },
              candidates: { select: { personId: true, payRate: true, payCurrency: true } },
            },
          },
        },
        orderBy: { effectiveFrom: 'desc' },
      },
    },
    take: 1000,
  })

  const now = Date.now()
  const multiLinked: Pairs['multiLinked'] = []
  const pairRates = await prisma.rateHistory.findMany({
    where: {
      approvalState: 'APPROVED',
      OR: [
        { contractType: 'SELL', contractId: { in: sells.map((c) => c.id) } },
        { contractType: 'BUY', contractId: { in: sells.flatMap((c) => c.buyLinks.map((l) => l.buyContract.id)) } },
      ],
    },
    select: { id: true, contractType: true, contractId: true, rate: true, fromDate: true, toDate: true, approvalState: true },
  })
  const inForce = (side: 'SELL' | 'BUY', id: string, opening: number, end: Date | null) =>
    rateInForce(
      opening,
      ratePeriods(pairRates.filter((r) => r.contractType === side && r.contractId === id)),
      end && end.getTime() < now ? end : new Date(now)
    ).rateCents
  let unlinked = 0

  const all: Pair[] = sells.map((c) => {
    if (c.buyLinks.length > 1) {
      multiLinked.push({ sellContractId: c.id, personName: c.person.name, links: c.buyLinks.length })
    }
    const covering =
      c.buyLinks.find(
        (l) => l.effectiveFrom.getTime() <= now && (l.effectiveTo === null || l.effectiveTo.getTime() >= now)
      ) ?? c.buyLinks[0]
    if (!covering) unlinked++
    const b = covering?.buyContract ?? null
    const cand = b?.candidates.find((x) => x.personId === c.person.id) ?? null
    return {
      sell: {
        id: c.id,
        billRateCents: inForce('SELL', c.id, c.billRate, c.endDate),
        billCurrency: c.billCurrency ?? 'USD',
        state: c.state,
        personId: c.person.id,
        personName: c.person.name,
        clientId: c.clientCompany.id,
        clientName: c.clientCompany.name,
        masterContractId: c.projectOrderId,
      },
      buy:
        b == null
          ? null
          : {
              id: b.id,
              payRateCents: cand ? inForce('BUY', b.id, cand.payRate, c.endDate) : 0,
              payCurrency: cand?.payCurrency ?? b.payCurrency ?? 'USD',
              contractType: b.contractType as ContractType,
              state: b.state,
              vendorName: b.vendorCompany?.name ?? null,
              masterContractId: b.projectOrderId,
            },
    }
  })

  return {
    pairs: scope === 'LIVE' ? all.filter(isLive) : all,
    all,
    unlinked,
    multiLinked,
    totalSellLines: all.length,
  }
}

// ── One placement, as its own firm reads it ───────────────────────────

export interface PlacementBooks {
  sellContractId: string
  person: { id: string; name: string }
  /** This firm's own customer on the line. */
  customer: { id: string; name: string }
  live: boolean
  contractType: ContractType | null
  /** The firm this one buys the person from — its own supplier, the rung directly below. Null at hop 0. */
  boughtFrom: string | null
  /** How many hops lie above and below this firm on the chain. Never what they charge. */
  hopsAbove: number
  hopsBelow: number
  agreed: Spread | null
  earned: PlacementEarned
  profit: Profit
  billing: Billing
  currency: string
}

/**
 * Every placement a firm sells, priced the one way.
 *
 * `companyId` is the viewing firm and is required: every figure is that
 * firm's own, read off its own lines, from the signatures on the rungs it
 * is party to. There is no reading of a placement "as a whole".
 */
export async function placementBooks(
  companyId: string,
  opts: { scope?: Scope; sellContractIds?: readonly string[]; pairs?: Pairs } = {}
): Promise<PlacementBooks[]> {
  if (!companyId) throw new Error('placementBooks needs the viewing company: a figure belongs to one firm.')
  const scope = opts.scope ?? 'ALL'
  const pairs = opts.pairs ?? (await pairsFor(companyId, scope, opts.sellContractIds))
  const lines = opts.sellContractIds ? pairs.all.filter((p) => opts.sellContractIds!.includes(p.sell.id)) : pairs.all
  if (lines.length === 0) return []
  const ids = lines.map((p) => p.sell.id)

  const [rows, read, rateRows, openingPay, billLines] = await Promise.all([
    prisma.sellContract.findMany({
      where: { id: { in: ids }, companyId },
      select: { id: true, billRate: true, billCurrency: true },
    }),
    readRungs(ids),
    prisma.rateHistory.findMany({
      where: {
        OR: [
          { contractType: 'SELL', contractId: { in: ids } },
          { contractType: 'BUY', contractId: { in: lines.map((p) => p.buy?.id).filter((x): x is string => !!x) } },
        ],
      },
      select: { id: true, contractType: true, contractId: true, rate: true, fromDate: true, toDate: true, approvalState: true },
    }),
    prisma.buyContractCandidate.findMany({
      where: { buyContractId: { in: lines.map((p) => p.buy?.id).filter((x): x is string => !!x) } },
      select: { buyContractId: true, personId: true, payRate: true, payCurrency: true },
    }),
    prisma.invoiceLine.findMany({
      where: { sellContractId: { in: ids }, invoice: { status: { notIn: ['DRAFT', 'CANCELLED', 'VOID'] } } },
      select: {
        sellContractId: true, amountCents: true, timesheetId: true,
        invoice: { select: { total: true, paid: true, currency: true } },
      },
    }),
  ])
  const rowOf = new Map(rows.map((r) => [r.id, r]))
  const periodsFor = (side: 'SELL' | 'BUY', id: string) =>
    ratePeriods(rateRows.filter((r) => r.contractType === side && r.contractId === id))

  // How payroll pays each pair, read once for the book.
  const terms = await placementPayTermsMany(
    lines.flatMap((p) => (p.buy ? [{ buyContractId: p.buy.id, sellContractId: p.sell.id, personId: p.sell.personId }] : []))
  )

  // Burden is the employer's, at hop 0 only, at the rate the books post.
  // One read per firm, kind and year.
  const burdenMemo = new Map<string, Awaited<ReturnType<typeof burdenRate>>>()
  const burdenOn = async (type: string, on: Date) => {
    const k = `${type}|${on.getUTCFullYear()}`
    if (!burdenMemo.has(k)) burdenMemo.set(k, await burdenRate(companyId, type, on))
    return burdenMemo.get(k)!
  }

  const out: PlacementBooks[] = []
  for (const p of lines) {
    const own = rowOf.get(p.sell.id)
    if (!own) continue
    const r = read.get(p.sell.id)
    const sheets = r?.sheets ?? []
    const at = r?.rung ? hopsAround(companyId, r.ladder) : null
    const hop0 = !!r?.rung && !r.rung.supplierSellContractId
    const cand = p.buy ? openingPay.find((x) => x.buyContractId === p.buy!.id && x.personId === p.sell.personId) ?? null : null
    const billCurrency = own.billCurrency ?? 'USD'
    const pay = p.buy && cand
      ? {
          openingRateCents: cand.payRate,
          periods: periodsFor('BUY', p.buy.id),
          currency: cand.payCurrency ?? p.buy.payCurrency,
          overtime: terms.get(payTermsKey({ buyContractId: p.buy.id, sellContractId: p.sell.id, personId: p.sell.personId })) ?? null,
        }
      : p.buy
        ? { openingRateCents: 0, periods: [], currency: p.buy.payCurrency, overtime: null }
        : null
    // The books' rate for this employer, read for the year the work began
    // on this line, at hop 0 only. A supplier carries its own people's burden.
    const firstWeek = sheets[0]?.periodStart ?? new Date()
    const b = hop0 && p.buy ? await burdenOn(p.buy.contractType, firstWeek) : null
    const bill = { openingRateCents: own.billRate, periods: periodsFor('SELL', p.sell.id), currency: billCurrency }
    const earned = placementEarned({ sheets, bill, pay, burdenRate: b?.rate ?? 0 })
    const priced = priceSheets({ sheets, bill, pay: null }).sheets
    const billing = billingOf({
      currency: billCurrency,
      weeks: sheets.map((s, i) => ({ sheetId: s.id, revenueCents: priced[i]?.billedCents ?? 0 })),
      lines: billLines
        .filter((l) => l.sellContractId === p.sell.id)
        .map((l) => ({
          amountCents: l.amountCents,
          timesheetId: l.timesheetId,
          invoiceTotalCents: Math.round(Number(l.invoice.total) * 100),
          invoicePaidCents: Math.round(Number(l.invoice.paid) * 100),
          currency: l.invoice.currency ?? billCurrency,
        })),
    })
    out.push({
      sellContractId: p.sell.id,
      person: { id: p.sell.personId, name: p.sell.personName },
      customer: { id: p.sell.clientId, name: p.sell.clientName },
      live: isLive(p),
      contractType: p.buy?.contractType ?? null,
      boughtFrom: p.buy?.vendorName ?? null,
      hopsAbove: at?.hopsAbove ?? 0,
      hopsBelow: at?.hopsBelow ?? 0,
      agreed: spreadOn(p, scope),
      earned,
      profit: profitFrom(earned, b?.says ?? null),
      billing,
      currency: billCurrency,
    })
  }
  return out
}
