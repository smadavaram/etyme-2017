import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { buildExport, toCsv, missingIds, type Provider } from '@/lib/payroll-export'

/**
 * GET /api/payroll/export?provider=ADP&from=&to=
 *
 * What is owed, in a shape ADP or Paychex will take.
 *
 * Etyme does not run payroll and should not — withholding, filings and
 * year-end are somebody else's whole business and are regulated
 * differently in every state. What it knows is the part the provider
 * cannot work out: the hours, whose signature stands behind them, at
 * what rate, against which order.
 *
 * Add `?format=csv` for the file itself. Without it, the JSON — so a
 * screen can show what is about to go and who is being left out before
 * anybody downloads anything.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Payroll export')
  if (notStaff) return notStaff

  const companyId = caller.company!.id
  const url = new URL(request.url)

  const provider = (['ADP', 'PAYCHEX', 'GENERIC'].includes(url.searchParams.get('provider') ?? '')
    ? url.searchParams.get('provider')
    : 'GENERIC') as Provider

  const from = url.searchParams.get('from')
    ? new Date(url.searchParams.get('from')!)
    : new Date(Date.now() - 30 * 86_400_000)
  const to = url.searchParams.get('to') ? new Date(url.searchParams.get('to')!) : new Date()

  // Sheets on contracts this company sells. A prime exporting payroll
  // exports its own employees, never its sub-vendor's — the sub pays
  // those, and reading them here would be reading another company's
  // wage bill.
  const sheets = await prisma.timesheet.findMany({
    where: {
      sellContract: { companyId },
      periodEnd: { gte: from, lte: to },
    },
    select: {
      periodStart: true, periodEnd: true, totalHours: true,
      acceptedHours: true, employerAcceptedAt: true,
      person: { select: { name: true } },
      sellContract: {
        select: {
          billRate: true, billCurrency: true,
          costCenter: { select: { code: true } },
          internalOrder: { select: { code: true } },
          salesOrder: { select: { number: true } },
        },
      },
    },
    orderBy: { periodEnd: 'asc' },
    take: 5000,
  })

  const built = buildExport(
    provider,
    sheets.map((s) => ({
      personName: s.person.name,
      // No payroll id model yet — reported as missing rather than
      // guessed, because ADP matches on their file number and a row
      // without one is a row their import drops silently.
      payrollId: null,
      contractType: 'W2',
      periodStart: s.periodStart,
      periodEnd: s.periodEnd,
      submittedHours: Number(s.totalHours),
      acceptedHours: s.acceptedHours ? Number(s.acceptedHours) : null,
      employerAcceptedAt: s.employerAcceptedAt,
      rateCents: s.sellContract.billRate,
      currency: s.sellContract.billCurrency,
      // Either cost object. A project pot and a standing department are
      // both real and the client's ledger cares which.
      costCode:
        s.sellContract.internalOrder?.code ?? s.sellContract.costCenter?.code ?? null,
      orderNumber: s.sellContract.salesOrder?.number ?? null,
    }))
  )

  if (url.searchParams.get('format') === 'csv') {
    return new NextResponse(toCsv(built), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="payroll-${provider.toLowerCase()}-${to.toISOString().slice(0, 10)}.csv"`,
      },
    })
  }

  return NextResponse.json({
    data: {
      ...built,
      from: from.toISOString(),
      to: to.toISOString(),
      // Said before the file is built rather than after it is rejected.
      missingPayrollIds: missingIds(built),
      note:
        'Etyme does not run payroll. This is what is owed, for your provider to process.',
    },
  })
}
