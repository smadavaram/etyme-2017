/**
 * How long money takes to travel down a chain, and who pays for the wait.
 *
 * ── The thing nobody measures ────────────────────────────────────────
 *
 * A client pays the prime at day 75 against sixty-day terms. The prime's
 * terms with the sub are net 45 *from receipt of client funds*, so the
 * sub is paid at day 120. The sub pays the bench vendor net 30 from
 * receipt: day 150. The bench vendor pays the consultant on the 15th,
 * because a person has rent.
 *
 * The consultant is paid on day 15 for work funded on day 150, and the
 * bench vendor — the smallest firm in the chain — finances 135 days of
 * it out of its own facility.
 *
 * Every party in that chain can see its own hop and nothing else. The
 * prime sees a client fifteen days late. The sub sees a prime paying on
 * agreed terms. The bench vendor sees a working-capital problem it
 * assumes is its own. The number that explains all three is the one
 * nobody has, because it only exists when the hops are laid end to end.
 *
 * ── Why the delay is not the same as being late ──────────────────────
 *
 * Two different facts, and collapsing them is how this goes unmeasured:
 *
 *   **Late** is actual against agreed. A supplier paid on day 44 of
 *   net 45 is not late, and chasing them is noise.
 *
 *   **Float** is one party's cash out against its cash in. A party can
 *   be perfectly on time on every hop and still be financing four months
 *   of somebody else's work, because it agreed to pay downstream faster
 *   than it is paid upstream. That is a commercial position, not a
 *   collections failure, and it is invisible on any single invoice.
 *
 * The whole point of this file is that the second one is computable only
 * across hops, and the first one is what every existing AP report shows.
 *
 * ── Where pay-when-paid lands ────────────────────────────────────────
 *
 * A pay-when-paid clause moves the float one layer down. It is generally
 * enforceable between companies and generally unenforceable against a
 * worker, which is precisely why the float stops one layer above the
 * person and settles on whoever is smallest — the last firm with a
 * balance sheet before you reach somebody's rent.
 *
 * So the clause is flagged wherever it appears, and flagged harder where
 * the party below it is a person.
 *
 * ── Where the guarantee stops ────────────────────────────────────────
 *
 * `src/lib/distribution.ts` takes this stance about disclosure and it is
 * the right one here too: a hop to a company that is not on the platform
 * is a hop into somebody's email client. We can measure our own hop
 * exactly and we can measure nothing past a party we cannot see. Saying
 * where the guarantee stops is the difference between a control and a
 * comfort, so `chainBlindSpot` says it rather than letting a partial
 * chain read as a whole one.
 *
 * ── Units ────────────────────────────────────────────────────────────
 *
 * Minor units throughout — cents, pence. `VendorBill` is already in
 * cents; `Invoice.total` and `Payment.amount` are Prisma Decimals in
 * whole currency and are converted at the edge, in the route. No
 * database import here.
 */

const DAY = 86_400_000

/** Whole days between two instants, floored, the way ageing counts them. */
export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY)
}

// ── One hop ──────────────────────────────────────────────────────────

/** Money coming to us, or money going out of us. */
export type Side = 'IN' | 'OUT'

/**
 * What starts the payment clock.
 *
 * `RECEIPT_OF_FUNDS` is the one that matters. Terms measured from the
 * day somebody else pays are not terms at all — they are a promise to
 * pass money along when it arrives, and the party accepting them has
 * agreed to an unbounded wait without anybody writing a number down.
 */
export type TermsTrigger = 'BILL_DATE' | 'PERIOD_END' | 'RECEIPT_OF_FUNDS' | 'UNKNOWN'

export interface Hop {
  id: string
  side: Side
  /** Who owes. */
  payerName: string
  /** Who is owed. */
  payeeName: string
  currency: string
  amountMinor: number
  /** Agreed days, where the terms are recorded. */
  termsDays: number | null
  termsFrom: TermsTrigger
  /**
   * When the obligation was raised — the day a bill arrived, or the day
   * an invoice was issued. Not the end of the period it covers: a period
   * ending on the 31st and billed on the 6th is six days nobody counted.
   */
  raisedAt: Date | null
  dueAt: Date | null
  /** When money actually moved. Null while it has not. */
  settledAt: Date | null
  payWhenPaid: boolean
  /** True where the payee is a person rather than a company. */
  payeeIsAPerson: boolean
}

export type HopState = 'SETTLED' | 'OUTSTANDING' | 'UNKNOWABLE'

export interface HopDelay {
  hopId: string
  side: Side
  payerName: string
  payeeName: string
  currency: string
  amountMinor: number
  state: HopState
  /** Raised to due. The terms as they were actually applied. */
  agreedDays: number | null
  /** Raised to settled. Null while unsettled. */
  actualDays: number | null
  /** Settled less due. Negative is early. Null while unsettled. */
  lateDays: number | null
  /** Raised to today, while it is still open. */
  elapsedDays: number | null
  /** Days past due right now, on something still unpaid. */
  overdueDays: number | null
  payWhenPaid: boolean
  says: string
}

