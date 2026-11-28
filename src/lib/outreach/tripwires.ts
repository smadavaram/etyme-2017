/**
 * The tripwires, read off the firm's own record (record 135). Each scan reads
 * one firm: its teams, its cohorts, its open jobs, its bench, its contracts,
 * the visits of people who came by a letter's tracked link, and the learners'
 * own share clicks. A firing is one row with its reason, once for a thing in
 * thirty days. A firing assembles its pushes at once; one that found no
 * segment or no content is tried again on the next scan while it is fresh.
 * Nothing here sends mail or reads anything outside the firm's record.
 */
import { prisma } from '@/lib/db'
import {
  benchMatchesDemand, cohortCompleted, completionShared, contractEnding, dayOf, engagementEnded, FRESH_DAYS, jobUnfilled, podCapacity, quietSince, repeatVisits,
  type Detection,
} from './tripwire-rules'
import { assemblePushes, contentPool, type ModelDrafter } from './push'
import { segmentsOf } from './segment'

const DAY = 86_400_000

/** Everything the record says has fired as of `now`, before anything is written. */
export async function detectionsOf(companyId: string, now: Date): Promise<Detection[]> {
  const out: Detection[] = []
  const push = (d: Detection | null) => { if (d) out.push(d) }
  const firm = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { unfilledJobDays: true } })

  const pods = await prisma.pod.findMany({ where: { companyId }, include: { roles: { include: { _count: { select: { members: true } } } } } })
  for (const p of pods) push(podCapacity({ id: p.id, name: p.name, archivedAt: p.archivedAt, roles: p.roles.map((r) => ({ title: r.title, headcount: r.headcount, members: r._count.members, skills: r.skills })) }))
  const projects = await prisma.podProject.findMany({ where: { pod: { companyId }, fulfilledAt: { not: null } }, include: { pod: { include: { roles: true } } } })
  for (const pr of projects) push(engagementEnded({ id: pr.id, podName: pr.pod.name, fulfilledAt: pr.fulfilledAt, skills: [...new Set(pr.pod.roles.flatMap((r) => r.skills))] }, now))

  const cohorts = await prisma.cohort.findMany({ where: { companyId }, include: { course: { select: { title: true } }, enrollments: { select: { status: true, completedAt: true } } } })
  for (const c of cohorts) push(cohortCompleted({ id: c.id, name: c.name, courseTitle: c.course.title, enrollments: c.enrollments }, now))

  const jobs = await prisma.requirement.findMany({ where: { companyId, status: 'OPEN', archivedAt: null }, select: { id: true, title: true, status: true, archivedAt: true, createdAt: true, skills: true } })
  for (const j of jobs) push(jobUnfilled(j, now, firm.unfilledJobDays))

  const listings = await prisma.benchListing.findMany({
    where: { companyId, state: 'GRANTED', revokedAt: null, grantedAt: { gte: new Date(now.getTime() - FRESH_DAYS * DAY) } },
    select: { id: true, grantedAt: true, firmSkills: true, consultant: { select: { skills: true } } },
  })
  for (const l of listings) push(benchMatchesDemand({ id: l.id, grantedAt: l.grantedAt, skills: [...l.consultant.skills, ...l.firmSkills] }, jobs, now))

  // Visits: only rows of a known person or a known contact exist, so only they are counted.
  const visits = await prisma.outreachVisit.findMany({ where: { companyId, at: { gte: new Date(now.getTime() - FRESH_DAYS * DAY) } }, orderBy: { at: 'asc' } })
  const groups = new Map<string, typeof visits>()
  for (const v of visits) {
    const key = `${v.pageKind}:${v.pageRef}:${v.personId ?? v.contactId ?? ''}`
    groups.set(key, [...(groups.get(key) ?? []), v])
  }
  if (groups.size) {
    const courses = new Map((await prisma.course.findMany({ where: { companyId }, select: { id: true, title: true } })).map((c) => [c.id, c.title]))
    const podNames = new Map(pods.map((p) => [p.id, p.name]))
    for (const g of groups.values()) {
      const v = g[0]
      push(repeatVisits({
        pageKind: v.pageKind as 'COURSE' | 'POD', pageRef: v.pageRef, pageName: (v.pageKind === 'POD' ? podNames.get(v.pageRef) : courses.get(v.pageRef)) ?? 'a page of yours',
        personId: v.personId, contactId: v.contactId, at: g.map((x) => x.at),
      }, now))
    }
  }

  // A learner's own share click is a row the learning door wrote; nothing is read from outside.
  const shares = await prisma.automationLog.findMany({ where: { companyId, action: 'CREDENTIAL_SHARED', at: { gte: new Date(now.getTime() - FRESH_DAYS * DAY) } }, select: { payload: true, at: true } })
  const seen = new Set<string>()
  for (const s of shares) {
    const id = (s.payload as { enrollmentId?: string } | null)?.enrollmentId
    if (!id || seen.has(id)) continue
    seen.add(id)
    const e = await prisma.enrollment.findUnique({ where: { id }, select: { course: { select: { title: true } } } })
    if (e) push(completionShared({ enrollmentId: id, courseTitle: e.course.title, at: s.at }, now))
  }

  const contracts = await prisma.sellContract.findMany({
    where: { companyId, state: 'IN_PROGRESS', endDate: { gte: now, lte: new Date(now.getTime() + 60 * DAY) } },
    select: { id: true, clientCompanyId: true, endDate: true, state: true, clientCompany: { select: { name: true } } },
  })
  for (const c of contracts) push(contractEnding({ id: c.id, clientCompanyId: c.clientCompanyId, clientName: c.clientCompany.name, endDate: c.endDate, state: c.state, skills: [] }, now))
  return out
}

