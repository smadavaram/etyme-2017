import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, type CallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { OVERRIDABLE, CHECK_NAME, type MatchCode } from '@/lib/three-way-match'
import { checkKeyedReceipt, asKeyed, KEYED_SELECT } from '@/lib/money/keyed-receipt'
import { booksFor, noteMoneyRead } from '@/lib/money/seated-books'
import { waiveDesk } from '@/lib/money/pay-desk'
import { amount } from '@/lib/money-display'
import type { CompanyKind } from '@/lib/company-defaults'

/**
 * POST   /api/ap/bills/:id/match/override   { code, reason }
 * DELETE /api/ap/bills/:id/match/override?code=PO_BALANCE
 *
 * An exception on an invoice receipt somebody typed in from a supplier's
 * invoice — the mirror of `/api/invoices/:id/match/override` for one the
 * supplier sent on the platform, on exactly the same rules:
 *
 *   1. Only a check failing now can be waived.
 *   2. Some checks are never anybody's to wave through — the rate, a week
 *      nobody here accepted, the same work twice, arithmetic, and a total
 *      that cannot say whether its hours or its rate differ
 *      (`OVERRIDABLE` in lib/three-way-match). Refused, not recorded and
 *      ignored.
 *   3. A reason, which travels with the receipt for good, and the total it
 *      was granted at: a waiver for $4,484 does not cover the same receipt
 *      once it says $4,720 (`liveWaivers` in lib/money/keyed-lines).
 *
 * Who: the firm being asked to pay, at a desk that pays — `waiveDesk`, the
 * same answer the platform invoice's exception asks. A typed-in receipt is
 * always the payer's own record, so the only question is the desk.
 */
