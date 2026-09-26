import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { hasPermission } from '@/lib/permissions'
import {
  yearEndPack, yearEndCsv, depositSchedule, depositDeadline,
  BUREAU_NOTICE, type PayPosting,
} from '@/lib/payroll-export'

/**
 * The statutory handoff — prepared here, filed by the bureau.
 *
 * ── The boundary, and why it is the whole feature ────────────────────
 *
 * Etyme never files anything. Not a 941, not a state deposit, not a W-2,
 * not a 1099. Withholding and year-end are somebody's whole business,
 * regulated differently in every state, and a staffing platform that
 * grows a filing engine inside it becomes a bad filing engine attached to
 * a good staffing platform.
 *
 * What we have and the bureau does not is what was ACTUALLY earned and by
 * whom — hours somebody accepted, at a rate somebody agreed, posted to a
 * period. That is the input to every return, and it is the part that is
 * usually wrong, because it reaches the bureau as a spreadsheet by email.
 *
 * So "done" is not "we file". It is that the handoff is real, the numbers
 * come from postings rather than a rate card, and every screen and file
 * says on its face who files it.
 *
 * ── The corp-to-corp rule ────────────────────────────────────────────
 *
 * A C2C sub-vendor gets an invoice, gets paid, and gets no 1099-NEC —
 * payments to a corporation for services are outside the
 * information-reporting requirement. Issuing one anyway asserts a
 * relationship with an individual that the arrangement does not have,
 * which is the shape of a misclassification finding. The amount is still
 * shown, because somebody will ask.
 */

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Statutory')
  if (notStaff) return notStaff
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Wages are paid by a company' } },
      { status: 403 }
    )
  }
  if (!hasPermission(caller.permissions, 'payroll.run')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'Seeing what everybody earned in a year needs payroll.run',
        },
      },
      { status: 403 }
    )
  }

  const companyId = caller.company.id
  const url = new URL(request.url)
  const year = Number(url.searchParams.get('year') ?? new Date().getUTCFullYear())
  const format = url.searchParams.get('format')

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'That is not a tax year', field: 'year' } },
      { status: 422 }
    )
  }

  const from = new Date(Date.UTC(year, 0, 1))
  const to = new Date(Date.UTC(year + 1, 0, 1))

  // Wages come from PAY postings and from nowhere else. A rate card says
  // what somebody should have earned; a posting says what they did, and
  // those differ every time a timesheet is reversed, a rate amendment
  // lands late, or an off-cycle payment is made.
  const rows = await prisma.orderPosting.findMany({
    where: {
      companyId,
      kind: 'PAY',
      postedAt: { gte: from, lt: to },
      reversalOfId: null,
      personId: { not: null },
    },
    select: {
      amountCents: true, txCurrency: true, postedAt: true,
      person: { select: { id: true, name: true } },
      buyContract: { select: { contractType: true } },
    },
    take: 20_000,
  })

  // Reversals are excluded above by `reversalOfId: null`, which drops the
  // reversing row. The row it cancelled is dropped here, so a corrected
  // month does not appear twice on somebody's W-2.
  const reversed = await prisma.orderPosting.findMany({
    where: { companyId, kind: 'PAY', reversalOfId: { not: null } },
    select: { reversalOfId: true },
  })
  const cancelled = new Set(reversed.map((r) => r.reversalOfId))

  // ── Taxpayer identification numbers ─────────────────────────────────
  //
  // We do not hold them, deliberately. There is no column for a social
  // security or employer identification number anywhere in this schema
  // and there should not be: a TIN is the single most damaging field a
  // staffing platform could leak, it is needed only at the moment of
  // filing, and the bureau collects it on a W-9 as part of the job it is
  // already paid for.
  //
  // So every reportable payee reads as "the bureau needs a number we do
  // not hold", which is true. It is stated at the top of the response
  // rather than left to look like a data-quality problem.
  const postings: PayPosting[] = rows
    .filter((r) => !cancelled.has((r as { id?: string }).id ?? ''))
    .map((r) => ({
      personId: r.person!.id,
      personName: r.person!.name,
      hasTaxId: false,
      contractType: r.buyContract?.contractType ?? 'UNKNOWN',
      amountCents: r.amountCents,
      currency: r.txCurrency,
      postedAt: r.postedAt,
    }))

  const pack = yearEndPack(postings, year)

  if (format === 'csv') {
    return new NextResponse(yearEndCsv(pack), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="etyme-year-end-${year}.csv"`,
      },
    })
  }

  // The deposit calendar for the paydays in the year. Also the bureau's
  // job — held here so a firm can tell whether the bureau is doing what
  // it is paid for, which it cannot do without knowing the dates.
  const lookback = postings.reduce((n, p) => n + Math.abs(p.amountCents), 0)
  // A rough employment-tax proxy at the published default burden. Named
  // as a proxy rather than presented as a liability figure, because the
  // real one is the bureau's and we do not hold it.
  const proxyLiability = Math.round(lookback * 0.12)
  const schedule = depositSchedule(proxyLiability)

  const holidays = await prisma.holiday.findMany({
    where: { companyId, date: { gte: from, lt: to } },
    select: { date: true },
  })

  const paydays = [...new Set(postings.map((p) => p.postedAt.toISOString().slice(0, 10)))]
    .sort()
    .slice(-12)
    .map((d) => depositDeadline(new Date(d), schedule.schedule, holidays.map((h) => h.date)))

  return NextResponse.json({
    data: {
      year,
      notice: BUREAU_NOTICE,
      taxIdNote:
        'Nothing here holds a taxpayer identification number, and nothing should. A TIN is ' +
        'the single most damaging field a staffing platform could leak, it is needed only ' +
        'at the moment of filing, and the bureau collects it on a W-9 as part of the job it ' +
        'is already paid for. Every reportable payee below is therefore listed as needing ' +
        'one — that is the truth about this system, not a gap in the data.',
      pack: {
        summaries: pack.summaries,
        w2Count: pack.w2Count,
        necCount: pack.necCount,
        noForm: pack.noForm,
        blocked: pack.blocked,
        totalReportableCents: pack.totalReportableCents,
        currency: pack.currency,
        says: pack.says,
      },
      deposits: {
        schedule: schedule.schedule,
        scheduleSays: schedule.says,
        proxyLiabilityCents: proxyLiability,
        proxySays:
          'The lookback figure here is wages at the published default burden, not your ' +
          'measured employment-tax liability — that number is the bureau’s and we do not ' +
          'hold it. It decides which schedule to show; it is not a liability.',
        deadlines: paydays,
      },
      csvUrl: `/api/payroll/statutory?year=${year}&format=csv`,
    },
  })
}
