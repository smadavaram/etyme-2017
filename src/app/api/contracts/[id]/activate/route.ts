import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { evaluateGovernance } from '@/lib/governance'
import { resolvedEndClientId } from '@/lib/resolve-end-client'
import { contractClearance, lineExtras, ADVERSE_STEPS } from '@/lib/contract-clearance'
import { contractSide } from '@/lib/resolve-client-company'
import { hasPermission, type Permission, askTheDesk } from '@/lib/permissions'
import { notify } from '@/lib/notify'
import { termsGate } from '@/lib/award/terms-on-record'
import { partiesSay, siteSay, startSays } from './words'
import { startWarningVerdict, type StartWarning } from '@/lib/money/start-warnings'

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

// What each action is, said as the start of a refusal to somebody whose
// role does not do it: "Starting a placement is done by …". The log's
// past-tense summaries below read wrong there ("activated is done by").
const DOING: Record<Action, string> = {
  verify:   'Sending a placement for verification',
  activate: 'Starting a placement',
  pause:    'Pausing a placement',
  resume:   'Resuming a placement',
  complete: 'Ending a placement',
  cancel:   'Canceling a placement before it starts',
}

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
  const side = contractSide(caller, contract)
  if (!side) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_A_PARTY',
          message: `${caller.company?.name ?? 'Your company'} is not a party to this contract. Only ${partiesSay([contract.company.name, contract.clientCompany.name, contract.endClientCompany?.name])} can change it.`,
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
          message: askTheDesk({ doing: DOING[action as Action], needs: needs, kind: caller.company?.kind, companyName: caller.company?.name }),
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
    // 2026-10-20, found by the simulation: the person's own rows also need
    // the form's edition and the documents recorded behind it, the two
    // columns the placement page already selects. Without them every I-9
    // read "on file with nothing behind it" at the start, and an edition
    // was never judged — the same column-nobody-selects fault as above.
    const now = new Date()
    const [personRows, supplier, supplierCertificates] = await Promise.all([
      prisma.verification.findMany({
        where: { personId: contract.personId },
        select: {
          ...FLOOR_AND_CEILING,
          // The firm's steps after a flagged report, rows of their own since
          // 2026-10-21: a decision not to act on one stops the start warning.
          ...ADVERSE_STEPS,
          formEdition: true,
          backedBy: {
            select: {
              evidence: { select: { type: true, validFrom: true, issuedAt: true, expiresAt: true, status: true } },
            },
          },
        },
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
    // What each form was completed from, and whether that document is in
    // force today — read the way the placement page reads it, so the page
    // and the button give one verdict.
    const personVerifications = personRows.map((v) => ({
      ...v,
      backedBy: v.backedBy.map((b) => {
        const from = b.evidence.validFrom ?? b.evidence.issuedAt
        return {
          key: b.evidence.type,
          inForce:
            (b.evidence.status === 'CLEAR' || b.evidence.status === 'CONDITIONAL') &&
            !(from && from > now) &&
            !(b.evidence.expiresAt && b.evidence.expiresAt < now),
        }
      }),
    }))
    const papers = contractClearance({
      personName: contract.person.name,
      personVerifications,
      supplierName: supplier?.name ?? 'the supplier',
      supplierCertificates,
      clientName: contract.clientCompany.name,
      on: now,
      // 2026-09-17. The role decides which start packet is run, and a
      // licensed role's packet requires the license — so a nurse with no
      // license on file at all is refused here, where before there was
      // no row to be lapsed and nothing to refuse. The last day says
      // whether a license in date today runs out inside the assignment.
      role: contract.requirement?.title ?? null,
      through: contract.endDate,
      // ── What this line itself asks for ──────────────────────────────
      //
      // Spread last, and it must be: it supersedes `supplierCertificates`
      // above with a superset that also carries the certificate of good
      // standing — every caller here selected keys beginning INSURANCE_,
      // so a supplier whose registration had been suspended read as
      // fully covered — and it supersedes nothing else that is set, while
      // adding the line's own required set, the papers signed against it
      // and both firms' document dictionaries.
      //
      // Until this was passed, a start was refused on the old fixed list
      // and a client's own order could ask for a drug screen, a clearance
      // or a code of conduct and nothing at activation would read it. A
      // requirement a client typed and nobody enforces is worse than one
      // it was never offered.
      ...(await lineExtras({ sellContractId: contract.id })),
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
