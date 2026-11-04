/**
 * The worker hears about her own degree the moment HR is warned.
 *
 * Found by the fifth screen walk, 2026-11-04: Rosa Delgado put a 2016
 * degree on file against a 2014 résumé line, HR read the sentence and the
 * three doors beside the paper, and Rosa was told nothing.
 * `degreeCheckForYou` (conversation's words) was written and called by
 * nothing but its own test. This is the call site: wherever a degree is
 * read against the record and something does not look right, the person
 * is told which firm is checking it and why, in her words, never what HR
 * was told (no years as HR reads them, no doors, no other person's name).
 *
 * One notice per firm per sentence: the same paper read again on accept
 * does not tell her twice.
 */
import { prisma } from '@/lib/db'
import { notify } from '@/lib/notify'
import { degreeCheckForYou } from '@/lib/notify/degree-and-start'
import type { DegreeReading } from './degree'

/** The title of the notice to the person. */
export const DEGREE_TOLD_TITLE = 'Your degree certificate is being checked'

/** What each firm tells the person about her degree, or nothing. Pure. */
export function degreeToldToYou(
  reading: Pick<DegreeReading, 'verified' | 'findings'> | null,
  firms: readonly { id: string; name: string }[]
): { companyId: string; title: string; body: string }[] {
  if (!reading) return []
  const seen = new Set<string>()
  const out: { companyId: string; title: string; body: string }[] = []
  for (const f of firms) {
    if (seen.has(f.id)) continue
    seen.add(f.id)
    const body = degreeCheckForYou({ firmName: f.name, findings: reading.findings, verified: reading.verified })
    if (body) out.push({ companyId: f.id, title: DEGREE_TOLD_TITLE, body })
  }
  return out
}

type Db = Pick<typeof prisma, 'notification'>

/**
 * Tell the person, once per firm and sentence. Returns the sentences
 * said (new or already said), so a route can show them on the reply.
 */
export async function tellTheWorkerAboutHerDegree(
  input: { personId: string; firms: readonly { id: string; name: string }[]; reading: Pick<DegreeReading, 'verified' | 'findings'> | null; entityId?: string | null },
  db: Db = prisma
): Promise<string[]> {
  const said = degreeToldToYou(input.reading, input.firms)
  for (const s of said) {
    const already = await db.notification.findFirst({
      where: { personId: input.personId, companyId: s.companyId, title: s.title, body: s.body },
      select: { id: true },
    })
    if (already) continue
    await notify({
      personId: input.personId,
      companyId: s.companyId,
      type: 'SYSTEM',
      title: s.title,
      body: s.body,
      ...(input.entityId ? { entityId: input.entityId } : {}),
      data: { href: '/dashboard/my-work/paperwork' },
    })
  }
  return said.map((s) => s.body)
}

type FirmDb = Pick<typeof prisma, 'context' | 'sellContract' | 'company'>

/**
 * The firms whose HR reads a degree she put on her own record: her
 * employer (an employee seat) and the firms selling her time on a live
 * line. A firm she has nothing live with does not read it, and is not
 * named to her.
 */
export async function firmsReadingHerPapers(personId: string, db: FirmDb = prisma): Promise<{ id: string; name: string }[]> {
  const [seats, lines] = await Promise.all([
    db.context.findMany({
      where: { personId, type: 'EMPLOYEE', revokedAt: null, companyId: { not: null } },
      select: { companyId: true },
    }),
    db.sellContract.findMany({
      where: { personId, state: { notIn: ['ENDED', 'CANCELLED'] } },
      select: { companyId: true },
      take: 20,
    }),
  ])
  const ids = [...new Set([...seats.map((s) => s.companyId!), ...lines.map((l) => l.companyId)].filter(Boolean))]
  if (ids.length === 0) return []
  const firms = await db.company.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
  // In the order found: the employer first.
  return ids.flatMap((id) => firms.filter((f) => f.id === id))
}
