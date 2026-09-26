/**
 * The baton between the desk that wins a deal and the desk that papers it.
 *
 * ── The question this answers ────────────────────────────────────────
 *
 * "How will the placed transition to contract from account manager to
 * contract manager, and at what point?"
 *
 * The point is the award. `company-defaults` already separates the two
 * desks properly: an Account Manager holds `submissions.create` and not
 * `assignments.write` — they can put somebody forward and cannot write
 * the contract. A Contract Manager holds `assignments.write` and not
 * `submissions.create` — they can paper it and cannot submit. That is
 * real segregation and it is worth keeping.
 *
 * What was missing was the handoff. The award created a sell contract
 * and a buy contract in DRAFT and told exactly one person: whoever raised
 * the requisition, who sits at the *client*. Nobody at the supplier who
 * could act on a DRAFT contract was told it existed, and the decisions
 * queue carried no row for one. A won deal became a draft on nobody's
 * desk, found by whoever happened to open the contracts list.
 *
 * CLAUDE.md: "the desk that acts is the desk that hears". Learned once
 * already, when decisions were scoped to the employer and the client who
 * signs the work read "Nothing needs you" over six weeks of hours.
 *
 * ── Why this file has no database in it ──────────────────────────────
 *
 * Who is told, what the notice says and how urgent the row is are all
 * arithmetic on facts. The route reads the facts; this decides. So every
 * branch — a rate nobody agreed, a start date already past, a firm with
 * no contract desk at all — is a unit test rather than a fixture.
 */

/** A permission set — `*` is the owner and holds everything. */
export type Held = readonly string[]

/** Papering a contract is `assignments.write`. Nothing else does it. */
export const PAPERS_CONTRACTS = 'assignments.write'

/** Putting somebody forward is `submissions.create`. A different desk. */
export const SUBMITS_PEOPLE = 'submissions.create'

export function holdsContractDesk(held: Held): boolean {
  return held.includes('*') || held.includes(PAPERS_CONTRACTS)
}

export function holdsSubmitDesk(held: Held): boolean {
  return held.includes('*') || held.includes(SUBMITS_PEOPLE)
}

/** Somebody at the supplier, with the role they hold it under. */
export interface Seat {
  personId: string
  personName: string
  /** The role's name, for naming a desk to somebody who cannot act. */
  roleName: string | null
  permissions: Held
}

export interface AwardFacts {
  personName: string
  /** The firm this supplier bills. Never a rung it cannot see. */
  clientName: string
  roleTitle: string
  /** Minor units. Null where nobody has agreed one — never printed as 0. */
  rateCents: number | null
  currency: string
  /** Null where the role named no start. */
  startDate: Date | null
}

export interface Notice {
  personIds: string[]
  title: string
  body: string
}

export interface Handoff {
  /** The ask, to whoever can actually write the contract. */
  toPaper: Notice | null
  /** The news, to whoever sells. Never an ask — they cannot act on it. */
  toSell: Notice | null
  /** How the papering desk is named in a sentence. */
  deskPhrase: string
  /** One line for the API response, so the awarder sees where it went. */
  says: string
}

/** `$135/hr`, or null where nobody has agreed a rate. */
function rateWords(cents: number | null, currency: string): string | null {
  if (cents == null || !Number.isFinite(cents) || cents <= 0) return null
  const symbol = currency === 'USD' ? '$' : `${currency} `
  return `${symbol}${(cents / 100).toFixed(2).replace(/\.00$/, '')}/hr`
}

/** A day somebody can read. Deliberately not an ISO string. */
function dayWords(at: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric',
  }).format(at)
}

/**
 * Naming the desk, in the order somebody would say it.
 *
 * One person: their name and the role they hold it under. Two: both.
 * More: the first and a count, because a sentence listing nine people is
 * not a sentence. Nobody: said plainly, because "your contract desk" is
 * a lie at a firm that has not seated one.
 */
export function deskPhraseFor(desks: readonly Seat[]): string {
  const named = desks.map((d) => (d.roleName ? `${d.personName} (${d.roleName})` : d.personName))
  if (named.length === 0) return 'nobody at your firm holds the contract desk yet'
  if (named.length === 1) return named[0]
  if (named.length === 2) return `${named[0]} and ${named[1]}`
  return `${named[0]} and ${named.length - 1} others who paper contracts here`
}

/**
 * Who hears what, the moment a candidate is placed.
 *
 * `seats` is everybody currently seated at the supplying firm. The split
 * is by permission and not by role name, because a firm renames its roles
 * and a small firm gives one person both desks — in which case they are
 * told once, as the desk that acts, and not twice.
 */
