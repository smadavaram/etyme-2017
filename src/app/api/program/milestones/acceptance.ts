/**
 * A deliverable submitted for acceptance, and what happens next.
 *
 * ── The thing this is about ──────────────────────────────────────────
 *
 * A milestone falls due because somebody accepted a thing, never because
 * a date passed. `billing-plan.ts` already refuses to bill an unaccepted
 * milestone however late it is. What was missing was the step in front of
 * that: somebody saying "here it is", and somebody else saying yes or no.
 *
 * Without it, `acceptedAt` was a column nothing wrote to. A column with no
 * flow behind it is not a feature.
 *
 * ── The gap is the number ────────────────────────────────────────────
 *
 * Delivered on the 3rd, accepted on the 27th, invoiced on the 30th, paid
 * on the 60th. The twenty-four days between delivery and acceptance are
 * invisible in every ageing report ever built, because ageing starts at
 * the invoice — and the invoice could not exist until the 27th. On a
 * milestone-billed project that gap is most of the working capital, and
 * nobody can see it.
 *
 * ── What is honestly not here ────────────────────────────────────────
 *
 * `OrderMilestone` has no `deliveredAt`. The arithmetic below computes
 * the gap correctly from two dates and is tested against real ones; the
 * database adapter passes null for the delivery date because there is
 * nowhere to read it from. So the gap comes back null with the reason
 * said out loud, rather than substituting `createdAt` — which would date
 * every delivery to when somebody typed the milestone in, and quietly
 * report a two-month gap on work delivered yesterday.
 *
 * The columns needed are named at the bottom of this file.
 */

// ── Where a milestone can be ──────────────────────────────────────────

/**
 * PENDING   nobody has said it is done
 * DELIVERED said to be done, waiting on the client
 * ACCEPTED  the client agreed — billable from here
 * REJECTED  the client did not agree, with a reason
 * INVOICED  billed, and out of this flow
 * CANCELLED dropped from the order
 */
export type MilestoneStatus =
  | 'PENDING'
  | 'DELIVERED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'INVOICED'
  | 'CANCELLED'

export interface Milestone {
  id: string
  name: string
  amountCents: number
  dueOn: Date | null
  /** Set once, when the client agrees. What makes it billable. */
  acceptedAt: Date | null
  /**
   * When somebody said it was done. Not stored anywhere yet — see the note
   * at the top. Every caller inside this repo passes null today.
   */
  deliveredAt: Date | null
  status: string
}

// ── Why a client said no ──────────────────────────────────────────────

/**
 * A closed list, for the same reason submission rejections are one.
 *
 * "The client rejected milestone three" tells a delivery manager to email
 * somebody. "Rejected on evidence, fourth time this quarter at this
 * client" tells them their acceptance pack is the problem, not their work.
 * That second sentence is only possible if the answer came off a button.
 */
export type RejectionReason =
  /** Part of what was agreed is not there. */
  | 'SCOPE_INCOMPLETE'
  /** It is all there and it is not good enough. */
  | 'QUALITY'
  /** They cannot tell whether it is done — no test results, no sign-off. */
  | 'EVIDENCE_MISSING'
  /** Delivered after the date it was needed for. */
  | 'LATE'
  /** They agree it is done and disagree about what it is worth. */
  | 'DISPUTED_AMOUNT'
  /** Overtaken — the scope changed and this milestone no longer applies. */
  | 'SUPERSEDED'

export const REJECTION_REASONS: { code: RejectionReason; label: string; hint: string }[] = [
  { code: 'SCOPE_INCOMPLETE', label: 'Scope incomplete', hint: 'Part of what was agreed is not there' },
  { code: 'QUALITY', label: 'Quality', hint: 'It is all there and not good enough' },
  { code: 'EVIDENCE_MISSING', label: 'No evidence', hint: 'Nothing shows it is actually done' },
  { code: 'LATE', label: 'Late', hint: 'Delivered after it was needed' },
  { code: 'DISPUTED_AMOUNT', label: 'Amount disputed', hint: 'Done, and not worth this' },
  { code: 'SUPERSEDED', label: 'Superseded', hint: 'The scope changed and this no longer applies' },
]

