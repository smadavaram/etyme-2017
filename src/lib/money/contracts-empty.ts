/**
 * What an empty Contracts page says, in the reader's own position.
 *
 * Sign-up walk, round four, problem 6. A new client opened Contracts and
 * read "Nothing on the sell side yet. A sell line is what you bill a
 * customer from…" under a heading that said "Everyone working at your
 * sites, across every supplier". A client bills nobody: the sentence was
 * a supplier's, handed to the one party that only buys.
 *
 * So the empty state follows the reader's kind, the same way the
 * heading does (`lib/page-framing`): a client — or a program office
 * reading a client's book from the client's seat — is told where a
 * contract comes from on its side, and a firm that sells reads the sell
 * and buy lines it bills and pays from.
 *
 * And where the route narrowed the reader to the lines that name them
 * (`scope: 'own'`, lib/money/own-scope), the firm's empty state is false
 * whatever the reader's kind: Northbend had six live lines when a Member
 * read "No contracts yet" (sign-up walk, round five, problem 9). The
 * narrowed reader is told the list is narrowed, never that the firm has
 * nothing.
 *
 * Pure: no React, no database.
 */

import { OWN_CONTRACTS_SAY, type ListScope } from '@/lib/money/own-scope'

export type ContractsTab = 'sell' | 'buy'

export function contractsEmpty(args: {
  kind: string | null | undefined
  /** True where the page reads a client's book from a seat the client granted. */
  readingAClientsBook?: boolean
  tab: ContractsTab
  /** 'all', or the state chip the reader picked. */
  stateFilter: string
  /** Whether this seat may record a placement by hand. */
  mayRecord: boolean
  /** 'own' where the route narrowed this reader to the lines naming them. */
  scope?: ListScope
}): { message: string; detail: string } {
  if (args.scope === 'own') {
    return {
      message: OWN_CONTRACTS_SAY,
      detail: args.stateFilter === 'all' ? 'None do.' : `None of yours are ${args.stateFilter}.`,
    }
  }
  const client = args.kind === 'CLIENT' || !!args.readingAClientsBook
  if (client) {
    return {
      message: args.stateFilter === 'all' ? 'No contracts yet.' : `No ${args.stateFilter} contracts.`,
      detail: 'A contract appears here when you award a job request to a supplier.',
    }
  }
  return {
    message:
      args.stateFilter === 'all'
        ? `Nothing on the ${args.tab} side yet.`
        : `No ${args.stateFilter} lines on the ${args.tab} side.`,
    detail:
      args.tab === 'sell'
        ? 'A sell line is what you bill a customer from. One arrives when a client awards a ' +
          (args.mayRecord
            ? 'submission, and you can record work you are already running with Record a placement.'
            : 'submission.')
        : 'A buy line is what you pay from — a supplier’s invoice where you buy the person, ' +
          'payroll where you employ them. One is written beside each placement you record.',
  }
}
