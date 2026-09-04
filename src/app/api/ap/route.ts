import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { fromPrismaDecimal } from '@/lib/money'
import { dso, ROUNDING_TOLERANCE_MINOR, type BillingPeriod } from '@/lib/ar-ageing'
import {
  hopDelay, summariseHops, chainFloat, chainBlindSpot, beyondLastParty,
  payWhenPaidFlags, dpo, mirror,
  type Hop, type Chain, type PurchasePeriod,
} from '@/lib/ap-delay'
import { loadBook } from '../ar/book'

/**
 * GET /api/ap — how long money takes to travel, and who is paying for the wait.
 *
 * ── The thing this exists to show ────────────────────────────────────
 *
 * A client pays the prime at day 75 against sixty-day terms. The prime's
 * terms with the sub are net 45 from receipt of client funds, so the sub
 * is paid at day 120. The sub pays the bench vendor net 30 from receipt:
 * day 150. The bench vendor pays the consultant on the 15th, because a
 * person has rent.
 *
 * The consultant is paid on day 15 for work funded on day 150, and the
 * bench vendor — the smallest firm in the chain — finances 135 days of
 * it out of its own facility.
 *
 * Every party in that chain sees its own hop and nothing else, which is
 * why nobody measures it. This route lays the hops we hold end to end.
 *
 * ── Three figures and one comparison ─────────────────────────────────
 *
 * **Per-hop delay**, both directions. Agreed against actual: what we
 * were promised and what happened, on money coming in and money going
 * out. `VendorBill` carries three separate dates — received, due, paid —
 * which is the whole reason the AP side is measurable at all.
 *
 * **Chain float.** For each supplier bill we can tie back to the client
 * invoice that funds it, the gap between paying out and being paid in.
 * That is the number nobody has.
 *
 * **Days payable outstanding**, ours, computed by the same countback the
 * DSO uses — because the textbook ratio moves when buying grows and
 * nothing about payment behaviour has changed.
 *
 * And the comparison that makes them mean something: DSO beside DPO. If
 * we are paid in 68 days and pay in 30, we fund 38 days of every
 * assignment. If it is the other way round, we are doing to our
 * suppliers exactly what our clients are doing to us.
 *
 * ── Where the guarantee stops ────────────────────────────────────────
 *
 * We see our own hops. A supplier who is not on the platform pays
 * somebody we cannot see, on a date we do not hold — and since the wait
 * travels downwards and lands on whoever is smallest, the party actually
 * carrying the float is usually further down than the last one visible.
 * `beyondLastParty` says so on every chain rather than letting a
 * two-hop view read as the whole picture.
 *
 * ── Units ────────────────────────────────────────────────────────────
 *
 * Minor units on the wire. `VendorBill.totalCents` and `paidCents` are
 * already integers; `Invoice.total` and `Payment.amount` are Prisma
 * Decimals in whole currency and are converted here at the edge.
 */

/** Months of history the countbacks are allowed to walk. */
const HISTORY_MONTHS = 12