export function isRejectionReason(value: string): value is RejectionReason {
  return REJECTION_REASONS.some((r) => r.code === value)
}

// ── Who may do what ───────────────────────────────────────────────────

/**
 * The two sides of a milestone, and neither may play the other's part.
 *
 * The same shape as the timesheet chain, and for the same reason: an
 * acceptance recorded by the firm that did the work is not an acceptance,
 * it is an assertion. The whole value of `acceptedAt` is that somebody on
 * the other side of the money put their name to it, and a system that
 * lets the seller click it has a column that means nothing.
 *
 * The client side is deliberately plural. A large client signs in one
 * entity, is billed through a shared service centre in another and pays
 * from a third; any of them agreeing that the work was delivered is the
 * client agreeing.
 */
export interface Sides {
  /** The firm doing the work and raising the order. */
  sellerCompanyId: string
  /** Sold-to, bill-to and payer. Any of them is the buying side. */
  clientCompanyIds: string[]
}

export function mayDeliverAs(viewerCompanyId: string | null, sides: Sides): Move {
  if (viewerCompanyId && viewerCompanyId === sides.sellerCompanyId) {
    return { ok: true, says: 'Yours to hand over.' }
  }
  return {
    ok: false,
    says: 'Only the firm doing the work can say it is done.',
  }
}

export function mayDecideAs(viewerCompanyId: string | null, sides: Sides): Move {
  if (viewerCompanyId && sides.clientCompanyIds.includes(viewerCompanyId)) {
    return { ok: true, says: 'Yours to accept or reject.' }
  }
  if (viewerCompanyId === sides.sellerCompanyId) {
    return {
      ok: false,
      says:
        'Acceptance is the client agreeing, not you recording that they did. ' +
        'An acceptance signed by the seller is worth nothing when somebody asks what was paid for.',
    }
  }
  return { ok: false, says: 'You are not a party to this order.' }
}

// ── What may happen ───────────────────────────────────────────────────

export interface Move {
  ok: boolean
  /** The status to write, where the move is allowed. */
  status?: MilestoneStatus
  says: string
}

/**
 * Submitting a deliverable for acceptance.
 *
 * Refused when it is already with the client, because a second submission
 * resets nothing and hides how long the first one has been waiting — which
 * is the one number this whole flow exists to produce.
 */
export function mayDeliver(m: Milestone): Move {
  switch (m.status) {
    case 'CANCELLED':
      return { ok: false, says: `${m.name} was cancelled. Nothing to deliver.` }
    case 'INVOICED':
      return { ok: false, says: `${m.name} has already been invoiced.` }
    case 'ACCEPTED':
      return { ok: false, says: `${m.name} was already accepted.` }
    case 'DELIVERED':
      return { ok: false, says: `${m.name} is already with the client, waiting on their answer.` }
    default:
      return { ok: true, status: 'DELIVERED', says: `${m.name} submitted for acceptance.` }
  }
}

/**
 * The client's answer.
 *
 * Only on something delivered. Accepting a milestone nobody submitted is
 * how a project ends up billed for work that was never handed over, and
 * the client's own record of the handover is the only defence there is
 * when they ask what they paid for.
 *
 * A rejection needs a code. There is no path through here that records a
 * no without one.
 */
export function mayDecide(
  m: Milestone,
  decision: { accept: boolean; reason?: string | null }
): Move {
  switch (m.status) {
    case 'CANCELLED':
      return { ok: false, says: `${m.name} was cancelled.` }
    case 'INVOICED':
      return { ok: false, says: `${m.name} has already been invoiced.` }
    case 'ACCEPTED':
      return { ok: false, says: `${m.name} was already accepted. Reversing that is a credit note, not a rejection.` }
    case 'DELIVERED':
      break
    default:
      return {
        ok: false,
        says: `${m.name} has not been submitted for acceptance yet. There is nothing to accept or reject.`,
      }
  }

  if (decision.accept) {
    return { ok: true, status: 'ACCEPTED', says: `${m.name} accepted. Billable from today.` }
  }

  if (!decision.reason) {
    return {
      ok: false,
      says: 'Say why. A rejection with no reason is a state change carrying no information.',
    }
  }

  if (!isRejectionReason(decision.reason)) {
    return { ok: false, says: `"${decision.reason}" is not one of the reasons.` }
  }

  const label = REJECTION_REASONS.find((r) => r.code === decision.reason)!.label
  return { ok: true, status: 'REJECTED', says: `${m.name} rejected — ${label.toLowerCase()}.` }
}

