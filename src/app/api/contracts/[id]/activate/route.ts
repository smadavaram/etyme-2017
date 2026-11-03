import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { evaluateGovernance } from '@/lib/governance'
import { resolvedEndClientId } from '@/lib/resolve-end-client'
import { contractSide } from '@/lib/resolve-client-company'
import { notify } from '@/lib/notify'
import { termsGate } from '@/lib/award/terms-on-record'
import { siteSay, startSays } from './words'
import { startPapers } from './papers'
import { gateRefusal, TRANSITIONS, VALID_ACTIONS, type Action } from './gate'
import { startWarningVerdict, type StartWarning } from '@/lib/money/start-warnings'
import { logAccess, recordRefusal, accessActor } from '@/lib/access-log'

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

// What the worker reads about their own placement, after "Your placement
// at <client>". Each names the client, so the notice says what it is about.
const TOLD: Record<Action, string> = {
  verify:   'was sent for verification',
  activate: 'has started — work may begin',
  pause:    'is paused',
  resume:   'has resumed',
  complete: 'has ended',
  cancel:   'was canceled before it started',
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

/**
 * GET /api/contracts/:id/activate
 *
 * What the Activate panel draws, asked of the same gate the press goes
 * through: whether this seat may start this placement today, and, where it
 * may, what the terms and the papers say before it presses. A seat the
 * press would refuse is answered `may: false`, so no button is drawn for
 * it; a firm that is not a party is refused in the press's own words.
 *
 * Nothing is written but the access log: the papers' verdict is a read of
 * the person's file.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { id } = await params

  const contract = await prisma.sellContract.findUnique({
    where: { id },
    include: {
      person: { select: { id: true, name: true } },
      company: { select: { id: true, name: true } },
      clientCompany: { select: { id: true, name: true } },
      endClientCompany: { select: { id: true, name: true } },
      requirement: { select: { title: true } },
    },
  })
  if (!contract) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Contract not found' } }, { status: 404 })
  }

  const refused = gateRefusal(caller, contract, 'activate')
  if (refused?.error.code === 'NOT_A_PARTY') {
    await recordRefusal([contract.personId], {
      ...accessActor(caller), action: 'COMPLIANCE_CHECK', reason: 'Asked whether a placement may start, at a firm not party to it.',
    })
    return NextResponse.json({ error: refused.error }, { status: refused.status })
  }
  if (refused) {
    return NextResponse.json({ data: { id, state: contract.state, may: false, says: refused.error.message, terms: null, papers: null } })
  }

  const terms = await termsGate(contract.id)
  const papers = await startPapers(contract)
  logAccess({
    subjectId: contract.personId, ...accessActor(caller), action: 'COMPLIANCE_CHECK',
    reason: 'Read the papers a start needs, to draw the Activate button.',
  })
  return NextResponse.json({
    data: {
      id,
      state: contract.state,
      may: true,
      says: null,
      terms: terms.blocks ? { blocks: true, says: terms.says } : null,
      papers: { outcome: papers.outcome, says: papers.says, fix: papers.fix },
    },
  })
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
      // Where the work is done, which the worker is told when it starts.
      workLocation: { select: { name: true, city: true, state: true, isRemote: true } },
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

  // Started today or earlier, work may begin; started ahead of the day,
  // the person is cleared to start on it, and every reader is told which.
  const start = action === 'activate' ? startSays(contract.person.name, contract.startDate) : null

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
  const refused = gateRefusal(caller, contract, action as Action)
  if (refused) return NextResponse.json({ error: refused.error }, { status: refused.status })
  const side = contractSide(caller, contract)!
  const transition = TRANSITIONS[action as Action]

  const previousState = contract.state
  const newState = transition.to

  // ── The person's own terms, before anything else about the start ──
  //
  // Since 2026-10-06 an award writes no pay line for somebody whose terms
  // with the first firm are not on record: the placement reads "Awarded,
  // terms pending" until that firm states how it engages them and what it
  // pays, and they agree (`lib/award/hire-terms`). This button went on
  // starting such a placement anyway — a start on no terms, with no pay
  // line for payroll to run from.
  //
  // BLOCK, with no override: it is not a policy somebody may proceed past
  // with a reason, it is the absence of the agreement the work stands on.
  // The sentence is demand's (`termsGate`), so it names whose move it is
  // — the firm's, the person's, or the firm below — in the same words the
  // terms page and the program page use. Asked before the paperwork,
  // because papers for an engagement nobody has agreed are papers for
  // nothing.
  if (action === 'activate') {
    const terms = await termsGate(contract.id)
    if (terms.blocks) {
      return NextResponse.json(
        {
          error: {
            code: 'TERMS_PENDING',
            message: terms.says,
            fix: 'The firm that pays the person states the terms on the placement’s terms page, and the person agrees them on their own page.',
          },
        },
        { status: 409 }
      )
    }
  }

  // ── The warnings a start asks a reason for ──
  //
  // A paper that warns and a client rule that warns are both worked out
  // before either is asked, and asked once, together: a reason typed for
  // the paperwork used to carry the start past a client rule the person
  // had never been shown (lib/money/start-warnings).
  const warnings: StartWarning[] = []

  // ── Paperwork check on activation ──
  //
  // Before governance, because this is the supplier's own house and
  // governance is the client's policy. A person with no I-9 on file is
  // not a governance question; nobody may start, whatever the client's
  // tenure rules say. Same contract as governance below: BLOCK where
  // legally grounded, WARN with a reason recorded everywhere else.
  if (action === 'activate') {
    const papers = await startPapers(contract)

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

    // A paper that warns is asked with the client's rule below, never
    // alone: one refusal names every warning, and one reason (sent back
    // in body.overrideReason) answers what the person was shown.
    if (papers.outcome === 'WARN') {
      warnings.push({
        code: 'DOCUMENTS_WARN',
        says: papers.says,
        detail: { fix: papers.fix, chasing: papers.chasing, cover: papers.cover.outcome },
      })
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

    // A client rule that warns is asked beside the paperwork's warning,
    // with its evaluations: code: 'GOVERNANCE_WARN' where it is the only
    // one, the paperwork's code first where both are.
    if (governance.outcome === 'WARN') {
      warnings.push({ code: 'GOVERNANCE_WARN', says: governance.summary, detail: { evaluations: governance.evaluations } })
    }
  }

  // ── Asked once, answered once ──
  //
  // Every warning in one refusal; a reason answers them all, and where
  // the screen says which it showed (`answering`), only those. A warning
  // that appeared since is asked again, alone.
  const verdict = startWarningVerdict(warnings, {
    reason: typeof body.overrideReason === 'string' ? body.overrideReason : null,
    answering: Array.isArray(body.answering) ? body.answering.filter((x: unknown): x is string => typeof x === 'string') : null,
  })
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.error }, { status: 422 })
  }
  const answeredPapers = verdict.answered.some((w) => w.code === 'DOCUMENTS_WARN')
  const answeredRule = verdict.answered.some((w) => w.code === 'GOVERNANCE_WARN')
  const overrideReason: string | null = typeof body.overrideReason === 'string' ? body.overrideReason.trim() : null

  if (action === 'activate') {
    // The client's rule was answered: record whose reason it was, on each
    // warning it answered.
    if (answeredRule && overrideReason) {
      const governance = warnings.find((w) => w.code === 'GOVERNANCE_WARN')!
      const evaluations = (governance.detail?.evaluations ?? []) as { outcome: string; ruleId: string }[]
      const warnEvals = evaluations.filter((e) => e.outcome === 'WARN')
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
            overrideNote: overrideReason,
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
        // ── The name this is recorded under ──────────────────────────
        //
        // Six names, one per action, each stated whole and all on one
        // line. This was `CONTRACT_${action.toUpperCase()}`, and an
        // action built at runtime is invisible to the scanner behind
        // `__tests__/invariants/autonomy.test.ts`, which reads literals
        // and takes no literal to mean no log at all — so a placement
        // starting and a placement ending, which are what tenure and
        // break-in-service are counted from, were recorded under names
        // `src/lib/autonomy.ts` had never heard of.
        //
        // Past tense, which is a change from what the interpolation
        // produced. The ladder next to these already holds
        // CONTRACT_CREATED and CONTRACT_EXTENDED, and every other name
        // in it records something that happened; CONTRACT_ACTIVATE and
        // CONTRACT_CANCEL read as instructions, which is the one thing
        // an audit row is not. The rows already written under the
        // imperative are re-keyed once by
        // `scripts/rename-automation-actions.mjs`.
        //
        // A name per line. This was one 250-character line, because the
        // reader used to stop at the first comma or the end of the line
        // and a name on a second line was a name nobody had declared.
        // The reader takes the whole value now, so the shape of this
        // expression is a choice again rather than a workaround.
        action:
          action === 'verify' ? 'CONTRACT_VERIFICATION_REQUESTED'
          : action === 'activate' ? 'CONTRACT_ACTIVATED'
          : action === 'pause' ? 'CONTRACT_PAUSED'
          : action === 'resume' ? 'CONTRACT_RESUMED'
          : action === 'complete' ? 'CONTRACT_COMPLETED'
          : 'CONTRACT_CANCELLED',
        summary: start
          ? `${start.says}, at ${contract.endClientCompany?.name ?? contract.clientCompany.name}`
          : `${contract.person.name}'s contract at ${contract.endClientCompany?.name ?? contract.clientCompany.name} ${ACTION_SUMMARIES[action as Action]}`,
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
          // Only where the paperwork warned and the reason answered it.
          documentsOverride: action === 'activate' && answeredPapers ? overrideReason : null,
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
    // Where and for whom (simulation, 2026-10-20): "Contract activated —
    // work may begin" named neither, and seven workers read it.
    const at = siteSay(clientName, contract.workLocation)
    const role = contract.requirement?.title ? ` as ${contract.requirement.title}` : ''
    const through = contract.company.name !== clientName ? ` through ${contract.company.name}` : ''

    notify({
      personId: contract.person.id,
      companyId: contract.companyId,
      type: 'CONTRACT',
      title: `Your placement at ${clientName} ${start ? start.told : TOLD[action as Action]}`,
      body:
        action === 'activate'
          ? `You start${role} at ${at}, working for ${clientName}${through}. ${caller.person.name} started the placement.`
          : `Your placement${role} at ${at}, for ${clientName}${through}, ${TOLD[action as Action]}. ${caller.person.name} made the change.`,
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
      message: start ? start.says : `Contract ${ACTION_SUMMARIES[action as Action]}`,
      governance: action === 'activate' ? 'checked' : undefined,
    },
  })
}
