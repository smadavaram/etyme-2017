/**
 * Writing to the order.
 *
 * The arithmetic lives in `order.ts` and knows nothing about a database.
 * This is the other half: the handful of places where real money happens
 * and a posting has to be written.
 *
 * There are only four of them, deliberately. Every figure on the
 * profitability screen has to walk back to one of these, and a fifth
 * writer added quietly somewhere else is how a total stops reconciling.
 *
 *   · a payer accepts hours            → revenue to the rung it buys on, at
 *                                        that rung's own rate; and cost to the
 *                                        payer where it sells the rung above
 *   · an employer accepts hours        → pay, and burden where we employ them
 *   · an expense is settled            → cost, or revenue where it is billed on
 *   · somebody posts overhead by hand  → cost, with a reason
 *
 * Everything is idempotent on (source, sourceId, kind). A retried route
 * does not double a month's revenue.
 */

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { ratePeriods } from '@/lib/contract-rate'
import { signed, type PostingKind } from '@/lib/order'
import { DEFAULT_BURDEN, type ContractType } from '@/lib/profitability'
import { amount } from '@/lib/money-display'
import { reportError } from '@/lib/alerts'
import { ladderFor, laddersOver, type BookRung, type BookBuy } from '@/lib/work-chain-read'
import { legsOf, rungView, type PostingLeg } from '@/lib/money/hop-ledger'
import { priceSheets, type SheetToPrice } from '@/lib/money/placement-earned'
import { placementPayTermsMany, payTermsKey } from '@/lib/money/placement-pay-terms'

/**
 * The order a placement belongs to, opened on first use.
 *
 * One per project or statement of work, which is what an internal order
 * is for and how a client actually thinks: a project may run
 * across several openings and several months, and everybody on it belongs
 * to the same piece of work.
 *
 * Where no project has been named, it falls back to the requisition —
 * blocking an award because nobody set up a project first would be a
 * governance step slower than the workaround.
 *
 * Where the client gave us their own code — because their finance team
 * will reconcile against it — that code is used rather than one of ours.
 */
export async function orderFor(sellContractId: string): Promise<string | null> {
  const sell = await prisma.sellContract.findUnique({
    where: { id: sellContractId },
    select: {
      id: true,
      companyId: true,
      internalOrderId: true,
      orgUnitId: true,
      costCenterId: true,
      startDate: true,
      endDate: true,
      requirementId: true,
      billCurrency: true,
      projectOrderId: true,
      clientCompanyId: true,
      clientCompany: { select: { name: true } },
      engagement: { select: { id: true, title: true } },
      requirement: {
        select: { id: true, title: true, internalOrderId: true },
      },
    },
  })
  if (!sell) return null
  if (sell.projectOrderId) return sell.projectOrderId

  // The project, where there is one. Six consultants across three openings
  // on the same project share a bucket, which is the whole point.
  const code = sell.engagement
    ? `IO-PRJ-${sell.engagement.id.slice(-8).toUpperCase()}`
    : sell.requirement
      ? `IO-REQ-${sell.requirement.id.slice(-8).toUpperCase()}`
      : `IO-SC-${sell.id.slice(-8).toUpperCase()}`

  const name = sell.engagement?.title
    ? `${sell.engagement.title} — ${sell.clientCompany.name}`
    : sell.requirement?.title
      ? `${sell.requirement.title} — ${sell.clientCompany.name}`
      : `Placement at ${sell.clientCompany.name}`

  const order = await prisma.projectOrder.upsert({
    where: { companyId_code: { companyId: sell.companyId, code } },
    update: {},
    create: {
      companyId: sell.companyId,
      code,
      name,
      clientCompanyId: sell.clientCompanyId,
      engagementId: sell.engagement?.id ?? null,
      orgUnitId: sell.orgUnitId,
      settlesToId: sell.costCenterId,
      // The client's coding, carried for interfacing and never posted to.
      // It is their master data and they can renumber it without telling
      // us, which is exactly why our accumulation must not depend on it.
      internalOrderId: sell.requirement?.internalOrderId ?? null,
      // The order's currency, which every posting is converted into. A
      // total across two currencies is a total of nothing, so this is
      // fixed when the order opens rather than inferred later.
      currency: sell.billCurrency,
      opensAt: sell.startDate,
      closesAt: sell.endDate,
    },
    select: { id: true },
  })

  await prisma.sellContract.update({
    where: { id: sell.id },
    data: { projectOrderId: order.id },
  })

  return order.id
}

/**
 * The rate to use, or nothing.
 *
 * Looked up once, stamped on the posting, never re-run. A margin that
 * moves because somebody reloaded the page in a different week is not a
 * margin.
 *
 * Where no rate covers the date, this returns null and the posting is
 * refused. Converting at 1 would produce a number that looks fine and is
 * out by a factor of eighty, which is the sort of wrong nobody catches.
 */
export async function rateOn(
  companyId: string,
  from: string,
  to: string,
  on: Date
): Promise<number | null> {
  if (from === to) return 1

  const row = await prisma.fxRate.findFirst({
    where: {
      companyId,
      fromCurrency: from,
      toCurrency: to,
      effectiveOn: { lte: on },
    },
    orderBy: { effectiveOn: 'desc' },
    select: { rate: true },
  })
  if (row) return Number(row.rate)

  // The other way round, inverted. A firm that keeps USD→INR should not
  // also have to keep INR→USD for the same day.
  const back = await prisma.fxRate.findFirst({
    where: {
      companyId,
      fromCurrency: to,
      toCurrency: from,
      effectiveOn: { lte: on },
    },
    orderBy: { effectiveOn: 'desc' },
    select: { rate: true },
  })
  if (back && Number(back.rate) !== 0) return 1 / Number(back.rate)

  return null
}

