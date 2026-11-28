/**
 * The tripwires (record 135). Pure: each takes what the ledger holds and
 * says whether it fired and why, in a sentence a person reads.
 *
 * A tripwire watches one thing on the record. It does not know who to write
 * to; that is the segment's job. Each firing carries its reason, and fires
 * once for a thing, not once a day (`quietSince`): the same open seat read
 * every morning for a month is how a channel gets filtered to a folder.
 */

export const TRIPWIRE_KINDS = [
  'POD_CAPACITY_OPENED', 'ENGAGEMENT_ENDING', 'COHORT_COMPLETED', 'JOB_UNFILLED',
  'BENCH_SKILL_MATCHES_DEMAND', 'REPEAT_VISITS', 'COMPLETION_SHARED', 'CLIENT_CONTRACT_ENDING',
] as const
export type TripwireKind = (typeof TRIPWIRE_KINDS)[number]

export const TRIPWIRE_WORDS: Record<TripwireKind, string> = {
  POD_CAPACITY_OPENED: 'A team has room', ENGAGEMENT_ENDING: 'A team engagement ended', COHORT_COMPLETED: 'A group finished a course',
  JOB_UNFILLED: 'A job is still open', BENCH_SKILL_MATCHES_DEMAND: 'A new bench skill matches an open job', REPEAT_VISITS: 'Somebody came back to a page',
  COMPLETION_SHARED: 'A learner shared a finished course', CLIENT_CONTRACT_ENDING: 'A client contract is ending',
}

/** What a firing is about: the thing on the record, the words, and the skills it carries to match content. */
export interface Detection {
  kind: TripwireKind
  sourceType: string
  sourceId: string
  reason: string
  /** Skills the thing is about, lower case, to find a course or a team that fits. May be empty. */
  skills: string[]
  /** For a repeat visit: the page the person came back to. */
  page?: { pageKind: 'COURSE' | 'POD'; pageRef: string }
  /** For a repeat visit: the one person (a person id or a contact id) the push is for. */
  visitor?: { personId: string | null; contactId: string | null }
  /** For a contract ending: the one company the push is for. */
  atCompanyId?: string
}

/** PROPOSED, AWAITING THE OWNER: a thing that fired stays quiet for this many days, whatever the day. */
export const QUIET_DAYS = 30
/** PROPOSED, AWAITING THE OWNER: how far back a finish, an ending or a share still counts as new. */
export const FRESH_DAYS = 14
/** PROPOSED, AWAITING THE OWNER: a contract ending inside this many days is worth a letter now. */
export const ENDING_WITHIN_DAYS = 45
/** PROPOSED, AWAITING THE OWNER: outcome proof is shown only where at least this many people finished; fewer is a story, not a figure. */
export const OUTCOME_PROOF_FLOOR = 5
/** PROPOSED, AWAITING THE OWNER: repeat means this many visits by one person to one page, on two different days, inside 14 days. */
export const REPEAT_VISITS_MIN = 2

const DAY = 86_400_000
export const daysBetween = (from: Date, to: Date): number => Math.floor((to.getTime() - from.getTime()) / DAY)
export const dayOf = (d: Date): string => d.toISOString().slice(0, 10)

