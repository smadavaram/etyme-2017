import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { runLoop, lastVerdict, type Finding, type Step } from '@/lib/loop'
import { evidencePrompt, evidenceCheck, type Evidenced } from '@/lib/checks'
import { evaluateGovernance } from '@/lib/governance'
import { endClientFilter } from '@/lib/resolve-end-client'
import {
  screenRules, shortlist, MAX_ATTEMPTS,
  type Arriving, type Screened,
} from '@/lib/screening'

/**
 * POST /api/requirements/:id/screen — screen everything that arrived
 * GET  /api/requirements/:id/screen — what the last screen decided
 *
 * The demand side of the check loop. The vendor's own check asks whether
 * a package is fit to leave their building; this asks whether it is worth
 * the hiring manager's afternoon, and it can ask three things no vendor
 * is able to: has somebody else already sent this person, does this
 * person's tenure here already breach the cap, and did they leave badly
 * last time.
 *
 * Scoped on `toCompanyId`, not on who owns the requirement. A prime
 * screening what its sub-vendors sent is the same operation as a client
 * screening what its primes sent, and the layer cake means both happen on
 * the same day against the same person.
 */

const anthropic = new Anthropic()
const MODEL = process.env.CHECK_MODEL ?? 'claude-opus-5'

const DAY = 86_400_000

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Screening')
  if (notStaff) return notStaff

  const { id } = await params
  const companyId = caller.company!.id
  const now = new Date()

  const requirement = await prisma.requirement.findUnique({
    where: { id },
    select: {
      id: true, title: true, skills: true, startDate: true,
      billMax: true, openToNetwork: true, openingId: true,
      mirroredFromId: true, mirrors: { select: { id: true } },
    },
  })

  if (!requirement) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No role by that id.' } },
      { status: 404 }
    )
  }

  // Everything sent to us against this role. Not everything on the role —
  // a prime's own outgoing submissions are none of the client's business
  // and vice versa.
  const arrivals = await prisma.submission.findMany({
    where: { requirementId: id, toCompanyId: companyId },
    include: {
      person: { select: { id: true, name: true } },
      fromCompany: { select: { id: true, name: true } },
      resume: { select: { textExtract: true } },
    },
    orderBy: { submittedAt: 'asc' },
  })

  // 404 rather than 403 on a role nobody has sent us anything for and
  // that is not ours: confirming a role exists elsewhere is itself a leak.
  if (arrivals.length === 0) {
    const ours = await prisma.requirement.findFirst({
      where: { id, OR: [{ companyId }, { payerCompanyId: companyId }] },
      select: { id: true },
    })
    if (!ours) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'No role by that id.' } },
        { status: 404 }
      )
    }
    return NextResponse.json({
      data: { requirementId: id, ...shortlist([]), screened: 0 },
    })
  }

  const personIds = arrivals.map((a) => a.personId)

  // ── The seat, not the row ───────────────────────────────────────────
  //
  // A duplicate that actually hurts arrives through two different primes,
  // on two different requirement records that point at the same opening.
  // Screening one row against itself would never find it.
  const siblingIds = await siblingRequirements(requirement)

  const [elsewhere, barred, invitations, agreements, priorWork, matches] =
    await Promise.all([
      prisma.submission.findMany({
        where: {
          toCompanyId: companyId,
          personId: { in: personIds },
          requirementId: { in: siblingIds },
          id: { notIn: arrivals.map((a) => a.id) },
        },
        select: {
          personId: true, rate: true, submittedAt: true,
          fromCompany: { select: { name: true } },
        },
      }),
      prisma.blacklist.findMany({
        where: {
          companyId,
          targetType: 'PERSON',
          targetId: { in: personIds },
          liftedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: { targetId: true, reason: true, blockedAt: true },
      }),
      prisma.requirementInvitation.findMany({
        where: { requirementId: { in: siblingIds }, fromCompanyId: companyId },
        select: { toCompanyId: true, payMax: true, status: true },
      }),
      // An agreement either way round. A client buying from a vendor and
      // a prime buying from a sub-vendor are the same relationship seen
      // from opposite ends, and both mean "we already work with them".
      prisma.masterAgreement.findMany({
        where: {
          OR: [
            { clientId: companyId, vendorId: { in: arrivals.map((a) => a.fromCompanyId) } },
            { vendorId: companyId, clientId: { in: arrivals.map((a) => a.fromCompanyId) } },
          ],
        },
        select: { clientId: true, vendorId: true, signedAt: true },
      }),
      // Time already served here, across every vendor and every
      // assignment. The industry tracks this per assignment, which is
      // exactly how a twenty-four month exposure reads as two twelves.
      prisma.sellContract.findMany({
        where: {
          ...endClientFilter(companyId),
          personId: { in: personIds },
          endDate: { lt: now },
        },
        select: { personId: true, startDate: true, endDate: true },
      }),
      prisma.match.findMany({
        where: { requirementId: { in: siblingIds } },
        select: { score: true, consultant: { select: { personId: true } } },
      }),
    ])

  const barredBy = new Map(barred.map((b) => [b.targetId, b]))
  const inviteFor = new Map(invitations.map((i) => [i.toCompanyId, i]))
  const scoreFor = new Map(matches.map((m) => [m.consultant.personId, m.score]))

  // Unsigned counts. Work running on a handshake between an offer and a
  // start date is the ordinary state of this industry, and holding back a
  // submission from a supplier you are actively working with because the
  // paperwork is with legal would be the screen making the problem.
  const agreedWith = new Set(
    agreements.map((m) => (m.clientId === companyId ? m.vendorId : m.clientId))
  )

  const results: Screened[] = []

  for (const s of arrivals) {
    const attempt = s.screenAttempt + 1
    const invite = inviteFor.get(s.fromCompanyId)

    // Governance is its own engine and writes its own audit row. The
    // screen reads its verdict rather than re-implementing tenure maths
    // that Addendum E already settled.
    let governance: Arriving['governance'] = null
    try {
      const g = await evaluateGovernance({
        personId: s.personId,
        endClientCompanyId: companyId,
        vendorCompanyId: s.fromCompanyId,
        triggerPoint: 'SUBMISSION',
        subjectType: 'PERSON',
        subjectId: s.personId,
        billRate: s.rate,
        requirementId: requirement.id,
      })
      governance = g.evaluations.length ? { outcome: g.outcome, summary: g.summary } : null
    } catch {
      // A governance engine that will not answer must not read as a pass.
      // The finding below is the honest version.
      governance = null
    }

    const profile = await prisma.consultantProfile.findFirst({
      where: { personId: s.personId },
      select: { skills: true, availableFrom: true, workAuth: true },
    })

    const arriving: Arriving = {
      personName: s.person.name,
      vendorName: s.fromCompany.name,
      rateCents: s.rate,
      bandMaxCents: invite?.payMax ?? null,
      budgetMaxCents: requirement.billMax,
      others: elsewhere
        .filter((o) => o.personId === s.personId)
        .map((o) => ({
          vendorName: o.fromCompany.name,
          rateCents: o.rate,
          submittedAt: o.submittedAt,
        })),
      submittedAt: s.submittedAt,
      workAuth: profile?.workAuth ?? null,
      workAuthRequired: null,
      availableFrom: profile?.availableFrom ?? null,
      startDate: requirement.startDate,
      invited: invite != null && invite.status !== 'DECLINED',
      openToNetwork: requirement.openToNetwork,
      msaActive: agreedWith.has(s.fromCompanyId),
      governance,
      barred: barredBy.has(s.personId)
        ? { at: barredBy.get(s.personId)!.blockedAt, reason: barredBy.get(s.personId)!.reason }
        : null,
      workedHereBefore: monthsHere(priorWork.filter((c) => c.personId === s.personId)),
    }

    const cvText = s.resume?.textExtract ?? null
    const claimed = profile?.skills ?? []

    const steps: Step<Arriving>[] = [
      { code: 'RULES', checker: 'RULE', run: (a) => screenRules(a, now) },
      {
        // The same question the vendor's own check asks, asked again by
        // the party who will actually pay for being wrong. Not redundant:
        // the vendor grading its own submission is exactly the case the
        // human sample exists to catch.
        code: 'SKILLS_EVIDENCED',
        checker: 'MODEL',
        whenItCannotRun:
          'Could not check the CV against the claimed skills. Nobody has verified them.',
        run: async (): Promise<Finding | null> => {
          if (!cvText || claimed.length === 0 || !process.env.ANTHROPIC_API_KEY) return null

          const response = await anthropic.messages.create({
            model: MODEL,
            max_tokens: 4000,
            thinking: { type: 'adaptive' },
            output_config: { effort: 'low' },
            messages: [{ role: 'user', content: evidencePrompt(claimed, cvText) }],
          })

          const text = response.content.find((b) => b.type === 'text')
          const raw = text && text.type === 'text' ? text.text : ''
          const json = raw.match(/\[[\s\S]*\]/)
          const answers: Evidenced[] = json ? JSON.parse(json[0]) : []

          return evidenceCheck(claimed, answers, cvText)
        },
      },
    ]

    const outcome = await runLoop(
      {
        name: 'submission.screen',
        recordType: 'SUBMISSION',
        steps,
        maxAttempts: MAX_ATTEMPTS,
      },
      arriving,
      { companyId, recordId: s.id, attempt }
    )

    await prisma.submission.update({
      where: { id: s.id },
      data: { screenState: outcome.state, screenAttempt: attempt },
    })

    results.push({
      submissionId: s.id,
      personName: s.person.name,
      vendorName: s.fromCompany.name,
      rateCents: s.rate,
      submittedAt: s.submittedAt,
      cleared: outcome.state === 'READY',
      heldBackFor: outcome.toFix,
      score: scoreFor.get(s.personId) ?? null,
    })
  }

  return NextResponse.json({
    data: { requirementId: id, screened: results.length, ...shortlist(results) },
  })
}

