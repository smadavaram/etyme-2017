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

import { hasPermission } from '@/lib/permissions'

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
  note?: string | null,
  /**
   * Whether they want to be asked before each client they have not been
   * sent to before. Only a real `true` or `false` is written; anything
   * else leaves the listing's own setting as it is. Read on a yes only —
   * a no puts them forward nowhere, so there is nothing to ask about.
   */
  askFirst?: unknown
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
      reason: 'They can put you forward for jobs now. You can take it back at any time.',
      // grantedAt is stamped here and only here, which is the whole
      // point: it now means the moment somebody agreed rather than the
      // moment a vendor typed their name.
      data: {
        state: 'GRANTED', grantedAt: now, respondedAt: now, declinedNote: null,
        ...(typeof askFirst === 'boolean' ? { askFirst } : {}),
      },
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

/**
 * What saying yes actually lets a firm do, in the words the invitation
 * uses — read off the setting the listing will carry, never written
 * beside it.
 *
 * Found by a tester on 2026-09-30. The invitation promised "they will
 * ask before every single submission" and the listing it created had
 * "ask me first" switched off, which is the schema's default on purpose:
 * somebody who grants a listing is asking to be marketed. A promise the
 * setting does not keep is the one thing a consent screen may not say.
 * So the sentence follows the setting, and the setting is the person's
 * own choice on the same screen.
 *
 * Even "ask me first" is narrower than "every submission": it asks
 * before a client they have not been sent to before, and a second job
 * at the same client needs no new question (`lib/representation`). The
 * sentence says exactly that.
 */
export function whatYesMeans(o: { vendor: string; askFirst: boolean }): string {
  return o.askFirst
    ? `Saying yes lets ${o.vendor} put you forward for contract jobs. Before they send you to a ` +
        `client they have not sent you to before, they ask you first. You can take this back ` +
        `whenever you like.`
    : `Saying yes lets ${o.vendor} put you forward for contract jobs without asking you each ` +
        `time. If you would rather be asked before each new client, tick the box below — you can ` +
        `change it later on your own page. You can take this back whenever you like.`
}

/** The box that sets it, in the same words the person's own page uses. */
export const ASK_FIRST_CHOICE = 'Ask me before sending me to a client I have not been sent to before'

// ── The firm hears the answer ─────────────────────────────────────────

/**
 * What the firm that asked is told when the person answers.
 *
 * Found by the bench tester on 2026-09-30: "Lucia agreed to be marketed
 * by you" was written to Lucia's own inbox — the notification carried
 * the consultant's `personId` — so the firm that asked was never told,
 * and a decline reason meant for the firm landed with the person who
 * wrote it. The words were right and the address was wrong.
 *
 * The reason for a no is the firm's to read only because the person
 * typed it into a box that says "only they see it". An empty box is
 * "no reason given", never a guess.
 */
export function answerNotice(o: {
  personName: string
  said: 'ACCEPT' | 'DECLINE'
  note?: string | null
  /** Whether they asked to be asked before each new client. */
  askFirst?: boolean | null
  /** How long they chose to stay, in days; null for until they cancel. */
  stayDays?: number | null
}): { title: string; body: string } {
  if (o.said === 'ACCEPT') {
    const stay = o.stayDays ? ` They chose to stay ${o.stayDays} days.` : ''
    const ask = o.askFirst
      ? ' They asked to be asked before you send them to a client you have not sent them to before.'
      : ''
    return {
      title: `${o.personName} agreed to be on your bench`,
      body: `You can put them forward for jobs now.${stay}${ask}`,
    }
  }
  const note = o.note?.trim()
  return {
    title: `${o.personName} said no to your bench invitation`,
    body: note ? `They said: ${note.slice(0, 300)}` : 'No reason given.',
  }
}

/**
 * Who at the firm hears the answer: whoever sent the invitation, and
 * every desk that puts people forward. Never the person who answered —
 * they know what they said.
 *
 * Where nobody is recorded as the inviter and no desk puts people
 * forward, the desks that manage the firm's people hear it instead, so
 * an answer is never addressed to nobody.
 */
export function whoHearsTheAnswer(o: {
  /** Whoever sent the invitation, where it was recorded. */
  invitedBy: string | null
  /** Every live seat at the firm and what it may do. */
  seats: readonly { personId: string; permissions: readonly string[] }[]
  /** The person who answered. */
  subjectPersonId: string
}): string[] {
  const out: string[] = []
  const add = (id: string | null | undefined) => {
    if (id && id !== o.subjectPersonId && !out.includes(id)) out.push(id)
  }
  add(o.invitedBy)
  for (const s of o.seats) if (hasPermission(s.permissions, 'submissions.create')) add(s.personId)
  if (out.length === 0) {
    for (const s of o.seats) if (hasPermission(s.permissions, 'consultants.write')) add(s.personId)
  }
  return out
}