interface Write {
  projectOrderId: string
  companyId: string
  kind: PostingKind
  amountCents: number
  personId?: string | null
  clientCompanyId?: string | null
  sellContractId?: string | null
  buyContractId?: string | null
  postedAt: Date
  source: 'INVOICE' | 'TIMESHEET' | 'PAYROLL' | 'EXPENSE' | 'PURCHASE_ORDER' | 'VISA_PETITION' | 'MANUAL' | 'ALLOCATION' | 'REVERSAL'
  sourceId?: string | null
  says: string
  createdById?: string | null
  /**
   * What actually moved. A US client billed in dollars and an offshore
   * consultant paid in rupees both belong to the same project, and the
   * amount above is always the order's currency so a total means
   * something.
   */
  txCurrency: string
}

export class NoRate extends Error {
  constructor(public from: string, public to: string, public on: Date) {
    super(
      `No exchange rate from ${from} to ${to} on or before ` +
        `${on.toISOString().slice(0, 10)}. Set one before posting to this order — ` +
        `converting at par would be out by whatever the real rate is.`
    )
  }
}

type OrderHead = { currency: string; status: string; internalOrderId: string | null } | null

/**
 * The row one posting writes, or null where it moves nothing. Throws where
 * the order is settled or no exchange rate covers the day — before
 * anything is written.
 */
async function rowFor(w: Write, order: OrderHead, par: string | null): Promise<Prisma.OrderPostingCreateManyInput | null> {
  const orderCurrency = order?.currency ?? 'USD'

  // A settled order is a period somebody has already reported. Posting
  // into it silently changes a number that has left the building.
  if (order?.status === 'SETTLED' || order?.status === 'CLOSED') {
    throw new Error(
      `That project order is ${order.status.toLowerCase()}. Post the correction to ` +
        `an open order instead of changing a period that has already been reported.`
    )
  }

  const fx = await rateOn(w.companyId, w.txCurrency, orderCurrency, w.postedAt)
  if (fx == null) throw new NoRate(w.txCurrency, orderCurrency, w.postedAt)

  const tx = signed(w.kind, w.amountCents)
  const amount = Math.round(tx * fx)
  if (tx === 0) return null

  // The second valuation, where the firm keeps one. Beside, not instead
  // of — a firm reporting in two currencies should not have to pick which
  // of its own numbers is real.
  const parFx = par ? await rateOn(w.companyId, w.txCurrency, par, w.postedAt) : null

  return {
    projectOrderId: w.projectOrderId,
    // Copied rather than looked up, so an export next year reproduces
    // what was sent last year even if the client has since renumbered.
    internalOrderId: order?.internalOrderId ?? null,
    companyId: w.companyId,
    kind: w.kind,
    amountCents: amount,
    currency: orderCurrency,
    txCurrency: w.txCurrency,
    txAmountCents: tx,
    fxToOrder: fx,
    parallelCurrency: parFx == null ? null : par,
    parallelAmountCents: parFx == null ? null : Math.round(tx * parFx),
    fxToParallel: parFx,
    personId: w.personId ?? null,
    clientCompanyId: w.clientCompanyId ?? null,
    sellContractId: w.sellContractId ?? null,
    buyContractId: w.buyContractId ?? null,
    postedAt: w.postedAt,
    source: w.source,
    sourceId: w.sourceId ?? null,
    says: w.says,
    createdById: w.createdById ?? null,
  }
}

/** One posting, or nothing where it was already written. */
async function write(w: Write) {
  const order = await prisma.projectOrder.findUnique({
    where: { id: w.projectOrderId },
    select: { currency: true, status: true, internalOrderId: true },
  })
  const co = await prisma.company.findUnique({
    where: { id: w.companyId },
    select: { parallelCurrency: true },
  })
  const row = await rowFor(w, order, co?.parallelCurrency ?? null)
  if (!row) return null
  return prisma.orderPosting.upsert({
    where: {
      source_sourceId_kind: {
        source: w.source,
        sourceId: w.sourceId ?? '',
        kind: w.kind,
      },
    },
    update: {},
    create: row,
  })
}

/**
 * What burden actually costs this firm, worked out from its own books.
 *
 * Not a multiplier somebody picked. The rate is last year's real employer
 * tax, workers' compensation and benefit spend divided by last year's real
 * wages, which is a number the firm can defend to itself.
 *
 * The old spreadsheet had exactly this — a "Payroll Taxes" row sitting at
 * the bottom of the page, unallocated, so no consultant's margin ever
 * carried any of it.
 *
 * Until enough has posted to compute one, a published default is used and
 * every figure derived from it says so out loud. An estimate presented as
 * a measurement is worse than no figure at all.
 */
export async function burdenRate(
  companyId: string,
  contractType: string,
  on: Date
): Promise<{ rate: number; measured: boolean; says: string }> {
  const from = new Date(Date.UTC(on.getUTCFullYear() - 1, 0, 1))
  const to = new Date(Date.UTC(on.getUTCFullYear() + 1, 0, 1))

  const [wages, burden] = await Promise.all([
    prisma.orderPosting.aggregate({
      where: {
        companyId, kind: 'PAY', postedAt: { gte: from, lt: to }, reversalOfId: null,
        // Wages only. What a firm pays a sub-vendor for a person it buys in
        // is also a PAY posting since the hop ledger (lib/money/hop-ledger),
        // and counting it as wages would spread the firm's real payroll
        // tax over hours it never employed, understating the rate.
        NOT: { buyContract: { is: { supplierSellContractId: { not: null } } } },
      },
      _sum: { amountCents: true },
    }),
    prisma.orderPosting.aggregate({
      where: {
        companyId,
        kind: 'BURDEN',
        postedAt: { gte: from, lt: to },
        reversalOfId: null,
        // Only burden somebody actually paid. Counting our own synthetic
        // postings would make the rate confirm itself for ever.
        source: { in: ['PAYROLL', 'MANUAL'] },
      },
      _sum: { amountCents: true },
    }),
  ])

  const paid = Math.abs(wages._sum.amountCents ?? 0)
  const carried = Math.abs(burden._sum.amountCents ?? 0)

  // A handful of months is not a rate. Below this the number swings on a
  // single payroll run and would be worse than the published default.
  const ENOUGH_WAGES_CENTS = 5_000_000

  if (paid >= ENOUGH_WAGES_CENTS && carried > 0) {
    const rate = carried / paid
    return {
      rate,
      measured: true,
      says:
        `Employer burden at ${(rate * 100).toFixed(1)}% of pay — your own figure, ` +
        `from what you actually paid in taxes and benefits against what you paid in wages.`,
    }
  }

  const fallback = DEFAULT_BURDEN[contractType as ContractType] ?? 0
  return {
    rate: fallback,
    measured: false,
    says:
      `Employer burden at ${Math.round(fallback * 100)}% of pay — a published default ` +
      `for ${contractType}, not your measured cost. Post what you actually pay in ` +
      `payroll taxes and benefits and this becomes your own number.`,
  }
}

