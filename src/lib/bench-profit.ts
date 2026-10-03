/**
 * Bench profit: what the bench cost, and whether the work paid it back.
 *
 * The founder, 2026-09-30 ("go"), CLAUDE.md "Bench profit, next after the
 * integrator flow": a section on Our bench, read by the owner, admin and
 * finance desks —
 *
 *   per person      bench to bill: days on the bench times what those
 *                   days cost under the firm's bench pay policy, against
 *                   the margin earned since placement, and when it paid
 *                   the bench back;
 *   per course      what the course cost, how many were placed, how fast,
 *                   and at what margin;
 *   an integrator   utilization — the share of its people billing against
 *                   the share on the bench, across its projects — and what
 *                   an internal move saved.
 *
 * ── No money rule of its own ─────────────────────────────────────────
 *
 * Every figure here is read off something that already computes it:
 *
 *   the day rate          `burnOf` in lib/bench-policy (pay × a day's hours)
 *   the bench cost        `benchCost` in lib/bench-policy (the firm's policy,
 *                         its carry limit, its reduced rate)
 *   the margin            `placementEarned` in lib/money/placement-earned,
 *                         week by week over the weeks both sides signed —
 *                         the placement page's own figure
 *
 * What this file adds is dates and counting: when a spell on the bench
 * began and ended, the week a running total caught up, a median, a
 * share. Where the record cannot support a figure, the figure is null and
 * a sentence says why. A plausible wrong number is worse than a blank.
 *
 * Pure: no database, so the screen can import the reader rule and the
 * tests can walk every branch.
 */

import { benchCost, burnOf, type HolidayPay, type HolidayPaySource, type Policy } from '@/lib/bench-policy'
import { amount } from '@/lib/money-display'
import { plainDate } from '@/lib/plain-date'

// ── Who reads it ──────────────────────────────────────────────────────

/** The three desks the founder named, by the role's own name. */
export const BENCH_PROFIT_DESKS = ['Owner', 'Admin', 'Finance'] as const

export interface BenchProfitReader {
  companyName: string
  companyKind: string | null
  roleName: string | null
  /** True where the seat is a consultant's own, not the firm's staff. */
  consultantSeat: boolean
}

export type BenchProfitVerdict =
  | { ok: true }
  | { ok: false; code: 'NOT_STAFF' | 'NO_COMPANY' | 'CLIENT' | 'NOT_THIS_DESK'; message: string }

/**
 * Whether this seat reads bench profit.
 *
 * Owner, Admin and Finance, and nobody else. A margin is the one figure a
 * supplier keeps from its client (Addendum D), and a bench cost worked
 * backwards from one person is that person's pay, so a recruiter or a
 * delivery engineer is refused in a sentence naming the desks that do.
 */
export function mayReadBenchProfit(r: BenchProfitReader): BenchProfitVerdict {
  if (r.consultantSeat) {
    return {
      ok: false, code: 'NOT_STAFF',
      message: 'Bench profit is the firm’s own figure, read by its owner, admin and finance desks. Your own work is on your own page.',
    }
  }
  if (!r.companyKind) {
    return { ok: false, code: 'NO_COMPANY', message: 'Bench profit belongs to a firm. Sign in at the firm whose bench it is.' }
  }
  if (r.companyKind === 'CLIENT') {
    return {
      ok: false, code: 'CLIENT',
      message:
        'Bench profit is a supplier’s own margin, and no client reads it. What reaches a client is ' +
        'the people matched to its job requests.',
    }
  }
  if (r.roleName && (BENCH_PROFIT_DESKS as readonly string[]).includes(r.roleName)) return { ok: true }
  return {
    ok: false, code: 'NOT_THIS_DESK',
    message:
      `Bench profit at ${r.companyName} is read by the owner, the admin and the finance desk. ` +
      `Your seat${r.roleName ? ` (${r.roleName})` : ''} is none of them. Ask one of them, or ask whoever manages roles there.`,
  }
}

// ── Days ──────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
/** Whole calendar days from one day to another, never below nought. */
export function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((utcDay(to) - utcDay(from)) / DAY_MS))
}
const iso = (d: Date) => d.toISOString().slice(0, 10)
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// ── A spell on the bench ──────────────────────────────────────────────

