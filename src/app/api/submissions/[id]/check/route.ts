import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { record } from '@/lib/agent-run'
import {
  ruleChecks, evidencePrompt, evidenceCheck, marketCheck, MAX_ATTEMPTS,
  type Package, type Evidenced,
} from '@/lib/checks'
import { runLoop, lastVerdict, mayProceed, type Finding, type Step } from '@/lib/loop'
import { band, warnAbout, WINDOW_DAYS, type Observation } from '@/lib/benchmark'

/**
 * POST /api/submissions/:id/check
 *
 * Run the loop once. One call, one step.
 *
 * Rules first and always — rate against range, documents against dates,
 * availability against the start date, permit against what the role asks
 * for, and whether the person actually agreed to be put forward. All of
 * that is arithmetic: free, instant, right every time.
 *
 * Then, only if the rules are clean and there is a CV to read, the one
 * question worth paying for: is each claimed skill actually in the CV, and
 * which line. Running it while the rules are still failing would be paying
 * to be told something that is going to be re-asked after the fix.
 *
 * Everything it does lands in two places. AgentRun gets what it cost.
 * Check gets each verdict with its evidence and who did the checking —
 * rule, model or person — because the identity of the checker is the whole
 * point, and a person has to be able to review a sample of the model's
 * work later.
 */

const anthropic = new Anthropic()
const MODEL = process.env.CHECK_MODEL ?? 'claude-opus-5'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Submission checks')
  if (notStaff) return notStaff

  const { id } = await params

  const submission = await prisma.submission.findFirst({
    where: { id, fromCompanyId: caller.company!.id },
    include: {
      person: { select: { id: true, name: true } },
      resume: { select: { id: true, textExtract: true } },
      requirement: {
        select: {
          id: true, title: true, skills: true, location: true,
          billMin: true, billMax: true, startDate: true,
        },
      },
    },
  })

  // 404 rather than 403: confirming a submission exists at another vendor
  // is itself a leak.
  if (!submission) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No submission by that id.' } },
      { status: 404 }
    )
  }

  if (submission.checkState === 'SENT') {
    return NextResponse.json(
      {
        error: {
          code: 'ALREADY_SENT',
          message: 'This one has already gone. Checking it now changes nothing.',
        },
      },
      { status: 409 }
    )
  }

  const now = new Date()
  const attempt = submission.checkAttempt + 1
  const companyId = caller.company!.id

  // ── What the checks read ────────────────────────────────────────────
  const [profile, hold, requiredDocs] = await Promise.all([
    prisma.consultantProfile.findFirst({
      where: { personId: submission.personId },
      select: { skills: true, availableFrom: true, workAuth: true },
    }),
    prisma.representation.findFirst({
      where: { personId: submission.personId, companyId, state: { in: ['HELD', 'REQUESTED'] } },
      select: { consentedAt: true },
      orderBy: { takenAt: 'desc' },
    }),
    prisma.docInstance.findMany({
      where: { subjectType: 'PERSON', subjectId: submission.personId },
      select: { status: true, template: { select: { name: true } } },
    }),
  ])

  const pkg: Package = {
    personName: submission.person.name,
    rateCents: submission.rate,
    billMin: submission.requirement.billMin,
    billMax: submission.requirement.billMax,
    resumeId: submission.resumeId,
    claimedSkills: profile?.skills ?? [],
    documents: requiredDocs.map((d) => ({
      kind: d.template.name,
      // Expiry lives on the document itself where it has one; nothing here
      // yet, so a present document is treated as in date rather than
      // guessed at.
      expiresAt: null,
    })),
    // Nothing is demanded by default. A checklist invented here would fail
    // every submission on day one and be switched off by lunchtime.
    documentsRequired: [],
    availableFrom: profile?.availableFrom ?? null,
    startDate: submission.requirement.startDate,
    workAuth: profile?.workAuth ?? null,
    workAuthRequired: null,
    consented: hold?.consentedAt != null,
  }

  // ── What a package fit to send looks like ───────────────────────────
  //
  // A declaration. Running these, writing the ledger row, keeping the
  // Check rows, counting the attempts, deciding the state and feeding the
  // human sample all belong to the harness — this route only says what is
  // true of a submission that may leave the building.
  //
  // It used to do all of that by hand, which is how a second copy of
  // decide() came to exist alongside the one in loop.ts.
  const cvText = submission.resume?.textExtract ?? null

  // What has cleared before, for the market check below.
  const since = new Date(now.getTime() - WINDOW_DAYS * 86400000)
  const past = await prisma.submission.findMany({
    where: { fromCompanyId: companyId, submittedAt: { gte: since }, id: { not: submission.id } },
    select: {
      rate: true, rejectReason: true, submittedAt: true,
      requirement: { select: { skills: true, location: true } },
    },
    take: 2000,
  })

  const observations: Observation[] = past.map((p) => ({
    rateCents: p.rate,
    survived: p.rejectReason !== 'RATE',
    skills: p.requirement.skills,
    location: p.requirement.location,
    at: p.submittedAt,
  }))

  const steps: Step<Package>[] = [
    {
      code: 'RULES',
      checker: 'RULE',
      run: (p) => ruleChecks(p, now),
    },
    {
      // What has actually cleared, for work like this. The outcome loop
      // turning, and never a failure — a benchmark describes the past, it
      // does not rule on the present.
      code: 'RATE_VS_MARKET',
      checker: 'RULE',
      run: (p) =>
        p.rateCents == null
          ? null
          : marketCheck(
              warnAbout(
                p.rateCents,
                band(
                  observations,
                  { skills: submission.requirement.skills, location: submission.requirement.location },
                  now
                )
              )
            ),
    },
    {
      // The one question worth paying for.
      code: 'SKILLS_EVIDENCED',
      checker: 'MODEL',
      whenItCannotRun:
        'Could not check the CV against the claimed skills this time. Nobody has verified them.',
      run: async (p): Promise<Finding | null> => {
        if (!cvText) {
          return submission.resumeId
            ? {
                code: 'SKILLS_EVIDENCED',
                checker: 'MODEL',
                verdict: 'PASS',
                unverified: true,
                reason: 'The CV could not be read as text, so the skill claims are unchecked.',
              }
            : null
        }

        if (p.claimedSkills.length === 0 || !process.env.ANTHROPIC_API_KEY) return null

        const response = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 4000,
          thinking: { type: 'adaptive' },
          output_config: { effort: 'low' },
          messages: [{ role: 'user', content: evidencePrompt(p.claimedSkills, cvText) }],
        })

        const text = response.content.find((b) => b.type === 'text')
        const raw = text && text.type === 'text' ? text.text : ''
        const json = raw.match(/\[[\s\S]*\]/)
        const answers: Evidenced[] = json ? JSON.parse(json[0]) : []

        return evidenceCheck(p.claimedSkills, answers, cvText)
      },
    },
  ]

  const outcome = await runLoop(
    { name: 'submission.check', recordType: 'SUBMISSION', steps, maxAttempts: MAX_ATTEMPTS },
    pkg,
    { companyId, recordId: submission.id, attempt }
  )

  const state = outcome.state

  await prisma.submission.update({
    where: { id: submission.id },
    data: { checkState: state, checkAttempt: attempt },
  })

  return NextResponse.json({
    data: {
      submissionId: submission.id,
      ...outcome,
      state,
      maySend: mayProceed(outcome, false),
    },
  })
}

