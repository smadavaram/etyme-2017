import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { assessFit } from '@/lib/candidate-fit'
import { hasPermission } from '@/lib/permissions'

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
 * ── Why editing has a window ─────────────────────────────────────────
 *
 * A requisition that has cleared approval and gone to suppliers is a
 * promise other firms are spending money against. Changing the rate or
 * the headcount underneath them is not an edit, it is a different
 * requisition — so editing is allowed while it is a draft or has been
 * sent back for changes, and refused once it is open.
 *
 * Editing re-runs the approval decision, because the numbers that routed
 * it are the numbers being changed. A raiser who trims a rate to stay
 * inside their own authority should see it clear.
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
    select: {
      id: true, companyId: true, title: true, status: true, approvalState: true,
      archivedAt: true, raisedById: true,
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

  if (!hasPermission(caller.permissions, 'requirements.write')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Changing a requisition needs requirements.write' } },
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

  // ── Edit, while it is still yours to edit ──
  const editable =
    requisition.approvalState === 'CHANGES_REQUESTED' ||
    requisition.status === 'DRAFT'

  if (!editable) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_EDITABLE',
          message:
            requisition.status === 'OPEN'
              ? 'This is open to suppliers. Changing the rate or the headcount underneath them is a different requisition — cancel this one and raise it again.'
              : `This is ${requisition.status.toLowerCase()} and cannot be edited.`,
        },
      },
      { status: 409 }
    )
  }

  const fields: Record<string, unknown> = {}
  if (typeof body.title === 'string' && body.title.trim().length >= 3) fields.title = body.title.trim()
  if (Array.isArray(body.skills)) fields.skills = body.skills
  if ('description' in body) {
    const d = typeof body.description === 'string' ? body.description.trim() : ''
    fields.description = d.length > 0 ? d : null
  }
  if ('location' in body) fields.location = body.location ?? null
  if (Number.isInteger(body.headcount) && body.headcount > 0) fields.headcount = body.headcount
  if ('billMin' in body) fields.billMin = body.billMin ?? null
  if ('billMax' in body) fields.billMax = body.billMax ?? null
  if ('budget' in body) fields.budgetCents = Number.isFinite(body.budget) ? Number(body.budget) : null
  if ('hoursPerWeek' in body) fields.hoursPerWeek = Number.isFinite(body.hoursPerWeek) ? Number(body.hoursPerWeek) : null
  if ('months' in body) fields.months = body.months ?? null
  if ('neededBy' in body) fields.neededBy = body.neededBy ? new Date(body.neededBy) : null
  if ('justification' in body) fields.justification = body.justification ?? null
  if ('costCenterId' in body) fields.costCenterId = body.costCenterId || null

  if (Object.keys(fields).length === 0) {
    return NextResponse.json(
      { error: { code: 'NOTHING_TO_DO', message: 'No fields to change.' } },
      { status: 422 }
    )
  }

  const updated = await prisma.requirement.update({
    where: { id },
    data: fields,
    select: { id: true, title: true, status: true, approvalState: true },
  })

  await prisma.automationLog.create({
    data: {
      companyId: requisition.companyId,
      action: 'REQUISITION_EDITED',
      summary: `${updated.title} — edited by ${caller.person.name}`,
      reason: `Changed: ${Object.keys(fields).join(', ')}`,
      payload: { requirementId: id, changed: Object.keys(fields) },
      reversible: true,
    },
  })

  return NextResponse.json({
    data: {
      id: updated.id,
      changed: Object.keys(fields),
      // Said out loud: the numbers that routed it are the numbers that
      // just changed, so the decision is re-made when it is resubmitted.
      message:
        requisition.approvalState === 'CHANGES_REQUESTED'
          ? 'Saved. Send it back and it returns to whoever asked for the change.'
          : 'Saved.',
    },
  })
}
