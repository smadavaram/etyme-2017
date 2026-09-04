/**
 * Being on several benches at once, without it costing you the job.
 *
 * A contract consultant is on five, ten, fifteen benches. That is not
 * disloyalty, it is how the market works: no single vendor sees enough of
 * the demand to keep one person busy. Every consultant knows this and
 * every vendor knows this, and the software has always pretended
 * otherwise.
 *
 * 2017 pretended hardest. Accepting one bench invitation auto-rejected
 * every other pending one — `reject_request` in job_invitation.rb — so a
 * candidate could be on exactly one company's bench, decided by whichever
 * recruiter got there first. That is the vendor's interest written as a
 * platform rule, and the result is what you would expect: people kept
 * their other benches off the platform, and the platform's data was
 * wrong about the thing it most needed to be right about.
 *
 * So benches here are not exclusive and cannot see each other. What is
 * exclusive is the thing that actually hurts somebody when it is shared.
 *
 * ── The failure this exists to prevent ──────────────────────────────
 *
 * Two vendors submit the same person to the same client in the same week.
 * The client sees the name twice, decides the market is shopping them
 * around, and rejects both. The consultant loses a job they never knew
 * they were up for, and neither vendor tells them why. This is the single
 * most common way a good consultant is burned, and it is entirely an
 * artefact of nobody being able to see across the two vendors.
 *
 * We can see across them. So one vendor holds one person at one client at
 * a time.
 *
 * ── What a hold is, and is not ───────────────────────────────────────
 *
 * It is taken automatically when a vendor submits. No form, no signature,
 * no waiting — the vendor's thirty-second loop is untouched, because
 * governance slower than the workaround produces the workaround.
 *
 * It ends the moment the vendor's shot is over: the client says no, the
 * vendor withdraws, thirty days pass with no decision, or the person
 * releases it themselves. A hold is permission to be trying, never a
 * parking space.
 *
 * And it is deliberately thin on information. A second vendor is told
 * that somebody holds this person at this client, and never who. That one
 * bit has to travel — without it the duplicate happens and the person is
 * burned, which is worse — but nothing else does. No name, no rate, no
 * count of how many other benches they are on.
 */

/** The industry's right-to-represent runs 30 to 90 days. Take the short one. */
export const HOLD_DAYS = 30

export type HoldState =
  /** A vendor is representing them here, right now. */
  | 'HELD'
  /** Asked for, not yet answered — only where the person asked to be asked. */
  | 'REQUESTED'
  /** Given up, by either side. */
  | 'RELEASED'
  /** Ran its thirty days without a decision. */
  | 'EXPIRED'
  /** The person said no. */
  | 'DECLINED'

export interface Hold {
  companyId: string
  clientCompanyId: string
  state: HoldState
  takenAt: Date
  expiresAt: Date
}

/** Live means held and inside its window. Nothing else counts. */
export function live(hold: Hold, now: Date): boolean {
  return hold.state === 'HELD' && hold.expiresAt > now
}

export function holdExpiry(from: Date, days: number = HOLD_DAYS): Date {
  return new Date(from.getTime() + days * 86_400_000)
}

/** Days left, for saying it in a sentence rather than printing a timestamp. */
export function daysLeft(hold: Hold, now: Date): number {
  return Math.max(0, Math.ceil((hold.expiresAt.getTime() - now.getTime()) / 86_400_000))
}

export type Refusal =
  /** No bench listing from this company, so no permission to market them at all. */
  | 'NO_LISTING'
  /** The person will not be submitted to this client, and the reason is theirs. */
  | 'BLOCKED'
  /** They asked to be told first. They have been. */
  | 'ASK_FIRST'
  /** Somebody else is already representing them here. */
  | 'HELD_ELSEWHERE'

export type Verdict =
  | { ok: true; alreadyHeld: boolean; note: string }
  | { ok: false; code: Refusal; message: string }

export interface Situation {
  now: Date
  /** Which company wants to submit. */
  companyId: string
  /** The bench listing this company holds, if any. */
  listing: { revokedAt: Date | null; askFirst: boolean } | null
  /** True when the person has said this client is off limits. */
  blocked: boolean
  /** Every hold on this person at this client, live or not. */
  holds: Hold[]
}

