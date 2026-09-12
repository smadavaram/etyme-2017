/**
 * What a client checks a submission for when it arrives.
 *
 * The mirror of `checks.ts`. That file asks whether a package is fit to
 * leave a vendor's building; this one asks whether it is worth a hiring
 * manager's afternoon. Same harness, same ledger, same weekly human
 * sample — the other direction of travel.
 *
 * The difference is not cosmetic. A vendor checking its own submission is
 * quality control on its own work and can be argued with. A client
 * screening what arrived is deciding what it will not read, which is the
 * thing being bought:
 *
 *   "The problem was never too few submissions. A hard role gets a
 *    hundred CVs and most are noise. The work isn't finding people —
 *    it's finding the four worth an interview."
 *
 * So a FAIL here does not mean the person is unsuitable. It means the
 * submission does not reach the manager until somebody fixes it, and the
 * vendor is told exactly what. Every hold-back names the vendor's own
 * remedy, because a screen that only says "no" trains vendors to send
 * more, not better.
 *
 * ── Three checks nobody on the supply side can run ───────────────────
 *
 * A vendor cannot see the other three vendors' submissions, cannot see
 * the client's tenure ledger, and cannot see whether the person left
 * badly last time. Those are the checks that only exist from this chair,
 * and they are the reason the demand side is worth building first:
 *
 *   ALREADY_SUBMITTED   the same person, from four vendors, at four rates
 *   GOVERNANCE          tenure cap, break in service — Addendum E blocks
 *   NOT_BARRED          the client's own do-not-submit list
 *
 * ── One thing that is never a failure ────────────────────────────────
 *
 * WORKED_HERE_BEFORE is a PASS that carries information upward. Somebody
 * who has done the job here before, and was not asked not to come back,
 * is the best candidate in the pile and the client usually does not know
 * they are in it.
 */

import type { Finding } from '@/lib/loop'

export type Code =
  /** At or under what this vendor was told they could charge. */
  | 'IN_BUDGET'
  /** Somebody else already put this person forward for this seat. */
  | 'ALREADY_SUBMITTED'
  /** The permit matches what the role requires. */
  | 'WORK_AUTH'
  /** They can start close enough to when the work starts. */
  | 'CAN_START'
  /** This vendor was actually asked, or the role is open to the network. */
  | 'VENDOR_ENGAGED'
  /** Tenure cap, break in service — the legally grounded blocks. */
  | 'GOVERNANCE'
  /** Not on this client's do-not-submit list. */
  | 'NOT_BARRED'
  /** The skills claimed are actually in the CV. The one model judgement. */
  | 'SKILLS_EVIDENCED'
  /** Has done the job here before. Never a failure. */
  | 'WORKED_HERE_BEFORE'

/**
 * Two, not three.
 *
 * A vendor fixing its own package gets three goes because it is fixing
 * its own work. A client waiting on a vendor to fix a submission is
 * waiting on somebody else's inbox, and a third automated round is a week
 * gone. After two it goes to a person.
 */
export const MAX_ATTEMPTS = 2

/** How many names reach the hiring manager unless they ask for more. */
export const SHORTLIST = 4

// ── What is being screened ────────────────────────────────────────────

export interface OtherSubmission {
  vendorName: string
  rateCents: number
  submittedAt: Date
}

export interface Arriving {
  personName: string
  vendorName: string
  /** What this vendor is asking, cents per hour. */
  rateCents: number | null
  /**
   * The ceiling this vendor was given on their own invitation.
   *
   * Null where they were never invited, or where the role carries no
   * band. Preferred over the requirement's budget because it is the
   * number this vendor actually agreed to — and because a band lives on
   * the invitation precisely so no vendor reads another's.
   */
  bandMaxCents: number | null
  /** What the requisition itself is funded to, cents per hour. */
  budgetMaxCents: number | null
  /**
   * The same person, put forward for this same seat by somebody else.
   *
   * Across mirrored requirements and the forward chain, not just this
   * row — the duplicate a client actually suffers from arrives through
   * two different primes, on two different requirement records.
   */
  others: OtherSubmission[]
  submittedAt: Date
  workAuth: string | null
  workAuthRequired: string | null
  availableFrom: Date | null
  startDate: Date | null
  /** Whether this vendor was invited to this role. */
  invited: boolean
  /** Whether anyone may submit, invited or not. */
  openToNetwork: boolean
  /** Whether there is a live agreement with this vendor. */
  msaActive: boolean
  /** Blocks from the governance engine, already evaluated. */
  governance: { outcome: 'PASS' | 'WARN' | 'BLOCK'; summary: string } | null
  /** On the client's do-not-submit list, with the reason if recorded. */
  barred: { at: Date; reason: string | null } | null
  /** Previous assignments at this client that ended normally. */
  workedHereBefore: { months: number; lastEnded: Date } | null
}

