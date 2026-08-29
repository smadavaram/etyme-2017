import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { fromPrismaDecimal } from '@/lib/money'
import {
  dso, dunningRun, stepsAlreadySent,
  type BillingPeriod, type CurrencyBook,
  type DunningStep, type SentLetter,
} from '@/lib/ar-ageing'
import { loadBook, openInvoiceIdsAcross } from './book'
import {
  committedOf, exposureOf, assess,
  type RunningAssignment, type Committed, type CreditLimit,
} from '@/lib/credit'

/**
 * GET /api/ar — money owed to us, how old it is, and how exposed we are.
 *
 * The number that decides whether a staffing vendor survives is not what
 * a placement earns. It is how long the cash takes to arrive. A client at
 * ninety days is a problem on the Friday payroll runs, and margin has
 * nothing to say about it.
 *
 * Gated on the same permission as the profitability route — `margin.read`
 * or `pnl.read`. Who owes what and how thin the cash is are the same
 * class of fact as what a placement earns, and a recruiter role
 * deliberately does not see either.
 *
 * ── What this reads, and what it cannot ──────────────────────────────
 *
 * Everything here comes from `Invoice`, its `Payment` rows, the work
 * ledger and the running contracts. Nothing is derived from a rate card.
 * Three honest gaps are reported rather than papered over, and they
 * appear in `gaps` on the response:
 *
 *   **A customer with no limit set.** `CustomerCreditLimit` holds one per
 *   vendor and client pair and is read here, so a limit that exists is
 *   applied. Where none exists the verdict is NO_LIMIT_SET, which is
 *   reported as its own state and never as a pass — a green tick against
 *   a limit nobody set is the most misleading thing this screen could
 *   show.
 *
 *   **The dunning ladder is now suppressed by real history.**
 *   `DunningSend` records every letter and `POST /api/ar/dunning` writes
 *   one. The run reads them back through `stepsAlreadySent`, so a rung
 *   already climbed for THIS run of arrears is not climbed again
 *   tomorrow. The run of arrears is defined by the debt and not the
 *   calendar: a letter suppresses a rung only while an invoice it named
 *   is still open.
 *
 *   **A receipt that matches no invoice is still not read here.**
 *   `Payment.invoiceId` is now nullable, so genuinely unapplied cash is
 *   RECORDABLE — but this route reaches every payment through its
 *   invoice, so a receipt keyed against nothing is invisible to it. What
 *   IS visible is money received against an invoice beyond its total,
 *   and receipts that disagree with the invoice header, both of which
 *   are unapplied cash by another route. The orphan-payment queue is not
 *   built, and the gap is reported rather than left to be discovered by
 *   somebody wondering why the bank balance is larger than the ledger.
 */

/** Months of billing history the countback DSO is allowed to walk. */
const HISTORY_MONTHS = 12

