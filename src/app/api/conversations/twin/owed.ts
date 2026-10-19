import { cardsFor, type WorkerFacts } from './worker'

/**
 * The number on the Ask Etyme mark, read without the greeting's one write.
 *
 * GET /api/conversations/twin?only=owed answers `{ data: { total } }`,
 * the shape `owedFrom` in lib/owed-count already reads off
 * GET /api/decisions, so the mark can ask either and print the same thing.
 *
 * Why it exists: the decisions queue owes a worker nothing — she signs no
 * week and pays no bill — so her mark showed no number while her greeting
 * said "Three things need you". The greeting itself cannot be polled,
 * because saying a notice marks it read; a mark asking once a minute would
 * empty "Since you last looked" before she ever opened the chat.
 *
 * So this is the greeting's own count and nothing else:
 *   - a worker: her cards, `cardsFor` over her facts, the figure her
 *     greeting says as "n things need you";
 *   - a firm's seat: the decisions queue's `total`, the figure the
 *     greeting's headline leads with.
 * No notice is marked seen, no line is kept on the thread, nothing is
 * acted on. A figure that could not be read is null, never zero: a badge
 * that is wrong is worse than none.
 */
export interface OwedReads {
  /** Whether the seat reads Ask Etyme as a worker (`isWorkerSeat`). */
  worker: boolean
  /** Her own facts, from her own doors. Read only for a worker. */
  facts: () => Promise<WorkerFacts>
  /** GET /api/decisions' `total` for this seat, or null. Read only for a firm's seat. */
  needs: () => Promise<number | null>
}

export async function owedTotal(read: OwedReads): Promise<number | null> {
  if (read.worker) return cardsFor(await read.facts()).length
  const n = await read.needs().catch(() => null)
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : null
}