/** One of the firm's own lines selling this person, as dates. */
export interface LineSpan {
  id: string
  startsOn: Date
  endsOn: Date | null
}

export type Spell =
  /** Placed now; the spell is the one before this placement. */
  | { kind: 'BEFORE'; from: Date; to: Date; days: number; placement: LineSpan }
  /** Placed now, with nothing on record before it: straight onto a project. */
  | { kind: 'STRAIGHT_ON'; days: 0; placement: LineSpan }
  /** On the bench today. `startsOn` where a line is papered and not begun. */
  | { kind: 'NOW'; from: Date; to: Date; days: number; startsOn: Date | null }
  /** Nothing on the record says when they were on the bench. */
  | { kind: 'UNKNOWN' }

const later = (a: Date | null, b: Date | null) => (a && b ? (a > b ? a : b) : a ?? b)

/**
 * The spell that describes this person today.
 *
 * Placed now: the spell before this placement, from the later of the day
 * they joined the bench and the day their previous placement here ended,
 * to the day this one started. On the bench now: from the same later
 * day, to today. The same "later of" the bench burn reads, so the two
 * never start a spell on different days.
 */
export function benchSpell(input: { joinedBench: Date | null; lines: LineSpan[]; now: Date }): Spell {
  const now = input.now
  const live = input.lines
    .filter((l) => l.startsOn <= now && (l.endsOn == null || l.endsOn >= now))
    .sort((a, b) => b.startsOn.getTime() - a.startsOn.getTime())[0]

  const lastEndBefore = (d: Date) =>
    input.lines
      .filter((l) => l.endsOn != null && l.endsOn < d)
      .reduce<Date | null>((a, l) => later(a, l.endsOn), null)

  if (live) {
    const joined = input.joinedBench && input.joinedBench <= live.startsOn ? input.joinedBench : null
    const from = later(joined, lastEndBefore(live.startsOn))
    if (!from) return { kind: 'STRAIGHT_ON', days: 0, placement: live }
    return { kind: 'BEFORE', from, to: live.startsOn, days: daysBetween(from, live.startsOn), placement: live }
  }

  const from = later(input.joinedBench && input.joinedBench <= now ? input.joinedBench : null, lastEndBefore(now))
  if (!from) return { kind: 'UNKNOWN' }
  const startsOn =
    input.lines
      .filter((l) => l.startsOn > now)
      .sort((a, b) => a.startsOn.getTime() - b.startsOn.getTime())[0]?.startsOn ?? null
  return { kind: 'NOW', from, to: now, days: daysBetween(from, now), startsOn }
}

// ── What those days cost ──────────────────────────────────────────────

/** The firm's bench pay policy, in a sentence, so every cost below can be checked against it. */
export function policySays(p: Policy): string {
  const carry = p.carryDays != null ? `, for up to ${p.carryDays} days` : ''
  switch (p.policy) {
    case 'NO_PAY':
      return 'No bill, no pay: people on your bench are not paid while they wait.'
    case 'FULL_PAY':
      return `Full pay while on the bench${carry}.`
    case 'REDUCED_RATE':
      return `${(p.benchRateBps ?? 0) / 100}% of their pay while on the bench${carry}.`
    case 'RESERVE_FUNDED':
      return `Paid from their own reserve while on the bench${carry}.`
  }
}

export interface DaysCost {
  /** Null where the record cannot say. */
  costCents: number | null
  says: string
  /**
   * The working days the cost was counted over, out of the calendar days
   * on the bench, with the day rate — "43 working days of 60 at 50% of
   * $512.00 a day" — so the figures on the screen add up. Null where no
   * cost was counted.
   */
  counted: string | null
  /** Where the cost is not known, why, as the end of a sentence: "no pay rate is on record for them". */
  why: string | null
}

/** Paid through their own company or as an independent contractor. */
const NOT_ON_PAYROLL = new Set(['C2C', 'IND_1099'])

/**
 * What `days` calendar days on the bench cost this firm, under its policy.
 *
 * The day rate is `burnOf`'s — their hourly pay on the line that pays them
 * when they bill, times a day's hours — and the policy's arithmetic is
 * `benchCost`'s, carry limit and reduced rate included. Nothing is
 * computed here that either of those does not already compute.
 *
 * Nobody pays a corp-to-corp or a 1099 contractor to sit, which is the
 * rule the per-person profitability view already applies; said here, not
 * re-derived into a different number.
 */