/**
 * One hop measured against its own terms.
 *
 * Returns UNKNOWABLE rather than a zero where the dates are not there.
 * A missing bill date is not "paid on time"; it is a hop we cannot speak
 * about, and a plausible zero is the kind of good news nobody audits.
 */
export function hopDelay(hop: Hop, now: Date): HopDelay {
  const base = {
    hopId: hop.id,
    side: hop.side,
    payerName: hop.payerName,
    payeeName: hop.payeeName,
    currency: hop.currency,
    amountMinor: hop.amountMinor,
    payWhenPaid: hop.payWhenPaid,
  }

  if (hop.raisedAt == null || hop.dueAt == null) {
    return {
      ...base,
      state: 'UNKNOWABLE',
      agreedDays: null,
      actualDays: null,
      lateDays: null,
      elapsedDays: null,
      overdueDays: null,
      says:
        hop.raisedAt == null
          ? 'No date on which this was raised, so nothing here can be counted. Shown as ' +
            'a gap rather than as nought days, which would read as paid on time.'
          : 'No due date, so there are no terms to measure against.',
    }
  }

  const agreedDays = daysBetween(hop.raisedAt, hop.dueAt)

  if (hop.settledAt == null) {
    const elapsed = daysBetween(hop.raisedAt, now)
    const overdue = daysBetween(hop.dueAt, now)
    return {
      ...base,
      state: 'OUTSTANDING',
      agreedDays,
      actualDays: null,
      lateDays: null,
      elapsedDays: elapsed,
      overdueDays: Math.max(0, overdue),
      says:
        overdue > 0
          ? `${overdue} day${overdue === 1 ? '' : 's'} past due and still unpaid, on ` +
            `${agreedDays}-day terms.`
          : `Not yet due. ${Math.max(0, -overdue)} day${-overdue === 1 ? '' : 's'} to go on ` +
            `${agreedDays}-day terms.`,
    }
  }

  const actualDays = daysBetween(hop.raisedAt, hop.settledAt)
  const lateDays = daysBetween(hop.dueAt, hop.settledAt)

  return {
    ...base,
    state: 'SETTLED',
    agreedDays,
    actualDays,
    lateDays,
    elapsedDays: null,
    overdueDays: null,
    says:
      lateDays > 0
        ? `Paid on day ${actualDays} against ${agreedDays}-day terms — ${lateDays} day` +
          `${lateDays === 1 ? '' : 's'} late.`
        : lateDays === 0
          ? `Paid on the day it fell due, on day ${actualDays}.`
          : `Paid on day ${actualDays}, ${-lateDays} day${lateDays === -1 ? '' : 's'} early.`,
  }
}

export interface HopSummary {
  side: Side
  /** Hops with both dates, which are the only ones that can be averaged. */
  measured: number
  /** Hops left out because a date was missing. Never counted as nought. */
  unknowable: number
  /** Mean days late across settled hops. Null where none settled. */
  meanLateDays: number | null
  /** Worst single hop, by days late. */
  worstLateDays: number | null
  onTime: number
  late: number
  says: string
}

/**
 * How a whole side behaves, without inventing an average out of nothing.
 *
 * A mean over three hops is not a fact about a payment culture and is
 * reported with its count so nobody reads it as one.
 */
export function summariseHops(delays: HopDelay[], side: Side): HopSummary {
  const mine = delays.filter((d) => d.side === side)
  const settled = mine.filter((d) => d.state === 'SETTLED' && d.lateDays != null)
  const unknowable = mine.filter((d) => d.state === 'UNKNOWABLE').length

  if (settled.length === 0) {
    return {
      side,
      measured: 0,
      unknowable,
      meanLateDays: null,
      worstLateDays: null,
      onTime: 0,
      late: 0,
      says:
        side === 'IN'
          ? 'Nothing has been paid to us yet that can be measured, so there is no figure here.'
          : 'Nothing has been paid out yet that can be measured, so there is no figure here.',
    }
  }

  const lates = settled.map((d) => d.lateDays as number)
  const mean = Math.round(lates.reduce((n, d) => n + d, 0) / lates.length)
  const worst = Math.max(...lates)
  const late = lates.filter((d) => d > 0).length

  return {
    side,
    measured: settled.length,
    unknowable,
    meanLateDays: mean,
    worstLateDays: worst,
    onTime: settled.length - late,
    late,
    says:
      `${settled.length} settled hop${settled.length === 1 ? '' : 's'} measured` +
      (unknowable > 0
        ? `, ${unknowable} left out because a date was missing — they are not counted as on time`
        : '') +
      `. ${late} of them late, worst by ${worst} day${worst === 1 ? '' : 's'}.`,
  }
}

// ── The chain ────────────────────────────────────────────────────────

/**
 * One payment obligation in an ordered chain, top to bottom.
 *
 * A step is the money moving from `payerName` to `payeeName`. Party
 * order is the order of the steps: the client pays the prime, the prime
 * pays the sub, the sub pays the bench vendor, the bench vendor pays the
 * consultant.
 */
