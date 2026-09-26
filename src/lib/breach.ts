/**
 * Personal data went somewhere it should not have, and the clocks that
 * started when somebody noticed.
 *
 * ── No severity scale, deliberately ──────────────────────────────────
 *
 * The DPA says plainly that there is no defined severity scale, and
 * inventing a four-point one here would make that sentence false without
 * making anybody safer. What decides the clocks is whether personal data
 * was involved, whose, and what counsel says about it. A scale can be
 * added the day counsel gives one.
 *
 * ── A clock with no deadline is not a clock with no duty ─────────────
 *
 * `notifyAuthorityBy` and `notifySubjectsBy` are null until somebody has
 * decided a deadline applies. A default of "discovered plus 72 hours"
 * would be a legal conclusion written by an engineer — the GDPR's 72
 * hours is not the US state patchwork's clock, and not every breach is
 * notifiable at all. So null means nobody has decided yet, and every
 * screen and every sweep says exactly that rather than counting down to
 * a date it made up.
 *
 * ── A clock owned by nobody is a clock that is missed ────────────────
 *
 * Every clock names the person who owns sending it. Where nobody opened
 * the breach under their own name there is no owner, and that is said
 * out loud rather than addressed to "the team".
 *
 * Owned by etyme-regulatory (`lib/breach` in `lib/domains.ts`).
 */

export type ClockWho = 'AUTHORITY' | 'PEOPLE' | 'CUSTOMER'

export interface ClockState {
  who: ClockWho
  /** The customer, where this is a customer's own notice period. */
  companyName?: string
  dueAt: Date | null
  notifiedAt: Date | null
  owner: string | null
}

export type ClockReading =
  /** Nobody has decided whether a deadline applies. */
  | 'UNDECIDED'
  /** Decided, running, more than a day left. */
  | 'RUNNING'
  /** Decided, running, inside the last day. */
  | 'DUE_SOON'
  /** The deadline passed with no notice recorded. */
  | 'MISSED'
  /** The notice went. */
  | 'SENT'

export interface Read {
  who: ClockWho
  reading: ClockReading
  /** What a person reads on the screen. Never a state name. */
  says: string
  /** Hours left, or hours late. Null where nobody has decided a deadline. */
  hours: number | null
}

function whoSays(c: ClockState): string {
  if (c.who === 'AUTHORITY') return 'the supervisory authority'
  if (c.who === 'PEOPLE') return 'the people affected'
  return c.companyName ?? 'this customer'
}

/** What one clock says today, in the reader's words. */
export function readClock(c: ClockState, now: Date): Read {
  const who = whoSays(c)

  if (c.notifiedAt) {
    return {
      who: c.who, reading: 'SENT', hours: null,
      says: `${who} — told on ${c.notifiedAt.toISOString().slice(0, 10)}.`,
    }
  }
  if (!c.dueAt) {
    return {
      who: c.who, reading: 'UNDECIDED', hours: null,
      says:
        `Nobody has decided a deadline for telling ${who}. That is not the same as nothing ` +
        'being owed — it means the question has not been asked yet.',
    }
  }

  const hours = Math.round((c.dueAt.getTime() - now.getTime()) / 3_600_000)
  const owner = c.owner ? `${c.owner} owns it.` : 'Nobody owns this notice yet, which is how one is missed.'

  if (hours < 0) {
    return {
      who: c.who, reading: 'MISSED', hours,
      says: `The deadline to tell ${who} passed ${Math.abs(hours)} hours ago and no notice is recorded. ${owner}`,
    }
  }
  if (hours < 24) {
    return {
      who: c.who, reading: 'DUE_SOON', hours,
      says: `${hours} hours left to tell ${who}. ${owner}`,
    }
  }
  return {
    who: c.who, reading: 'RUNNING', hours,
    says: `${Math.round(hours / 24)} days left to tell ${who}. ${owner}`,
  }
}