/** How far back observed weekly hours are averaged. Twelve weeks. */
const OBSERVED_WINDOW_DAYS = 84

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Money owed to us')
  if (notStaff) return notStaff

  if (!caller.permissions.includes('margin.read') && !caller.permissions.includes('pnl.read')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message:
            'You cannot see what clients owe. A recruiter role deliberately does not — ' +
            'it is the same class of fact as what a placement earns.',
        },
      },
      { status: 403 }
    )
  }

  const companyId = caller.company!.id
  const now = new Date()
  const gaps: string[] = []

  // ── What we have billed and are owed ────────────────────────────────
  //
  // Our side only: invoices raised under an agreement where we are the
  // vendor. An invoice where we are the client is somebody else's
  // receivable and our payable, and mixing the two is how an AR report
  // reports a positive balance to a company that owes money.
  //
  // Loaded through `./book` rather than here, because the sending
  // endpoint has to see exactly the same rows. A screen and a letter that
  // disagree about which invoices are open produce a customer chased for
  // something the screen shows as settled, and nobody can reconstruct why.
  const { raw, book } = await loadBook(companyId, now)

  if (raw.length === 0) {
    return NextResponse.json({
      data: {
        asOf: now.toISOString(),
        source: 'NONE',
        currencies: [],
        gaps,
        note:
          'Nothing has been invoiced yet, so there is nothing to age. This screen fills ' +
          'as invoices are raised against approved timesheets.',
      },
    })
  }

  // The bill-to travels with the invoice as a label while the CLIENT is
  // the key everything rolls up on. A large client signs in one entity
  // and is billed through a shared services centre in another; if they
  // stop paying, both stop.
  const billedVia = new Map(
    raw.filter((i) => i.billTo && i.billTo.id !== i.engagement.msa.client.id)
      .map((i) => [i.id, i.billTo!.name])
  )

  // ── Delivered and not yet billed ────────────────────────────────────
  //
  // Hours the client has approved that no invoice line covers yet. Real
  // work with real wages behind it, and on a monthly cycle it is
  // routinely a month of revenue that no AR screen shows.
  let unbilledByCustomer: Map<string, Map<string, number>> | null = null
  try {
    const sheets = await prisma.timesheet.findMany({
      where: {
        sellContract: { companyId },
        invoiceLine: { is: null },
        assertions: { some: { state: 'LIVE', role: 'CLIENT_APPROVAL' } },
      },
      select: {
        sellContract: {
          select: { clientCompanyId: true, billRate: true, billCurrency: true },
        },
        assertions: {
          where: { state: 'LIVE', role: 'CLIENT_APPROVAL' },
          select: { hours: true, rateCents: true },
        },
      },
      take: 10_000,
    })

    unbilledByCustomer = new Map()
    for (const s of sheets) {
      const currency = s.sellContract.billCurrency
      for (const a of s.assertions) {
        // The client's own leg rate is what we may bill. Falling back to
        // the contract rate where the assertion carries none, rather than
        // dropping the hours — unbilled work with an unknown rate is
        // still unbilled work.
        const rate = a.rateCents || s.sellContract.billRate
        const value = Math.round(Number(a.hours) * rate)
        const perCustomer =
          unbilledByCustomer.get(s.sellContract.clientCompanyId) ?? new Map<string, number>()
        perCustomer.set(currency, (perCustomer.get(currency) ?? 0) + value)
        unbilledByCustomer.set(s.sellContract.clientCompanyId, perCustomer)
      }
    }
  } catch {
    // Left null rather than zero. Zero is a claim that there is none.
    unbilledByCustomer = null
    gaps.push(
      'Work delivered but not yet invoiced could not be read, so exposure below is a floor.'
    )
  }

  // ── Committed and not yet worked ────────────────────────────────────
  const running = await prisma.sellContract.findMany({
    where: {
      companyId,
      state: { in: ['IN_PROGRESS', 'VERIFIED'] },
      OR: [{ endDate: null }, { endDate: { gt: now } }],
    },
    select: {
      id: true, billRate: true, billCurrency: true, endDate: true,
      clientCompanyId: true,
      person: { select: { name: true } },
      timesheets: {
        where: { periodEnd: { gte: new Date(now.getTime() - OBSERVED_WINDOW_DAYS * 86_400_000) } },
        select: {
          assertions: {
            where: { state: 'LIVE', role: 'CLIENT_APPROVAL' },
            select: { hours: true },
          },
        },
      },
    },
    take: 2_000,
  })

  const assignmentsByCustomer = new Map<string, Map<string, RunningAssignment[]>>()
  for (const c of running) {
    const approvedHours = c.timesheets.reduce(
      (n, t) => n + t.assertions.reduce((m, a) => m + Number(a.hours), 0),
      0
    )
    const observed =
      approvedHours > 0
        ? Math.round((approvedHours / (OBSERVED_WINDOW_DAYS / 7)) * 10) / 10
        : null

    const a: RunningAssignment = {
      contractId: c.id,
      personName: c.person.name,
      billRateMinor: c.billRate,
      currency: c.billCurrency,
      endDate: c.endDate,
      observedHoursPerWeek: observed,
    }

    const perCustomer =
      assignmentsByCustomer.get(c.clientCompanyId) ?? new Map<string, RunningAssignment[]>()
    perCustomer.set(c.billCurrency, [...(perCustomer.get(c.billCurrency) ?? []), a])
    assignmentsByCustomer.set(c.clientCompanyId, perCustomer)
  }

  // ── Billing history, for the countback DSO ──────────────────────────
  //
  // `Invoice.issuedAt` is the day it was actually billed and it is what
  // the countback walks. It is nullable, because rows raised before the
  // column existed have no honest value and inventing one would corrupt
  // the very history this reads.
  //
  // Where it is null the end of the billed period stands in. That is the
  // closest honest proxy and it is not the same thing: a period ending
  // on the 31st and invoiced on the 6th is six days of ageing nobody was
  // counting, and it always errs in the flattering direction. So the
  // count of rows relying on the proxy is reported rather than left for
  // somebody to discover.
  const historyByCurrency = new Map<string, Map<string, number>>()
  const monthKeys: string[] = []
  for (let m = 0; m < HISTORY_MONTHS; m++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1))
    monthKeys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }

  let datedByProxy = 0
  for (const i of raw) {
    const d = i.issuedAt ?? i.periodEnd
    if (i.issuedAt == null) datedByProxy += 1
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    if (!monthKeys.includes(key)) continue
    const per = historyByCurrency.get(i.currency) ?? new Map<string, number>()
    per.set(key, (per.get(key) ?? 0) + fromPrismaDecimal(i.total, i.currency).minor)
    historyByCurrency.set(i.currency, per)
  }

  if (datedByProxy > 0) {
    gaps.push(
      `${datedByProxy} of ${raw.length} invoice${raw.length === 1 ? '' : 's'} carry no ` +
        `issued-at date, so the billing history behind DSO dates ${
          datedByProxy === 1 ? 'that one' : 'those'
        } by the end of the period covered instead. Close, not the same thing, and it ` +
        `always understates the age.`
    )
  }

  const daysInMonth = (key: string) => {
    const [y, m] = key.split('-').map(Number)
    return new Date(Date.UTC(y, m, 0)).getUTCDate()
  }

  // ── What has already been said ──────────────────────────────────────
  //
  // Without this the ladder climbs its top rung again every morning,
  // which is the failure the whole dunning file is written against. The
  // run of arrears is defined by the debt rather than the calendar: a
  // letter suppresses a rung only while an invoice it named is still
  // open, so a client who cleared and relapsed starts again at the
  // bottom.
  const openIds = openInvoiceIdsAcross(book)

  const sendRows = await prisma.dunningSend.findMany({
    where: { companyId },
    select: { clientCompanyId: true, step: true, sentAt: true, invoiceIds: true },
    orderBy: { sentAt: 'desc' },
    take: 5_000,
  })

  const sentByCustomer: Record<string, DunningStep[]> = stepsAlreadySent(
    sendRows as SentLetter[],
    openIds
  )

  const lastSentByCustomer = new Map<string, { step: string; sentAt: Date }>()
  for (const r of sendRows) {
    if (!lastSentByCustomer.has(r.clientCompanyId)) {
      lastSentByCustomer.set(r.clientCompanyId, { step: r.step, sentAt: r.sentAt })
    }
  }

  // ── What each customer is allowed to owe ────────────────────────────
  //
  // One limit per (us, them) pair. A limit set in another currency is not
  // applied to this book — `assess` refuses that comparison rather than
  // making it.
  const limitRows = await prisma.customerCreditLimit.findMany({
    where: { companyId },
    select: {
      clientCompanyId: true, limitCents: true, currency: true,
      basis: true, reviewBy: true, setAt: true,
      setBy: { select: { name: true } },
    },
  })

  const limitByCustomer = new Map<string, CreditLimit & { setByName: string | null; setAt: Date }>()
  for (const l of limitRows) {
    limitByCustomer.set(l.clientCompanyId, {
      limitMinor: l.limitCents,
      currency: l.currency,
      basis: l.basis,
      reviewBy: l.reviewBy,
      setByName: l.setBy?.name ?? null,
      setAt: l.setAt,
    })
  }

  const withoutLimit = book.byCurrency
    .flatMap((cb) => cb.customers.map((c) => c.customerId))
    .filter((id, i, all) => all.indexOf(id) === i)
    .filter((id) => !limitByCustomer.has(id)).length

  if (withoutLimit > 0) {
    gaps.push(
      `${withoutLimit} customer${withoutLimit === 1 ? '' : 's'} here ha${
        withoutLimit === 1 ? 's' : 've'
      } no credit limit set, so ${withoutLimit === 1 ? 'it reads' : 'they read'} as ` +
        `NO_LIMIT_SET. That is not the same as being within a limit and is never shown ` +
        `as a pass.`
    )
  }

  // Money in the bank that was never keyed against an invoice is not
  // reachable from here — every payment on this screen is found through
  // the invoice it belongs to. Said plainly rather than left to be
  // discovered when the bank balance and the ledger disagree.
  const orphanPayments = await prisma.payment.count({
    where: { invoiceId: null, receivedByCompanyId: companyId },
  })
  if (orphanPayments > 0) {
    gaps.push(
      `${orphanPayments} payment${orphanPayments === 1 ? '' : 's'} arrived and ` +
        `${orphanPayments === 1 ? 'was' : 'were'} never keyed against an invoice. ` +
        `${orphanPayments === 1 ? 'It is' : 'They are'} not in any figure on this screen — ` +
        `money you have and cannot count is a different problem from money you are owed, ` +
        `and the queue for placing it is not built yet.`
    )
  }

  const staleLimits = limitRows.filter((l) => l.reviewBy != null && l.reviewBy < now).length
  if (staleLimits > 0) {
    gaps.push(
      `${staleLimits} credit limit${staleLimits === 1 ? '' : 's'} ${
        staleLimits === 1 ? 'is' : 'are'
      } past the review date somebody set. Still applied — an out-of-date limit is not a ` +
        `removed one — but ${staleLimits === 1 ? 'it is a number' : 'they are numbers'} ` +
        `about ${staleLimits === 1 ? 'that client' : 'those clients'} as they were.`
    )
  }

  const currencies = book.byCurrency.map((cb) => decorate(cb))

  function decorate(cb: CurrencyBook) {
    const history: BillingPeriod[] = monthKeys.map((key) => ({
      label: key,
      days: daysInMonth(key),
      revenueMinor: historyByCurrency.get(cb.currency)?.get(key) ?? 0,
    }))

    const customers = cb.customers.map((c) => {
      const assignments = assignmentsByCustomer.get(c.customerId)?.get(cb.currency) ?? []
      const committed: Committed = committedOf(assignments, now)
      const unbilled =
        unbilledByCustomer == null
          ? null
          : unbilledByCustomer.get(c.customerId)?.get(cb.currency) ?? 0

      const exposure = exposureOf({
        customerId: c.customerId,
        customerName: c.customerName,
        currency: cb.currency,
        receivableMinor: c.outstandingMinor,
        unbilledMinor: unbilled,
        committed,
      })

      const held = limitByCustomer.get(c.customerId) ?? null
      const last = lastSentByCustomer.get(c.customerId) ?? null

      return {
        ...c,
        exposure,
        // A real limit where one is held, and NO_LIMIT_SET where none is
        // — reported as its own outcome rather than as a green tick.
        credit: assess(exposure, held, { now }),
        limitSetBy: held?.setByName ?? null,
        limitSetAt: held?.setAt ?? null,
        lastChased: last ? { step: last.step, sentAt: last.sentAt } : null,
        running: assignments.length,
      }
    })

    return {
      currency: cb.currency,
      outstandingMinor: cb.outstandingMinor,
      overdueMinor: cb.overdueMinor,
      buckets: cb.buckets,
      customers,
      invoices: cb.invoices.map((a) => ({
        id: a.id,
        number: a.number,
        currency: a.currency,
        customerId: a.customerId,
        customerName: a.customerName,
        billedVia: billedVia.get(a.id) ?? null,
        totalMinor: a.totalMinor,
        paidMinor: a.paidMinor,
        outstandingMinor: a.outstandingMinor,
        unappliedMinor: a.unappliedMinor,
        dueAt: a.dueAt,
        daysOverdue: a.daysOverdue,
        bucket: a.bucket,
        settlement: a.settlement,
        disputed: a.disputed,
        receiptsDisagree: a.receiptsDisagree,
        status: a.status,
        says: a.says,
      })),
      disputes: cb.disputes.map((a) => ({
        id: a.id, number: a.number, customerName: a.customerName,
        totalMinor: a.totalMinor, paidMinor: a.paidMinor,
        outstandingMinor: a.outstandingMinor, daysOverdue: a.daysOverdue, says: a.says,
      })),
      unapplied: cb.unapplied.map((a) => ({
        id: a.id, number: a.number, customerName: a.customerName,
        unappliedMinor: a.unappliedMinor, lastPaymentAt: a.lastPaymentAt, says: a.says,
      })),
      unappliedMinor: cb.unappliedMinor,
      unreconciled: cb.unreconciled.map((a) => ({
        id: a.id, number: a.number, customerName: a.customerName,
        paidMinor: a.paidMinor, receiptsMinor: a.receiptsMinor ?? null,
      })),
      dso: dso(cb.outstandingMinor, history),
      dunning: dunningRun(cb, sentByCustomer),
    }
  }

  return NextResponse.json({
    data: {
      asOf: now.toISOString(),
      source: 'INVOICES',
      currencies,
      gaps,
      note:
        'Aged from the due date, so a client on sixty-day terms is not shown as late on ' +
        'day forty-five. Part payments are chased for the balance and short payments are ' +
        'treated as a query for a person, never as arrears.',
    },
  })
}