export function costOfDays(input: {
  days: number
  /**
   * The first day on the bench. Where it is given the working days are the
   * real weekdays after it (`benchCost`'s `since`, the way `burnOf` counts
   * them); where it is not, five of every seven, and the sentence says so.
   */
  since?: Date | null
  policy: Policy
  /** Hourly pay on the line that pays them when they bill. Null where none is on record. */
  payRateCents: number | null
  contractType: string | null
  currency: string
  /**
   * Whether this person is paid for a public holiday on the bench, and the
   * firm's calendar (`holidayPayFor` in lib/bench-policy, and lib/holidays).
   * Passed straight to `benchCost`, so bench profit, bench cost and the
   * burn take a holiday out on the same days or on none.
   */
  holidayPay?: HolidayPay | null
}): DaysCost {
  const { days, policy } = input
  if (days === 0) return { costCents: 0, says: 'No days on the bench.', counted: null, why: null }
  if (policy.policy === 'NO_PAY') {
    return {
      costCents: 0,
      says: `${plural(days, 'day')} on the bench. Your policy is no bill, no pay, so nothing was paid for them.`,
      counted: 'Not paid on the bench, under your policy',
      why: null,
    }
  }
  if (input.contractType && NOT_ON_PAYROLL.has(input.contractType)) {
    return {
      costCents: 0,
      says: `${plural(days, 'day')} on the bench. They are paid through their own company, so the bench paid them nothing.`,
      counted: 'Paid through their own company, so not paid on the bench',
      why: null,
    }
  }
  if (policy.policy === 'RESERVE_FUNDED') {
    return {
      costCents: null,
      says:
        `${plural(days, 'day')} on the bench, paid from their own reserve. What the reserve held on those days is not ` +
        'read here, so the cost is not known yet.',
      counted: null,
      why: 'they are paid from their own reserve, and what it held on those days is not read here',
    }
  }
  if (input.payRateCents == null || input.payRateCents <= 0) {
    return {
      costCents: null,
      says:
        `${plural(days, 'day')} on the bench. No pay rate is on record for them, so what those days cost is not known yet. ` +
        'A pay line for them would say it.',
      counted: null,
      why: 'no pay rate is on record for them',
    }
  }
  const daily = burnOf({ payRateCents: input.payRateCents, billing: false, benchSince: new Date(0) }, new Date(0)).dailyCents!
  const c = benchCost(policy, {
    idleDays: days, billingDayRateCents: daily, since: input.since ?? null, holidayPay: input.holidayPay ?? null,
  })
  const how =
    policy.policy === 'FULL_PAY'
      ? `full pay of ${amount(daily, input.currency)} a day`
      : `${(policy.benchRateBps ?? 0) / 100}% of ${amount(daily, input.currency)} a day`
  const carry =
    policy.carryDays != null && days > policy.carryDays
      ? ` Paid only up to your ${policy.carryDays}-day carry limit.`
      : ''
  // The working days `benchCost` paid, as it counted them, so the line on
  // the screen and the cost beside it cannot disagree (bench tester,
  // 2026-10-01). Real weekdays where the first bench day is known; only
  // where it is not are five of every seven counted, and said.
  const worked = c.paidWorkingDays
  // A holiday the firm does not pay this person is said after the rate, so
  // "35 working days of 49 at …" still reads as days times the rate.
  const off =
    c.holidays === 'NOT_PAID' && c.holidaysOnBench > 0
      ? `, ${plural(c.holidaysOnBench, 'public holiday')} not paid`
      : ''
  const counted = `${plural(worked, 'working day')} of ${days} at ${how}${off}`
  const estimate = c.counted === 'ESTIMATED' ? ' Five of every seven days on the bench are counted as working days.' : ''
  const unplaced =
    c.holidays === 'NOT_KNOWN'
      ? ' Holidays are not paid, but without the first bench day they could not be taken out, so they are counted.'
      : ''
  return {
    costCents: c.costCents,
    says: `${counted}, under your bench pay policy: ${amount(c.costCents, input.currency)}.${estimate}${unplaced}${carry}`,
    counted,
    why: null,
  }
}

// ── Bench to bill, per person ─────────────────────────────────────────

/** One week the margin covers, from `placementEarned`'s weeks both sides signed. */
export interface EarnedWeek {
  endsOn: Date
  marginCents: number
}

