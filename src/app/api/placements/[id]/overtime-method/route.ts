import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { logAccess } from '@/lib/access-log'
import { askTheDesk, hasPermission } from '@/lib/permissions'
import {
  CHOOSES_OVERTIME_METHOD,
  METHOD_WORDS,
  checkOvertimeMethodChange,
  overtimeMethodRecord,
  overtimeMethodSays,
} from '@/lib/overtime-method-choice'

/**
 * PATCH /api/placements/:id/overtime-method   { method, reason? }
 *
 * The paying firm chooses which rate an overtime hour is "at" on this
 * placement's pay line, in a week paid at two rates. The founder,
 * 2026-09-29: follow US law as the recommendation, allow the firm to
 * choose otherwise, and record who chose it and why.
 *
 * ── Why it hangs off the placement ───────────────────────────────────
 *
 * The placement page is where a supplier reads its own pay line — the
 * buy leg under the sell line it funds — and where this choice is shown.
 * The id is the placement's (a `SellContract`), and the pay line is the
 * caller's own buy contract linked to it. A firm that pays nobody on
 * this placement has no line to change and is told so.
 *
 * ── What it refuses, in sentences ────────────────────────────────────
 *
 * A stranger to the placement: 404, as the placement itself answers, and
 * logged. A desk without `consultants.cost`: 403 — the method prices a
 * wage, and a desk that cannot read the wage does not decide it. A firm
 * that is a party but not the payer: 403. A method outside the three, or
 * anything but the law's default without a reason: 422.
 *
 * ── What it records ──────────────────────────────────────────────────
 *
 * The method, who, when and why on the line itself; an AccessLog row
 * about the worker, allowed or refused, because a worker's pay terms are
 * their data; and an AutomationLog row with the before and after, so the
 * history of choices survives the line holding only the latest one.
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
      logAccess({
        subjectId: placement.personId, actorPersonId: caller.person.id, actorCompanyId: mine,
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
        select: {
          id: true, overtimeMethod: true, overtimeMethodById: true,
          overtimeMethodAt: true, overtimeMethodReason: true,
        },
      },
    },
  })
  const line = link?.buyContract ?? null

  const body = await request.json().catch(() => ({}))
  const mayReadCost = hasPermission(caller.permissions, CHOOSES_OVERTIME_METHOD)
  const verdict = checkOvertimeMethodChange({
    method: body?.method,
    reason: body?.reason,
    mayReadCost,
    isPayer: line != null,
    personName: placement.person.name,
  })

  if (!verdict.ok) {
    logAccess({
      subjectId: placement.personId, actorPersonId: caller.person.id, actorCompanyId: mine,
      action: 'PAYROLL_VIEW', allowed: false,
      reason: `Overtime method change refused: ${verdict.code}`,
    })
    const message =
      verdict.code === 'FORBIDDEN'
        ? askTheDesk({
            doing: `Changing how ${placement.person.name}'s overtime is priced`,
            needs: CHOOSES_OVERTIME_METHOD,
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
      data: overtimeMethodRecord(verdict, caller.person.id, at),
      select: {
        overtimeMethod: true, overtimeMethodById: true, overtimeMethodAt: true, overtimeMethodReason: true,
        overtimeMethodBy: { select: { name: true } },
      },
    })

    logAccess({
      subjectId: placement.personId, actorPersonId: caller.person.id, actorCompanyId: mine,
      action: 'PAYROLL_VIEW', allowed: true,
      reason: `Changed the overtime method on ${placement.person.name}'s pay line`,
    })

    const shown = overtimeMethodSays(updated)
    await prisma.automationLog.create({
      data: {
        companyId: mine,
        action: 'OVERTIME_METHOD_CHOSEN',
        summary: `${caller.person.name} set overtime for ${placement.person.name} to be paid at ${METHOD_WORDS[verdict.method]}`,
        reason: verdict.reason ?? "The law's default, chosen with no reason needed.",
        payload: {
          sellContractId: id,
          buyContractId: line!.id,
          personId: placement.personId,
          from: line!.overtimeMethod,
          fromById: line!.overtimeMethodById,
          fromReason: line!.overtimeMethodReason,
          to: verdict.method,
          reason: verdict.reason,
        },
        // Choosing again puts it back. What was already paid under the
        // old method stays paid; the next run uses the new one.
        reversible: true,
      },
    })

    return NextResponse.json({ data: { buyContractId: line!.id, ...shown } })
  } catch (err) {
    reportError('Recording an overtime method failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'The overtime method could not be saved. Nothing was changed.' } },
      { status: 500 }
    )
  }
}