export interface ChainStep {
  payerName: string
  payeeName: string
  currency: string
  amountMinor: number | null
  /** When the payer actually paid the payee. Null while they have not. */
  paidAt: Date | null
  termsDays: number | null
  termsFrom: TermsTrigger
  payWhenPaid: boolean
  /**
   * True where this hop is on the platform and the date is a record
   * rather than somebody's account of it.
   */
  observed: boolean
  /** True where the payee is a person rather than a company. */
  payeeIsAPerson: boolean
}

export interface Chain {
  /** The day the work was done. The origin every count is measured from. */
  workedAt: Date
  /** Ordered from the party furthest from the worker downwards. */
  steps: ChainStep[]
}

export type FloatDirection = 'FINANCING' | 'FINANCED_BY_OTHERS' | 'EVEN' | 'UNKNOWN'

export interface PartyFloat {
  partyName: string
  /** How deep in the chain. 0 is the client at the top. */
  depth: number
  currency: string
  amountMinor: number | null
  /** When money reached them. Null at the top of the chain and while unpaid. */
  paidInAt: Date | null
  /** When they paid the next party down. Null at the bottom and while unpaid. */
  paidOutAt: Date | null
  /**
   * Paid in less paid out, in days. Positive means they put their own
   * cash out before anybody's arrived, which is financing.
   */
  daysFinanced: number | null
  direction: FloatDirection
  says: string
}

export interface ChainFloat {
  currency: string | null
  parties: PartyFloat[]
  /** The parties actually carrying it, worst first. */
  financiers: PartyFloat[]
  /**
   * The financing party furthest from the client.
   *
   * Depth is a proxy for size and is not a measurement of it. It is used
   * because it is the only thing we hold: the firm at the bottom of a
   * chain is usually the smallest one in it, and it is the one nobody
   * asks. Named as an inference, never as a fact.
   */
  deepestFinancier: PartyFloat | null
  /** Work done to the last party paid, where everything is settled. */
  endToEndDays: number | null
  complete: boolean
  gaps: string[]
  says: string
}

/**
 * Who is financing whom, and for how many days.
 *
 * A party's float is the gap between the day it paid the party below and
 * the day the party above paid it. Positive is money out before money in
 * — their own facility carrying somebody else's work.
 *
 * Refuses to produce a figure across two currencies. A chain that starts
 * in dollars and ends in rupees has a float in each and a total in
 * neither, and adding them would be the second time this codebase
 * shipped that bug.
 */
export function chainFloat(chain: Chain): ChainFloat {
  const gaps: string[] = []
  const steps = chain.steps

  if (steps.length === 0) {
    return {
      currency: null,
      parties: [],
      financiers: [],
      deepestFinancier: null,
      endToEndDays: null,
      complete: false,
      gaps: ['No hops recorded, so there is no chain to measure.'],
      says: 'Nothing to measure.',
    }
  }

  const currencies = Array.from(new Set(steps.map((s) => s.currency)))
  if (currencies.length > 1) {
    return {
      currency: null,
      parties: [],
      financiers: [],
      deepestFinancier: null,
      endToEndDays: null,
      complete: false,
      gaps: [
        `This chain pays in ${currencies.join(' and ')}. Days can be compared across ` +
          `currencies and money cannot, so no float is shown rather than a total in ` +
          `neither currency.`,
      ],
      says: 'Two currencies in one chain. No single float figure is honest here.',
    }
  }

  const currency = currencies[0]

  // Party 0 is the payer on the first step — the client at the top, who
  // is paid by nobody in this chain. Every other party is the payee of
  // the step above it.
  const parties: PartyFloat[] = []

  const names = [steps[0].payerName, ...steps.map((s) => s.payeeName)]

  for (let depth = 0; depth < names.length; depth++) {
    const inStep = depth === 0 ? null : steps[depth - 1]
    const outStep = depth < steps.length ? steps[depth] : null

    const paidInAt = inStep?.paidAt ?? null
    const paidOutAt = outStep?.paidAt ?? null
    const amountMinor = outStep?.amountMinor ?? inStep?.amountMinor ?? null

    let daysFinanced: number | null = null
    let direction: FloatDirection = 'UNKNOWN'

    if (inStep == null || outStep == null) {
      // The top of the chain funds nothing here and the bottom passes
      // nothing on. Neither is financing, and neither is a gap.
      direction = 'EVEN'
      daysFinanced = 0
    } else if (paidInAt == null || paidOutAt == null) {
      direction = 'UNKNOWN'
      daysFinanced = null
      gaps.push(
        `${names[depth]} cannot be placed: ` +
          (paidOutAt == null
            ? `they have not yet paid ${outStep.payeeName}.`
            : `${inStep.payerName} has not yet paid them.`)
      )
    } else {
      daysFinanced = daysBetween(paidOutAt, paidInAt)
      direction = daysFinanced > 0 ? 'FINANCING' : daysFinanced < 0 ? 'FINANCED_BY_OTHERS' : 'EVEN'
    }

    parties.push({
      partyName: names[depth],
      depth,
      currency,
      amountMinor,
      paidInAt,
      paidOutAt,
      daysFinanced,
      direction,
      says: partySays(names[depth], direction, daysFinanced, inStep, outStep),
    })
  }

  const financiers = parties
    .filter((p) => p.direction === 'FINANCING')
    .sort((a, b) => (b.daysFinanced ?? 0) - (a.daysFinanced ?? 0))

  const deepestFinancier =
    financiers.length === 0
      ? null
      : financiers.reduce((deepest, p) => (p.depth > deepest.depth ? p : deepest))

  const allPaid = steps.every((s) => s.paidAt != null)
  const lastPaidAt = allPaid
    ? steps.reduce<Date>((latest, s) => (s.paidAt! > latest ? s.paidAt! : latest), steps[0].paidAt!)
    : null
  const endToEndDays = lastPaidAt == null ? null : daysBetween(chain.workedAt, lastPaidAt)

  const unobserved = steps.filter((s) => !s.observed)
  if (unobserved.length > 0) {
    gaps.push(
      `${unobserved.length} hop${unobserved.length === 1 ? '' : 's'} in this chain ` +
        `${unobserved.length === 1 ? 'is' : 'are'} not on the platform, so the date${
          unobserved.length === 1 ? '' : 's'
        } came from somebody's account of ${unobserved.length === 1 ? 'it' : 'them'} rather ` +
        `than from a record.`
    )
  }

  return {
    currency,
    parties,
    financiers,
    deepestFinancier,
    endToEndDays,
    complete: gaps.length === 0,
    gaps,
    says: chainSays(financiers, deepestFinancier, endToEndDays, gaps.length === 0),
  }
}

