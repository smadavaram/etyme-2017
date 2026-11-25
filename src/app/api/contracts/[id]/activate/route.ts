import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { PAYROLL_RUN } from '@/lib/payroll-paid'
import { evaluateGovernance } from '@/lib/governance'
import { resolvedEndClientId } from '@/lib/resolve-end-client'
import { contractSide } from '@/lib/resolve-client-company'
import { notify } from '@/lib/notify'
import { termsGate } from '@/lib/award/terms-on-record'
import { siteSay, startSays } from './words'
import { startPapers, i9DoorAtStart } from './papers'
import { hasPermission } from '@/lib/permissions'
import { gateRefusal, whoMay, seatedRoles, TRANSITIONS, VALID_ACTIONS, DOING, NEEDS, type Action, type GateRefusal } from './gate'
import { whoHereMaySays } from '@/lib/money/who-raises-bills'
import { isSent } from '@/lib/money/bill-state'
import { formatDay } from '@/lib/format-date'
import { startWarningVerdict, startIdentityWarning, type StartWarning } from '@/lib/money/start-warnings'
import { logAccess, recordRefusal, accessActor } from '@/lib/access-log'
import { calendarDayIn, lastDayOnSite, cyclesAtLastDay, moneyPastLastDay, lastDaySays, periodCovers, dayKey, payLinesAtLastDay, type WeekAfter } from '@/lib/money/early-end'

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
/**
 * A seat whose role does not do this act reads who at its own firm does,
 * from the seats the firm has filled (layer 2 press, 2026-11-15: the
 * Account Manager and AP & Payroll read "Resource Manager or Contract
 * Manager" at a firm seating neither). Who may do it is not changed.
 */