export interface Earned {
  /** `placementEarned`'s margin. Null where it refused one. */
  marginCents: number | null
  refusedBecause: string | null
  currency: string
  /** The weeks the margin is taken over, in any order. Their sum is the margin. */
  weeks: EarnedWeek[]
}

export interface BenchToBill {
  spell: Spell['kind']
  benchFrom: string | null
  benchTo: string | null
  days: number | null
  costCents: number | null
  costSays: string
  /** What the cost was counted over, in a line beside it. Null where nothing was counted. */
  costCounted: string | null
  marginCents: number | null
  marginSays: string
  paidBackOn: string | null
  /** What is still to earn back. Null where it cannot be said, or nothing is. */
  leftCents: number | null
  paybackSays: string
}

/** "Not known yet: no pay rate is on record for them." — the real reason, never "because the cost is not". */
function notKnown(cost: DaysCost): string {
  return cost.why ? `Not known yet: ${cost.why}.` : 'Not known yet: what those days cost cannot be read off the record.'
}

export function benchToBill(input: {
  spell: Spell
  policy: Policy
  payRateCents: number | null
  contractType: string | null
  /** The pay currency, which the bench cost is in. */
  currency: string
  /** The placement's margin. Null where they are not placed. */
  earned: Earned | null
  /** Where the pay rate came from, where it is not the line paying them on those days. Said after the cost. */
  rateFrom?: string | null
  /** Whether this person is paid for a public holiday on the bench, and the calendar. */
  holidayPay?: HolidayPay | null
}): BenchToBill {
  const s = input.spell
  if (s.kind === 'UNKNOWN') {
    return {
      spell: s.kind, benchFrom: null, benchTo: null, days: null,
      costCents: null, costSays: 'Nothing on the record says when they joined the bench.', costCounted: null,
      marginCents: null, marginSays: 'Not placed.',
      paidBackOn: null, leftCents: null, paybackSays: 'Not known yet.',
    }
  }

  const days = s.days
  const cost = costOfDays({
    days, since: s.kind === 'STRAIGHT_ON' ? null : s.from,
    policy: input.policy, payRateCents: input.payRateCents, contractType: input.contractType, currency: input.currency,
    holidayPay: input.holidayPay ?? null,
  })
  const base = {
    spell: s.kind,
    benchFrom: s.kind === 'STRAIGHT_ON' ? null : iso(s.from),
    benchTo: s.kind === 'STRAIGHT_ON' ? null : iso(s.to),
    days,
    costCents: cost.costCents,
    costCounted: s.kind === 'STRAIGHT_ON' ? null : cost.counted,
    costSays:
      s.kind === 'STRAIGHT_ON'
        ? 'Went straight onto a project. No days on the bench before it.'
        : cost.costCents != null && cost.costCents > 0 && input.rateFrom
          ? `${cost.says} ${input.rateFrom}`
          : cost.says,
  }

  if (s.kind === 'NOW') {
    const starts = s.startsOn ? ` Starts on ${plainDate(iso(s.startsOn))}.` : ''
    return {
      ...base,
      marginCents: null,
      marginSays: `On the bench now, so nothing billed since.${starts}`,
      paidBackOn: null,
      leftCents: cost.costCents,
      paybackSays:
        cost.costCents == null
          ? notKnown(cost)
          : cost.costCents === 0
            ? 'Nothing to pay back.'
            : `Not placed yet. ${amount(cost.costCents, input.currency)} to earn back.`,
    }
  }

  const e = input.earned
  const margin = e?.marginCents ?? null
  const marginSays =
    e == null
      ? 'No margin on record for this placement.'
      : margin == null
        ? `Not known yet. ${e.refusedBecause ?? 'The margin on this placement cannot be stood behind.'}`
        : `${amount(margin, e.currency)} over ${plural(e.weeks.length, 'week')} both sides signed.`

  const placedOn = iso(s.placement.startsOn)
  if (cost.costCents == null) {
    return { ...base, marginCents: margin, marginSays, paidBackOn: null, leftCents: null, paybackSays: notKnown(cost) }
  }
  if (cost.costCents === 0) {
    return { ...base, marginCents: margin, marginSays, paidBackOn: null, leftCents: 0, paybackSays: 'Nothing to pay back.' }
  }
  if (e == null || margin == null) {
    return { ...base, marginCents: margin, marginSays, paidBackOn: null, leftCents: null, paybackSays: 'Not known yet, because the margin is not.' }
  }
  if (e.currency !== input.currency) {
    return {
      ...base, marginCents: margin, marginSays, paidBackOn: null, leftCents: null,
      paybackSays: `Not known yet. The margin is in ${e.currency} and the bench was paid in ${input.currency}.`,
    }
  }

  let running = 0
  for (const w of [...e.weeks].sort((a, b) => a.endsOn.getTime() - b.endsOn.getTime())) {
    running += w.marginCents
    if (running >= cost.costCents) {
      const on = iso(w.endsOn)
      return {
        ...base, marginCents: margin, marginSays, paidBackOn: on, leftCents: 0,
        paybackSays: `Paid back on ${plainDate(on)}, ${plural(daysBetween(s.placement.startsOn, w.endsOn), 'day')} after they started on ${plainDate(placedOn)}.`,
      }
    }
  }
  const left = cost.costCents - running
  return {
    ...base, marginCents: margin, marginSays, paidBackOn: null, leftCents: left,
    paybackSays: `Not yet. ${amount(left, input.currency)} left to earn back.`,
  }
}