function partySays(
  name: string,
  direction: FloatDirection,
  days: number | null,
  inStep: ChainStep | null,
  outStep: ChainStep | null
): string {
  if (inStep == null) return `${name} is the source of the money. Nobody funds them here.`
  if (outStep == null) return `${name} is the end of the chain. They pass nothing on.`
  if (direction === 'UNKNOWN' || days == null) {
    return `${name} cannot be placed until both sides of their hop have settled.`
  }
  if (direction === 'EVEN') {
    return `${name} paid out on the same day they were paid in. Nothing carried either way.`
  }
  if (direction === 'FINANCING') {
    return (
      `${name} paid ${outStep.payeeName} ${days} day${days === 1 ? '' : 's'} before ` +
      `${inStep.payerName} paid them. That gap is their own cash, and it is a facility ` +
      `cost nobody bills them for.`
    )
  }
  const held = -days
  return (
    `${name} was paid ${held} day${held === 1 ? '' : 's'} before they paid ` +
    `${outStep.payeeName}. They held the money in between.`
  )
}

function chainSays(
  financiers: PartyFloat[],
  deepest: PartyFloat | null,
  endToEndDays: number | null,
  complete: boolean
): string {
  if (financiers.length === 0) {
    return complete
      ? 'Nobody in this chain paid out before they were paid in.'
      : 'Nobody measurable in this chain paid out before they were paid in, and parts of it could not be measured.'
  }

  const worst = financiers[0]
  const head =
    `${worst.partyName} carries the most — ${worst.daysFinanced} day` +
    `${worst.daysFinanced === 1 ? '' : 's'} of their own cash against work somebody ` +
    `else is being paid for.`

  const depthNote =
    deepest && deepest.partyName !== worst.partyName
      ? ` ${deepest.partyName} is furthest down the chain, which is usually the smallest ` +
        `firm in it — that is an inference from position, not a measurement of size.`
      : deepest
        ? ` They are also the furthest down the chain, which is usually the smallest firm ` +
          `in it — an inference from position, not a measurement of size.`
        : ''

  const end =
    endToEndDays == null
      ? ' The chain has not finished settling, so there is no end-to-end figure yet.'
      : ` End to end, ${endToEndDays} days from the work being done to the last party paid.`

  return head + depthNote + end
}

// ── Where we stop being able to see ──────────────────────────────────

export interface ChainBlindSpot {
  blind: boolean
  /** The first party we cannot see past. Null where we can see it all. */
  firstUnseenName: string | null
  /** How many hops we hold a record for. */
  hopsObserved: number
  hopsTotal: number
  says: string
}

/**
 * Whether anything can be promised about the rest of the chain.
 *
 * A hop to a company that is not here is a hop into an email client.
 * Everything above holds up to that point and not one step past it, and
 * saying so is the difference between a control and a comfort.
 */
export function chainBlindSpot(chain: Chain): ChainBlindSpot {
  const steps = chain.steps
  const observed = steps.filter((s) => s.observed).length

  const firstUnseen = steps.find((s) => !s.observed)

  if (!firstUnseen) {
    return {
      blind: false,
      firstUnseenName: null,
      hopsObserved: observed,
      hopsTotal: steps.length,
      says:
        steps.length === 0
          ? 'There is no chain here to see.'
          : `Every hop in this chain is on the platform, so each date is a record rather ` +
            `than somebody's account of it.`,
    }
  }

  return {
    blind: true,
    firstUnseenName: firstUnseen.payerName,
    hopsObserved: observed,
    hopsTotal: steps.length,
    says:
      `${firstUnseen.payerName} is not on the platform. We hold ${observed} of ` +
      `${steps.length} hops as records; what happens at ${firstUnseen.payerName} and below ` +
      `is somebody's account of it. If this chain matters, invite them — that is the only ` +
      `way the next hop is covered.`,
  }
}

