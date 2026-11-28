/**
 * One order, read from either end, with its lines.
 *
 * The prime's purchase order to a sub-vendor is the sub-vendor's sales
 * order: one document, three names (CLAUDE.md, "It was six, and one of
 * them was two rows for one document"). Its lines are written at both
 * ends: the prime's buy line pays the sub for a person, and the sub's
 * sell line bills the prime for the same person. Both hang off the one
 * order.
 *
 * Read naively, a person on both ends is two lines on one document, and
 * a five-person order reads as ten. So each reader sees the lines from
 * its own end, and a line written only at the other end (the prime has
 * awarded, the sub has not yet recorded its own) is shown too, once, so
 * a reader never sees an order with fewer people than it has.
 *
 * And a line from the other end carries a rate this reader may not be
 * entitled to: the sub's bill rate is the prime's cost. Whether it is
 * shown is the caller's question (`mayReadBillRate` in
 * `lib/money/pay-visibility`), answered per line and passed in.
 *
 * No database in here.
 */

export type LineSideWord = 'SELL' | 'BUY'
export type OrderEnd = 'BUYER' | 'SELLER' | 'BYSTANDER'

export interface OrderLineIn {
  id: string
  side: LineSideWord
  personId: string
  rate: number | null
  payWithheld?: boolean
}

/** The side of a line the reader at this end writes: a buyer pays (buy), a seller bills (sell). */
export function ownLineSide(end: OrderEnd): LineSideWord | null {
  if (end === 'BUYER') return 'BUY'
  if (end === 'SELLER') return 'SELL'
  return null
}

/** A line as one reader sees it: the rate may be withheld, and it says which end wrote it. */
export type ReadLine<L extends OrderLineIn> = Omit<L, 'rate' | 'payWithheld'> & {
  rate: number | null
  payWithheld?: boolean
  fromOtherEnd: boolean
}

/**
 * The lines this reader sees: its own end's lines, then any person only
 * the other end has written, once. A bystander (nobody on either end)
 * reads the seller's lines, the side the order is billed from.
 *
 * `otherEndRateShown` answers, per line from the other end, whether this
 * reader may read its rate; where it may not, the rate is withheld and
 * the line says so, never a figure.
 */
export function linesForReader<L extends OrderLineIn>(
  lines: L[],
  end: OrderEnd,
  otherEndRateShown: (line: L) => boolean
): Array<ReadLine<L>> {
  const own = ownLineSide(end) ?? 'SELL'
  const mine = lines.filter((l) => l.side === own)
  const covered = new Set(mine.map((l) => l.personId))
  const theirs: Array<ReadLine<L>> = []
  for (const l of lines) {
    if (l.side === own || covered.has(l.personId)) continue
    covered.add(l.personId)
    const shown = otherEndRateShown(l)
    theirs.push({ ...l, rate: shown ? l.rate : null, payWithheld: !shown, fromOtherEnd: true })
  }
  return [...mine.map((l): ReadLine<L> => ({ ...l, fromOtherEnd: false })), ...theirs]
}
