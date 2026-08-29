import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { hasPermission } from '@/lib/permissions'
import { decimalsFor } from '@/lib/money'

/**
 * Credit limits — what a customer is allowed to owe us.
 *
 * ── A limit is four things, not one ──────────────────────────────────
 *
 * A number, a currency, the reasoning behind it, and a date it should be
 * looked at again. All four are on the record and none of them is
 * decoration.
 *
 * **The currency**, because exposure is computed one book at a time and
 * a limit inherits that. A dollar limit tested against a rupee exposure
 * is a comparison of two unrelated numbers that happens to type-check.
 *
 * **The reasoning**, because a limit with none is one nobody will defend
 * when it is breached at three o'clock on a Friday. "Two years of clean
 * filings and a payment record averaging 34 days" is a number somebody
 * can argue with. A bare 250,000 is a number people route around.
 *
 * **The review date**, because limits go stale. `assess` still applies
 * an expired one — dropping to "no limit set" on the day a review lapses
 * would quietly turn every breach into a pass, which is the worst
 * possible direction for that failure — but it says the number is about
 * that client as they were rather than as they are.
 *
 * ── And a limit never blocks anything ────────────────────────────────
 *
 * Addendum E: BLOCK where legally grounded, WARN and capture a reason
 * everywhere else, never silently permit. A tenure limit blocks because
 * the law says so. Nobody is breaking the law by placing a fifth
 * contractor at a client who is over their limit — they are taking a
 * commercial risk that somebody senior should be the one to take. A hard
 * stop here is routed around within a week: the placement happens on
 * email and the ledger never sees it, which is strictly worse.
 */

