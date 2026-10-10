import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * The four states a screen is in before it has rows to show, as four
 * primitives, so no page hand-rolls them again.
 *
 * Every one takes a sentence. The sentence is the product (CLAUDE.md,
 * "Explain in a sentence, not a code"): "Nobody is on site at Northbend
 * Athletic today.", never "No data.".
 *
 * Three of them may carry one action. The fourth, `RefusedState`, may
 * not: a refused page is its sentence alone (sign-up walk, rounds four
 * to seven). A heading over a refusal reads as a page that loaded and is
 * empty; a button under it offers a door the route has just shut; a tile
 * beside it shows a zero nobody computed.
 *
 * No 'use client' here: none of them holds state, so a server page and
 * a client page may both draw them.
 */

/** One action under a state: a link somewhere, or a button that does something. */
export type StateAction =
  | { label: string; href: string; onClick?: never }
  | { label: string; onClick: () => void; href?: never }

function ActionFor({ action }: { action: StateAction }) {
  if (action.href !== undefined) {
    return (
      <Link href={action.href as any} className="btn-secondary inline-flex items-center">
        {action.label}
      </Link>
    )
  }
  return (
    <button type="button" onClick={action.onClick} className="btn-secondary inline-flex items-center">
      {action.label}
    </button>
  )
}

/**
 * Nothing here yet. One sentence saying what would be here and, where
 * there is one, the one thing to do about it.
 *
 * `detail` is a second, quieter line: why it is empty, or what fills it.
 */
export function EmptyState({ says, detail, action, compact = false }: {
  says: ReactNode
  detail?: ReactNode
  action?: StateAction
  /** Inside a panel or a table, where a tall box would be a hole. */
  compact?: boolean
}) {
  return (
    <div data-state="empty" className={compact ? 'px-4 py-8 text-center' : 'panel px-6 py-12 text-center'}>
      <p className="mx-auto max-w-md text-[14px] text-etyme-ink text-balance">{says}</p>
      {detail && <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed text-etyme-muted">{detail}</p>}
      {action && <div className="mt-5"><ActionFor action={action} /></div>}
    </div>
  )
}

/**
 * Still reading. Says what it is opening — "Opening the placement…" — so
 * a slow page reads as a page on its way, not a page that is broken.
 * A screen reader is told once, politely.
 */
export function LoadingState({ says = 'Loading…', compact = false }: {
  says?: string
  compact?: boolean
}) {
  return (
    <div
      data-state="loading"
      role="status"
      aria-live="polite"
      className={compact ? 'px-4 py-8 text-center' : 'panel px-6 py-12 text-center'}
    >
      <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-16 overflow-hidden rounded-pill bg-etyme-sunk">
        <span className="block h-full w-1/3 rounded-pill bg-etyme-faint motion-safe:animate-pulse" />
      </span>
      <p className="text-[13px] text-etyme-muted">{says}</p>
    </div>
  )
}

/**
 * Something broke that is not a refusal: the network, a server error.
 * Says what broke, and offers to try again where the page can.
 *
 * A refusal is not an error. A route that said "That is not part of your
 * seat" has answered; draw `RefusedState` with its sentence.
 */
export function ErrorState({ says, action }: {
  says: ReactNode
  /** Usually "Try again". Absent where trying again changes nothing. */
  action?: StateAction
}) {
  return (
    <div data-state="error" role="alert" className="rounded-panel border border-etyme-danger-line bg-etyme-danger-wash px-5 py-4">
      <p className="text-[13.5px] leading-relaxed text-etyme-ink">{says}</p>
      {action && <div className="mt-3"><ActionFor action={action} /></div>}
    </div>
  )
}

/**
 * A refused page: the route's own sentence, and nothing else.
 *
 * It takes no heading, no action and no children, on purpose — the
 * props are the rule. The sentence names the page in the reader's words
 * and the desk that does it ("Expenses is not part of your seat at
 * Northbend Athletic. Ask your company's owner if you need it."), which
 * is everything the reader can act on.
 */
export function RefusedState({ says }: { says: string }) {
  return (
    <p data-state="refused" role="alert" className="max-w-xl py-8 text-[14px] leading-relaxed text-etyme-muted">
      {says}
    </p>
  )
}
