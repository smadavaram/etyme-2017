import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { hasPermission } from '@/lib/permissions'
import { dunningRun, stepsAlreadySent, type DunningStep, type SentLetter } from '@/lib/ar-ageing'
import { loadBook, openInvoiceIdsAcross } from '../book'

/**
 * POST /api/ar/dunning — actually send the reminders, and record that we did.
 *
 * ── Why this route is the point of the whole ladder ──────────────────
 *
 * `src/lib/ar-ageing.ts` has held the ladder for a while and it has been
 * advisory the entire time: the AR screen showed what WOULD go out
 * today, and nothing anywhere recorded what went. Which meant the one
 * rule that makes a ladder a ladder — do not say the same thing twice —
 * could not be enforced. Repeat a final notice every morning and the AP
 * clerk writes a filter rule, and then the invoices they WOULD have paid
 * stop arriving too.
 *
 * So this route writes `DunningSend` rows, and `GET /api/ar` reads them
 * back through `stepsAlreadySent`. A rung climbed for this run of
 * arrears is not climbed again tomorrow.
 *
 * ── The client does not choose what is sent ──────────────────────────
 *
 * The body names a customer at most. Which rung, and which invoices, are
 * recomputed here from the same rows the screen read. A caller that
 * could post `step: 'FINAL'` with an invoice list of its own could chase
 * a settled invoice, skip the courtesy note, or record a letter nobody
 * sent — and the record would then be worse than no record, because
 * everything downstream would trust it.
 *
 * ── What it refuses to send by itself ────────────────────────────────
 *
 * The fifth rung. `ESCALATED` hands the debt to an account manager, and
 * past sixty days somebody at the client's end has made a decision that
 * a fifth email does not change. A person owns it from there, so this
 * route reports it and does not record it as sent.
 *
 * ── What this route does NOT do ──────────────────────────────────────
 *
 * It does not deliver the email. Wording, channel and delivery belong to
 * `etyme-conversation` — `src/lib/notify.ts` and the notification
 * delivery path — and this route deliberately does not reach into them.
 * What it records is that the letter was RAISED, with the invoices it
 * named, which is the fact the ladder needs. When delivery is wired the
 * send id travels with it; nothing here has to change.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Chasing money owed to us')
  if (notStaff) return notStaff

  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Chasing a debt is something a company does' } },
      { status: 403 }
    )
  }

  // Deciding to chase a client is a commercial act on the account, not a
  // reading one. The same gate as raising an invoice.
  if (!hasPermission(caller.permissions, 'invoices.issue')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message:
            'Sending a reminder to a client needs invoices.issue. It is a message to their ' +
            'accounts payable team in your company’s name.',
        },
      },
      { status: 403 }
    )
  }

  const companyId = caller.company.id
  const now = new Date()
  const body = await request.json().catch(() => ({}))

  /** Optional. Absent means the whole book. */
  const onlyCustomerId: string | null = body.clientCompanyId ? String(body.clientCompanyId) : null
  const channel = String(body.channel ?? 'EMAIL').toUpperCase()
  /** True answers "what would go out" without writing anything. */
  const dryRun = body.dryRun === true

  const { book } = await loadBook(companyId, now)

  if (book.byCurrency.length === 0) {
    return NextResponse.json({
      data: {
        sent: [],
        skipped: [],
        note: 'Nothing is outstanding, so there is nobody to chase.',
      },
    })
  }

  const openIds = openInvoiceIdsAcross(book)

  const sendRows = await prisma.dunningSend.findMany({
    where: { companyId },
    select: { clientCompanyId: true, step: true, sentAt: true, invoiceIds: true },
    orderBy: { sentAt: 'desc' },
    take: 5_000,
  })

  const already: Record<string, DunningStep[]> = stepsAlreadySent(
    sendRows as SentLetter[],
    openIds
  )

  const sent: {
    id: string | null
    clientCompanyId: string
    customerName: string
    step: DunningStep
    invoiceNumbers: string[]
    amountMinor: number
    currency: string
    subject: string
    says: string
  }[] = []

  const skipped: { clientCompanyId: string; customerName: string; reason: string; says: string }[] = []

  // One decision per customer per currency book. A customer billed in two
  // currencies is two conversations, because a letter cannot state one
  // total across them.
  for (const cb of book.byCurrency) {
    const run = dunningRun(cb, already)

    for (const s of run.silent) {
      if (onlyCustomerId && s.customerId !== onlyCustomerId) continue
      skipped.push({
        clientCompanyId: s.customerId,
        customerName: s.customerName,
        reason: s.reason,
        says: s.says,
      })
    }

    for (const action of run.send) {
      if (onlyCustomerId && action.customerId !== onlyCustomerId) continue

      // The last rung is a person's job. Reported, never recorded as
      // sent, because recording it would suppress the account manager's
      // own record of the conversation they actually had.
      if (!action.automated) {
        skipped.push({
          clientCompanyId: action.customerId,
          customerName: action.customerName,
          reason: 'WITH_A_PERSON',
          says:
            `${action.customerName} is past sixty days. This is an account manager's call ` +
            `and nothing automated is recorded against it — two voices on one debt is how ` +
            `a client learns to answer neither.`,
        })
        continue
      }

      if (dryRun) {
        sent.push({
          id: null,
          clientCompanyId: action.customerId,
          customerName: action.customerName,
          step: action.step,
          invoiceNumbers: action.invoiceNumbers,
          amountMinor: action.amountMinor,
          currency: action.currency,
          subject: action.subject,
          says: action.says,
        })
        continue
      }

      const row = await prisma.dunningSend.create({
        data: {
          companyId,
          clientCompanyId: action.customerId,
          step: action.step,
          invoiceIds: action.invoiceIds,
          channel,
          sentById: realPersonId(caller),
        },
        select: { id: true },
      })

      // Anything the system does unprompted writes a row somebody can
      // read back in plain English, with an honest reversible flag. A
      // letter to a client's accounts payable team cannot be unsent.
      await prisma.automationLog.create({
        data: {
          companyId,
          action: 'DUNNING_SENT',
          summary:
            `${action.subject} — ${action.customerName}, ${action.invoiceIds.length} invoice` +
            `${action.invoiceIds.length === 1 ? '' : 's'}.`,
          reason: action.why,
          payload: {
            dunningSendId: row.id,
            clientCompanyId: action.customerId,
            step: action.step,
            invoiceIds: action.invoiceIds,
            amountMinor: action.amountMinor,
            currency: action.currency,
            maxDaysOverdue: action.maxDaysOverdue,
            channel,
          },
          reversible: false,
        },
      })

      sent.push({
        id: row.id,
        clientCompanyId: action.customerId,
        customerName: action.customerName,
        step: action.step,
        invoiceNumbers: action.invoiceNumbers,
        amountMinor: action.amountMinor,
        currency: action.currency,
        subject: action.subject,
        says: action.says,
      })
    }
  }

  return NextResponse.json({
    data: {
      asOf: now.toISOString(),
      dryRun,
      sent,
      skipped,
      note: dryRun
        ? 'Nothing was recorded. This is what would go out.'
        : `${sent.length} letter${sent.length === 1 ? '' : 's'} raised and recorded. The ` +
          `same rung will not go out again while an invoice it named is still open.`,
    },
  })
}

