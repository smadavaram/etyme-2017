/**
 * Hours are a fact. Approvals are opinions about that fact.
 *
 * Both earlier designs confuse the two, in opposite directions.
 *
 * 2017 duplicated. Approving a buy-side timesheet copied the sheet, the
 * cycle and every transaction onto the sell side. Three companies in a
 * chain meant three copies of one week of somebody's life, each with its
 * own status, each able to drift from the others. "Is this approved" had
 * three answers and reconciling them was somebody's job.
 *
 * What I built last week collapsed. One record with two signature
 * fields: correct for a client and an employer, wrong the moment a prime
 * stands between them, and silently wrong rather than obviously so.
 *
 * ── The shape that is neither ────────────────────────────────────────
 *
 * One immutable record of worked time, and as many assertions about it
 * as there are parties who have to say something.
 *
 *   record      what the person says they did. Written once.
 *   assertion   what one company says about some or all of it —
 *               how many hours they accept, at what rate, on what date,
 *               and whether that is still their position.
 *
 * Nothing is ever edited. A correction is a new assertion that
 * supersedes an old one, and both remain readable. That is what makes
 * the audit chain free rather than a feature somebody has to build: the
 * assertions in order *are* the history.
 *
 * ── What falls out of it ─────────────────────────────────────────────
 *
 * Any chain depth, because assertions are a list rather than two
 * columns. Partial approval, because an assertion covers a date range
 * rather than a whole sheet. Rate in force on the day, because the rate
 * sits on the assertion and not on the contract read at invoice time.
 * Reversal, because withdrawing is just another assertion. And a chain
 * with an offline party in the middle shows as a gap rather than
 * quietly resolving to somebody else's number.
 */

export type Role =
  /** The end client saying the work happened. Gates billing. */
  | 'CLIENT_APPROVAL'
  /** A prime passing the hours up its own chain, at its own rate. */
  | 'PASS_THROUGH'
  /** The employer saying this is the basis for pay. Gates payroll. */
  | 'EMPLOYER_ACCEPTANCE'

export type AssertionState = 'LIVE' | 'WITHDRAWN' | 'SUPERSEDED'

export interface Day {
  /** ISO date. */
  on: string
  hours: number
}

/**
 * What the person says they did. Written once and never edited.
 *
 * A correction does not change this. It is a new record that supersedes
 * it, so the original and the corrected version are both readable and
 * anybody can see what changed and when.
 */
export interface Record_ {
  id: string
  personId: string
  personName: string
  days: Day[]
  periodStart: string
  periodEnd: string
  submittedAt: Date
  /** Set where a later record replaces this one. */
  supersededById: string | null
}

/**
 * One company's position on some or all of a record.
 *
 * `covers` is a date range because partial approval is the ordinary case
 * — a client signs off four days and queries the fifth — and modelling
 * it as a whole-sheet status makes the common thing the exception.
 */
export interface Assertion {
  id: string
  recordId: string
  companyId: string
  companyName: string
  role: Role
  /** Inclusive ISO dates. Null covers the whole record. */
  from: string | null
  to: string | null
  /** Hours this company accepts across the range it covers. */
  hours: number
  /** Their rate for this leg, cents per hour. Their money, their number. */
  rateCents: number
  state: AssertionState
  at: Date
  /** Null where nobody looked — an automatic approval names no one. */
  byId: string | null
  auto: boolean
  note: string | null
  /** The assertion this one replaces. */
  supersedesId: string | null
}

// ── Reading the ledger ────────────────────────────────────────────────

/** Hours the person actually recorded. */
export function submittedHours(r: Record_): number {
  return r.days.reduce((n, d) => n + d.hours, 0)
}

function within(d: Day, a: Assertion): boolean {
  if (!a.from && !a.to) return true
  if (a.from && d.on < a.from) return false
  if (a.to && d.on > a.to) return false
  return true
}

/** Hours a record has inside one assertion's range. */
export function hoursCovered(r: Record_, a: Assertion): number {
  return r.days.filter((d) => within(d, a)).reduce((n, d) => n + d.hours, 0)
}