/**
 * The money side of a work assertion — on the rung it belongs to, at
 * that rung's own rate (lib/money/hop-ledger).
 *
 *   · the client's signature is REVENUE to the firm that sells it the
 *     top rung, at that firm's own sell rate;
 *   · a firm in the middle accepting the week is REVENUE to the firm
 *     below it, at that firm's own sell rate, and PAY — its own cost —
 *     to itself, at its own buy rate;
 *   · the employer's acceptance is PAY at hop 0, the overtime premium as
 *     payroll pays it, and BURDEN where it employs the person.
 *
 * Every amount is priced off the line it lands on, day by day at the
 * rate in force, through the same `priceSheets` the profitability screen
 * and the placement page price with — so the books and the screens are
 * one calculation. `WorkAssertion.rateCents` is not read: it records what
 * the signer saw and two doors wrote it at two different rungs.
 *
 * Posted to the month the work was done, not the month it was approved.
 * A March timesheet signed in May is March's margin.
 *
 * ── The other signatures on the week ─────────────────────────────────
 *
 * A week is signed by every rung in turn, and every door that signs one
 * is supposed to post it. One that did not — the seed posts the client's
 * and the employer's and passed over the firm in the middle, the email
 * approval posts only the client's — leaves a rung with revenue and no
 * cost, which reads as a hundred per cent margin. So a middle firm's
 * acceptance on the same week that stands and has posted nothing is
 * posted in the same call. A signature that has posted anything is left
 * exactly as it is, and one that cannot post (no exchange rate, a settled
 * order) is reported, never thrown back at the firm that signed this one.
 *
 * ── What it costs ────────────────────────────────────────────────────
 *
 * Every signed week of the demo world is posted through here by a seed
 * step with a budget of database questions, and every approve button
 * calls it. So a week is read once — the signature, the sheet and its
 * other signatures in one read, the ladder in one recursive query, every
 * rate on the ladder in one — and written in one statement.
 */
export async function postAssertion(assertionId: string, byId?: string | null) {
  const a = await prisma.workAssertion.findUnique({
    where: { id: assertionId },
    select: { state: true, timesheet: { select: WEEK_SELECT } },
  })
  if (!a || a.state !== 'LIVE') return null
  const week = a.timesheet
  const target = week.assertions.find((x) => x.id === assertionId)
  if (!target) return null

  const middle = week.assertions.filter((x) => x.role === 'PASS_THROUGH' && x.id !== assertionId)
  const existing = await postedKinds([assertionId, ...middle.map((m) => m.id)])
  const behind = middle.filter((m) => !existing.has(m.id))

  const [mine, ...others] = await planWeek(week, [target, ...behind])
  const { rows } = await writePlans(
    [
      { plan: mine, byId: byId ?? null, isolated: false },
      ...others.map((plan, i) => ({ plan, byId: behind[i].byId, isolated: true })),
    ],
    existing
  )
  return rows
}

/** Which kinds each signature has already posted, by signature. */
async function postedKinds(ids: readonly string[]): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>()
  if (ids.length === 0) return out
  for (const p of await prisma.orderPosting.findMany({
    where: { source: 'TIMESHEET', sourceId: { in: [...ids] } },
    select: { sourceId: true, kind: true },
  })) {
    if (p.sourceId) out.set(p.sourceId, (out.get(p.sourceId) ?? new Set()).add(p.kind))
  }
  return out
}

/**
 * Write plans' postings in one statement — only into the books named,
 * where some are.
 *
 * Every row is built before anything is written, so a settled order or a
 * missing exchange rate refuses the signature whole rather than half. A
 * plan marked `isolated` is a neighbor posted alongside: its refusal is
 * reported and the rest are written. A kind a signature already holds is
 * left exactly as it is.
 */
async function writePlans(
  entries: { plan: AssertionPlan; byId: string | null; isolated: boolean }[],
  existing: ReadonlyMap<string, ReadonlySet<string>>,
  onlyBooksOf?: ReadonlySet<string>
): Promise<{ rows: Prisma.OrderPostingCreateManyInput[]; count: number }> {
  const rows = await rowsOf(entries, existing, onlyBooksOf)
  if (rows.length === 0) return { rows, count: 0 }
  // Keyed on signature and kind: a row another call wrote a moment ago
  // stands, exactly as the upsert this replaced left it.
  const { count } = await prisma.orderPosting.createMany({ data: rows, skipDuplicates: true })
  return { rows, count }
}