/** Nothing owed on these. */
const NOT_PAYABLE = ['CANCELLED', 'VOID']

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'What we owe and when we pay it')
  if (notStaff) return notStaff

  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Payables belong to a company' } },
      { status: 403 }
    )
  }

  // The same gate as the AR screen and the profitability route. What a
  // firm owes, and how long it holds money before paying, is the same
  // class of fact as what a placement earns.
  if (
    !caller.permissions.includes('margin.read') &&
    !caller.permissions.includes('pnl.read')
  ) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message:
            'You cannot see what the firm owes its suppliers or how long it takes to pay ' +
            'them. A recruiter role deliberately does not.',
        },
      },
      { status: 403 }
    )
  }

  const companyId = caller.company.id
  const usName = caller.company.name
  const now = new Date()
  const gaps: string[] = []

  // ── What we owe ─────────────────────────────────────────────────────
  const bills = await prisma.vendorBill.findMany({
    where: { companyId, status: { notIn: NOT_PAYABLE } },
    select: {
      id: true, number: true, currency: true, totalCents: true, paidCents: true,
      receivedAt: true, dueAt: true, paidAt: true, status: true, payWhenPaid: true,
      periodStart: true, periodEnd: true,
      vendorCompany: { select: { id: true, name: true, claimedAt: true } },
      buyContract: {
        select: {
          id: true, contractType: true,
          sellLinks: { select: { sellContractId: true } },
        },
      },
    },
    orderBy: { dueAt: 'asc' },
    take: 5_000,
  })

  if (bills.length === 0) {
    return NextResponse.json({
      data: {
        asOf: now.toISOString(),
        source: 'NONE',
        us: usName,
        gaps,
        note:
          'No supplier bills have been recorded, so there is nothing to measure on the way ' +
          'out. This screen fills as bills from sub-vendors are entered against their ' +
          'contracts. Until then the only half of the chain visible is what clients owe us, ' +
          'which is on Money owed to us.',
      },
    })
  }

  const outHops: Hop[] = bills.map((b) => ({
    id: b.id,
    side: 'OUT',
    payerName: usName,
    payeeName: b.vendorCompany.name,
    currency: b.currency,
    amountMinor: b.totalCents,
    termsDays: Math.round((b.dueAt.getTime() - b.receivedAt.getTime()) / 86_400_000),
    // A bill's clock starts when it arrived. Where the obligation is
    // conditional on the client paying us first, the terms are not really
    // days at all — they are a promise to pass money along.
    termsFrom: b.payWhenPaid ? 'RECEIPT_OF_FUNDS' : 'BILL_DATE',
    raisedAt: b.receivedAt,
    dueAt: b.dueAt,
    settledAt: b.paidAt,
    payWhenPaid: b.payWhenPaid,
    // A vendor bill is by definition from a company. Where a person is
    // paid it goes through payroll, which is a different record and a
    // different route.
    payeeIsAPerson: false,
  }))

  // ── What is owed to us ──────────────────────────────────────────────
  //
  // Read through the same loader the AR screen uses, so the two screens
  // cannot disagree about which invoices are open or how old they are.
  const { raw: receivables, book } = await loadBook(companyId, now)

  let arDatedByProxy = 0
  const inHops: Hop[] = receivables.map((i) => {
    const totalMinor = fromPrismaDecimal(i.total, i.currency).minor
    const paidMinor = fromPrismaDecimal(i.paid, i.currency).minor
    const lastPaymentAt = i.payments.reduce<Date | null>(
      (d, p) => (d == null || p.receivedAt > d ? p.receivedAt : d),
      null
    )
    if (i.issuedAt == null) arDatedByProxy += 1

    return {
      id: i.id,
      side: 'IN' as const,
      payerName: i.engagement.msa.client.name,
      payeeName: usName,
      currency: i.currency,
      amountMinor: totalMinor,
      termsDays: i.engagement.msa.paymentTerms ?? null,
      termsFrom: (i.issuedAt ? 'BILL_DATE' : 'PERIOD_END') as Hop['termsFrom'],
      // The day it was actually billed, where that is held. Falling back
      // to the end of the period covered, which always understates the
      // age — so the count is reported rather than buried.
      raisedAt: i.issuedAt ?? i.periodEnd,
      dueAt: i.dueAt,
      // A hop is settled when the money is all there. A part payment has
      // not closed the obligation and must not be counted as if it had:
      // that would report the day the FIRST instalment landed as the day
      // the invoice was paid, which flatters every figure downstream.
      // ROUNDING_TOLERANCE_MINOR is deliberately currency-independent:
      // what it measures is a person's patience with a 40p residual, and
      // that does not vary by exponent.
      settledAt: totalMinor - paidMinor <= ROUNDING_TOLERANCE_MINOR ? lastPaymentAt : null,
      payWhenPaid: false,
      payeeIsAPerson: false,
    }
  })

  if (arDatedByProxy > 0) {
    gaps.push(
      `${arDatedByProxy} of ${receivables.length} invoice${receivables.length === 1 ? '' : 's'} ` +
        `carry no issued-at date, so the incoming hops date ${
          arDatedByProxy === 1 ? 'that one' : 'those'
        } by the end of the period billed. That always understates how long the client took.`
    )
  }

  const allHops = [...inHops, ...outHops]
  const delays = allHops.map((h) => hopDelay(h, now))

  // ── One book per currency ───────────────────────────────────────────
  const currencies = Array.from(new Set(allHops.map((h) => h.currency.toUpperCase()))).sort()

  const monthKeys: string[] = []
  for (let m = 0; m < HISTORY_MONTHS; m++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1))
    monthKeys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  const monthKeyOf = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  const daysInMonth = (key: string) => {
    const [y, m] = key.split('-').map(Number)
    return new Date(Date.UTC(y, m, 0)).getUTCDate()
  }

  const books = currencies.map((ccy) => {
    const theirBills = bills.filter((b) => b.currency.toUpperCase() === ccy)
    const theirDelays = delays.filter((d) => d.currency.toUpperCase() === ccy)

    // Payables: what has been billed to us and not yet paid.
    const payableMinor = theirBills.reduce(
      (n, b) => n + Math.max(0, b.totalCents - b.paidCents),
      0
    )
    const overdueMinor = theirBills
      .filter((b) => b.paidAt == null && b.dueAt < now)
      .reduce((n, b) => n + Math.max(0, b.totalCents - b.paidCents), 0)

    // Purchases: what suppliers billed us, dated by the day the bill
    // arrived. Newest month first, the way the countback walks.
    const purchasesByMonth = new Map<string, number>()
    for (const b of theirBills) {
      const key = monthKeyOf(b.receivedAt)
      purchasesByMonth.set(key, (purchasesByMonth.get(key) ?? 0) + b.totalCents)
    }
    const purchasePeriods: PurchasePeriod[] = monthKeys.map((key) => ({
      label: key,
      days: daysInMonth(key),
      purchasesMinor: purchasesByMonth.get(key) ?? 0,
    }))

    const ourDpo = dpo(payableMinor, purchasePeriods)

    // The receivable side of the same currency, so the two numbers can
    // be put beside each other.
    const cb = book.byCurrency.find((c) => c.currency === ccy) ?? null
    const revenueByMonth = new Map<string, number>()
    for (const i of receivables) {
      if (i.currency.toUpperCase() !== ccy) continue
      const key = monthKeyOf(i.issuedAt ?? i.periodEnd)
      revenueByMonth.set(
        key,
        (revenueByMonth.get(key) ?? 0) + fromPrismaDecimal(i.total, i.currency).minor
      )
    }
    const billingPeriods: BillingPeriod[] = monthKeys.map((key) => ({
      label: key,
      days: daysInMonth(key),
      revenueMinor: revenueByMonth.get(key) ?? 0,
    }))
    const ourDso = cb ? dso(cb.outstandingMinor, billingPeriods) : null

    return {
      currency: ccy,
      payableMinor,
      overdueMinor,
      billCount: theirBills.length,
      receivableMinor: cb?.outstandingMinor ?? null,
      dpo: ourDpo,
      dso: ourDso,
      mirror: mirror(ourDso?.days ?? null, ourDpo.days),
      out: summariseHops(theirDelays, 'OUT'),
      in: summariseHops(theirDelays, 'IN'),
    }
  })

  // ── Pay when paid ───────────────────────────────────────────────────
  const flags = payWhenPaidFlags(allHops, now)

  // ── Chains ──────────────────────────────────────────────────────────
  //
  // A supplier bill is tied to the client invoice that funds it through
  // the contract link: bill → buy contract → sell contract → invoice
  // covering an overlapping period.
  //
  // The period overlap is a match, not a fact. Two bills against one
  // contract in the same month cannot be told apart, so where more than
  // one invoice overlaps the largest is taken and the chain says the
  // pairing was inferred. It is named rather than hidden, because a
  // float figure resting on a wrong pairing is exactly the kind of
  // plausible number nobody audits.
  const sellContractIds = Array.from(
    new Set(bills.flatMap((b) => b.buyContract?.sellLinks.map((l) => l.sellContractId) ?? []))
  )

  const sellInvoices =
    sellContractIds.length === 0
      ? []
      : await prisma.invoice.findMany({
          where: {
            invoiceLines: { some: { sellContractId: { in: sellContractIds } } },
            status: { notIn: ['DRAFT', 'CANCELLED', 'VOID'] },
          },
          select: {
            id: true, number: true, currency: true, total: true, paid: true,
            periodStart: true, periodEnd: true, issuedAt: true, dueAt: true,
            payments: { select: { amount: true, receivedAt: true } },
            invoiceLines: { select: { sellContractId: true } },
            engagement: {
              select: { msa: { select: { client: { select: { name: true } }, paymentTerms: true } } },
            },
          },
          take: 2_000,
        })

  const chains = bills
    .filter((b) => b.paidAt != null || b.buyContract != null)
    .map((b) => {
      const linkedSellIds = b.buyContract?.sellLinks.map((l) => l.sellContractId) ?? []
      if (linkedSellIds.length === 0) return null

      const candidates = sellInvoices.filter(
        (inv) =>
          inv.invoiceLines.some((l) => l.sellContractId && linkedSellIds.includes(l.sellContractId)) &&
          inv.currency.toUpperCase() === b.currency.toUpperCase() &&
          overlaps(b.periodStart, b.periodEnd, inv.periodStart, inv.periodEnd)
      )
      if (candidates.length === 0) return null

      const inv = candidates.reduce((a, c) =>
        fromPrismaDecimal(c.total, c.currency).minor > fromPrismaDecimal(a.total, a.currency).minor ? c : a
      )

      const invTotal = fromPrismaDecimal(inv.total, inv.currency).minor
      const invPaid = fromPrismaDecimal(inv.paid, inv.currency).minor
      const lastPaymentAt = inv.payments.reduce<Date | null>(
        (d, p) => (d == null || p.receivedAt > d ? p.receivedAt : d),
        null
      )
      const clientPaidAt = invTotal - invPaid <= ROUNDING_TOLERANCE_MINOR ? lastPaymentAt : null

      const chain: Chain = {
        // The work is done by the end of the period billed. Every count
        // in the chain runs from there.
        workedAt: inv.periodEnd,
        steps: [
          {
            payerName: inv.engagement.msa.client.name,
            payeeName: usName,
            currency: inv.currency.toUpperCase(),
            amountMinor: invTotal,
            paidAt: clientPaidAt,
            termsDays: inv.engagement.msa.paymentTerms ?? null,
            termsFrom: inv.issuedAt ? 'BILL_DATE' : 'PERIOD_END',
            payWhenPaid: false,
            observed: true,
            payeeIsAPerson: false,
          },
          {
            payerName: usName,
            payeeName: b.vendorCompany.name,
            currency: b.currency.toUpperCase(),
            amountMinor: b.totalCents,
            paidAt: b.paidAt,
            termsDays: Math.round((b.dueAt.getTime() - b.receivedAt.getTime()) / 86_400_000),
            termsFrom: b.payWhenPaid ? 'RECEIPT_OF_FUNDS' : 'BILL_DATE',
            payWhenPaid: b.payWhenPaid,
            observed: true,
            payeeIsAPerson: false,
          },
        ],
      }

      return {
        billId: b.id,
        billNumber: b.number,
        invoiceNumber: inv.number,
        vendorName: b.vendorCompany.name,
        clientName: inv.engagement.msa.client.name,
        pairingInferred: candidates.length > 1,
        pairingSays:
          candidates.length > 1
            ? `${candidates.length} client invoices overlap this bill's period, so the ` +
              `largest was taken. The pairing is inferred and the float below rests on it.`
            : 'One client invoice covers this bill\'s period, so the pairing is unambiguous.',
        float: chainFloat(chain),
        blindSpot: chainBlindSpot(chain),
        beyond: beyondLastParty(b.vendorCompany.name, b.vendorCompany.claimedAt != null),
      }
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)

  const unlinked = bills.filter((b) => (b.buyContract?.sellLinks.length ?? 0) === 0).length
  if (unlinked > 0) {
    gaps.push(
      `${unlinked} supplier bill${unlinked === 1 ? '' : 's'} cannot be tied to the client ` +
        `invoice that funds ${unlinked === 1 ? 'it' : 'them'}, so ${
          unlinked === 1 ? 'it has' : 'they have'
        } no chain. A bill with no buy contract, or a buy contract with no linked sell ` +
        `contract, is a cost with no revenue beside it — which is also why it cannot be ` +
        `included in any float figure.`
    )
  }

  const offPlatform = Array.from(
    new Set(
      bills.filter((b) => b.vendorCompany.claimedAt == null).map((b) => b.vendorCompany.name)
    )
  )
  if (offPlatform.length > 0) {
    gaps.push(
      `${offPlatform.length} supplier${offPlatform.length === 1 ? '' : 's'} ` +
        `(${offPlatform.slice(0, 4).join(', ')}${offPlatform.length > 4 ? ', …' : ''}) ` +
        `${offPlatform.length === 1 ? 'is' : 'are'} not on the platform. What ` +
        `${offPlatform.length === 1 ? 'they pay' : 'each pays'} onwards, and when, is ` +
        `outside anything we hold — and the party actually carrying the float is usually ` +
        `further down than the last one visible.`
    )
  }

  return NextResponse.json({
    data: {
      asOf: now.toISOString(),
      source: 'BILLS_AND_INVOICES',
      us: usName,
      currencies: books,
      hops: delays.map((d) => ({
        id: d.hopId,
        side: d.side,
        payerName: d.payerName,
        payeeName: d.payeeName,
        currency: d.currency,
        amountMinor: d.amountMinor,
        state: d.state,
        agreedDays: d.agreedDays,
        actualDays: d.actualDays,
        lateDays: d.lateDays,
        elapsedDays: d.elapsedDays,
        overdueDays: d.overdueDays,
        payWhenPaid: d.payWhenPaid,
        says: d.says,
      })),
      payWhenPaid: flags,
      chains,
      gaps,
      note:
        'Late is actual against agreed. Float is one party\'s cash out against its cash in — ' +
        'a firm can be perfectly on time on every hop and still fund four months of ' +
        'somebody else\'s work. Only the second one explains a working-capital problem, and ' +
        'only laying the hops end to end produces it.',
    },
  })
}

/**
 * Do two periods overlap?
 *
 * A bill with no period on it overlaps nothing — it is not matched to a
 * client invoice by guesswork, because a float figure resting on a wrong
 * pairing looks exactly as reasonable as one resting on a right pairing.
 */
function overlaps(
  aStart: Date | null,
  aEnd: Date | null,
  bStart: Date,
  bEnd: Date
): boolean {
  if (aStart == null || aEnd == null) return false
  return aStart <= bEnd && bStart <= aEnd
}