/** POST /api/ar/credit-limit — set or change what a customer may owe. */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Credit limits')
  if (notStaff) return notStaff

  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'A credit limit belongs to the company carrying the risk' } },
      { status: 403 }
    )
  }

  // Setting what a client may owe is a controller's decision, not a
  // recruiter's. Same gate as seeing the margin behind it.
  if (!hasPermission(caller.permissions, 'pnl.read')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message:
            'Setting a credit limit needs pnl.read. It is a decision about how much of this ' +
            'client the firm is willing to carry.',
        },
      },
      { status: 403 }
    )
  }

  const companyId = caller.company.id
  const body = await request.json().catch(() => ({}))

  const clientCompanyId = String(body.clientCompanyId ?? '')
  const currency = String(body.currency ?? 'USD').toUpperCase()
  const basis = body.basis != null ? String(body.basis).trim() : ''
  const reviewBy = body.reviewBy ? new Date(String(body.reviewBy)) : null

  if (!clientCompanyId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'A limit is set against a named client', field: 'clientCompanyId' } },
      { status: 422 }
    )
  }

  // Accepted in whole currency, the way a person says it — "two hundred
  // and fifty thousand" — and stored in minor units like everything else.
  // The exponent comes from the currency, because yen has no minor unit
  // and the Kuwaiti dinar has three.
  const limitValue = Number(body.limit)
  if (!Number.isFinite(limitValue) || limitValue <= 0) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message:
            'A credit limit is a positive amount. A limit of nothing is not a limit of ' +
            'nothing — it reads as nobody having set one, which is a different state.',
          field: 'limit',
        },
      },
      { status: 422 }
    )
  }
  const limitCents = Math.round(limitValue * 10 ** decimalsFor(currency))

  if (basis.length < 10) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message:
            'Say why this number, in a sentence somebody can read in six months. A limit ' +
            'with no reasoning behind it is one nobody will defend when it is breached at ' +
            'three o’clock on a Friday.',
          field: 'basis',
        },
      },
      { status: 422 }
    )
  }

  if (reviewBy && Number.isNaN(reviewBy.getTime())) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'That review date could not be read', field: 'reviewBy' } },
      { status: 422 }
    )
  }

  const client = await prisma.company.findUnique({
    where: { id: clientCompanyId },
    select: { id: true, name: true },
  })
  if (!client) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such client' } },
      { status: 404 }
    )
  }

  const prior = await prisma.customerCreditLimit.findUnique({
    where: { companyId_clientCompanyId: { companyId, clientCompanyId } },
    select: { limitCents: true, currency: true },
  })

  const row = await prisma.customerCreditLimit.upsert({
    where: { companyId_clientCompanyId: { companyId, clientCompanyId } },
    create: {
      companyId,
      clientCompanyId,
      limitCents,
      currency,
      basis,
      reviewBy,
      setById: realPersonId(caller),
    },
    update: {
      limitCents,
      currency,
      basis,
      reviewBy,
      setById: realPersonId(caller),
      setAt: new Date(),
    },
    select: { id: true, limitCents: true, currency: true, basis: true, reviewBy: true, setAt: true },
  })

  await prisma.automationLog.create({
    data: {
      companyId,
      action: prior ? 'CREDIT_LIMIT_CHANGED' : 'CREDIT_LIMIT_SET',
      summary: prior
        ? `${caller.person.name} changed the credit limit on ${client.name} from ` +
          `${prior.limitCents / 10 ** decimalsFor(prior.currency)} ${prior.currency} to ` +
          `${limitValue} ${currency}.`
        : `${caller.person.name} set a credit limit of ${limitValue} ${currency} on ${client.name}.`,
      reason: basis,
      payload: {
        clientCompanyId,
        limitCents,
        currency,
        reviewBy: reviewBy?.toISOString() ?? null,
        previousLimitCents: prior?.limitCents ?? null,
        previousCurrency: prior?.currency ?? null,
      },
      reversible: true,
    },
  })

  return NextResponse.json({
    data: {
      limit: {
        id: row.id,
        clientCompanyId,
        customerName: client.name,
        limitCents: row.limitCents,
        currency: row.currency,
        basis: row.basis,
        reviewBy: row.reviewBy?.toISOString() ?? null,
        setAt: row.setAt.toISOString(),
      },
      note:
        reviewBy == null
          ? 'No review date was set. A limit with none goes quietly out of date while ' +
            'continuing to look like a control.'
          : 'Breaching this warns, names an approver and asks for a reason. It never blocks — ' +
            'a hard stop on a commercial judgement is worked around within a week.',
    },
  })
}

/** GET /api/ar/credit-limit — every limit this company holds. */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Credit limits')
  if (notStaff) return notStaff

  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Credit limits belong to a company' } },
      { status: 403 }
    )
  }

  if (
    !hasPermission(caller.permissions, 'margin.read') &&
    !hasPermission(caller.permissions, 'pnl.read')
  ) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'What a client may owe is the same class of fact as what a placement earns.' } },
      { status: 403 }
    )
  }

  const now = new Date()
  const rows = await prisma.customerCreditLimit.findMany({
    where: { companyId: caller.company.id },
    select: {
      id: true, clientCompanyId: true, limitCents: true, currency: true,
      basis: true, reviewBy: true, setAt: true,
      clientCompany: { select: { name: true } },
      setBy: { select: { name: true } },
    },
    orderBy: { limitCents: 'desc' },
  })

  return NextResponse.json({
    data: {
      limits: rows.map((r) => ({
        id: r.id,
        clientCompanyId: r.clientCompanyId,
        customerName: r.clientCompany.name,
        limitCents: r.limitCents,
        currency: r.currency,
        basis: r.basis,
        reviewBy: r.reviewBy?.toISOString() ?? null,
        /** True where the review date has passed. The limit still applies. */
        stale: r.reviewBy != null && r.reviewBy < now,
        setAt: r.setAt.toISOString(),
        setBy: r.setBy?.name ?? null,
      })),
      note:
        'A limit past its review date is still applied. Dropping it on the day a review ' +
        'lapses would turn every breach into a pass, which is the worst direction for ' +
        'that failure to go.',
    },
  })
}
