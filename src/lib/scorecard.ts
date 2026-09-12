/**
 * What a supplier is actually like to work with.
 *
 * The layer asset. A vendor cannot compute this about themselves — they
 * do not know what the other eleven suppliers did with the same role.
 * A client cannot get it from their vendors either, because every vendor
 * reports their own numbers and every vendor's numbers are excellent.
 *
 * It only exists in the middle, and it is the closest thing this product
 * has to a review score: a supplier with forty placements behind them
 * carries a standing they cannot take anywhere else, and a client with
 * twelve suppliers scored on their own real hires cannot go back to
 * guessing.
 *
 * ── Six numbers, and no seventh ──────────────────────────────────────
 *
 * Every one of these is something a client already tries to know and
 * currently guesses at:
 *
 *   answered        of the roles you sent them, how many they worked
 *   first reply     how long until the first CV arrived
 *   worth reading   how many of theirs got past the screen
 *   hired           how many became a placement
 *   holds them up   the reason their submissions get held back most
 *   asks            where they price inside the band you gave them
 *
 * There is deliberately no overall grade. A single letter would be
 * argued with by every vendor who got a B, would hide which of the six
 * was bad, and would be the number a procurement team optimises rather
 * than the behaviour underneath it.
 *
 * ── Thin data says so ────────────────────────────────────────────────
 *
 * A supplier with two submissions has no percentages, because two out of
 * two is not eighty per cent of anything. Under the threshold the
 * scorecard reports counts and says plainly that it is too early — which
 * is more useful to both sides than a confident number built on nothing.
 *
 * ── The same numbers, both directions ────────────────────────────────
 *
 * The supplier sees their own card, with the same figures the client
 * sees and the one thing the client's view does not need: what to fix.
 * A scorecard a supplier cannot see is a blacklist with better manners.
 */

import type { Reason } from '@/lib/outcomes'

/** Below this many submissions, counts only — no rates. */
export const ENOUGH = 5

/** How far back a scorecard looks. Older than this is a different firm. */
export const WINDOW_DAYS = 365

export interface Sent {
  requirementId: string
  /** When the role was put in front of them. */
  invitedAt: Date
  /** The ceiling they were given, cents per hour. Null where none. */
  bandMaxCents: number | null
  bandMinCents: number | null
  /** Whether they declined outright, which is an answer and a fast one. */
  declined: boolean
}

export interface Put {
  submittedAt: Date
  /** Which role, so the first submission per role can be found. */
  requirementId: string
  rateCents: number | null
  /** The band they were working to on that role. */
  bandMaxCents: number | null
  bandMinCents: number | null
  /** Whether it got past the client's screen. Null = never screened. */
  cleared: boolean | null
  /** Why it was held back, where it was. */
  heldBackFor: string[]
  /** Whether it became a placement. */
  hired: boolean
  /** Why it lost, where the client said. */
  reason: Reason | null
}

export interface Figure {
  /** The number itself, or null where there is not enough to say. */
  value: number | null
  /** What it is counted out of. Always shown, even when value is null. */
  of: number
  /** In words, for somebody who will not read a percentage. */
  says: string
}

export interface Scorecard {
  vendorName: string
  /** Roles put in front of them in the window. */
  sent: number
  /** Submissions received in the window. */
  received: number
  answered: Figure
  firstReplyHours: Figure
  worthReading: Figure
  hired: Figure
  /** What holds their submissions up most, and how often. */
  holdsThemUp: { code: string; count: number; says: string } | null
  /** Where they price inside the band, 0 = floor, 100 = ceiling. */
  asks: Figure
  /** Whether there is enough here to say anything at all. */
  enough: boolean
  /** The sentence at the top. */
  summary: string
  /** What this cannot account for. Never omitted when it applies. */
  unknowns: string[]
}

/**
 * One supplier's card.
 *
 * `sent` and `put` are already scoped to this client and this supplier
 * by the caller. Nothing here reaches across a company boundary, because
 * the numbers that make this useful are exactly the numbers that must
 * never be shown to a rival.
 */