/** The rows plans would write, built and checked, with nothing written. */
async function rowsOf(
  entries: { plan: AssertionPlan; byId: string | null; isolated: boolean }[],
  existing: ReadonlyMap<string, ReadonlySet<string>>,
  onlyBooksOf?: ReadonlySet<string>
): Promise<Prisma.OrderPostingCreateManyInput[]> {
  const wanted = entries.map((e) => ({
    ...e,
    planned: e.plan.planned.filter(
      (p) => (!onlyBooksOf || onlyBooksOf.has(p.companyId)) && !existing.get(e.plan.assertionId)?.has(p.kind)
    ),
  }))
  if (wanted.every((e) => e.planned.length === 0)) return []

  // The order each line posts to: the master contract it is tagged to,
  // read with the ladder, else opened on first use.
  const orderOfLine = new Map<string, string | null>()
  for (const e of wanted) for (const [line, order] of Object.entries(e.plan.orderOf)) if (order) orderOfLine.set(line, order)
  for (const e of wanted) {
    for (const p of e.planned) {
      if (!orderOfLine.get(p.ownSellContractId)) orderOfLine.set(p.ownSellContractId, await orderFor(p.ownSellContractId))
    }
  }
  const orderIds = [...new Set([...orderOfLine.values()].filter((x): x is string => !!x))]
  const companyIds = [...new Set(wanted.flatMap((e) => e.planned.map((p) => p.companyId)))]
  const [orders, companies] = await Promise.all([
    prisma.projectOrder.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, currency: true, status: true, internalOrderId: true },
    }),
    prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, parallelCurrency: true } }),
  ])
  const orderOf = new Map(orders.map((o) => [o.id, o]))
  const parOf = new Map(companies.map((c) => [c.id, c.parallelCurrency ?? null]))

  const rows: Prisma.OrderPostingCreateManyInput[] = []
  for (const e of wanted) {
    const mine: Prisma.OrderPostingCreateManyInput[] = []
    try {
      for (const p of e.planned) {
        const orderId = orderOfLine.get(p.ownSellContractId)
        if (!orderId) continue
        const row = await rowFor(
          {
            projectOrderId: orderId,
            companyId: p.companyId,
            kind: p.kind,
            amountCents: p.amountCents,
            personId: p.personId,
            clientCompanyId: p.clientCompanyId,
            sellContractId: p.ownSellContractId,
            buyContractId: p.buyContractId,
            postedAt: p.postedAt,
            source: 'TIMESHEET',
            sourceId: e.plan.assertionId,
            says: p.says,
            createdById: e.byId,
            txCurrency: p.txCurrency,
          },
          orderOf.get(orderId) ?? null,
          parOf.get(p.companyId) ?? null
        )
        if (row) mine.push(row)
      }
    } catch (err) {
      if (!e.isolated) throw err
      void reportError('Posting the other signatures on a week', err, { path: 'lib/order-postings' })
      continue
    }
    rows.push(...mine)
  }
  return rows
}

/** One posting a signature will write, before an order is opened for it. */
export interface PlannedPosting {
  kind: PostingKind
  /** Whose books. */
  companyId: string
  /** The firm's own sell line the posting groups under — its placement. */
  ownSellContractId: string
  buyContractId: string | null
  personId: string
  /** The firm's own customer on that line. */
  clientCompanyId: string
  /** Unsigned, in the transaction currency; `signed` gives the direction. */
  amountCents: number
  txCurrency: string
  postedAt: Date
  says: string
}

export interface AssertionPlan {
  assertionId: string
  timesheetId: string
  /** The master contract each line on the ladder is already tagged to, by sell line. */
  orderOf: Record<string, string | null>
  planned: PlannedPosting[]
  /** What was not posted and why, one sentence each. */
  refused: string[]
}

/** A week as the books read it: the sheet and every signature standing on it. */
const WEEK_SELECT = {
  id: true, periodStart: true, periodEnd: true, days: true, leaveDays: true, acceptedHours: true,
  personId: true, sellContractId: true,
  assertions: {
    where: { state: 'LIVE' },
    select: {
      id: true, role: true, hours: true, rateCents: true, companyId: true, byId: true,
      coversFrom: true, coversTo: true,
    },
  },
} as const satisfies Prisma.TimesheetSelect
type Week = Prisma.TimesheetGetPayload<{ select: typeof WEEK_SELECT }>
type Signature = Week['assertions'][number]

/**
 * What a LIVE signature posts, priced, without writing anything. Null
 * where the signature is not LIVE: a withdrawn or superseded one posts
 * nothing and its earlier postings were reversed when it stopped standing.
 */
export async function planAssertion(assertionId: string): Promise<AssertionPlan | null> {
  const a = await prisma.workAssertion.findUnique({
    where: { id: assertionId },
    select: { state: true, timesheet: { select: WEEK_SELECT } },
  })
  if (!a || a.state !== 'LIVE') return null
  const sig = a.timesheet.assertions.find((x) => x.id === assertionId)
  if (!sig) return null
  return (await planWeek(a.timesheet, [sig]))[0]
}

/**
 * What each of these signatures on one week posts, priced. The ladder,
 * every rate on it, how payroll pays each cost line and the employer's
 * burden are read once for the week, whichever signatures ask.
 */