/**
 * GET — what the last screen decided, without paying for it again.
 *
 * The pile is opened far more often than it changes, and a screen that
 * re-ran on every render would bill for the model every time somebody
 * scrolled.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Screening')
  if (notStaff) return notStaff

  const { id } = await params
  const companyId = caller.company!.id

  const arrivals = await prisma.submission.findMany({
    where: { requirementId: id, toCompanyId: companyId },
    include: {
      person: { select: { id: true, name: true } },
      fromCompany: { select: { name: true } },
    },
    orderBy: { submittedAt: 'asc' },
  })

  if (arrivals.length === 0) {
    const ours = await prisma.requirement.findFirst({
      where: { id, OR: [{ companyId }, { payerCompanyId: companyId }] },
      select: { id: true },
    })
    if (!ours) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'No role by that id.' } },
        { status: 404 }
      )
    }
  }

  const matches = await prisma.match.findMany({
    where: { requirementId: id },
    select: { score: true, consultant: { select: { personId: true } } },
  })
  const scoreFor = new Map(matches.map((m) => [m.consultant.personId, m.score]))

  const results: Screened[] = []
  for (const s of arrivals) {
    const outcome = await lastVerdict(
      { recordType: 'SUBMISSION', maxAttempts: MAX_ATTEMPTS },
      s.id,
      s.screenAttempt,
      companyId
    )
    results.push({
      submissionId: s.id,
      personName: s.person.name,
      vendorName: s.fromCompany.name,
      rateCents: s.rate,
      submittedAt: s.submittedAt,
      cleared: s.screenState === 'READY',
      heldBackFor: outcome.toFix,
      score: scoreFor.get(s.personId) ?? null,
    })
  }

  const neverRun = arrivals.every((a) => a.screenAttempt === 0)

  return NextResponse.json({
    data: {
      requirementId: id,
      screened: neverRun ? 0 : results.length,
      neverRun,
      ...shortlist(results),
      ...(neverRun
        ? { summary: `${arrivals.length} arrived. Nothing has been screened yet.` }
        : {}),
    },
  })
}

// ── Small readers ─────────────────────────────────────────────────────

/**
 * Every requirement record that points at the same seat.
 *
 * A prime forwarding to its client mirrors the role, and two primes
 * working the same opening produce two records. The duplicate a client
 * actually suffers from lives across those, not within one.
 */