/** True where the same thing fired lately and must not fire again. Pure. */
export function quietSince(lastFiredAt: Date | null, today: Date, quietDays: number = QUIET_DAYS): boolean {
  return lastFiredAt !== null && daysBetween(lastFiredAt, today) < quietDays
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** A team with a role that has room. The source carries the open count, so more room is new news. */
export function podCapacity(pod: { id: string; name: string; archivedAt: Date | null; roles: readonly { title: string; headcount: number; members: number; skills: readonly string[] }[] }): Detection | null {
  if (pod.archivedAt) return null
  const open = pod.roles.filter((r) => r.members < r.headcount)
  const seats = open.reduce((a, r) => a + (r.headcount - r.members), 0)
  if (seats === 0) return null
  return {
    kind: 'POD_CAPACITY_OPENED', sourceType: 'Pod', sourceId: `${pod.id}@${seats}`,
    reason: `${pod.name} has room for ${plural(seats, 'more person', 'more people')}: ${open.map((r) => r.title).join(', ')}.`,
    skills: [...new Set(open.flatMap((r) => r.skills.map((s) => s.toLowerCase())))],
  }
}

/** A team engagement whose last deliverable was accepted lately. */
export function engagementEnded(p: { id: string; podName: string; fulfilledAt: Date | null; skills: readonly string[] }, today: Date): Detection | null {
  if (!p.fulfilledAt || daysBetween(p.fulfilledAt, today) > FRESH_DAYS || daysBetween(p.fulfilledAt, today) < 0) return null
  return {
    kind: 'ENGAGEMENT_ENDING', sourceType: 'PodProject', sourceId: p.id,
    reason: `The ${p.podName} engagement was fulfilled on ${dayOf(p.fulfilledAt)}. Its team is free for the next one.`,
    skills: p.skills.map((s) => s.toLowerCase()),
  }
}

/** A cohort whose every learner who has not dropped has finished, the last of them lately. */
export function cohortCompleted(c: { id: string; name: string; courseTitle: string; enrollments: readonly { status: string; completedAt: Date | null }[] }, today: Date): Detection | null {
  const live = c.enrollments.filter((e) => e.status !== 'DROPPED')
  if (live.length === 0 || live.some((e) => e.status !== 'COMPLETED' || !e.completedAt)) return null
  const last = new Date(Math.max(...live.map((e) => e.completedAt!.getTime())))
  if (daysBetween(last, today) > FRESH_DAYS) return null
  return {
    kind: 'COHORT_COMPLETED', sourceType: 'Cohort', sourceId: c.id,
    reason: `${c.name} finished ${c.courseTitle}: ${plural(live.length, 'person', 'people')}, the last on ${dayOf(last)}.`,
    skills: [],
  }
}

/** A job nobody has filled for longer than the firm's own threshold. */
export function jobUnfilled(j: { id: string; title: string; status: string; archivedAt: Date | null; createdAt: Date; skills: readonly string[] }, today: Date, thresholdDays: number): Detection | null {
  if (j.status !== 'OPEN' || j.archivedAt) return null
  const age = daysBetween(j.createdAt, today)
  if (age < thresholdDays) return null
  return {
    kind: 'JOB_UNFILLED', sourceType: 'Requirement', sourceId: j.id,
    reason: `${j.title} has been open ${plural(age, 'day', 'days')}, past your ${thresholdDays}-day line.`,
    skills: j.skills.map((s) => s.toLowerCase()),
  }
}

/** A bench person listed lately whose skills match an open job. Names no person: the reason is the skill and the job. */
export function benchMatchesDemand(l: { id: string; grantedAt: Date; skills: readonly string[] }, jobs: readonly { title: string; skills: readonly string[] }[], today: Date): Detection | null {
  if (daysBetween(l.grantedAt, today) > FRESH_DAYS) return null
  const mine = new Set(l.skills.map((s) => s.trim().toLowerCase()))
  for (const j of [...jobs].sort((a, b) => a.title.localeCompare(b.title))) {
    const shared = [...new Set(j.skills.map((s) => s.trim().toLowerCase()))].filter((s) => mine.has(s))
    if (shared.length) {
      // The source is the skill, not the person: three people listed with the same skill are one piece of news.
      return { kind: 'BENCH_SKILL_MATCHES_DEMAND', sourceType: 'BenchSkill', sourceId: [...shared].sort().join(','), reason: `A person newly on the bench has ${shared.join(', ')}, which ${j.title} asks for.`, skills: shared }
    }
  }
  return null
}

/**
 * Somebody known came back. Only a signed-in person or a contact who arrived by
 * the tracked link in a letter is in `visits`: there is no anonymous row to count.
 */
export function repeatVisits(v: { pageKind: 'COURSE' | 'POD'; pageRef: string; pageName: string; personId: string | null; contactId: string | null; at: readonly Date[] }, today: Date): Detection | null {
  if (!v.personId && !v.contactId) return null
  const recent = v.at.filter((d) => daysBetween(d, today) >= 0 && daysBetween(d, today) <= FRESH_DAYS)
  const distinctDays = new Set(recent.map(dayOf))
  if (recent.length < REPEAT_VISITS_MIN || distinctDays.size < 2) return null
  const who = v.personId ?? v.contactId!
  return {
    kind: 'REPEAT_VISITS', sourceType: v.pageKind === 'COURSE' ? 'CoursePage' : 'PodPage', sourceId: `${v.pageRef}:${who}`,
    reason: `Somebody who opened your letter came back to ${v.pageName} on ${distinctDays.size} different days.`,
    skills: [], page: { pageKind: v.pageKind, pageRef: v.pageRef }, visitor: { personId: v.personId, contactId: v.contactId },
  }
}

/** A learner pressed share on her own finished course. Reads her own ledgered click, never anything from outside. */
export function completionShared(s: { enrollmentId: string; courseTitle: string; at: Date }, today: Date): Detection | null {
  if (daysBetween(s.at, today) > FRESH_DAYS || daysBetween(s.at, today) < 0) return null
  return {
    kind: 'COMPLETION_SHARED', sourceType: 'Enrollment', sourceId: s.enrollmentId,
    reason: `A learner shared her finished ${s.courseTitle} on ${dayOf(s.at)}.`, skills: [],
  }
}

/** A client contract that ends soon. */
export function contractEnding(c: { id: string; clientCompanyId: string; clientName: string; endDate: Date | null; state: string; skills: readonly string[] }, today: Date): Detection | null {
  if (c.state !== 'IN_PROGRESS' || !c.endDate) return null
  const left = daysBetween(today, c.endDate)
  if (left < 0 || left > ENDING_WITHIN_DAYS) return null
  return {
    kind: 'CLIENT_CONTRACT_ENDING', sourceType: 'SellContract', sourceId: c.id,
    reason: `A contract at ${c.clientName} ends on ${dayOf(c.endDate)}, in ${plural(left, 'day', 'days')}.`,
    skills: c.skills.map((s) => s.toLowerCase()), atCompanyId: c.clientCompanyId,
  }
}