// ── Per course ────────────────────────────────────────────────────────

/** The middle value; the mean of the two middle values for an even count. Null for none. */
export function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2
}

export interface Seat {
  personId: string
  /** ENROLLED · IN_PROGRESS · COMPLETED · DROPPED */
  status: string
  enrolledAt: Date
  completedAt: Date | null
}

/** The first placement after they joined the course, and its margin. */
export interface Placed {
  startsOn: Date
  marginCents: number | null
  refusedBecause: string | null
  currency: string
}

export interface CourseGroup {
  courseId: string | null
  title: string
  seats: number
  finished: number
  dropped: number
  pricePerSeatCents: number | null
  costCents: number | null
  costSays: string
  placed: number
  medianDaysToPlace: number | null
  speedSays: string
  marginCents: number | null
  marginSays: string
  currency: string
}

/**
 * One course as a way into the bench: what it cost, who it placed, how
 * fast and at what margin.
 *
 * What it cost is the price on the course for each seat taken — a seat
 * somebody dropped was still paid for. How fast is counted from the day
 * they finished to the first day of the first placement that started
 * after it; somebody placed before finishing is counted as placed and
 * left out of the median, and the sentence says so.
 */
export function courseGroup(input: {
  course: { id: string; title: string; priceCents: number | null; currency: string }
  seats: Seat[]
  /** By person: the first placement starting on or after they joined the course. */
  placed: Map<string, Placed>
}): CourseGroup {
  const { course, seats } = input
  const cur = course.currency
  const finished = seats.filter((s) => s.status === 'COMPLETED').length
  const dropped = seats.filter((s) => s.status === 'DROPPED').length

  const costCents = course.priceCents == null ? null : course.priceCents * seats.length
  const costSays =
    course.priceCents == null
      ? 'The course carries no price, so what it cost is not known yet.'
      : `${amount(course.priceCents, cur)} a seat, ${plural(seats.length, 'seat')} taken: ${amount(costCents, cur)}.`

  const placedSeats = seats.filter((s) => input.placed.has(s.personId))
  const days: number[] = []
  let beforeFinishing = 0
  for (const s of placedSeats) {
    const p = input.placed.get(s.personId)!
    if (s.completedAt && p.startsOn >= s.completedAt) days.push(daysBetween(s.completedAt, p.startsOn))
    else beforeFinishing++
  }
  const med = median(days)
  const speedSays =
    placedSeats.length === 0
      ? 'Nobody from this course is placed yet.'
      : med == null
        ? `${plural(placedSeats.length, 'person was', 'people were')} placed before finishing, so there is no time from finishing to count.`
        : `A median of ${plural(med, 'day')} from finishing the course to the first day placed` +
          (beforeFinishing > 0 ? `, leaving out ${beforeFinishing} placed before finishing.` : '.')

  const margins = placedSeats.map((s) => input.placed.get(s.personId)!)
  const unknown = margins.find((m) => m.marginCents == null)
  const mixed = margins.find((m) => m.currency !== cur)
  const marginCents =
    margins.length === 0 ? 0 : unknown || mixed ? null : margins.reduce((n, m) => n + (m.marginCents ?? 0), 0)
  const marginSays =
    margins.length === 0
      ? 'Nothing earned yet: nobody from it is placed.'
      : unknown
        ? `Not known yet. One placement’s margin cannot be stood behind: ${unknown.refusedBecause ?? 'no reason on record'}`
        : mixed
          ? `Not known yet. The placements are billed in more than one currency.`
          : `${amount(marginCents, cur)} earned by the ${plural(margins.length, 'person', 'people')} it placed` +
            (costCents == null ? '.' : marginCents! >= costCents ? ', more than the course cost.' : ', less than the course cost so far.')

  return {
    courseId: course.id, title: course.title, seats: seats.length, finished, dropped,
    pricePerSeatCents: course.priceCents, costCents, costSays,
    placed: placedSeats.length, medianDaysToPlace: med, speedSays,
    marginCents, marginSays, currency: cur,
  }
}

