import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { emit } from '@/lib/events'
import { assessRule, assessDeletion } from '@/lib/governance-authorship'

/**
 * GET    /api/settings/approval-rules      — the chain, and how it got here
 * POST   /api/settings/approval-rules      — add a rule
 * PATCH  /api/settings/approval-rules      — change one
 * DELETE /api/settings/approval-rules?id=  — switch one off
 *
 * Who has to say yes, and above what value. Before this existed the rules
 * could only be created by seeding the database, and nobody owned them —
 * anybody who could edit the company could rewrite the approval chain.
 *
 * Reading needs governance.read; writing needs governance.write. Held
 * apart from settings.manage because editing the approval chain is not the
 * same job as changing the company address, and apart from rates.write
 * because writing the rule is not approving the spend.
 */

async function guard(request: NextRequest, write: boolean) {
  const { caller, error } = await getCallerContext(request)
  if (error) return { caller: null, error }
  if (!caller.company) {
    return {
      caller: null,
      error: NextResponse.json(
        { error: { code: 'NO_COMPANY', message: 'Approval rules belong to a company' } },
        { status: 403 }
      ),
    }
  }
  const needed = write ? 'governance.write' : 'governance.read'
  if (!hasPermission(caller.permissions, needed)) {
    return {
      caller: null,
      error: NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: write
              ? 'Changing the approval chain needs governance.write. It decides what everybody else needs permission for, so it is held by fewer people than settings.'
              : 'Reading the approval chain needs governance.read',
          },
        },
        { status: 403 }
      ),
    }
  }
  return { caller, error: null }
}

