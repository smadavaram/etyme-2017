/**
 * Sending somebody onward, and being able to say that you did.
 *
 * Submitting a consultant *to you* and you sending them *onward to the
 * client* are two events, days apart, and until now only the first one
 * existed. So the question every consultant asks — have they actually
 * submitted me, or am I sitting in a spreadsheet — had no answer, and the
 * sub-vendor who put them forward could not tell whether the prime
 * forwarded them or sat on them.
 *
 * 2017 had the state and three implementations of it
 * (`job_application_workflow_service.rb:27-52`): duplicate the application
 * onto the parent job, mail it to the address on the job, or fail loudly
 * with "No valid client email found". This is that, with the link 2017
 * left out.
 *
 * ── A chain, not a flag ──────────────────────────────────────────────
 *
 * Each hop is its own submission, pointing at the one it came from:
 *
 *   Cloudepa → Vertex Global    $62/hr   the sub-vendor's submission
 *        └─ Vertex Global → Terumo    $95/hr   the prime's, marked up
 *
 * Two submissions, two rates, two decisions, one chain. That is the layer
 * cake exactly as it is, and it is why a flag would not do: a flag cannot
 * carry the prime's rate, the prime's decision date, or the fact that the
 * client rejected the prime's submission while the sub-vendor's is still
 * marked live.
 *
 * ── What travels, and what must not ──────────────────────────────────
 *
 * The onward rate is the prime's margin and never travels back down. The
 * sub-vendor learns that their candidate was forwarded, when, and to whom
 * — which is what they are owed — and not for how much.
 */

export type Via =
  /** The next party is on Etyme, so the hop becomes a real submission. */
  | 'ONWARD'
  /** They are not, so it went by email and we record that honestly. */
  | 'EMAIL'

export interface Submission {
  id: string
  /** Who sent it. */
  fromCompanyId: string
  /** Who received it, and therefore the only company that may forward it. */
  toCompanyId: string
  status: string
  rateCents: number
  forwardedAt: Date | null
}

export interface Actor {
  companyId: string | null | undefined
  permissions: readonly string[]
}

export interface Destination {
  via: Via
  /** For ONWARD: the company on Etyme. */
  companyId?: string | null
  /** For EMAIL: where it was sent. */
  email?: string | null
  /** What the forwarder is charging. Theirs, not the sender's. */
  rateCents?: number | null
}

export type Refusal =
  | 'NOT_YOURS'
  | 'ALREADY_DECIDED'
  | 'ALREADY_FORWARDED'
  | 'NOWHERE_TO_SEND'
  | 'NO_PERMISSION'
  | 'SAME_COMPANY'

export type Verdict =
  | { ok: true; note: string; warning: string | null }
  | { ok: false; code: Refusal; message: string }

/** Decisions. A submission that has been answered cannot be sent onward. */
const DECIDED = ['PLACED', 'REJECTED', 'WITHDRAWN', 'NOT_SELECTED']

