/**
 * What heads a list page that may be read by a seat with no desk.
 * Pure: no database, no clock.
 *
 * Sign-up walk, round seven (2026-10-08), problem 5. Karthik Menon, a W2
 * worker at Teleworld with no desk, opened Submissions and for three
 * seconds read the firm's sentence — "Candidates you submitted to client
 * job requests" — under a "+ Submit" button he cannot use. When the read
 * came back the button went, but the firm's sentence stayed, above "These
 * are the times you were put forward by Teleworld Solutions." He
 * submitted nobody.
 *
 * Who is reading is known only once the list's own read has answered:
 * the route says `desk.ownOnly`, and nothing on the client can guess it.
 * So nothing framed is drawn until then, and once the route has said
 * "own only" the heading sentence is the route's own sentence and the
 * firm's words and its buttons are not drawn at all.
 */
export type ListHead =
  /** The read has not answered: draw "Loading…" alone. */
  | { state: 'LOADING' }
  /** The reader sees only their own rows: the route's sentence, no firm furniture. */
  | { state: 'OWN'; says: string }
  /** A desk reads the firm's list: the firm's sentence and its buttons. */
  | { state: 'DESK'; says: string }

export function listHead(input: {
  /** Whether the list's first read has answered. */
  readOnce: boolean
  /** The route's own-only sentence, or null when the route did not say ownOnly. */
  ownSays: string | null | undefined
  /** The firm's sentence for a desk. */
  firmSays: string
}): ListHead {
  if (!input.readOnce) return { state: 'LOADING' }
  const own = input.ownSays?.trim()
  if (own) return { state: 'OWN', says: own }
  return { state: 'DESK', says: input.firmSays }
}