// ── The rules ─────────────────────────────────────────────────────────

const DAY = 86_400_000

/** How late a start the buyer will tolerate before it stops being a fit. */
const LATE_TOLERANCE_DAYS = 21

/**
 * Everything arithmetic can settle, settled — from the buyer's chair.
 *
 * Ordered by what the reader can act on. The two hard stops first
 * (barred, governance), then the duplicate, then the ones a vendor can
 * fix in ten minutes.
 */
export function screenRules(a: Arriving, now: Date): Finding[] {
  const out: Finding[] = []

  // ── Barred ──
  //
  // First, because nothing after it matters. Somebody the client has
  // asked not to see should not generate five more lines of analysis.
  if (a.barred) {
    out.push({
      code: 'NOT_BARRED',
      checker: 'RULE',
      verdict: 'FAIL',
      reason: a.barred.reason
        ? `${a.personName} is on your do-not-submit list: ${sentence(a.barred.reason)} Held back.`
        : `${a.personName} is on your do-not-submit list. Held back.`,
      evidence: `Added ${a.barred.at.toISOString().slice(0, 10)}.`,
    })
  } else {
    out.push({
      code: 'NOT_BARRED',
      checker: 'RULE',
      verdict: 'PASS',
      reason: 'Not on your do-not-submit list.',
    })
  }

  // ── Governance ──
  //
  // Addendum E: BLOCK where legally grounded, WARN and proceed
  // everywhere else, never silently permit. A WARN reaches the manager
  // with the warning attached rather than being hidden from them.
  if (a.governance == null) {
    out.push({
      code: 'GOVERNANCE',
      checker: 'RULE',
      verdict: 'PASS',
      reason: 'No governance rules set for this client.',
    })
  } else if (a.governance.outcome === 'BLOCK') {
    out.push({
      code: 'GOVERNANCE',
      checker: 'RULE',
      verdict: 'FAIL',
      reason: `Blocked: ${a.governance.summary}`,
      evidence: 'Tenure and break-in-service are legal limits, not preferences. This one cannot be overridden here.',
    })
  } else if (a.governance.outcome === 'WARN') {
    out.push({
      code: 'GOVERNANCE',
      checker: 'RULE',
      verdict: 'PASS',
      reason: `Goes through with a warning: ${a.governance.summary}`,
    })
  } else {
    out.push({
      code: 'GOVERNANCE',
      checker: 'RULE',
      verdict: 'PASS',
      reason: 'Clears your governance rules.',
    })
  }

  // ── The duplicate ──
  //
  // First submitted wins. Not the cheapest — the cheapest is knowable
  // only after the fact, and a rule that rewards undercutting a rival's
  // live submission teaches vendors to watch each other rather than to
  // move quickly.
  //
  // The rates are shown anyway. A client seeing the same person at $78
  // and $96 has learned something worth more than the submission.
  const earlier = a.others.filter((o) => o.submittedAt <= a.submittedAt)
  if (earlier.length > 0) {
    const first = earlier.reduce((a, b) => (a.submittedAt <= b.submittedAt ? a : b))
    out.push({
      code: 'ALREADY_SUBMITTED',
      checker: 'RULE',
      verdict: 'FAIL',
      reason:
        `${a.personName} was already put forward for this by ${first.vendorName} on ` +
        `${first.submittedAt.toISOString().slice(0, 10)}. First in wins, so this one is held back.`,
      evidence: rateSpread(a, earlier),
    })
  } else if (a.others.length > 0) {
    // Later arrivals exist but this one got here first. Worth saying,
    // because it is the same fact from the winning side and it is how a
    // client learns what the person actually costs.
    out.push({
      code: 'ALREADY_SUBMITTED',
      checker: 'RULE',
      verdict: 'PASS',
      reason: `First in. ${a.others.length} other vendor${a.others.length === 1 ? '' : 's'} sent the same person later.`,
      evidence: rateSpread(a, a.others),
    })
  } else {
    out.push({
      code: 'ALREADY_SUBMITTED',
      checker: 'RULE',
      verdict: 'PASS',
      reason: 'Only vendor to put this person forward.',
    })
  }

  // ── Is this vendor even engaged ──
  if (a.openToNetwork || a.invited) {
    out.push({
      code: 'VENDOR_ENGAGED',
      checker: 'RULE',
      verdict: 'PASS',
      reason: a.invited ? `${a.vendorName} was invited to this role.` : 'This role is open to the network.',
    })
  } else if (a.msaActive) {
    // An agreement without an invitation. Not noise — a supplier you
    // already work with spotted a role you did not send them.
    out.push({
      code: 'VENDOR_ENGAGED',
      checker: 'RULE',
      verdict: 'PASS',
      reason: `${a.vendorName} was not invited to this one, but you have an agreement with them.`,
    })
  } else {
    out.push({
      code: 'VENDOR_ENGAGED',
      checker: 'RULE',
      verdict: 'FAIL',
      reason:
        `${a.vendorName} was not invited to this role and there is no agreement with them on file. ` +
        `Held back until somebody decides to work with them.`,
    })
  }

  // ── The rate ──
  //
  // Against the band this vendor was given, where they were given one.
  // The requisition's own budget is the fallback, and the wording says
  // which was used — a vendor told "over budget" when they are inside
  // the band they signed will argue, and be right.
  const ceiling = a.bandMaxCents ?? a.budgetMaxCents
  const against = a.bandMaxCents != null ? 'the band you gave them' : 'the budget on this role'

  if (a.rateCents == null) {
    out.push({
      code: 'IN_BUDGET',
      checker: 'RULE',
      verdict: 'FAIL',
      reason: `${a.vendorName} sent no rate. Ask them for one before this goes any further.`,
    })
  } else if (ceiling == null) {
    out.push({
      code: 'IN_BUDGET',
      checker: 'RULE',
      verdict: 'PASS',
      reason: `Asking ${hourly(a.rateCents)}. No ceiling set on this role, so nothing to check it against.`,
    })
  } else if (a.rateCents > ceiling) {
    out.push({
      code: 'IN_BUDGET',
      checker: 'RULE',
      verdict: 'FAIL',
      reason:
        `${hourly(a.rateCents)} is ${hourly(a.rateCents - ceiling)} over ${against}. ` +
        `Held back — ask ${a.vendorName} to come to ${hourly(ceiling)} or say why it is worth more.`,
      evidence: `Ceiling ${hourly(ceiling)}, asking ${hourly(a.rateCents)}.`,
    })
  } else {
    out.push({
      code: 'IN_BUDGET',
      checker: 'RULE',
      verdict: 'PASS',
      reason:
        a.rateCents === ceiling
          ? `Asking ${hourly(a.rateCents)}, exactly ${against}.`
          : `Asking ${hourly(a.rateCents)}, ${hourly(ceiling - a.rateCents)} under ${against}.`,
    })
  }

  // ── The permit ──
  if (a.workAuthRequired == null) {
    out.push({
      code: 'WORK_AUTH',
      checker: 'RULE',
      verdict: 'PASS',
      reason: 'This role does not name a work authorisation.',
    })
  } else if (a.workAuth == null) {
    out.push({
      code: 'WORK_AUTH',
      checker: 'RULE',
      verdict: 'FAIL',
      reason:
        `This role needs ${a.workAuthRequired} and ${a.vendorName} has not said what ${a.personName} holds. ` +
        `Ask them before an interview is booked.`,
    })
  } else if (a.workAuth !== a.workAuthRequired) {
    out.push({
      code: 'WORK_AUTH',
      checker: 'RULE',
      verdict: 'FAIL',
      reason: `This role needs ${a.workAuthRequired}; ${a.personName} holds ${a.workAuth}. Held back.`,
    })
  } else {
    out.push({
      code: 'WORK_AUTH',
      checker: 'RULE',
      verdict: 'PASS',
      reason: `Holds ${a.workAuth}, which is what the role needs.`,
    })
  }

  // ── When they can start ──
  if (a.availableFrom == null || a.startDate == null) {
    out.push({
      code: 'CAN_START',
      checker: 'RULE',
      verdict: 'PASS',
      reason: 'No start date on one side or the other, so nothing to compare.',
    })
  } else {
    const lateDays = Math.round((a.availableFrom.getTime() - a.startDate.getTime()) / DAY)
    if (lateDays <= 0) {
      out.push({
        code: 'CAN_START',
        checker: 'RULE',
        verdict: 'PASS',
        reason: 'Free before the work starts.',
      })
    } else if (lateDays <= LATE_TOLERANCE_DAYS) {
      out.push({
        code: 'CAN_START',
        checker: 'RULE',
        verdict: 'PASS',
        reason: `Free ${lateDays} day${lateDays === 1 ? '' : 's'} after you wanted to start. Usually workable.`,
      })
    } else {
      out.push({
        code: 'CAN_START',
        checker: 'RULE',
        verdict: 'FAIL',
        reason:
          `Not free for another ${lateDays} days, and you wanted somebody on ` +
          `${a.startDate.toISOString().slice(0, 10)}. Held back unless the date has moved.`,
      })
    }
  }

  // ── Worked here before ──
  //
  // Never a failure, and deliberately last so it reads as the note it is.
  // The tenure ledger is the only place this is knowable: twelve months
  // through one vendor and twelve through another is one person with two
  // years here, and the hiring manager has usually forgotten them.
  if (a.workedHereBefore) {
    const { months, lastEnded } = a.workedHereBefore
    out.push({
      code: 'WORKED_HERE_BEFORE',
      checker: 'RULE',
      verdict: 'PASS',
      reason:
        `${a.personName} has worked here before — ${months} month${months === 1 ? '' : 's'}, ` +
        `finishing ${lastEnded.toISOString().slice(0, 10)}.`,
      evidence: 'Counted across every vendor and every assignment, not just this one.',
    })
  }

  return out
}

