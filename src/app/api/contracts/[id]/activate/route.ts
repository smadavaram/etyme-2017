import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { evaluateGovernance } from '@/lib/governance'
import { resolvedEndClientId } from '@/lib/resolve-end-client'
import { contractClearance } from '@/lib/contract-clearance'
import { contractSide } from '@/lib/resolve-client-company'
import { hasPermission, type Permission } from '@/lib/permissions'
import { notify } from '@/lib/notify'

/**
 * POST /api/contracts/:id/activate
 *
 * Contract state transition endpoint.
 *
 * Body: { action: 'verify' | 'activate' | 'pause' | 'resume' | 'complete' | 'cancel' }
 *
 * Valid transitions (SellContractState):
 *   verify:   DRAFT → PENDING_VERIFICATION
 *   activate: PENDING_VERIFICATION | VERIFIED | DRAFT → IN_PROGRESS
 *   pause:    IN_PROGRESS → PAUSED
 *   resume:   PAUSED → IN_PROGRESS
 *   complete: IN_PROGRESS → ENDED
 *   cancel:   DRAFT | PENDING_VERIFICATION → CANCELLED
 *
 * CLAUDE.md invariant: writes AutomationLog with plain-English reason and honest reversible flag.
 */

const VALID_ACTIONS = ['verify', 'activate', 'pause', 'resume', 'complete', 'cancel'] as const
type Action = typeof VALID_ACTIONS[number]

// Map action → { allowed source states, target state }
const TRANSITIONS: Record<Action, { from: string[]; to: string }> = {
  verify:   { from: ['DRAFT'],                                      to: 'PENDING_VERIFICATION' },
  activate: { from: ['PENDING_VERIFICATION', 'VERIFIED', 'DRAFT'],  to: 'IN_PROGRESS' },
  pause:    { from: ['IN_PROGRESS'],                                 to: 'PAUSED' },
  resume:   { from: ['PAUSED'],                                      to: 'IN_PROGRESS' },
  complete: { from: ['IN_PROGRESS'],                                 to: 'ENDED' },
  cancel:   { from: ['DRAFT', 'PENDING_VERIFICATION'],              to: 'CANCELLED' },
}

// What each action asks of the caller. Starting, pausing and resuming
// somebody is running the placement; ending or cancelling it is a
// termination, which is its own permission because it is its own job.
const NEEDS: Record<Action, Permission> = {
  verify:   'assignments.write',
  activate: 'assignments.write',
  pause:    'assignments.write',
  resume:   'assignments.write',
  complete: 'assignments.terminate',
  cancel:   'assignments.terminate',
}