/**
 * GET /api/ar/dunning — what has already been said, and when.
 *
 * The screen needs to show more than "a letter is due". It needs to show
 * that one went on the 14th, because the question an AR clerk asks
 * before picking up the phone is "have we already chased them".
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Reminders sent to clients')
  if (notStaff) return notStaff

  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Reminders belong to a company' } },
      { status: 403 }
    )
  }

  if (
    !hasPermission(caller.permissions, 'margin.read') &&
    !hasPermission(caller.permissions, 'pnl.read')
  ) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'Who has been chased for what is the same class of fact as what a placement earns.',
        },
      },
      { status: 403 }
    )
  }

  const url = request.nextUrl
  const clientCompanyId = url.searchParams.get('clientCompanyId')

  const rows = await prisma.dunningSend.findMany({
    where: {
      companyId: caller.company.id,
      ...(clientCompanyId ? { clientCompanyId } : {}),
    },
    select: {
      id: true, clientCompanyId: true, step: true, invoiceIds: true,
      channel: true, sentAt: true,
      clientCompany: { select: { name: true } },
      sentBy: { select: { name: true } },
    },
    orderBy: { sentAt: 'desc' },
    take: 500,
  })

  return NextResponse.json({
    data: {
      sends: rows.map((r) => ({
        id: r.id,
        clientCompanyId: r.clientCompanyId,
        customerName: r.clientCompany.name,
        step: r.step,
        invoiceCount: r.invoiceIds.length,
        channel: r.channel,
        sentAt: r.sentAt.toISOString(),
        // Null where it went automatically, which is most of them.
        sentBy: r.sentBy?.name ?? null,
      })),
      note:
        'A letter suppresses its rung only while an invoice it named is still open. When ' +
        'the last of them settles the ladder starts again from the bottom.',
    },
  })
}