export interface DownstreamBlindSpot {
  blind: boolean
  lastPartyName: string
  says: string
}

/**
 * What happens after the last party we can see.
 *
 * `chainBlindSpot` answers about the hops we listed. This answers the
 * question underneath it: our sub-vendor pays somebody, and that
 * somebody pays somebody, and none of it is ours to observe unless they
 * are here.
 *
 * It matters more than it looks. The whole point of chain float is that
 * the wait travels downwards and lands on whoever is smallest — so a
 * chain that stops at our own supplier has almost certainly not found
 * the party actually carrying it. Saying so is the difference between a
 * control and a comfort.
 */
export function beyondLastParty(
  lastPartyName: string,
  onPlatform: boolean
): DownstreamBlindSpot {
  if (onPlatform) {
    return {
      blind: false,
      lastPartyName,
      says:
        `${lastPartyName} is here, so what they pay onwards is measured the same way and ` +
        `the chain continues past this point.`,
    }
  }

  return {
    blind: true,
    lastPartyName,
    says:
      `${lastPartyName} is not on the platform. Whoever they pay next, and when, is ` +
      `outside anything we hold — so this chain shows our own hops and stops. The party ` +
      `actually carrying the float is usually further down than the last one visible. If ` +
      `this chain matters, invite them.`,
  }
}

// ── Pay when paid ────────────────────────────────────────────────────

export type Enforceability = 'BETWEEN_COMPANIES' | 'AGAINST_A_PERSON'

export interface PayWhenPaidFlag {
  hopId: string
  payerName: string
  payeeName: string
  currency: string
  amountMinor: number
  enforceability: Enforceability
  /** True where the money we are waiting on has still not arrived. */
  stillWaiting: boolean
  /** Days this obligation has been open. Null where the dates are missing. */
  openDays: number | null
  severity: 'NOTE' | 'WARN'
  says: string
}

/**
 * Every obligation conditional on somebody else paying first.
 *
 * This clause is where the float gets pushed down. Between companies it
 * is ordinary and enforceable and worth knowing about. Against a person
 * it is generally unenforceable and always wrong — a consultant's wages
 * are not contingent on a client's AP run — so it is flagged at a
 * different weight rather than in the same list.
 */
export function payWhenPaidFlags(hops: Hop[], now: Date): PayWhenPaidFlag[] {
  return hops
    .filter((h) => h.payWhenPaid)
    .map((h) => {
      const enforceability: Enforceability = h.payeeIsAPerson
        ? 'AGAINST_A_PERSON'
        : 'BETWEEN_COMPANIES'
      const stillWaiting = h.settledAt == null
      const openDays = h.raisedAt == null ? null : daysBetween(h.raisedAt, h.settledAt ?? now)

      return {
        hopId: h.id,
        payerName: h.payerName,
        payeeName: h.payeeName,
        currency: h.currency,
        amountMinor: h.amountMinor,
        enforceability,
        stillWaiting,
        openDays,
        severity: enforceability === 'AGAINST_A_PERSON' ? 'WARN' : 'NOTE',
        says:
          enforceability === 'AGAINST_A_PERSON'
            ? `${h.payeeName} is a person and this obligation is written as conditional on ` +
              `somebody else paying first. That is generally unenforceable against a worker ` +
              `and it is the clause that decides whose rent waits on a client's AP run.`
            : `${h.payerName} owes ${h.payeeName} only once the money above has arrived. ` +
              `Ordinary between companies, and it is how the wait travels downwards rather ` +
              `than stopping where it started` +
              (stillWaiting && openDays != null
                ? ` — open ${openDays} day${openDays === 1 ? '' : 's'} so far.`
                : '.'),
      }
    })
}

// ── Days payable outstanding ─────────────────────────────────────────

export interface PurchasePeriod {
  /** A label a person recognises — "2026-07". */
  label: string
  days: number
  /** What was bought in it, minor units. */
  purchasesMinor: number
}

export interface Dpo {
  days: number | null
  method: 'COUNTBACK'
  /** The textbook formula, for comparison only. Shown, never relied on. */
  naiveDays: number | null
  periodsUsed: number
  says: string
}

/**
 * How long we take to pay, computed the same way as how long we take to
 * be paid.
 *
 *     DPO = payables ÷ purchases over a period × days in the period
 *
 * is the textbook version and it lies for exactly the reason the DSO
 * version does: the payable on the books was created by the most recent
 * buying, and the denominator is an average across earlier and smaller
 * months as well. A firm that doubles its subcontractor spend in a
 * quarter watches its DPO fall and congratulates itself on paying
 * faster, when nothing about its payment behaviour changed.
 *
 * So the countback again: take the payable and exhaust it against actual
 * purchases, most recent period first, counting days as you go. When a
 * period's purchases more than cover what is left, take the proportional
 * part of that period's days and stop.
 *
 * A period with no buying still consumes its days and settles nothing,
 * which is correct — a quiet month genuinely makes the payable older.
 *
 * Returns null when the payable is larger than every period of buying on
 * record. There is no honest answer there, and a floor that looks like a
 * fact is worse than a gap.
 *
 * ── And what the number is not ───────────────────────────────────────
 *
 * A high DPO is reported by finance textbooks as working capital
 * efficiency. In a staffing chain it is usually somebody else's payroll,
 * so it is never shown on its own — `mirror` puts it beside DSO, which
 * is the only comparison that makes it mean anything.
 */
