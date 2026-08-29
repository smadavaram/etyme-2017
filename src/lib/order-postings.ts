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
 *   · a client approves hours          → revenue
 *   · an employer accepts hours        → pay, and burden where we employ them
 *   · an expense is settled            → cost, or revenue where it is billed on
 *   · somebody posts overhead by hand  → cost, with a reason
 *
 * Everything is idempotent on (source, sourceId, kind). A retried route
 * does not double a month's revenue.
 */

import { prisma } from '@/lib/db'
import { signed, type PostingKind } from '@/lib/order'
import { DEFAULT_BURDEN, type ContractType } from '@/lib/profitability'

/**
 * The order a placement belongs to, opened on first use.
 *
 * One per project or statement of work, which is how SAP actually uses an
 * internal order and how a client actually thinks: a project may run
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

/** One posting, or nothing where it was already written. */
async function write(w: Write) {
  const order = await prisma.projectOrder.findUnique({
    where: { id: w.projectOrderId },
    select: { currency: true, status: true, internalOrderId: true },
  })
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
  const co = await prisma.company.findUnique({
    where: { id: w.companyId },
    select: { parallelCurrency: true },
  })
  const par = co?.parallelCurrency ?? null
  const parFx = par ? await rateOn(w.companyId, w.txCurrency, par, w.postedAt) : null

  return prisma.orderPosting.upsert({
    where: {
      source_sourceId_kind: {
        source: w.source,
        sourceId: w.sourceId ?? '',
        kind: w.kind,
      },
    },
    update: {},
    create: {
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
    },
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
      where: { companyId, kind: 'PAY', postedAt: { gte: from, lt: to }, reversalOfId: null },
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
 * The money side of a work assertion.
 *
 * The client approving hours is revenue. The employer accepting them is
 * pay, plus burden where we employ the person rather than buy them from
 * somebody. The middle leg of a chain posts nothing here — a pass-through
 * has its own contracts and its own order in its own books.
 *
 * Posted to the month the work was done, not the month it was approved.
 * A March timesheet signed in May is March's margin.
 */
export async function postAssertion(assertionId: string, byId?: string | null) {
  const a = await prisma.workAssertion.findUnique({
    where: { id: assertionId },
    select: {
      id: true, role: true, hours: true, rateCents: true, state: true,
      timesheet: {
        select: {
          periodStart: true,
          personId: true,
          sellContractId: true,
          sellContract: {
            select: {
              id: true, companyId: true, clientCompanyId: true, endClientCompanyId: true,
              billCurrency: true,
            },
          },
        },
      },
    },
  })
  if (!a || a.state !== 'LIVE') return null
  if (a.role === 'PASS_THROUGH') return null

  const sell = a.timesheet.sellContract
  const orderId = await orderFor(sell.id)
  if (!orderId) return null

  const gross = Math.round(Number(a.hours) * a.rateCents)
  // The month the work belongs to. Approval date is not the same thing
  // and using it moves margin between months for no reason.
  const at = a.timesheet.periodStart
  const common = {
    projectOrderId: orderId,
    companyId: sell.companyId,
    personId: a.timesheet.personId,
    clientCompanyId: sell.endClientCompanyId ?? sell.clientCompanyId,
    sellContractId: sell.id,
    postedAt: at,
    source: 'TIMESHEET' as const,
    sourceId: a.id,
    createdById: byId ?? null,
  }

  if (a.role === 'CLIENT_APPROVAL') {
    return [
      await write({
        ...common,
        kind: 'REVENUE',
        amountCents: gross,
        // Billed in whatever the sell contract says, converted to the
        // order's currency on the way in.
        txCurrency: sell.billCurrency,
        says: `${Number(a.hours)} hours approved by the client.`,
      }),
    ]
  }

  // EMPLOYER_ACCEPTANCE. Whoever pays them carries the burden, and only
  // where they are employed rather than invoiced.
  const buy = await prisma.buyContract.findFirst({
    where: {
      companyId: sell.companyId,
      candidates: { some: { personId: a.timesheet.personId } },
    },
    orderBy: { startDate: 'desc' },
    select: { id: true, contractType: true, payCurrency: true },
  })

  const out = [
    await write({
      ...common,
      kind: 'PAY',
      buyContractId: buy?.id ?? null,
      amountCents: gross,
      // Paid in whatever the buy contract says. An offshore consultant
      // paid in rupees and a client billed in dollars belong to the same
      // project, and adding those two numbers gives a total of nothing.
      txCurrency: buy?.payCurrency ?? sell.billCurrency,
      says: `${Number(a.hours)} hours accepted for pay.`,
    }),
  ]

  const b = await burdenRate(sell.companyId, buy?.contractType ?? 'C2C', at)
  if (b.rate > 0) {
    out.push(
      await write({
        ...common,
        kind: 'BURDEN',
        buyContractId: buy?.id ?? null,
        amountCents: Math.round(gross * b.rate),
        txCurrency: buy?.payCurrency ?? sell.billCurrency,
        says: b.says,
      })
    )
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
// `bench-policy.ts` and honoured here: positive into the pot, negative
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

  // Where the cost centre has an order of its own to collect into, the
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