// ── The gap ───────────────────────────────────────────────────────────

export interface Gap {
  /** Whole days from delivery to acceptance. Null when it is not knowable. */
  days: number | null
  /** Named, so nobody reads a null as a zero. */
  unknowns: string[]
  says: string
}

/**
 * How long the client sat on it.
 *
 * Counted in whole days, from the day it was delivered to the day it was
 * accepted. Where it has been delivered and not yet answered, the count
 * runs to today and keeps growing — a milestone waiting three weeks should
 * read as three weeks, not as nothing.
 */
export function acceptanceGap(m: Milestone, now: Date): Gap {
  if (m.status === 'CANCELLED') {
    return { days: null, unknowns: [], says: `${m.name} was cancelled.` }
  }

  if (!m.deliveredAt) {
    // Deliberately not falling back to createdAt. See the note at the top.
    const unknowns =
      m.status === 'DELIVERED' || m.status === 'ACCEPTED' || m.status === 'INVOICED'
        ? ['No delivery date is stored, so the wait cannot be measured.']
        : []
    return {
      days: null,
      unknowns,
      says:
        unknowns.length > 0
          ? `${m.name} was handed over and nothing recorded when, so the wait cannot be counted.`
          : `${m.name} has not been handed over.`,
    }
  }

  const end = m.acceptedAt ?? now
  const days = wholeDays(m.deliveredAt, end)

  if (m.acceptedAt) {
    return {
      days,
      unknowns: [],
      says: `${m.name} waited ${days} ${days === 1 ? 'day' : 'days'} for acceptance.`,
    }
  }

  return {
    days,
    unknowns: [],
    says: `${m.name} has been with the client ${days} ${days === 1 ? 'day' : 'days'}.`,
  }
}

function wholeDays(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime()
  // Negative means somebody backdated an acceptance behind the delivery.
  // Zero rather than a negative wait: the data is wrong, and a minus sign
  // in a "days waiting" column reads as a system fault rather than a typo.
  return ms <= 0 ? 0 : Math.floor(ms / 86_400_000)
}

// ── Where the money is sitting ────────────────────────────────────────

export interface Standing {
  /** Handed over, waiting on the client. Cash we cannot invoice yet. */
  awaitingAcceptanceCents: number
  awaitingCount: number
  /** Nobody has handed it over. Ours to finish, not theirs to sign. */
  notDeliveredCents: number
  notDeliveredCount: number
  /** Accepted and not yet invoiced. Billable now. */
  billableCents: number
  billableCount: number
  /** Rejected and waiting on us to fix. */
  rejectedCents: number
  rejectedCount: number
  /**
   * Average days waiting across everything delivered and unanswered.
   * Null where no delivery date is stored for any of them — which is
   * every one of them, today.
   */
  averageWaitDays: number | null
  says: string
}

/**
 * The one screen a delivery manager needs.
 *
 * The split that matters is between money waiting on the client and money
 * waiting on us. They look identical on a milestone report — both are
 * unbilled — and they are completely different problems.
 */
export function standing(milestones: Milestone[], now: Date): Standing {
  let awaiting = 0, awaitingCount = 0
  let notDelivered = 0, notDeliveredCount = 0
  let billable = 0, billableCount = 0
  let rejected = 0, rejectedCount = 0

  const waits: number[] = []

  for (const m of milestones) {
    if (m.status === 'CANCELLED' || m.status === 'INVOICED') continue

    if (m.acceptedAt) {
      billable += m.amountCents
      billableCount++
      continue
    }

    if (m.status === 'DELIVERED') {
      awaiting += m.amountCents
      awaitingCount++
      const g = acceptanceGap(m, now)
      if (g.days != null) waits.push(g.days)
      continue
    }

    if (m.status === 'REJECTED') {
      rejected += m.amountCents
      rejectedCount++
      continue
    }

    notDelivered += m.amountCents
    notDeliveredCount++
  }

  const averageWaitDays =
    waits.length === 0 ? null : Math.round(waits.reduce((a, b) => a + b, 0) / waits.length)

  return {
    awaitingAcceptanceCents: awaiting,
    awaitingCount,
    notDeliveredCents: notDelivered,
    notDeliveredCount,
    billableCents: billable,
    billableCount,
    rejectedCents: rejected,
    rejectedCount,
    averageWaitDays,
    says: standingSays(awaiting, awaitingCount, notDelivered, notDeliveredCount, billable, averageWaitDays),
  }
}

