/**
 * Lines whose hours never bill (record 120, pods).
 *
 * A sold team's members each have a sell line, with a rate kept for reference.
 * Where the team was sold on milestones or a fixed price, the client pays for
 * accepted deliverables and never for hours, so the bill run leaves those
 * lines' hours off. A time-and-materials team bills hours and is not here.
 * Only lines of a sold team are read: any other order keeps its behavior.
 */
import type { Prisma } from '@prisma/client'

type Reader = { sellContract: Pick<Prisma.TransactionClient['sellContract'], 'findMany'> }

/** Of these lines, the ones that belong to a team sold on milestones or a fixed price. */
export async function milestoneOnlyLines(db: Reader, lineIds: readonly string[]): Promise<Set<string>> {
  if (lineIds.length === 0) return new Set()
  const rows = await db.sellContract.findMany({
    where: { id: { in: [...lineIds] }, projectOrder: { is: { podProject: { isNot: null }, kind: { in: ['MILESTONE', 'FIXED_PRICE'] } } } },
    select: { id: true },
  })
  return new Set(rows.map((r) => r.id))
}