export function dpo(payableMinor: number, periods: PurchasePeriod[]): Dpo {
  const totalPurchases = periods.reduce((n, p) => n + Math.max(0, p.purchasesMinor), 0)
  const totalDays = periods.reduce((n, p) => n + p.days, 0)
  const naiveDays =
    totalPurchases > 0 ? Math.round((payableMinor / totalPurchases) * totalDays) : null

  if (payableMinor <= 0) {
    return {
      days: 0,
      method: 'COUNTBACK',
      naiveDays,
      periodsUsed: 0,
      says: 'Nothing is owed to suppliers, so nothing is being held from them.',
    }
  }

  let remaining = payableMinor
  let days = 0
  let used = 0

  for (const p of periods) {
    if (remaining <= 0) break
    used += 1
    const purchases = Math.max(0, p.purchasesMinor)

    if (purchases >= remaining) {
      days += (remaining / purchases) * p.days
      remaining = 0
      break
    }

    days += p.days
    remaining -= purchases
  }

  if (remaining > 0) {
    return {
      days: null,
      method: 'COUNTBACK',
      naiveDays,
      periodsUsed: used,
      says:
        `More is owed to suppliers than there is buying on record to count back through — ` +
        `${periods.length} period${periods.length === 1 ? '' : 's'} does not exhaust it. ` +
        `That is a history problem, not a payment figure, so no number is shown.`,
    }
  }

  return {
    days: Math.round(days),
    method: 'COUNTBACK',
    naiveDays,
    periodsUsed: used,
    says:
      `Counted back through ${used} period${used === 1 ? '' : 's'} of real buying rather ` +
      `than divided by an average, so growth does not move it.`,
  }
}

export interface Mirror {
  dsoDays: number | null
  dpoDays: number | null
  /** Days paid out before being paid in. Positive means we fund the gap. */
  gapDays: number | null
  direction: FloatDirection
  says: string
}

/**
 * Our days payable beside our days to be paid.
 *
 * The single most useful thing a small staffing firm can be shown, and
 * the one number that makes the AP screen more than a list. If we are
 * paid in 68 days and pay in 30, we are financing 38 days of every
 * assignment out of our own facility. If it is the other way round, we
 * are doing to our suppliers exactly what our clients are doing to us,
 * and somebody should decide that on purpose rather than by default.
 */
export function mirror(dsoDays: number | null, dpoDays: number | null): Mirror {
  if (dsoDays == null || dpoDays == null) {
    return {
      dsoDays,
      dpoDays,
      gapDays: null,
      direction: 'UNKNOWN',
      says:
        dsoDays == null && dpoDays == null
          ? 'Neither side can be counted yet, so there is nothing to compare.'
          : dsoDays == null
            ? 'How long we take to be paid could not be counted, so the comparison is not shown.'
            : 'How long we take to pay could not be counted, so the comparison is not shown.',
    }
  }

  const gap = dsoDays - dpoDays

  if (gap === 0) {
    return {
      dsoDays,
      dpoDays,
      gapDays: 0,
      direction: 'EVEN',
      says: `We are paid in ${dsoDays} days and we pay in ${dpoDays}. The float is flat.`,
    }
  }

  if (gap > 0) {
    return {
      dsoDays,
      dpoDays,
      gapDays: gap,
      direction: 'FINANCING',
      says:
        `We are paid in ${dsoDays} days and we pay in ${dpoDays}, so we fund ${gap} day` +
        `${gap === 1 ? '' : 's'} of every assignment out of our own facility. That is a ` +
        `real cost and nobody invoices us for it.`,
    }
  }

  const held = -gap
  return {
    dsoDays,
    dpoDays,
    gapDays: gap,
    direction: 'FINANCED_BY_OTHERS',
    says:
      `We are paid in ${dsoDays} days and we pay in ${dpoDays}, so our suppliers fund ` +
      `${held} day${held === 1 ? '' : 's'} of it. Worth deciding on purpose: it is what ` +
      `our own clients are doing to us, one layer down.`,
  }
}