/**
 * GET /api/submissions/:id/check
 *
 * What the last run decided, without running it again. The submission
 * builder opens on this — a screen that re-checks on every render would
 * pay for the model every time somebody scrolled past.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Submission checks')
  if (notStaff) return notStaff

  const { id } = await params

  const submission = await prisma.submission.findFirst({
    where: { id, fromCompanyId: caller.company!.id },
    select: { id: true, checkState: true, checkAttempt: true, overriddenAt: true, overrideReason: true },
  })

  if (!submission) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No submission by that id.' } },
      { status: 404 }
    )
  }

  // Read back through the harness, which knows how to find the newest
  // verdict per code — and scopes the read to this company, which this
  // route's own copy of the query did not.
  const outcome = await lastVerdict(
    { recordType: 'SUBMISSION', maxAttempts: MAX_ATTEMPTS },
    submission.id,
    submission.checkAttempt,
    caller.company!.id
  )

  return NextResponse.json({
    data: {
      submissionId: submission.id,
      ...outcome,
      state: submission.checkState,
      neverRun: submission.checkAttempt === 0,
      summary: submission.checkAttempt === 0 ? 'Not checked yet.' : outcome.summary,
      maySend: mayProceed(outcome, submission.overriddenAt !== null),
      override: submission.overriddenAt
        ? { at: submission.overriddenAt.toISOString(), reason: submission.overrideReason }
        : null,
    },
  })
}