async function deskFor(request: NextRequest, caller: CallerContext, id: string) {
  const notFound = NextResponse.json(
    { error: { code: 'NOT_FOUND', message: 'No such invoice receipt here' } },
    { status: 404 }
  )
  const notStaff = staffOnly(caller, 'Invoice receipts')
  if (notStaff) return { error: notStaff }
  if (!caller.company) return { error: notFound }
  const { books: reading, error } = await booksFor(caller, request)
  if (error) return { error }

  const bill = await prisma.vendorBill.findUnique({ where: { id }, select: { ...KEYED_SELECT, status: true } })
  if (!bill || bill.companyId !== reading.companyId) return { error: notFound }

  const verdict = waiveDesk({
    permissions: reading.caller.permissions,
    direction: 'PAYABLE',
    companyKind: reading.companyKind as CompanyKind,
    companyName: reading.companyName,
    seat: reading.seat ? { clientName: reading.seat.clientCompany.name, roleName: reading.seat.role.name } : null,
  })
  if (!verdict.mayWaive) {
    return {
      error: NextResponse.json(
        { error: { code: 'FORBIDDEN', message: verdict.says ?? 'Your role cannot waive a check.' } },
        { status: 403 }
      ),
    }
  }
  return { bill, reading }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const code = String(body.code ?? '') as MatchCode
  const reason = String(body.reason ?? '').trim()

  if (!code || !(code in OVERRIDABLE)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: `There is no check called “${body.code ?? ''}”.`, field: 'code' } },
      { status: 422 }
    )
  }
  if (reason.length < 5) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Say why. This travels with the invoice receipt, and the next person to read it will be an auditor.',
          field: 'reason',
        },
      },
      { status: 422 }
    )
  }

  const desk = await deskFor(request, caller, id)
  if (desk.error) return desk.error
  const { bill, reading } = desk
  const vendorName = bill.vendorCompany.name

  if (!OVERRIDABLE[code]) {
    return NextResponse.json(
      { error: { code: 'NOT_OVERRIDABLE', message: notWaivable(code, vendorName) } },
      { status: 403 }
    )
  }
  if (bill.status === 'CANCELLED' || bill.status === 'PAID') {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_STATE',
          message: `${vendorName}’s invoice ${bill.number} is ${bill.status === 'PAID' ? 'paid' : 'cancelled'}, so there is nothing left to decide on it.`,
        },
      },
      { status: 409 }
    )
  }
  noteMoneyRead(reading, `Invoice receipt ${bill.number} check waived`)

  // Rule 1 — only waive what is failing now, on the check a payment runs.
  const before = await checkKeyedReceipt(asKeyed(bill), 'pay')
  const failing = before.match.checks.find((c) => c.code === code && c.outcome === 'FAIL')
  if (!failing) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_FAILING',
          message: `“${CHECK_NAME[code]}” is not failing on ${vendorName}’s invoice ${bill.number}, so there is nothing to waive.`,
        },
      },
      { status: 409 }
    )
  }

  await prisma.vendorBillMatchOverride.upsert({
    where: { vendorBillId_code: { vendorBillId: id, code } },
    create: { vendorBillId: id, code, reason, byId: caller.person.id, totalCentsAtOverride: bill.totalCents },
    update: { reason, byId: caller.person.id, totalCentsAtOverride: bill.totalCents, createdAt: new Date() },
  })

  const fresh = await prisma.vendorBill.findUniqueOrThrow({ where: { id }, select: KEYED_SELECT })
  const after = await checkKeyedReceipt(asKeyed(fresh), 'pay')
  const stillFailing = after.match.checks.filter((c) => c.outcome === 'FAIL')
  // The word on the receipt follows the check: disputed while something
  // still fails, received once nothing does.
  if (bill.status === 'DISPUTED' && stillFailing.length === 0) {
    await prisma.vendorBill.update({ where: { id }, data: { status: 'RECEIVED' } })
  }

  await prisma.automationLog.create({
    data: {
      companyId: reading.companyId,
      action: 'INVOICE_MATCH_OVERRIDDEN',
      summary: `${caller.person.name} waived “${CHECK_NAME[code]}” on ${vendorName}’s invoice ${bill.number}`,
      // The original failure is kept, not just the excuse for it.
      reason: `${failing.reason} — waived because: ${reason}`,
      payload: {
        vendorBillId: id,
        number: bill.number,
        code,
        originalFailure: failing.reason,
        totalCents: bill.totalCents,
        currency: bill.currency,
        nowMatched: after.match.matched,
      },
      reversible: true,
    },
  })

  return NextResponse.json({
    data: {
      vendorBillId: id,
      code,
      waived: failing.reason,
      reason,
      by: caller.person.name,
      atTotal: amount(bill.totalCents, bill.currency),
      matched: after.match.matched,
      remainingFailures: stillFailing.map((c) => c.reason),
      message: after.match.matched
        ? `Exception recorded on ${vendorName}’s invoice ${bill.number} for ${amount(bill.totalCents, bill.currency)}. It can be paid now, and carries the exception with it.`
        : `Exception recorded, but ${vendorName}’s invoice ${bill.number} still does not pass: ${stillFailing[0].reason.replace(/[.\s]+$/, '')}.`,
    },
  })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params
  const code = request.nextUrl.searchParams.get('code')
  if (!code) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Which exception? Name its check.', field: 'code' } },
      { status: 422 }
    )
  }
  const desk = await deskFor(request, caller, id)
  if (desk.error) return desk.error
  const { bill, reading } = desk
  noteMoneyRead(reading, `Invoice receipt ${bill.number} exception withdrawn`)

  const existing = await prisma.vendorBillMatchOverride.findUnique({
    where: { vendorBillId_code: { vendorBillId: id, code } },
  })
  if (!existing) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `There is no exception on ${bill.vendorCompany.name}’s invoice ${bill.number} for that check.` } },
      { status: 404 }
    )
  }
  await prisma.vendorBillMatchOverride.delete({ where: { vendorBillId_code: { vendorBillId: id, code } } })

  const fresh = await prisma.vendorBill.findUniqueOrThrow({ where: { id }, select: KEYED_SELECT })
  const after = await checkKeyedReceipt(asKeyed(fresh), 'pay')
  if (fresh.status !== 'CANCELLED' && fresh.status !== 'PAID' && !after.match.matched) {
    await prisma.vendorBill.update({ where: { id }, data: { status: 'DISPUTED' } })
  }

  await prisma.automationLog.create({
    data: {
      companyId: reading.companyId,
      action: 'INVOICE_MATCH_OVERRIDE_WITHDRAWN',
      summary: `${caller.person.name} withdrew the exception on ${bill.vendorCompany.name}’s invoice ${bill.number}`,
      reason: `Originally waived because: ${existing.reason}`,
      payload: { vendorBillId: id, number: bill.number, code },
      reversible: true,
    },
  })

  return NextResponse.json({
    data: { vendorBillId: id, code, matched: after.match.matched, message: 'Exception withdrawn.' },
  })
}

/** Why a refusal is a refusal, in terms somebody can act on. */
function notWaivable(code: MatchCode, vendorName: string): string {
  const map: Partial<Record<MatchCode, string>> = {
    DUPLICATE: 'This work is already on another invoice receipt or bill. Paying it twice is not something anyone can approve — cancel the one keyed in twice instead.',
    RECEIPT: 'Nothing accepted here stands behind this line — a week nobody here accepted, an expense nobody approved, a milestone nobody accepted. Accept it first; nobody can sign that away.',
    PRICE: 'The buy line carries a different rate for these days. If the rate genuinely changed, amend it from the day it changed and have that approved — then the receipt matches because it is right, not because somebody signed it off.',
    EXTENSION: 'A line does not multiply out. Record the figures the supplier’s invoice states, or ask for a corrected one.',
    HEADER_TOTAL: 'The lines do not add up to the total. Record the receipt again with the figures the invoice states.',
    AMOUNT: `A total cannot say whether its hours or its rate differ, so nobody can wave it through. Cancel the receipt and record it again with its lines, or ask ${vendorName} for a corrected invoice.`,
  }
  return map[code] ?? 'This check cannot be waived.'
}