async function planWeek(t: Week, sigs: readonly Signature[]): Promise<AssertionPlan[]> {
  const ladder = (await laddersOver([t.sellContractId])).get(t.sellContractId) ?? []
  const orderOf = Object.fromEntries(ladder.map((r) => [r.sellContractId, r.projectOrderId]))
  const plans: AssertionPlan[] = []
  const legsOfSig = sigs.map((s) => legsOf({ companyId: s.companyId, role: s.role }, ladder))
  for (let i = 0; i < sigs.length; i++) {
    plans.push({
      assertionId: sigs[i].id, timesheetId: t.id, orderOf, planned: [],
      refused: legsOfSig[i].says ? [legsOfSig[i].says!] : [],
    })
  }
  if (legsOfSig.every((l) => l.legs.length === 0)) return plans

  const at = t.periodStart
  const rungOf = new Map(ladder.map((r) => [r.sellContractId, r]))

  // Every rate change on every line these signatures may price, in one read.
  const rates = await prisma.rateHistory.findMany({
    where: {
      OR: [
        { contractType: 'SELL', contractId: { in: ladder.map((r) => r.sellContractId) } },
        { contractType: 'BUY', contractId: { in: ladder.map((r) => r.buyContractId).filter((x): x is string => !!x) } },
      ],
    },
    select: { id: true, contractType: true, contractId: true, rate: true, fromDate: true, toDate: true, approvalState: true },
  })
  const periodsOf = (side: 'SELL' | 'BUY', id: string) =>
    ratePeriods(rates.filter((r) => r.contractType === side && r.contractId === id))

  // The week as each rung sees it: only the signature being posted,
  // re-keyed to what the rung bills or costs on (`rungView`).
  const sheetFor = (rung: BookRung, s: Signature): SheetToPrice => ({
    periodStart: t.periodStart, periodEnd: t.periodEnd, days: t.days, leaveDays: t.leaveDays,
    acceptedHours: t.acceptedHours,
    assertions: rungView(rung, ladder, [{
      role: s.role, hours: s.hours, rateCents: s.rateCents, companyId: s.companyId,
      coversFrom: s.coversFrom, coversTo: s.coversTo,
    }]),
  })

  // The cost legs' own buy lines, and how payroll pays each — read once
  // for the week.
  const costs: { i: number; leg: PostingLeg; own: BookRung; buy: Awaited<ReturnType<typeof buyLineFor>> }[] = []
  for (let i = 0; i < sigs.length; i++) {
    for (const leg of legsOfSig[i].legs) {
      if (leg.kind === 'REVENUE') continue
      const own = rungOf.get(leg.sellContractId)!
      costs.push({ i, leg, own, buy: await buyLineFor(leg.companyId, own, t.personId, leg.kind === 'PAY') })
    }
  }
  const termKeys = costs
    .filter((c) => c.buy && (c.buy.payRate ?? 0) > 0)
    .map((c) => ({ buyContractId: c.buy!.id, sellContractId: c.own.sellContractId, personId: t.personId }))
  const terms = termKeys.length ? await placementPayTermsMany(termKeys) : new Map()

  for (let i = 0; i < sigs.length; i++) {
    const s = sigs[i]
    const hours = Number(s.hours)
    const plan = plans[i]
    for (const leg of legsOfSig[i].legs) {
      const rung = rungOf.get(leg.sellContractId)!
      if (leg.kind === 'REVENUE') {
        if (rung.billRate <= 0) {
          plan.refused.push('The line this firm bills on has no rate, so these hours are a missing rate, not free work, and post no revenue.')
          continue
        }
        const priced = priceSheets({
          sheets: [sheetFor(rung, s)],
          bill: { openingRateCents: rung.billRate, periods: periodsOf('SELL', rung.sellContractId) },
          pay: null,
        })
        plan.planned.push({
          kind: 'REVENUE', companyId: leg.companyId, ownSellContractId: rung.sellContractId,
          buyContractId: null, personId: t.personId, clientCompanyId: leg.customerId,
          amountCents: priced.billedCents, txCurrency: rung.billCurrency, postedAt: at,
          says: s.role === 'CLIENT_APPROVAL'
            ? `${hours} hours approved by the client, at this line’s own ${amount(rung.billRate, rung.billCurrency)} an hour.`
            : `${hours} hours accepted by the firm this line bills, at this line’s own ${amount(rung.billRate, rung.billCurrency)} an hour.`,
        })
        continue
      }

      // A cost: the firm's own buy line behind its own line, at its own rate.
      const own = rung
      const buy = costs.find((c) => c.i === i && c.leg === leg)?.buy ?? null
      const rate = buy?.payRate ?? 0
      if (!buy || rate <= 0) {
        plan.refused.push(
          leg.kind === 'PAY'
            ? 'No pay line names this person at a rate, so the week has no pay cost on record — and so no margin, not a perfect one.'
            : 'No buy line from the supplier names this person at a rate, so the week has no cost on record — and so no margin, not a perfect one.'
        )
        continue
      }
      const priced = priceSheets({
        sheets: [sheetFor(own, s)],
        bill: { openingRateCents: own.billRate, periods: [] },
        pay: {
          openingRateCents: rate,
          periods: buy.id === own.buyContractId ? periodsOf('BUY', buy.id) : buy.periods ?? [],
          overtime: terms.get(payTermsKey({ buyContractId: buy.id, sellContractId: own.sellContractId, personId: t.personId })) ?? null,
        },
      })
      const week = priced.sheets[0]
      if (!week || week.paidCents == null) {
        plan.refused.push(
          week?.manyAcceptances
            ? 'More than one acceptance stands on this week, so nothing says which one is paid, and none of it is costed.'
            : 'Nothing on this week could be priced for pay.'
        )
        continue
      }
      const currency = buy.personPayCurrency ?? buy.payCurrency ?? own.billCurrency
      const premium = week.premiumCents
      const base = {
        companyId: leg.companyId, ownSellContractId: own.sellContractId, buyContractId: buy.id,
        personId: t.personId, clientCompanyId: leg.customerId, txCurrency: currency, postedAt: at,
      }
      plan.planned.push({
        ...base, kind: 'PAY', amountCents: week.paidCents - premium,
        says: leg.kind === 'PAY'
          ? `${hours} hours accepted for pay.`
          : `${hours} hours accepted from the supplier, at this firm’s own ${amount(rate, currency)} an hour.`,
      })
      if (premium > 0) {
        plan.planned.push({ ...base, kind: 'PREMIUM', amountCents: premium, says: `Overtime premium on ${hours} hours accepted for pay, as payroll pays it.` })
      }
      // Burden only at hop 0, and only where the firm employs the person:
      // a supplier carries the burden on its own people.
      if (leg.kind === 'PAY') {
        const b = await burdenRate(leg.companyId, buy.contractType ?? 'C2C', at)
        if (b.rate > 0) {
          plan.planned.push({ ...base, kind: 'BURDEN', amountCents: Math.round(week.paidCents * b.rate), says: b.says })
        }
      }
    }
  }
  return plans
}

/**
 * The firm's own buy line behind its own sell line, naming the person.
 *
 * Through `ContractLink` first — the award writes it and it is the only
 * thing that says which cost belongs to which placement — and read with
 * the ladder, so the ordinary case asks nothing more. Where a payroll line
 * was never linked, the firm's latest buy line naming the person stands
 * in, as it always has for pay; a bought-in week never guesses.
 */