export function awardHandoff(facts: AwardFacts, seats: readonly Seat[]): Handoff {
  const papering = seats.filter((s) => holdsContractDesk(s.permissions))
  const deskPhrase = deskPhraseFor(papering)

  const money = rateWords(facts.rateCents, facts.currency)
  const rateClause = money
    ? `at ${money}`
    : 'at a rate nobody has confirmed yet'
  const startClause = facts.startDate
    ? ` Start date ${dayWords(facts.startDate)}.`
    : ' No start date has been set.'

  const subject = `${facts.personName} — ${facts.roleTitle} at ${facts.clientName}`

  const toPaper: Notice | null = papering.length > 0
    ? {
        personIds: papering.map((s) => s.personId),
        title: `Paper the contract — ${facts.personName} at ${facts.clientName}`,
        body:
          `${subject} was awarded ${rateClause}.${startClause} ` +
          'The contract is on file as a draft and nobody can start on a draft. ' +
          'Open it, check the rate, term and end client against what was agreed, ' +
          'then send it for verification. Contracts is where it is waiting.',
      }
    : null

  // Everybody who sells and cannot paper. Somebody holding both desks is
  // already in `toPaper` and is not told the same thing twice in two
  // different voices.
  const selling = seats.filter(
    (s) => holdsSubmitDesk(s.permissions) && !holdsContractDesk(s.permissions)
  )
  const toSell: Notice | null = selling.length > 0
    ? {
        personIds: selling.map((s) => s.personId),
        title: `Won — ${facts.personName} at ${facts.clientName}`,
        body:
          `${subject} was awarded ${rateClause}. ` +
          `Papering it is the contract desk's, not yours, so it has gone to ${deskPhrase}. ` +
          'You will see it start once the contract is verified and the paperwork clears.',
      }
    : null

  const says = papering.length > 0
    ? `${facts.personName}'s contract is a draft with ${deskPhrase} to paper.`
    : `${facts.personName}'s contract is a draft and ${deskPhrase}. ` +
      'Give somebody the contract desk on Users & permissions, or nobody can start them.'

  return { toPaper, toSell, deskPhrase, says }
}

/**
 * What an account manager is told when they reach for a contract.
 *
 * Never "FORBIDDEN" and never a disabled button with no words. CLAUDE.md:
 * a refusal says what is missing and what to do.
 */
export function mayPaper(held: Held, desks: readonly Seat[]): { ok: boolean; says: string } {
  if (holdsContractDesk(held)) {
    return { ok: true, says: 'You hold the contract desk here.' }
  }
  return {
    ok: false,
    says:
      'Winning the role and papering it are two desks here, which is why nobody ' +
      `can do both. ${deskPhraseFor(desks)} papers this one` +
      (desks.length > 0 ? ' and has already been told it is waiting.' : '.'),
  }
}

// ── The queue ────────────────────────────────────────────────────────

export type PaperingType = 'CONTRACT_PAPERING' | 'CONTRACT_START'
export type Urgency = 'HIGH' | 'MEDIUM' | 'LOW'

export interface WaitingContract {
  /** DRAFT is unpapered. PENDING_VERIFICATION and VERIFIED are papered and unstarted. */
  state: string
  personName: string
  clientName: string
  roleTitle: string | null
  rateCents: number | null
  currency: string
  /** When it reached this state — the award, or the day it was papered. */
  waitingSince: Date
  startDate: Date | null
}

export interface QueueRow {
  type: PaperingType
  title: string
  subtitle: string
  urgency: Urgency
  waitedDays: number
}

/** Whole days between two instants, never negative. */
export function daysWaiting(since: Date, now: Date): number {
  const ms = now.getTime() - since.getTime()
  return ms <= 0 ? 0 : Math.floor(ms / 86_400_000)
}

/** "1 day", "9 days". A length, not a moment. */
export function waitWords(days: number): string {
  return days === 1 ? '1 day' : `${days} days`
}

/** "today", "1 day ago", "9 days ago". A moment, not a length. */
export function agoWords(days: number): string {
  return days <= 0 ? 'today' : `${waitWords(days)} ago`
}

/**
 * One row on the supplier's own "Needs attention".
 *
 * Two shapes, because they are two desks' acts a day apart: writing the
 * contract, and starting the person on it. Returns null for any state
 * that is neither — a live contract is not a decision.
 */
export function paperingRow(c: WaitingContract, now: Date): QueueRow | null {
  const unpapered = c.state === 'DRAFT'
  const unstarted = c.state === 'PENDING_VERIFICATION' || c.state === 'VERIFIED'
  if (!unpapered && !unstarted) return null

  const waitedDays = daysWaiting(c.waitingSince, now)
  const money = rateWords(c.rateCents, c.currency)
  const role = c.roleTitle ?? 'a role'

  // Days until they are meant to start. Negative means the start date has
  // already passed, which is the case that costs somebody money: work is
  // happening and nothing is billable against it.
  const untilStart = c.startDate ? Math.ceil((c.startDate.getTime() - now.getTime()) / 86_400_000) : null

  const startWords = untilStart == null
    ? 'no start date set'
    : untilStart < 0
      ? `due to start ${waitWords(-untilStart)} ago`
      : untilStart === 0
        ? 'due to start today'
        : `starts in ${waitWords(untilStart)}`

  if (unpapered) {
    const urgency: Urgency =
      (untilStart != null && untilStart <= 7) || waitedDays >= 7
        ? 'HIGH'
        : waitedDays >= 3
          ? 'MEDIUM'
          : 'LOW'
    return {
      type: 'CONTRACT_PAPERING',
      title: `Paper the contract — ${c.personName}`,
      subtitle:
        `${role} · ${c.clientName}${money ? ` · ${money}` : ' · rate not confirmed'} · ` +
        `awarded ${agoWords(waitedDays)}, still a draft · ${startWords}`,
      urgency,
      waitedDays,
    }
  }

  const urgency: Urgency =
    untilStart != null && untilStart < 0
      ? 'HIGH'
      : untilStart != null && untilStart <= 7
        ? 'MEDIUM'
        : 'LOW'
  return {
    type: 'CONTRACT_START',
    title: `Start ${c.personName} at ${c.clientName}`,
    subtitle:
      `${role}${money ? ` · ${money}` : ''} · papered ${agoWords(waitedDays)}, ` +
      `not started · ${startWords} · the paperwork is checked when you start them`,
    urgency,
    waitedDays,
  }
}
