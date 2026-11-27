import { outcomeTeamLines } from '@/lib/money/team-lines'
import { prisma } from '@/lib/db'

/**
 * A member's week on outcome work has no client step (record 120, pods).
 *
 * The client buys the deliverables, not the hours, and never reads the line,
 * so the selling firm's acceptance is the top rung (`topSignerFor`). Every
 * route that signs a week reads the line through here: where the line is a
 * member line of outcome work, the seller stands as the client on the
 * in-memory copy, so the week is signed in one press by the selling firm,
 * the way a firm's own employee's week is, and nothing is addressed to the
 * client. The worker still files her own week and nobody signs their own.
 *
 * Returns true where the line was changed.
 */
export async function sellerIsTheTop(
  lineId: string,
  line: {
    companyId: string
    clientCompanyId: string
    endClientCompanyId: string | null
    company?: { name: string } | null
    clientCompany?: { name: string } | null
    endClientCompany?: { name: string } | null
  }
): Promise<boolean> {
  if (!(await outcomeTeamLines(prisma, [lineId])).has(lineId)) return false
  line.clientCompanyId = line.companyId
  line.endClientCompanyId = null
  if (line.company && line.clientCompany !== undefined) line.clientCompany = line.company
  if (line.endClientCompany !== undefined) line.endClientCompany = null
  return true
}
