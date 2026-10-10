/**
 * What a list says when the route narrowed it to the reader's own lines.
 *
 * Sign-up walk, round five, problem 9. Mo, a Member at Northbend
 * Athletic with no desk yet, opened Contracts and read "Everyone working
 * at your sites, across every supplier … ACTIVE 0 contracts … No
 * contracts yet." Northbend had six live lines. `/api/contracts` had
 * narrowed him to the lines that name him (lib/money/own-lines), as
 * designed, and the page drew the narrowed list as the firm's empty
 * book. A confident zero about a book the reader cannot see is a
 * plausible wrong number.
 *
 * So a route that narrows says so — `scope: 'own'` beside the rows — and
 * the page reads the sentence from here instead of the firm's empty
 * state. Reports reads the same answer off the same route.
 *
 * Pure: no React, no database.
 */

import { refusalSentence } from '@/lib/refusal-words'
import { READS_THE_FIRMS_LINES } from '@/lib/money/own-lines'

/** Whose rows a list holds: the firm's, or only those naming the reader. */
export type ListScope = 'own' | 'firm'

export function listScope(ownOnly: boolean): ListScope {
  return ownOnly ? 'own' : 'firm'
}

/** Read a route's answer; anything but an explicit 'own' is the firm's list. */
export function scopeOf(body: unknown): ListScope {
  const scope = (body as { data?: { scope?: unknown } } | null)?.data?.scope
  return scope === 'own' ? 'own' : 'firm'
}

export const OWN_CONTRACTS_SAY = 'You see only contracts that name you.'

/** The whole sentence for a narrowed contracts list, with how many name the reader. */
export function ownContractsSay(count: number): string {
  if (count <= 0) return `${OWN_CONTRACTS_SAY} None do.`
  if (count === 1) return `${OWN_CONTRACTS_SAY} One does.`
  return `${OWN_CONTRACTS_SAY} ${count} do.`
}

/**
 * Missing paperwork for a seat that reads only its own lines.
 *
 * Sign-up walk, round five, problem 6. Karthik Menon, a delivery
 * engineer at Teleworld, opened Missing paperwork and read colleagues by
 * name with money beside them — "Felix Brenner … Northbend Athletic
 * $21,120". The queue is the firm's: every placement missing a link,
 * priced by what is billed against the gap. A seat that administers no
 * contract has nothing to close on it, and narrowing it to his own line
 * would still print the bill rate the contracts route withholds from
 * him. So it is refused in a sentence naming the desks that work it.
 */
export function ownLinesRefusal(opts: { kind?: string | null; company?: string | null }): string {
  const desks = refusalSentence(`Needs ${READS_THE_FIRMS_LINES.join(', ')}.`, {
    kind: opts.kind ?? null,
    company: opts.company ?? null,
    what: 'Missing paperwork',
  })
  return `You read the contract lines that name you, under Your work. ${desks}`
}

/**
 * Reports, for a reader the contracts route narrowed.
 *
 * Round five, problem 9, second half: Reports drew "No data yet. Reports
 * will populate as you add contracts…" to the same Member. Reports add
 * up a firm's book; a seat reading only its own lines has no book to add
 * up, so where nothing else on the page is readable either, the page is
 * the sentence alone. Where some firm figure is readable (a margin desk
 * with no contracts desk), the page draws and says the contract counts
 * on it are the reader's own. Null where nothing was narrowed.
 */
export function narrowedReport(args: {
  scope: ListScope
  /** How many lines named the reader. */
  ownLines: number
  /** Whether any of bench, bills or margin answered for this seat. */
  readsFirmFigures: boolean
}): { alone: boolean; says: string } | null {
  if (args.scope !== 'own') return null
  if (!args.readsFirmFigures) {
    const where = args.ownLines > 0 ? ' They are under Contracts.' : ''
    return { alone: true, says: `Reports add up your firm’s book. ${ownContractsSay(args.ownLines)}${where}` }
  }
  return { alone: false, says: `The contract figures here count only contracts that name you.` }
}