async function seatedRefusal(caller: Parameters<typeof whoHereMaySays>[0], refused: GateRefusal, action: Action): Promise<GateRefusal> {
  if (refused.error.code !== 'FORBIDDEN') return refused
  return { ...refused, error: { ...refused.error, message: await whoHereMaySays(caller, { doing: DOING[action], needs: NEEDS[action] }) } }
}

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

  const gated = gateRefusal(caller, contract, 'activate')
  const refused = gated && (await seatedRefusal(caller, gated, 'activate'))
  if (refused?.error.code === 'NOT_A_PARTY' || refused?.error.code === 'NOT_FOUND') {
    await recordRefusal([contract.personId], {
      ...accessActor(caller), action: 'COMPLIANCE_CHECK',
      reason: refused.error.code === 'NOT_FOUND'
        ? 'A client asked whether the line between its supplier and a firm below it may start.'
        : 'Asked whether a placement may start, at a firm not party to it.',
    })
    return NextResponse.json({ error: refused.error }, { status: refused.status })
  }
  // Who starts a placement at the caller's kind of firm, said beside every
  // answer, so the placement page can name them ("…then HR activates").
  const who = whoMay('activate', caller.company?.kind, await seatedRoles(caller.company?.id))
  if (refused) {
    // `code` beside `may`: the panel draws the sentence only for a seat
    // whose role does not start placements (FORBIDDEN). A placement in a
    // state a start does not move from says nothing on a screen.
    return NextResponse.json({ data: { id, state: contract.state, may: false, code: refused.error.code, says: refused.error.message, who, terms: null, papers: null } })
  }

  const terms = await termsGate(contract.id)
  const papers = await startPapers(contract)
  logAccess({
    subjectId: contract.personId, ...accessActor(caller), action: 'COMPLIANCE_CHECK',
    reason: 'Read the papers a start needs, to draw the Activate button.',
  })
  // A missing I-9 names where it is recorded: the link for a seat that may
  // record it, who does for any other (`i9DoorAtStart`).
  const i9 = papers.outcome === 'BLOCK' && caller.company
    ? await i9DoorAtStart(
        { companyId: caller.company.id, companyName: caller.company.name, kind: caller.company.kind, holds: (p) => hasPermission(caller.permissions, p as never) },
        contract, papers.blocking,
      )
    : null
  return NextResponse.json({
    data: {
      id,
      state: contract.state,
      may: true,
      code: null,
      says: null,
      who,
      terms: terms.blocks ? { blocks: true, says: terms.says } : null,
      papers: { outcome: papers.outcome, says: papers.says, fix: papers.fix, door: i9?.door ?? null, whoRecords: i9?.whoRecords ?? null },
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
      // Her own time zone, for the day an early end is pressed where the site names none.
      person: { select: { id: true, name: true, timezone: true } },
      company: { select: { id: true, name: true } },
      clientCompany: { select: { id: true, name: true } },
      endClientCompany: { select: { id: true, name: true } },
      // Where the work is done, which the worker is told when it starts,
      // and its time zone, which says what day an early end is pressed on.
      workLocation: { select: { name: true, city: true, state: true, isRemote: true, timeZone: true } },
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
  const gated = gateRefusal(caller, contract, action as Action)
  if (gated) {
    const refused = await seatedRefusal(caller, gated, action as Action)
    if (refused.error.code === 'NOT_FOUND') {
      await recordRefusal([contract.personId], {
        ...accessActor(caller), action: 'CONTRACT_VIEW',
        reason: 'A client tried to change the line between its supplier and a firm below it.',
      })
    }
    return NextResponse.json({ error: refused.error }, { status: refused.status })
  }
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

  // ── The hiring manager's No on who started ──
  //
  // Asked of the hiring manager at the start (`startIdentityConfirmed`):
  // a No is said here as a warning a reason answers, never a block, and a
  // later Yes clears it.
  if (action === 'activate') {
    const answeredBy = contract.startIdentityConfirmed === false && contract.startIdentityConfirmedById
      ? (await prisma.person.findUnique({ where: { id: contract.startIdentityConfirmedById }, select: { name: true } }))?.name ?? null
      : null
    const identity = startIdentityWarning({ confirmed: contract.startIdentityConfirmed, personName: contract.person.name, answeredBy })
    if (identity) warnings.push(identity)
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
  const answeredIdentity = verdict.answered.some((w) => w.code === 'START_IDENTITY_WARN')
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

  // ── Ended early: the real last day on site ─────────────────────────
  //
  // Founder, 2026-11-16. Ending a placement kept its planned end, so Bench
  // and Today read her free only after it and tenure counted days she was
  // not on site. The line's end date becomes the day it is ended, and the
  // planned end goes in the log below (`lib/money/early-end`).
  //
  // Read once before the save, so a refusal costs no lock; and again
  // inside it, on the save's own connection, so a week filed in between
  // is read before anything is cut (2026-11-16, found by a reader).
  const endedAt = new Date()
  const ending = action === 'complete' ? await earlyEnd(prisma, contract, buyIds, endedAt) : null
  if (ending && !ending.ok) {
    return NextResponse.json({ error: { code: 'PAST_LAST_DAY', message: ending.says, week: ending.week } }, { status: 409 })
  }
  let early = ending?.ok && ending.early ? ending : null

  const writes = (db: Db) => [
    db.sellContract.update({
      where: { id },
      data: { state: newState as any, ...(early ? { endDate: early.lastDay } : {}) },
    }),
    db.buyContract.updateMany({
      where: { id: { in: buyIds }, state: { in: TRANSITIONS[action as Action].from as any } },
      data: { state: newState as any },
    }),
    // The pay side ends on the same day: her row on each pay line it
    // moves, the line itself where she is the only person on it, and the
    // window her hours are paid through. Never moved later. A pay line
    // another open placement of hers still pays through keeps her row and
    // its end (`payLinesAtLastDay`).
    //
    // Only what started on or before the last day is cut there. A window,
    // a row or a line that starts after it (a change of supplier set for
    // a later day) is left as written, never given a last day before its
    // first: it holds no day, since no week is filed past the last day.
    ...(early
      ? [
          db.buyContract.updateMany({
            where: { id: { in: early.buyEnding }, startDate: { lte: early.lastDay }, OR: [{ endDate: null }, { endDate: { gt: early.lastDay } }] },
            data: { endDate: early.lastDay },
          }),
          db.buyContractCandidate.updateMany({
            where: {
              buyContractId: { in: early.rowsEnding }, personId: contract.personId, startDate: { lte: early.lastDay },
              OR: [{ endDate: null }, { endDate: { gt: early.lastDay } }],
            },
            data: { endDate: early.lastDay },
          }),
          db.contractLink.updateMany({
            where: { sellContractId: id, effectiveFrom: { lte: early.lastDay }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: early.lastDay } }] },
            data: { effectiveTo: early.lastDay },
          }),
          // No period after the last day; the one holding it is cut at it.
          db.cycle.deleteMany({ where: { id: { in: early.cycles.remove }, completedAt: null } }),
          ...early.cycles.cut.map((c) => db.cycle.updateMany({ where: { id: c.id, completedAt: null }, data: { periodEnd: c.periodEnd } })),
        ]
      : []),
    db.automationLog.create({
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
        reason: `State transition ${previousState} → ${newState} by ${caller.person.name}` +
          (early ? `. ${lastDaySays(early.lastDay)} ${early.plannedEnd ? `It was planned to end ${formatDay(early.plannedEnd)}.` : 'It had no planned end date.'}` : ''),
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
          // Ended early: the planned end kept, beside the real last day
          // now written as the end date, and what that did to the dates.
          ...(early
            ? {
                endDate: { from: early.plannedEnd?.toISOString().slice(0, 10) ?? null, to: dayKey(early.lastDay) },
                cycles: { removed: early.cycles.remove.length, cut: early.cycles.cut.length, leftAsWritten: early.cycles.unplaced },
                // Pay lines another open placement of hers still pays
                // through, which keep her row; and windows that start after
                // the last day, left as written.
                ...(early.keptOpen.length > 0 ? { payLinesKeptOpen: early.keptOpen } : {}),
                ...(early.notStarted.length > 0 ? { windowsStartingLater: early.notStarted } : {}),
              }
            : {}),
          // And where the hiring manager said the person who started is not the one interviewed.
          identityOverride: action === 'activate' && answeredIdentity ? overrideReason : null,
        },
        // Cancellation and completion are not easily reversible
        reversible: !['complete', 'cancel'].includes(action),
      },
    }),
  ]

  const refusedInside = await prisma
    .$transaction(async (tx) => {
      if (action === 'complete') {
        const again = await earlyEnd(tx, contract, buyIds, endedAt)
        if (!again.ok) return again
        early = again.early ? again : null
      }
      // In order, on the save's own connection; a failure undoes them all.
      for (const op of writes(tx)) await op
      return null
    })
  if (refusedInside) {
    return NextResponse.json(
      { error: { code: 'PAST_LAST_DAY', message: refusedInside.says, week: refusedInside.week } },
      { status: 409 },
    )
  }

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
          : `Your placement${role} at ${at}, for ${clientName}${through}, ${TOLD[action as Action]}.${early ? ` ${lastDaySays(early.lastDay)}` : ''} ${caller.person.name} made the change.`,
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
      message: start ? start.says : `Contract ${ACTION_SUMMARIES[action as Action]}${early ? `. ${lastDaySays(early.lastDay)}` : ''}`,
      ...(early ? { endDate: dayKey(early.lastDay), plannedEndDate: early.plannedEnd?.toISOString().slice(0, 10) ?? null } : {}),
      governance: action === 'activate' ? 'checked' : undefined,
    },
  })
}

