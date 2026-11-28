import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { learnTenant } from '@/lib/training/learn-read'
import { ensureCourse } from '@/lib/training/learn-db'
import { trackOf } from '@/lib/training/courses/index'
import { readProgress } from '@/lib/training/learn-progress'
import { systemPath } from '@/lib/training/paths/system'
import { jobReadyPath } from '@/lib/training/paths/for-skills'
import { mayOfferToApplicant } from '@/lib/training/paths/door'

/**
 * POST /api/learn/:tenant/ready  { yes: true, track?, jobId? }
 *
 * A person who came in from the firm's public site says yes to a learning
 * path. The yes is hers, from her own session: nobody else can give it, and
 * no path exists before it. It is never a condition of applying, never
 * shown to the client, and never a decision about her. This route reads
 * and writes no application, no submission and no lead: her application
 * stands on its own. The path is PROPOSED with no mentor until a seat that
 * develops the bench takes it, and nothing is live before that mentor's yes.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { tenant } = await params
  const t = await learnTenant(tenant)
  if (!t) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'There is no learning site at this address.' } }, { status: 404 })
  const body = await request.json().catch(() => ({}))
  const may = mayOfferToApplicant({ yes: body.yes === true, signedIn: !!caller.person?.id })
  if (!may.ok) return NextResponse.json({ error: { code: 'NO_YES', message: may.message, field: 'yes' } }, { status: 422 })
  const trackKey = typeof body.track === 'string' ? body.track : 'it-upgrade'
  const track = trackOf(trackKey)
  const c = track ? await ensureCourse(t.id, trackKey) : null
  if (!track || !c) return NextResponse.json({ error: { code: 'NO_TRACK', message: 'That track is not written yet.' } }, { status: 404 })
  const open = await prisma.learningPath.findFirst({ where: { companyId: t.id, personId: caller.person.id, sourceKind: 'DOOR', courseId: c.id, state: { in: ['PROPOSED', 'APPROVED', 'ACTIVE'] } }, select: { id: true, state: true } })
  if (open) return NextResponse.json({ data: { id: open.id, state: open.state, says: 'You already asked. Your path is with the firm.' } })
  const done = (await prisma.enrollment.findMany({ where: { personId: caller.person.id }, select: { progress: true } })).flatMap((e) => readProgress(e.progress).done)
  // A job of the firm's own, named by the door; its title is the only thing taken from it.
  const job = typeof body.jobId === 'string' ? await prisma.requirement.findFirst({ where: { id: body.jobId, companyId: t.id }, select: { id: true, title: true, skills: true } }) : null
  const made = job ? jobReadyPath(track, { jobId: job.id, jobTitle: job.title, skills: job.skills, priorCompletions: done }) : null
  const steps = made ? made.steps : systemPath(track, { priorCompletions: done, requirementTrack: track.key }).steps
  const now = new Date()
  const row = await prisma.learningPath.create({
    data: {
      companyId: t.id, personId: caller.person.id, courseId: c.id, generationType: 'SYSTEM', sourceSignals: { priorCompletions: done } as object,
      mentorPersonId: null, steps, state: 'PROPOSED', consentedAt: now,
      sourceKind: 'DOOR', sourceRefId: job?.id ?? null, sourceLabel: job ? `Asked for from the site, for the job: ${job.title}` : 'Asked for from the site',
    },
    select: { id: true },
  })
  await prisma.automationLog.create({
    data: {
      companyId: t.id, action: 'LEARNING_PATH_PROPOSED',
      summary: `${caller.person.name} said yes to a learning path from the firm’s site. It waits for a mentor.`,
      reason: 'She asked for it herself. It is not part of any application and decides nothing about her.',
      payload: { pathId: row.id, personId: caller.person.id }, reversible: false,
    },
  })
  return NextResponse.json({ data: { id: row.id, state: 'PROPOSED', says: 'Thank you. A mentor at the firm will look at it. Your application does not depend on it.' } }, { status: 201 })
}
