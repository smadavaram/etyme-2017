/**
 * An integrator's own people, moving between its projects.
 *
 * ── The decision, 2026-09-30 ─────────────────────────────────────────
 *
 * The founder, in his own example: a project manager at an integrator,
 * on one client's project in Portland, publishes who is rolling off;
 * another manager of the same firm, on a different client's project in
 * San Jose, sees them, asks, and takes one into his open position.
 * CLAUDE.md, "How an integrator's people move between its projects":
 *
 *   1. The releasing manager flags a person with the day they come off.
 *      They appear on the firm's Our bench — seen by its own managers
 *      and HR, never by any client.
 *   2. Another manager asks (a thread inside the firm) and reserves the
 *      person for his position — one hold at a time.
 *   3. The releasing manager confirms the date; the receiving manager
 *      places the person — as INTERNAL on the new client's job request,
 *      or onto a line of his own project's existing order, starting
 *      after the old one ends. No approval from HR, but HR is told of
 *      every flag, hold, release and move.
 *   4. A releasing manager may keep somebody — "staying with me until" —
 *      and they read as free from that date.
 *   5. The person is told at each step, not asked: the employment is the
 *      consent. A move to another city says so.
 *
 * ── What is here ─────────────────────────────────────────────────────
 *
 * The decisions, and only the decisions: who reads Our bench, who
 * manages a line, when somebody is free, whether a flag, a hold, a
 * release or a placement may happen, and the sentences each party is
 * told. No database. The routes under `app/api/bench/ours` load the
 * facts and write the rows; `__tests__/invariants/internal-moves.test.ts`
 * holds these as sentences.
 *
 * Nothing here assumes IT staffing. A charge nurse moving from one
 * hospital unit contract to another, or a validation engineer from one
 * plant to the next, walks the same five steps.
 */

import { plainDate } from '@/lib/plain-date'

const DAY = 86_400_000

/** How long a hold stands if the manager does not say. Two working weeks. */
export const HOLD_DAYS = 14
/** The longest a hold may be asked for. Longer is keeping somebody off Our bench. */
export const HOLD_DAYS_MAX = 30
/** How far ahead a free date still counts in matching — the same month `lib/match-pool` uses. */
export const MATCH_WINDOW_DAYS = 30

/**
 * The desk that is told, named by its role.
 *
 * HR holds no permission unique to it — it reads people and their
 * paperwork, which a recruiter and a compliance officer also do — so the
 * desk is found by the name the firm's own role table gives it, the same
 * way the supplier-onboarding desks and the demo door find it. "HR
 * Partner" is the client's word for the same desk.
 */
export const HR_ROLE_NAMES: readonly string[] = ['HR', 'HR Partner']

// ── Days ─────────────────────────────────────────────────────────────