// ═════════════════════════════════════════════════════════════════════
// THE PAYMENT RUN — the act that sets the date this file measures
// ═════════════════════════════════════════════════════════════════════
//
// Everything above measures `VendorBill.paidAt`. Nothing set it except a
// clerk typing a date one bill at a time, which is not how money actually
// leaves: it leaves in batches, one file to the bank, same currency, same
// day, one remittance advice per supplier.
//
// ── The four rules, and why each one is a refusal and not a warning ──
//
// **One currency per run.** A run is a payment file, and a file is
// denominated. A total across two currencies is a total of nothing, and
// the place it would be discovered is the bank rejecting the file.
//
// **A bill enters one run at a time.** The schema already carries the
// unique key; this is the same rule expressed where somebody can read it.
// Paying an invoice twice is not a bug report, it is a phone call from an
// angry controller.
//
// **A disputed bill never enters a run.** Paying something you are
// arguing about ends the argument in the supplier's favour and cannot be
// undone by a status change.
//
// **The approver is not the creator.** One person who can both assemble
// and release a payment file is the entire control environment for money
// leaving the building. This is the oldest segregation of duties there
// is and the cheapest to enforce.
//
// NOTE FOR THE ARCHITECT: this belongs in `src/lib/payment-run.ts`. It is
// here because `src/lib/domains.ts` maps ownership by an explicit file
// list and a new top-level lib file has no owner, which fails
// `__tests__/invariants/domain-ownership.test.ts` on the commit that adds
// it. Move it when the domain map can take the name.

export type RunStatus = 'DRAFT' | 'APPROVED' | 'PAID' | 'CANCELLED'

export interface PayableBill {
  id: string
  /** Their number, which is what goes on the remittance advice. */
  number: string
  vendorCompanyId: string
  vendorName: string
  currency: string
  totalCents: number
  paidCents: number
  dueAt: Date
  /** RECEIVED · APPROVED · DISPUTED · PAID · CANCELLED */
  status: string
  /** Set where this bill is already in a live run. */
  inRunId?: string | null
}

export type ExclusionReason =
  | 'NOT_APPROVED'
  | 'DISPUTED'
  | 'ALREADY_PAID'
  | 'CANCELLED'
  | 'ALREADY_IN_A_RUN'
  | 'NOT_DUE_YET'
  | 'NOTHING_LEFT'

export interface Excluded {
  bill: PayableBill
  reason: ExclusionReason
  says: string
}

export interface RunLine {
  billId: string
  billNumber: string
  vendorCompanyId: string
  vendorName: string
  amountCents: number
  dueAt: Date
}

export interface ProposedRun {
  currency: string
  scheduledFor: Date
  lines: RunLine[]
  totalCents: number
  /** One entry per supplier — a supplier gets one advice, not one per bill. */
  vendors: number
  excluded: Excluded[]
  says: string
}

/**
 * Which bills go in a run scheduled for a given day.
 *
 * Everything approved, unpaid, undisputed, not already in a run, and due
 * on or before the scheduled date. Everything else is excluded WITH A
 * REASON — a bill that silently misses a run is a supplier who phones,
 * and "it was not picked up" is not an answer anybody can act on.
 */
export function proposeRun(
  bills: PayableBill[],
  currency: string,
  scheduledFor: Date
): ProposedRun {
  const ccy = currency.toUpperCase()
  const lines: RunLine[] = []
  const excluded: Excluded[] = []

  for (const b of bills) {
    // A bill in another currency is not excluded — it is simply not part
    // of this run, and listing it as a refusal would fill the screen with
    // noise on a firm that pays in three currencies.
    if (b.currency.toUpperCase() !== ccy) continue

    const outstanding = b.totalCents - b.paidCents

    const refuse = (reason: ExclusionReason, says: string) =>
      excluded.push({ bill: b, reason, says })

    if (b.status === 'CANCELLED') {
      refuse('CANCELLED', `${b.number} is cancelled.`)
      continue
    }
    if (b.status === 'DISPUTED') {
      refuse(
        'DISPUTED',
        `${b.number} is in dispute. Paying something you are arguing about ends the ` +
          `argument in their favour, and no status change undoes it.`
      )
      continue
    }
    if (b.status === 'PAID' || outstanding <= 0) {
      refuse(
        outstanding <= 0 ? 'NOTHING_LEFT' : 'ALREADY_PAID',
        `${b.number} has nothing left owing on it.`
      )
      continue
    }
    if (b.status !== 'APPROVED') {
      refuse(
        'NOT_APPROVED',
        `${b.number} is ${b.status.toLowerCase()} and has not been approved for payment. ` +
          `A run releases money; it is not the place to decide whether a bill is right.`
      )
      continue
    }
    if (b.inRunId) {
      refuse(
        'ALREADY_IN_A_RUN',
        `${b.number} is already in another run. Paying the same invoice twice is not a bug ` +
          `report, it is a phone call from an angry controller.`
      )
      continue
    }
    if (b.dueAt.getTime() > scheduledFor.getTime()) {
      refuse(
        'NOT_DUE_YET',
        `${b.number} falls due ${iso(b.dueAt)}, after this run pays on ${iso(scheduledFor)}. ` +
          `Paying early is a decision worth taking on purpose rather than by accident.`
      )
      continue
    }

    lines.push({
      billId: b.id,
      billNumber: b.number,
      vendorCompanyId: b.vendorCompanyId,
      vendorName: b.vendorName,
      amountCents: outstanding,
      dueAt: b.dueAt,
    })
  }

  const total = lines.reduce((n, l) => n + l.amountCents, 0)
  const vendors = new Set(lines.map((l) => l.vendorCompanyId)).size

  return {
    currency: ccy,
    scheduledFor,
    lines: lines.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime()),
    totalCents: total,
    vendors,
    excluded,
    says:
      lines.length === 0
        ? `Nothing to pay in ${ccy} on ${iso(scheduledFor)}.` +
          (excluded.length > 0
            ? ` ${excluded.length} bill${excluded.length === 1 ? '' : 's'} looked at and left out, each with a reason.`
            : '')
        : `${lines.length} bill${lines.length === 1 ? '' : 's'} to ${vendors} ` +
          `supplier${vendors === 1 ? '' : 's'}, ${ccy} ${cents(total)}, paying ` +
          `${iso(scheduledFor)}.` +
          (excluded.length > 0
            ? ` ${excluded.length} left out — see why before releasing.`
            : ''),
  }
}

