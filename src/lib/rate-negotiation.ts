/**
 * A consultant answering the rate they are being offered.
 *
 * ── What is missing today ────────────────────────────────────────────
 *
 * `Submission.rate` is set by the vendor and the person it concerns has
 * no move. They consent to being submitted — the whole consent ask
 * exists for that — and then the number attached to them is somebody
 * else's decision. 2017 let them counter, and this is that, built the
 * way it should be.
 *
 * ── Where the state lives, and why not in columns ────────────────────
 *
 * 2017 kept three fields on the application: `accept_rate`,
 * `accept_rate_by_company`, `rate_initiator`. It also posted every offer
 * into the conversation, and then — the part worth stealing — demoted
 * each superseded `rate_confirmation` message so only the live offer
 * stood.
 *
 * That demotion is the tell. The flags and the thread were two records
 * of one thing, and keeping them agreeing required mutating history
 * every time somebody moved.
 *
 * So there are no flags. **The thread is the negotiation.** Each offer,
 * acceptance and refusal is a message with the figure in its metadata,
 * and the state is read off the end of it. Nothing to keep in step,
 * nothing to migrate, and — because nothing is ever demoted or
 * rewritten — the whole negotiation stays readable afterwards, which
 * matters the first time anybody disputes what was agreed.
 *
 * `Conversation.topic = 'SUBMISSION'` and `Message.type =
 * 'RATE_CONFIRMATION'` already exist. This needed no schema change.
 */

export type Side = 'CANDIDATE' | 'VENDOR'
export type Move = 'OFFER' | 'ACCEPT' | 'DECLINE'

export interface Event {
  at: Date
  by: Side
  move: Move
  /** Cents per hour. Required on an OFFER, ignored otherwise. */
  cents?: number | null
}

export type Stage =
  /** Nobody has proposed anything. */
  | 'NOT_STARTED'
  /** An offer is on the table, waiting on the other side. */
  | 'AWAITING'
  /** Both sides agreed the same figure. Closed. */
  | 'AGREED'
  /** Somebody walked away from it. */
  | 'DECLINED'

export interface State {
  stage: Stage
  /** The figure currently on the table, in cents per hour. */
  liveCents: number | null
  /** Who made it. */
  offeredBy: Side | null
  /** Who has to move next. Null when nothing is owed. */
  awaiting: Side | null
  /** Whether this side may still counter. */
  mayCounter: (side: Side) => boolean
  says: string
}

const other = (s: Side): Side => (s === 'CANDIDATE' ? 'VENDOR' : 'CANDIDATE')
const money = (c: number) => `$${(c / 100).toFixed(2).replace(/\.00$/, '')}/hr`

/**
 * Read the negotiation off the thread.
 *
 * Events are taken in order and the last one that matters wins, which is
 * the whole reason for not storing a summary alongside them.
 */
export function negotiation(events: Event[]): State {
  const ordered = [...events].sort((a, b) => a.at.getTime() - b.at.getTime())

  let liveCents: number | null = null
  let offeredBy: Side | null = null
  let accepted: Side | null = null
  let declinedBy: Side | null = null

  for (const e of ordered) {
    if (e.move === 'OFFER') {
      if (typeof e.cents !== 'number' || e.cents <= 0) continue
      liveCents = e.cents
      offeredBy = e.by
      // A counter reopens the question on both sides. 2017 cleared both
      // acceptance flags for the same reason: agreeing to a number
      // nobody is offering any more is agreeing to nothing.
      accepted = null
      declinedBy = null
    } else if (e.move === 'ACCEPT') {
      // Only ever an acceptance of what is on the table, and only by the
      // side that did not put it there. Accepting your own offer is not
      // a move.
      if (liveCents !== null && e.by !== offeredBy) accepted = e.by
    } else {
      declinedBy = e.by
    }
  }

  const stage: Stage =
    declinedBy !== null ? 'DECLINED'
      : accepted !== null ? 'AGREED'
        : liveCents === null ? 'NOT_STARTED'
          : 'AWAITING'

  const awaiting = stage === 'AWAITING' && offeredBy ? other(offeredBy) : null

  return {
    stage,
    liveCents,
    offeredBy,
    awaiting,
    // Once it is agreed it is closed, to both of them. 2017 refused a
    // candidate reopening their own acceptance — *"You cannot change
    // the rate once accepted by you"* — and it should bind the vendor
    // just as tightly, or an agreement is only an agreement one way.
    mayCounter: () => stage === 'AWAITING' || stage === 'NOT_STARTED',
    says: saysOf(stage, liveCents, offeredBy, awaiting),
  }
}

function saysOf(stage: Stage, cents: number | null, by: Side | null, awaiting: Side | null): string {
  switch (stage) {
    case 'NOT_STARTED':
      return 'No rate has been proposed yet.'
    case 'AGREED':
      return `Agreed at ${money(cents!)}. Neither side can change it now.`
    case 'DECLINED':
      return 'Somebody walked away from this rate. Nothing is on the table.'
    case 'AWAITING':
      return by === 'CANDIDATE'
        ? `You asked for ${money(cents!)}. Waiting on them.`
        : `They have offered ${money(cents!)}. It is with you.`
  }
}

/**
 * Whether this side may move at all, and why not where they may not.
 *
 * Said rather than returned as a boolean, because the interesting cases
 * are the refusals and a caller that only gets `false` has to invent the
 * sentence itself.
 */
export function mayMove(s: State, side: Side, move: Move): { ok: boolean; reason: string } {
  if (s.stage === 'AGREED') {
    return { ok: false, reason: `This was agreed at ${money(s.liveCents!)}. Neither side can reopen it.` }
  }
  if (s.stage === 'DECLINED') {
    return { ok: false, reason: 'This rate was declined. Somebody has to make a fresh offer.' }
  }

  if (move === 'ACCEPT') {
    if (s.liveCents === null) return { ok: false, reason: 'There is nothing on the table to accept.' }
    if (s.offeredBy === side) {
      return { ok: false, reason: 'That is your own offer. You are waiting on them, not the other way round.' }
    }
    return { ok: true, reason: `Accepting ${money(s.liveCents)}.` }
  }

  if (move === 'OFFER') {
    // Countering your own live offer is allowed and is just a revision —
    // somebody realising they asked for the wrong number should not have
    // to wait for a refusal to fix it.
    return { ok: true, reason: s.liveCents === null ? 'Opening the rate.' : 'Countering.' }
  }

  if (s.liveCents === null) return { ok: false, reason: 'There is nothing on the table to decline.' }
  return { ok: true, reason: 'Declining.' }
}

/**
 * What the message in the thread says.
 *
 * In the third person on purpose — everybody in the thread reads the
 * same sentence, and "you countered" is wrong for every reader but one.
 */
export function messageFor(e: Event, name: string): string {
  switch (e.move) {
    case 'OFFER':
      return `${name} proposed ${money(e.cents!)}.`
    case 'ACCEPT':
      return `${name} accepted.`
    case 'DECLINE':
      return `${name} declined this rate.`
  }
}