export async function GET(request: NextRequest) {
  const { caller, error } = await guard(request, false)
  if (error) return error
  const companyId = caller!.company!.id

  const rules = await prisma.approvalRule.findMany({
    where: { companyId },
    orderBy: [{ isActive: 'desc' }, { rank: 'asc' }, { thresholdAmount: 'asc' }],
    select: {
      id: true, name: true, thresholdAmount: true, rank: true, isActive: true, createdAt: true,
      approver: { select: { id: true, name: true, primaryEmail: true } },
      authoredBy: { select: { id: true, name: true } },
      orgUnit: { select: { id: true, name: true } },
      versions: {
        orderBy: { changedAt: 'desc' },
        take: 10,
        select: {
          id: true, action: true, name: true, thresholdAmount: true,
          reason: true, notes: true, changedAt: true,
          changedBy: { select: { name: true } },
        },
      },
    },
  })

  const active = rules.filter((r) => r.isActive)

  return NextResponse.json({
    data: {
      rules: rules.map((r) => ({
        id: r.id,
        name: r.name,
        // Dollars out, cents in the database. Every screen that has got
        // this wrong got it wrong by guessing which side it was on.
        thresholdDollars: r.thresholdAmount === null ? null : Number(r.thresholdAmount),
        rank: r.rank,
        isActive: r.isActive,
        approver: r.approver,
        authoredBy: r.authoredBy,
        orgUnit: r.orgUnit,
        history: r.versions.map((v) => ({
          id: v.id,
          action: v.action,
          name: v.name,
          thresholdDollars: v.thresholdAmount === null ? null : Number(v.thresholdAmount),
          reason: v.reason,
          notes: v.notes,
          changedBy: v.changedBy.name,
          changedAt: v.changedAt.toISOString(),
        })),
      })),
      canEdit: hasPermission(caller!.permissions, 'governance.write'),
      // The number that matters for a programme: with no rules, everything
      // clears without a human, which is a choice and not a failure.
      summary:
        active.length === 0
          ? 'No approval rules. Every requisition clears without anybody approving it.'
          : `${active.length} rule(s). A requisition waits for a person when it matches one.`,
    },
  })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await guard(request, true)
  if (error) return error
  const companyId = caller!.company!.id

  const body = await request.json().catch(() => ({}))
  const name = String(body.name ?? '').trim()
  const approverIds: string[] = Array.isArray(body.approverIds)
    ? body.approverIds.map(String)
    : body.approverId
      ? [String(body.approverId)]
      : []
  const thresholdDollars =
    body.thresholdDollars === null || body.thresholdDollars === undefined
      ? null
      : Number(body.thresholdDollars)

  if (!name) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'A rule needs a name people would recognise, like "Departmental — above $25k"', field: 'name' } },
      { status: 422 }
    )
  }
  if (thresholdDollars !== null && !Number.isFinite(thresholdDollars)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'A threshold is a number of dollars, or leave it out to apply always', field: 'thresholdDollars' } },
      { status: 422 }
    )
  }

  // Every approver must be somebody here. A rule pointing at a person who
  // left routes requisitions into silence.
  const approvers = await prisma.context.findMany({
    where: { companyId, revokedAt: null, personId: { in: approverIds } },
    select: { personId: true, person: { select: { name: true } } },
  })
  const foundIds = new Set(approvers.map((a) => a.personId))
  const missing = approverIds.filter((id) => !foundIds.has(id))
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_HERE',
          message: 'One of the approvers is not at this company, so requisitions would route into silence.',
          field: 'approverIds',
        },
      },
      { status: 422 }
    )
  }

  const otherActive = await prisma.approvalRule.count({ where: { companyId, isActive: true } })

  const decision = assessRule(
    {
      authorPersonId: caller!.person.id,
      approverPersonIds: approverIds,
      thresholdCents: thresholdDollars === null ? null : Math.round(thresholdDollars * 100),
      name,
    },
    { otherRuleApproverIds: [], otherActiveRules: otherActive }
  )

  if (!decision.allowed) {
    return NextResponse.json(
      {
        error: {
          code: 'RULE_REFUSED',
          message: decision.summary,
          checks: decision.checks.filter((c) => c.outcome === 'BLOCK'),
        },
      },
      { status: 422 }
    )
  }

  const notes = decision.checks.filter((c) => c.outcome === 'WARN').map((c) => c.reason)

  // One rule row per approver, ranked. The chain is the ordered set of
  // rows sharing a name — rank 1 decides before rank 2.
  const created = await prisma.$transaction(
    approverIds.map((approverId, i) =>
      prisma.approvalRule.create({
        data: {
          companyId,
          name,
          approverId,
          rank: i + 1,
          thresholdAmount: thresholdDollars,
          orgUnitId: body.orgUnitId ? String(body.orgUnitId) : null,
          authoredById: caller!.person.id,
          isActive: true,
        },
        select: { id: true, name: true, rank: true },
      })
    )
  )

  // The first version of each. A control whose history starts on its
  // second edit cannot answer what it said when it was written.
  await prisma.approvalRuleVersion.createMany({
    data: created.map((r, i) => ({
      ruleId: r.id,
      name,
      thresholdAmount: thresholdDollars,
      approverIds: [approverIds[i]],
      orgUnitId: body.orgUnitId ? String(body.orgUnitId) : null,
      isActive: true,
      action: 'CREATED',
      changedById: caller!.person.id,
      reason: body.reason ? String(body.reason).trim() : null,
      notes,
    })),
  })

  await prisma.automationLog.create({
    data: {
      companyId,
      action: 'APPROVAL_RULE_CREATED',
      summary: `${caller!.person.name} added "${name}" — ${approverIds.length} approver(s)${thresholdDollars !== null ? ` above $${thresholdDollars.toLocaleString()}` : ', always'}`,
      reason: decision.summary,
      payload: { ruleIds: created.map((r) => r.id), approverIds, thresholdDollars, notes },
      reversible: true,
    },
  })

  void emit({
    type: 'governance.rule_created',
    companyId,
    subjectType: 'ApprovalRule',
    subjectId: created[0].id,
    actorPersonId: caller!.person.id,
    payload: { name, approverIds, thresholdDollars, notes },
  })

  return NextResponse.json(
    {
      data: {
        rules: created,
        notes,
        message: `"${name}" is live.${notes.length ? ' ' + notes.join(' ') : ''}`,
      },
    },
    { status: 201 }
  )
}

