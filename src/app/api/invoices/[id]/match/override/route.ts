import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, type CallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { matchInvoice } from '@/lib/invoice-match'
import { OVERRIDABLE, decimalToCents, type MatchCode } from '@/lib/three-way-match'
import { invoiceScope } from '@/lib/resolve-client-company'
import { booksFor, noteMoneyRead } from '@/lib/money/seated-books'
import { directionFrom, partiesOf } from '@/lib/money/invoice-parties'
import { waiveDesk } from '@/lib/money/pay-desk'
import type { CompanyKind } from '@/lib/company-defaults'

/**
 * POST   /api/invoices/:id/match/override   { code, reason }
 * DELETE /api/invoices/:id/match/override?code=PRICE
 *
 * How an AP clerk resolves a variance by hand.
 *
 * Three rules, in order of how much trouble breaking them causes:
 *
 *   1. Only a check that actually failed can be waived. Pre-emptive
 *      exceptions are how a control quietly stops being one.
 *   2. Some checks can never be waived — paying twice, paying for hours
 *      nobody approved, arithmetic. No signature unlocks them, so the
 *      request is refused rather than recorded and ignored.
 *   3. A reason is required and travels with the invoice for good. Addendum
 *      E's rule: warn, capture a reason, proceed — never silently permit.
 *
 * Withdrawing an exception is deliberately as easy as granting one. A
 * waiver granted on Monday against a $4,800 invoice should not still be
 * covering a $12,000 one on Friday, which is why the amount at the time is
 * recorded alongside it.
 *
 * And two gates in front of all three, added 2026-10-06. The invoice was
 * found by id alone, so any signed-in caller could waive a check on any
 * company's invoice. It is now found only in the reader's own books —
 * the client's, through the seat, where a program office sits at a
 * client's desk — and the waiving desk is asked (`waiveDesk` in
 * lib/money/pay-desk): the firm being asked to pay, at a desk that pays.
 */
