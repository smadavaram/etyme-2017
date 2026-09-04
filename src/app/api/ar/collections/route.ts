import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { hasPermission } from '@/lib/permissions'
import {
  collectionStage, canFactor, checkWriteOff, stepsAlreadySent,
  creditsByInvoice, netOfCredits, ageInvoice, forCustomer,
  WRITE_OFF_LABEL,
  type CollectionCase, type DunningStep, type SentLetter,
} from '@/lib/ar-ageing'
import { committedOf, exposureOf, type RunningAssignment } from '@/lib/credit'
import { fromPrismaDecimal } from '@/lib/money'
import { loadBook, openInvoiceIdsAcross } from '../book'

/**
 * What happens after the automated ladder runs out.
 *
 * ── The state this route exists to make impossible ───────────────────
 *
 * `dunningForCustomer` climbs four rungs and then goes silent, which is
 * correct — a fifth email does not change a decision somebody has taken
 * at the client. But going silent is where most systems stop, and the
 * debt then sits in a state with a name nobody had written down: past the
 * end of an automated process and owned by no person. It is not being
 * collected. It is being aged.
 *
 * So the ladder's silence becomes a queue with an owner column, and the
 * arithmetic in `collectionStage` says what the next move is.
 *
 * ── What is persisted, and the one thing that is not ─────────────────
 *
 * `DunningSend` records a rung that was climbed: which customer, which
 * step, which invoices it named, who did it and when. That is exactly the
 * shape of an ownership or escalation event, so those are written there.
 *
 * A PROMISE TO PAY is not, and cannot be yet. A promise is a date — "they
 * said they would pay" with no date is not a promise, it is a way of
 * postponing a phone call — and there is nowhere on `DunningSend` for a
 * future date to live. `sentAt` is when the letter went and overwriting
 * it would corrupt the ladder's own memory. The arithmetic for promises,
 * broken promises and the escalation that follows is built and tested in
 * `src/lib/ar-ageing.ts`; it lights up when the column exists.
 *
 *   NEEDED FROM THE ARCHITECT:
 *     DunningSend.promisedFor  DateTime?   the date money was promised for
 *     DunningSend.note         String?     who at the client said it
 *     DunningSend.amountCents  Int?        how much they committed to
 */