/** Midnight UTC on the day `d` falls on. Every stored day is one. */
export function dayOf(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

export function addDays(d: Date, n: number): Date {
  return new Date(dayOf(d).getTime() + n * DAY)
}

export function isoDay(d: Date): string {
  return dayOf(d).toISOString().slice(0, 10)
}

/** "Oct 18, 2026". */
export function onDay(d: Date): string {
  return plainDate(isoDay(d))
}

// ── Who reads Our bench ──────────────────────────────────────────────

export interface Reader {
  companyName: string
  /** CLIENT, VENDOR, GSI, MSP, CONSULTANT_CORP — null when the seat has no company. */
  companyKind: string | null
  permissions: string[]
  /** The name of the role the seat holds, in the firm's own words. */
  roleName: string | null
  /** A consultant's seat on somebody's bench is never the firm's seat. */
  consultantSeat: boolean
}

export type ReadVerdict =
  | { ok: true; as: 'MANAGER' | 'HR' }
  | { ok: false; code: 'NO_COMPANY' | 'CLIENT' | 'NOT_STAFF' | 'NOT_A_MANAGER'; message: string }

function holds(permissions: string[], p: string): boolean {
  return permissions.includes('*') || permissions.includes(p)
}

/**
 * May this seat read the firm's own Our bench?
 *
 * The firm's managers — whoever holds `assignments.write`, the
 * permission that moves a person onto a placement — and its HR desk.
 * Nobody else: not an engineer on the roster, not a recruiter selling
 * other firms' people, and never a client, who reads no firm's bench and
 * meets bench only through matching on its own job request.
 */
export function mayReadOurBench(r: Reader): ReadVerdict {
  if (r.consultantSeat) {
    return {
      ok: false, code: 'NOT_STAFF',
      message: 'Our bench is read by the firm’s managers and HR. Your own moves are on your own page.',
    }
  }
  if (!r.companyKind) {
    return { ok: false, code: 'NO_COMPANY', message: 'Our bench belongs to a firm. Sign in at the firm whose people you are looking for.' }
  }
  if (r.companyKind === 'CLIENT') {
    return {
      ok: false, code: 'CLIENT',
      message:
        'Our bench is a supplier’s own people between its projects, and no client reads it. ' +
        'People reach your job requests through matching, from the suppliers you work with.',
    }
  }
  if (holds(r.permissions, 'assignments.write')) return { ok: true, as: 'MANAGER' }
  if (r.roleName && HR_ROLE_NAMES.includes(r.roleName)) return { ok: true, as: 'HR' }
  return {
    ok: false, code: 'NOT_A_MANAGER',
    message:
      `Our bench at ${r.companyName} is read by the managers who staff its projects and by HR. ` +
      `Your seat${r.roleName ? ` (${r.roleName})` : ''} is neither.`,
  }
}

// ── Who manages a line ───────────────────────────────────────────────

export interface ManagerSeat {
  permissions: string[]
  /** The unit the seat sits on. Null is firm-wide. */
  orgUnitId: string | null
  /** That unit and every unit under it. Ignored where the seat sits on none. */
  unitIds: string[]
  /** People named as this manager's team on the seat. */
  teamPersonIds: string[]
}

export interface LineFacts {
  personId: string
  /** The project or account inside the selling firm that delivers this line. */
  deliveryUnitId: string | null
}

/**
 * Does this seat manage the placement this line is?
 *
 * A manager holds `assignments.write`. Where the line names the project
 * that delivers it, the manager is whoever sits on that project or above
 * it, or names the person as their team; a manager who sits on no unit
 * is firm-wide. Where the line names no project, any manager may —
 * a desk nobody has named falls back, it never refuses (CLAUDE.md,
 * 2026-09-13).
 */
export function managesLine(seat: ManagerSeat, line: LineFacts): boolean {
  if (!holds(seat.permissions, 'assignments.write')) return false
  if (!line.deliveryUnitId) return true
  if (!seat.orgUnitId) return true
  if (seat.unitIds.includes(line.deliveryUnitId)) return true
  return seat.teamPersonIds.includes(line.personId)
}

// ── When somebody is free ────────────────────────────────────────────

export interface ReleaseDates {
  rollsOffOn: Date
  keepUntil: Date | null
}

/**
 * The first day somebody may start elsewhere.
 *
 * The day after they roll off; or, where the releasing manager keeps
 * them, the keep date itself — "staying with me until the 30th" reads as
 * free from the 30th, in the founder's words, and is not moved a day.
 */
export function freeFrom(r: ReleaseDates): Date {
  if (r.keepUntil) return dayOf(r.keepUntil)
  return addDays(r.rollsOffOn, 1)
}

/**
 * Whether a flagged employee counts in matching today: free within the
 * matching window. Somebody kept past it counts once their date nears.
 */
export function countsInMatching(r: ReleaseDates, today: Date): boolean {
  return freeFrom(r).getTime() <= addDays(today, MATCH_WINDOW_DAYS).getTime()
}

// ── The flag ─────────────────────────────────────────────────────────

export interface FlagFacts {
  personName: string
  clientName: string
  lineState: string
  lineStart: Date
  lineEnd: Date | null
  rollsOffOn: Date
  keepUntil: Date | null
  today: Date
  manages: boolean
}

export type FlagVerdict =
  | { ok: true; freeOn: Date; early: boolean; says: string }
  | { ok: false; code: 'NOT_YOUR_PROJECT' | 'NOT_RUNNING' | 'IN_THE_PAST' | 'OUTSIDE_LINE' | 'KEEP_BEFORE_ROLLOFF'; message: string }

/**
 * May this manager say this person comes off this line on this day?
 *
 * The day falls inside the line: nobody rolls off a contract they are
 * not on, and nobody rolls off after its last day without it being
 * extended first — a flag is not an extension. An earlier day is
 * allowed and said: the line itself is not shortened here, and the
 * person cannot be placed elsewhere while it still runs.
 */
export function checkFlag(f: FlagFacts): FlagVerdict {
  const who = f.personName
  if (!f.manages) {
    return {
      ok: false, code: 'NOT_YOUR_PROJECT',
      message: `${who} is on a project you do not manage. The manager of the ${f.clientName} project flags who comes off it.`,
    }
  }
  if (f.lineState !== 'IN_PROGRESS' && f.lineState !== 'PAUSED') {
    return { ok: false, code: 'NOT_RUNNING', message: `${who}’s placement at ${f.clientName} is not running, so there is nothing to roll off.` }
  }
  const day = dayOf(f.rollsOffOn)
  if (day.getTime() < dayOf(f.today).getTime()) {
    return { ok: false, code: 'IN_THE_PAST', message: `${onDay(day)} has passed. Say the day ${who} comes off, today or later.` }
  }
  if (day.getTime() < dayOf(f.lineStart).getTime()) {
    return { ok: false, code: 'OUTSIDE_LINE', message: `${who} starts at ${f.clientName} on ${onDay(f.lineStart)}, so cannot come off before then.` }
  }
  if (f.lineEnd && day.getTime() > dayOf(f.lineEnd).getTime()) {
    return {
      ok: false, code: 'OUTSIDE_LINE',
      message:
        `${who}’s contract at ${f.clientName} ends on ${onDay(f.lineEnd)}. ` +
        `A roll-off after it is an extension — extend the contract first, then flag the new day.`,
    }
  }
  if (f.keepUntil && dayOf(f.keepUntil).getTime() < day.getTime()) {
    return {
      ok: false, code: 'KEEP_BEFORE_ROLLOFF',
      message: `"Staying with me until" ${onDay(f.keepUntil)} is before ${who} comes off on ${onDay(day)}. Pick a later day, or leave it empty.`,
    }
  }
  const freeOn = freeFrom({ rollsOffOn: day, keepUntil: f.keepUntil })
  const early = f.lineEnd != null && day.getTime() < dayOf(f.lineEnd).getTime()
  const gap = keptPastContract(f.keepUntil, f.lineEnd ?? null)
  const keep = f.keepUntil
    ? ` You keep them until then; they read as free from ${onDay(freeOn)}.${gap ? ` ${gap}` : ''}`
    : ` Free from ${onDay(freeOn)}.`
  const earlyNote = early
    ? ` The contract still runs to ${onDay(f.lineEnd!)}; it is not shortened by this, and ${who} cannot start elsewhere until it ends.`
    : ''
  return { ok: true, freeOn, early, says: `${who} comes off the ${f.clientName} project on ${onDay(day)}.${keep}${earlyNote}` }
}

/**
 * Said where a manager keeps somebody past the day their contract ends.
 *
 * Amara was "kept until Nov 15" on a contract ending Oct 26, which is
 * three weeks with no contract under her and nothing on the screen said
 * so (bench tester, 2026-10-01). Keeping is allowed — it is the
 * manager's call — but the days between are named, and who pays them is
 * the firm's bench pay policy, not the client.
 */
export function keptPastContract(keepUntil: Date | null, contractEnds: Date | null): string | null {
  if (!keepUntil || !contractEnds) return null
  const gap = Math.round((dayOf(keepUntil).getTime() - dayOf(contractEnds).getTime()) / DAY) - 1
  if (gap <= 0) return null
  return (
    `The contract ends on ${onDay(contractEnds)}, so the ${gap === 1 ? 'one day' : `${gap} days`} between then and ` +
    `${onDay(keepUntil)} have no contract under them: no client is billed for them, and your bench pay policy decides ` +
    'what they are paid.'
  )
}

// ── The hold ─────────────────────────────────────────────────────────

export interface LiveHold {
  heldById: string
  heldByName: string
  forTitle: string
  until: Date
}

/** A hold stands to the end of its own day, read off the date itself — no nightly job decides it. */
export function holdStands(h: { until: Date; live: string | null }, today: Date): boolean {
  return h.live === 'LIVE' && dayOf(h.until).getTime() >= dayOf(today).getTime()
}

export interface HoldFacts {
  personName: string
  callerId: string
  /** Whoever is releasing the person. Null for somebody already between projects. */
  releaserId: string | null
  /** The hold that stands on this person today, if one does. */
  standing: LiveHold | null
  /** Whether the caller manages anything at all — holds `assignments.write`. */
  isManager: boolean
  /** The day the caller asked to hold until, or null for the default. */
  untilAsked: Date | null
  /** A position was named. */
  hasPosition: boolean
  /** The first day the person may start elsewhere (`freeFrom`). Null or past for somebody free now. */
  freeOn?: Date | null
  today: Date
}

export type HoldVerdict =
  | { ok: true; until: Date; says: string }
  | { ok: false; code: 'NOT_A_MANAGER' | 'OWN_PERSON' | 'HELD' | 'NO_POSITION' | 'BAD_UNTIL'; message: string }

/**
 * May this manager reserve this person for his position?
 *
 * One hold at a time. A second is refused in a sentence naming who holds
 * the person, for what, and until when — so the second manager knows
 * whom to ask rather than guessing. The releasing manager cannot hold
 * their own person: keeping somebody is "staying with me until", which
 * says a date and is seen by everybody on Our bench.
 */
export function checkHold(f: HoldFacts): HoldVerdict {
  const who = f.personName
  if (!f.isManager) {
    return { ok: false, code: 'NOT_A_MANAGER', message: `Reserving ${who} is for a manager who staffs a project. HR is told; it does not hold.` }
  }
  if (f.releaserId && f.releaserId === f.callerId) {
    return {
      ok: false, code: 'OWN_PERSON',
      message: `You are releasing ${who}. To keep them, say "staying with me until" a date instead of holding them.`,
    }
  }
  if (f.standing) {
    if (f.standing.heldById === f.callerId) {
      return { ok: false, code: 'HELD', message: `You already hold ${who} for ${f.standing.forTitle}, until ${onDay(f.standing.until)}.` }
    }
    return {
      ok: false, code: 'HELD',
      message:
        `${who} is held by ${f.standing.heldByName} for ${f.standing.forTitle} until ${onDay(f.standing.until)}. ` +
        `Ask ${f.standing.heldByName}, or wait until then.`,
    }
  }
  if (!f.hasPosition) {
    return { ok: false, code: 'NO_POSITION', message: `Say which position you are holding ${who} for — a job request, or your own project’s order.` }
  }
  const today = dayOf(f.today)
  // A hold reaches at least the day the person is free: one that runs out
  // before then protects nothing (bench tester, 2026-10-01 — Amara held
  // to Oct 15 and free on Nov 15). So the default is two weeks or the
  // free day, whichever is later, and the longest is thirty days or the
  // free day, whichever is later.
  const free = f.freeOn && dayOf(f.freeOn).getTime() > today.getTime() ? dayOf(f.freeOn) : null
  const later = (a: Date, b: Date | null) => (b && b.getTime() > a.getTime() ? b : a)
  const until = f.untilAsked ? dayOf(f.untilAsked) : later(addDays(today, HOLD_DAYS), free)
  if (until.getTime() < today.getTime()) {
    return { ok: false, code: 'BAD_UNTIL', message: `A hold ends today or later, not on ${onDay(until)}.` }
  }
  const longest = later(addDays(today, HOLD_DAYS_MAX), free)
  if (until.getTime() > longest.getTime()) {
    return {
      ok: false, code: 'BAD_UNTIL',
      message: free && free.getTime() >= addDays(today, HOLD_DAYS_MAX).getTime()
        ? `A hold lasts until ${who} is free at most, so no later than ${onDay(longest)}. Longer keeps ${who} from every other manager.`
        : `A hold lasts ${HOLD_DAYS_MAX} days at most, so no later than ${onDay(longest)}. Longer keeps ${who} from every other manager.`,
    }
  }
  const lapses =
    free && until.getTime() < free.getTime()
      ? ` It ends before ${who} is free on ${onDay(free)}: place them before it ends, or it lapses and any manager may reserve them.`
      : ''
  return { ok: true, until, says: `You hold ${who} until ${onDay(until)}. Nobody else can reserve them before then.${lapses}` }
}

/** Who may end a hold: whoever holds it, or the manager releasing the person. */
export function mayEndHold(f: { callerId: string; heldById: string; releaserId: string | null }): boolean {
  return f.callerId === f.heldById || (f.releaserId != null && f.callerId === f.releaserId)
}

// ── Confirming the day ───────────────────────────────────────────────

export type ConfirmVerdict =
  | { ok: true; says: string }
  | { ok: false; code: 'NOT_RELEASER' | 'WITHDRAWN'; message: string }

/** Only the releasing manager confirms the day somebody comes off. */
export function checkConfirm(f: {
  callerId: string
  releaserId: string
  releaserName: string
  personName: string
  withdrawn: boolean
  rollsOffOn: Date
}): ConfirmVerdict {
  if (f.withdrawn) {
    return { ok: false, code: 'WITHDRAWN', message: `${f.personName} is no longer coming off; ${f.releaserName} took the flag back.` }
  }
  if (f.callerId !== f.releaserId) {
    return { ok: false, code: 'NOT_RELEASER', message: `${f.releaserName} is releasing ${f.personName}, so ${f.releaserName} confirms the day.` }
  }
  return { ok: true, says: `${f.personName} comes off on ${onDay(f.rollsOffOn)}, confirmed.` }
}

// ── Placing ──────────────────────────────────────────────────────────

export interface PlaceFacts {
  personName: string
  callerId: string
  hold: { heldById: string; heldByName: string; until: Date; live: string | null } | null
  release: { rollsOffOn: Date; keepUntil: Date | null; confirmedAt: Date | null; releaserName: string } | null
  /** The last day of every line the person is on now or has been papered onto, latest first. */
  latestLineEnd: Date | null
  /** Whether a live line has no end date at all. */
  openEndedLine: boolean
  /** A start the manager asked for, or null for the earliest allowed. */
  startAsked: Date | null
  today: Date
}

export type PlaceVerdict =
  | { ok: true; startsOn: Date }
  | { ok: false; code: 'NOT_HELD' | 'NOT_YOURS' | 'NOT_CONFIRMED' | 'STILL_ON_A_LINE' | 'TOO_EARLY'; message: string }

/**
 * May the receiving manager place this person, and from which day?
 *
 * Only whoever holds them. Somebody flagged waits for the releasing
 * manager to confirm the day. The new line starts the day after the old
 * one ends — or on the free date where that is later, or on a later day
 * the manager asks for — and never earlier: two lines for one person on
 * one day is one day billed twice. A line still running past the flagged
 * day, or with no end at all, has to be ended on its own page first.
 */
export function checkPlace(f: PlaceFacts): PlaceVerdict {
  const who = f.personName
  if (!f.hold || !holdStands(f.hold, f.today)) {
    return { ok: false, code: 'NOT_HELD', message: `Reserve ${who} for your position first. A placement follows a hold.` }
  }
  if (f.hold.heldById !== f.callerId) {
    return { ok: false, code: 'NOT_YOURS', message: `${f.hold.heldByName} holds ${who}, so ${f.hold.heldByName} places them.` }
  }
  if (f.release && !f.release.confirmedAt) {
    return {
      ok: false, code: 'NOT_CONFIRMED',
      message: `${f.release.releaserName} has not confirmed the day ${who} comes off. Ask them to confirm it, then place.`,
    }
  }
  if (f.openEndedLine) {
    return {
      ok: false, code: 'STILL_ON_A_LINE',
      message: `${who} is on a contract with no end date. It is ended on its own page first, so the two never overlap.`,
    }
  }
  if (f.release && f.latestLineEnd && dayOf(f.latestLineEnd).getTime() > dayOf(f.release.rollsOffOn).getTime()) {
    return {
      ok: false, code: 'STILL_ON_A_LINE',
      message:
        `${who}’s contract runs to ${onDay(f.latestLineEnd)}, after the day they come off (${onDay(f.release.rollsOffOn)}). ` +
        `It is ended on its own page first, so the two never overlap.`,
    }
  }
  const candidates = [dayOf(f.today)]
  if (f.latestLineEnd) candidates.push(addDays(f.latestLineEnd, 1))
  if (f.release) candidates.push(freeFrom(f.release))
  const earliest = new Date(Math.max(...candidates.map((d) => d.getTime())))
  if (f.startAsked && dayOf(f.startAsked).getTime() < earliest.getTime()) {
    return { ok: false, code: 'TOO_EARLY', message: `${who} can start on ${onDay(earliest)} at the earliest.` }
  }
  return { ok: true, startsOn: f.startAsked ? dayOf(f.startAsked) : earliest }
}

// ── Where, as a person reads it ─────────────────────────────────────

/**
 * The city out of a place, as the record holds it: a site's own city
 * column, or the first part of "San Jose, CA". Null where nothing says,
 * and never a guess.
 */
export function cityOf(place: { city?: string | null } | string | null | undefined): string | null {
  if (!place) return null
  if (typeof place !== 'string') return place.city?.trim() || null
  const first = place.split(',')[0]?.trim()
  if (!first || /^remote$/i.test(first)) return null
  return first
}

/**
 * The sentence a move to another city carries, or null where it does not
 * change city — or where either end does not say, because a city change
 * nobody can stand behind is not said.
 */
export function cityChange(from: string | null, to: string | null): string | null {
  if (!from || !to) return null
  if (from.trim().toLowerCase() === to.trim().toLowerCase()) return null
  return `This moves you from ${from} to ${to}.`
}

// ── What each party is told ──────────────────────────────────────────

export type Step = 'FLAG' | 'HOLD' | 'HOLD_ENDED' | 'CONFIRM' | 'MOVE'

export interface StepFacts {
  personName: string
  firmName: string
  actorName: string
  /** The project they are coming off: client, and city where known. */
  fromClient?: string | null
  fromCity?: string | null
  rollsOffOn?: Date | null
  keepUntil?: Date | null
  /** The position: its title, the client, the city where known. */
  forTitle?: string | null
  toClient?: string | null
  toCity?: string | null
  until?: Date | null
  startsOn?: Date | null
  /** RELEASED · EXPIRED — how a hold ended. */
  endedHow?: string | null
  /** INTERNAL on a job request, or a line on the manager's own order. */
  movedAs?: 'SUBMISSION' | 'LINE' | null
}

/**
 * A position's title without the client it already names.
 *
 * A hold's title is "the job at the client" — "ERP finance migration at
 * Harlow Health" — so a sentence that adds "at Harlow Health" after it
 * read the client twice (bench tester, 2026-10-01).
 */
export function jobOnly(forTitle: string | null | undefined, client: string | null | undefined): string {
  const t = (forTitle ?? '').trim()
  if (!t) return 'the position'
  if (client) {
    const tail = ` at ${client}`
    if (t.endsWith(tail) && t.length > tail.length) return t.slice(0, -tail.length)
  }
  return t
}

/** "Teleworld Solutions’", "Harlow Health’s": a name ending in s takes the apostrophe alone. */
export function possessive(name: string): string {
  return /s$/i.test(name.trim()) ? `${name.trim()}’` : `${name.trim()}’s`
}

function at(client?: string | null, city?: string | null): string {
  if (client && city) return `${client} in ${city}`
  return client ?? city ?? 'the project'
}

/**
 * The line HR reads, for every step. HR approves nothing here — the
 * founder was explicit — and is told of every flag, hold, release and
 * move, because the firm's own people are HR's to know about.
 */
export function hrNotice(step: Step, f: StepFacts): { title: string; body: string } {
  const who = f.personName
  switch (step) {
    case 'FLAG': {
      const keep = f.keepUntil ? ` ${f.actorName} keeps them until ${onDay(f.keepUntil)}.` : ''
      return {
        title: `${who} rolls off ${at(f.fromClient, f.fromCity)} on ${onDay(f.rollsOffOn!)}`,
        body: `${f.actorName} flagged it; ${who} is on Our bench now.${keep} Nothing is asked of you.`,
      }
    }
    case 'HOLD':
      return {
        title: `${f.actorName} is holding ${who} for ${f.forTitle}`,
        body: `Held until ${onDay(f.until!)}, for ${at(f.toClient, f.toCity)}. Nothing is asked of you.`,
      }
    case 'HOLD_ENDED':
      return {
        title: `The hold on ${who} ${f.endedHow === 'EXPIRED' ? 'ran out' : 'was released'}`,
        body: `${who} is back on Our bench for any manager. ${f.endedHow === 'EXPIRED' ? '' : `Released by ${f.actorName}. `}Nothing is asked of you.`,
      }
    case 'CONFIRM':
      return {
        title: `${f.actorName} confirmed ${who} comes off on ${onDay(f.rollsOffOn!)}`,
        body: `From ${at(f.fromClient, f.fromCity)}. Nothing is asked of you.`,
      }
    case 'MOVE': {
      const how = f.movedAs === 'SUBMISSION'
        ? `put forward to ${possessive(f.toClient ?? 'the client')} job request as the firm’s own employee`
        : `placed on ${jobOnly(f.forTitle, f.toClient)} at ${at(f.toClient, f.toCity)}, starting ${onDay(f.startsOn!)}`
      const city = cityChange(f.fromCity ?? null, f.toCity ?? null)
      return {
        title: `${who} moves to ${at(f.toClient, f.toCity)}`,
        body: `${f.actorName} ${how}.${city ? ` ${who} changes city: ${f.fromCity} to ${f.toCity}.` : ''} Their paperwork for the new site is yours to check; nothing waits on you.`,
      }
    }
  }
}

/**
 * The line the person reads, on their own page and by email. They are
 * told, never asked — the employment is the consent — and a move to
 * another city says so in so many words.
 */
export function personNotice(step: Step, f: StepFacts): { title: string; body: string } {
  switch (step) {
    case 'FLAG': {
      const keep = f.keepUntil
        ? ` ${f.actorName} is keeping you until ${onDay(f.keepUntil)}, and other managers at ${f.firmName} can see you are free from then.`
        : ` Other managers at ${f.firmName} can see you are free from ${onDay(addDays(f.rollsOffOn!, 1))}.`
      return {
        title: `You come off ${at(f.fromClient, f.fromCity)} on ${onDay(f.rollsOffOn!)}`,
        body: `${f.actorName} has told ${f.firmName} you are rolling off.${keep} No client sees this.`,
      }
    }
    case 'HOLD':
      return {
        title: `${f.actorName} is holding you for ${f.forTitle}`,
        body: `${f.toClient || f.toCity ? `At ${at(f.toClient, f.toCity)}, until` : 'Until'} ${onDay(f.until!)}. Nothing is decided yet; you will hear when it is.`,
      }
    case 'HOLD_ENDED':
      return {
        title: `You are no longer held for ${f.forTitle ?? 'that position'}`,
        body: `You stay on ${f.firmName}’s bench, for any of its managers, until your next project.`,
      }
    case 'CONFIRM':
      return {
        title: `Your last day at ${at(f.fromClient, f.fromCity)} is ${onDay(f.rollsOffOn!)}`,
        body: `${f.actorName} confirmed it.`,
      }
    case 'MOVE': {
      const city = cityChange(f.fromCity ?? null, f.toCity ?? null)
      const body = f.movedAs === 'SUBMISSION'
        ? `${f.firmName} has put you forward to ${f.toClient} for ${jobOnly(f.forTitle, f.toClient)}, as its own employee. You start there only if ${f.toClient} chooses you; your employer stays ${f.firmName}.`
        : `You start on ${onDay(f.startsOn!)}, on ${f.forTitle}. Your employer stays ${f.firmName}; ${f.actorName} is your manager there.`
      return {
        title: f.movedAs === 'SUBMISSION'
          ? `You are put forward to ${at(f.toClient, f.toCity)}`
          : `Your next project: ${at(f.toClient, f.toCity)}, from ${onDay(f.startsOn!)}`,
        body: city ? `${body} ${city}` : body,
      }
    }
  }
}

// ── A row on Our bench ───────────────────────────────────────────────

export type BenchStatus = 'ROLLING_OFF' | 'KEPT' | 'BETWEEN_PROJECTS' | 'MOVING'

export interface OurBenchFacts {
  personId: string
  name: string
  /** The seat's role, "Validation Engineer" — shown where no skills are on record. */
  seat: string | null
  skills: string[]
  /** Where they are, from their own profile. */
  place: string | null
  release: {
    id: string
    rollsOffOn: Date
    keepUntil: Date | null
    confirmedAt: Date | null
    releaserId: string
    releaserName: string
  } | null
  /** The project they are on now: client and city, where the reader may be told it, and the day its contract ends. */
  current: { client: string | null; city: string | null; endsOn?: Date | null } | null
  /** Whether the reader's own account wall lets them see which client that is. */
  mayNameProject: boolean
  /** The day they were last on a project, for somebody already between projects. */
  lastEnded: Date | null
  hold: (LiveHold & { id: string; forKind?: 'ORDER' | 'REQUIREMENT' }) | null
  /** A placement already written for this person, not yet started. */
  moving: { toClient: string | null; startsOn: Date } | null
  today: Date
}

export interface ViewerFacts {
  personId: string
  as: 'MANAGER' | 'HR'
}

export interface OurBenchRow {
  personId: string
  name: string
  status: BenchStatus
  /** The first day they can start elsewhere. */
  freeOn: string
  freeOnSays: string
  skills: string[]
  skillsSay: string
  place: string | null
  project: string | null
  releaser: { id: string; name: string } | null
  releaseId: string | null
  confirmed: boolean
  hold: { id: string; byId: string; byName: string; forTitle: string; forKind: 'ORDER' | 'REQUIREMENT'; until: string } | null
  says: string
  /** What this reader may do, decided here so the screen never draws a button the route refuses. */
  may: { ask: boolean; reserve: boolean; endHold: boolean; confirm: boolean; place: boolean }
}

/**
 * One person on Our bench, as this reader sees them.
 *
 * The current project is named only where the reader's own account wall
 * lets them read that client — "another account" otherwise — because at
 * a firm with thirty accounts, who is staffed at one client is that
 * client's business.
 */
export function ourBenchRow(f: OurBenchFacts, viewer: ViewerFacts): OurBenchRow {
  const today = dayOf(f.today)
  const freeOnDate = f.release
    ? freeFrom(f.release)
    : f.lastEnded
      ? new Date(Math.max(addDays(f.lastEnded, 1).getTime(), today.getTime()))
      : today
  const status: BenchStatus = f.moving
    ? 'MOVING'
    : f.release
      ? f.release.keepUntil ? 'KEPT' : 'ROLLING_OFF'
      : 'BETWEEN_PROJECTS'
  const project = f.current
    ? f.mayNameProject
      ? [f.current.client, f.current.city].filter(Boolean).join(', ') || null
      : 'Another account'
    : null
  const freeOnSays = freeOnDate.getTime() <= today.getTime() ? 'Free now' : `Free from ${onDay(freeOnDate)}`

  let says: string
  if (f.moving) {
    says = `Moving to ${f.moving.toClient ?? 'a new project'} from ${onDay(f.moving.startsOn)}.`
  } else if (f.release) {
    const off = `Comes off${project ? ` ${project}` : ''} on ${onDay(f.release.rollsOffOn)}`
    const keep = f.release.keepUntil ? `; staying with ${f.release.releaserName} until ${onDay(f.release.keepUntil)}` : ''
    const conf = f.release.confirmedAt ? ', confirmed' : ''
    const gap = keptPastContract(f.release.keepUntil, f.current?.endsOn ?? null)
    says = `${off}${keep}${conf}. Released by ${f.release.releaserName}.${gap ? ` ${gap}` : ''}`
  } else {
    says = f.lastEnded ? `Between projects since ${onDay(addDays(f.lastEnded, 1))}.` : 'Between projects.'
  }
  if (f.hold) says += ` Held by ${f.hold.heldByName} for ${f.hold.forTitle} until ${onDay(f.hold.until)}.`

  const isReleaser = f.release != null && f.release.releaserId === viewer.personId
  const isHolder = f.hold != null && f.hold.heldById === viewer.personId
  const manager = viewer.as === 'MANAGER'
  return {
    personId: f.personId,
    name: f.name,
    status,
    freeOn: isoDay(freeOnDate),
    freeOnSays,
    skills: f.skills,
    skillsSay: f.skills.length ? f.skills.join(', ') : f.seat ? `${f.seat} — no skills on record` : 'No skills on record',
    place: f.place,
    project,
    releaser: f.release ? { id: f.release.releaserId, name: f.release.releaserName } : null,
    releaseId: f.release?.id ?? null,
    confirmed: Boolean(f.release?.confirmedAt),
    hold: f.hold
      ? { id: f.hold.id, byId: f.hold.heldById, byName: f.hold.heldByName, forTitle: f.hold.forTitle, forKind: f.hold.forKind ?? 'ORDER', until: isoDay(f.hold.until) }
      : null,
    says,
    may: {
      ask: manager && f.release != null && !isReleaser && !f.moving,
      reserve: manager && !isReleaser && f.hold == null && !f.moving,
      endHold: f.hold != null && (isHolder || isReleaser),
      confirm: isReleaser && f.release != null && !f.release.confirmedAt && !f.moving,
      place: isHolder && !f.moving && (f.release == null || f.release.confirmedAt != null),
    },
  }
}

/** Soonest free first; a tie by name, so two readers see one order. */
export function byFreeDate(a: OurBenchRow, b: OurBenchRow): number {
  return a.freeOn === b.freeOn ? a.name.localeCompare(b.name) : a.freeOn < b.freeOn ? -1 : 1
}

/**
 * Each job request once. A firm that resells a client's job request holds
 * a copy of its own (`mirroredFromId`) beside the one it was sent; the
 * copy is dropped where the original is in the list too, because its own
 * employee goes forward on the original, and the submission door refuses
 * a firm on its own copy.
 */
export function onePerJob<T extends { id: string; mirroredFromId: string | null }>(reqs: T[]): T[] {
  const ids = new Set(reqs.map((r) => r.id))
  return reqs.filter((r) => !(r.mirroredFromId && ids.has(r.mirroredFromId)))
}

/** The thread about one person on Our bench — one per person per firm, inside the firm. */
export function threadTopicId(personId: string): string {
  return `our-bench:${personId}`
}