export function mayForward(
  actor: Actor,
  s: Submission,
  to: Destination
): Verdict {
  if (!actor.permissions.includes('*') && !actor.permissions.includes('submissions.create')) {
    return {
      ok: false,
      code: 'NO_PERMISSION',
      message: 'Sending a candidate onward needs submissions.create.',
    }
  }

  // Only the company holding it. The sub-vendor who sent it cannot reach
  // past the prime to the client — that is the prime's relationship, and
  // going around it is the thing primes fear most about a network.
  if (actor.companyId !== s.toCompanyId) {
    return {
      ok: false,
      code: 'NOT_YOURS',
      message: 'Only the company this was submitted to can send it onward.',
    }
  }

  if (DECIDED.includes(s.status)) {
    return {
      ok: false,
      code: 'ALREADY_DECIDED',
      message: `This was already answered — it is ${s.status.toLowerCase().replace('_', ' ')}. Nothing to send on.`,
    }
  }

  if (s.forwardedAt !== null) {
    return {
      ok: false,
      code: 'ALREADY_FORWARDED',
      message: 'You have already sent this one on. Sending it twice puts the same name in front of the client twice.',
    }
  }

  if (to.via === 'ONWARD') {
    if (!to.companyId) {
      return {
        ok: false,
        code: 'NOWHERE_TO_SEND',
        message: 'No company to send it to. Name the client, or send it by email if they are not on Etyme.',
      }
    }
    if (to.companyId === s.toCompanyId || to.companyId === s.fromCompanyId) {
      return {
        ok: false,
        code: 'SAME_COMPANY',
        message: 'That is one of the companies already on this submission.',
      }
    }
  } else if (!to.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.email)) {
    // 2017's exact failure, kept because it is the honest one: there is
    // nowhere to send it, and pretending otherwise loses a candidate in a
    // queue nobody is watching.
    return {
      ok: false,
      code: 'NOWHERE_TO_SEND',
      message: 'No valid client email found. Add one, or pick a company on Etyme.',
    }
  }

  // A prime forwards at a higher rate than they received. Lower is not
  // forbidden — a firm may buy a relationship — but it is worth a second
  // look, because it is nearly always a typo.
  const warning =
    to.rateCents != null && to.rateCents < s.rateCents
      ? `You are sending this on at $${Math.round(to.rateCents / 100)}/hr, which is less than the $${Math.round(s.rateCents / 100)}/hr you were quoted.`
      : null

  return {
    ok: true,
    note:
      to.via === 'ONWARD'
        ? 'Sent on. The person who submitted them can see that it went, and when — never at what price.'
        : 'Recorded as emailed. The person who submitted them can see that it went, and where.',
    warning,
  }
}

/**
 * Why the onward hop needs a role of its own.
 *
 * A submission is unique on (requirement, person) — the rule that stops the
 * same name reaching one client twice. A forward is the same person on the
 * same seat one hop up, so reusing the requirement collides with exactly
 * the rule we most want to keep.
 *
 * 2017 solved this with sub-jobs: a prime received work on a sub-job and
 * forwarded the application onto the *parent* job, which was the client's.
 * Each party had their own record of one seat.
 *
 * So does this. Forwarding creates the destination's own record of the
 * role, on their books, and submits against that. The chain — not a shared
 * requirement — is what ties the hops together, which is right anyway:
 * neither party can see the other's pipeline, and a shared row would mean
 * they could.
 */
export interface MirroredRole {
  title: string
  skills: string[]
  location: string | null
  /** Whose books it lands on. */
  companyId: string
  /**
   * Where the work actually is, carried down every hop.
   *
   * This was dropped. A role forwarded through a prime arrived at the sub
   * with no end client, so the sub's contract recorded the prime as the
   * place of work — and tenure, which Addendum E requires to aggregate at
   * the end client across every vendor, quietly counted the wrong
   * company. Twelve months at Nike direct and twelve at Nike through a
   * prime read as two unrelated years at two firms.
   *
   * That is the exact blind spot the product exists to close, so it is
   * carried rather than inferred. Null only where the sender genuinely
   * does not know it either.
   */
  endClientCompanyId: string | null
  /** The role it was mirrored from, for anybody auditing later. */
  mirroredFromRequirementId: string
}

export function mirrorRole(
  source: {
    id: string
    title: string
    skills: string[]
    location: string | null
    endClientCompanyId?: string | null
    /** Who is paying the sender. The fallback where no end client is set. */
    companyId?: string
  },
  destinationCompanyId: string
): MirroredRole {
  return {
    title: source.title,
    skills: source.skills,
    location: source.location,
    companyId: destinationCompanyId,
    // Where the sender knows the end client, that travels. Where it does
    // not, the sender itself IS the end client as far as the recipient
    // can tell, and saying so beats leaving it null — a null here reads
    // downstream as "direct placement", which is the wrong answer twice.
    endClientCompanyId: source.endClientCompanyId ?? source.companyId ?? null,
    mirroredFromRequirementId: source.id,
  }
}