// ── Utilization, for an integrator ────────────────────────────────────

export type Standing = 'ON_PROJECT' | 'STARTING_SOON' | 'BETWEEN_PROJECTS' | 'NOT_ON_THE_RECORD'

export interface Utilization {
  billing: number
  onBench: number
  startingSoon: number
  /** Nothing on the record says whether they are free. Counted as neither. */
  unknown: number
  billingPct: number | null
  benchPct: number | null
  perProject: { project: string; billing: number }[]
  says: string
}

/**
 * The share of the firm's people billing, against the share on the bench.
 *
 * Read off the roster's own verdict (`standingOf` in
 * lib/consultant-portfolio). Somebody with nothing on the record — the
 * owner, the recruiter — is neither billing nor free, and counting them as
 * either is how the owner ends up in a capacity number, so they are
 * counted apart and out of the share.
 */
export function utilization(people: { standing: Standing; project: string | null }[]): Utilization {
  const count = (s: Standing) => people.filter((p) => p.standing === s).length
  const billing = count('ON_PROJECT')
  const onBench = count('BETWEEN_PROJECTS')
  const startingSoon = count('STARTING_SOON')
  const unknown = count('NOT_ON_THE_RECORD')
  const base = billing + onBench + startingSoon
  const pct = (n: number) => (base === 0 ? null : Math.round((n / base) * 100))

  const byProject = new Map<string, number>()
  for (const p of people) {
    if (p.standing !== 'ON_PROJECT') continue
    const k = p.project ?? 'A project not named on the record'
    byProject.set(k, (byProject.get(k) ?? 0) + 1)
  }

  return {
    billing, onBench, startingSoon, unknown,
    billingPct: pct(billing), benchPct: pct(onBench),
    perProject: [...byProject.entries()].map(([project, n]) => ({ project, billing: n })).sort((a, b) => b.billing - a.billing || a.project.localeCompare(b.project)),
    says:
      base === 0
        ? 'Nobody here is on a project or between projects on the record, so there is no share to give.'
        : `${billing} of ${base} billing (${pct(billing)}%), ${onBench} on the bench (${pct(onBench)}%)` +
          (startingSoon > 0 ? `, ${startingSoon} starting soon` : '') +
          (unknown > 0 ? `. ${plural(unknown, 'person', 'people')} with nothing on the record ${unknown === 1 ? 'is' : 'are'} not counted.` : '.'),
  }
}

// ── An internal move ──────────────────────────────────────────────────

export interface MoveSaving {
  gapDays: number | null
  gapCostCents: number | null
  gapSays: string
  savedAgainstBenchCents: null
  savedAgainstBenchSays: string
  savedAgainstSubVendorCents: null
  savedAgainstSubVendorSays: string
}

/**
 * What one move between the firm's own projects cost on the bench, and
 * what it saved.
 *
 * The days between the old line's end and the new line's start are a
 * fact, and so is what those days cost under the policy. What the move
 * *saved* is a counterfactual — the days they would have sat, or the
 * rate a sub-vendor would have charged for the seat — and nothing on the
 * record says either, so both are blank with the reason.
 */