// ── The shortlist ─────────────────────────────────────────────────────

export interface Screened {
  submissionId: string
  personName: string
  vendorName: string
  rateCents: number | null
  submittedAt: Date
  /** Whether it cleared the screen. */
  cleared: boolean
  /** Why it did not, where it did not. */
  heldBackFor: Finding[]
  /**
   * What passed but is still worth saying out loud.
   *
   * A screen that only ever speaks to refuse is a filter. The three
   * things worth surfacing on a candidate who cleared are the ones
   * nobody in the building knows: that they have worked here before,
   * that three other vendors sent them and at what prices, and that a
   * governance rule warned rather than blocked.
   */
  notes: Finding[]
  /**
   * The match score, where one has been computed.
   *
   * Null is honest and common. Ranking silently on zero would put every
   * unscored candidate last and nobody would ever find out why.
   */
  score: number | null
}

export interface Shortlist {
  /** What reaches the hiring manager, best first. */
  show: Screened[]
  /** Cleared, but past the cut. */
  more: Screened[]
  /** Did not clear, with the reasons. */
  heldBack: Screened[]
  /** How the ordering was arrived at, in words. */
  orderedBy: string
  summary: string
}

/**
 * Rank what cleared, and say honestly how it was ranked.
 *
 * Where every candidate has a score, that is the order. Where none does,
 * the order is arrival — and the page says so rather than implying a
 * judgement that was never made. A ranking nobody can account for is the
 * thing this product exists to replace.
 */
