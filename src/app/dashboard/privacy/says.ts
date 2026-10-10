/**
 * What the compliance desk's page may say, and when.
 *
 * Pure, and apart from the page, so each rule is a sentence somebody can
 * check. Round five of the sign-up walk found the page saying three
 * untrue things, each a confident all-clear:
 *
 *   - "Nothing is waiting on this desk today." over a refusal, and before
 *     the first read had come back at all;
 *   - "Requests 0" and "Holds 0" on a desk the reader could not see;
 *   - "Incidents 0 … Nothing has gone anywhere it should not have." under
 *     a refused read of the incidents list — the one panel on the page
 *     where a zero is a legal statement.
 *
 * So: an all-clear is drawn only after the read behind it succeeded; a
 * refusal draws its own sentence and no figure; loading draws nothing.
 */

import { deskRefusal } from '@/lib/data-request'

/** One read, as the page holds it: what came back, or the sentence. */
export interface Read<T> {
  data: T | null
  error: string | null
}

/** What one list on the page shows. */
export type ListView<T> =
  | { show: 'refused'; says: string }
  | { show: 'list'; rows: T[] }

export type PrivacyView<R, H, B> =
  | { show: 'loading' }
  | { show: 'refused'; says: string }
  | {
      show: 'page'
      /** Null where the queue could not be read — no headline is better than a false one. */
      headline: string | null
      requests: ListView<R>
      holds: ListView<H>
      incidents: ListView<B>
    }

function list<T>(read: Read<T[]>): ListView<T> {
  if (read.error) return { show: 'refused', says: read.error }
  return { show: 'list', rows: read.data ?? [] }
}

/**
 * The headline over the queue, from requests that were actually read.
 *
 * `open` and `urgent` are counts; the caller decides what is open and
 * what is due inside a day, because the clock is the page's.
 */
export function privacyHeadline(open: number, urgent: number): string {
  if (open === 0) return 'Nothing is waiting on this desk today.'
  return (
    `${open} request${open === 1 ? '' : 's'} need${open === 1 ? 's' : ''} you.` +
    (urgent > 0 ? ` ${urgent} ${urgent === 1 ? 'is' : 'are'} due inside a day.` : '')
  )
}

/**
 * The whole page, decided once.
 *
 * - While any read is outstanding: loading, and nothing else — no
 *   headline, no count, no empty list.
 * - Where both of the lists every compliance desk has were refused: the
 *   refusal alone, in the route's own words.
 * - Otherwise the page, with each list drawn as its rows where its read
 *   succeeded and as its sentence where it did not. A list that was
 *   refused never draws its empty message, because "nobody has asked"
 *   and "you may not see who asked" are different facts.
 */
export function privacyView<R, H, B>(input: {
  loading: boolean
  requests: Read<R[]>
  holds: Read<H[]>
  incidents: Read<B[]>
  /** Counts read off the requests, for the headline. */
  open: number
  urgent: number
}): PrivacyView<R, H, B> {
  if (input.loading) return { show: 'loading' }
  const refused = deskRefusal({ requests: input.requests.error, holds: input.holds.error })
  if (refused) return { show: 'refused', says: refused }
  return {
    show: 'page',
    headline: input.requests.error ? null : privacyHeadline(input.open, input.urgent),
    requests: list(input.requests),
    holds: list(input.holds),
    incidents: list(input.incidents),
  }
}