export function moveSaving(input: {
  oldEndsOn: Date | null
  newStartsOn: Date | null
  policy: Policy
  payRateCents: number | null
  contractType: string | null
  currency: string
  holidayPay?: HolidayPay | null
}): MoveSaving {
  const blank = {
    savedAgainstBenchCents: null,
    savedAgainstBenchSays:
      'Not known yet. How long they would have sat without the move is a guess about days that never happened.',
    savedAgainstSubVendorCents: null,
    savedAgainstSubVendorSays:
      'Not known yet. Nothing on the record says what a sub-vendor would have charged for this seat.',
  } as const
  if (!input.oldEndsOn || !input.newStartsOn) {
    return { gapDays: null, gapCostCents: null, gapSays: 'The move is not dated on both ends yet.', ...blank }
  }
  // Counted the way a bench spell is: from the day the old line ended to
  // the day the new one started, so the two never disagree about a gap.
  const gap = daysBetween(input.oldEndsOn, input.newStartsOn)
  const cost = costOfDays({
    days: gap, since: input.oldEndsOn, policy: input.policy, payRateCents: input.payRateCents,
    contractType: input.contractType, currency: input.currency, holidayPay: input.holidayPay ?? null,
  })
  return {
    gapDays: gap,
    gapCostCents: cost.costCents,
    gapSays: gap === 0 ? 'Started the day the old project ended. No days on the bench.' : cost.says,
    ...blank,
  }
}

// ── What counts as a move ─────────────────────────────────────────────

/**
 * Whether a hold that ended "placed" is a move between projects.
 *
 * A line written onto the manager's own order is. Putting the firm's own
 * employee forward to a client's job request is not, until the client
 * chooses them: Karthik, only put forward, read as a move "not dated on
 * both ends" (bench tester, 2026-10-01). A submission the client placed
 * is a move.
 */
export function isMove(h: { placedSellContractId: string | null; placedSubmissionId: string | null; submissionStatus: string | null }): boolean {
  if (h.placedSellContractId) return true
  return h.placedSubmissionId != null && h.submissionStatus === 'PLACED'
}

// ── The holiday switch on a row ───────────────────────────────────────

/**
 * One person's holiday answer as the route says it: `holidayPayFor`'s
 * source and sentence (GET /api/settings/bench/people), and the person's
 * own last turn ("Switched on by Rahul Iyer, Oct 3, 2026"), null where
 * nobody has turned it.
 */
export interface HolidayAnswerRow {
  paid: boolean
  source: HolidayPaySource
  says: string
  turned: string | null
}

export interface HolidaySwitchView {
  /** The chip: "On by default", "Paid", "Not paid", "Off for the firm". */
  label: string
  tone: 'verified' | 'passive' | 'attention'
  /** The rule's own sentence, unchanged. */
  says: string
  /** What the button does: turn this person's own switch to this value. */
  turnTo: boolean
  /** "Switch off", "Switch on". */
  button: string
}

/**
 * What the holiday switch on one row shows, and what its one button does.
 *
 * The sentence is always `holidayPayFor`'s, never reworded here, so the
 * row and the settings page say the same thing. The button turns the
 * person's own switch: off where they are paid, on where they are not.
 * At a firm that has holiday pay off, the person's own last turn decides
 * the button — switching somebody on ahead of the firm is allowed and the
 * route says nothing is paid until the firm turns it on.
 */
export function holidaySwitchView(a: HolidayAnswerRow): HolidaySwitchView {
  // The person's own switch, read off the route's sentence for their last
  // turn (`turnedSays` in lib/bench-holiday-switch): "Switched on …".
  const personOn = a.turned != null && a.turned.startsWith('Switched on')
  switch (a.source) {
    case 'INTEGRATOR_DEFAULT':
      return { label: 'On by default', tone: 'verified', says: a.says, turnTo: false, button: 'Switch off' }
    case 'PERSON_ON':
      return { label: 'Paid', tone: 'verified', says: a.says, turnTo: false, button: 'Switch off' }
    case 'PERSON_OFF':
    case 'NOT_SWITCHED_ON':
      return { label: 'Not paid', tone: 'passive', says: a.says, turnTo: true, button: 'Switch on' }
    case 'FIRM_OFF':
      return {
        label: 'Off for the firm', tone: 'passive',
        says: personOn ? `${a.says}. ${a.turned} for them, ready for when the firm turns it on.` : a.says,
        turnTo: !personOn,
        button: personOn ? 'Switch off' : 'Switch on',
      }
  }
}
