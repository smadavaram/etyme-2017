/**
 * What each platform agent's golden snapshot adds to the golden world
 * (record 123, plan step 8). Kept apart from `golden-world.ts` so the
 * snapshots already taken on that world cannot move. Every date is fixed.
 */
import { prisma } from './harness'
import type { GoldenWorld } from './golden-world'

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const mail = (n: string) => `${n}@example.invalid`

/** The quiet customer's job names a hiring manager with an address; the other quiet customer's names nobody. */
export async function addInterviewWorld(w: GoldenWorld) {
  const hm = await prisma.person.create({ data: { name: 'Hana Hiring', primaryEmail: mail('hana.hiring') } })
  const job = await prisma.requirement.findFirstOrThrow({ where: { companyId: w.quiet.id } })
  await prisma.requirement.update({ where: { id: job.id }, data: { raisedById: hm.id } })
  const submission = await prisma.submission.findFirstOrThrow({ where: { requirementId: job.id } })
  return { hm, job, submission }
}
export const GOLDEN_WEDNESDAY = new Date('2026-11-25T12:00:00Z')
export { d as goldenDay }
