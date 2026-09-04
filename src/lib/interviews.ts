/**
 * Interviews, and the three people who have to agree one is happening.
 *
 * The last thing in this product that a buyer would call missing rather
 * than under-reported. Everything else — timesheets, invoices, tenure,
 * governance — exists. A staffing system with nowhere to record two
 * rounds and a decision is not a staffing system.
 *
 * ── Why three parties and not two ────────────────────────────────────
 *
 * Every ATS treats an interview as a thing a client books. In contract
 * staffing it is not: the client proposes, the vendor has to know their
 * consultant is free and still interested, and the consultant has to
 * actually turn up. Three diaries, and the one that breaks is almost
 * never the client's.
 *
 * So nothing is confirmed until all three have said so, and the screen
 * always names who it is waiting on. "Pending" tells a coordinator
 * nothing. "Waiting on Cloudepa since Tuesday" tells them who to ring.
 *
 * ── The consultant who cannot confirm ────────────────────────────────
 *
 * Plenty of consultants have no seat here and never will. The vendor
 * confirms on their behalf and it is recorded as exactly that —
 * `VENDOR_ASSERTED`, the same convention as the right to represent.
 * Writing it as though the consultant had replied would make the
 * no-show record a liar, and the no-show record is the point.
 *
 * ── Why the no-show matters more than it looks ───────────────────────
 *
 * A consultant who does not turn up costs a hiring manager an hour and
 * a supplier a relationship. Today nobody can prove it happened: the
 * vendor says the client cancelled, the client says nobody came. Both
 * are in the same room here, and it is recorded against whoever did not
 * turn up — which is a thing only the layer between them can hold.
 */

/** Where an interview has got to. */
export type State =
  /** Slots offered, not everybody has agreed. */
  | 'PROPOSED'
  /** All three said yes. It is in three diaries. */
  | 'CONFIRMED'
  /** It happened. */
  | 'DONE'
  /** Somebody did not turn up. */
  | 'NO_SHOW'
  /** Called off before it happened. */
  | 'CANCELLED'

export type Party = 'CLIENT' | 'VENDOR' | 'CONSULTANT'

/** What happens next, decided after it happened. */
export type Outcome =
  /** Through to the next round. */
  | 'ADVANCE'
  /** Done with rounds — make them an offer. */
  | 'OFFER'
  /** Not going forward. */
  | 'REJECT'

/** How long a proposal waits before it is somebody's problem. */
export const CHASE_AFTER_HOURS = 24

/** Rounds past this and somebody is not making a decision. */
export const TOO_MANY_ROUNDS = 4

export interface Slot {
  start: Date
  end: Date
}

export interface Confirmation {
  at: Date
  /**
   * How it was confirmed.
   *
   * `VENDOR_ASSERTED` where the vendor answered for a consultant with no
   * seat here — honest, and the difference matters when somebody does
   * not turn up.
   */
  via: 'SELF' | 'VENDOR_ASSERTED'
}

export interface Interview {
  round: number
  stage: string
  mode: 'PHONE' | 'VIDEO' | 'ONSITE'
  state: State
  proposedSlots: Slot[]
  proposedAt: Date
  scheduledAt: Date | null
  durationMins: number
  client: Confirmation | null
  vendor: Confirmation | null
  consultant: Confirmation | null
  /** Who did not turn up, where somebody did not. */
  noShowBy: Party | null
  outcome: Outcome | null
}

// ── Who we are waiting on ─────────────────────────────────────────────

export interface Waiting {
  on: Party[]
  /** True once it has been sitting long enough that somebody should ring. */
  overdue: boolean
  says: string
}

/**
 * Who still has to say yes, and whether it has been too long.
 *
 * Names the parties. A coordinator cannot act on "pending" and can act
 * on "waiting on Cloudepa and the consultant since Tuesday".
 */
export function waitingOn(
  i: Interview,
  now: Date,
  names: { vendor: string; client: string; consultant: string }
): Waiting {
  const on: Party[] = []
  if (!i.client) on.push('CLIENT')
  if (!i.vendor) on.push('VENDOR')
  if (!i.consultant) on.push('CONSULTANT')

  const hours = (now.getTime() - i.proposedAt.getTime()) / 3_600_000
  const overdue = on.length > 0 && hours >= CHASE_AFTER_HOURS

  if (on.length === 0) {
    return { on, overdue: false, says: 'Everybody has confirmed.' }
  }

  const who = on.map((p) =>
    p === 'CLIENT' ? names.client : p === 'VENDOR' ? names.vendor : names.consultant
  )

  const list =
    who.length === 1
      ? who[0]
      : `${who.slice(0, -1).join(', ')} and ${who[who.length - 1]}`

  return {
    on,
    overdue,
    says: overdue
      ? `Waiting on ${list} for ${said(hours)}. Worth a call.`
      : `Waiting on ${list}.`,
  }
}

