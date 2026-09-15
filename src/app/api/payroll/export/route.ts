import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { buildExport, toCsv, missingIds, type Provider, type SheetToPay } from '@/lib/payroll-export'
import { policyOf, splitWeeks, type Decision } from '@/lib/overtime'
import type { ExemptAssertion, ExemptionBasis, ExemptStatus, WageRuleName } from '@/lib/worker-classification'

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
      // The daily hours and what the client decided about the weeks that
      // went over the line. Overtime is a weekly fact and a semi-monthly
      // sheet holds two of them, so the file is built from weeks.
      days: true, leaveDays: true,
      sellContractId: true,
      overtimeDecisions: true,
      personId: true,
      person: { select: { name: true } },
      sellContract: {
        select: {
          id: true, billCurrency: true,
          overtimeAfterHours: true, overtimeMultiplierBps: true,
          company: { select: { name: true } },
          clientCompany: { select: { name: true } },
          costCenter: { select: { code: true } },
          internalOrder: { select: { code: true } },
          salesOrder: { select: { number: true } },
          // ── What we actually pay, and who we pay it to ────────────
          //
          // The buy leg. This route used to put `billRate` on the file,
          // which paid every consultant what the client was charged for
          // them. The pay rate, the contract type and the employer's own
          // exempt assertion all live here and nowhere else.
          buyLinks: {
            select: {
              effectiveFrom: true, effectiveTo: true,
              buyContract: {
                select: {
                  id: true, companyId: true, contractType: true, payCurrency: true,
                  payModel: true,
                  candidates: { select: { personId: true, payRate: true, state: true } },
                  exemptAssertions: {
                    select: {
                      personId: true, status: true, basis: true, wageRule: true, note: true,
                      assertedAt: true, reviewBy: true, assertedByCompanyId: true,
                      assertedByCompany: { select: { name: true } },
                      assertedBy: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { periodEnd: 'asc' },
    take: 5000,
  })

  const rows: SheetToPay[] = sheets.map((s) => {
    // The buy contract in force over this work, and this person on it.
    // Null all the way down where nothing on the buy side describes
    // them, which `buildExport` refuses rather than filling in from the
    // sell side.
    const link =
      s.sellContract.buyLinks.find(
        (l) =>
          l.effectiveFrom <= s.periodEnd && (l.effectiveTo == null || l.effectiveTo >= s.periodStart)
      ) ?? s.sellContract.buyLinks[0] ?? null
    const buy = link?.buyContract ?? null
    const candidate = buy?.candidates.find((c) => c.personId === s.personId) ?? null
    const row = buy?.exemptAssertions.find((a) => a.personId === s.personId) ?? null

    const assertion: ExemptAssertion | null = row
      ? {
          status: row.status as ExemptStatus,
          basis: (row.basis as ExemptionBasis | null) ?? null,
          assertedByCompanyId: row.assertedByCompanyId,
          assertedByCompanyName: row.assertedByCompany?.name ?? null,
          assertedByName: row.assertedBy?.name ?? null,
          assertedAt: row.assertedAt,
          note: row.note,
          reviewBy: row.reviewBy,
        }
      : null

    // What the client decided about each week that went over the line.
    // A billing fact on the sell leg — read so the file can say what the
    // employer still owes on top of it, never to price the wage.
    const decisions: Decision[] = s.overtimeDecisions
      .filter((d) => d.sellContractId === s.sellContractId)
      .map((d) => ({
        weekOf: d.weekOf.toISOString().slice(0, 10),
        treatment: d.treatment as Decision['treatment'],
        appliedBps: d.appliedBps,
        overtimeHours: Number(d.overtimeHours),
        accrualBps: d.accrualBps,
      }))

    const split = splitWeeks((s.days as Record<string, number>) ?? {}, policyOf(s.sellContract), {
      leaveDays: (s.leaveDays as Record<string, number>) ?? {},
      decisions,
    })

    return {
      personName: s.person.name,
      // No payroll id model yet — reported as missing rather than
      // guessed, because ADP matches on their file number and a row
      // without one is a row their import drops silently.
      payrollId: null,
      // From the buy contract, never assumed. Assuming W2 is how a
      // corp-to-corp company lands on a wage file as a person.
      contractType: buy?.contractType ?? 'UNKNOWN',
      // We employ them where the buy contract is ours. A sub-vendor's
      // own employee is paid by the sub-vendor.
      weAreTheEmployer: buy?.companyId === companyId,
      periodStart: s.periodStart,
      periodEnd: s.periodEnd,
      weeks: split.weeks.map((w) => ({
        weekOf: w.weekOf,
        regularHours: w.regularHours,
        leaveHours: w.leaveHours,
        overHours: w.overHours,
        client: { treatment: w.treatment, appliedBps: w.appliedBps },
      })),
      submittedHours: Number(s.totalHours),
      acceptedHours: s.acceptedHours ? Number(s.acceptedHours) : null,
      employerAcceptedAt: s.employerAcceptedAt,
      payRateCents: candidate?.payRate ?? null,
      payModel: buy?.payModel ?? 'FIXED_HOURLY',
      // Nothing in the schema records a salary basis, so the honest,
      // conservative read: paid by the hour unless somebody says.
      paidOnSalaryBasis: false,
      rule: (row?.wageRule as WageRuleName) ?? 'US_FLSA',
      assertion,
      currency: buy?.payCurrency ?? s.sellContract.billCurrency,
      // Either cost object. A project pot and a standing department are
      // both real and the client's ledger cares which.
      costCode:
        s.sellContract.internalOrder?.code ?? s.sellContract.costCenter?.code ?? null,
      orderNumber: s.sellContract.salesOrder?.number ?? null,
      employerName: s.sellContract.company?.name ?? null,
      clientName: s.sellContract.clientCompany?.name ?? null,
    }
  })

  const built = buildExport(provider, rows)

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