async function deskFor(request: NextRequest, caller: CallerContext, id: string) {
  const notFound = NextResponse.json(
    { error: { code: 'NOT_FOUND', message: 'Invoice not found' } },
    { status: 404 }
  )
  const whose = caller.company ? await booksFor(caller, request) : null
  if (whose?.error) return { error: whose.error }
  const reading = whose?.books ?? null
  const scope = reading && invoiceScope(caller) ? reading.invoiceWhere : null
  if (!reading || !scope) return { error: notFound }

  const invoice = await prisma.invoice.findFirst({
    where: { id, ...scope },
    select: {
      id: true, number: true, total: true,
      workOrder: { select: { issuedById: true, issuedToId: true } },
      engagement: {
        select: {
          msa: { select: { vendorId: true, clientId: true } },
          sellContracts: { select: { companyId: true }, take: 1 },
        },
      },
    },
  })
  if (!invoice) return { error: notFound }

  const direction = directionFrom(
    partiesOf({ agreement: invoice.engagement.msa, order: invoice.workOrder }),
    reading.companyId
  )
  const verdict = waiveDesk({
    permissions: reading.caller.permissions,
    direction,
    companyKind: reading.companyKind as CompanyKind,
    companyName: reading.companyName,
    seat: reading.seat ? { clientName: reading.seat.clientCompany.name, roleName: reading.seat.role.name } : null,
  })
  if (!verdict.mayWaive) {
    return {
      error: NextResponse.json(
        { error: { code: 'FORBIDDEN', message: verdict.says ?? 'This desk cannot waive a check.' } },
        { status: 403 }
      ),
    }
  }
  return { invoice, reading }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params
  const body = await request.json()
  const code = body.code as MatchCode
  const reason = String(body.reason ?? '').trim()

  if (!code || !(code in OVERRIDABLE)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: `Unknown match check "${body.code}"`, field: 'code' } },
      { status: 422 }
    )
  }

  if (reason.length < 5) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Say why. This travels with the invoice and the next person to read it will be an auditor.',
          field: 'reason',
        },
      },
      { status: 422 }
    )
  }

  // Rule 2 — some things are not anybody's to wave through.
  if (!OVERRIDABLE[code]) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_OVERRIDABLE',
          message: refusal(code),
        },
      },
      { status: 403 }
    )
  }

  const desk = await deskFor(request, caller, id)
  if (desk.error) return desk.error
  const { invoice, reading } = desk
  noteMoneyRead(reading, `Invoice ${invoice.number} check waived`)

  // Rule 1 — only waive something that is actually failing right now.
  const before = await matchInvoice(id)
  const failing = before?.checks.find(c => c.code === code && c.outcome === 'FAIL')
  if (!failing) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_FAILING',
          message: `${label(code)} is not failing on this invoice, so there is nothing to waive`,
        },
      },
      { status: 409 }
    )
  }

  await prisma.invoiceMatchOverride.upsert({
    where: { invoiceId_code: { invoiceId: id, code } },
    create: {
      invoiceId: id,
      code,
      reason,
      byId: caller.person.id,
      invoiceTotalCentsAtOverride: decimalToCents(invoice.total),
    },
    update: {
      reason,
      byId: caller.person.id,
      invoiceTotalCentsAtOverride: decimalToCents(invoice.total),
    },
  })

  const after = await matchInvoice(id)

  await prisma.automationLog.create({
    data: {
      companyId: caller.company?.id ?? invoice.engagement.sellContracts[0]?.companyId ?? '',
      action: 'INVOICE_MATCH_OVERRIDDEN',
      summary: `${caller.person.name} waived ${label(code)} on invoice ${invoice.number}`,
      // The original failure is kept, not just the excuse for it.
      reason: `${failing.reason} — waived because: ${reason}`,
      payload: {
        invoiceId: id,
        code,
        originalFailure: failing.reason,
        invoiceTotal: Number(invoice.total),
        nowMatched: after?.matched ?? false,
      },
      reversible: true,
    },
  })

  return NextResponse.json({
    data: {
      invoiceId: id,
      code,
      waived: failing.reason,
      reason,
      by: caller.person.name,
      matched: after?.matched ?? false,
      cleanMatch: after?.cleanMatch ?? false,
      remainingFailures: after?.checks.filter(c => c.outcome === 'FAIL').map(c => c.reason) ?? [],
      message: after?.matched
        ? `Exception recorded. The invoice can now be submitted, and carries the exception with it.`
        : `Exception recorded, but the invoice still does not match.`,
    },
  })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params
  const code = request.nextUrl.searchParams.get('code')
  if (!code) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'code is required', field: 'code' } },
      { status: 422 }
    )
  }

  const desk = await deskFor(request, caller, id)
  if (desk.error) return desk.error
  noteMoneyRead(desk.reading, `Invoice ${desk.invoice.number} exception withdrawn`)

  const existing = await prisma.invoiceMatchOverride.findUnique({
    where: { invoiceId_code: { invoiceId: id, code } },
  })
  if (!existing) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such exception on this invoice' } },
      { status: 404 }
    )
  }

  await prisma.invoiceMatchOverride.delete({
    where: { invoiceId_code: { invoiceId: id, code } },
  })

  await prisma.automationLog.create({
    data: {
      companyId: caller.company?.id ?? '',
      action: 'INVOICE_MATCH_OVERRIDE_WITHDRAWN',
      summary: `${caller.person.name} withdrew the ${label(code as MatchCode)} exception`,
      reason: `Originally waived because: ${existing.reason}`,
      payload: { invoiceId: id, code },
      reversible: true,
    },
  })

  const after = await matchInvoice(id)
  return NextResponse.json({
    data: {
      invoiceId: id,
      code,
      matched: after?.matched ?? false,
      message: 'Exception withdrawn',
    },
  })
}

function label(code: MatchCode): string {
  const map: Record<MatchCode, string> = {
    RECEIPT: 'the receipt check',
    DUPLICATE: 'the duplicate check',
    QUANTITY: 'the hours variance',
    PERIOD: 'the billing period',
    CONTRACT_PERIOD: 'the contract billing period',
    PRICE: 'the rate variance',
    EXTENSION: 'the line arithmetic',
    HEADER_TOTAL: 'the invoice total',
    PO_REQUIRED: 'the purchase order requirement',
    PO_STATUS: 'the purchase order status',
    PO_BALANCE: 'the purchase order balance',
  }
  return map[code] ?? code
}

/** Why a refusal is a refusal, in terms somebody can act on. */
function refusal(code: MatchCode): string {
  const map: Partial<Record<MatchCode, string>> = {
    DUPLICATE: 'This work is already on another invoice. Paying it twice is not something anyone can approve — void the duplicate instead.',
    RECEIPT: 'No approved timesheet stands behind these hours. Get the manager to approve the time; nobody can sign that away.',
    PRICE: 'The contract carries a different rate for this period. If the rate genuinely changed, amend the contract effective from the date it changed and have that approved — then the invoice matches because it is right, not because somebody signed it off.',
    EXTENSION: 'The line does not multiply out. Correct the figures rather than waiving them.',
    HEADER_TOTAL: 'The invoice total disagrees with its own lines. Correct the invoice rather than waiving it.',
  }
  return map[code] ?? 'This check cannot be waived.'
}
