import { prisma } from '@/lib/db'
import { permissionScope, type ScopedCaller } from '@/lib/permission-grants'
import type { ScopeAnswer } from '@/lib/permission-grants/rules'

/**
 * How far an Owner's grant opens jobs and submissions (CLAUDE.md, "The
 * Owner decides who sees what, by team, by role or for the whole
 * company", 2026-11-08).
 *
 * The four permissions that open jobs and submissions may be given to one
 * team or as somebody's own work (`GRANTABLE_TO_A_TEAM`, e9b3d9a92). Such a
 * grant never makes `hasPermission` say yes; it is read here, through
 * `permissionScope`, and every query it opens is narrowed at the query:
 *
 *   - COMPANY: the role's own permission, or a company-wide grant: the
 *     firm's book, as before;
 *   - UNIT: jobs charged to a granted team or any team under it
 *     (`Requirement.orgUnitId`), and submissions through their job;
 *   - PERSON: the reader's own: jobs they raised or own, submissions they
 *     put forward;
 *   - NONE: nothing.
 *
 * A team grant never opens another team's: a job with no team, or another
 * team's, is outside it. The pure half is below; the one read is
 * `reachFor`.
 */

export type Reach = Pick<ScopeAnswer, 'has' | 'scope' | 'unitIds'>

/** The filter on `Requirement` a reach opens; `{}` for the firm's book, null for nothing. */
export function jobsWhere(reach: Reach, personId: string): Record<string, unknown> | null {
  if (!reach.has || reach.scope === 'NONE') return null
  if (reach.scope === 'COMPANY') return {}
  if (reach.scope === 'UNIT') return { orgUnitId: { in: [...reach.unitIds] } }
  return { OR: [{ raisedById: personId }, { ownerId: personId }] }
}

/** The filter on `Submission` a reach opens: through its job for a team, the reader's own put-forwards for own work. */
export function submissionsWhere(reach: Reach, personId: string): Record<string, unknown> | null {
  if (!reach.has || reach.scope === 'NONE') return null
  if (reach.scope === 'COMPANY') return {}
  if (reach.scope === 'UNIT') return { requirement: { orgUnitId: { in: [...reach.unitIds] } } }
  return { submittedById: personId }
}

/** Whether one job is inside a reach. */
export function jobInReach(
  reach: Reach,
  job: { orgUnitId: string | null; raisedById?: string | null; ownerId?: string | null },
  personId: string
): boolean {
  if (!reach.has || reach.scope === 'NONE') return false
  if (reach.scope === 'COMPANY') return true
  if (reach.scope === 'UNIT') return job.orgUnitId != null && reach.unitIds.includes(job.orgUnitId)
  return job.raisedById === personId || job.ownerId === personId
}

/** "the Dayton team", "the Dayton and Belfast teams". */
export function teamsSay(names: readonly string[]): string {
  if (names.length === 0) return 'your team'
  if (names.length === 1) return `the ${names[0]} team`
  return `the ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} teams`
}

/**
 * The refusal for something outside the reach, naming the reach. `what` is
 * "jobs" or "submissions".
 */
export function outsideReachSays(what: string, reach: Reach, teamNames: readonly string[], companyName: string): string {
  if (reach.scope === 'UNIT') {
    return `You read ${what} for ${teamsSay(teamNames)}, and this one is outside it. Ask the Owner of ${companyName} for the firm’s.`
  }
  if (reach.scope === 'PERSON') {
    return `You read your own ${what} only, and this one is not yours. Ask the Owner of ${companyName} for the firm’s.`
  }
  return `${what[0].toUpperCase()}${what.slice(1)} are not part of your seat at ${companyName}. Whoever set up your access can add them.`
}

/**
 * The reach of one permission for this caller, with the names of the teams
 * a team grant reaches (top-level granted teams first), for the sentence.
 */
export async function reachFor(caller: ScopedCaller, permission: string): Promise<Reach & { teamNames: string[] }> {
  const answer = await permissionScope(caller, permission)
  if (answer.scope !== 'UNIT' || answer.unitIds.length === 0) return { ...answer, teamNames: [] }
  const units = await prisma.orgUnit
    .findMany({ where: { id: { in: answer.unitIds } }, select: { id: true, name: true, parentId: true } })
    .catch(() => [] as { id: string; name: string; parentId: string | null }[])
  const inside = new Set(units.map((u) => u.id))
  const tops = units.filter((u) => !u.parentId || !inside.has(u.parentId)).map((u) => u.name)
  return { ...answer, teamNames: tops }
}