/** The client a read goes through: the shared one, or the save's own. */
type Db = Prisma.TransactionClient | typeof prisma

/**
 * What ending this line today writes, or the week that refuses it.
 *
 * The last day is today in the site's time zone, else the worker's, else
 * UTC, held to the line (`lastDayOnSite`). Where it is the planned end,
 * nothing about the dates moves. Where it is earlier, hours on a later
 * day refuse it (`moneyPastLastDay`): a week on this line, or billed on
 * it from the rung below, paid by a pay run processed over that day or on
 * an invoice receipt paid, billed on a bill that was sent, or filed. The
 * cycles past it are worked out on this line and on each pay line that
 * ends with it; a pay line that holds other people keeps its own dates.
 * It reads through `db`: the client before the save, the save's own
 * connection inside it.
 */
async function earlyEnd(
  db: Db,
  contract: {
    id: string; personId: string; startDate: Date; endDate: Date | null
    person: { name: string; timezone: string | null }
    workLocation: { timeZone: string | null } | null
  },
  buyIds: string[],
  now: Date,
): Promise<
  | { ok: false; says: string; week: { id: string; weekOf: string; day: string; stage: string } }
  | ({
      ok: true; early: boolean; buyMoving: string[]; buyEnding: string[]; rowsEnding: string[]
      keptOpen: Array<{ buyContractId: string; sellContractId: string }>
      notStarted: Array<{ id: string; buyContractId: string; startsOn: string }>
      cycles: ReturnType<typeof cyclesAtLastDay>
    } & ReturnType<typeof lastDayOnSite>)