export interface RemittanceAdvice {
  vendorCompanyId: string
  vendorName: string
  currency: string
  totalCents: number
  lines: { billNumber: string; amountCents: number; dueAt: Date }[]
  /** The text that actually goes to the supplier. */
  text: string
}

/**
 * One advice per supplier, listing every bill it covers.
 *
 * A payment with no advice arrives as an unexplained credit, and the
 * supplier's own AR clerk cannot place it — which is the same unapplied
 * cash problem this codebase solves on its own receivable side. Sending
 * one advice per bill is the mirror of sending one dunning letter per
 * invoice, and it fails for the same reason.
 */
export function remittanceAdvice(
  run: { currency: string; scheduledFor: Date; lines: RunLine[] },
  payerName: string
): RemittanceAdvice[] {
  const byVendor = new Map<string, RunLine[]>()
  for (const l of run.lines) {
    byVendor.set(l.vendorCompanyId, [...(byVendor.get(l.vendorCompanyId) ?? []), l])
  }

  return [...byVendor.entries()]
    .map(([vendorCompanyId, lines]) => {
      const total = lines.reduce((n, l) => n + l.amountCents, 0)
      const listed = lines
        .map((l) => `  ${l.billNumber}   ${run.currency} ${cents(l.amountCents)}   due ${iso(l.dueAt)}`)
        .join('\n')

      return {
        vendorCompanyId,
        vendorName: lines[0].vendorName,
        currency: run.currency,
        totalCents: total,
        lines: lines.map((l) => ({
          billNumber: l.billNumber,
          amountCents: l.amountCents,
          dueAt: l.dueAt,
        })),
        text:
          `Remittance advice from ${payerName}\n` +
          `Payment dated ${iso(run.scheduledFor)}\n\n` +
          `Covering ${lines.length} invoice${lines.length === 1 ? '' : 's'}:\n` +
          `${listed}\n\n` +
          `Total ${run.currency} ${cents(total)}\n\n` +
          `Your own invoice numbers are used above so this can be placed against them ` +
          `without a phone call.`,
      }
    })
    .sort((a, b) => b.totalCents - a.totalCents)
}

export interface ApprovalVerdict {
  ok: boolean
  says: string
}

/**
 * Whether this person may approve this run.
 *
 * The creator may not. It is the oldest segregation of duties there is,
 * and the cheapest to enforce: one person who can both assemble and
 * release a payment file is the entire control environment for money
 * leaving the building.
 */
export function mayApproveRun(
  run: { status: string; createdById: string | null },
  approverPersonId: string
): ApprovalVerdict {
  if (run.status !== 'DRAFT') {
    return {
      ok: false,
      says: `This run is ${run.status.toLowerCase()}. Only a draft can be approved.`,
    }
  }
  if (run.createdById && run.createdById === approverPersonId) {
    return {
      ok: false,
      says:
        'You assembled this run, so you cannot also release it. One person who can do ' +
        'both is the entire control on money leaving the building — ask somebody else ' +
        'to approve it.',
    }
  }
  return { ok: true, says: 'Approved by somebody other than whoever assembled it.' }
}

/**
 * What marking a run paid does to each bill in it, and nothing else.
 *
 * A part-paid bill keeps no paid date, exactly as `PATCH /api/ap/bills`
 * already decides: the obligation is still open, and dating it now would
 * report the first instalment as the day the supplier was paid — which is
 * the figure every float number in this file counts to.
 */
export interface PaidOutcome {
  billId: string
  paidCentsAfter: number
  /** Null on a part payment. */
  paidAt: Date | null
  status: 'PAID' | 'APPROVED'
}

export function applyRunPayment(
  lines: { billId: string; amountCents: number }[],
  bills: { id: string; totalCents: number; paidCents: number }[],
  paidAt: Date
): PaidOutcome[] {
  const byId = new Map(bills.map((b) => [b.id, b]))
  const out: PaidOutcome[] = []

  for (const l of lines) {
    const b = byId.get(l.billId)
    if (!b) continue
    const after = b.paidCents + l.amountCents
    const settled = after >= b.totalCents
    out.push({
      billId: b.id,
      paidCentsAfter: after,
      paidAt: settled ? paidAt : null,
      status: settled ? 'PAID' : 'APPROVED',
    })
  }

  return out
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function cents(n: number): string {
  return (n / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