async function buyLineFor(
  companyId: string,
  own: BookRung,
  personId: string,
  payroll: boolean
): Promise<(BookBuy & { periods?: ReturnType<typeof ratePeriods> }) | null> {
  if (own.buy && own.buy.companyId === companyId && own.buy.payRate != null) return own.buy
  if (!payroll) return null
  const row = await prisma.buyContract.findFirst({
    where: { companyId, supplierSellContractId: null, candidates: { some: { personId } } },
    orderBy: { startDate: 'desc' },
    select: {
      id: true, companyId: true, contractType: true, payCurrency: true,
      candidates: { where: { personId }, select: { payRate: true, payCurrency: true }, take: 1 },
    },
  })
  if (!row) return null
  const history = await prisma.rateHistory.findMany({
    where: { contractType: 'BUY', contractId: row.id },
    select: { id: true, rate: true, fromDate: true, toDate: true, approvalState: true },
  })
  return {
    id: row.id, companyId: row.companyId, contractType: row.contractType, payCurrency: row.payCurrency,
    payRate: row.candidates[0]?.payRate ?? null, personPayCurrency: row.candidates[0]?.payCurrency ?? null,
    periods: ratePeriods(history),
  }
}

// ── Rebuilding what was posted ────────────────────────────────────────
//
// Postings are derived: hours a party accepted, times the rate on the line
// the posting lands on. Until 2026-10-06 a chained week landed in the
// filing firm's books at the client's rate and the firm in the middle got
// nothing, so every chain on the record was posted wrong. This re-derives
// each LIVE signature's postings and replaces the ones that disagree.
//
// It refuses rather than restates where a number has left the building:
// a posting on a settled or closed order, a posting already reversed, or
// a journal entry already exported to the firm's own system stays as it
// is and is named in the answer, for a person to correct with an
// equal-and-opposite entry.

export interface Rebuilt {
  /** True where nothing was written: every figure below is what a run would do. */
  dryRun: boolean
  /** Signed weeks read. A week carries one signature per rung that signed it. */
  weeks: number
  /** Signatures read. */
  checked: number
  /** Signatures whose postings were replaced. */
  rebuilt: number
  unchanged: number
  /** Postings written and removed across the rebuild. */
  written: number
  removed: number
  /** Signatures left as they were, each with the reason. */
  leftAlone: { assertionId: string; says: string }[]
  /**
   * Signatures whose postings in these books were removed and nothing
   * written in their place, each with the reason the rule posts nothing —
   * so "3 removed, 0 written" is never a figure without a sentence.
   */
  postsNothing: { assertionId: string; says: string }[]
}

/** The facts two postings must share to be the same posting. */
export interface PostingFacts {
  companyId: string
  kind: string
  txAmountCents: number
  txCurrency: string
  sellContractId: string | null
  buyContractId: string | null
}

/**
 * Whether what is on the books for a signature is what it should post.
 * Order-free, and blind to the project order: moving a line onto a master
 * contract never restates what it already posted.
 */
export function sameBooks(onBooks: readonly PostingFacts[], planned: readonly PlannedPosting[]): boolean {
  const key = (p: PostingFacts) =>
    [p.companyId, p.kind, p.txAmountCents, p.txCurrency, p.sellContractId ?? '', p.buyContractId ?? ''].join('|')
  const want = planned
    .map((p) => ({
      companyId: p.companyId, kind: p.kind, txAmountCents: signed(p.kind, p.amountCents), txCurrency: p.txCurrency,
      sellContractId: p.ownSellContractId, buyContractId: p.buyContractId,
    }))
    .filter((p) => p.txAmountCents !== 0)
    .map(key)
    .sort()
  const have = onBooks.map(key).sort()
  return want.length === have.length && want.every((k, i) => k === have[i])
}

/**
 * Re-derive the postings behind every LIVE signature, and replace those
 * that disagree.
 *
 * `companyIds` limits it to those firms' own books: the signatures on the
 * chains they are on are read, and only postings in their books are
 * removed or written — a firm rebuilding its books never rewrites its
 * supplier's. Omitted, every signature and every firm's books are read
 * (the seed and the scheduler). Run twice, the second run changes nothing.
 * `dryRun` reads and plans everything and writes nothing — not a posting,
 * not a journal entry, not a project order: the answer is what a run
 * would do, short only of a missing exchange rate, which a real run finds
 * and leaves alone with the reason.
 */
