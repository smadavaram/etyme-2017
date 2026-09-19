import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { mayHold, mayLift, toldTheSubject, overdueForReview, type Hold } from '@/lib/legal-hold'
import { logAccess } from '@/lib/access-log'

/**
 * A company saying a subject's records may not be deleted yet.
 *
 * ── Two gates ────────────────────────────────────────────────────────
 *
 * Reading the holds this company placed asks for the governance read the
 * compliance desk already holds, so the page opens for the desk it is
 * named for. Placing one and lifting one ask for the privacy permission:
 * a hold suspends somebody's erasure everywhere, which is an act on a
 * person's record rather than a reading of one, and a read was standing
 * in for it only because no permission for it existed. The Compliance
 * Officer role is granted it in `lib/company-defaults`.
 *
 * ── What a hold costs somebody else ──────────────────────────────────
 *
 * It suspends the erasure of that subject everywhere, not only in this
 * company's records. So a company may only hold a subject it has
 * actually traded with, and the refusal says so in words.
 */
const TO_READ = 'governance.read'
const TO_ACT = 'privacy.manage'

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json({ error: 'A legal hold belongs to a company, and this seat has none.' }, { status: 403 })
  }
  if (!hasPermission(caller.permissions, TO_READ)) {
    return NextResponse.json(
      {
        error:
          'Reading the legal holds this company placed is the compliance desk’s job here, ' +
          'and this seat does not hold it. An owner or administrator can add it under ' +
          'Users and permissions.',
      },
      { status: 403 }
    )
  }

  const rows = await prisma.legalHold.findMany({
    where: { placedByCompanyId: caller.company.id },
    orderBy: [{ liftedAt: 'asc' }, { placedAt: 'desc' }],
    select: {
      id: true, reason: true, matter: true, placedAt: true, reviewBy: true,
      liftedAt: true, liftedReason: true,
      placedByCompanyId: true, placedByCompany: { select: { name: true } },
      subjectPerson: { select: { id: true, name: true } },
      subjectCompany: { select: { id: true, name: true } },
      placedBy: { select: { name: true } },
    },
  })

  const holds: Hold[] = rows.map((r) => ({
    id: r.id,
    placedByCompanyId: r.placedByCompanyId,
    placedByCompanyName: r.placedByCompany.name,
    subjectPersonId: r.subjectPerson?.id ?? null,
    subjectCompanyId: r.subjectCompany?.id ?? null,
    reason: r.reason, matter: r.matter, placedAt: r.placedAt,
    reviewBy: r.reviewBy, liftedAt: r.liftedAt,
  }))

  return NextResponse.json({
    holds: rows.map((r) => ({
      id: r.id,
      subject: r.subjectPerson?.name ?? r.subjectCompany?.name ?? 'nobody named',
      subjectPersonId: r.subjectPerson?.id ?? null,
      reason: r.reason,
      matter: r.matter,
      placedAt: r.placedAt,
      placedBy: r.placedBy?.name ?? 'somebody who no longer has a seat here',
      reviewBy: r.reviewBy,
      liftedAt: r.liftedAt,
      liftedReason: r.liftedReason,
    })),
    overdueForReview: overdueForReview(holds, new Date()).map((h) => h.id),
  })
}