export interface BreachReading {
  /** One line for the top of the row, in the reader's words. */
  says: string
  clocks: Read[]
  /** True where not one clock has a decided deadline. */
  nobodyHasDecided: boolean
  worst: ClockReading
}

const ORDER: ClockReading[] = ['SENT', 'RUNNING', 'UNDECIDED', 'DUE_SOON', 'MISSED']

/** What a whole breach says today. */
export function readBreach(clocks: ClockState[], now: Date, closedAt: Date | null = null): BreachReading {
  const reads = clocks.map((c) => readClock(c, now))
  const nobodyHasDecided = clocks.every((c) => !c.dueAt && !c.notifiedAt)
  const worst = reads.reduce<ClockReading>(
    (w, r) => (ORDER.indexOf(r.reading) > ORDER.indexOf(w) ? r.reading : w),
    'SENT'
  )

  if (closedAt) {
    return {
      says: `Closed on ${closedAt.toISOString().slice(0, 10)}. Every clock on it stopped.`,
      clocks: reads, nobodyHasDecided, worst,
    }
  }
  if (nobodyHasDecided) {
    return {
      says:
        'Nobody has decided a deadline on this yet. Somebody has to say whether a notice is ' +
        'owed, to whom, and by when, before anything else happens.',
      clocks: reads, nobodyHasDecided, worst,
    }
  }
  const says =
    worst === 'MISSED' ? 'A deadline has passed with no notice recorded against it.'
      : worst === 'DUE_SOON' ? 'A deadline falls inside the next day.'
      : worst === 'UNDECIDED' ? 'One of the notices has no deadline decided yet.'
      : worst === 'RUNNING' ? 'Both clocks are running and neither is close.'
      : 'Every notice this owes has gone.'
  return { says, clocks: reads, nobodyHasDecided, worst }
}

// ── Who may open, set and close one ───────────────────────────────────

export interface MayWork {
  ok: boolean
  says: string
}

/**
 * Staff, or a compliance desk at a company the breach touches.
 *
 * A breach is Etyme's incident and Etyme's to run, and a customer whose
 * records were in it is entitled to see its own row and record that it
 * was told. Nobody else sees one at all — a breach list is the single
 * most sensitive list in the product.
 */
export function mayWorkBreach(input: {
  isStaff: boolean
  hasCompliancePermission: boolean
  companyIsAffected: boolean
}): MayWork {
  if (input.isStaff) return { ok: true, says: 'Etyme staff run an incident.' }
  if (!input.hasCompliancePermission) {
    return {
      ok: false,
      says:
        'Reading a security incident is the compliance desk’s job here. Ask whoever holds ' +
        'that seat at your company; if that should be you, an owner or administrator can ' +
        'add it under Users and permissions.',
    }
  }
  if (!input.companyIsAffected) {
    return {
      ok: false,
      says:
        'There is nothing here for your company. Anything that touched your records would ' +
        'be on this page, and you would have been written to as well.',
    }
  }
  return { ok: true, says: 'Your company’s records were in this, so your compliance desk may read it.' }
}

/** A breach is not closed while a decided deadline has no notice against it. */
export function mayClose(clocks: ClockState[], now: Date): MayWork {
  const open = clocks.filter((c) => c.dueAt && !c.notifiedAt)
  if (open.length > 0) {
    const who = open.map((c) => whoSays(c)).join(' and ')
    return {
      ok: false,
      says:
        `This still owes a notice to ${who}. Record the hour each one went, then close it. ` +
        'A breach closed over an unsent notice is a record that says the notice was never owed.',
    }
  }
  const undecided = clocks.filter((c) => !c.dueAt && !c.notifiedAt)
  if (undecided.length === clocks.length && clocks.length > 0) {
    return {
      ok: true,
      says:
        'No notice was ever owed on this, and closing it records that decision with your ' +
        'name on it.',
    }
  }
  return { ok: true, says: 'Every notice this owed has gone, so it can be closed.' }
}