// Human-readable descriptions for the automation log
const ACTION_SUMMARIES: Record<Action, string> = {
  verify:   'submitted for verification',
  activate: 'activated — work may begin',
  pause:    'paused',
  resume:   'resumed',
  complete: 'completed',
  cancel:   'cancelled',
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params
  const body = await request.json()
  const { action } = body

  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: `action must be one of: ${VALID_ACTIONS.join(', ')}`, field: 'action' } },
      { status: 422 }
    )
  }

  const contract = await prisma.sellContract.findUnique({
    where: { id },
    include: {
      person: { select: { id: true, name: true } },
      company: { select: { id: true, name: true } },
      clientCompany: { select: { id: true, name: true } },
      endClientCompany: { select: { id: true, name: true } },
      // The role, because the clearance picks the start packet off it:
      // a nurse is asked for a state license and a developer is not.
      // A SellContract carries no title of its own.
      requirement: { select: { title: true } },
    },
  })

  if (!contract) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Contract not found' } },
      { status: 404 }
    )
  }

  // ── Who is asking ──
  //
  // A contract has three parties — the supplier whose paper it is, the
  // company it bills, and the site where the work is done — and this
  // route used to hear from none of them in particular. It checked that
  // the caller was signed in, then moved whatever contract id it was
  // given. Any account on the platform could end anybody's placement.
  //
  // A stranger is told so in words. A party without the permission is
  // told which one, because "forbidden" on a button that is on their own
  // screen reads as a fault.
  const side = contractSide(caller, contract)
  if (!side) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_A_PARTY',
          message: `${caller.company?.name ?? 'Your company'} is not a party to this contract. Only ${contract.company.name}, ${contract.clientCompany.name}${contract.endClientCompany ? ` or ${contract.endClientCompany.name}` : ''} can change it.`,
        },
      },
      { status: 403 }
    )
  }
  const needs = NEEDS[action as Action]
  if (!hasPermission(caller.permissions, needs)) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: `${ACTION_SUMMARIES[action as Action].replace(/ —.*$/, '')} needs the ${needs} permission. Ask whoever runs your company's access.`,
        },
      },
      { status: 403 }
    )
  }

  const transition = TRANSITIONS[action as Action]
  if (!transition.from.includes(contract.state)) {
    return NextResponse.json(
      { error: { code: 'INVALID_TRANSITION', message: `Cannot ${action} a contract in state ${contract.state}. Allowed from: ${transition.from.join(', ')}` } },
      { status: 409 }
    )
  }

  const previousState = contract.state
  const newState = transition.to

  // ── Paperwork check on activation ──
  //
  // Before governance, because this is the supplier's own house and
  // governance is the client's policy. A person with no I-9 on file is
  // not a governance question; nobody may start, whatever the client's
  // tenure rules say. Same contract as governance below: BLOCK where
  // legally grounded, WARN with a reason recorded everywhere else.
  if (action === 'activate') {
    // Both selects ask when a document starts, not only when it runs out.
    // Without `validFrom` the floor added on 2026-09-16 reads undefined
    // and the clearance falls back to the day the certificate was issued
    // — so a policy printed today for cover beginning in October passed
    // here as held, at the one moment that matters: somebody starting
    // work. Addendum E names lapsed supplier insurance as a block, and
    // cover that has not begun is the same exposure a month early.
    //
    // 2026-09-17, on the same precedent and for the same reason a column
    // nobody selects is invisible to arithmetic that is already right:
    // `provider` and `result` carry who issued a license and its number
    // and state, which is what the refusal has to name — "RN 154-882, WI
    // expired" is something a compliance officer can check against a
    // register and "your license expired" is not.
    const FLOOR_AND_CEILING = {
      type: true, status: true, issuedAt: true, validFrom: true, expiresAt: true, verifiedAt: true,
      provider: true, result: true,
    } as const
    const [personVerifications, supplier, supplierCertificates] = await Promise.all([
      prisma.verification.findMany({
        where: { personId: contract.personId },
        select: FLOOR_AND_CEILING,
      }),
      prisma.company.findUnique({ where: { id: contract.companyId }, select: { name: true } }),
      prisma.verification.findMany({
        where: {
          companyId: contract.companyId,
          type: { in: ['INSURANCE_GL', 'INSURANCE_WC', 'INSURANCE_EO', 'INSURANCE_CYBER'] },
        },
        select: FLOOR_AND_CEILING,
      }),
    ])
    const papers = contractClearance({
      personName: contract.person.name,
      personVerifications,
      supplierName: supplier?.name ?? 'the supplier',
      supplierCertificates,
      clientName: contract.clientCompany.name,
      on: new Date(),
      // 2026-09-17. The role decides which start packet is run, and a
      // licensed role's packet requires the license — so a nurse with no
      // license on file at all is refused here, where before there was
      // no row to be lapsed and nothing to refuse. The last day says
      // whether a license in date today runs out inside the assignment.
      role: contract.requirement?.title ?? null,
      through: contract.endDate,
    })

    if (papers.outcome === 'BLOCK') {
      return NextResponse.json(
        {
          error: {
            code: 'DOCUMENTS_BLOCK',
            message: papers.says,
            fix: papers.fix,
            blocking: papers.blocking,
            cover: papers.cover.outcome,
          },
        },
        { status: 403 }
      )
    }

    if (papers.outcome === 'WARN' && !body.overrideReason) {
      return NextResponse.json(
        {
          error: {
            code: 'DOCUMENTS_WARN',
            message: papers.says,
            fix: papers.fix,
            chasing: papers.chasing,
            cover: papers.cover.outcome,
            overridable: true,
          },
        },
        { status: 422 }
      )
    }
  }

  // ── Governance check on activation ──
  // "BLOCK where legally grounded... WARN, capture a reason, proceed"
  if (action === 'activate') {
    const endClientId = resolvedEndClientId(contract)

    const governance = await evaluateGovernance({
      personId: contract.personId,
      endClientCompanyId: endClientId,
      vendorCompanyId: contract.companyId,
      triggerPoint: 'CONTRACT_START',
      subjectType: 'SELL_CONTRACT',
      subjectId: id,
      billRate: contract.billRate,
    })

    if (!governance.canProceed) {
      return NextResponse.json(
        {
          error: {
            code: 'GOVERNANCE_BLOCK',
            message: governance.summary,
            evaluations: governance.evaluations,
          },
        },
        { status: 403 }
      )
    }

    // If there are warnings, include them in the response but allow proceeding
    // The caller can override with { action: 'activate', overrideReason: '...' }
    if (governance.outcome === 'WARN' && !body.overrideReason) {
      return NextResponse.json(
        {
          error: {
            code: 'GOVERNANCE_WARN',
            message: governance.summary,
            evaluations: governance.evaluations,
            overridable: true,
          },
        },
        { status: 422 }
      )
    }

    // If overriding a warning, record the override
    if (governance.outcome === 'WARN' && body.overrideReason) {
      const warnEvals = governance.evaluations.filter((e) => e.outcome === 'WARN')
      for (const we of warnEvals) {
        await prisma.governanceEvaluation.updateMany({
          where: {
            ruleId: we.ruleId,
            subjectId: id,
            outcome: 'WARN',
            overriddenBy: null,
          },
          data: {
            overriddenBy: caller.person.id,
            overrideNote: body.overrideReason,
          },
        })
      }
    }
  }

  // The buy side moves with the sell side. Activating a placement started
  // the sell contract and left the buy contract it is supplied through in
  // DRAFT for ever — so the vendor's pay cycles belonged to a contract
  // that had never begun, and nothing ever ended it either. One button,
  // both records, the same transition, only where the buy contract is at
  // a state the same action moves from.
  const linked = await prisma.sellContract.findUnique({
    where: { id },
    select: { buyLinks: { select: { buyContractId: true } } },
  })
  const buyIds = linked?.buyLinks.map((l) => l.buyContractId) ?? []

  await prisma.$transaction([
    prisma.sellContract.update({
      where: { id },
      data: { state: newState as any },
    }),
    prisma.buyContract.updateMany({
      where: { id: { in: buyIds }, state: { in: TRANSITIONS[action as Action].from as any } },
      data: { state: newState as any },
    }),
    prisma.automationLog.create({
      data: {
        companyId: contract.companyId,
        action: `CONTRACT_${action.toUpperCase()}`,
        summary: `${contract.person.name}'s contract at ${contract.endClientCompany?.name ?? contract.clientCompany.name} ${ACTION_SUMMARIES[action as Action]}`,
        reason: `State transition ${previousState} → ${newState} by ${caller.person.name}`,
        payload: {
          contractId: id,
          personId: contract.person.id,
          vendorId: contract.companyId,
          clientId: contract.clientCompanyId,
          action,
          from: previousState,
          to: newState,
          // Which side pressed it. The same button is the supplier
          // starting somebody and the client ending them, and the log
          // has to say which.
          by: { personId: caller.person.id, companyId: caller.company?.id ?? null, side },
          // Where the paperwork warned and somebody proceeded anyway,
          // their reason travels with the record. Never silently permit.
          documentsOverride: action === 'activate' ? (body.overrideReason ?? null) : null,
        },
        // Cancellation and completion are not easily reversible
        reversible: !['complete', 'cancel'].includes(action),
      },
    }),
  ])

  // Notify the consultant about contract state changes
  // Activation, completion, and cancellation are the ones they need to know about
  const notifyActions = ['activate', 'complete', 'cancel', 'pause', 'resume'] as const
  if ((notifyActions as readonly string[]).includes(action)) {
    const clientName = contract.endClientCompany?.name ?? contract.clientCompany.name

    notify({
      personId: contract.person.id,
      companyId: contract.companyId,
      type: 'CONTRACT',
      title: `Contract ${ACTION_SUMMARIES[action as Action]}`,
      body: `Your contract at ${clientName} has been ${ACTION_SUMMARIES[action as Action]} by ${caller.person.name}`,
      entityId: id,
      data: { contractId: id, action, from: previousState, to: newState },
    })
  }

  return NextResponse.json({
    data: {
      id,
      previousState,
      state: newState,
      action,
      personName: contract.person.name,
      message: `Contract ${ACTION_SUMMARIES[action as Action]}`,
      governance: action === 'activate' ? 'checked' : undefined,
    },
  })
}