/**
 * Whether it may be treated as booked.
 *
 * Deliberately not "the client said yes". An interview one party has not
 * agreed to is a meeting somebody will not attend, and putting it in a
 * calendar does not change that.
 */
export function isBooked(i: Interview): boolean {
  return i.client != null && i.vendor != null && i.consultant != null && i.scheduledAt != null
}

/**
 * Where confirming leaves it.
 *
 * The state only moves to CONFIRMED when the third party agrees and a
 * slot has been settled. Two out of three is still PROPOSED, however
 * close it feels.
 */
export function stateAfterConfirming(i: Interview): State {
  if (i.state === 'CANCELLED' || i.state === 'DONE' || i.state === 'NO_SHOW') return i.state
  return isBooked(i) ? 'CONFIRMED' : 'PROPOSED'
}

// ── Slots ─────────────────────────────────────────────────────────────

/**
 * The slots everybody can do.
 *
 * Offered by the client, narrowed by whoever answers. An empty result is
 * a real answer and is said out loud — the alternative is a coordinator
 * refreshing a screen waiting for a slot that will never appear.
 */
export function slotsBothCanDo(offered: Slot[], available: Slot[]): Slot[] {
  return offered.filter((o) =>
    available.some((a) => a.start.getTime() <= o.start.getTime() && a.end.getTime() >= o.end.getTime())
  )
}

/** The earliest of what is left, because interviews slip later, never earlier. */
export function earliest(slots: Slot[]): Slot | null {
  if (slots.length === 0) return null
  return [...slots].sort((a, b) => a.start.getTime() - b.start.getTime())[0]
}

/**
 * Whether a slot is still worth confirming.
 *
 * A proposal that has been sitting so long the slot is in the past is
 * not a booking, and letting somebody confirm it produces a meeting
 * nobody attends and a no-show nobody deserves.
 */
export function stillValid(slot: Slot, now: Date): boolean {
  return slot.start.getTime() > now.getTime()
}

// ── What happened ─────────────────────────────────────────────────────

/**
 * The reason code an outcome feeds back.
 *
 * Interviews are where most submissions actually die, and until now that
 * died with them. INTERVIEW is the existing code for "interviewed and
 * did not land it" — a good candidate losing to a better one, which is
 * not a fault in the submission and must not be counted as one.
 */
export function reasonFor(outcome: Outcome, noShowBy: Party | null): string | null {
  if (noShowBy === 'CONSULTANT') return 'CANDIDATE_WITHDREW'
  if (noShowBy) return 'TIMING'
  return outcome === 'REJECT' ? 'INTERVIEW' : null
}

export interface Verdict {
  state: State
  outcome: Outcome | null
  /** Whether the submission is finished either way. */
  closed: boolean
  says: string
}

/**
 * Where an outcome leaves the submission.
 *
 * ADVANCE is not a decision, it is a delay, and the wording says so —
 * four rounds in, somebody is avoiding a decision rather than gathering
 * information, and a client who cannot see that will keep booking.
 */
export function settle(
  round: number,
  outcome: Outcome,
  personName: string
): Verdict {
  if (outcome === 'OFFER') {
    return {
      state: 'DONE',
      outcome,
      closed: true,
      says: `${personName} is through. Raise the contract.`,
    }
  }

  if (outcome === 'REJECT') {
    return {
      state: 'DONE',
      outcome,
      closed: true,
      says: `${personName} is out after round ${round}. Tell the vendor why — it is the only way the next one is better.`,
    }
  }

  const next = round + 1
  return {
    state: 'DONE',
    outcome,
    closed: false,
    says:
      next > TOO_MANY_ROUNDS
        ? `Round ${next} for ${personName}. Four rounds in, this is not information gathering any more — somebody has to decide.`
        : `${personName} goes through to round ${next}.`,
  }
}

