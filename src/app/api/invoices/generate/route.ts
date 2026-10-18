import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { partiesOf, mayBillUnder } from '@/lib/money/invoice-parties'
import { generateBill } from '@/lib/money/bill-generate'

/**
 * GET /api/invoices/generate — the engagements this firm may bill.
 *
 * ── Why a route and not a filter on the screen ───────────────────────
 *
 * The release walk of 2026-09-21, from the seat Cavanaugh Glassworks
 * granted Aptiva Workforce: Invoices → "+ Generate" → a picker holding
 * an engagement that belongs to a supplier, and a 403 on pressing the
 * button — *"This engagement is Arcadia Tech Group's to bill, not
 * Aptiva Workforce's."*
 *
 * The sentence was right and the picker was the bug. It was built out
 * of `/api/contracts?side=sell`, which answers "what may this seat
 * read" — and a program office sitting at a client's desk may read the
 * client's whole book. Reading is not billing. So a picker built on a
 * read permission offers an office every one of its client's suppliers'
 * deals and lets it press the button on each.
 *
 * This answers the question the button actually asks. It runs the same
 * `mayBillUnder` the POST refuses on, over the same `partiesOf`
 * cascade, so the list and the gate are one rule with one spelling.
 *
 * An empty answer is an answer, and it carries a sentence: a firm with
 * nothing to bill is told why rather than offered a control that will
 * refuse it.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!hasPermission(caller.permissions, 'invoices.issue')) {
    // The same sentence the button gets, from the same register of
    // which desks actually hold it — two hand-written lists of desks
    // are two lists that drift.
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: askTheDesk({
            doing: 'Raising a bill',
            needs: 'invoices.issue',
            kind: caller.company?.kind,
            companyName: caller.company?.name,
          }),
        },
      },
      { status: 403 }
    )
  }

  // Every engagement with a live line on it that names this firm
  // somewhere. Narrowed to what may actually be billed below; asking
  // the database for "ours" first keeps the page off every engagement
  // in the world.
  const engagements = await prisma.engagement.findMany({
    where: {
      sellContracts: { some: { state: 'IN_PROGRESS' } },
      OR: [
        { msa: { vendorId: caller.company!.id } },
        { workOrders: { some: { issuedToId: caller.company!.id } } },
        { sellContracts: { some: { companyId: caller.company!.id } } },
      ],
    },
    select: {
      id: true,
      title: true,
      msa: {
        select: {
          vendorId: true, clientId: true,
          vendor: { select: { id: true, name: true } },
          client: { select: { id: true, name: true } },
        },
      },
      workOrders: {
        select: {
          number: true,
          issuedById: true, issuedToId: true,
          issuedBy: { select: { id: true, name: true } },
          issuedTo: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
      sellContracts: {
        where: { state: 'IN_PROGRESS' },
        select: {
          companyId: true, clientCompanyId: true,
          company: { select: { id: true, name: true } },
          clientCompany: { select: { id: true, name: true } },
          endClientCompany: { select: { id: true, name: true } },
        },
      },
    },
    take: 200,
  })

  const billable = []
  for (const e of engagements) {
    const parties = partiesOf({
      agreement: e.msa,
      order: e.workOrders[0] ?? null,
      lines: e.sellContracts,
    })
    if (!mayBillUnder(parties, caller.company).ok) continue

    billable.push({
      id: e.id,
      title: e.title,
      // Who the bill would go to. The end client where a line names one
      // — that is the firm on the paper — and the customer on the line
      // otherwise. Never a guess: null where nothing says, and the
      // screen prints the engagement's own name alone.
      clientName:
        e.sellContracts[0]?.endClientCompany?.name ??
        parties.client?.name ??
        null,
      says: parties.says,
    })
  }

  return NextResponse.json({
    data: {
      engagements: billable,
      says:
        billable.length > 0
          ? null
          : `${caller.company!.name} has no engagement it can bill right now. A bill is ` +
            'raised by the firm that supplied the people, against its own live placements — ' +
            'so there is nothing here until this firm has one.',
    },
  })
}

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
      {
        error: {
          code: 'FORBIDDEN',
          message: askTheDesk({
            doing: 'Raising a bill',
            needs: 'invoices.issue',
            kind: caller.company?.kind,
            companyName: caller.company?.name,
          }),
        },
      },
      { status: 403 }
    )
  }

  const body = await request.json()
  // One way a bill is made, here and from the supplier's twin
  // (lib/money/bill-generate), so the two can never price a week twice
  // or two ways.
  const out = await generateBill(
    { company: { id: caller.company!.id, name: caller.company!.name, kind: caller.company!.kind }, person: { id: caller.person.id, name: caller.person.name } },
    body ?? {}
  )
  return NextResponse.json(out.body, { status: out.status })
}
