import type { CallerContext } from '@/lib/api-context'
import { programView } from './view'

/**
 * What in a client's program needs somebody, for a reader in a seat the
 * client granted — the rows the program page draws under "needs you".
 *
 * The founder, 2026-10-19: an MSP's own book never appears on the
 * client's page, and a seated MSP reads only that program. The page
 * reads this queue from `GET /api/program`; Ask Etyme's greeting for the
 * same seat reads it here, from the same function (`programView`), so
 * the page, the greeting and the mark cannot disagree about one program.
 *
 * `requestedClientId` picks the program where the reader holds seats in
 * several, the same way `?clientCompanyId=` does on the page; null takes
 * the one the seat resolves to.
 *
 * Returns null where there is no queue to read: the reader is the
 * client's own seat (its queue is `GET /api/decisions`), or the program
 * refuses it. Every person the read touches is logged under the seat,
 * with `trail` as the first words of the reason ("Ask Etyme greeting").
 */
export type ProgramQueueRow = NonNullable<ProgramQueue>[number]
type ProgramQueue = NonNullable<Awaited<ReturnType<typeof programView>>['data']>['programQueue']

export async function programQueue(
  caller: CallerContext,
  requestedClientId: string | null = null,
  opts: { trail?: string } = {}
): Promise<{ client: { id: string; name: string }; rows: ProgramQueueRow[] } | null> {
  const view = await programView(caller, requestedClientId, opts)
  if (view.error || !view.data) return null
  if (!view.data.programQueue) return null
  return { client: view.data.client, rows: view.data.programQueue }
}
