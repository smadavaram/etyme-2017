import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import {
  oneSubject, mayAsk, raiseRequest, produceExport, completeErasure,
  reference, coolingEndsAtFor,
} from '@/lib/data-request'
import { logAccess } from '@/lib/access-log'

/**
 * The compliance desk's queue: requests that arrived by email, logged
 * against a person this company actually holds, and answered from here.
 *
 * ── Two gates, because reading a queue is not answering it ───────────
 *
 * Reading the queue asks for the governance read the compliance desk
 * already holds (`lib/company-defaults`), so the page opens for the desk
 * it is named for. CLAUDE.md: "Where a route's gate refuses the very
 * desk the page is named for… the gate is the bug, because hiding a desk
 * from itself is worse than a refusal."
 *
 * Acting asks for the privacy permission. Logging a request against
 * somebody else, producing their export and running their erasure are
 * acts on another person's record with a legal consequence, and for a
 * week they were gated on a read because no permission for them existed.
 * One does now, and the Compliance Officer role is granted it in
 * `lib/company-defaults`, which is the architect's file.
 *
 * A person's own request about their own data goes through
 * `/api/me/data` and asks for no permission at all, by design.
 */
const TO_READ = 'governance.read'
const TO_ACT = 'privacy.manage'

const readRefusal = () =>
  NextResponse.json(
    {
      error:
        'Reading the queue of data requests is the compliance desk’s job here, and this ' +
        'seat does not hold it. An owner or administrator can add it under Users and ' +
        'permissions.',
    },
    { status: 403 }
  )

const actRefusal = () =>
  NextResponse.json(
    {
      error:
        'Logging somebody else’s data request, or answering one, needs the privacy ' +
        'permission, and this seat does not hold it. The compliance officer at your ' +
        'company holds it, and an owner or administrator can add it to another seat ' +
        'under Users and permissions. Your own data is on your own page and needs ' +
        'nobody’s permission.',
    },
    { status: 403 }
  )

/** Does this company have any record of this person at all? */
async function holdsThePerson(companyId: string, personId: string): Promise<boolean> {
  const [contracts, buys, listings, submissions, seats] = await Promise.all([
    prisma.sellContract.count({ where: { personId, OR: [{ companyId }, { clientCompanyId: companyId }] } }),
    prisma.buyContractCandidate.count({ where: { personId, buyContract: { companyId } } }),
    prisma.benchListing.count({ where: { companyId, consultant: { personId } } }),
    prisma.submission.count({ where: { personId, OR: [{ fromCompanyId: companyId }, { toCompanyId: companyId }] } }),
    prisma.context.count({ where: { personId, companyId } }),
  ])
  return contracts + buys + listings + submissions + seats > 0
}

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json({ error: 'This page belongs to a company’s compliance desk.' }, { status: 403 })
  }
  if (!hasPermission(caller.permissions, TO_READ)) return readRefusal()

  const rows = await prisma.dataRequest.findMany({
    where: { requestedByCompanyId: caller.company.id },
    // Soonest due first: a queue ordered any other way is a queue that
    // misses the one that mattered.
    orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
    select: {
      id: true, kind: true, status: true, receivedAt: true, dueAt: true, dueBasis: true,
      keptBecause: true, refusedBecause: true, producedAt: true, completedAt: true, note: true,
      subjectPerson: { select: { id: true, name: true } },
      subjectCompany: { select: { id: true, name: true } },
    },
  })

  logAccess({
    subjectId: caller.person.id,
    actorPersonId: caller.person.id,
    actorCompanyId: caller.company.id,
    action: 'DATA_EXPORT',
    reason: `Read the compliance desk’s queue of ${rows.length} data requests.`,
  })

  return NextResponse.json({
    requests: rows.map((r) => ({
      id: r.id,
      reference: reference(r.id),
      kind: r.kind,
      status: r.status,
      subject: r.subjectPerson?.name ?? r.subjectCompany?.name ?? 'nobody named',
      subjectPersonId: r.subjectPerson?.id ?? null,
      receivedAt: r.receivedAt,
      dueAt: r.dueAt,
      dueBasis: r.dueBasis,
      runsOn: r.kind === 'ERASURE' ? coolingEndsAtFor(r.receivedAt) : null,
      keptBecause: r.keptBecause,
      refusedBecause: r.refusedBecause,
      completedAt: r.completedAt,
    })),
  })
}