/**
 * Whether this vendor may put this person in front of this client.
 *
 * Four answers, and the wording of each matters as much as the verdict —
 * a refusal that leaks who else is involved undoes the whole point.
 */
export function decideSubmission(s: Situation): Verdict {
  // A listing is the person's permission to be marketed at all. Without
  // one there is nothing further to discuss.
  if (!s.listing || s.listing.revokedAt !== null) {
    return {
      ok: false,
      code: 'NO_LISTING',
      message:
        'This person has not put themselves on your bench, so you cannot submit them. Ask them for a listing first.',
    }
  }

  // Their own list, checked before anything else that could act on it. No
  // reason is given — a person's reason for not wanting to go somewhere is
  // their business, and half of them are "that is my current client".
  if (s.blocked) {
    return {
      ok: false,
      code: 'BLOCKED',
      message: 'This person cannot be submitted to this client.',
    }
  }

  const mine = s.holds.find((h) => h.companyId === s.companyId && live(h, s.now))
  if (mine) {
    // Already theirs. A second submission at the same client — a different
    // role, a resubmission — needs no new permission.
    return {
      ok: true,
      alreadyHeld: true,
      note: `You already represent this person here for another ${daysLeft(mine, s.now)} days.`,
    }
  }

  const theirs = s.holds.find((h) => h.companyId !== s.companyId && live(h, s.now))
  if (theirs) {
    // The one bit that has to cross between vendors, and the only one.
    // Note what is not in this sentence: who, since when, at what rate,
    // and whether this person is on one other bench or nine.
    return {
      ok: false,
      code: 'HELD_ELSEWHERE',
      message: `Somebody is already representing this person at this client for the next ${daysLeft(theirs, s.now)} days. Submitting them again would put the same name in front of the client twice, which usually loses them the role.`,
    }
  }

  // Nobody holds them. If they asked to be asked, this is where they get
  // asked — and the answer comes back from them, not from us.
  if (s.listing.askFirst) {
    const pending = s.holds.some(
      (h) => h.companyId === s.companyId && h.state === 'REQUESTED'
    )
    return {
      ok: false,
      code: 'ASK_FIRST',
      message: pending
        ? 'You have already asked this person about this client. They have not answered yet.'
        : 'This person asks to be told before being put forward. They have been asked, and you will hear back.',
    }
  }

  return {
    ok: true,
    alreadyHeld: false,
    note: `You now represent this person at this client for ${HOLD_DAYS} days. Nobody else can submit them here while you do.`,
  }
}

/**
 * When a hold should end because of what happened to the submission.
 *
 * A hold is permission to be trying. The moment the vendor has stopped
 * trying — or been told no — it goes back, so the person is free to be
 * put forward by somebody else that same day rather than sitting out the
 * rest of a month for nothing.
 */
export function endBecauseOf(
  submissionStatus: string
): { end: true; reason: string } | { end: false } {
  switch (submissionStatus) {
    case 'REJECTED':
    case 'DECLINED':
      return { end: true, reason: 'The client said no, so the hold goes back.' }
    case 'WITHDRAWN':
      return { end: true, reason: 'The vendor withdrew them.' }
    case 'AWARDED':
    case 'PLACED':
      // Won. The contract is the relationship now; the hold has done its
      // job and holding them further would only block a second role.
      return { end: true, reason: 'They were placed, so the hold is finished.' }
    default:
      // SUBMITTED, INTERVIEWING, OFFERED — still trying.
      return { end: false }
  }
}

/**
 * What the person themselves is shown about a vendor holding them.
 *
 * Everything, including the client's name. It is the vendor's competitors
 * who are kept in the dark, never the person the whole thing is about —
 * being marketed somewhere you did not know about is the complaint this
 * module exists to answer.
 */
export function tellThem(input: {
  vendorName: string
  clientName: string
  roleTitle: string | null
  hold: Hold
  now: Date
}): string {
  const role = input.roleTitle ? ` for ${input.roleTitle}` : ''
  return `${input.vendorName} put you forward to ${input.clientName}${role}. They represent you there for the next ${daysLeft(input.hold, input.now)} days, and no other agency can submit you to ${input.clientName} while they do.`
}
