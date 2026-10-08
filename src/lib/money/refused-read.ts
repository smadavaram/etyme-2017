import { refusalSentence } from '@/lib/refusal-words'

/**
 * A money page whose read was refused draws one sentence and nothing else.
 *
 * Sign-up walk, round four, problem 5. A Member with no desk opened
 * Invoice receipts and read "OUTSTANDING $0 we owe" above the refusal,
 * and Expenses drew "$0.00" over its own. A zero is an answer, and the
 * page did not have one: the route had refused to say. A reader who
 * glances at the tile and not the sentence under it walks away believing
 * nothing is owed — a plausible wrong number, the worst kind.
 *
 * So the fetch keeps what the route said when it refused (`refusalOf`),
 * and the page, once it knows whose company it is, asks `refusedRead`
 * for the sentence and draws it in place of everything — no tiles, no
 * tabs, no table. Every other failure (a 500, a network drop) stays an
 * error on the table, because that is "could not read", not "may not".
 *
 * The sentence passes through `refusalSentence`, so a route that still
 * answers with a permission key reaches the reader as the desk that does
 * it, never as the key (`the-desk-not-the-key`).
 *
 * Pure: no React, no database.
 */

/** What a refused read said, or null where the read was not refused. */
export function refusalOf(status: number, body: unknown): string | null {
  if (status !== 403) return null
  const message = (body as { error?: { message?: unknown } } | null)?.error?.message
  return typeof message === 'string' ? message.trim() : ''
}

/**
 * The one sentence a refused money page draws, or null where nothing
 * was refused. `what` is the page in the reader's words — "Invoice
 * receipts", "Expenses" — and is used only where the route said nothing.
 */
export function refusedRead(
  said: string | null,
  opts: { what: string; kind?: string | null; company?: string | null }
): string | null {
  if (said === null) return null
  const sentence = refusalSentence(said, { kind: opts.kind, company: opts.company, what: opts.what })
  if (sentence) return sentence
  const at = opts.company?.trim() ? ` at ${opts.company.trim()}` : ''
  return `${opts.what} is not part of your seat${at}. Ask your company’s owner if you need it.`
}
