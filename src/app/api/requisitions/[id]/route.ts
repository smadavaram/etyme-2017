import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { assessFit } from '@/lib/candidate-fit'
import { hasPermission } from '@/lib/permissions'
import { diff, mayChange, said, noticeForSuppliers } from '@/lib/requisition-change'
import { mayEdit, stageOf } from '@/lib/requisition-stage'
import {
  evaluateRequisition,
  annualValue,
  type RequisitionFacts,
  type ApprovalRuleFacts,
  type RuleKind,
  type Seat,
} from '@/lib/requisition-approval'
import { ancestry } from '@/lib/org-tree'
import { endClientFilter } from '@/lib/resolve-end-client'
import { notifyBulk, type NotifyParams } from '@/lib/notify'

/**
 * GET /api/requisitions/:id
 *
 * One requisition, with everything needed to work it: where the approval
 * got to, which vendors were asked and what they said, and who has been
 * put forward.
 *
 * This is the client's side of the glass, so the bands ARE shown — the
 * client set them. The invariant that survives is the other direction: a
 * vendor reading its own invitation still sees only its own
 * (src/lib/invitation-visibility.ts).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params

  const req = await prisma.requirement.findUnique({
    where: { id },
    include: {
      raisedBy: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      orgUnit: { select: { id: true, name: true } },
      costCenter: { select: { id: true, code: true, name: true } },
      company: { select: { id: true, name: true } },
      approvals: {
        include: { approver: { select: { id: true, name: true } } },
        orderBy: { rank: 'asc' },
      },
      invitations: {
        include: { toCompany: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!req) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Requisition not found' } },
      { status: 404 }
    )
  }

  // Only the raising company may open the working view of its own demand.
  if (caller.company?.id !== req.companyId) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'This requisition belongs to another company' } },
      { status: 403 }
    )
  }

  const submissions = await prisma.submission.findMany({
    where: { requirementId: id },
    include: {
      person: {
        select: {
          id: true, name: true,
          consultant: {
            select: {
              headline: true, skills: true, location: true,
              availableFrom: true, workAuth: true,
            },
          },
        },
      },
      fromCompany: { select: { id: true, name: true } },
    },
    orderBy: { submittedAt: 'asc' },
  })

  const now = new Date()

  return NextResponse.json({
    data: {
      requisition: {
        id: req.id,
        title: req.title,
        skills: req.skills,
        location: req.location,
        headcount: req.headcount,
        billMin: req.billMin,
        billMax: req.billMax,
        months: req.months,
        neededBy: req.neededBy?.toISOString() ?? null,
        description: req.description,
        justification: req.justification,
        status: req.status,
        approvalState: req.approvalState,
        raisedBy: req.raisedBy,
        owner: req.owner,
        clearedSupplierIds: req.clearedSupplierIds,
        interviewers: req.interviewers,
        orgUnit: req.orgUnit,
        costCenter: req.costCenter,
        createdAt: req.createdAt.toISOString(),
      },
      approvals: req.approvals.map(a => ({
        stage: a.stage,
        id: a.id,
        approver: a.approver,
        rank: a.rank,
        outcome: a.outcome,
        reason: a.reason,
        decidedAt: a.decidedAt?.toISOString() ?? null,
      })),
      invitations: req.invitations.map(i => ({
        id: i.id,
        vendor: i.toCompany,
        // The client's own numbers, shown back to the client that set them.
        band: { payMin: i.payMin, payMax: i.payMax },
        status: i.expiresAt < now && i.status === 'SENT' ? 'EXPIRED' : i.status,
        expiresAt: i.expiresAt.toISOString(),
        message: i.message,
        // How many this vendor actually put forward — the number that
        // separates a vendor working it from one that merely accepted.
        submittedCount: submissions.filter(s => s.fromCompanyId === i.toCompanyId).length,
      })),
      candidates: submissions.map(s => ({
        id: s.id,
        // Deterministic, instant, and honest about what it cannot judge —
        // the client is choosing between these people today, not deciding
        // whether to go looking (src/lib/candidate-fit.ts).
        fit: assessFit({
          required: {
            skills: req.skills,
            location: req.location,
            ceilingCents: req.billMax,
            neededBy: req.neededBy,
          },
          candidate: {
            skills: s.person.consultant?.skills ?? [],
            headline: s.person.consultant?.headline ?? null,
            location: s.person.consultant?.location ?? null,
            availableFrom: s.person.consultant?.availableFrom ?? null,
          },
          submittedRateCents: s.rate,
        }),
        person: {
          id: s.person.id,
          name: s.person.name,
          headline: s.person.consultant?.headline ?? null,
          skills: s.person.consultant?.skills ?? [],
        },
        vendor: s.fromCompany,
        rate: s.rate,
        kind: s.kind,
        status: s.status,
        submittedAt: s.submittedAt.toISOString(),
      })),
      summary: {
        invited: req.invitations.length,
        accepted: req.invitations.filter(i => i.status === 'ACCEPTED').length,
        declined: req.invitations.filter(i => i.status === 'DECLINED').length,
        // Asked, said nothing, deadline still running. The quiet ones are
        // the reason a requisition dies without anybody noticing.
        silent: req.invitations.filter(i => i.status === 'SENT' && i.expiresAt >= now).length,
        candidates: submissions.length,
        // Positions still to fill after anyone already placed.
        remaining: Math.max(0, req.headcount - submissions.filter(s => s.status === 'PLACED').length),
      },
    },
  })
}

/**
 * PATCH /api/requisitions/:id
 *
 * Edit a requisition, call it off, or put it away.
 *
 *   { title?, skills?, ... }        edit, while it is still yours to edit
 *   { action: 'cancel', reason }    the need went away
 *   { action: 'archive' }           settled; take it off the working list
 *   { action: 'unarchive' }         put it back
 *
 * ── Changing one that is already out ─────────────────────────────────
 *
 * This used to refuse anything that was not a draft or handed back:
 * "changing the rate underneath people already sourcing it is a
 * different requisition". Right instinct, wrong size — it forced a
 * cancel-and-re-raise to add a missing skill, which lost the thread and
 * every submission on it.
 *
 * The founder's rule, in src/lib/requisition-change.ts:
 *
 *   WORDS   title, description, skills, location, needed by,
 *           justification, the panel — saved, and every supplier who
 *           received it is told what changed
 *   MONEY   rate band, months, headcount, budget, hours a week — the
 *           checks run again on the same facts the raise route builds,
 *           the chain is replaced, and the suppliers are told to hold
 *
 * A published requisition whose money moved keeps its OPEN status and
 * waits on its approval state, so it stays where the suppliers can see
 * it and reads "Awaiting approval" rather than vanishing into drafts.
 * Nothing changes on one that is filled, cancelled or put away.
 *
 * ── Cancel is not archive ────────────────────────────────────────────
 *
 * Cancelling says the need went away: suppliers who sourced against it
 * are stood down, and it takes a reason, because a requisition withdrawn
 * silently costs every one of them real work they are never told about.
 * Archiving only takes a settled requisition off the working list and
 * changes nothing about what happened to it.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const action = typeof body?.action === 'string' ? body.action : 'edit'

  const requisition = await prisma.requirement.findUnique({
    where: { id },
    // Everything the change rule reads, and everything running the
    // checks again needs. One read: an edit that has to compare before
    // with after cannot do it from four columns.
    select: {
      id: true, companyId: true, title: true, status: true, approvalState: true,
      archivedAt: true, raisedById: true, ownerId: true,
      description: true, skills: true, location: true, neededBy: true,
      justification: true, interviewers: true,
      billMin: true, billMax: true, months: true, headcount: true,
      budgetCents: true, hoursPerWeek: true,
      costCenterId: true, orgUnitId: true,
    },
  })

  if (!requisition) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No requisition by that id.' } },
      { status: 404 }
    )
  }

  // The company that raised it. A 404 rather than a 403 — confirming
  // another client's requisition exists is itself a leak.
  if (caller.company?.id !== requisition.companyId) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No requisition by that id.' } },
      { status: 404 }
    )
  }

  // Editors: the manager it is for, whoever raised it, and the programme
  // office. Not the approvers — they ask for changes and the editor
  // changes it; otherwise somebody approves their own rewrite. And not
  // every hiring manager: another team's requirement is not yours to
  // change. Said as who, not as a permission.
  // The programme office is whoever writes the rules — not whoever may
  // release to suppliers, which Procurement also does and Procurement is
  // an approver here.
  const office = hasPermission(caller.permissions, 'governance.write')
  const editor =
    caller.person.id === requisition.ownerId || caller.person.id === requisition.raisedById || office
  if (!hasPermission(caller.permissions, 'requirements.write') || !editor) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message:
            `Only the manager this is for, whoever raised it, or the programme office at ${caller.company!.name} can change it. ` +
            'An approver asks for changes instead.',
        },
      },
      { status: 403 }
    )
  }

  // ── Put away, or take back out ──
  if (action === 'archive' || action === 'unarchive') {
    const archiving = action === 'archive'
    if (archiving && requisition.status === 'OPEN') {
      return NextResponse.json(
        {
          error: {
            code: 'STILL_OPEN',
            message:
              'This is still open to suppliers. Cancel it or let it fill before putting it away.',
          },
        },
        { status: 409 }
      )
    }
    const updated = await prisma.requirement.update({
      where: { id },
      data: { archivedAt: archiving ? new Date() : null },
      select: { id: true, archivedAt: true },
    })
    return NextResponse.json({
      data: {
        id: updated.id,
        archivedAt: updated.archivedAt?.toISOString() ?? null,
        message: archiving ? 'Put away' : 'Back on the list',
      },
    })
  }

  // ── Called off ──
  if (action === 'cancel') {
    const reason = String(body?.reason ?? '').trim()
    if (!reason) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION',
            message: 'Say why. Suppliers sourcing against this are owed a reason.',
            field: 'reason',
          },
        },
        { status: 422 }
      )
    }
    if (requisition.status === 'FILLED' || requisition.status === 'CANCELLED') {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_STATE',
            message: `This is ${requisition.status.toLowerCase()} — cancelling it now changes nothing.`,
          },
        },
        { status: 409 }
      )
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.requirement.update({
        where: { id },
        data: { status: 'CANCELLED', cancelReason: reason },
        select: { id: true, status: true, cancelReason: true },
      })
      // Suppliers stood down rather than left working it. Leaving an
      // invitation open costs them sourcing effort on a role that no
      // longer exists, and they remember.
      const stood = await tx.requirementInvitation.updateMany({
        where: { requirementId: id, status: { in: ['SENT', 'ACCEPTED'] } },
        data: { status: 'CLOSED' },
      })
      // Approvals still owed a decision are closed with it, so nobody is
      // asked to approve something that no longer exists.
      await tx.requirementApproval.updateMany({
        where: { requirementId: id, outcome: 'PENDING' },
        data: { outcome: 'REJECTED', reason: `Requisition cancelled: ${reason}`, decidedAt: new Date() },
      })
      return { updated, standDown: stood.count }
    })

    await prisma.automationLog.create({
      data: {
        companyId: requisition.companyId,
        action: 'REQUISITION_CANCELLED',
        summary: `${requisition.title} — cancelled by ${caller.person.name}`,
        reason,
        payload: { requirementId: id, suppliersStoodDown: result.standDown },
        // Raising it again is a new requisition, not an undo of this one.
        reversible: false,
      },
    })

    return NextResponse.json({
      data: {
        id,
        status: result.updated.status,
        reason: result.updated.cancelReason,
        suppliersStoodDown: result.standDown,
        message:
          result.standDown > 0
            ? `Cancelled. ${result.standDown} supplier(s) stood down.`
            : 'Cancelled.',
      },
    })
  }

  // ── Changing one that is already out ────────────────────────────────
  //
  // The rule is src/lib/requisition-change.ts, and it is pure: words
  // change freely and every supplier who received it is told what
  // changed; money goes back through the checks and the suppliers are
  // told to hold. Everything below is the writing down and the telling.

  const before = asItStands(requisition)
  const after = proposed(body)
  const changes = diff(before, after)

  // Whose need it is. Not one of the rule's fields, because a supplier
  // was never told the manager's name and a new one changes nothing they
  // are working on — but it is a change, and "nothing changed" is the
  // wrong answer to it.
  const askedOwner = typeof body.ownerId === 'string' && body.ownerId.trim() ? body.ownerId.trim() : null
  const ownerMoves = askedOwner !== null && askedOwner !== requisition.ownerId

  const verdict = mayChange(requisition, changes)
  const ownerOnly = changes.length === 0 && ownerMoves && mayEdit(requisition)

  if (!verdict.allowed && !ownerOnly) {
    return NextResponse.json(
      { error: { code: 'NOT_CHANGEABLE', message: verdict.reason } },
      { status: 409 }
    )
  }

  // Out to suppliers. Read from the stage rather than from the two
  // columns, so this page and the rule cannot come to disagree about
  // what "published" means.
  const out = stageOf(requisition) === 'OPEN'

  // The budget that pays for it decides who approves it, and moving it
  // under suppliers who are already sourcing is a different requisition.
  if (out && 'costCenterId' in body && (body.costCenterId || null) !== requisition.costCenterId) {
    return NextResponse.json(
      {
        error: {
          code: 'BUDGET_FIXED',
          message:
            'Which budget pays for this cannot move once suppliers have it. Cancel this one and raise it against the right budget.',
        },
      },
      { status: 409 }
    )
  }

  // Only the manager it is for, whoever raised it, or somebody who
  // releases roles may hand it to a new owner.
  let newOwner: { id: string; name: string } | null = null
  if (ownerMoves) {
    if (!mayReassignOwner(requisition, caller.person.id, office)) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_YOURS_TO_HAND_ON',
            message:
              'Only the manager it is for, whoever raised it, or somebody who releases roles can hand this to somebody else.',
          },
        },
        { status: 403 }
      )
    }
    newOwner = await prisma.person.findFirst({
      where: { id: askedOwner!, contexts: { some: { companyId: requisition.companyId, revokedAt: null } } },
      select: { id: true, name: true },
    })
    if (!newOwner) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_A_SEAT_HERE',
            message: 'That person does not hold a seat here, so the role cannot be theirs.',
          },
        },
        { status: 422 }
      )
    }
  }

  // What actually gets written. `neededBy` is compared as a day and
  // stored as a date; everything else is written as the rule read it.
  const data: Record<string, unknown> = { ...after }
  if ('neededBy' in data) data.neededBy = after.neededBy ? new Date(`${String(after.neededBy)}T00:00:00.000Z`) : null
  if (!out && 'costCenterId' in body) data.costCenterId = body.costCenterId || null
  if (ownerMoves) data.ownerId = newOwner!.id

  // ── The money moved, so the checks run again ───────────────────────
  //
  // On the same facts the raise route builds, because a decision made on
  // a different set of facts is a different decision. An APPROVED row
  // from before is not an approval of a different number, so the chain
  // is replaced rather than added to.
  const rechecked = verdict.reapprove
    ? await checksFor(requisition.companyId, {
        skills: (data.skills as string[]) ?? requisition.skills,
        headcount: (data.headcount as number) ?? requisition.headcount,
        billMax: (data.billMax as number | null) ?? requisition.billMax,
        months: (data.months as number | null) ?? requisition.months,
        budgetCents: (data.budgetCents as number | null) ?? requisition.budgetCents,
        hoursPerWeek: (data.hoursPerWeek as number | null) ?? requisition.hoursPerWeek,
        costCenterId: requisition.costCenterId,
        orgUnitId: requisition.orgUnitId,
        raisedById: requisition.raisedById,
        ownerId: (data.ownerId as string | null) ?? requisition.ownerId,
      })
    : null

  // Blocked is not a change that waits — it is a change that does not
  // happen, so nothing is written and the row stands as it was.
  if (rechecked && rechecked.decision.state === 'BLOCKED') {
    return NextResponse.json(
      {
        error: {
          code: 'BLOCKED',
          message: `That change cannot be made: ${rechecked.decision.summary}`,
          checks: rechecked.decision.checks,
        },
      },
      { status: 409 }
    )
  }

  const decision = rechecked?.decision ?? null
  // Suppliers hold while a desk has it, and only while a desk has it.
  const paused = decision ? pausedByChecks(decision.state) : false

  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.requirement.update({
      where: { id },
      data: {
        ...data,
        // The status is deliberately untouched. A published requisition
        // whose money moved stays where the suppliers can see it and
        // reads "Awaiting approval" off the approval state — sending it
        // back to DRAFT would make it vanish from under them.
        ...(decision ? { approvalState: decision.state } : {}),
      },
      select: { id: true, title: true, status: true, approvalState: true },
    })

    if (decision) {
      await tx.requirementApproval.deleteMany({ where: { requirementId: id } })
      const now = new Date()
      await tx.requirementApproval.createMany({
        data: decision.steps.map(st => ({
          requirementId: id,
          approverId: st.approverId,
          rank: st.rank,
          stage: st.stage,
          outcome: st.outcome,
          reason: st.reason,
          decidedAt: st.outcome === 'AUTO_CLEARED' ? now : null,
        })),
      })
    }

    await tx.automationLog.create({
      data: {
        companyId: requisition.companyId,
        action: 'REQUISITION_CHANGED',
        summary: changes.length > 0 ? said(changes) : `Changed who it is for — ${newOwner?.name ?? 'nobody'}`,
        reason: changes.length > 0 ? verdict.reason : 'Changed before it went out.',
        payload: {
          requirementId: id,
          changes: changes as any,
          ownerId: ownerMoves ? newOwner!.id : undefined,
          reapproved: Boolean(decision),
          // The figure the checks were re-run on, and whether it was
          // stated or estimated — a routing decision nobody can reproduce
          // is not a decision anybody can audit.
          annualValueCents: rechecked?.value.cents ?? null,
          valueBasis: rechecked?.value.basis ?? null,
          paused,
          toldSuppliers: verdict.tellSuppliers,
        },
        // Every one of these can be changed back the same way.
        reversible: true,
      },
    })

    return updated
  })

  // ── Telling the suppliers ──────────────────────────────────────────
  //
  // Everyone who received it, at the firms that received it. A change
  // nobody is told about is how a supplier submits against a rate that
  // moved a week ago.
  let told = 0
  if (verdict.tellSuppliers) {
    const invitations = await prisma.requirementInvitation.findMany({
      where: { requirementId: id },
      select: { toCompanyId: true },
    })
    const firms = [...new Set(invitations.map(i => i.toCompanyId))]
    if (firms.length > 0) {
      const seats = await prisma.context.findMany({
        where: { companyId: { in: firms }, revokedAt: null, type: { in: ['EMPLOYEE', 'PARTNER'] } },
        select: { personId: true, companyId: true },
      })
      const notice = noticeForSuppliers({
        who: caller.person.name,
        title: saved.title,
        changes,
        paused,
      })
      const seen = new Set<string>()
      const rows: NotifyParams[] = []
      for (const seat of seats) {
        const key = `${seat.personId}:${seat.companyId}`
        if (seen.has(key)) continue
        seen.add(key)
        rows.push({
          personId: seat.personId,
          companyId: seat.companyId ?? undefined,
          // In-app, and the bell files it where the whole sentence can be
          // read. Nothing here is a thread, so it is not a conversation.
          type: 'SYSTEM',
          title: notice.title,
          body: notice.body,
          entityId: id,
          data: { requirementId: id, paused, changes: changes as any },
        })
      }
      told = rows.length
      void notifyBulk(rows)
    }
  }

  // And the desks now holding it, the same way the raise route tells them.
  if (decision && decision.route.length > 0) {
    void notifyBulk(
      decision.route.map(r => ({
        personId: r.approverId,
        companyId: requisition.companyId,
        type: 'SYSTEM' as const,
        title: `Changed and back with you: ${saved.title}`,
        body: decision.summary,
        entityId: id,
        data: { requirementId: id, checks: decision.checks as any },
      }))
    )
  }

  const handedOn = ownerMoves ? ` Now ${newOwner!.name}'s to fill.` : ''

  return NextResponse.json({
    data: {
      id: saved.id,
      changed: changes.map(c => c.field),
      status: saved.status,
      approvalState: saved.approvalState,
      reapproved: Boolean(decision),
      paused,
      suppliersTold: told,
      checks: decision?.checks ?? null,
      // The sentence the rule wrote, which is what the form shows back.
      message: (changes.length > 0 ? verdict.reason : 'Changed who it is for.') + handedOn,
    },
  })
}

// ─────────────────────────────────────────────────────────────────────
// THE PURE PARTS OF AN EDIT
//
// No database and no clock, so
// __tests__/invariants/requisition-change-screens.test.ts can lift them
// out of this file and run them. A route may export nothing but its HTTP
// handlers, which is why they are read rather than imported.
// ─────────────────────────────────────────────────────────────────────

/** A string field, trimmed, where empty means "no answer" and not "". */
function words(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s.length > 0 ? s : null
}

