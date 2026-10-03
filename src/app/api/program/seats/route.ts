import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { liveSeatWhere, mayGrantSeat, seatIsLive, noSeatYet } from '@/lib/program-seat'

/**
 * The desks a client has granted to firms that are not the client.
 *
 * ── Why this screen exists at all ────────────────────────────────────
 *
 * A program office that is not the client — an MSP, or Etyme's own,
 * since the strategy of 2026-09-20 — places nobody, so nothing ties it
 * to a client the way a placement ties a supplier. The client says so
 * instead, here, and the grant is the entitlement every other screen
 * then reads (`lib/program-seat`, `lib/resolve-client-company`).
 *
 * Two readers, one route, because it is one fact seen from two ends:
 * the client reads the firms it has seated, and a program office reads
 * the programs it has been seated in. Neither sees the other's other
 * counterparties.
 *
 * ── Who may grant ────────────────────────────────────────────────────
 *
 * An owner or the program manager, which is `governance.write` at a
 * CLIENT and nobody else — the reasoning is in `mayGrantSeat`, which
 * holds every refusal as a sentence and is tested without a database.
 */

/**
 * Reading the seats is governance: it is the register of who has been
 * let into the program. Every client desk that holds the governance
 * read — the program manager, the approvers, HR, procurement,
 * compliance — can see who is sitting in their program, because a
 * standing grant that only the person who made it can see is not a
 * control.
 */
const TO_READ = 'governance.read'

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'The program office')
  if (notStaff) return notStaff
  if (!hasPermission(caller.permissions, TO_READ)) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message:
            'Who has been given a desk in this program is governance. Whoever owns the rules here can show you.',
        },
      },
      { status: 403 }
    )
  }

  const company = caller.company!
  const mine = company.kind === 'CLIENT'

  const rows = await prisma.programSeat.findMany({
    where: mine ? { clientCompanyId: company.id } : { officeCompanyId: company.id },
    select: {
      id: true,
      grantedAt: true,
      reason: true,
      validFrom: true,
      validTo: true,
      revokedAt: true,
      revokeReason: true,
      clientCompany: { select: { id: true, name: true, slug: true } },
      officeCompany: { select: { id: true, name: true, kind: true } },
      role: { select: { id: true, name: true } },
      orgUnit: { select: { id: true, name: true } },
      grantedBy: { select: { id: true, name: true } },
      revokedBy: { select: { id: true, name: true } },
    },
    orderBy: [{ revokedAt: 'asc' }, { grantedAt: 'desc' }],
  })

  const now = new Date()
  const seats = rows.map((r) => ({
    id: r.id,
    live: seatIsLive(r, now),
    client: r.clientCompany,
    office: r.officeCompany,
    role: r.role,
    unit: r.orgUnit,
    grantedBy: r.grantedBy,
    grantedAt: r.grantedAt,
    reason: r.reason,
    validFrom: r.validFrom,
    validTo: r.validTo,
    revokedAt: r.revokedAt,
    revokedBy: r.revokedBy,
    revokeReason: r.revokeReason,
    // The row says what it means rather than leaving a reader to work it
    // out from four dates. A revoked seat still shows, because taking a
    // desk away is a fact somebody may have to account for later.
    says: seatIsLive(r, now)
      ? `${r.officeCompany.name} sits at ${r.clientCompany.name}'s ${r.role.name} desk` +
        `${r.orgUnit ? `, in ${r.orgUnit.name}` : ''}.`
      : r.revokedAt
        ? `Revoked${r.revokedBy ? ` by ${r.revokedBy.name}` : ''}${r.revokeReason ? `: ${r.revokeReason}` : '.'}`
        : r.validFrom > now
          ? `Starts ${r.validFrom.toISOString().slice(0, 10)}.`
          : `Ran out ${r.validTo ? r.validTo.toISOString().slice(0, 10) : ''}.`,
  }))

  // A program office with no seat is told what is missing rather than
  // shown an empty table, which reads as "nobody has granted anything
  // yet" and is the same wrong answer the old refusal gave.
  const nothingYet =
    !mine && seats.filter((s) => s.live).length === 0 ? noSeatYet(company.name) : null

  return NextResponse.json({
    data: {
      side: mine ? 'CLIENT' : 'OFFICE',
      seats,
      says: nothingYet,
    },
  })
}

/**
 * POST /api/program/seats
 *   { officeCompanyId, roleId, reason, orgUnitId?, validTo? }
 *
 * The client grants a firm a desk in its own program office.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'The program office')
  if (notStaff) return notStaff

  const company = caller.company!
  const body = await request.json().catch(() => ({}))
  const officeCompanyId = typeof body.officeCompanyId === 'string' ? body.officeCompanyId : ''
  const roleId = typeof body.roleId === 'string' ? body.roleId : ''
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
  const orgUnitId = typeof body.orgUnitId === 'string' && body.orgUnitId ? body.orgUnitId : null
  const validTo = typeof body.validTo === 'string' && body.validTo ? new Date(body.validTo) : null

  const office = officeCompanyId
    ? await prisma.company.findUnique({
        where: { id: officeCompanyId },
        select: { id: true, kind: true, name: true },
      })
    : null
  const role = roleId
    ? await prisma.role.findUnique({
        where: { id: roleId },
        select: { id: true, companyId: true, name: true },
      })
    : null

  const alreadyHas = office
    ? (await prisma.programSeat.count({
        where: {
          clientCompanyId: company.id,
          officeCompanyId: office.id,
          ...liveSeatWhere(),
        },
      })) > 0
    : false

  const verdict = mayGrantSeat({
    grantorCompany: { id: company.id, kind: company.kind, name: company.name },
    grantorPermissions: caller.permissions,
    officeCompany: office,
    role,
    reason,
    alreadyHas,
  })

  if (!verdict.ok) {
    // 422 where the ask is malformed, 403 where the caller is not the
    // one to make it. A reader that cannot tell the two apart retries
    // the wrong one.
    const status = ['NOT_A_CLIENT', 'NOT_YOURS_TO_GRANT', 'SELF_GRANT'].includes(verdict.code)
      ? 403
      : 422
    return NextResponse.json({ error: { code: verdict.code, message: verdict.says } }, { status })
  }

  if (orgUnitId) {
    const unit = await prisma.orgUnit.findFirst({
      where: { id: orgUnitId, companyId: company.id },
      select: { id: true },
    })
    if (!unit) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: 'That unit is not one of yours, so a seat cannot be scoped to it.',
          },
        },
        { status: 404 }
      )
    }
  }

  const seat = await prisma.programSeat.create({
    data: {
      clientCompanyId: company.id,
      officeCompanyId: office!.id,
      roleId: role!.id,
      orgUnitId,
      grantedById: caller.person.id,
      reason,
      validTo,
    },
    select: { id: true },
  })

  return NextResponse.json(
    {
      data: {
        id: seat.id,
        says:
          `${office!.name} now sits at ${company.name}'s ${role!.name} desk. They act under your rules, ` +
          `not their own, and every read they make here is on the record.`,
      },
    },
    { status: 201 }
  )
}