export function scorecard(
  vendorName: string,
  sent: Sent[],
  put: Put[],
  now: Date
): Scorecard {
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000)
  const roles = sent.filter((s) => s.invitedAt >= since)
  const subs = put.filter((p) => p.submittedAt >= since)

  const enough = subs.length >= ENOUGH
  const unknowns: string[] = []

  // ── Did they work it at all ─────────────────────────────────────────
  //
  // A decline counts as answered. A supplier who says "nobody at that
  // rate" within the hour is more use than one who says nothing for a
  // fortnight, and scoring them the same teaches silence.
  const reallyAnswered = countAnswered(roles, subs)

  const answered: Figure = {
    value: roles.length === 0 ? null : Math.round((reallyAnswered / roles.length) * 100),
    of: roles.length,
    says:
      roles.length === 0
        ? 'You have not sent them anything yet.'
        : reallyAnswered === roles.length
          ? `Answered all ${roles.length}.`
          : `Answered ${reallyAnswered} of the ${roles.length} you sent.`,
  }

  // ── How fast the first one came ─────────────────────────────────────
  const gaps = firstReplyGaps(roles, subs)
  const median = gaps.length ? middle(gaps) : null

  const firstReplyHours: Figure = {
    value: median,
    of: gaps.length,
    says:
      median == null
        ? 'They have not sent anything yet.'
        : median < 24
          ? `First CV usually inside a day — about ${Math.round(median)} hours.`
          : `First CV usually takes about ${Math.round(median / 24)} days.`,
  }

  // ── How many were worth reading ─────────────────────────────────────
  const screened = subs.filter((p) => p.cleared !== null)
  const clean = screened.filter((p) => p.cleared).length

  const worthReading: Figure = {
    value: screened.length >= ENOUGH ? Math.round((clean / screened.length) * 100) : null,
    of: screened.length,
    says:
      screened.length === 0
        ? 'None of theirs has been screened yet.'
        : screened.length < ENOUGH
          ? `${clean} of ${screened.length} got through. Too few to put a number on.`
          : `${Math.round((clean / screened.length) * 100)}% of theirs are worth reading.`,
  }

  if (screened.length > 0 && screened.length < subs.length) {
    unknowns.push(
      `${subs.length - screened.length} of their submissions have never been screened.`
    )
  }

  // ── How many became work ────────────────────────────────────────────
  const placed = subs.filter((p) => p.hired).length

  const hired: Figure = {
    value: enough ? Math.round((placed / subs.length) * 100) : null,
    of: subs.length,
    says:
      subs.length === 0
        ? 'Nothing from them yet.'
        : placed === 0
          ? `None of their ${subs.length} has been hired.`
          : `${placed} of ${subs.length} hired.`,
  }

  // ── What holds them up ──────────────────────────────────────────────
  //
  // The actionable one, and the reason a supplier should be shown their
  // own card. "Sixty per cent" tells them nothing. "Your rate is over
  // the band on half of them" tells them what to do on Monday.
  const held = new Map<string, number>()
  for (const p of subs) for (const code of p.heldBackFor) held.set(code, (held.get(code) ?? 0) + 1)

  const worst = [...held.entries()].sort((a, b) => b[1] - a[1])[0] ?? null
  const holdsThemUp = worst
    ? { code: worst[0], count: worst[1], says: heldSays(worst[0], worst[1], subs.length) }
    : null

  // ── Where they price ────────────────────────────────────────────────
  const positions = subs
    .filter((p) => p.rateCents != null && p.bandMaxCents != null && p.bandMinCents != null)
    .filter((p) => p.bandMaxCents! > p.bandMinCents!)
    .map((p) => ((p.rateCents! - p.bandMinCents!) / (p.bandMaxCents! - p.bandMinCents!)) * 100)

  const where = positions.length >= ENOUGH ? Math.round(middle(positions)) : null

  const asks: Figure = {
    value: where,
    of: positions.length,
    says:
      where == null
        ? positions.length === 0
          ? 'No band on the roles you sent them, so there is nothing to compare.'
          : `Only ${positions.length} priced against a band. Too few to say.`
        : where > 100
          ? 'They usually ask above the band you give them.'
          : where >= 75
            ? 'They price near the top of your band.'
            : where <= 25
              ? 'They price near the bottom of your band.'
              : 'They price around the middle of your band.',
  }

  if (!enough) {
    unknowns.push(
      `Only ${subs.length} submission${subs.length === 1 ? '' : 's'} so far. ` +
        `Percentages start at ${ENOUGH}.`
    )
  }

  return {
    vendorName,
    sent: roles.length,
    received: subs.length,
    answered,
    firstReplyHours,
    worthReading,
    hired,
    holdsThemUp,
    asks,
    enough,
    summary: summarise(vendorName, roles.length, subs, placed, clean, screened.length, enough),
    unknowns,
  }
}

/**
 * The sentence at the top of a card.
 *
 * Written the way somebody would say it out loud, and it never leads
 * with a percentage — a client scanning twelve of these is looking for
 * the two that need a conversation, not for a league table.
 */
export function summarise(
  vendorName: string,
  sent: number,
  subs: Put[],
  placed: number,
  clean: number,
  screened: number,
  enough: boolean
): string {
  if (sent === 0) {
    // A supplier can arrive without being invited — an open role, or a
    // firm working from a forwarded email. "Nothing sent yet" alongside
    // four of their CVs reads as a contradiction, so say the real thing.
    return subs.length === 0
      ? `You have not sent ${vendorName} anything yet.`
      : `You have not sent ${vendorName} a role, and ${subs.length} ` +
        `submission${subs.length === 1 ? '' : 's'} came in anyway.`
  }
  if (subs.length === 0) {
    return `${sent} role${sent === 1 ? '' : 's'} sent, nothing back. Worth asking why.`
  }
  if (!enough) {
    return (
      `${subs.length} submission${subs.length === 1 ? '' : 's'} so far` +
      (placed ? `, ${placed} hired` : '') +
      `. Too early to score them.`
    )
  }

  const rate = screened ? Math.round((clean / screened) * 100) : null
  return (
    `${subs.length} submissions, ${placed} hired` +
    (rate != null ? `, ${rate}% worth reading` : '') +
    '.'
  )
}

