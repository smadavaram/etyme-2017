/**
 * Whose books a money screen is showing, kept in the URL.
 *
 * ── The failure this exists for ──────────────────────────────────────
 *
 * A program office running a client's program reads that client's
 * invoices, purchase orders and payables from the seat the client
 * granted it, and three of those pages carry a switch back to its own
 * book: "Read our own books instead."
 *
 * The switch worked and the choice lived nowhere. It was React state
 * and only React state, so `?books=own` typed into the address bar did
 * nothing on load, a refresh put the reader back on the client's book
 * without saying so, and nobody could send a colleague a link to what
 * they were looking at. Every other "choose a view" in the product — the
 * feed against the table, the sell side against the buy side — survives
 * a reload.
 *
 * It matters more here than on a feed. These are two companies' money.
 * A reader who refreshes and does not notice which book came back is a
 * reader about to read one firm's total as another's, and a link that
 * silently means something different to the person who opens it is
 * worse than no link.
 *
 * ── Why a file and not three `useState` calls ────────────────────────
 *
 * The parameter is the same word on all three pages and the API reads
 * the same word on the way back in (`books=own` on `/api/invoices`,
 * `/api/purchase-orders` and `/api/ap`). Three pages spelling it
 * themselves is three chances to spell it differently.
 *
 * No React and no database in here, so the answer is the same in a
 * test, on a page and in a link somebody pasted into a chat.
 */

/** Which book a money page is showing. */
export type Books =
  /** The client's, read from the seat that client granted. The default. */
  | 'seat'
  /** The reader's own firm's. */
  | 'own'

/** The one spelling of the parameter, everywhere. */
export const BOOKS_PARAM = 'books'

/** The one value that means "our own". */
export const OWN = 'own'

/**
 * What a URL says.
 *
 * Anything that is not exactly `own` reads as the seat's book, because
 * the seat is what the reader was granted and a typo must not quietly
 * change which company's money is on screen.
 */
export function booksFrom(value: string | null | undefined): Books {
  return value === OWN ? 'own' : 'seat'
}

/**
 * The URL that says what is on screen.
 *
 * The seat's book is the default, so it is spelled by the parameter's
 * absence rather than by `books=seat` — a clean address for the common
 * case, and one fewer value to get wrong.
 */
export function booksHref(path: string, books: Books): string {
  return books === 'own' ? `${path}?${BOOKS_PARAM}=${OWN}` : path
}

/** The other one. What the switch goes to. */
export function otherBooks(books: Books): Books {
  return books === 'own' ? 'seat' : 'own'
}

/**
 * The words on the switch.
 *
 * Named per page because "orders" and "books" are different nouns to
 * the person reading, and the label has to say what they will get
 * rather than where they are.
 */
export function switchLabel(books: Books, noun: string): string {
  return books === 'own' ? 'Read the program you run' : `Read our own ${noun} instead`
}
