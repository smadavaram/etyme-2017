/**
 * Messages to and from a client's own system about invoice lines.
 *
 * Layer 9, slice 2 (records 80, 86, 87). Every message has a state, a
 * failed one can be sent again after a fix, and a line is never in two
 * live files. This file answers the two questions the rows are kept for:
 * "may this line go in a new file?" and "what key makes a request for the
 * same thing find the same row?".
 *
 * Pure. No database.
 */

import { formatDay } from '@/lib/format-date'

export type FeedState = 'QUEUED' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'PAID' | 'FAILED' | 'SUPERSEDED'
export type FeedDirection = 'OUT' | 'IN'

export interface FeedMessageRead {
  state: FeedState
  direction: FeedDirection
  createdAt: Date
}

/** Which answer wins where two messages carry the same moment. */
const RANK: Record<FeedState, number> = {
  SUPERSEDED: 0, QUEUED: 1, FAILED: 2, REJECTED: 3, SENT: 4, ACCEPTED: 5, PAID: 6,
}

export type MayGoInFile = { ok: true } | { ok: false; says: string }

/**
 * May this line go in a new file?
 *
 * Yes when it was never sent, or when its latest message is a rejection
 * or a failure and the line was fixed after it. No when it is waiting to
 * go, sent, accepted or paid. A superseded message is history and is not
 * read. `fixedAt` is when the receipt was last changed; null where
 * nobody knows, and then a rejected line stays held rather than being
 * sent unchanged again.
 */
export function mayGoInFile(messages: readonly FeedMessageRead[], fixedAt: Date | null): MayGoInFile {
  const live = messages.filter((m) => m.state !== 'SUPERSEDED')
  if (live.length === 0) return { ok: true }
  const last = [...live].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || RANK[a.state] - RANK[b.state],
  )[live.length - 1]
  switch (last.state) {
    case 'QUEUED':
      return { ok: false, says: 'This line is already waiting in a file that has not left yet.' }
    case 'SENT':
      return { ok: false, says: 'This line is in a file that was sent. It goes again only if your system rejects it or the send fails.' }
    case 'ACCEPTED':
      return { ok: false, says: 'Your system accepted this line, so it is not sent again.' }
    case 'PAID':
      return { ok: false, says: 'This line is paid, so it is not sent again.' }
    case 'REJECTED':
    case 'FAILED': {
      const why = last.state === 'REJECTED' ? 'rejected' : 'not delivered'
      if (fixedAt && fixedAt.getTime() > last.createdAt.getTime()) return { ok: true }
      return { ok: false, says: `This line was ${why} and has not been changed since. Fix it, then send it again.` }
    }
    default:
      return { ok: true }
  }
}

/**
 * The key a message is stored under. One run, one line, one share, one
 * direction and one generation make one key, so a second request for the
 * same run finds the first row. A re-send after a fix is the next
 * generation: the number of earlier messages in that direction.
 */
export function feedKey(input: {
  runId: string
  lineId: string
  shareKey?: string | null
  direction: FeedDirection
  generation: number
}): string {
  return [input.runId, input.lineId, input.shareKey ?? '', input.direction, String(input.generation)].join(':')
}

/** The generation the next message takes: how many went before it. */
export function nextGeneration(messages: readonly { direction: FeedDirection }[], direction: FeedDirection): number {
  return messages.filter((m) => m.direction === direction).length + 1
}

// ── What a line says about itself, in the reader's words ──────────────

export interface FeedStateRead extends FeedMessageRead {
  reason?: string | null
  externalRef?: string | null
  /** For a PAID answer, the day the money left. */
  answeredAt?: Date | null
}


/** The message that stands for a line: the latest live one, a later answer beating an earlier send. */
export function standingMessage<T extends FeedMessageRead>(messages: readonly T[]): T | null {
  const live = messages.filter((m) => m.state !== 'SUPERSEDED')
  if (live.length === 0) return null
  return [...live].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || RANK[a.state] - RANK[b.state])[live.length - 1]
}

/**
 * One line's state as a sentence. `notSentBecause` is why the line is not
 * in a file (the file's own sentence), or null. The payer reads "your
 * system"; the supplier reads "the client's system".
 */
export function stateInWords(
  stands: FeedStateRead | null,
  notSentBecause: string | null,
  reader: 'PAYER' | 'SUPPLIER' = 'PAYER',
): string {
  const system = reader === 'PAYER' ? 'your system' : 'the client’s system'
  if (!stands || stands.state === 'QUEUED') {
    return `Not sent yet: ${notSentBecause ?? 'the file has not been downloaded.'}`
  }
  switch (stands.state) {
    case 'SENT':
      return reader === 'PAYER' ? 'Sent' : 'Sent to the client’s system'
    case 'ACCEPTED':
      return reader === 'PAYER' ? 'Accepted by your system' : 'Accepted by the client’s system'
    case 'REJECTED':
      return `Rejected: ${stands.reason?.trim() || `${system} gave no reason`}`
    case 'FAILED':
      return `Not delivered: ${stands.reason?.trim() || 'the send failed'}`
    case 'PAID':
      return `Paid on ${stands.answeredAt ? formatDay(stands.answeredAt) : 'a day not recorded'}` +
        (stands.externalRef ? `, ref ${stands.externalRef}` : '')
    default:
      return `Not sent yet: ${notSentBecause ?? 'the file has not been downloaded.'}`
  }
}

/**
 * Several rows of one line (a split) read as one state: any rejection or
 * failure first, otherwise the least advanced row.
 */
export function standingOfRows<T extends FeedMessageRead>(rows: readonly (T | null)[]): T | null {
  if (rows.length === 0 || rows.some((r) => r === null)) return null
  const list = rows as T[]
  const bad = list.find((r) => r.state === 'REJECTED' || r.state === 'FAILED')
  if (bad) return bad
  return [...list].sort((a, b) => RANK[a.state] - RANK[b.state])[0]
}