/**
 * A no-show, recorded against whoever did not turn up.
 *
 * Both parties are in the same room here, which is the only reason this
 * can be settled at all: today the vendor says the client cancelled and
 * the client says nobody came, and neither can prove it.
 */
export function noShow(
  by: Party,
  names: { vendor: string; client: string; consultant: string }
): Verdict {
  const who = by === 'CLIENT' ? names.client : by === 'VENDOR' ? names.vendor : names.consultant

  return {
    state: 'NO_SHOW',
    outcome: null,
    closed: by === 'CONSULTANT',
    says:
      by === 'CONSULTANT'
        ? `${who} did not turn up. Recorded, and it counts against ${names.vendor}.`
        : by === 'CLIENT'
          ? `${who} did not turn up. Recorded — it is not the supplier's fault and their scorecard should not carry it.`
          : `${who} did not turn up.`,
  }
}

// ── Small readers ─────────────────────────────────────────────────────

/** Hours, said the way somebody would say them. */
export function said(hours: number): string {
  // Checked before rounding. Half an hour rounds to one, and "an hour"
  // for thirty minutes is the same small lie as printing a bare zero
  // for four good submissions.
  if (hours < 1) return 'under an hour'
  const h = Math.round(hours)
  if (h === 1) return 'an hour'
  if (h < 48) return `${h} hours`
  return `${Math.round(h / 24)} days`
}

/**
 * The line at the top of an interview.
 *
 * One sentence that answers the only two questions anybody has: when,
 * and is it actually happening.
 */
export function headline(
  i: Interview,
  now: Date,
  names: { vendor: string; client: string; consultant: string }
): string {
  const when = i.scheduledAt
    ? i.scheduledAt.toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
    : null

  switch (i.state) {
    case 'CANCELLED':
      return `Round ${i.round} was called off.`
    case 'NO_SHOW':
      return i.noShowBy
        ? noShow(i.noShowBy, names).says
        : `Round ${i.round}: somebody did not turn up.`
    case 'DONE':
      return i.outcome
        ? `Round ${i.round} done — ${i.outcome.toLowerCase()}.`
        : `Round ${i.round} done, no decision recorded yet.`
    case 'CONFIRMED':
      return `Round ${i.round}, ${when}. In all three diaries.`
    default: {
      const w = waitingOn(i, now, names)
      return when ? `Round ${i.round}, ${when}. ${w.says}` : `Round ${i.round}. ${w.says}`
    }
  }
}

// ── Reading a stored row ──────────────────────────────────────────────
//
// Lives here rather than in a route because a Next.js route file may
// only export handlers — exporting a helper from one compiles until the
// type checker gets to it, and then fails somewhere else entirely.

/**
 * The row as a screen wants it.
 *
 * Dates left as they are, so the caller decides between an ISO string
 * and a Date. Confirmations grouped, because "who has said yes" is one
 * question and three columns is not an answer to it.
 */
export function shapeRow(row: any) {
  return {
    id: row.id,
    round: row.round,
    stage: row.stage,
    mode: row.mode,
    state: row.state,
    slots: row.proposedSlots,
    scheduledAt: row.scheduledAt,
    durationMins: row.durationMins,
    location: row.location,
    interviewers: row.interviewers,
    confirmed: {
      client: row.clientConfirmedAt,
      vendor: row.vendorConfirmedAt,
      consultant: row.consultantConfirmedAt,
      consultantVia: row.consultantConfirmedVia,
    },
    outcome: row.outcome,
    feedback: row.feedback,
    noShowBy: row.noShowBy,
  }
}

/** The row as the rules above want it. */
export function rowToInterview(row: any): Interview {
  return {
    round: row.round,
    stage: row.stage,
    mode: row.mode,
    state: row.state,
    proposedSlots: ((row.proposedSlots as any[]) ?? []).map((s) => ({
      start: new Date(s.start),
      end: new Date(s.end),
    })),
    proposedAt: row.proposedAt,
    scheduledAt: row.scheduledAt,
    durationMins: row.durationMins,
    client: row.clientConfirmedAt ? { at: row.clientConfirmedAt, via: 'SELF' } : null,
    vendor: row.vendorConfirmedAt ? { at: row.vendorConfirmedAt, via: 'SELF' } : null,
    consultant: row.consultantConfirmedAt
      ? { at: row.consultantConfirmedAt, via: row.consultantConfirmedVia ?? 'SELF' }
      : null,
    noShowBy: row.noShowBy,
    outcome: row.outcome,
  }
}