/**
 * The assertions that still stand, for one role.
 *
 * Withdrawn and superseded ones are kept and never returned here. They
 * are the history, and the history is the point — but a caller asking
 * "what is the position" wants the position.
 */
export function live(assertions: Assertion[], role?: Role): Assertion[] {
  return assertions.filter((a) => a.state === 'LIVE' && (!role || a.role === role))
}

export interface Leg {
  companyId: string
  companyName: string
  role: Role
  /** Null where nobody has asserted anything on this leg yet. */
  assertion: Assertion | null
  says: string
}

/**
 * Every party who has to say something, and whether they have.
 *
 * The chain is derived from the contracts at read time rather than
 * copied at write time. So a party joining mid-assignment appears here
 * immediately with nothing asserted, instead of needing somebody to
 * backfill rows nobody knew were missing.
 */
export function chain(
  r: Record_,
  expected: { companyId: string; companyName: string; role: Role }[],
  assertions: Assertion[]
): Leg[] {
  return expected.map((e) => {
    const a =
      live(assertions).find((x) => x.companyId === e.companyId && x.role === e.role) ?? null

    return {
      ...e,
      assertion: a,
      says: a
        ? legSays(r, a)
        : `${e.companyName} has not ${e.role === 'CLIENT_APPROVAL' ? 'approved' : e.role === 'EMPLOYER_ACCEPTANCE' ? 'accepted' : 'passed on'} these hours yet.`,
    }
  })
}

function legSays(r: Record_, a: Assertion): string {
  const covered = hoursCovered(r, a)
  const partial = a.from || a.to

  // The automatic note goes at the end, not in the middle of the verb.
  // Spliced inline it produced "approved automatically — nobody looked
  // all 40 hours", which is the kind of sentence that makes somebody
  // stop believing the rest of the screen.
  const tail = a.auto ? ' Approved automatically — nobody looked.' : ''
  const who = `${a.companyName} approved`

  if (a.hours !== covered) {
    return `${who} ${a.hours} of the ${covered} hours ${partial ? 'in that range' : 'submitted'}${a.note ? `. ${a.note}` : '.'}${tail}`
  }

  return partial
    ? `${who} ${a.hours} hours, ${a.from ?? 'the start'} to ${a.to ?? 'the end'}.${tail}`
    : `${who} all ${a.hours} hours.${tail}`
}

export interface Position {
  /** Hours the client agreed. Zero until they do. */
  billableHours: number
  /** Hours the employer agreed to pay for. */
  payableHours: number
  billableCents: number
  payableCents: number
  /** Legs still waiting on somebody. */
  waitingOn: Leg[]
  /** True where every expected leg has a live assertion. */
  complete: boolean
  says: string
}

/**
 * What this record is worth to each side, and who is holding it up.
 *
 * Billing and pay derive from different assertions and are gated
 * separately, so a prime with the client's approval invoices while the
 * sub is still settling. Neither number is stored — storing it is what
 * makes two copies disagree.
 */
export function position(r: Record_, legs: Leg[]): Position {
  const client = legs.find((l) => l.role === 'CLIENT_APPROVAL')?.assertion ?? null
  const employer = legs.find((l) => l.role === 'EMPLOYER_ACCEPTANCE')?.assertion ?? null

  const billableHours = client?.hours ?? 0
  const payableHours = employer?.hours ?? 0

  const waitingOn = legs.filter((l) => !l.assertion)

  return {
    billableHours,
    payableHours,
    billableCents: client ? Math.round(client.hours * client.rateCents) : 0,
    payableCents: employer ? Math.round(employer.hours * employer.rateCents) : 0,
    waitingOn,
    complete: waitingOn.length === 0,
    says: positionSays(r, client, employer, waitingOn),
  }
}