/**
 * The passing findings a person should still read.
 *
 * Deliberately a short list. Every check that passes could report itself
 * and then nobody reads any of them.
 */
export const WORTH_SAYING: string[] = [
  'WORKED_HERE_BEFORE',
  'ALREADY_SUBMITTED',
  'GOVERNANCE',
]

export function notesFrom(passed: Finding[]): Finding[] {
  return passed.filter(
    (f) =>
      WORTH_SAYING.includes(f.code) &&
      // The ordinary passes say "only vendor to put this person forward"
      // and "clears your governance rules", which is noise on every row.
      // Evidence, or a warning, means there is something to read.
      (f.evidence != null || /warning/i.test(f.reason))
  )
}

export function shortlist(all: Screened[], size: number = SHORTLIST): Shortlist {
  const cleared = all.filter((s) => s.cleared)
  const heldBack = all.filter((s) => !s.cleared)

  const scored = cleared.filter((s) => s.score != null).length
  const byScore = scored === cleared.length && cleared.length > 0

  const ordered = [...cleared].sort((x, y) => {
    if (byScore) return (y.score ?? 0) - (x.score ?? 0)
    return x.submittedAt.getTime() - y.submittedAt.getTime()
  })

  const orderedBy = byScore
    ? 'Best fit first, with the evidence behind each score.'
    : scored === 0
      ? 'In the order they arrived — nothing here has been scored yet.'
      : `In the order they arrived. ${scored} of ${cleared.length} have been scored, which is not enough to rank on.`

  return {
    show: ordered.slice(0, size),
    more: ordered.slice(size),
    heldBack,
    orderedBy,
    summary: summarise(all.length, cleared.length, heldBack),
  }
}