/** A figure, where a missing one is null and never zero. */
function figure(v: unknown): number | null {
  return v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v)
}

/**
 * The requisition as it stands, in the shape the change rule compares.
 *
 * `neededBy` is a day, not an instant: a date read back from Postgres
 * and the same date typed into a form are the same answer, and comparing
 * them as timestamps would report a change nobody made.
 */
function asItStands(r: Record<string, any>): Record<string, unknown> {
  return {
    title: r.title ?? null,
    description: r.description ?? null,
    skills: r.skills ?? [],
    location: r.location ?? null,
    neededBy: r.neededBy ? new Date(r.neededBy).toISOString().slice(0, 10) : null,
    justification: r.justification ?? null,
    interviewers: r.interviewers ?? [],
    billMin: r.billMin ?? null,
    billMax: r.billMax ?? null,
    months: r.months ?? null,
    headcount: r.headcount ?? null,
    budgetCents: r.budgetCents ?? null,
    hoursPerWeek: r.hoursPerWeek ?? null,
  }
}

/**
 * What the caller is asking for, from what they actually sent.
 *
 * Only fields that are present are read, because a field left off a
 * PATCH is not a field set to null — and the rule only compares what it
 * is given. The panel is names, de-duplicated and in the order typed.
 */
function proposed(body: Record<string, any>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (typeof body.title === 'string' && body.title.trim().length >= 3) out.title = body.title.trim()
  if (Array.isArray(body.skills)) out.skills = body.skills.map((s: unknown) => String(s).trim()).filter(Boolean)
  if ('description' in body) out.description = words(body.description)
  if ('location' in body) out.location = words(body.location)
  if ('justification' in body) out.justification = words(body.justification)
  if ('neededBy' in body) out.neededBy = body.neededBy ? String(body.neededBy).slice(0, 10) : null
  if (Array.isArray(body.interviewers)) {
    out.interviewers = [
      ...new Set(body.interviewers.map((n: unknown) => String(n).trim()).filter(Boolean)),
    ]
  }
  if (Number.isInteger(body.headcount) && body.headcount > 0) out.headcount = body.headcount
  if ('billMin' in body) out.billMin = figure(body.billMin)
  if ('billMax' in body) out.billMax = figure(body.billMax)
  if ('months' in body) out.months = figure(body.months)
  if ('hoursPerWeek' in body) out.hoursPerWeek = figure(body.hoursPerWeek)
  // The raise form calls it budget and the column is budgetCents. Both
  // are accepted, and the column's own name wins where both are sent.
  if ('budget' in body) out.budgetCents = figure(body.budget)
  if ('budgetCents' in body) out.budgetCents = figure(body.budgetCents)
  return out
}