async function siblingRequirements(r: {
  id: string
  openingId: string | null
  mirroredFromId: string | null
  mirrors: { id: string }[]
}): Promise<string[]> {
  const ids = new Set<string>([r.id, ...r.mirrors.map((m) => m.id)])
  if (r.mirroredFromId) ids.add(r.mirroredFromId)

  if (r.openingId) {
    const sameSeat = await prisma.requirement.findMany({
      where: { openingId: r.openingId },
      select: { id: true },
    })
    for (const s of sameSeat) ids.add(s.id)
  }

  return [...ids]
}

/**
 * Months already served here, summed across every assignment.
 *
 * Twelve through one vendor and twelve through another is twenty-four,
 * which is the whole point of keeping the ledger against the person
 * rather than against the contract.
 */
function monthsHere(
  contracts: { startDate: Date; endDate: Date | null }[]
): { months: number; lastEnded: Date } | null {
  if (contracts.length === 0) return null

  let days = 0
  let last = contracts[0].endDate!
  for (const c of contracts) {
    if (!c.endDate) continue
    days += Math.max(0, (c.endDate.getTime() - c.startDate.getTime()) / DAY)
    if (c.endDate > last) last = c.endDate
  }

  return { months: Math.round(days / 30.44), lastEnded: last }
}