export async function rebuildPostings(opts: { companyIds?: string[]; dryRun?: boolean } = {}): Promise<Rebuilt> {
  const dryRun = opts.dryRun === true
  const out: Rebuilt = {
    dryRun, weeks: 0, checked: 0, rebuilt: 0, unchanged: 0, written: 0, removed: 0, leftAlone: [], postsNothing: [],
  }

  let where: Prisma.WorkAssertionWhereInput = { state: 'LIVE' }
  if (opts.companyIds) {
    // Every line these firms sell, and every rung below them: the hours a
    // middle firm's books depend on are filed on its supplier's line.
    const own = await prisma.sellContract.findMany({
      where: { companyId: { in: opts.companyIds } },
      select: { id: true },
    })
    const rungs = await ladderFor(own.map((s) => s.id))
    const lines = [...new Set([...own.map((s) => s.id), ...rungs.map((r) => r.sellContractId)])]
    where = {
      state: 'LIVE',
      OR: [{ timesheet: { sellContractId: { in: lines } } }, { companyId: { in: opts.companyIds } }],
    }
  }

  const assertions = await prisma.workAssertion.findMany({ where, select: { id: true, timesheetId: true }, orderBy: { id: 'asc' } })
  // A week at a time: its signatures share a ladder, its rates and its
  // pay terms, so they are planned together.
  const byWeek = new Map<string, Set<string>>()
  for (const a of assertions) byWeek.set(a.timesheetId, (byWeek.get(a.timesheetId) ?? new Set()).add(a.id))

  const books = opts.companyIds ? new Set(opts.companyIds) : null
  for (const [timesheetId, ids] of byWeek) {
    const week = await prisma.timesheet.findUnique({ where: { id: timesheetId }, select: WEEK_SELECT })
    if (!week) continue
    const sigs = week.assertions.filter((s) => ids.has(s.id))
    if (sigs.length === 0) continue
    out.weeks++
    out.checked += sigs.length
    const plans = await planWeek(week, sigs)
    const onBooksAll = await prisma.orderPosting.findMany({
      where: {
        source: 'TIMESHEET', sourceId: { in: sigs.map((s) => s.id) }, reversalOfId: null,
        ...(books ? { companyId: { in: [...books] } } : {}),
      },
      select: {
        id: true, sourceId: true, companyId: true, kind: true, txAmountCents: true, txCurrency: true,
        sellContractId: true, buyContractId: true,
        projectOrder: { select: { status: true } },
        reverses: { select: { id: true } },
      },
    })

    const toWrite: { plan: AssertionPlan; byId: string | null; isolated: boolean }[] = []
    const gone: string[] = []
    const rebuilt: string[] = []
    for (let i = 0; i < sigs.length; i++) {
      const a = sigs[i]
      const whole = plans[i]
      const plan = books ? { ...whole, planned: whole.planned.filter((p) => books.has(p.companyId)) } : whole
      const onBooks = onBooksAll.filter((p) => p.sourceId === a.id)
      if (sameBooks(onBooks, plan.planned)) {
        out.unchanged++
        continue
      }

      // A posting is keyed on its signature and its kind, across every
      // firm's books. Where the kind this firm should hold is still held in
      // another firm's books — the client's signature booked to the bottom
      // of the chain — this firm cannot write it without rewriting that
      // firm's books, which a firm rebuilding its own never does.
      if (books && plan.planned.length > 0) {
        const held = await prisma.orderPosting.findFirst({
          where: {
            source: 'TIMESHEET', sourceId: a.id, reversalOfId: null,
            kind: { in: plan.planned.map((p) => p.kind) }, companyId: { notIn: [...books] },
          },
          select: { id: true },
        })
        if (held) {
          out.leftAlone.push({
            assertionId: a.id,
            says: 'This week’s posting still sits in another firm’s books. The scheduled rebuild corrects both books at once.',
          })
          continue
        }
      }

      // What has left the building stays where it is.
      const settled = onBooks.find((p) => p.projectOrder.status === 'SETTLED' || p.projectOrder.status === 'CLOSED')
      const reversed = onBooks.find((p) => p.reverses)
      const exported = onBooks.length
        ? await prisma.journalEntry.findFirst({
            where: { source: 'TIMESHEET', sourceId: { in: onBooks.map((p) => p.id) }, exportedAt: { not: null } },
            select: { id: true },
          })
        : null
      if (settled || reversed || exported) {
        out.leftAlone.push({
          assertionId: a.id,
          says: settled
            ? 'Its postings are on a settled order, so the period has been reported. Post the correction to an open order instead.'
            : reversed
              ? 'One of its postings has already been reversed, so it is corrected by hand rather than rebuilt.'
              : 'Its journal entry has already been exported to the firm’s own system, so it is corrected there rather than here.',
        })
        continue
      }

      gone.push(...onBooks.map((p) => p.id))
      toWrite.push({ plan, byId: a.byId, isolated: false })
      rebuilt.push(a.id)
      if (plan.planned.length === 0) {
        out.postsNothing.push({
          assertionId: a.id,
          says:
            plan.refused[0] ??
            (books
              ? 'This signature posts nothing in these books under the rule — it is another firm’s revenue or cost — so what sat here was removed.'
              : 'This signature posts nothing under the rule, so what sat on the books for it was removed.'),
        })
      }
    }
    if (rebuilt.length === 0) continue

    // Built and checked before anything is removed, then removed and
    // written in one transaction: a week that cannot be posted again (an
    // order settled since, a missing exchange rate) keeps what it had.
    if (dryRun) {
      // What a run would do, and nothing done. Counted from the plans
      // rather than built into rows, because building a row opens the
      // line's project order on first use, and a dry run opens nothing.
      // The one thing only a real run finds is a missing exchange rate.
      out.removed += gone.length
      out.written += toWrite.reduce((n, e) => n + e.plan.planned.filter((p) => p.amountCents !== 0).length, 0)
      out.rebuilt += rebuilt.length
      continue
    }
    let rows: Prisma.OrderPostingCreateManyInput[]
    try {
      rows = await rowsOf(toWrite, new Map(), books ?? undefined)
    } catch (err) {
      for (const id of rebuilt) {
        out.leftAlone.push({
          assertionId: id,
          says: `It could not be posted again, so what it had stands: ${err instanceof Error ? err.message : String(err)}`,
        })
      }
      continue
    }
    const [, removed, written] = await prisma.$transaction([
      prisma.journalEntry.deleteMany({ where: { source: 'TIMESHEET', sourceId: { in: gone } } }),
      prisma.orderPosting.deleteMany({ where: { id: { in: gone } } }),
      prisma.orderPosting.createMany({ data: rows, skipDuplicates: true }),
    ])
    out.removed += removed.count
    out.written += written.count
    out.rebuilt += rebuilt.length
  }
  return out
}

// ── The bench reserve, written down ──────────────────────────────────
//
// `bench-policy.ts` has known how to compute a hold-back since it was
// written, and nothing ever wrote one. A firm could configure a
// reserve-funded bench, run payroll for a year, and have no record of
// what was in anybody's pot — which is a setting with nothing behind it,
// not a feature.
//
// The `RESERVE` posting kind and the 2300 liability account both already
// existed for exactly this. The sign convention is stated once in
// `bench-policy.ts` and honored here: positive into the pot, negative
// out of it.
//
// Deliberately posted to the project order the share was earned on. The
// money held back came out of that project's pay, so the project is where
// it left from — and `resultOf` excludes RESERVE from gross and net,
// because holding somebody's own money is a movement between two of our
// obligations rather than a cost of the work.

export interface ReserveWrite {
  projectOrderId: string
  companyId: string
  personId: string
  buyContractId?: string | null
  /** Signed cents. Positive into the pot, negative out. */
  amountCents: number
  /** The period the movement belongs to. */
  postedAt: Date
  /** Unique per movement, so a retried payroll run does not double it. */
  sourceId: string
  says: string
  txCurrency: string
  createdById?: string | null
}