function positionSays(
  r: Record_,
  client: Assertion | null,
  employer: Assertion | null,
  waiting: Leg[]
): string {
  const submitted = submittedHours(r)

  if (waiting.length > 0) {
    const names = waiting.map((l) => l.companyName)
    const list =
      names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
    return `${submitted} hours submitted. Waiting on ${list}.`
  }

  if (client && employer && client.hours !== employer.hours) {
    return `Billing ${client.hours} hours, paying ${employer.hours}.${employer.note ? ` ${employer.note}` : ''}`
  }

  return `${submitted} hours, agreed the whole way along.`
}

// ── Writing to it ─────────────────────────────────────────────────────

/**
 * Whether this assertion may be made.
 *
 * A company may only speak for its own leg. The whole value of a chain
 * of assertions is that each was made by a different party, and one
 * party asserting on another's behalf turns it back into a single
 * signature wearing three hats.
 */
export function mayAssert(
  companyId: string,
  role: Role,
  expected: { companyId: string; role: Role }[],
  existing: Assertion[]
): { ok: boolean; says: string } {
  const theirs = expected.some((e) => e.companyId === companyId && e.role === role)
  if (!theirs) {
    return { ok: false, says: 'That is not your part of this chain to answer.' }
  }

  const already = live(existing).find((a) => a.companyId === companyId && a.role === role)
  if (already) {
    return {
      ok: false,
      says: 'You have already answered. Withdraw the old one first — it is not overwritten.',
    }
  }

  return { ok: true, says: 'Recorded against you.' }
}

/**
 * Correcting an assertion.
 *
 * The old one is superseded, never updated. Two rows where there was
 * one, and anybody can see the number changed, when, and why — which is
 * the entire reason not to just edit the field.
 */
export function supersede(
  old: Assertion,
  hours: number,
  note: string,
  byId: string,
  at: Date
): { ok: boolean; withdraw: Partial<Assertion>; add: Partial<Assertion>; says: string } {
  if (note.trim().length < 5) {
    return {
      ok: false,
      withdraw: {},
      add: {},
      says: 'Say why it changed. The old number stays visible and somebody will ask.',
    }
  }

  return {
    ok: true,
    withdraw: { id: old.id, state: 'SUPERSEDED' },
    add: {
      recordId: old.recordId,
      companyId: old.companyId,
      role: old.role,
      from: old.from,
      to: old.to,
      hours,
      rateCents: old.rateCents,
      state: 'LIVE',
      at,
      byId,
      auto: false,
      note: note.trim(),
      supersedesId: old.id,
    },
    says:
      `${old.companyName}: ${old.hours} hours becomes ${hours}. ${note.trim()} ` +
      `The original stays on the record.`,
  }
}

/**
 * The history of one leg, oldest first.
 *
 * This is the audit chain, and it costs nothing because the ledger is
 * the audit chain. Nobody has to build an export that reconstructs what
 * happened from fields that were overwritten.
 */
export function historyOf(assertions: Assertion[], companyId: string, role: Role): string[] {
  return assertions
    .filter((a) => a.companyId === companyId && a.role === role)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((a) => {
      const when = a.at.toISOString().slice(0, 10)
      const who = a.auto ? 'automatically, nobody looked' : a.byId ? `by ${a.byId}` : 'by somebody'
      const what =
        a.state === 'WITHDRAWN'
          ? `withdrew ${a.hours} hours`
          : a.state === 'SUPERSEDED'
            ? `said ${a.hours} hours, later changed`
            : `said ${a.hours} hours`
      return `${when}: ${a.companyName} ${what}, ${who}${a.note ? ` — ${a.note}` : ''}`
    })
}

/**
 * Where a chain has a hole in it.
 *
 * A leg whose company is not on the platform cannot assert anything, and
 * pretending somebody else's approval covers it is how a sub-vendor ends
 * up paying on a signature that was never collected. Named, so the gap
 * is visible rather than resolved away.
 */
export function gaps(legs: Leg[], onPlatform: Set<string>): string[] {
  return legs
    .filter((l) => !l.assertion && !onPlatform.has(l.companyId))
    .map(
      (l) =>
        `${l.companyName} is not on Etyme, so nothing here carries their approval. ` +
        `Somebody has to collect it another way.`
    )
}