/** Steps that are collections events rather than letters. */
const COLLECTION_STEPS = [
  'OWNER_ASSIGNED',
  'PROMISE_MADE',
  'STOP_WORK_ADVISED',
  'FACTORED',
  'WRITTEN_OFF',
] as const
type CollectionStep = (typeof COLLECTION_STEPS)[number]

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Collections')
  if (notStaff) return notStaff
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'A debt is owed to a company' } },
      { status: 403 }
    )
  }
  if (
    !caller.permissions.includes('margin.read') &&
    !caller.permissions.includes('pnl.read')
  ) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'You cannot see what clients owe.' } },
      { status: 403 }
    )
  }

  const companyId = caller.company.id
  const now = new Date()
  const gaps: string[] = []

  const { raw, book } = await loadBook(companyId, now)
  if (raw.length === 0) {
    return NextResponse.json({
      data: { asOf: now.toISOString(), cases: [], gaps, note: 'Nothing has been invoiced yet.' },
    })
  }

  // Credits come off before anything is chased. Chasing a client for
  // money an account manager has already agreed to credit is the fastest
  // way to lose an account you had just repaired.
  const creditRows = await prisma.creditNote.findMany({
    where: { invoice: { engagement: { msa: { vendorId: companyId } } } },
    select: {
      invoiceId: true, amount: true, appliedAt: true, reasonCode: true,
      invoice: { select: { currency: true } },
    },
    take: 5_000,
  })
  const credited = creditsByInvoice(
    creditRows.map((c) => ({
      invoiceId: c.invoiceId,
      amountMinor: fromPrismaDecimal(c.amount, c.invoice.currency).minor,
      currency: c.invoice.currency,
      reasonCode: c.reasonCode,
      appliedAt: c.appliedAt,
    }))
  )

  const sendRows = await prisma.dunningSend.findMany({
    where: { companyId },
    select: {
      clientCompanyId: true, step: true, sentAt: true, invoiceIds: true,
      promisedFor: true, amountCents: true, note: true,
      sentBy: { select: { id: true, name: true } },
    },
    orderBy: { sentAt: 'desc' },
    take: 5_000,
  })

  const openIds = openInvoiceIdsAcross(book)
  const laddersByCustomer: Record<string, DunningStep[]> = stepsAlreadySent(
    sendRows as unknown as SentLetter[],
    openIds
  )

  // Promises, from the same event log. The most recent promise whose
  // named invoices are still open is the live one; one whose date has
  // passed while those invoices stayed open is broken — and broken is
  // counted per promise, because two broken promises is a pattern and
  // the stop-work arithmetic treats it as one.
  const promiseByCustomer = new Map<string, { amountMinor: number; promisedFor: Date; by: string; madeAt: Date }>()
  const brokenByCustomer = new Map<string, number>()
  for (const r of sendRows) {
    if (r.step !== 'PROMISE_MADE' || !r.promisedFor) continue
    const stillOpen = r.invoiceIds.some((id) => openIds.has(id))
    if (!stillOpen) continue
    if (r.promisedFor.getTime() < now.getTime()) {
      brokenByCustomer.set(r.clientCompanyId, (brokenByCustomer.get(r.clientCompanyId) ?? 0) + 1)
    } else if (!promiseByCustomer.has(r.clientCompanyId)) {
      // Rows arrive newest first, so the first live one is the latest.
      promiseByCustomer.set(r.clientCompanyId, {
        amountMinor: r.amountCents ?? 0,
        promisedFor: r.promisedFor,
        by: r.sentBy?.name ?? 'somebody at the client',
        madeAt: r.sentAt,
      })
    }
  }

  // The owner is whoever most recently took it, while any invoice that
  // event named is still open. An owner from a run of arrears that has
  // since been cleared is not the owner of the next one.
  const ownerByCustomer = new Map<string, { name: string; at: Date }>()
  const writtenOff = new Set<string>()
  for (const r of sendRows) {
    if (!r.invoiceIds.some((id) => openIds.has(id))) continue
    if (r.step === 'WRITTEN_OFF') writtenOff.add(r.clientCompanyId)
    if (r.step === 'OWNER_ASSIGNED' && r.sentBy && !ownerByCustomer.has(r.clientCompanyId)) {
      ownerByCustomer.set(r.clientCompanyId, { name: r.sentBy.name, at: r.sentAt })
    }
  }

  // Committed work, for the exposure the stop-work threshold is measured
  // against. Same source as the AR screen so the two cannot disagree.
  const running = await prisma.sellContract.findMany({
    where: {
      companyId,
      state: { in: ['IN_PROGRESS', 'VERIFIED'] },
      OR: [{ endDate: null }, { endDate: { gt: now } }],
    },
    select: {
      id: true, billRate: true, billCurrency: true, endDate: true,
      clientCompanyId: true, person: { select: { name: true } },
    },
    take: 2_000,
  })

  const assignmentsByCustomer = new Map<string, Map<string, RunningAssignment[]>>()
  for (const c of running) {
    const a: RunningAssignment = {
      contractId: c.id,
      personName: c.person.name,
      billRateMinor: c.billRate,
      currency: c.billCurrency,
      endDate: c.endDate,
      observedHoursPerWeek: null,
    }
    const per = assignmentsByCustomer.get(c.clientCompanyId) ?? new Map<string, RunningAssignment[]>()
    per.set(c.billCurrency, [...(per.get(c.billCurrency) ?? []), a])
    assignmentsByCustomer.set(c.clientCompanyId, per)
  }

  const cases: unknown[] = []

  for (const cb of book.byCurrency) {
    // Re-age net of applied credits, so a fully credited invoice is not
    // chased as ninety days of arrears.
    const byCustomer = new Map<string, ReturnType<typeof ageInvoice>[]>()
    for (const a of cb.invoices) {
      const net = ageInvoice(netOfCredits(a, credited.get(a.id) ?? 0), now)
      byCustomer.set(net.customerId, [...(byCustomer.get(net.customerId) ?? []), net])
    }

    for (const [customerId, theirs] of byCustomer) {
      const roll = forCustomer(theirs)
      if (roll.overdueMinor <= 0 && roll.disputedMinor <= 0) continue

      const assignments = assignmentsByCustomer.get(customerId)?.get(cb.currency) ?? []
      const exposure = exposureOf({
        customerId,
        customerName: roll.customerName,
        currency: cb.currency,
        receivableMinor: roll.outstandingMinor,
        unbilledMinor: null,
        committed: committedOf(assignments, now),
      })

      const owner = ownerByCustomer.get(customerId) ?? null

      const c: CollectionCase = {
        customerId,
        customerName: roll.customerName,
        currency: cb.currency,
        overdueMinor: roll.overdueMinor,
        oldestDaysOverdue: roll.oldestDaysOverdue ?? 0,
        disputedMinor: roll.disputedMinor,
        exposureMinor: exposure.minor,
        laddersSent: laddersByCustomer[customerId] ?? [],
        ownerName: owner?.name ?? null,
        promise: promiseByCustomer.get(customerId) ?? null,
        brokenPromises: brokenByCustomer.get(customerId) ?? 0,
      }

      cases.push({
        ...c,
        writtenOff: writtenOff.has(customerId),
        ownerSince: owner?.at ?? null,
        verdict: collectionStage(c, now),
        factorable: canFactor(c),
        invoices: theirs
          .filter((a) => a.outstandingMinor > 0)
          .map((a) => ({
            id: a.id, number: a.number, outstandingMinor: a.outstandingMinor,
            daysOverdue: a.daysOverdue, disputed: a.disputed,
          })),
      })
    }
  }

  return NextResponse.json({
    data: {
      asOf: now.toISOString(),
      cases,
      writeOffReasons: Object.entries(WRITE_OFF_LABEL).map(([code, label]) => ({ code, label })),
      gaps,
      note:
        'Past the last automated letter the ladder goes quiet, and quiet is where debts ' +
        'age. Every case here has a stage and a next move, and a stop-work recommendation ' +
        'is a recommendation — there are people on site and pulling them ends the account.',
    },
  })
}

