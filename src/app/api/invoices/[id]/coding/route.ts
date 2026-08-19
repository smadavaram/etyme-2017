import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { allocateAmount, formatShare, type AllocationShare } from '@/lib/cost-allocation'
import { poBalance } from '@/lib/purchase-order'
import { PROFILES, profileById, render, type CodedLine } from '@/lib/erp-profiles'

/**
 * GET /api/invoices/:id/coding
 * GET /api/invoices/:id/coding?format=csv
 *
 * The AP posting view of an invoice: every line split across the end
 * client's cost centres, with the GL account and PO reference their finance
 * team needs to post it.
 *
 * Etyme is not the general ledger. This produces coded data their ERP
 * imports — SAP, Oracle, Workday all take a flat file of exactly this shape.
 *
 * Amounts are split by largest remainder (src/lib/cost-allocation.ts) so the
 * coded rows sum back to the invoice total to the cent. An AP team that
 * finds a one-cent gap rejects the whole file.
 *
 * Visible to both parties, because both need it: the vendor to show what
 * they billed, the client to post it. Neither sees the other's dimensions —
 * these are the CLIENT's cost centres, and a vendor's own profit-centre
 * coding is not carried here.
 */

interface CodedRow {
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  vendor: string
  billTo: string
  poNumber: string | null
  personName: string
  costCenterCode: string | null
  costCenterName: string | null
  glAccount: string | null
  share: string
  amount: number
  currency: string
  /**
   * Whose chart of accounts these codes come from. Normally the bill-to
   * party. On a layer-cake leg — vendor invoices an MSP, consultant sits at
   * the enterprise — the coding belongs to the enterprise, and the MSP codes
   * its own onward invoice differently. Labelled rather than passed off as
   * the payer's own.
   */
  codingOwner: string
  codingIsPayers: boolean
}

