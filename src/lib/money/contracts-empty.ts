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
 * Pure: no React, no database.
 */

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
}): { message: string; detail: string } {
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
