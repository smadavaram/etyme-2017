import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { logAccess, recordRefusal } from '@/lib/access-log'
import { askTheDesk, hasPermission } from '@/lib/permissions'
import {
  CHOOSES_CUT_OVERTIME,
  CUT_OVERTIME_LABEL,
  checkCutOvertimeChange,
  cutOvertimeRecord,
  cutOvertimeSays,
} from '@/lib/cut-overtime-choice'

/**
 * PATCH /api/placements/:id/cut-overtime   { rule, reason? }
 *
 * The paying firm chooses how overtime is paid on this placement's pay
 * line when the employer accepts fewer hours than were worked. The
 * founder, 2026-09-30: overtime only on the accepted hours over the line
 * by default, and the firm may keep the week's overtime instead, recorded
 * with who chose it and why.
 *
 * The twin of ./overtime-method, and it hangs off the placement for the
 * same reason: the id is the placement's (a `SellContract`), the pay line
 * is the caller's own buy contract linked to it, and a firm that pays
 * nobody on this placement has no line to change and is told so.
 *
 * ── What it refuses, in sentences ────────────────────────────────────
 *
 * A stranger to the placement: 404, and logged. A desk without
 * `consultants.cost`: 403. A party that is not the payer: 403. A rule
 * outside the two, or KEEP_WEEK_OVERTIME without a reason: 422.
 *
 * ── What it records ──────────────────────────────────────────────────
 *
 * The rule, who, when and why on the line; an AccessLog row about the
 * worker, allowed or refused; and an AutomationLog row with the before
 * and after, so the history survives the line holding only the latest.
 *
 * It changes no pay figure by itself: the next payroll run, the payroll
 * file, back pay and the worker's page read the line through
 * `cutOvertimeFor` (lib/cut-overtime-choice), and a week already paid
 * stays paid.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const mine = caller.company?.id
  if (!mine) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'You need to belong to a company to change a pay line.' } },
      { status: 403 }
    )
  }

  const { id } = await params
  const placement = await prisma.sellContract.findUnique({
    where: { id },
    select: {
      id: true, personId: true, companyId: true, clientCompanyId: true, endClientCompanyId: true,
      person: { select: { name: true } },
    },
  })
  const isParty =
    placement != null &&
    (placement.companyId === mine || placement.clientCompanyId === mine || placement.endClientCompanyId === mine)

  if (!placement || !isParty) {
    if (placement) {
      await recordRefusal([placement.personId], {
        actorPersonId: caller.person.id, actorCompanyId: mine,
        action: 'PAYROLL_VIEW', allowed: false, reason: 'Not a party to this placement',
      })
    }
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No placement by that id.' } },
      { status: 404 }
    )
  }

  // Our own pay line under this placement, if we pay anybody on it.
  const link = await prisma.contractLink.findFirst({
    where: { sellContractId: id, buyContract: { companyId: mine } },
    orderBy: { effectiveFrom: 'desc' },
    select: {
      buyContract: {
        select: { id: true, cutOvertime: true, cutOvertimeById: true, cutOvertimeReason: true },
      },
    },
  })
  const line = link?.buyContract ?? null

  const body = await request.json().catch(() => ({}))
  const verdict = checkCutOvertimeChange({
    rule: body?.rule,
    reason: body?.reason,
    mayReadCost: hasPermission(caller.permissions, CHOOSES_CUT_OVERTIME),
    isPayer: line != null,
    personName: placement.person.name,
  })

  if (!verdict.ok) {
    await recordRefusal([placement.personId], {
      actorPersonId: caller.person.id, actorCompanyId: mine,
      action: 'PAYROLL_VIEW', allowed: false,
      reason: `Cut-week overtime change refused: ${verdict.code}`,
    })
    const message =
      verdict.code === 'FORBIDDEN'
        ? askTheDesk({
            doing: `Changing how ${placement.person.name}'s overtime is paid when fewer hours are accepted`,
            needs: CHOOSES_CUT_OVERTIME,
            kind: caller.company?.kind,
            companyName: caller.company?.name,
          })
        : verdict.says
    return NextResponse.json(
      { error: { code: verdict.code, message, ...(verdict.field ? { field: verdict.field } : {}) } },
      { status: verdict.status }
    )
  }

  const at = new Date()
  try {
    const updated = await prisma.buyContract.update({
      where: { id: line!.id },
      data: cutOvertimeRecord(verdict, caller.person.id, at),
      select: {
        cutOvertime: true, cutOvertimeById: true, cutOvertimeAt: true, cutOvertimeReason: true,
        cutOvertimeBy: { select: { name: true } },
      },
    })

    logAccess({
      subjectId: placement.personId, actorPersonId: caller.person.id, actorCompanyId: mine,
      action: 'PAYROLL_VIEW', allowed: true,
      reason: `Changed how overtime is paid on a cut week on ${placement.person.name}'s pay line`,
    })

    await prisma.automationLog.create({
      data: {
        companyId: mine,
        action: 'CUT_OVERTIME_CHOSEN',
        summary:
          `${caller.person.name} set ${placement.person.name}'s pay line to: ` +
          `${CUT_OVERTIME_LABEL[verdict.rule]}`,
        reason: verdict.reason ?? "The default, what the law requires, chosen with no reason needed.",
        payload: {
          sellContractId: id,
          buyContractId: line!.id,
          personId: placement.personId,
          from: line!.cutOvertime,
          fromById: line!.cutOvertimeById,
          fromReason: line!.cutOvertimeReason,
          to: verdict.rule,
          reason: verdict.reason,
        },
        // Choosing again puts it back. A week already paid stays paid.
        reversible: true,
      },
    })

    return NextResponse.json({ data: { buyContractId: line!.id, ...cutOvertimeSays(updated) } })
  } catch (err) {
    reportError('Recording the cut-week overtime rule failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'The choice could not be saved. Nothing was changed.' } },
      { status: 500 }
    )
  }
}
