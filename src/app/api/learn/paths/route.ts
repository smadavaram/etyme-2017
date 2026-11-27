import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { pluginGate } from '@/lib/plugin-gate'
import { callModel } from '@/lib/model-gateway/call'
import { trackOf, lessonsOf } from '@/lib/training/courses/index'
import { readProgress } from '@/lib/training/learn-progress'
import { ensureCourse } from '@/lib/training/learn-db'
import { systemPath, trackFromSignals, type PathSignals } from '@/lib/training/paths/system'
import { promptPath, type DraftFn } from '@/lib/training/paths/prompt'

/**
 * POST /api/learn/paths
 *
 * Proposes a path for one person at this firm. System-made from the record
 * (rules first), or prompt-made through the model gateway with the rules
 * path as the answer whenever the model is off, refused or unusable. Either
 * way it is PROPOSED: nothing is live until the named mentor says yes
 * (PATCH /api/learn/paths/:id). Body: { personId, mode: SYSTEM | PROMPT,
 * prompt?, trackKey?, mentorPersonId? }.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Training')
  if (notStaff) return notStaff
  const off = await pluginGate(caller, 'TRAIN_TO_BENCH')
  if (off) return off
  if (!hasPermission(caller.permissions, 'consultants.write')) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: `Proposing a path is for whoever develops the bench at ${caller.company!.name}.` } }, { status: 403 })
  }
  const companyId = caller.company!.id
  const body = await request.json().catch(() => ({}))
  const mode = body.mode === 'PROMPT' ? 'PROMPT' : 'SYSTEM'
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (mode === 'PROMPT' && !prompt) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say the goal in a sentence, or choose the path made from her record.', field: 'prompt' } }, { status: 422 })

  const person = typeof body.personId === 'string'
    ? await prisma.person.findFirst({ where: { id: body.personId, OR: [{ contexts: { some: { companyId, revokedAt: null } } }, { consultant: { listings: { some: { companyId, revokedAt: null } } } }, { enrollments: { some: { companyId } } }] }, select: { id: true, name: true } })
    : null
  if (!person) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That person is not on your books.' } }, { status: 404 })

  // The mentor holds a seat here, and is named: the proposal is never left without one.
  const mentorId = typeof body.mentorPersonId === 'string' ? body.mentorPersonId : caller.person.id
  const mentorSeat = await prisma.context.findFirst({ where: { personId: mentorId, companyId, revokedAt: null, type: { not: 'CONSULTANT' } }, select: { id: true } })
  if (!mentorSeat) return NextResponse.json({ error: { code: 'NO_MENTOR', message: 'A mentor holds a seat at your firm. Name one.' } }, { status: 422 })
  if (mentorId === person.id) return NextResponse.json({ error: { code: 'NO_MENTOR', message: 'Nobody mentors their own path. Name somebody else.' } }, { status: 422 })

  const [profile, listing, enrolls] = await Promise.all([
    prisma.consultantProfile.findUnique({ where: { personId: person.id }, select: { headline: true, skills: true } }),
    prisma.benchListing.findFirst({ where: { companyId, consultant: { personId: person.id }, state: 'GRANTED', revokedAt: null }, select: { id: true } }),
    prisma.enrollment.findMany({ where: { personId: person.id }, select: { progress: true } }),
  ])
  const signals: PathSignals = {
    role: profile?.headline ?? null, skills: profile?.skills ?? [], onBench: !!listing,
    priorCompletions: [...new Set(enrolls.flatMap((e) => readProgress(e.progress).done))],
  }
  const trackKey = typeof body.trackKey === 'string' && trackOf(body.trackKey) ? body.trackKey : trackFromSignals(signals)
  const track = trackOf(trackKey)
  if (!track) return NextResponse.json({ error: { code: 'NO_TRACK', message: 'That track is not written yet.' } }, { status: 404 })
  const known = lessonsOf(track).map((l) => l.lesson.key)
  const rules = systemPath(track, signals)

  let steps = rules.steps
  let by: 'MODEL' | 'RULES' = 'RULES'
  if (mode === 'PROMPT') {
    const draft: DraftFn = async (p) => {
      const got = await callModel({
        companyId, personId: caller.person.id, skillKey: 'training.path', purpose: 'Draft a learning path from a stated goal',
        prompt: p, record: { recordType: 'TWIN_LEDGER', recordId: companyId }, maxTokens: 600, vocab: { keep: known },
      })
      return got.ok ? { ok: true, text: got.text } : { ok: false }
    }
    const r = await promptPath(prompt, known, draft, rules.steps)
    steps = r.steps; by = r.by
  }
  const c = await ensureCourse(companyId, trackKey)
  const row = await prisma.learningPath.create({
    data: {
      companyId, personId: person.id, courseId: c?.id ?? null, generationType: mode,
      sourcePrompt: mode === 'PROMPT' ? prompt : null, sourceSignals: mode === 'SYSTEM' ? (signals as object) : undefined,
      mentorPersonId: mentorId, videoSource: null, steps, state: 'PROPOSED',
    },
    select: { id: true },
  })
  await prisma.automationLog.create({
    data: {
      companyId, action: 'LEARNING_PATH_PROPOSED',
      summary: `A ${mode === 'PROMPT' ? (by === 'MODEL' ? 'model-drafted' : 'rules-made (the model gave nothing usable)') : 'rules-made'} path was proposed for ${person.name}. It waits for its mentor’s yes.`,
      reason: mode === 'SYSTEM' ? rules.why : 'The goal was stated in words; the path follows it, or the rules where no draft was usable.',
      payload: { pathId: row.id, personId: person.id, trackKey, by }, reversible: false,
    },
  })
  return NextResponse.json({ data: { id: row.id, state: 'PROPOSED', steps, madeBy: by, says: 'Proposed. It is not live until its mentor says yes.' } }, { status: 201 })
}

/**
 * GET /api/learn/paths  — the mentor's queue: every path waiting for this
 * seat's yes, with the learner's name and what is already due. Only paths
 * naming the caller as mentor, at the caller's firm.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Training')
  if (notStaff) return notStaff
  const off = await pluginGate(caller, 'TRAIN_TO_BENCH')
  if (off) return off
  const rows = await prisma.learningPath.findMany({
    where: { companyId: caller.company!.id, mentorPersonId: caller.person.id, state: 'PROPOSED' },
    orderBy: { createdAt: 'asc' }, take: 100,
    select: { id: true, steps: true, dueOn: true, stepDues: true, generationType: true, person: { select: { name: true } } },
  })
  return NextResponse.json({ data: rows.map((r) => ({ id: r.id, learner: r.person.name, lessons: Array.isArray(r.steps) ? (r.steps as string[]).length : 0, dueOn: r.dueOn ? r.dueOn.toISOString().slice(0, 10) : null, madeBy: r.generationType })) })
}
