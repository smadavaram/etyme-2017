import { NextRequest, NextResponse } from 'next/server'
import { minorFromWhole } from '@/lib/money'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { allocateAmount, formatShare, type AllocationShare } from '@/lib/cost-allocation'
import { poBalance } from '@/lib/purchase-order'
import { drawnOnOrder } from '@/lib/money/order-drawn'
import { PROFILES, profileById, render, type CodedLine } from '@/lib/erp-profiles'
import { partiesOf } from '@/lib/money/invoice-parties'
import { booksFor, noteMoneyRead } from '@/lib/money/seated-books'
import { codingReader, splitIsPayers } from '@/lib/money/coding-reader'
import { recordRefusal } from '@/lib/access-log'

/**
 * GET /api/invoices/:id/coding
 * GET /api/invoices/:id/coding?format=csv
 *
 * The AP posting view of an invoice: every line split across the end
 * client's cost centers, with the GL account and PO reference their finance
 * team needs to post it.
 *
 * Etyme is not the general ledger. This produces coded data their ERP
 * imports — an enterprise ERP takes a flat file of exactly this shape.
 *
 * Amounts are split by largest remainder (src/lib/cost-allocation.ts) so the
 * coded rows sum back to the invoice total to the cent. An AP team that
 * finds a one-cent gap rejects the whole file.
 *
 * Read by the company that pays it, and nobody else. These are the
 * payer's own cost centers and GL accounts, and a client's codes stay the
 * client's (CLAUDE.md, "Money"; `lib/money/coding-reader`). The supplier
 * that issued the bill, and a firm between, are told in one sentence whose
 * the codes are, and the refusal is on the access log before it is sent.
 * Anybody else gets what an invoice that does not exist gets. A firm
 * seated in the payer's program reads them only while acting as it.
 *
 * Until 2026-11-13 both parties could read it, so a supplier could
 * download its client's cost centers and GL accounts from its own bill.
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
   * its own onward invoice differently. Labeled rather than passed off as
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

  // Whose books this request is on: the caller's own firm, or the client
  // whose program a seated firm is acting in.
  const notFound = () =>
    NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Invoice not found' } }, { status: 404 })
  if (!caller.company) return notFound()
  const whose = await booksFor(caller, request)
  if (whose.error) return whose.error
  const books = whose.books

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
      workOrder: {
        select: {
          id: true, number: true, amount: true, currency: true, status: true, endDate: true,
          // Who the two firms are where no agreement says. The order is
          // what authorized the spend either way.
          issuedById: true, issuedToId: true,
          issuedBy: { select: { id: true, name: true } },
          issuedTo: { select: { id: true, name: true } },
        },
      },
      // The lines as billed. Every bill raised today writes these rows;
      // the JSON column is read only where an older bill has none.
      invoiceLines: {
        select: { sellContractId: true, amountCents: true, person: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      },
      remitTo: {
        select: {
          legalName: true, addressLines: true, country: true, taxId: true,
          paymentMethod: true, bankName: true, accountLast4: true, routingLast4: true,
        },
      },
    },
  })

  if (!invoice) return notFound()

  // Only the payer reads the coding. Who the two firms are comes from the
  // agreement where there is one and from the order where there is not;
  // where neither says, nobody is the payer and the answer is not found.
  const parties = partiesOf({ agreement: invoice.engagement.msa, order: invoice.workOrder })
  const reader = codingReader({
    readerCompanyId: books.companyId,
    vendor: parties.vendor,
    payer: parties.client,
    invoiceNumber: invoice.number,
  })
  if (reader.kind !== 'PAYER') {
    // Written before the refusal is sent (CLAUDE.md, 2026-10-08). The
    // subject is the company whose codes were asked for, or the firm
    // that asked where nothing says who pays.
    await recordRefusal([{ companyId: parties.client?.id ?? caller.company.id }], {
      actorPersonId: caller.isService ? undefined : caller.person.id,
      actorCompanyId: caller.company.id,
      action: 'CONTRACT_VIEW',
      reason:
        reader.kind === 'ISSUER'
          ? `Refused the cost coding on ${invoice.number} to the firm that issued it: the codes are the payer's own.`
          : `Refused the cost coding on ${invoice.number}: the reader is not the company that pays it.`,
    })
    if (reader.kind === 'STRANGER') return notFound()
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: reader.says } }, { status: 403 })
  }
  noteMoneyRead(books, `the cost coding on ${invoice.number}`)
  const payerId = parties.client!.id

  // One shape for both sources: the contract, the person, the amount in
  // minor units. The JSON column held whole currency; it was null on every
  // bill raised since the lines became rows, which left this view empty.
  const lines: Array<{ sellContractId: string | null; personName: string | null; amountCents: number }> =
    invoice.invoiceLines.length > 0
      ? invoice.invoiceLines.map((l) => ({
          sellContractId: l.sellContractId,
          personName: l.person?.name ?? null,
          amountCents: l.amountCents,
        }))
      : (Array.isArray(invoice.lines) ? (invoice.lines as any[]) : []).map((l) => ({
          sellContractId: l.sellContractId ?? null,
          personName: l.personName ?? null,
          amountCents: minorFromWhole(l.amount ?? 0, invoice.currency),
        }))
  const contractIds = [...new Set(lines.map(l => l.sellContractId).filter((x): x is string => !!x))]

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
    const amountCents = line.amountCents
    // Another company's split is never shown: on a chain the sell line's
    // codes are the end client's, and the firm between that pays this
    // invoice reads the line as not coded, for its own books.
    const split0 = (line.sellContractId ? allocationsByContract.get(line.sellContractId) : undefined) ?? []
    const allocations = splitIsPayers(split0, payerId) ? split0 : []

    const base = {
      invoiceNumber: invoice.number,
      invoiceDate,
      dueDate,
      vendor: parties.vendor?.name ?? 'Not yet attributed',
      billTo: parties.client?.name ?? 'Not yet attributed',
      poNumber: invoice.workOrder?.number ?? null,
      personName: line.personName ?? 'Unknown',
      currency: invoice.currency,
    }

    // An uncoded contract is surfaced as a row with no cost center rather
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
        codingOwner: parties.client?.name ?? 'Not yet attributed',
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
        codingIsPayers: alloc.costCenter.companyId === parties.client?.id,
      })
    }
  }

  // What is left on the PO this invoice draws against, once this bill is
  // on it. AP checks this before paying — an invoice that takes the PO
  // past its ceiling needs a change order, not a payment run.
  //
  // The same figure the three-way check's ceiling reads: everything else
  // that draws on the order (`drawnOnOrder`: bills sent and typed-in
  // invoice receipts, never a draft) plus this bill. The release walk of
  // 2026-11-03 read two figures on one page for PO-2026-NF9BK, because
  // this route summed every invoice on the order, drafts included. A
  // document in another currency is never added: the figure is then
  // withheld with the sentence.
  let poState: (ReturnType<typeof poBalance> & { number: string; afterThisBill: true }) | { number: string; unreadable: string } | null = null
  if (invoice.workOrder) {
    const ccy = (invoice.workOrder.currency ?? invoice.currency).toUpperCase()
    const drawn = await drawnOnOrder({ id: invoice.workOrder.id, currency: ccy }, { invoiceId: invoice.id })
    if (drawn.foreign.length > 0 || invoice.currency.toUpperCase() !== ccy) {
      const others = [...drawn.foreign, ...(invoice.currency.toUpperCase() !== ccy ? [invoice.number] : [])]
      poState = {
        number: invoice.workOrder.number,
        unreadable: `What is left on ${invoice.workOrder.number} is not given: ${others.join(', ')} ${others.length === 1 ? 'is' : 'are'} in another currency than the order's ${ccy}, and two currencies are never added.`,
      }
    } else {
      poState = {
        number: invoice.workOrder.number,
        afterThisBill: true,
        ...poBalance({
          amountCents: minorFromWhole(invoice.workOrder.amount, ccy),
          invoicedCents: drawn.cents + minorFromWhole(invoice.total, ccy),
          status: invoice.workOrder.status as any,
          endDate: invoice.workOrder.endDate,
        }),
      }
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
      vendor: parties.vendor,
      billTo: parties.client,
      workOrder: invoice.workOrder?.number ?? null,
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
        'Cost centers and GL accounts come from the owning company\'s chart of accounts — see Coding Owner on each row. ' +
        'Split amounts use largest-remainder allocation so coded rows total the invoice exactly. ' +
        'Etyme is not the ledger — this file is for import into the payer\'s ERP.',
    },
  })
}