/** One reserve movement, or nothing where it was already written. */
export function postReserve(w: ReserveWrite) {
  return write({
    projectOrderId: w.projectOrderId,
    companyId: w.companyId,
    kind: 'RESERVE',
    amountCents: w.amountCents,
    personId: w.personId,
    buyContractId: w.buyContractId ?? null,
    postedAt: w.postedAt,
    source: 'PAYROLL',
    sourceId: w.sourceId,
    says: w.says,
    createdById: w.createdById ?? null,
    txCurrency: w.txCurrency,
  })
}

/** Every reserve movement for one person, oldest first. */
export async function reserveMovementsFor(companyId: string, personId: string) {
  return prisma.orderPosting.findMany({
    where: { companyId, personId, kind: 'RESERVE', reversalOfId: null },
    select: {
      id: true, amountCents: true, currency: true, postedAt: true, says: true,
      sourceId: true,
    },
    orderBy: { postedAt: 'asc' },
    take: 2_000,
  })
}

// ── Settlement ────────────────────────────────────────────────────────
//
// Always a pair. Moving a balance is the amount out of the order and the
// same amount into wherever it went; writing only the first makes money
// disappear from the group's books, which balances on the order and on
// nothing above it.
//
// The pair is written directly rather than through `write()`, because
// `write()` refuses to post into a SETTLED order — and settling is the
// one act that has to reach across that door on its way to closing it.

export async function postSettlement(args: {
  projectOrderId: string
  settlesToProjectOrderId: string | null
  companyId: string
  balanceCents: number
  currency: string
  postedAt: Date
  saysOut: string
  saysIn: string
  createdById?: string | null
}) {
  const base = {
    companyId: args.companyId,
    kind: 'SETTLEMENT' as const,
    currency: args.currency,
    txCurrency: args.currency,
    fxToOrder: 1,
    postedAt: args.postedAt,
    source: 'ALLOCATION' as const,
    createdById: args.createdById ?? null,
  }

  const out = await prisma.orderPosting.upsert({
    where: {
      source_sourceId_kind: {
        source: 'ALLOCATION',
        sourceId: `settle:${args.projectOrderId}:out`,
        kind: 'SETTLEMENT',
      },
    },
    update: {},
    create: {
      ...base,
      projectOrderId: args.projectOrderId,
      amountCents: -args.balanceCents,
      txAmountCents: -args.balanceCents,
      sourceId: `settle:${args.projectOrderId}:out`,
      says: args.saysOut,
    },
  })

  // Where the cost center has an order of its own to collect into, the
  // other leg lands there. Where it does not, it lands on the same order
  // as a matching contra so the pair still nets to nothing rather than a
  // half-movement sitting on the books.
  const into = await prisma.orderPosting.upsert({
    where: {
      source_sourceId_kind: {
        source: 'ALLOCATION',
        sourceId: `settle:${args.projectOrderId}:in`,
        kind: 'SETTLEMENT',
      },
    },
    update: {},
    create: {
      ...base,
      projectOrderId: args.settlesToProjectOrderId ?? args.projectOrderId,
      amountCents: args.balanceCents,
      txAmountCents: args.balanceCents,
      sourceId: `settle:${args.projectOrderId}:in`,
      says: args.saysIn,
    },
  })

  return [out, into]
}

/**
 * Cancels the postings behind an assertion that was superseded or
 * withdrawn.
 *
 * Nothing is deleted. The month may already have been reported, so the
 * correction is an equal and opposite posting dated to the same month,
 * and both rows stay.
 */
export async function reversePostingsFor(
  assertionId: string,
  why: string,
  byId?: string | null
) {
  const originals = await prisma.orderPosting.findMany({
    where: { source: 'TIMESHEET', sourceId: assertionId, reversalOfId: null },
  })

  const out = []
  for (const p of originals) {
    const already = await prisma.orderPosting.findUnique({
      where: { reversalOfId: p.id },
      select: { id: true },
    })
    if (already) continue

    out.push(
      await prisma.orderPosting.create({
        data: {
          projectOrderId: p.projectOrderId,
          internalOrderId: p.internalOrderId,
          companyId: p.companyId,
          kind: p.kind,
          amountCents: -p.amountCents,
          currency: p.currency,
          // The rate that was stamped on the original. A correction values
          // at the rate the mistake was made at, not today's.
          txCurrency: p.txCurrency,
          txAmountCents: -p.txAmountCents,
          fxToOrder: p.fxToOrder,
          parallelCurrency: p.parallelCurrency,
          parallelAmountCents: p.parallelAmountCents == null ? null : -p.parallelAmountCents,
          fxToParallel: p.fxToParallel,
          personId: p.personId,
          clientCompanyId: p.clientCompanyId,
          sellContractId: p.sellContractId,
          buyContractId: p.buyContractId,
          postedAt: p.postedAt,
          source: 'REVERSAL',
          sourceId: p.id,
          says: `Reverses: ${p.says} — ${why}`,
          reversalOfId: p.id,
          createdById: byId ?? null,
        },
      })
    )
  }
  return out
}

// ── Commission ────────────────────────────────────────────────────────
//
// What a commission agent earned on a project, for a period, posted as
// cost against the order the work billed to (lib/commission decides the
// figure). Unique per contract per period, so a re-run adds nothing.

export interface CommissionWrite {
  projectOrderId: string
  companyId: string
  /** The agent. */
  personId: string | null
  buyContractId: string
  sellContractId: string | null
  amountCents: number
  postedAt: Date
  sourceId: string
  says: string
  txCurrency: string
  createdById?: string | null
}

export function postCommission(w: CommissionWrite) {
  return write({
    projectOrderId: w.projectOrderId,
    companyId: w.companyId,
    kind: 'COMMISSION',
    amountCents: w.amountCents,
    personId: w.personId,
    buyContractId: w.buyContractId,
    sellContractId: w.sellContractId,
    postedAt: w.postedAt,
    source: 'PAYROLL',
    sourceId: w.sourceId,
    says: w.says,
    createdById: w.createdById ?? null,
    txCurrency: w.txCurrency,
  })
}
