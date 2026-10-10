import { prisma } from '@/lib/db'
import { notify, notifyBulk, type NotifyParams } from '@/lib/notify'

/**
 * The supplier whose candidate was not chosen, told once, when the job
 * is filled.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * The client tester placed somebody on Northbend Athletic's HCM
 * integration lead job. The award stood every other submission down and
 * called off the open interview rounds, and everybody in those rounds
 * was told. A supplier whose candidate never reached an interview heard
 * nothing at all: its submission went to "Not selected" in silence, and
 * it found out by opening the list, or by the candidate asking.
 *
 * ── What is said, and what is not ────────────────────────────────────
 *
 * One sentence: who filled which job, and that this firm's candidate
 * was not chosen. Then one action: tell the candidate. A rejection
 * reaches the candidate through their supplier, the way the trade does
 * it, so the candidate is not written to from here.
 *
 * Never the name of the person who was placed, and never a rate.
 * Neither is this supplier's business, and the second is another
 * supplier's price.
 *
 * ── Who hears, and on which channel ──────────────────────────────────
 *
 * The recruiter who put the candidate forward is told in the app and on
 * the firm's Teams channel, or by email where the firm has no channel.
 * The firm's other desks that put people forward see it in the app only.
 * Five copies of one sentence posted to one Teams channel is how a
 * channel gets muted. Where nobody knows who submitted, the first desk
 * carries the outside copy instead.
 *
 * ── Who is not told here ─────────────────────────────────────────────
 *
 * A supplier whose candidate had a round called off by this award was
 * already told, in the round's own words ("filled by another candidate,
 * so this round will not go ahead"). Telling it again is the same news
 * twice, so those submissions are skipped.
 */

export interface StoodDown {
  submissionId: string
  /** The firm that put the candidate forward on this job. */
  supplierId: string
  /** The candidate, by name: this supplier's own person. */
  personName: string
  /** The person who submitted them, where known and still at the firm. */
  submitterId: string | null
  /** Desks at the supplier that put people forward. */
  deskIds: string[]
  /** Whether this award called off one of this candidate's rounds, which already told the supplier. */
  roundCalledOff: boolean
}

export interface FilledJob {
  requirementId: string
  /** The firm that filled the job: the client, or the rung above this supplier. */
  filledBy: string
  roleTitle: string
}

/** The words, for one candidate. */
export function notChosenSaid(job: FilledJob, personName: string): { title: string; body: string } {
  const first = personName.trim().split(/\s+/)[0] || personName
  return {
    title: `${personName} was not chosen for ${job.roleTitle}`,
    body:
      `${job.filledBy} filled the ${job.roleTitle} job with another candidate; ` +
      `${personName} was not chosen. Please let ${first} know.`,
  }
}

/**
 * Every notice for one filled job — pure, so who hears can be read as
 * tests.
 */
export function notChosenNotices(job: FilledJob, stood: StoodDown[]): NotifyParams[] {
  const out: NotifyParams[] = []
  for (const s of stood) {
    if (s.roundCalledOff) continue
    const desks = Array.from(new Set(s.deskIds))
    const outward =
      s.submitterId && desks.includes(s.submitterId) ? s.submitterId : desks[0] ?? null
    if (!outward) continue
    const { title, body } = notChosenSaid(job, s.personName)
    // The outward copy first, so nobody is told twice when the
    // submitter is also one of the desks.
    const readers = [outward, ...desks.filter((d) => d !== outward)]
    for (const personId of readers) {
      out.push({
        personId,
        companyId: s.supplierId,
        type: 'SUBMISSION',
        title,
        body,
        entityId: s.submissionId,
        // TEAMS asks for the firm's channel; delivery falls back to email
        // where the firm has none, and records which it used.
        ...(personId === outward ? { channel: 'TEAMS' as const } : {}),
        data: { submissionId: s.submissionId, requirementId: job.requirementId, event: 'NOT_CHOSEN' },
      })
    }
  }
  return out
}

/** At most this many desks per supplier hear in the app. */
const DESKS = 5