export async function PATCH(request: NextRequest) {
  const { caller, error } = await guard(request, true)
  if (error) return error
  const companyId = caller!.company!.id

  const body = await request.json().catch(() => ({}))
  const id = String(body.id ?? '')
  const existing = await prisma.approvalRule.findFirst({
    where: { id, companyId },
    select: {
      id: true, name: true, thresholdAmount: true, approverId: true,
      orgUnitId: true, isActive: true, authoredById: true, rank: true,
    },
  })
  if (!existing) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such rule here' } },
      { status: 404 }
    )
  }

  const approverId = body.approverId ? String(body.approverId) : existing.approverId
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : existing.name
  const thresholdDollars =
    'thresholdDollars' in body
      ? body.thresholdDollars === null
        ? null
        : Number(body.thresholdDollars)
      : existing.thresholdAmount === null
        ? null
        : Number(existing.thresholdAmount)

  const otherActive = await prisma.approvalRule.count({
    where: { companyId, isActive: true, id: { not: id } },
  })

  // Assessed against whoever is saving now, not whoever wrote it
  // originally. Editing a rule to make yourself its only approver is the
  // same act as writing one that way.
  const decision = assessRule(
    {
      authorPersonId: caller!.person.id,
      approverPersonIds: [approverId],
      thresholdCents: thresholdDollars === null ? null : Math.round(thresholdDollars * 100),
      name,
    },
    { otherRuleApproverIds: [], otherActiveRules: otherActive }
  )

  // A single-row edit where the caller names themselves is only a problem
  // when no other rule would catch the same spend.
  const selfOnly = approverId === caller!.person.id && otherActive === 0
  if (!decision.allowed && selfOnly) {
    return NextResponse.json(
      {
        error: {
          code: 'RULE_REFUSED',
          message:
            'That would leave you as the only approver in the whole chain, on a rule you are editing. Add somebody else first.',
          checks: decision.checks.filter((c) => c.outcome === 'BLOCK'),
        },
      },
      { status: 422 }
    )
  }

  const updated = await prisma.approvalRule.update({
    where: { id },
    data: {
      name,
      approverId,
      thresholdAmount: thresholdDollars,
      ...('isActive' in body ? { isActive: Boolean(body.isActive) } : {}),
    },
    select: { id: true, name: true, thresholdAmount: true, isActive: true, approverId: true, orgUnitId: true },
  })

  await prisma.approvalRuleVersion.create({
    data: {
      ruleId: id,
      name: updated.name,
      thresholdAmount: updated.thresholdAmount,
      approverIds: [updated.approverId],
      orgUnitId: updated.orgUnitId,
      isActive: updated.isActive,
      action: 'CHANGED',
      changedById: caller!.person.id,
      reason: body.reason ? String(body.reason).trim() : null,
      notes: decision.checks.filter((c) => c.outcome === 'WARN').map((c) => c.reason),
    },
  })

  void emit({
    type: 'governance.rule_changed',
    companyId,
    subjectType: 'ApprovalRule',
    subjectId: id,
    actorPersonId: caller!.person.id,
    payload: {
      name: updated.name,
      approverId: updated.approverId,
      thresholdDollars,
      wasThresholdDollars: existing.thresholdAmount === null ? null : Number(existing.thresholdAmount),
      wasApproverId: existing.approverId,
    },
  })

  return NextResponse.json({
    data: {
      rule: {
        ...updated,
        thresholdDollars: updated.thresholdAmount === null ? null : Number(updated.thresholdAmount),
      },
      message: 'Saved. The change is recorded with your name against it.',
    },
  })
}

/**
 * Switch off, not delete.
 *
 * A rule that requisitions were routed through last quarter is part of how
 * those approvals are explained. Deleting the row leaves the approvals
 * pointing at nothing.
 */
export async function DELETE(request: NextRequest) {
  const { caller, error } = await guard(request, true)
  if (error) return error
  const companyId = caller!.company!.id

  const id = request.nextUrl.searchParams.get('id') ?? ''
  const reason = request.nextUrl.searchParams.get('reason') ?? ''

  const existing = await prisma.approvalRule.findFirst({
    where: { id, companyId },
    select: { id: true, name: true, isActive: true, approverId: true, thresholdAmount: true, orgUnitId: true },
  })
  if (!existing) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such rule here' } },
      { status: 404 }
    )
  }

  const otherActive = await prisma.approvalRule.count({
    where: { companyId, isActive: true, id: { not: id } },
  })
  const check = assessDeletion({ otherActiveRules: otherActive })

  // Warn and capture a reason, never silently permit. Turning off the last
  // control a company has should cost one sentence.
  if (check.outcome === 'WARN' && !reason.trim()) {
    return NextResponse.json(
      {
        error: {
          code: 'REASON_REQUIRED',
          message: check.reason,
          field: 'reason',
        },
      },
      { status: 422 }
    )
  }

  await prisma.approvalRule.update({ where: { id }, data: { isActive: false } })

  await prisma.approvalRuleVersion.create({
    data: {
      ruleId: id,
      name: existing.name,
      thresholdAmount: existing.thresholdAmount,
      approverIds: [existing.approverId],
      orgUnitId: existing.orgUnitId,
      isActive: false,
      action: 'DEACTIVATED',
      changedById: caller!.person.id,
      reason: reason.trim() || null,
      notes: check.outcome === 'WARN' ? [check.reason] : [],
    },
  })

  await prisma.automationLog.create({
    data: {
      companyId,
      action: 'APPROVAL_RULE_DEACTIVATED',
      summary: `${caller!.person.name} switched off "${existing.name}"`,
      reason: reason.trim() || check.reason,
      payload: { ruleId: id, rulesRemaining: otherActive },
      reversible: true,
    },
  })

  void emit({
    type: 'governance.rule_deactivated',
    companyId,
    subjectType: 'ApprovalRule',
    subjectId: id,
    actorPersonId: caller!.person.id,
    payload: { name: existing.name, reason: reason.trim() || null, rulesRemaining: otherActive },
  })

  return NextResponse.json({
    data: {
      id,
      rulesRemaining: otherActive,
      message:
        otherActive === 0
          ? `"${existing.name}" is off. Every requisition now clears without approval.`
          : `"${existing.name}" is off. ${otherActive} rule(s) still apply.`,
    },
  })
}
