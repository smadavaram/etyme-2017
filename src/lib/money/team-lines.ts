/**
 * Member lines of a sold team, and who may read them (record 120, pods).
 *
 * A sold team has one sell line per member, on the project order. The
 * tester's rulings of 2026-11-26:
 *
 *   - A team project is outcome work by default. The client buys the
 *     deliverables, never the hours, so it never reads a member line:
 *     no name, id, rate, tenure row, start card or timesheet.
 *   - The line still carries the client's company, so the selling firm
 *     never becomes its own customer. Every reader on the client's side
 *     reads through `clientLineWhere`, and a sweep test proves it.
 *   - The selling firm signs an outcome member's week and expenses at the
 *     top (`topSignerFor`). The worker files her own week and never signs it.
 *   - Where the supplier marked the project "the team works on your site"
 *     and the client's yes accepted it (`PodProject.onSite`), the member is
 *     an ordinary contractor on the client's site: seen by name and
 *     standing, counted for tenure from the start day, hours approved by
 *     the client. The client never reads her rate in either case.
 *
 * Pure rules first; the two readers at the bottom ask the database.
 */

import type { Prisma } from '@prisma/client'

/** The sale kinds whose hours never bill: the client pays accepted deliverables. */
export const OUTCOME_KINDS = ['MILESTONE', 'FIXED_PRICE'] as const

/** The shape of a line these rules read. Every part is optional: a line with no project is no team line. */
export interface TeamLineFacts {
  companyId: string
  clientCompanyId: string
  projectOrder?: { podProject?: { onSite: boolean } | null } | null
}

/** True where the line belongs to a sold team. */
export function isTeamLine(line: Pick<TeamLineFacts, 'projectOrder'>): boolean {
  return Boolean(line.projectOrder?.podProject)
}

/** True where the client never reads this line: a team line on a project not marked on site. */
export function isHiddenTeamLine(line: Pick<TeamLineFacts, 'projectOrder'>): boolean {
  const team = line.projectOrder?.podProject
  return Boolean(team) && team!.onSite === false
}

/** The one filter that leaves a hidden team line out. Prisma reads a line with no project as visible. */
export const HIDDEN_TEAM_LINE: Prisma.SellContractWhereInput = {
  projectOrder: { is: { podProject: { is: { onSite: false } } } },
}

/**
 * Every reader that selects sell lines by the client's company reads through
 * this: the client's own lines, less the member lines of outcome work.
 * Supplier-side readers do not, and the sweep test names each with its reason.
 */
export function clientLineWhere(where: Prisma.SellContractWhereInput = {}): Prisma.SellContractWhereInput {
  return { AND: [where, { NOT: HIDDEN_TEAM_LINE }] }
}

type LineReader = { sellContract: Pick<Prisma.TransactionClient['sellContract'], 'findMany'> }

/** Of these lines, the member lines of outcome work: hidden from the client, their hours and expenses never on its bill. */
export async function outcomeTeamLines(db: LineReader, lineIds: readonly string[]): Promise<Set<string>> {
  const ids = [...new Set(lineIds)]
  if (ids.length === 0) return new Set()
  const rows = await db.sellContract.findMany({ where: { AND: [{ id: { in: ids } }, HIDDEN_TEAM_LINE] }, select: { id: true } })
  return new Set(rows.map((r) => r.id))
}

/** Who signs a week, or accepts an expense, at the top of this line. */
export interface TopSigner {
  side: 'SELLER' | 'CLIENT'
  companyId: string
}

/**
 * The firm that signs at the top. An outcome member's week has no client
 * signature: the client does not see it, so the selling firm's acceptance
 * is the top rung and payroll reads that. Any other line is the client's.
 */
export function topSignerFor(line: TeamLineFacts): TopSigner {
  return isHiddenTeamLine(line)
    ? { side: 'SELLER', companyId: line.companyId }
    : { side: 'CLIENT', companyId: line.clientCompanyId }
}

/**
 * Null where this person may sign at the top of the line; otherwise the
 * sentence that says why not. Nobody signs their own week, and on a hidden
 * line only a seat at the selling firm signs it.
 */
export function topSignRefusal(
  line: TeamLineFacts,
  signer: { personId: string; companyId: string },
  worker: { personId: string; name: string }
): string | null {
  if (signer.personId === worker.personId) return 'Nobody signs their own week. Ask a colleague at your firm to sign it.'
  const top = topSignerFor(line)
  if (signer.companyId !== top.companyId) {
    return top.side === 'SELLER'
      ? `${worker.name}’s week on this project is signed by the firm that sells the team. It is not yours to sign.`
      : `${worker.name}’s week is signed by the client it was worked for.`
  }
  return null
}

/** Why a member's week or expense on outcome work has no client step, said to the selling firm. */
export const SELLER_SIGNS_SAYS = 'The client buys the deliverables, not the hours, so your firm signs this week.'

/**
 * A scope narrowed so a hidden member line is read only by the firm that sells
 * it. Where a reader is both a seller and a payer (an MSP or an integrator), its
 * own lines stay; the lines it pays for lose the member lines of outcome work.
 */
export function visibleToReader(scope: Prisma.SellContractWhereInput, readerCompanyId: string): Prisma.SellContractWhereInput {
  return { AND: [scope, { OR: [{ companyId: readerCompanyId }, { NOT: HIDDEN_TEAM_LINE }] }] }
}

/**
 * Whether a line may print a per-hour rate to this reader. A team line prints
 * none to the client, on the page, the API, Ask Etyme or the bill: it is billed
 * by deliverable. To the seller it prints none either while its rate is 0,
 * because "$0/hr" is a number nobody can stand behind.
 */
export function printsRate(line: Pick<TeamLineFacts, 'companyId' | 'projectOrder'> & { billRate: number }, readerCompanyId: string | null): boolean {
  if (!isTeamLine(line)) return true
  return readerCompanyId === line.companyId && line.billRate > 0
}

/** Why a team line has no per-hour figure, said where a margin or a rate would be. */
export const BILLED_BY_DELIVERABLE_SAYS = 'This team is billed by deliverable.'