export interface ScanResult { fired: { id: string; kind: string; reason: string }[]; pushes: number; waiting: number; queued: number; notes: string[] }

/** One firm's scan: write a firing for each new thing, assemble the pushes of every fresh firing that has none yet. Idempotent within a day. */
export async function scanTripwires(companyId: string, now: Date = new Date(), deps: { draft?: ModelDrafter | null } = {}): Promise<ScanResult> {
  const result: ScanResult = { fired: [], pushes: 0, waiting: 0, queued: 0, notes: [] }
  const detections = await detectionsOf(companyId, now)
  if (detections.length === 0) return result
  const segments = (await segmentsOf(companyId)).map((s) => ({ id: s.id, name: s.name, def: s.def }))
  const pool = await contentPool(companyId)
  for (const d of detections) {
    // Quiet: the same thing, by kind, source and its place in the record, fired lately and does not fire again.
    const last = await prisma.outreachTripwireFiring.findFirst({ where: { companyId, kind: d.kind, sourceType: d.sourceType, sourceId: d.sourceId }, orderBy: { firedAt: 'desc' } })
    let firing = last
    if (!last || !quietSince(last.firedAt, now)) {
      try {
        firing = await prisma.outreachTripwireFiring.create({ data: { companyId, kind: d.kind, sourceType: d.sourceType, sourceId: d.sourceId, day: dayOf(now), reason: d.reason, firedAt: now } })
        result.fired.push({ id: firing.id, kind: firing.kind, reason: firing.reason })
      } catch (e) {
        if ((e as { code?: string }).code !== 'P2002') throw e
        firing = await prisma.outreachTripwireFiring.findFirst({ where: { companyId, kind: d.kind, sourceType: d.sourceType, sourceId: d.sourceId, day: dayOf(now) } })
      }
    }
    // A firing that found nothing to push is tried again while it is fresh; one with pushes is left alone.
    if (!firing || firing.state !== 'DETECTED') continue
    const made = await assemblePushes(firing, d, now, { draft: deps.draft, segments, pool })
    for (const p of made.pushes) { result.pushes++; if (p.where === 'CARD') result.waiting++; if (p.where === 'PACK') result.queued++ }
    result.notes.push(...made.notes.map((n) => `${firing!.reason} ${n}`))
  }
  return result
}

/** On an event: a visit was recorded, so check whether the same person has now come back. Cheap, and one firm's. */
export async function scanAfterVisit(companyId: string, now: Date = new Date(), deps: { draft?: ModelDrafter | null } = {}): Promise<ScanResult> {
  return scanTripwires(companyId, now, deps)
}