/**
 * The sentence at the top of the pile.
 *
 * Leads with what was removed, because that is the work being done. "14
 * arrived, 4 worth reading" is the product in nine words.
 */
export function summarise(arrived: number, cleared: number, heldBack: Screened[]): string {
  if (arrived === 0) return 'Nothing has arrived for this role yet.'
  if (heldBack.length === 0) {
    return `${arrived} arrived, and all of them are worth reading.`
  }

  const why = new Map<string, number>()
  for (const s of heldBack) {
    for (const f of s.heldBackFor) why.set(f.code, (why.get(f.code) ?? 0) + 1)
  }

  const top = [...why.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)
  const reasons = top.map(([code, n]) => `${n} ${plainly(code)}`).join(', ')

  return `${arrived} arrived. ${cleared} worth reading. ${heldBack.length} held back — ${reasons}.`
}

/** The codes as somebody would say them out loud. */
export function plainly(code: string): string {
  switch (code) {
    case 'IN_BUDGET': return 'over budget'
    case 'ALREADY_SUBMITTED': return 'sent by somebody else first'
    case 'WORK_AUTH': return 'wrong or unknown work permit'
    case 'CAN_START': return 'cannot start in time'
    case 'VENDOR_ENGAGED': return 'from a vendor you do not work with'
    case 'GOVERNANCE': return 'blocked on tenure or a break in service'
    case 'NOT_BARRED': return 'on your do-not-submit list'
    case 'SKILLS_EVIDENCED': return 'claims not backed by the CV'
    default: return code.toLowerCase().replace(/_/g, ' ')
  }
}

// ── Small readers ─────────────────────────────────────────────────────

/** Somebody's own note, punctuated once rather than twice. */
function sentence(text: string): string {
  const t = text.trim()
  return /[.!?]$/.test(t) ? t : `${t}.`
}

function hourly(cents: number): string {
  const d = cents / 100
  return `$${Number.isInteger(d) ? d : d.toFixed(2)}`
}

/**
 * The same person, at everybody's price.
 *
 * The one line a client has never been able to see, and the reason the
 * duplicate check is worth more than the duplicate removal.
 */
function rateSpread(a: Arriving, others: OtherSubmission[]): string {
  const all = [
    { vendorName: a.vendorName, rateCents: a.rateCents ?? 0 },
    ...others.map((o) => ({ vendorName: o.vendorName, rateCents: o.rateCents })),
  ].sort((x, y) => x.rateCents - y.rateCents)

  return `Same person, ${all.length} rates: ` + all.map((o) => `${o.vendorName} ${hourly(o.rateCents)}`).join(' · ')
}