/**
 * What the onward submission is worth.
 *
 * Theirs to set. Defaulting to the rate they were quoted is the honest
 * fallback — it says "no markup recorded" rather than inventing one.
 */
export function onwardRate(s: Submission, to: Destination): number {
  return to.rateCents ?? s.rateCents
}

export interface Hop {
  from: string
  to: string
  rateCents: number | null
  status: string
  at: Date
  /** True for the hop the reader is party to. */
  yours: boolean
}

/**
 * The journey, told to somebody who is one hop of it.
 *
 * Everybody sees the shape — how many hands it passed through and how far
 * it got. Nobody sees a rate that is not on their own hop, because the
 * difference between two hops is somebody's margin.
 */
export function journeyFor(hops: Hop[], myCompanyId: string | null): Hop[] {
  return hops.map((h) => ({
    ...h,
    yours: h.from === myCompanyId || h.to === myCompanyId,
    rateCents: h.from === myCompanyId || h.to === myCompanyId ? h.rateCents : null,
  }))
}

/**
 * Said to the consultant, who is entitled to the whole shape and none of
 * the money.
 *
 * "Cloudepa put you forward on Tuesday, and Vertex Global sent you to the
 * client on Thursday" is the answer to the question they actually ask.
 */
export function journeySentence(hops: Hop[], names: Record<string, string>): string {
  if (hops.length === 0) return 'Nobody has put you forward yet.'

  const said = hops.map((h, i) => {
    const who = names[h.from] ?? 'An agency'
    const to = names[h.to] ?? 'the client'
    const when = h.at.toISOString().slice(0, 10)
    return i === 0
      ? `${who} put you forward to ${to} on ${when}`
      : `${who} sent you on to ${to} on ${when}`
  })

  return `${said.join(', and ')}.`
}

/**
 * How far it actually got, in one phrase.
 *
 * The thing a bench list needs: not a status word, but whether this
 * reached the person who decides.
 */
export function howFar(hops: Hop[], reachedTheEnd: boolean): string {
  if (hops.length === 0) return 'not sent'
  if (hops.length === 1 && !reachedTheEnd) return 'with the agency’s customer'
  if (reachedTheEnd) return 'with the client'
  return `${hops.length} hands so far`
}

// ── Reading a chain out of the database ───────────────────────────────

/** A submission as the chain walker needs it. */
export interface ChainRow {
  id: string
  fromCompanyId: string
  toCompanyId: string
  rate: number
  status: string
  submittedAt: Date
  parentSubmissionId: string | null
  forwardedAt: Date | null
}

/**
 * Put a set of related submissions in order, oldest hop first.
 *
 * The rows come back from one query on the chain; ordering them here keeps
 * the walk in one testable place rather than in a route.
 */
export function orderChain(rows: ChainRow[]): ChainRow[] {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const root = rows.find((r) => r.parentSubmissionId === null || !byId.has(r.parentSubmissionId))
  if (!root) return [...rows].sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime())

  const out: ChainRow[] = []
  const seen = new Set<string>()
  let current: ChainRow | undefined = root

  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    out.push(current)
    current = rows.find((r) => r.parentSubmissionId === current!.id)
  }

  // Anything not reachable from the root — a chain somebody broke — is
  // appended rather than dropped. A hop nobody can see is worse than an
  // odd-looking list.
  for (const r of rows) if (!seen.has(r.id)) out.push(r)
  return out
}

export function toHops(rows: ChainRow[]): Hop[] {
  return orderChain(rows).map((r) => ({
    from: r.fromCompanyId,
    to: r.toCompanyId,
    rateCents: r.rate,
    status: r.status,
    at: r.submittedAt,
    yours: false,
  }))
}
