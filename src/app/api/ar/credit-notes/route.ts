import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { hasPermission } from '@/lib/permissions'
import { fromPrismaDecimal, decimalsFor } from '@/lib/money'
import {
  checkCreditNote, disputesView, ageInvoice, creditsByInvoice, netOfCredits,
  CREDIT_REASONS, CREDIT_REASON_LABEL, PROCESS_FAULT_REASONS,
  type ArInvoice, type AppliedCredit,
} from '@/lib/ar-ageing'
import { onCreditNote, balance, wellFormed } from '@/lib/gl'

/**
 * Credit notes, and the disputes view they belong in.
 *
 * ── One list, because it is one argument ─────────────────────────────
 *
 * A short payment is a client deciding not to pay part of an invoice. A
 * credit note is us agreeing with them. Two stages of the same
 * conversation, and a screen showing only one of them lets somebody chase
 * a client for money an account manager has already agreed to credit —
 * which is the fastest way to lose an account you had just repaired.
 *
 * ── Posted in period, not in the month somebody noticed ──────────────
 *
 * The journal entry takes the INVOICE's date. March revenue credited in
 * June is a March correction; dating it June overstates one quarter and
 * understates the next, and the two errors never meet because they are in
 * different reports.
 *
 * ── The reason code earns its keep in aggregate ──────────────────────
 *
 * Nobody asks about one credit note. The question is "how much did we
 * credit last quarter and why", and it has no answer at all unless the
 * reasons are a short closed list. So the response counts them, and
 * separates the ones that say something about how we bill — a quarter of
 * RATE_WRONG is a contract-amendment process that is not working — from
 * the ones that say something about a client.
 */

