/**
 * A vendor asking to market somebody, and that person answering.
 *
 * ── The invariant that had no mechanism ──────────────────────────────
 *
 * `CLAUDE.md` states it more firmly than anything else in the file: a
 * Submission requires a live BenchListing **granted by the consultant**.
 *
 * Nothing carried the grant. `grantedAt` defaulted to `now()` the moment
 * a vendor created the row, so every listing was born consented and no
 * consultant was ever asked. The invariant held in the sense that a
 * listing existed; it meant nothing in the sense anybody cared about.
 *
 * 2017 had the missing half — `job_invitations#accept_bench` and
 * `#reject_bench`, where a vendor invited and the record moved on the
 * candidate's answer. Two details of that are worth keeping and are kept
 * here: consent was **an answer to an invitation**, never a flag a
 * vendor could set; and rejection **restored a prior state** rather than
 * deleting anything, so a declined invitation is still a record of
 * having asked.
 *
 * ── Why existing rows are GRANTED ────────────────────────────────────
 *
 * `state` defaults to GRANTED so every row written before this keeps the
 * meaning it was written with. Backfilling them to INVITED would be
 * honest about the past and would silently un-list every consultant on
 * every bench, which is a worse lie told louder.
 */

export type State = 'INVITED' | 'GRANTED' | 'DECLINED'

export interface Listing {
  state: State
  revokedAt: Date | null
}

export interface Verdict {
  ok: boolean
  /** Said to whoever is being refused, in their terms. */
  reason: string
}

/**
 * Whether this listing lets a vendor put somebody forward.
 *
 * The only question the submission path needs answered, and the reason
 * this file exists.
 */
export function mayMarket(l: Listing): Verdict {
  if (l.revokedAt) {
    return { ok: false, reason: 'They took this listing back. It cannot be used.' }
  }
  if (l.state === 'INVITED') {
    return {
      ok: false,
      reason: 'They have not answered your invitation yet. Nobody can be put forward on an unanswered invitation.',
    }
  }
  if (l.state === 'DECLINED') {
    return { ok: false, reason: 'They declined. Asking again is a conversation, not a re-listing.' }
  }
  return { ok: true, reason: 'They agreed to be marketed by you.' }
}

/** Whether the consultant still has something to answer. */
export function awaitingAnswer(l: Listing): boolean {
  return l.state === 'INVITED' && l.revokedAt === null
}

/**
 * What an answer does to the record.
 *
 * Returned as fields to write rather than written here, so the one place
 * that touches the database stays the route and this stays testable
 * without one.
 */
export function answer(
  l: Listing,
  said: 'ACCEPT' | 'DECLINE',
  now: Date,
  note?: string | null
): { ok: boolean; reason: string; data?: Record<string, unknown> } {
  if (l.revokedAt) {
    return { ok: false, reason: 'This listing was already taken back.' }
  }
  if (l.state !== 'INVITED') {
    return {
      ok: false,
      reason:
        l.state === 'GRANTED'
          ? 'You already agreed to this one. Revoke it if you have changed your mind.'
          : 'You already declined this one.',
    }
  }

  if (said === 'ACCEPT') {
    return {
      ok: true,
      reason: 'They can put you forward for roles now. You can take it back at any time.',
      // grantedAt is stamped here and only here, which is the whole
      // point: it now means the moment somebody agreed rather than the
      // moment a vendor typed their name.
      data: { state: 'GRANTED', grantedAt: now, respondedAt: now, declinedNote: null },
    }
  }

  return {
    ok: true,
    reason: 'Declined. They cannot put you forward, and they are not told why unless you said.',
    // Not deleted. A declined invitation is a record of having asked,
    // and losing it means the same vendor asks again next week with no
    // idea they already did.
    data: {
      state: 'DECLINED',
      respondedAt: now,
      declinedNote: note?.trim() ? note.trim().slice(0, 500) : null,
    },
  }
}

/** What a vendor writes when they create the invitation. */
export function invitation(now: Date): Record<string, unknown> {
  return { state: 'INVITED', invitedAt: now, respondedAt: null }
}
