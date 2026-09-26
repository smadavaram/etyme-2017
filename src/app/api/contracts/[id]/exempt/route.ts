import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import {
  checkAssertion,
  screenExemption,
  type ExemptionBasis,
  type ExemptStatus,
  type WageRuleName,
} from '@/lib/worker-classification'

/**
 * POST /api/contracts/:id/exempt — the employer says whether one of its
 * own people is exempt from overtime, on this buy contract.
 * GET  — what was asserted, and when it is due to be looked at again.
 *
 * ── Why this is recorded and never decided ───────────────────────────
 *
 * Exemption turns on duties: what somebody actually does all day, which
 * is not in this database and will not be. It is an affirmative defense
 * the employer has to prove, and the bill for getting it wrong — two
 * years of back overtime, liquidated damages, fees — goes to them. So
 * Etyme holds the assertion and takes no view.
 *
 * What it can do is arithmetic. `screenExemption` reads the pay shape
 * and rules exemptions OUT where the salary tests cannot be met: there
 * is no outcome that means exempt, only CANNOT_BE_EXEMPT and
 * ETYME_CANNOT_SAY. Asserting against the screen is allowed, and needs
 * a written reason, because the note is the whole of the evidence on the
 * day somebody asks.
 *
 * ── The row is per person per contract ───────────────────────────────
 *
 * Keyed on the employment relationship, so the same person can be exempt
 * at one employer and not at another, and two people on one contract can
 * honestly differ.
 *
 * ── What it refuses ──────────────────────────────────────────────────
 *
 * Anybody who is not the employer. A status that is neither exempt nor
 * nonexempt — where nobody knows yet, the honest record is no assertion
 * at all rather than a third value that reads as though somebody
 * decided. "Exempt" with no exemption named, because §541 is a list and
 * the file has to say which entry it stands on. And a departure from the
 * screen with no reason, or a reason too short to be one.
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'A contract belongs to a company' } },
      { status: 403 }
    )
  }

  const { id } = await params
  const contract = await prisma.buyContract.findFirst({
    where: { id, companyId: caller.company.id },
    select: {
      id: true, contractType: true, payModel: true,
      candidates: {
        select: {
          personId: true, payRate: true, state: true,
          person: { select: { name: true } },
        },
      },
      exemptAssertions: {
        select: {
          personId: true, status: true, basis: true, note: true, wageRule: true,
          assertedAt: true, reviewBy: true, screenSays: true,
          assertedBy: { select: { name: true } },
        },
      },
    },
  })

  if (!contract) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Contract not found' } },
      { status: 404 }
    )
  }

  return NextResponse.json({
    data: {
      contractId: contract.id,
      people: contract.candidates.map((c) => {
        const said = contract.exemptAssertions.find((a) => a.personId === c.personId) ?? null
        const screen = screenExemption(
          { payModel: contract.payModel ?? 'FIXED_HOURLY', payRateCents: c.payRate, paidOnSalaryBasis: false },
          (said?.wageRule as WageRuleName) ?? 'US_FLSA'
        )
        return {
          personId: c.personId,
          personName: c.person.name,
          state: c.state,
          asserted: said,
          // Never a verdict that means exempt. The screen only ever
          // rules exemptions out.
          screen: { outcome: screen.outcome, rulesOut: screen.rulesOut, says: screen.says },
        }
      }),
    },
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'A contract belongs to a company' } },
      { status: 403 }
    )
  }
  // Somebody's overtime entitlement is a pay decision, not a contracting one.
  if (!hasPermission(caller.permissions, 'payroll.run')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'Saying whether somebody is exempt from overtime needs payroll.run',
        },
      },
      { status: 403 }
    )
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const personId = String(body.personId ?? '')

  const contract = await prisma.buyContract.findUnique({
    where: { id },
    select: {
      id: true, companyId: true, payModel: true,
      company: { select: { name: true } },
      candidates: {
        select: { personId: true, payRate: true, person: { select: { name: true } } },
      },
    },
  })

  if (!contract) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Contract not found' } },
      { status: 404 }
    )
  }

  const candidate = contract.candidates.find((c) => c.personId === personId)
  if (!candidate) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_ON_THIS_CONTRACT',
          message:
            'That person is not on this contract. An exemption is asserted about an employment ' +
            'relationship, so it belongs on the contract that employs them.',
          field: 'personId',
        },
      },
      { status: 422 }
    )
  }

  const rule = (typeof body.wageRule === 'string' ? body.wageRule : 'US_FLSA') as WageRuleName
  const screen = screenExemption(
    {
      payModel: contract.payModel ?? 'FIXED_HOURLY',
      payRateCents: candidate.payRate,
      // Nothing in the schema records a salary basis, so the honest,
      // conservative read: paid by the hour unless somebody says.
      paidOnSalaryBasis: body.paidOnSalaryBasis === true,
      weeklySalaryCents: Number.isFinite(Number(body.weeklySalaryCents))
        ? Number(body.weeklySalaryCents)
        : null,
    },
    rule
  )

  const verdict = checkAssertion({
    status: String(body.status ?? '') as ExemptStatus,
    basis: (body.basis ?? null) as ExemptionBasis | null,
    screen,
    note: typeof body.note === 'string' ? body.note : null,
    // Both sides of the same question: only the employer may assert, and
    // the employer is whoever the buy contract belongs to.
    assertedByCompanyId: caller.company.id,
    employerCompanyId: contract.companyId,
    assertedByCompanyName: caller.company.name,
    assertedAt: new Date(),
    reviewBy: body.reviewBy ? new Date(String(body.reviewBy)) : null,
  })

  if (!verdict.ok) {
    return NextResponse.json(
      { error: { code: verdict.code, message: verdict.says } },
      { status: verdict.code === 'NOT_THE_EMPLOYER' ? 403 : 422 }
    )
  }

  const status = String(body.status) as ExemptStatus
  const basis = status === 'EXEMPT' ? ((body.basis ?? null) as ExemptionBasis) : null

  try {
    const row = await prisma.exemptAssertion.upsert({
      // One answer per person per employment relationship. Asserting
      // again supersedes it, which is what a review is.
      where: { buyContractId_personId: { buyContractId: id, personId } },
      create: {
        buyContractId: id,
        personId,
        assertedByCompanyId: caller.company.id,
        assertedById: caller.person.id,
        status,
        basis,
        wageRule: rule,
        // What the screen said on the day, kept with the row so the
        // position is re-derivable rather than trusted.
        screenOutcome: screen.outcome,
        screenRulesOut: screen.rulesOut,
        screenSays: screen.says,
        note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null,
        reviewBy: verdict.reviewBy,
      },
      update: {
        assertedByCompanyId: caller.company.id,
        assertedById: caller.person.id,
        assertedAt: new Date(),
        status,
        basis,
        wageRule: rule,
        screenOutcome: screen.outcome,
        screenRulesOut: screen.rulesOut,
        screenSays: screen.says,
        note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null,
        reviewBy: verdict.reviewBy,
      },
      select: { id: true, status: true, basis: true, reviewBy: true },
    })

    return NextResponse.json(
      {
        data: {
          id: row.id,
          personName: candidate.person.name,
          status: row.status,
          basis: row.basis,
          reviewBy: row.reviewBy?.toISOString() ?? null,
          code: verdict.code,
          says: verdict.says,
          reasons: verdict.reasons,
          screen: { outcome: screen.outcome, rulesOut: screen.rulesOut, says: screen.says },
        },
      },
      { status: 201 }
    )
  } catch (err) {
    reportError('Recording an exempt assertion failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Could not record the assertion' } },
      { status: 500 }
    )
  }
}