function toCsv(rows: CodedRow[]): string {
  const headers = [
    'Invoice', 'Invoice Date', 'Due Date', 'Vendor', 'Bill To', 'PO',
    'Resource', 'Cost Center', 'Cost Center Name', 'GL Account', 'Coding Owner',
    'Share', 'Amount', 'Currency',
  ]

  // Quote every field and double any embedded quotes — a company name with
  // a comma in it must not shift every downstream column.
  const escape = (v: string | number | null): string => {
    const s = v === null || v === undefined ? '' : String(v)
    return `"${s.replace(/"/g, '""')}"`
  }

  const lines = [headers.map(escape).join(',')]
  for (const r of rows) {
    lines.push([
      r.invoiceNumber, r.invoiceDate, r.dueDate, r.vendor, r.billTo, r.poNumber,
      r.personName, r.costCenterCode, r.costCenterName, r.glAccount, r.codingOwner,
      r.share, r.amount.toFixed(2), r.currency,
    ].map(escape).join(','))
  }
  return lines.join('\n')
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      engagement: {
        include: {
          msa: {
            include: {
              vendor: { select: { id: true, name: true } },
              client: { select: { id: true, name: true } },
            },
          },
        },
      },
      purchaseOrder: {
        select: { id: true, number: true, amount: true, status: true, endDate: true },
      },
      remitTo: {
        select: {
          legalName: true, addressLines: true, country: true, taxId: true,
          paymentMethod: true, bankName: true, accountLast4: true, routingLast4: true,
        },
      },
    },
  })

  if (!invoice) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Invoice not found' } },
      { status: 404 }
    )
  }

  // Both parties to the agreement may read the coding; nobody else.
  const vendorId = invoice.engagement.msa.vendorId
  const clientId = invoice.engagement.msa.clientId
  const callerCompanyId = caller.company?.id
  if (callerCompanyId !== vendorId && callerCompanyId !== clientId) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Not a party to this invoice' } },
      { status: 403 }
    )
  }

  const lines = Array.isArray(invoice.lines) ? (invoice.lines as any[]) : []
  const contractIds = [...new Set(lines.map(l => l.sellContractId).filter(Boolean))]

  const contracts = contractIds.length > 0
    ? await prisma.sellContract.findMany({
        where: { id: { in: contractIds } },
        select: {
          id: true,
          costAllocations: {
            select: {
              shareBps: true,
              glAccount: true,
              costCenter: {
                select: {
                  id: true, code: true, name: true, glAccount: true,
                  companyId: true,
                  company: { select: { name: true } },
                },
              },
            },
          },
        },
      })
    : []

  const allocationsByContract = new Map(contracts.map(c => [c.id, c.costAllocations]))

  const invoiceDate = invoice.periodEnd.toISOString().slice(0, 10)
  const dueDate = invoice.dueAt.toISOString().slice(0, 10)
  const rows: CodedRow[] = []
  let uncoded = 0

  for (const line of lines) {
    const amountCents = Math.round(Number(line.amount ?? 0) * 100)
    const allocations = allocationsByContract.get(line.sellContractId) ?? []

    const base = {
      invoiceNumber: invoice.number,
      invoiceDate,
      dueDate,
      vendor: invoice.engagement.msa.vendor.name,
      billTo: invoice.engagement.msa.client.name,
      poNumber: invoice.purchaseOrder?.number ?? null,
      personName: line.personName ?? 'Unknown',
      currency: invoice.currency,
    }

    // An uncoded contract is surfaced as a row with no cost centre rather
    // than dropped — the export must still total the invoice, and AP needs
    // to see what they have to code by hand.
    if (allocations.length === 0) {
      uncoded++
      rows.push({
        ...base,
        costCenterCode: null,
        costCenterName: null,
        glAccount: null,
        share: '100%',
        amount: amountCents / 100,
        codingOwner: invoice.engagement.msa.client.name,
        codingIsPayers: true,
      })
      continue
    }

    const shares: AllocationShare[] = allocations.map(a => ({
      costCenterId: a.costCenter.id,
      shareBps: a.shareBps,
    }))

    const split = allocateAmount(amountCents, shares)

    for (const part of split) {
      const alloc = allocations.find(a => a.costCenter.id === part.costCenterId)!
      rows.push({
        ...base,
        costCenterCode: alloc.costCenter.code,
        costCenterName: alloc.costCenter.name,
        glAccount: alloc.glAccount ?? alloc.costCenter.glAccount,
        share: formatShare(part.shareBps),
        amount: part.amountCents / 100,
        codingOwner: alloc.costCenter.company.name,
        codingIsPayers: alloc.costCenter.companyId === clientId,
      })
    }
  }

  // What is left on the PO this invoice draws against. AP checks this before
  // paying — an invoice that takes the PO past its ceiling needs a change
  // order, not a payment run.
  let poState: ReturnType<typeof poBalance> & { number: string } | null = null
  if (invoice.purchaseOrder) {
    const drawn = await prisma.invoice.aggregate({
      where: {
        purchaseOrderId: invoice.purchaseOrder.id,
        status: { not: 'CANCELLED' },
      },
      _sum: { total: true },
    })
    poState = {
      number: invoice.purchaseOrder.number,
      ...poBalance({
        amountCents: Math.round(Number(invoice.purchaseOrder.amount) * 100),
        invoicedCents: Math.round(Number(drawn._sum.total ?? 0) * 100),
        status: invoice.purchaseOrder.status as any,
        endDate: invoice.purchaseOrder.endDate,
      }),
    }
  }

  const codedTotal = rows.reduce((sum, r) => sum + r.amount, 0)
  const invoiceTotal = Number(invoice.total)
  // Rounding is handled by largest remainder, so any drift here is a bug.
  const balanced = Math.abs(codedTotal - invoiceTotal) < 0.005

  if (request.nextUrl.searchParams.get('format') === 'csv') {
    return new NextResponse(toCsv(rows), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${invoice.number}-coding.csv"`,
      },
    })
  }

  // ── The same rows, written the way one ERP wants them ───────────────
  //
  // Not four integrations — four ways of writing down the same coded
  // lines, because each system disagrees about column names, date formats
  // and delimiters. Etyme is not the general ledger; this hands their
  // ledger something it will accept.
  const profileId = request.nextUrl.searchParams.get('profile')
  if (profileId) {
    const profile = profileById(profileId.toUpperCase())
    if (!profile) {
      return NextResponse.json(
        {
          error: {
            code: 'UNKNOWN_PROFILE',
            message: `No profile called ${profileId}`,
            options: PROFILES.map((p) => ({ id: p.id, label: p.label })),
          },
        },
        { status: 422 }
      )
    }

    const lines: CodedLine[] = rows.map((r) => ({
      invoiceNumber: r.invoiceNumber,
      invoiceDate: r.invoiceDate,
      dueDate: r.dueDate,
      vendor: r.vendor,
      billTo: r.billTo,
      poNumber: r.poNumber,
      personName: r.personName,
      costCenterCode: r.costCenterCode,
      glAccount: r.glAccount,
      amount: r.amount,
      currency: r.currency,
    }))

    const written = render(profile, lines, invoiceTotal)

    // Refused rather than written. An AP team that finds a one-cent gap or
    // an unmapped line rejects the whole file and asks for it again
    // tomorrow, so the problem is worth naming here.
    if (!written.ok) {
      return NextResponse.json(
        {
          error: {
            code: 'CANNOT_EXPORT',
            message: written.problems[0].problem,
            problems: written.problems,
            profile: { id: profile.id, label: profile.label, howItLands: profile.howItLands },
          },
        },
        { status: 409 }
      )
    }

    return new NextResponse(written.result.content, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${written.result.fileName}"`,
      },
    })
  }

  return NextResponse.json({
    data: {
      invoice: {
        id: invoice.id,
        number: invoice.number,
        total: invoiceTotal,
        currency: invoice.currency,
        status: invoice.status,
        periodStart: invoice.periodStart.toISOString().slice(0, 10),
        periodEnd: invoice.periodEnd.toISOString().slice(0, 10),
        dueAt: dueDate,
      },
      vendor: invoice.engagement.msa.vendor,
      billTo: invoice.engagement.msa.client,
      purchaseOrder: invoice.purchaseOrder?.number ?? null,
      purchaseOrderBalance: poState,
      remitTo: invoice.remitTo,
      rows,
      // How to hand these rows to a ledger. Said here so an AP team finds
      // it on the screen they are already looking at.
      exportProfiles: PROFILES.map((p) => ({
        id: p.id,
        label: p.label,
        howItLands: p.howItLands,
        href: `/api/invoices/${invoice.id}/coding?profile=${p.id}`,
      })),
      reconciliation: {
        invoiceTotal,
        codedTotal: Math.round(codedTotal * 100) / 100,
        balanced,
        uncodedLines: uncoded,
        // True on a layer-cake leg: the codes shown belong to the end client,
        // and the party being billed will code its own onward invoice.
        codedForEndClient: rows.some(r => !r.codingIsPayers),
      },
      basis:
        'Cost centres and GL accounts come from the owning company\'s chart of accounts — see Coding Owner on each row. ' +
        'Split amounts use largest-remainder allocation so coded rows total the invoice exactly. ' +
        'Etyme is not the ledger — this file is for import into the payer\'s ERP.',
    },
  })
}