/**
 * Tell every supplier whose candidate was stood down by this award.
 *
 * Called by the award, after its transaction, with the submission that
 * was placed. Does nothing unless that award filled the job. Never
 * throws: a slow bell must never hold up the award that rang it.
 * Resolves to the number of notices written.
 */
export async function tellNotChosen(placedSubmissionId: string): Promise<number> {
  try {
    const placed = await prisma.submission.findUnique({
      where: { id: placedSubmissionId },
      select: {
        id: true, decidedAt: true, requirementId: true,
        requirement: { select: { title: true, status: true, company: { select: { name: true } } } },
      },
    })
    if (!placed || !placed.decidedAt || placed.requirement.status !== 'FILLED') return 0
    const since = placed.decidedAt

    // Stood down by this award: not selected for timing, at or after
    // the moment the placed submission was decided, in the same step.
    const stood = await prisma.submission.findMany({
      where: {
        requirementId: placed.requirementId,
        id: { not: placed.id },
        status: 'NOT_SELECTED',
        rejectReason: 'TIMING',
        rejectedAt: { gte: since },
      },
      select: { id: true, fromCompanyId: true, person: { select: { name: true } } },
    })
    // Told once. A second call for the same award — a retry, a double
    // click that got through — must not ring the bell twice.
    const already = await prisma.notification.findMany({
      where: {
        entityId: { in: stood.map((s) => s.id) },
        type: 'SUBMISSION',
        data: { path: ['event'], equals: 'NOT_CHOSEN' },
      },
      select: { entityId: true },
    })
    const told = new Set(already.map((n) => n.entityId))
    const fresh = stood.filter((s) => !told.has(s.id))
    if (fresh.length === 0) return 0
    const ids = fresh.map((s) => s.id)

    const [calledOff, created, desks] = await Promise.all([
      prisma.interview.findMany({
        where: { submissionId: { in: ids }, state: 'CANCELLED', cancelledAt: { gte: since } },
        select: { submissionId: true },
      }),
      prisma.event.findMany({
        where: { type: 'submission.created', subjectType: 'Submission', subjectId: { in: ids } },
        select: { subjectId: true, actorPersonId: true },
      }),
      prisma.context.findMany({
        where: {
          companyId: { in: Array.from(new Set(stood.map((s) => s.fromCompanyId))) },
          revokedAt: null,
          suspendedAt: null,
          role: { permissions: { hasSome: ['submissions.create', '*'] } },
        },
        select: { companyId: true, personId: true },
        orderBy: { grantedAt: 'asc' },
      }),
    ])

    const hadRound = new Set(calledOff.map((c) => c.submissionId))
    const submitter = new Map(created.map((e) => [e.subjectId, e.actorPersonId]))
    const desksOf = new Map<string, string[]>()
    for (const d of desks) {
      if (!d.companyId) continue
      const list = desksOf.get(d.companyId) ?? []
      if (list.length < DESKS && !list.includes(d.personId)) list.push(d.personId)
      desksOf.set(d.companyId, list)
    }

    const notices = notChosenNotices(
      { requirementId: placed.requirementId, filledBy: placed.requirement.company.name, roleTitle: placed.requirement.title },
      fresh.map((s) => {
        const deskIds = desksOf.get(s.fromCompanyId) ?? []
        const by = submitter.get(s.id) ?? null
        return {
          submissionId: s.id,
          supplierId: s.fromCompanyId,
          personName: s.person.name,
          // Only somebody still holding a seat at the firm that puts
          // people forward; a recruiter who left hears nothing.
          submitterId: by && deskIds.includes(by) ? by : null,
          deskIds,
          roundCalledOff: hadRound.has(s.id),
        }
      })
    )
    // Outward copies go one at a time through notify(), which delivers;
    // in-app copies go in one write.
    const outward = notices.filter((n) => n.channel === 'TEAMS')
    const inApp = notices.filter((n) => n.channel !== 'TEAMS')
    await Promise.all(outward.map((n) => notify(n)))
    await notifyBulk(inApp)
    return notices.length
  } catch (err) {
    console.error(`[not-chosen] could not tell the suppliers for ${placedSubmissionId}:`, err)
    return 0
  }
}
