import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { emit } from '@/lib/events'
import { periodFor, hoursInPeriod, type Terms } from '@/lib/periods'

/**
 * POST /api/invoices/generate
 *
 * BUILD.md §3: "from approved, uninvoiced timesheets"
 *
 * LEGACY_RULES.md §4:
 *   - Invoice numbering: IN_{contract_number}_{sequential_three_digit_padded}
 *   - total_amount = (total_time_in_seconds / 3600) × contract rate
 *   - Guard: cannot generate if time <= 0 or rate <= 0
 *   - Due date: periodEnd + paymentTerms days
 *
 * Groups approved timesheets by engagement, calculates line items per
 * sell contract, then creates one Invoice per engagement covering the period.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!hasPermission(caller.permissions, 'invoices.issue')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Requires invoices.issue permission' } },
      { status: 403 }
    )
  }

  const body = await request.json()
  const { engagementId, periodStart, periodEnd } = body

  if (!engagementId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'engagementId is required', field: 'engagementId' } },
      { status: 422 }
    )
  }

  // Verify engagement and get payment terms
  const engagement = await prisma.engagement.findUnique({
    where: { id: engagementId },
    include: {
      msa: {
        include: {
          vendor: { select: { id: true, name: true } },
          client: { select: { id: true, name: true } },
        },
      },
      sellContracts: {
        where: { state: 'IN_PROGRESS' },
        include: {
          person: { select: { id: true, name: true } },
        },
      },
    },
  })

  if (!engagement) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Engagement not found' } },
      { status: 404 }
    )
  }

  if (engagement.sellContracts.length === 0) {
    return NextResponse.json(
      { error: { code: 'NO_CONTRACTS', message: 'No active sell contracts under this engagement' } },
      { status: 422 }
    )
  }

  // Find approved, uninvoiced timesheets under this engagement's sell contracts
  const contractIds = engagement.sellContracts.map((sc) => sc.id)

  const timesheetWhere: any = {
    sellContractId: { in: contractIds },
    // The client's signature, not the combined status. A prime may
    // invoice as soon as the end client has approved the work — waiting
    // for the sub to settle what it owes its own employee would hold up
    // cash for a reason that has nothing to do with the client.
    clientApprovedAt: { not: null },
    // Not yet billed. Expressed as the absence of an InvoiceLine rather
    // than a loose flag, so it cannot disagree with what was invoiced.
    invoiceLine: null,
  }

  // Anything that *overlaps* the requested window, not only what sits
  // wholly inside it.
  //
  // A week running 27 July to 2 August has four days that belong to July,
  // and `periodEnd <= 31 July` excluded it entirely — so a month billed
  // from weekly timesheets quietly lost its first few days every time.
  if (periodStart) {
    timesheetWhere.periodEnd = { gte: new Date(periodStart) }
  }
  if (periodEnd) {
    timesheetWhere.periodStart = { lte: new Date(periodEnd) }
  }

  const timesheets = await prisma.timesheet.findMany({
    where: timesheetWhere,
    include: {
      person: { select: { id: true, name: true } },
      sellContract: {
        select: {
          id: true, billRate: true, billCurrency: true, purchaseOrderId: true,
          startDate: true,
          // The contract says what a period is. Without these three the
          // period was invented from whatever timesheets happened to be
          // waiting.
          billFrequency: true, billAnchor: true, billStraddle: true,
        },
      },
    },
    orderBy: { periodStart: 'asc' },
  })

  if (timesheets.length === 0) {
    return NextResponse.json(
      { error: { code: 'NO_TIMESHEETS', message: 'No approved uninvoiced timesheets found for this engagement and period' } },
      { status: 422 }
    )
  }

  // Build line items grouped by sell contract (person)
  const linesByContract = new Map<string, {
    sellContractId: string
    personId: string
    personName: string
    billRate: number
    currency: string
    totalHours: number
    amount: number
    timesheetIds: string[]
  }>()

  // ── The period the contract bills ───────────────────────────────────
  //
  // Taken from the contract, not from the timesheets. Four weekly sheets
  // ending on the 3rd, 10th, 17th and 24th of August used to produce an
  // invoice for "28 July to 24 August" — a period in no contract, matching
  // no purchase order window, and reconciling against nothing the client
  // holds.
  //
  // Which period: the one containing the date asked for, or the one
  // containing the most recent work when nobody asked.
  const first = timesheets[0]
  const terms: Terms = {
    frequency: first.sellContract.billFrequency as Terms['frequency'],
    anchor: first.sellContract.billAnchor as Terms['anchor'],
    straddle: first.sellContract.billStraddle as Terms['straddle'],
    startedOn: first.sellContract.startDate,
  }

  const askedAbout = periodStart
    ? new Date(periodStart)
    : timesheets.reduce((latest, t) => (t.periodEnd > latest ? t.periodEnd : latest), timesheets[0].periodEnd)

  const period = periodFor(askedAbout, terms)

  for (const ts of timesheets) {
    const rate = ts.sellContract.billRate // cents per hour

    // How much of this timesheet belongs to the period being billed.
    //
    // Read from the daily hours, so a week crossing the boundary gives
    // each month exactly its own days — nothing apportioned, nothing
    // rounded, and the same hour never billed twice.
    const share = hoursInPeriod(
      {
        id: ts.id,
        periodStart: ts.periodStart,
        periodEnd: ts.periodEnd,
        days: (ts.days as Record<string, number>) ?? {},
        totalHours: Number(ts.totalHours),
      },
      period,
      terms.straddle
    )

    if (!share) continue
    const hours = share.hours

    // Guard: LEGACY_RULES.md — cannot invoice if time <= 0 or rate <= 0
    if (hours <= 0 || rate <= 0) continue

    const key = ts.sellContractId
    const existing = linesByContract.get(key)

    if (existing) {
      existing.totalHours += hours
      existing.amount += hours * rate / 100 // convert cents to dollars
      existing.timesheetIds.push(ts.id)
    } else {
      linesByContract.set(key, {
        sellContractId: ts.sellContractId,
        personId: ts.person.id,
        personName: ts.person.name,
        billRate: rate,
        currency: ts.sellContract.billCurrency,
        totalHours: hours,
        amount: hours * rate / 100,
        timesheetIds: [ts.id],
      })
    }

  }

  if (linesByContract.size === 0) {
    return NextResponse.json(
      { error: { code: 'ZERO_VALUE', message: 'All timesheets have zero hours or zero rate' } },
      { status: 422 }
    )
  }

  const lines = Array.from(linesByContract.values())
  const total = lines.reduce((sum, line) => sum + line.amount, 0)
  const currency = lines[0].currency // consolidated under one currency per invoice

  // Payment terms from the first contract (they cascade from MSA)
  // Payment terms run from the end of the period the contract bills, not
  // from whenever the last timesheet happened to finish. Thirty days from
  // the 31st is the 30th of next month, every month, whatever shape the
  // hours arrived in.
  const paymentTerms = engagement.sellContracts[0].paymentTerms ?? 30
  const dueAt = new Date(period.end.getTime() + paymentTerms * 86400000)

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Generate invoice number: IN_{engagement_seq}_{3-digit}
      // Count existing invoices for this engagement for sequencing
      const existingCount = await tx.invoice.count({
        where: { engagementId },
      })
      const seq = String(existingCount + 1).padStart(3, '0')
      // Use engagement ID fragment for the contract portion
      const engFragment = engagementId.slice(-6).toUpperCase()
      const number = `IN_${engFragment}_${seq}`

      // Create the invoice
      const invoice = await tx.invoice.create({
        data: {
          engagementId,
          number,
          periodStart: period.start,
          periodEnd: period.end,
          lines: lines.map((l) => ({
            sellContractId: l.sellContractId,
            personId: l.personId,
            personName: l.personName,
            billRate: l.billRate,
            totalHours: l.totalHours,
            amount: l.amount,
          })),
          currency,
          total,
          dueAt,
          status: 'ISSUED',
          // Inherit the PO the work was authorised under. Without it the
          // three-way match has only two records to compare.
          purchaseOrderId: timesheets.find(t => t.sellContract.purchaseOrderId)
            ?.sellContract.purchaseOrderId ?? null,
        },
      })

      // One InvoiceLine per timesheet — one receipt, one line. The JSON
      // above stays as a display cache grouped by person; these rows are
      // what the three-way match reads, and what the database constrains
      // to a single billing per timesheet.
      for (const group of lines) {
        for (const tsId of group.timesheetIds) {
          const ts = timesheets.find((t) => t.id === tsId)
          if (!ts) continue
          const hours = Number(ts.totalHours)
          const rateCents = ts.sellContract.billRate
          await tx.invoiceLine.create({
            data: {
              invoiceId: invoice.id,
              timesheetId: ts.id,
              sellContractId: ts.sellContractId,
              personId: ts.person.id,
              hours,
              rateCents,
              amountCents: Math.round(hours * rateCents),
              description: `${ts.person.name} — ${ts.periodStart.toISOString().slice(0, 10)} to ${ts.periodEnd.toISOString().slice(0, 10)}`,
            },
          })
        }
      }

      // Deliberately no write back to Timesheet here. The InvoiceLine rows
      // are the link, and an invoice must never touch the approval state of
      // the receipts that justify it.
      const allTimesheetIds = lines.flatMap((l) => l.timesheetIds)

      // AutomationLog
      await tx.automationLog.create({
        data: {
          companyId: caller.company!.id,
          action: 'INVOICE_GENERATED',
          summary: `Invoice ${number} generated: ${lines.length} line item(s), ${allTimesheetIds.length} timesheet(s), $${total.toFixed(2)} total, due ${dueAt.toISOString().slice(0, 10)}`,
          reason: `Generated by ${caller.person.name}`,
          payload: {
            invoiceId: invoice.id,
            number,
            engagementId,
            lineCount: lines.length,
            timesheetCount: allTimesheetIds.length,
            total,
            currency,
            dueAt: dueAt.toISOString(),
          },
          reversible: true,
        },
      })

      return invoice
    })

    // After the transaction. An invoice event for an invoice that rolled
    // back would have an AP team chasing a number that does not exist.
    void emit({
      type: 'invoice.generated',
      companyId: caller.company?.id ?? null,
      subjectType: 'Invoice',
      subjectId: result.id,
      actorPersonId: caller.person.id,
      payload: {
        number: result.number,
        engagementId,
        lineCount: lines.length,
        timesheetCount: lines.flatMap((l) => l.timesheetIds).length,
        total,
        currency,
        dueAt: dueAt.toISOString(),
      },
    })

    return NextResponse.json({
      data: {
        invoice: {
          id: result.id,
          number: result.number,
          periodStart: result.periodStart.toISOString(),
          periodEnd: result.periodEnd.toISOString(),
          total: Number(result.total),
          currency: result.currency,
          dueAt: result.dueAt.toISOString(),
          status: result.status,
          lineCount: lines.length,
          timesheetCount: lines.reduce((sum, l) => sum + l.timesheetIds.length, 0),
        },
        message: `Invoice ${result.number} generated: $${Number(result.total).toFixed(2)} total`,
      },
    }, { status: 201 })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json(
        { error: { code: 'DUPLICATE', message: 'Invoice number already exists — retry' } },
        { status: 409 }
      )
    }
    console.error('Invoice generation failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Invoice generation failed' } },
      { status: 500 }
    )
  }
}