> {
  const today = calendarDayIn(now, contract.workLocation?.timeZone ?? contract.person.timezone)
  const day = lastDayOnSite({ startDate: contract.startDate, plannedEnd: contract.endDate, today })
  if (!day.early) return { ok: true, ...day, buyMoving: [], buyEnding: [], rowsEnding: [], keptOpen: [], notStarted: [], cycles: { remove: [], cut: [], unplaced: 0 } }

  // One after another: inside the save these share one connection.
  const buys = await db.buyContract.findMany({
    where: { id: { in: buyIds } },
    select: { id: true, companyId: true, state: true, candidates: { select: { personId: true } } },
  })
  const sheets = await db.timesheet.findMany({
      where: {
        periodEnd: { gt: day.lastDay },
        status: { not: 'REJECTED' },
        OR: [{ sellContractId: contract.id }, { invoiceLines: { some: { sellContractId: contract.id } } }],
      },
      select: {
        id: true, periodStart: true, periodEnd: true, days: true, totalHours: true,
        invoiceLines: { select: { invoice: { select: { status: true } } } },
        vendorBillLines: { select: { vendorBill: { select: { paidAt: true, paidCents: true } } } },
      },
    })
  const payDays = await db.cycle.findMany({
    where: { buyContractId: { in: buyIds }, kind: 'SALARY_PAY', completedAt: { not: null } },
    select: { periodStart: true, periodEnd: true },
  })
  // Every week a processed pay run recorded paying on these pay lines,
  // whatever day it put the hours on: a run before 2026-11-16 paid a week
  // outside its window as one lump on the week's first day. A paid week is
  // named paid, never filed (2026-11-16, found by a reader).
  const employers = [...new Set(buys.map((b) => b.companyId))]
  const runs = employers.length && sheets.length
    ? await db.automationLog.findMany({
        where: { companyId: { in: employers }, action: PAYROLL_RUN, payload: { path: ['action'], equals: 'process' } },
        select: { payload: true },
      })
    : []
  const wanted = new Set(buyIds)
  const paidSheets = new Set<string>()
  for (const r of runs) {
    for (const c of ((r.payload ?? {}) as { contracts?: Array<{ buyContractId?: string; refused?: string | null; paid?: Array<{ timesheetId?: string; hours?: number; overtimeHours?: number }> }> }).contracts ?? []) {
      if (!c.buyContractId || !wanted.has(c.buyContractId) || c.refused || !Array.isArray(c.paid)) continue
      for (const l of c.paid) if (l.timesheetId && (Number(l.hours) > 0 || Number(l.overtimeHours ?? 0) > 0)) paidSheets.add(l.timesheetId)
    }
  }

  const weeks: WeekAfter[] = sheets.map((t) => {
    const receiptPaid = t.vendorBillLines.some((l) => l.vendorBill.paidAt != null || l.vendorBill.paidCents > 0)
    const settledOver = payDays.some((p) =>
      p.periodStart && p.periodEnd && dayKey(p.periodStart) <= dayKey(t.periodEnd) && dayKey(t.periodStart) <= dayKey(p.periodEnd))
    const days = (t.days ?? {}) as Record<string, unknown>
    return {
      id: t.id,
      periodStart: t.periodStart,
      periodEnd: t.periodEnd,
      days,
      totalHours: Number(t.totalHours ?? 0),
      billed: t.invoiceLines.some((l) => isSent(l.invoice.status)),
      // Any paid record names it: an invoice receipt paid, a run's paid
      // lines; or, for a week with no daily hours, a pay day settled over it.
      paid: receiptPaid || paidSheets.has(t.id) || (Object.keys(days).length === 0 && settledOver),
      paidOn: (d: string) => payDays.some((p) => periodCovers(p, d)),
    }
  })
  const past = moneyPastLastDay(weeks, day.lastDay, contract.person.name)
  if (past) {
    return { ok: false, says: past.says, week: { id: past.weekId, weekOf: dayKey(past.weekOf), day: past.day, stage: past.stage } }
  }

  const buyMoving = buys.filter((b) => (TRANSITIONS.complete.from as string[]).includes(b.state)).map((b) => b.id)
  // Another open placement of hers through the same pay line, still paying
  // after the last day: that line keeps her row and its end.
  const otherOpen = buyMoving.length
    ? await db.contractLink.findMany({
        where: {
          buyContractId: { in: buyMoving },
          sellContractId: { not: contract.id },
          sellContract: { personId: contract.personId, state: { notIn: ['ENDED', 'CANCELLED'] } },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: day.lastDay } }],
        },
        select: { buyContractId: true, sellContractId: true },
      })
    : []
  const lines = payLinesAtLastDay({
    moving: buyMoving,
    onlyHers: buys.filter((b) => b.candidates.every((c) => c.personId === contract.personId)).map((b) => b.id),
    otherOpen,
  })
  const buyEnding = lines.linesEnding
  // Windows of this line that start after the last day: left as written.
  const notStarted = (await db.contractLink.findMany({
    where: { sellContractId: contract.id, effectiveFrom: { gt: day.lastDay } },
    select: { id: true, buyContractId: true, effectiveFrom: true },
  })).map((l) => ({ id: l.id, buyContractId: l.buyContractId, startsOn: dayKey(l.effectiveFrom) }))
  const stored = await db.cycle.findMany({
    where: { OR: [{ sellContractId: contract.id }, ...(buyEnding.length ? [{ buyContractId: { in: buyEnding } }] : [])] },
    select: { id: true, completedAt: true, periodStart: true, periodEnd: true },
  })
  return { ok: true, ...day, buyMoving, buyEnding, rowsEnding: lines.rowsEnding, keptOpen: lines.keptOpen, notStarted, cycles: cyclesAtLastDay(stored, day.lastDay) }
}
