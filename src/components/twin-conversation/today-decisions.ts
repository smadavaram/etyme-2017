import { queueCards, queueFrom, type QueueCard, type QueueRead } from '@/app/api/conversations/twin/ask'

/**
 * Today's decision rows (founder, 2026-11-08, "One app, two tabs":
 * "Dashboard's Today is the queue"). Each decision on the one decisions
 * list (GET /api/decisions, the list the number on Ask Etyme counts) is a
 * row with Yes and Not now, and the row is the same card Ask Etyme draws:
 * `queueCards` turns a row into its act through the one route that already
 * performs it, so a card in the chat and a row here are one decision and
 * nothing is computed twice.
 *
 * Pure: no fetch, no React. The component in ./decision-rows draws it.
 */

/** Where a question from Ask Etyme is answered: the chat, where its card asks for any field it needs. */
export const ASK_ETYME_PATH = '/dashboard/conversations/etyme'

/** What the button on a question from Ask Etyme says. */
export const OPEN_IN_ASK_ETYME = 'Open in Ask Etyme'

/** The decisions list as Today's rows: the queue's own cards, then Ask Etyme's questions, which open the chat. */
export function todayRows(body: unknown): { read: QueueRead | null; rows: QueueCard[] } {
  const read = queueFrom(body)
  if (!read) return { read: null, rows: [] }
  const asked: QueueCard[] = read.items
    .filter((d) => d.type === 'TWIN_QUESTION')
    .map((d) => ({
      key: `${d.type}:${d.entityId}`,
      type: d.type,
      title: d.title.replace(/[.\s]*$/, '.'),
      fact: (d.subtitle ?? '').split(' · ').slice(0, 2).join(' · '),
      href: ASK_ETYME_PATH,
      act: null,
      open: OPEN_IN_ASK_ETYME,
    }))
  return { read, rows: [...queueCards(read), ...asked] }
}

/**
 * The rows "Yes to all" may press, or null where it is not offered.
 *
 * Offered only where more than one row is open and every open row is one
 * press through its own route with nothing to type: never where a row
 * opens a page instead (a receipt to pay needs its bank reference, a week
 * flagged over its hours needs a reason, a question from Ask Etyme may
 * need a rate or a reference), because a batch that skips one of them, or
 * says yes for a field nobody filled, is a decision nobody made.
 */
export function batchOf(rows: readonly QueueCard[], settled: ReadonlySet<string> = new Set()): QueueCard[] | null {
  const open = rows.filter((r) => !settled.has(r.key))
  if (open.length < 2) return null
  if (!open.every((r) => r.act != null)) return null
  return open
}

/** "Yes to all 3". */
export function batchLabel(n: number): string {
  return `Yes to all ${n}`
}

/** What a batch said, once every row answered: how many went, and the first sentence of any that did not. */
export function batchSays(results: ReadonlyArray<{ ok: boolean; says: string }>): string {
  const done = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok)
  const head = `${done} of ${results.length} done, each recorded under your name.`
  return failed.length === 0 ? head : `${head} ${failed[0].says}`
}