/**
 * Log a request that arrived by email, or answer one already logged.
 *
 * `{ kind, subjectPersonId | subjectCompanyId, receivedAt }` logs one.
 * `{ answer: 'EXPORT' | 'ERASE' | 'REFUSE', requestId }` answers one.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json({ error: 'This page belongs to a company’s compliance desk.' }, { status: 403 })
  }
  if (!hasPermission(caller.permissions, TO_ACT)) return actRefusal()

  const body = await request.json().catch(() => ({}))
  const companyId = caller.company.id

  // ── Answering one ──────────────────────────────────────────────────

  if (body.answer) {
    const row = await prisma.dataRequest.findUnique({
      where: { id: String(body.requestId ?? '') },
      select: { id: true, requestedByCompanyId: true, kind: true, subjectPersonId: true },
    })
    if (!row || row.requestedByCompanyId !== companyId) {
      return NextResponse.json(
        { error: 'There is no request here with that reference. A request logged by another company is answered by that company.' },
        { status: 404 }
      )
    }

    if (body.answer === 'REFUSE') {
      const because = String(body.because ?? '').trim()
      if (because.length < 10) {
        return NextResponse.json(
          { error: 'Say why, in a sentence the person can act on — "we could not establish that you are who this record is about", never a code. A refusal is recorded as carefully as a grant.' },
          { status: 400 }
        )
      }
      await prisma.dataRequest.update({
        where: { id: row.id },
        data: { status: 'REFUSED', refusedBecause: because, completedAt: new Date() },
      })
      await prisma.automationLog.create({
        data: {
          companyId,
          action: 'DATA_REQUEST_REFUSED',
          summary: `A data request was refused: ${because}`,
          reason: 'Somebody asked for a person’s data or for them to be forgotten and was refused.',
          payload: { requestId: row.id },
          reversible: true,
        },
      })
      return NextResponse.json({ ok: true, says: 'Refused, with the reason on the record and shown to the person.' })
    }

    const outcome = body.answer === 'ERASE'
      ? await completeErasure(row.id)
      : await produceExport(row.id)

    const ok = 'ran' in outcome ? outcome.ran : outcome.ok
    if (ok) {
      await prisma.automationLog.create({
        data: {
          companyId,
          action: 'DATA_REQUEST_ANSWERED',
          summary: outcome.says,
          reason: 'Somebody answered a request for a person’s data, and the row says what was kept and why.',
          payload: { requestId: row.id, answer: body.answer },
          reversible: false,
        },
      })
    }
    return NextResponse.json({ ok, says: outcome.says }, { status: ok ? 200 : 409 })
  }

  // ── Logging one ────────────────────────────────────────────────────

  const kind = body.kind === 'ERASURE' ? 'ERASURE' : body.kind === 'EXPORT' ? 'EXPORT' : null
  if (!kind) {
    return NextResponse.json(
      { error: 'Say which arrived: a request for a copy of everything held, or a request to be forgotten.' },
      { status: 400 }
    )
  }

  const subject = oneSubject({ personId: body.subjectPersonId, companyId: body.subjectCompanyId })
  if (!subject.ok) return NextResponse.json({ error: subject.says }, { status: 400 })

  const subjectPersonId: string | null = body.subjectPersonId ?? null
  const subjectCompanyId: string | null = body.subjectCompanyId ?? null

  const holds = subjectPersonId
    ? await holdsThePerson(companyId, subjectPersonId)
    : subjectCompanyId === companyId ||
      (await prisma.masterAgreement.count({
        where: { OR: [{ vendorId: companyId, clientId: subjectCompanyId! }, { vendorId: subjectCompanyId!, clientId: companyId }] },
      })) > 0

  const may = mayAsk({
    callerPersonId: caller.person.id,
    subjectPersonId,
    subjectCompanyId,
    callerCompanyId: companyId,
    holdsTheSubject: holds,
  })
  if (!may.ok) {
    if (subjectPersonId) {
      logAccess({
        subjectId: subjectPersonId, actorPersonId: caller.person.id, actorCompanyId: companyId,
        action: 'DATA_EXPORT', allowed: false, reason: may.says,
      })
    }
    await prisma.automationLog.create({
      data: {
        companyId,
        action: 'DATA_REQUEST_REFUSED',
        summary: may.says,
        reason: 'A company tried to log a data request about somebody it holds no record of.',
        payload: { subjectPersonId, subjectCompanyId },
        reversible: true,
      },
    })
    return NextResponse.json({ error: may.says }, { status: 403 })
  }

  const receivedAt = body.receivedAt ? new Date(body.receivedAt) : new Date()
  if (Number.isNaN(receivedAt.getTime())) {
    return NextResponse.json({ error: 'That is not a date we can read. The clock counts from the day it arrived.' }, { status: 400 })
  }

  const raised = await raiseRequest({
    kind,
    subjectPersonId,
    subjectCompanyId,
    requestedById: caller.person.id,
    requestedByCompanyId: companyId,
    receivedAt,
    regime: body.regime === 'GDPR' || body.regime === 'CCPA' ? body.regime : 'UNKNOWN',
    note: body.note ?? null,
  })

  return NextResponse.json({
    ok: true,
    id: raised.id,
    reference: reference(raised.id),
    dueAt: raised.dueAt,
    dueBasis: raised.dueBasis,
    runsOn: raised.runsOn,
    keptBecause: raised.keptBecause,
  })
}