function standingSays(
  awaiting: number,
  awaitingCount: number,
  notDelivered: number,
  notDeliveredCount: number,
  billable: number,
  averageWaitDays: number | null
): string {
  const m = (c: number) => `$${Math.round(c / 100).toLocaleString('en-US')}`
  const parts: string[] = []

  if (billable > 0) parts.push(`${m(billable)} accepted and ready to invoice.`)

  if (awaitingCount > 0) {
    parts.push(
      averageWaitDays == null
        ? `${m(awaiting)} handed over and waiting on the client, for a length of time nothing records.`
        : `${m(awaiting)} handed over and waiting on the client, ${averageWaitDays} days on average.`
    )
  }

  if (notDeliveredCount > 0) {
    parts.push(`${m(notDelivered)} across ${notDeliveredCount} nobody has handed over yet.`)
  }

  return parts.length === 0 ? 'Nothing outstanding on this order.' : parts.join(' ')
}

/**
 * Whether a milestone is late, and on whose side.
 *
 * Past its date and not handed over is ours. Handed over and unanswered is
 * theirs. The distinction is the difference between a delivery problem and
 * a governance problem, and both are called "overdue" everywhere else.
 */
export function lateness(
  m: Milestone,
  now: Date
): { late: boolean; onUs: boolean; days: number | null; says: string } {
  if (!m.dueOn || m.status === 'CANCELLED' || m.status === 'INVOICED' || m.acceptedAt) {
    return { late: false, onUs: false, days: null, says: '' }
  }

  if (m.dueOn.getTime() >= now.getTime()) {
    return { late: false, onUs: false, days: null, says: '' }
  }

  const days = wholeDays(m.dueOn, now)
  const onUs = m.status !== 'DELIVERED'

  return {
    late: true,
    onUs,
    days,
    says: onUs
      ? `${m.name} was due ${days} ${days === 1 ? 'day' : 'days'} ago and nobody has handed it over.`
      : `${m.name} was due ${days} ${days === 1 ? 'day' : 'days'} ago and is sitting with the client.`,
  }
}

// ── A stopgap, named as one ───────────────────────────────────────────

/**
 * Where the rejection reason lives until it has a column.
 *
 * `OrderMilestone` has `note`, a free-text field for a human sentence, and
 * nothing structured for the reason code. Dropping the code would break
 * the one rule this domain exists to defend — every outcome carries a
 * reason code — so it is written into `note` behind a machine-readable
 * prefix and read back with a strict parser.
 *
 * This is a shadow column and it is labelled as one. What it needs, on
 * `OrderMilestone`:
 *
 *   deliveredAt      DateTime?   // when it was handed over
 *   deliveredById    String?     // who handed it over
 *   rejectedAt       DateTime?   // when the client said no
 *   rejectionReason  String?     // the code, countable
 *
 * With those four the encoding below is deleted and nothing else changes.
 */
const REJECTION_PREFIX = /^\[REJECTED:([A-Z_]+)\]\s?/

export function encodeRejection(reason: RejectionReason, note: string | null): string {
  return `[REJECTED:${reason}]${note && note.trim() ? ` ${note.trim()}` : ''}`
}

export function decodeRejection(
  note: string | null
): { reason: RejectionReason; note: string | null } | null {
  if (!note) return null
  const match = REJECTION_PREFIX.exec(note)
  if (!match) return null
  if (!isRejectionReason(match[1])) return null
  const rest = note.slice(match[0].length).trim()
  return { reason: match[1], note: rest.length > 0 ? rest : null }
}

/** The human part of a note, with any machine prefix taken off. */
export function humanNote(note: string | null): string | null {
  const decoded = decodeRejection(note)
  if (decoded) return decoded.note
  return note && note.trim().length > 0 ? note : null
}