/**
 * Record a collections action.
 *
 * Written to `DunningSend`, which already holds "a rung that was climbed,
 * by whom, naming which invoices". An ownership event is exactly that
 * shape. `stepsAlreadySent` ignores steps it does not recognise, so these
 * rows cannot silently stand in for a letter that was never sent.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Collections')
  if (notStaff) return notStaff
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'A debt is owed to a company' } },
      { status: 403 }
    )
  }
  if (!hasPermission(caller.permissions, 'pnl.read')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'Taking a debt on, or giving up on one, is a controller’s decision.',
        },
      },
      { status: 403 }
    )
  }

  const companyId = caller.company.id
  const body = await request.json().catch(() => ({}))
  const step = String(body.step ?? '') as CollectionStep
  const clientCompanyId = String(body.clientCompanyId ?? '')

  if (!clientCompanyId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Which customer?', field: 'clientCompanyId' } },
      { status: 422 }
    )
  }
  if (!COLLECTION_STEPS.includes(step)) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message:
            `"${body.step}" is not a collections action. One of ${COLLECTION_STEPS.join(', ')}.`,
          field: 'step',
        },
      },
      { status: 422 }
    )
  }

  const invoiceIds: string[] = Array.isArray(body.invoiceIds)
    ? body.invoiceIds.map((s: unknown) => String(s))
    : []

  // The invoices have to be ours, and open. An ownership event naming an
  // invoice from a settled run of arrears would silence a ladder that
  // should be starting from the bottom.
  const mine = await prisma.invoice.findMany({
    where: { id: { in: invoiceIds }, engagement: { msa: { vendorId: companyId } } },
    select: { id: true },
  })
  if (mine.length === 0) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message:
            'Name the invoices this covers. An event naming none belongs to no run of ' +
            'arrears and suppresses nothing, which makes it a row nobody can act on.',
          field: 'invoiceIds',
        },
      },
      { status: 422 }
    )
  }

  const personId = realPersonId(caller)

  if (step === 'WRITTEN_OFF') {
    const amountCents = Number(body.amountCents)
    const check = checkWriteOff({
      amountMinor: Number.isFinite(amountCents) ? amountCents : 0,
      reason: String(body.reason ?? ''),
      note: body.note ? String(body.note) : null,
      byPersonId: personId,
    })
    if (!check.ok) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: check.problems.join(' '), field: 'reason' } },
        { status: 422 }
      )
    }
  }

  if (step === 'OWNER_ASSIGNED' && !personId) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message:
            'An owner is a person. A debt owned by a role or by nobody is a debt that ages.',
        },
      },
      { status: 422 }
    )
  }

  // A promise is a date and an amount, or it is not a promise. "They
  // said they would pay" with neither is a way of ending a phone call.
  let promisedFor: Date | null = null
  let promisedCents: number | null = null
  if (step === 'PROMISE_MADE') {
    promisedFor = body?.promisedFor ? new Date(String(body.promisedFor)) : null
    promisedCents = Number.isFinite(Number(body?.amountCents)) ? Math.round(Number(body.amountCents)) : null
    if (!promisedFor || isNaN(promisedFor.getTime()) || promisedFor.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'A promise needs a future date.', field: 'promisedFor' } },
        { status: 422 }
      )
    }
    if (!promisedCents || promisedCents <= 0) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'A promise needs an amount, in minor units.', field: 'amountCents' } },
        { status: 422 }
      )
    }
  }

  const row = await prisma.dunningSend.create({
    data: {
      companyId,
      clientCompanyId,
      step,
      invoiceIds: mine.map((i) => i.id),
      channel: 'PERSON',
      sentById: personId,
      promisedFor,
      amountCents: promisedCents,
      note: body?.note ? String(body.note).trim() : null,
    },
    select: { id: true, step: true, sentAt: true, invoiceIds: true },
  })

  await prisma.automationLog.create({
    data: {
      companyId,
      action: `COLLECTIONS_${step}`,
      summary:
        `${step.toLowerCase().replace(/_/g, ' ')} on ${mine.length} invoice` +
        `${mine.length === 1 ? '' : 's'}`,
      reason: body.reason ? String(body.reason) : `Recorded by ${caller.person.name}`,
      payload: {
        clientCompanyId,
        step,
        invoiceIds: mine.map((i) => i.id),
        note: body.note ? String(body.note) : null,
      },
      // A write-off is not reversible by pressing something. It is
      // reversed by re-raising the debt, which is a decision of its own.
      reversible: step !== 'WRITTEN_OFF',
    },
  })

  return NextResponse.json(
    {
      data: {
        event: row,
        note:
          step === 'OWNER_ASSIGNED'
            ? 'Recorded. Nothing automated goes out while a person owns it — two voices ' +
              'on the same debt is how a client learns to answer neither.'
            : step === 'WRITTEN_OFF'
              ? 'Written off, with a name and a reason against it. A debt that disappears ' +
                'with neither is indistinguishable from a fraud and from a mistake.'
              : 'Recorded.',
      },
    },
    { status: 201 }
  )
}