/**
 * Who may hand a requisition to a different manager.
 *
 * The manager it is for, whoever raised it, and whoever releases roles
 * for this client. Not anybody with requirements.write — that is most of
 * a programme office, and an owner is who signs the hours.
 */
function mayReassignOwner(
  r: { ownerId?: string | null; raisedById?: string | null },
  mePersonId: string,
  distributes: boolean
): boolean {
  return r.ownerId === mePersonId || r.raisedById === mePersonId || distributes
}

/** Whether a supplier should hold, after the checks ran again. */
function pausedByChecks(state: string): boolean {
  return state === 'PENDING_APPROVAL'
}

/**
 * The checks, run again on the numbers as they now are.
 *
 * The same facts the raise route builds — annual value, what the cost
 * centre already carries, the rules by ancestry with their kind and
 * specificity, the lead, the escalation, the owner and the raiser. It is
 * written twice rather than imported because a route file may export
 * nothing but its handlers, and lifting it into src/lib is a new file
 * and so the architect's call. The test compares the two fact objects
 * key for key, so the copy cannot quietly drift from the original.
 */
async function checksFor(
  companyId: string,
  r: {
    skills: string[]
    headcount: number
    billMax: number | null
    months: number | null
    budgetCents: number | null
    hoursPerWeek: number | null
    costCenterId: string | null
    orgUnitId: string | null
    raisedById: string | null
    ownerId: string | null
  }
) {
  const costCenter = r.costCenterId
    ? await prisma.costCenter.findFirst({
        where: { id: r.costCenterId, companyId },
        include: {
          headcountPlans: { orderBy: { period: 'desc' }, take: 1 },
          owner: { select: { id: true, name: true } },
          orgUnit: { select: { id: true, name: true } },
        },
      })
    : null

  let committedHeads = 0
  let committedSpendCents = 0
  if (costCenter) {
    const allocations = await prisma.contractCostAllocation.findMany({
      where: {
        costCenterId: costCenter.id,
        sellContract: { state: { in: ['IN_PROGRESS', 'VERIFIED', 'PENDING_VERIFICATION'] } },
      },
      select: { shareBps: true, sellContract: { select: { billRate: true } } },
    })
    committedHeads = allocations.length
    committedSpendCents = allocations.reduce(
      (sum, a) => sum + Math.round((a.sellContract.billRate * 160 * 12 * a.shareBps) / 10_000),
      0
    )
  }

  const skillMedianCents = await medianRateForSkills(companyId, r.skills)

  const value = annualValue({
    budgetCents: r.budgetCents,
    billMaxCents: r.billMax,
    headcount: r.headcount,
    months: r.months,
    hoursPerWeek: r.hoursPerWeek,
  })

  const facts: RequisitionFacts = {
    annualValueCents: value.cents,
    valueBasis: value.basis,
    valueSays: value.says,
    headcount: r.headcount,
    billMaxCents: r.billMax,
    skillMedianCents,
    months: r.months,
    costCenter: costCenter
      ? {
          id: costCenter.id,
          code: costCenter.code,
          approvedHeads: costCenter.headcountPlans[0]?.approvedHeads ?? null,
          committedHeads,
          annualBudgetCents: costCenter.headcountPlans[0]
            ? Math.round(Number(costCenter.headcountPlans[0].annualBudget) * 100)
            : null,
          committedSpendCents,
        }
      : null,
  }

  const team = r.orgUnitId ?? costCenter?.orgUnitId ?? null
  const orgUnits = await prisma.orgUnit.findMany({
    where: { companyId },
    select: { id: true, parentId: true, name: true },
  })
  const responsible = ancestry(orgUnits, team)

  const ruleRows = await prisma.approvalRule.findMany({
    where: {
      companyId,
      isActive: true,
      OR: [
        { orgUnitId: null },
        ...(responsible.length > 0 ? [{ orgUnitId: { in: responsible } }] : []),
      ],
    },
    include: { approver: { select: { id: true, name: true } } },
    orderBy: { rank: 'asc' },
  })

  const rules: ApprovalRuleFacts[] = ruleRows.map(rule => ({
    id: rule.id,
    name: rule.name,
    approverId: rule.approverId,
    approverName: rule.approver.name,
    thresholdCents: rule.thresholdAmount ? Math.round(Number(rule.thresholdAmount) * 100) : null,
    rank: rule.rank,
    kind: rule.kind as RuleKind,
    specificity: rule.orgUnitId ? responsible.length - responsible.indexOf(rule.orgUnitId) : 0,
  }))

  const raiser = r.raisedById ?? ''
  const owner = r.ownerId ?? raiser
  const lead: Seat | null = costCenter?.owner
    ? { personId: costCenter.owner.id, name: costCenter.owner.name }
    : null

  let escalation: Seat | null = null
  const above = responsible.slice(1)
  if (above.length > 0) {
    const owned = await prisma.costCenter.findMany({
      where: { companyId, orgUnitId: { in: above }, ownerId: { not: null }, isActive: true },
      select: { orgUnitId: true, owner: { select: { id: true, name: true } } },
    })
    for (const unitId of above) {
      const cc = owned.find(
        c => c.orgUnitId === unitId && c.owner && ![raiser, owner, lead?.personId].includes(c.owner.id)
      )
      if (cc?.owner) {
        escalation = { personId: cc.owner.id, name: cc.owner.name }
        break
      }
    }
  }

  facts.raisedById = raiser
  facts.ownerId = owner
  facts.lead = lead
  facts.escalation = escalation
  facts.unitName = orgUnits.find(u => u.id === team)?.name ?? costCenter?.orgUnit?.name ?? null

  return { decision: evaluateRequisition(facts, rules), value }
}

/**
 * The median hourly rate this client already pays for any of these
 * skills. The same figure the raise route compares against, for the same
 * reason: what they actually pay beats an abstract band.
 */
async function medianRateForSkills(clientId: string, skills: string[]): Promise<number | null> {
  if (skills.length === 0) return null

  const contracts = await prisma.sellContract.findMany({
    where: { ...endClientFilter(clientId), state: { in: ['IN_PROGRESS', 'VERIFIED'] } },
    select: { billRate: true, person: { select: { consultant: { select: { skills: true } } } } },
  })

  const wanted = new Set(skills.map(s => s.toLowerCase()))
  const rates = contracts
    .filter(c => (c.person.consultant?.skills ?? []).some(s => wanted.has(s.toLowerCase())))
    .map(c => c.billRate)
    .sort((a, b) => a - b)

  if (rates.length === 0) return null
  const mid = Math.floor(rates.length / 2)
  return rates.length % 2 === 0 ? Math.round((rates[mid - 1] + rates[mid]) / 2) : rates[mid]
}
