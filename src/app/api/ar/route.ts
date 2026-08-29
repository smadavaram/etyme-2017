import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { fromPrismaDecimal, minorPerUnit } from '@/lib/money'
import {
  ageBook, dso, dunningRun,
  type ArInvoice, type BillingPeriod, type CurrencyBook,
} from '@/lib/ar-ageing'
import {
  committedOf, exposureOf, assess,
  type RunningAssignment, type Committed,
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
 *   **Nothing records a dunning send.** The ladder returns what WOULD go
 *   out today. There is no table saying what already went, so the run
 *   cannot suppress a rung it has already climbed. Until there is, this
 *   is a screen to read, not a job to run.
 *
 *   **No credit limit exists to check against.** Nothing in the schema
 *   holds one, so every customer comes back NO_LIMIT_SET — which is
 *   reported as its own state, never as a pass.
 *
 *   **A receipt that matches no invoice cannot be seen.**
 *   `Payment.invoiceId` is required, so a payment that arrived at the
 *   bank and was never keyed against anything is invisible here. What IS
 *   visible is money received against an invoice beyond its total, and
 *   receipts that disagree with the invoice header — both of which are
 *   unapplied cash by another route.
 */

/** Months of billing history the countback DSO is allowed to walk. */
const HISTORY_MONTHS = 12

/** How far back observed weekly hours are averaged. Twelve weeks. */
const OBSERVED_WINDOW_DAYS = 84

/** Nothing owed on these, and nothing to chase. */
const NOT_RECEIVABLE = ['DRAFT', 'CANCELLED', 'VOID']

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
  const raw = await prisma.invoice.findMany({
    where: {
      engagement: { msa: { vendorId: companyId } },
      status: { notIn: NOT_RECEIVABLE },
    },
    select: {
      id: true, number: true, currency: true, total: true, paid: true,
      dueAt: true, status: true, periodStart: true, periodEnd: true,
      payments: { select: { amount: true, receivedAt: true } },
      billTo: { select: { id: true, name: true } },
      engagement: {
        select: {
          title: true,
          msa: { select: { client: { select: { id: true, name: true } }, paymentTerms: true } },
        },
      },
    },
    orderBy: { dueAt: 'asc' },
    take: 5_000,
  })

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

  // Exposure is to the CLIENT, not to whichever entity of theirs the
  // invoice happens to be posted to. A large client signs in one entity
  // and is billed through a shared services centre in another; if they
  // stop paying, both stop. So the bill-to travels with the invoice as a
  // label and the client is the key everything rolls up on — which also
  // keeps the receivable, the unbilled work and the running contracts on
  // one identifier instead of three.
  const invoices: ArInvoice[] = raw.map((i) => {
    const per = minorPerUnit(i.currency)
    const receipts = i.payments.reduce(
      (n, p) => n + Math.round(parseFloat(p.amount.toString()) * per),
      0
    )
    const lastAt = i.payments.reduce<Date | null>(
      (d, p) => (d == null || p.receivedAt > d ? p.receivedAt : d),
      null
    )
    return {
      id: i.id,
      number: i.number,
      currency: i.currency,
      totalMinor: fromPrismaDecimal(i.total, i.currency).minor,
      paidMinor: fromPrismaDecimal(i.paid, i.currency).minor,
      dueAt: i.dueAt,
      customerId: i.engagement.msa.client.id,
      customerName: i.engagement.msa.client.name,
      status: i.status,
      receiptsMinor: receipts,
      lastPaymentAt: lastAt,
    }
  })

  const billedVia = new Map(
    raw.filter((i) => i.billTo && i.billTo.id !== i.engagement.msa.client.id)
      .map((i) => [i.id, i.billTo!.name])
  )

  const book = ageBook(invoices, now)

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
  // `Invoice` carries no raised-at column, so the end of the period it
  // bills is used as the billing date. It is the closest honest proxy —
  // an invoice for July is billing raised at the end of July — and it is
  // said here rather than assumed silently.
  gaps.push(
    'Invoices carry no raised-at date, so the billing history behind DSO is dated by the ' +
      'end of the period each invoice covers. Close, and not the same thing.'
  )

  const historyByCurrency = new Map<string, Map<string, number>>()
  const monthKeys: string[] = []
  for (let m = 0; m < HISTORY_MONTHS; m++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1))
    monthKeys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }

  for (const i of raw) {
    const d = i.periodEnd
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    if (!monthKeys.includes(key)) continue
    const per = historyByCurrency.get(i.currency) ?? new Map<string, number>()
    per.set(key, (per.get(key) ?? 0) + fromPrismaDecimal(i.total, i.currency).minor)
    historyByCurrency.set(i.currency, per)
  }

  const daysInMonth = (key: string) => {
    const [y, m] = key.split('-').map(Number)
    return new Date(Date.UTC(y, m, 0)).getUTCDate()
  }

  // Nothing anywhere records that a reminder was sent, so the ladder is
  // advisory. Said plainly rather than left for a reader to discover when
  // the same customer is chased twice.
  gaps.push(
    'Nothing records that a reminder was sent, so the ladder below shows what WOULD go out ' +
      'today. It cannot yet suppress a rung it has already climbed.'
  )
  gaps.push(
    'No credit limit is held anywhere, so every customer reads as NO_LIMIT_SET. That is ' +
      'not the same as being within a limit and is never shown as a pass.'
  )

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

      return {
        ...c,
        exposure,
        // Null limit until somewhere holds one. Reported as its own
        // outcome rather than as a green tick.
        credit: assess(exposure, null),
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
      dunning: dunningRun(cb, {}),
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
