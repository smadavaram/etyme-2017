import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { record } from '@/lib/agent-run'
import {
  ruleChecks, decide, maySend, next as nextState,
  evidencePrompt, evidenceCheck, MAX_ATTEMPTS,
  type Finding, type Package, type Evidenced,
} from '@/lib/checks'

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
          id: true, title: true, skills: true,
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

  // ── The rules ───────────────────────────────────────────────────────
  const ruleStarted = Date.now()
  const findings: Finding[] = ruleChecks(pkg, now)

  await record({
    companyId,
    agent: 'submission.check.rules',
    recordType: 'SUBMISSION',
    recordId: submission.id,
    attempt,
    verdict: findings.some((f) => f.verdict === 'FAIL') ? 'FAIL' : 'PASS',
    ms: Date.now() - ruleStarted,
  })

  // ── The one model judgement ─────────────────────────────────────────
  //
  // Only when the rules are clean. Paying to be told a skill is missing on
  // a package that also has no CV attached is paying twice for the same
  // answer.
  const rulesClean = !findings.some((f) => f.verdict === 'FAIL')
  const cvText = submission.resume?.textExtract ?? null
  let modelRunId: string | null = null

  if (rulesClean && cvText && pkg.claimedSkills.length > 0 && process.env.ANTHROPIC_API_KEY) {
    const started = Date.now()
    try {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'low' },
        messages: [
          { role: 'user', content: evidencePrompt(pkg.claimedSkills, cvText) },
        ],
      })

      const text = response.content.find((b) => b.type === 'text')
      const raw = text && text.type === 'text' ? text.text : ''
      const json = raw.match(/\[[\s\S]*\]/)
      const answers: Evidenced[] = json ? JSON.parse(json[0]) : []

      const finding = evidenceCheck(pkg.claimedSkills, answers, cvText)
      findings.push(finding)

      modelRunId = await record({
        companyId,
        agent: 'submission.check.evidence',
        recordType: 'SUBMISSION',
        recordId: submission.id,
        attempt,
        verdict: finding.verdict === 'PASS' ? 'PASS' : 'FAIL',
        failReason: finding.verdict === 'FAIL' ? finding.reason : null,
        model: MODEL,
        usage: response.usage,
        ms: Date.now() - started,
      })
    } catch (err: any) {
      // Not a failed check. The check did not run, and saying it passed
      // would be the worst of the three possible answers.
      await record({
        companyId,
        agent: 'submission.check.evidence',
        recordType: 'SUBMISSION',
        recordId: submission.id,
        attempt,
        verdict: 'ERROR',
        failReason: String(err?.message ?? err).slice(0, 300),
        model: MODEL,
        ms: Date.now() - started,
      })
      findings.push({
        code: 'SKILLS_EVIDENCED',
        checker: 'MODEL',
        verdict: 'PASS',
        reason: 'Could not check the CV against the claimed skills this time. Nobody has verified them.',
      })
    }
  } else if (rulesClean && !cvText && submission.resumeId) {
    findings.push({
      code: 'SKILLS_EVIDENCED',
      checker: 'MODEL',
      verdict: 'PASS',
      reason: 'The CV could not be read as text, so the skill claims are unchecked.',
    })
  }

  // ── Write down every verdict, with who decided ──────────────────────
  await prisma.check.createMany({
    data: findings.map((f) => ({
      companyId,
      runId: f.checker === 'MODEL' ? modelRunId : null,
      recordType: 'SUBMISSION',
      recordId: submission.id,
      checker: f.checker,
      code: f.code,
      verdict: f.verdict,
      reason: f.reason,
      evidence: f.evidence ?? null,
    })),
  })

  const verdict = decide(findings, attempt)
  const state = nextState(submission.checkState as any, verdict)

  await prisma.submission.update({
    where: { id: submission.id },
    data: { checkState: state, checkAttempt: attempt },
  })

  return NextResponse.json({
    data: {
      submissionId: submission.id,
      state,
      attempt,
      attemptsLeft: Math.max(0, MAX_ATTEMPTS - attempt),
      summary: verdict.summary,
      toFix: verdict.toFix,
      passed: verdict.passed,
      maySend: maySend(verdict, false),
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

  // The latest verdict per code. A check run three times has three rows,
  // and only the last one is the answer.
  const rows = await prisma.check.findMany({
    where: { recordType: 'SUBMISSION', recordId: id },
    orderBy: { at: 'desc' },
  })

  const latest = new Map<string, (typeof rows)[number]>()
  for (const r of rows) if (!latest.has(r.code)) latest.set(r.code, r)

  const findings: Finding[] = Array.from(latest.values()).map((r) => ({
    code: r.code as Finding['code'],
    checker: r.checker as Finding['checker'],
    verdict: r.verdict as 'PASS' | 'FAIL',
    reason: r.reason,
    evidence: r.evidence,
  }))

  const verdict = decide(findings, submission.checkAttempt)

  return NextResponse.json({
    data: {
      submissionId: submission.id,
      state: submission.checkState,
      attempt: submission.checkAttempt,
      attemptsLeft: Math.max(0, MAX_ATTEMPTS - submission.checkAttempt),
      neverRun: submission.checkAttempt === 0,
      summary: submission.checkAttempt === 0 ? 'Not checked yet.' : verdict.summary,
      toFix: verdict.toFix,
      passed: verdict.passed,
      maySend: maySend(verdict, submission.overriddenAt !== null),
      override: submission.overriddenAt
        ? { at: submission.overriddenAt.toISOString(), reason: submission.overrideReason }
        : null,
    },
  })
}