const NOT_CREDITABLE = ['DRAFT', 'CANCELLED', 'VOID']

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Disputes and credit notes')
  if (notStaff) return notStaff
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Credit notes belong to the firm that issued the invoice' } },
      { status: 403 }
    )
  }
  if (
    !caller.permissions.includes('margin.read') &&
    !caller.permissions.includes('pnl.read')
  ) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'You cannot see what has been credited away.' } },
      { status: 403 }
    )
  }

  const companyId = caller.company.id
  const now = new Date()

  const invoices = await prisma.invoice.findMany({
    where: {
      engagement: { msa: { vendorId: companyId } },
      status: { notIn: NOT_CREDITABLE },
    },
    select: {
      id: true, number: true, currency: true, total: true, paid: true, dueAt: true,
      engagement: { select: { msa: { select: { client: { select: { id: true, name: true } } } } } },
      creditNotes: {
        select: {
          id: true, amount: true, reasonCode: true, note: true,
          issuedAt: true, appliedAt: true,
          createdBy: { select: { name: true } },
        },
      },
    },
    take: 5_000,
  })

  const credits: (AppliedCredit & {
    invoiceNumber: string
    customerName: string
    issuedAt: Date
    note?: string | null
  })[] = []

  const aged: ArInvoice[] = []

  for (const i of invoices) {
    const client = i.engagement.msa.client
    for (const c of i.creditNotes) {
      credits.push({
        invoiceId: i.id,
        amountMinor: fromPrismaDecimal(c.amount, i.currency).minor,
        currency: i.currency,
        reasonCode: c.reasonCode,
        appliedAt: c.appliedAt,
        invoiceNumber: i.number,
        customerName: client.name,
        issuedAt: c.issuedAt,
        note: c.note,
      })
    }
    aged.push({
      id: i.id,
      number: i.number,
      currency: i.currency,
      totalMinor: fromPrismaDecimal(i.total, i.currency).minor,
      paidMinor: fromPrismaDecimal(i.paid, i.currency).minor,
      dueAt: i.dueAt,
      customerId: client.id,
      customerName: client.name,
    })
  }

  // Credits come off the total before ageing, so a fully credited invoice
  // reads as settled rather than as ninety days of arrears.
  const byInvoice = creditsByInvoice(credits)
  const shortPaid = aged
    .map((a) => ageInvoice(netOfCredits(a, byInvoice.get(a.id) ?? 0), now))
    .filter((a) => a.disputed)

  const rows = disputesView(shortPaid, credits, now)

  const byReason = CREDIT_REASONS.map((code) => {
    const theirs = credits.filter((c) => c.reasonCode === code)
    return {
      code,
      label: CREDIT_REASON_LABEL[code],
      count: theirs.length,
      minor: theirs.reduce((n, c) => n + c.amountMinor, 0),
      aboutHowWeBill: PROCESS_FAULT_REASONS.includes(code),
    }
  }).filter((r) => r.count > 0)

  const processFault = byReason
    .filter((r) => r.aboutHowWeBill)
    .reduce((n, r) => n + r.minor, 0)
  const allCredited = byReason.reduce((n, r) => n + r.minor, 0)

  return NextResponse.json({
    data: {
      asOf: now.toISOString(),
      rows,
      byReason,
      creditedMinor: allCredited,
      processFaultMinor: processFault,
      says:
        allCredited === 0
          ? 'Nothing has been credited and nobody is paying short.'
          : `${rows.length} open argument${rows.length === 1 ? '' : 's'}. ` +
            (processFault > 0
              ? `${Math.round((processFault / allCredited) * 100)}% of everything credited ` +
                `was a fault in how we billed rather than anything about a client — that is ` +
                `the part worth fixing at the source.`
              : 'Nothing credited so far points at how we bill.'),
    },
  })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Credit notes')
  if (notStaff) return notStaff
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'A credit note is issued by a company' } },
      { status: 403 }
    )
  }
  // Giving revenue away is an invoicing decision, gated as one.
  if (!hasPermission(caller.permissions, 'invoices.issue')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Issuing a credit note needs invoices.issue' } },
      { status: 403 }
    )
  }

  const companyId = caller.company.id
  const body = await request.json().catch(() => ({}))
  const invoiceId = String(body.invoiceId ?? '')
  if (!invoiceId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Which invoice?', field: 'invoiceId' } },
      { status: 422 }
    )
  }

  const invoice = await prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      engagement: { msa: { vendorId: companyId } },
      status: { notIn: NOT_CREDITABLE },
    },
    select: {
      id: true, number: true, currency: true, total: true, periodEnd: true, issuedAt: true,
      creditNotes: { select: { amount: true } },
    },
  })
  if (!invoice) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such invoice of ours', field: 'invoiceId' } },
      { status: 404 }
    )
  }

  const per = 10 ** decimalsFor(invoice.currency)
  const value = Number(body.amount)
  if (!Number.isFinite(value)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'A credit note needs an amount', field: 'amount' } },
      { status: 422 }
    )
  }

  const already = invoice.creditNotes.reduce(
    (n, c) => n + fromPrismaDecimal(c.amount, invoice.currency).minor,
    0
  )

  const verdict = checkCreditNote({
    reasonCode: String(body.reasonCode ?? ''),
    note: body.note ? String(body.note) : null,
    amountMinor: Math.round(value * per),
    invoiceTotalMinor: fromPrismaDecimal(invoice.total, invoice.currency).minor,
    alreadyCreditedMinor: already,
  })

  if (!verdict.ok) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: verdict.problems.join(' '), field: 'reasonCode' } },
      { status: 422 }
    )
  }

  // The period the money belonged to. The invoice's own issue date where
  // it has one, and the end of the period it billed otherwise — never
  // today, which would move a correction into a quarter it has nothing to
  // do with.
  const postedAt = invoice.issuedAt ?? invoice.periodEnd

  const entry = onCreditNote(
    Math.round(value * per),
    postedAt,
    invoice.number,
    verdict.reasonCode!
  )
  const problems = wellFormed(entry)
  if (problems.length > 0) {
    // Debits equal credits before writing, never reconciled afterwards.
    return NextResponse.json(
      { error: { code: 'UNBALANCED', message: problems.join(' ') } },
      { status: 500 }
    )
  }

  const created = await prisma.creditNote.create({
    data: {
      invoiceId: invoice.id,
      amount: value,
      reasonCode: verdict.reasonCode!,
      note: body.note ? String(body.note) : null,
      // Applied straight away unless somebody explicitly holds it. An
      // issued-and-unapplied note is a promise that has not reached the
      // books, and it deliberately does not reduce the debt until it has.
      appliedAt: body.hold === true ? null : new Date(),
      createdById: realPersonId(caller),
    },
    select: { id: true, amount: true, reasonCode: true, issuedAt: true, appliedAt: true },
  })

  return NextResponse.json(
    {
      data: {
        creditNote: created,
        journal: {
          postedAt: entry.postedAt.toISOString(),
          memo: entry.memo,
          lines: entry.lines,
          balanced: balance(entry).balanced,
        },
        note:
          `${verdict.says} Posted to ${postedAt.toISOString().slice(0, 10)} — the period ` +
          `the invoice belonged to, not the month somebody noticed.` +
          (created.appliedAt
            ? ''
            : ' Held rather than applied, so it does not reduce the debt yet.'),
      },
    },
    { status: 201 }
  )
}