/**
 * Ordering twelve suppliers.
 *
 * By hires, then by how many were worth reading, then by how fast they
 * answer. Never by a composite score — a single number would decide
 * which supplier gets the next role, and a supplier who lost a role to a
 * formula nobody can explain will stop sending their best people.
 */
export function order(cards: Scorecard[]): Scorecard[] {
  return [...cards].sort((a, b) => {
    const ha = a.hired.value ?? -1
    const hb = b.hired.value ?? -1
    if (ha !== hb) return hb - ha

    const wa = a.worthReading.value ?? -1
    const wb = b.worthReading.value ?? -1
    if (wa !== wb) return wb - wa

    const fa = a.firstReplyHours.value ?? Number.MAX_SAFE_INTEGER
    const fb = b.firstReplyHours.value ?? Number.MAX_SAFE_INTEGER
    return fa - fb
  })
}

/**
 * What a supplier should do about their own card.
 *
 * The half a client's view does not need and a supplier cannot work
 * without. A scorecard somebody cannot see, and cannot act on, is a
 * blacklist with better manners.
 */
export function whatToFix(card: Scorecard): string[] {
  const out: string[] = []

  if (card.sent > 0 && card.received === 0) {
    out.push('They have sent you roles and had nothing back. Even a decline is worth sending.')
    return out
  }

  if (card.answered.value != null && card.answered.value < 60) {
    out.push(
      `You answer ${card.answered.value}% of what they send. Declining fast counts as answering — silence does not.`
    )
  }

  if (card.firstReplyHours.value != null && card.firstReplyHours.value > 48) {
    out.push(
      `Your first CV takes about ${Math.round(card.firstReplyHours.value / 24)} days. Most roles are decided in the first week.`
    )
  }

  if (card.holdsThemUp) out.push(card.holdsThemUp.says)

  if (card.asks.value != null && card.asks.value >= 90) {
    out.push('You price at the very top of their band. It is costing you the ones you nearly won.')
  }

  if (out.length === 0) {
    out.push(
      card.enough
        ? 'Nothing obvious to fix. Keep sending.'
        : 'Not enough here yet to tell you anything useful.'
    )
  }

  return out
}

// ── Small readers ─────────────────────────────────────────────────────

/** Roles they either submitted for or declined. */
function countAnswered(roles: Sent[], subs: Put[]): number {
  const worked = new Set(subs.map((p) => p.requirementId))
  let n = 0
  for (const r of roles) if (r.declined) n++
  // Declines and submissions are counted from different sides, so a role
  // both declined and submitted for would count twice. In practice one
  // rules out the other, and the min guards the arithmetic rather than
  // the behaviour.
  return Math.min(roles.length, n + worked.size)
}

/** Hours from each invitation to that supplier's first CV on it. */
function firstReplyGaps(roles: Sent[], subs: Put[]): number[] {
  const firstOn = new Map<string, Date>()
  for (const p of subs) {
    const had = firstOn.get(p.requirementId)
    if (!had || p.submittedAt < had) firstOn.set(p.requirementId, p.submittedAt)
  }

  const out: number[] = []
  for (const [requirementId, at] of firstOn) {
    const from = roles.find((r) => r.requirementId === requirementId)?.invitedAt
    if (!from) continue
    const hours = (at.getTime() - from.getTime()) / 3_600_000
    if (hours >= 0) out.push(hours)
  }
  return out
}

/** The middle value. Even counts take the lower of the two. */
export function middle(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor((s.length - 1) / 2)]
}

function heldSays(code: string, count: number, total: number): string {
  const many = count > 1
  switch (code) {
    case 'IN_BUDGET':
      return `${count} of their ${total} came in over the band. That is the thing to fix first.`
    case 'ALREADY_SUBMITTED':
      return `${count} ${many ? 'were' : 'was'} somebody else's submission first. They are slow, not wrong.`
    case 'WORK_AUTH':
      return `${count} came without a work permit recorded. One field, and it holds up the whole submission.`
    case 'CAN_START':
      return `${count} could not start when the role needed somebody.`
    case 'GOVERNANCE':
      return `${count} hit a tenure or break-in-service limit. Nothing they can do about those.`
    case 'NOT_BARRED':
      return `${count} ${many ? 'were people' : 'was somebody'} the client has asked not to see again.`
    case 'VENDOR_ENGAGED':
      return `${count} came in on roles nobody invited them to.`
    case 'SKILLS_EVIDENCED':
      return `${count} claimed skills the CV does not back up.`
    default:
      return `${count} held back on ${code.toLowerCase().replace(/_/g, ' ')}.`
  }
}
