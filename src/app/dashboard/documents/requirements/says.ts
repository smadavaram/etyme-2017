import { noDeskYet } from '@/lib/no-desk'

/**
 * What the document-set page says when it was opened with no order and
 * no line behind it.
 *
 * Sign-up walk, round seven, problem 7. The page told everybody "Open
 * this from an order or from a placement" — Mo and Lee, Members at a
 * client; Sam, a Member at a supplier; Nina, a candidate at no company.
 * None of them can open an order or a placement, so the page gave an
 * instruction its reader could not follow. Now the pointer is kept for a
 * reader whose own menu offers a way to an order or a line, and anybody
 * else reads the refusal sentence alone, with no heading over it.
 */

/** The pages a document set is reached from: the order list, the
 *  contract lines, and the compliance desk that links each line's set. */
export const SET_OPENED_FROM = [
  '/dashboard/purchase-orders',
  '/dashboard/contracts',
  '/dashboard/compliance',
] as const

export type SetDoor =
  | { show: 'loading' }
  | { show: 'pointer' }
  | { show: 'refused'; says: string }

export function documentSetDoor(input: {
  /** The session is still loading, so the menu is not known yet. */
  pending: boolean
  /** The reader's company, or null where they are signed in at none. */
  company: string | null | undefined
  /** The reader's own menu lists at least one page in SET_OPENED_FROM. */
  opensFrom: boolean
}): SetDoor {
  if (input.pending) return { show: 'loading' }
  if (!input.company?.trim()) {
    return {
      show: 'refused',
      says: 'A document set belongs to a company’s order or placement, and you are not signed in at a company. Your own papers are under Your paperwork.',
    }
  }
  if (input.opensFrom) return { show: 'pointer' }
  return { show: 'refused', says: noDeskYet('A document set', input.company) }
}
