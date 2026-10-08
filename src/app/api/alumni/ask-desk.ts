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

/**
 * The client's word for what its hiring desk raises, written here rather
 * than read from the requirements page's words.
 *
 * It was read through `jobListWord`, which reaches the sidebar's nav table
 * through `lib/page-framing`, and a Member opening Past contractors got a
 * 500 — "getNavForKind is not a function" — from a server route that had
 * pulled a browser module in (sign-up walk, round two, item 17). A route
 * imports pure modules only. The word is fixed by decision anyway: "Job
 * requests" on every party's menu (2026-09-30).
 */
const JOB_REQUESTS = 'job requests'

export interface AskDesk {
  mayAsk: boolean
  /** Null where this desk may ask; otherwise the sentence naming the desks that may. */
  says: string | null
}

/** Pure: the sentence, given the client's desks that may ask. */
export function whoseDeskSays(clientName: string, deskNames: string[]): string {
  const word = JOB_REQUESTS
  const names = [...new Set(deskNames)].sort()
  const who = names.length === 0
    ? `whoever raises ${word} there`
    : names.length === 1 ? `the ${names[0]} desk` : `the ${names.slice(0, -1).join(', ')} or ${names[names.length - 1]} desk`
  // With no desk named, "whoever raises job requests there" already says
  // which desk, and saying it twice read as a stutter.
  const which = names.length === 0 ? '' : `, the desk that raises ${word}`
  return `Asking somebody back to ${clientName} is for ${who}${which}. ` +
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
