import { randomBytes } from 'crypto'

/**
 * Sharing documents with someone who does not work here.
 *
 * An immigration lawyer preparing an H1B petition needs the passport, the
 * degree evaluation, the previous I-797 and the client letter. An
 * accountant filing a franchise registration needs the incorporation
 * documents and the last two years of returns.
 *
 * Neither of them will create an account. Asked to, they will say "just
 * email me the files" — and then the files are in an inbox forever, on a
 * mail server nobody controls, with no record of who opened them. That is
 * the workflow this replaces, so the bar is that it must be EASIER than
 * attaching them to an email, or it will not be used.
 *
 * A link is easier. Three things make a link safe enough to send:
 *
 *   It expires. Always, and not far away.
 *   It can be killed, immediately, by one person.
 *   Every open is recorded — and shown to the person whose documents these
 *   are, not only to the company that sent them.
 *
 * That last one follows from the existing invariant: every read of another
 * person's data writes an AccessLog row. A lawyer reading Ravi's passport
 * is a read of Ravi's data. Being outside the company does not change that.
 */

export type ShareState = 'ACTIVE' | 'EXPIRED' | 'REVOKED'

export interface ShareFacts {
  expiresAt: Date
  revokedAt: Date | null
}

export interface ShareVerdict {
  state: ShareState
  /** Whether the documents may be read right now. */
  readable: boolean
  /** What the recipient is told when they cannot. */
  message: string | null
}

/** Long enough that guessing is not a strategy. */
export function newToken(): string {
  return randomBytes(32).toString('base64url')
}

/** The longest a share may run. Longer than a petition takes, shorter than forever. */
export const MAX_DAYS = 180
/** What it is if nobody says. */
export const DEFAULT_DAYS = 30

export function clampExpiry(requestedDays: number | null | undefined, from: Date): Date {
  const days = Math.min(MAX_DAYS, Math.max(1, requestedDays ?? DEFAULT_DAYS))
  const d = new Date(from)
  d.setDate(d.getDate() + days)
  return d
}

/**
 * May this link be opened?
 *
 * Revocation beats expiry in the message, because they are different
 * conversations: an expired link is reissued, a revoked one was taken away
 * on purpose and the recipient should ring the person who sent it.
 */
export function checkShare(facts: ShareFacts, now: Date): ShareVerdict {
  if (facts.revokedAt) {
    return {
      state: 'REVOKED',
      readable: false,
      message: 'This link was withdrawn. Contact whoever sent it to you.',
    }
  }
  if (facts.expiresAt <= now) {
    return {
      state: 'EXPIRED',
      readable: false,
      message: `This link expired on ${facts.expiresAt.toISOString().slice(0, 10)}. Ask for a new one.`,
    }
  }
  return { state: 'ACTIVE', readable: true, message: null }
}

/** Days left, for the sender's list. Negative once it has gone. */
export function daysLeft(expiresAt: Date, now: Date): number {
  return Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000)
}

export interface ShareSummary {
  state: ShareState
  daysLeft: number
  openedCount: number
  lastOpenedAt: Date | null
  /** Sent, never opened, and running out — the one worth chasing. */
  needsChasing: boolean
}

/**
 * How a share is going, for whoever sent it.
 *
 * The useful signal is not how many times it was opened. It is a share that
 * was never opened and is about to expire — the lawyer did not get it, or
 * it went to spam, and nobody will find out until the petition is late.
 */
export function summarise(
  facts: ShareFacts,
  accesses: { at: Date }[],
  now: Date
): ShareSummary {
  const verdict = checkShare(facts, now)
  const left = daysLeft(facts.expiresAt, now)
  const sorted = [...accesses].sort((a, b) => b.at.getTime() - a.at.getTime())

  return {
    state: verdict.state,
    daysLeft: left,
    openedCount: accesses.length,
    lastOpenedAt: sorted[0]?.at ?? null,
    needsChasing: verdict.state === 'ACTIVE' && accesses.length === 0 && left <= 7,
  }
}

/** The kinds of document this schema can put in a package. */
export const SHAREABLE_KINDS = ['VERIFICATION_DOC', 'VISA_DOCUMENT', 'DOC_INSTANCE'] as const
export type ShareableKind = (typeof SHAREABLE_KINDS)[number]

export function isShareableKind(kind: string): kind is ShareableKind {
  return (SHAREABLE_KINDS as readonly string[]).includes(kind)
}
