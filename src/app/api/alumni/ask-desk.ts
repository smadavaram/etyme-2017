/**
 * Whether this desk may ask somebody back, and if not, whose desk does.
 *
 * One answer for the alumni list and the ask-back request, so the page
 * never draws a button the request will refuse. The desk is the one
 * that asks for a person by name (`/api/people/[id]/ask`): whoever
 * raises job requests, judged by the seat's role under a seat. Reading
 * who worked here before is wider — a compliance officer reads the list.
 */

import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { permissionsToJudgeBy, type LiveSeat } from '@/lib/program-seat'
import type { CallerContext } from '@/lib/api-context'
import type { CompanyKind } from '@/components/session-provider'
import { jobListWord } from '@/app/dashboard/requirements/words'

export interface AskDesk {
  mayAsk: boolean
  /** Null where this desk may ask; otherwise the sentence naming the desks that may. */
  says: string | null
}

/** Pure: the sentence, given the client's desks that may ask. */
export function whoseDeskSays(clientName: string, deskNames: string[]): string {
  const word = jobListWord('CLIENT' as CompanyKind).plural.toLowerCase()
  const names = [...new Set(deskNames)].sort()
  const who = names.length === 0
    ? `whoever raises ${word} there`
    : names.length === 1 ? `the ${names[0]} desk` : `the ${names.slice(0, -1).join(', ')} or ${names[names.length - 1]} desk`
  return `Asking somebody back to ${clientName} is for ${who}, the desk that raises ${word}. ` +
    `You can read who worked here before; ask them to put the request in.`
}

export async function askDesk(
  caller: Pick<CallerContext, 'permissions'>,
  seat: LiveSeat | null | undefined,
  client: { id: string; name: string }
): Promise<AskDesk> {
  if (hasPermission(permissionsToJudgeBy(caller, seat ?? null), 'requirements.write')) {
    return { mayAsk: true, says: null }
  }
  const desks = await prisma.role.findMany({
    where: { companyId: client.id, OR: [{ permissions: { has: 'requirements.write' } }, { permissions: { has: '*' } }] },
    select: { name: true },
  })
  return { mayAsk: false, says: whoseDeskSays(client.name, desks.map((d) => d.name)) }
}