/**
 * Place one, or lift one.
 *
 * `{ subjectPersonId | subjectCompanyId, reason, matter?, reviewBy? }`
 * places. `{ lift: <id>, because }` lifts.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json({ error: 'A legal hold belongs to a company, and this seat has none.' }, { status: 403 })
  }
  if (!hasPermission(caller.permissions, TO_ACT)) {
    return NextResponse.json(
      {
        error:
          'Placing and lifting legal holds needs the privacy permission, and this seat ' +
          'does not hold it. A hold stops somebody’s erasure everywhere, not only here. ' +
          'The compliance officer at your company holds the permission, and an owner or ' +
          'administrator can add it to another seat under Users and permissions.',
      },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const companyId = caller.company.id

  if (body.lift) {
    const row = await prisma.legalHold.findUnique({
      where: { id: String(body.lift) },
      select: {
        id: true, placedByCompanyId: true, liftedAt: true, reason: true, matter: true,
        placedAt: true, reviewBy: true, subjectPersonId: true, subjectCompanyId: true,
        placedByCompany: { select: { name: true } },
      },
    })
    if (!row) return NextResponse.json({ error: 'There is no hold with that reference.' }, { status: 404 })

    const verdict = mayLift(
      {
        id: row.id, placedByCompanyId: row.placedByCompanyId,
        placedByCompanyName: row.placedByCompany.name,
        subjectPersonId: row.subjectPersonId, subjectCompanyId: row.subjectCompanyId,
        reason: row.reason, matter: row.matter, placedAt: row.placedAt,
        reviewBy: row.reviewBy, liftedAt: row.liftedAt,
      },
      companyId
    )
    if (!verdict.ok) return NextResponse.json({ error: verdict.says }, { status: 403 })

    const because = String(body.because ?? '').trim()
    if (because.length < 5) {
      return NextResponse.json(
        { error: 'Say why it is being lifted. A hold lifted with no reason is a hold nobody can explain afterwards.' },
        { status: 400 }
      )
    }

    await prisma.legalHold.update({
      where: { id: row.id },
      data: { liftedAt: new Date(), liftedById: caller.person.id, liftedReason: because },
    })
    await prisma.automationLog.create({
      data: {
        companyId,
        action: 'LEGAL_HOLD_LIFTED',
        summary: `A legal hold was lifted: ${because}`,
        reason: 'Anything another company still holds stays held, and the lifted row stays on the record.',
        payload: { holdId: row.id },
        reversible: false,
      },
    })
    return NextResponse.json({
      ok: true,
      says:
        'Lifted. Anything another company still holds stays held, and this row stays on the ' +
        'record as the answer to why something was still here.',
    })
  }

  const subjectPersonId: string | null = body.subjectPersonId ?? null
  const subjectCompanyId: string | null = body.subjectCompanyId ?? null
  if (!!subjectPersonId === !!subjectCompanyId) {
    return NextResponse.json(
      { error: 'A hold is on one person or one company, never both and never neither.' },
      { status: 400 }
    )
  }

  const reason = String(body.reason ?? '').trim()
  if (reason.length < 10) {
    return NextResponse.json(
      {
        error:
          'Say why, in words that can be shown to the person whose erasure this suspends. ' +
          'A hold nobody can explain is a hold nobody will dare lift. The case number goes ' +
          'in the matter field and never leaves this company.',
      },
      { status: 400 }
    )
  }

  const rel = subjectPersonId
    ? {
        contract:
          (await prisma.sellContract.count({ where: { personId: subjectPersonId, OR: [{ companyId }, { clientCompanyId: companyId }] } })) > 0 ||
          (await prisma.buyContractCandidate.count({ where: { personId: subjectPersonId, buyContract: { companyId } } })) > 0,
        listing: (await prisma.benchListing.count({ where: { companyId, consultant: { personId: subjectPersonId } } })) > 0,
        seat: (await prisma.context.count({ where: { personId: subjectPersonId, companyId } })) > 0,
        submission: (await prisma.submission.count({ where: { personId: subjectPersonId, OR: [{ fromCompanyId: companyId }, { toCompanyId: companyId }] } })) > 0,
      }
    : {
        itself: subjectCompanyId === companyId,
        agreement:
          (await prisma.masterAgreement.count({
            where: { OR: [{ vendorId: companyId, clientId: subjectCompanyId! }, { vendorId: subjectCompanyId!, clientId: companyId }] },
          })) > 0,
      }

  const verdict = mayHold(rel, !!subjectCompanyId)
  if (!verdict.ok) {
    if (subjectPersonId) {
      logAccess({
        subjectId: subjectPersonId, actorPersonId: caller.person.id, actorCompanyId: companyId,
        action: 'ERASURE', allowed: false, reason: verdict.says,
      })
    }
    return NextResponse.json({ error: verdict.says }, { status: 403 })
  }

  const reviewBy = body.reviewBy ? new Date(body.reviewBy) : null
  if (reviewBy && Number.isNaN(reviewBy.getTime())) {
    return NextResponse.json({ error: 'That is not a date we can read.' }, { status: 400 })
  }

  const created = await prisma.legalHold.create({
    data: {
      placedByCompanyId: companyId,
      subjectPersonId, subjectCompanyId,
      reason,
      matter: body.matter ? String(body.matter) : null,
      placedById: caller.person.id,
      reviewBy,
    },
    select: { id: true },
  })

  await prisma.automationLog.create({
    data: {
      companyId,
      action: 'LEGAL_HOLD_PLACED',
      summary: `A legal hold was placed: ${reason}`,
      reason:
        'It suspends every scheduled deletion of that subject, including ones this company ' +
        'would never see.',
      payload: { holdId: created.id, subjectPersonId, subjectCompanyId },
      reversible: true,
    },
  })

  if (subjectPersonId) {
    logAccess({
      subjectId: subjectPersonId, actorPersonId: caller.person.id, actorCompanyId: companyId,
      action: 'ERASURE',
      reason: 'A legal hold was placed on this person’s records.',
    })
  }

  const told = toldTheSubject(
    [{
      id: created.id, placedByCompanyId: companyId, placedByCompanyName: caller.company.name,
      subjectPersonId, subjectCompanyId, reason, matter: null,
      placedAt: new Date(), reviewBy, liftedAt: null,
    }],
    { personId: subjectPersonId, companyId: subjectCompanyId }
  )

  return NextResponse.json({
    ok: true,
    id: created.id,
    says:
      'Placed. It suspends the erasure of this subject everywhere, not only here, until ' +
      'somebody at this company lifts it.',
    subjectWouldRead: told.says,
    reviewBy: reviewBy
      ? null
      : 'No review date. A hold with none is a retention schedule set by forgetting — set one when you can.',
  })
}
