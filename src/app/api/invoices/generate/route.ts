import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { completeCycle } from '@/lib/cycle-complete'
import { billableNow, expenseLine, expenseTotal } from '@/lib/expense-billing'
import { emit } from '@/lib/events'
import { periodFor, billableInPeriod, bandsOf, type Terms } from '@/lib/periods'
import {
  partnerFunctions, mayConsolidate, selfBilling, taxFor, dueOn, resolveBillingTerms,
  type Place, type Party,
} from '@/lib/billing-cascade'
import { minorPerUnit } from '@/lib/money'
import { whereHoursLive } from '@/lib/work-chain'
import { ladderFor } from '@/lib/work-chain-read'
import { policyOf, type Decision } from '@/lib/overtime'
import { ORDER_HEADER_SELECT, periodTermsFor, termsFor } from '@/lib/money/order-terms'
import { partiesOf } from '@/lib/money/invoice-parties'

/**
 * POST /api/invoices/generate
 *
 * BUILD.md §3: "from approved, uninvoiced timesheets"
 *
 * LEGACY_RULES.md §4:
 *   - Invoice numbering: IN_{contract_number}_{sequential_three_digit_padded}
 *   - total_amount = (total_time_in_seconds / 3600) × contract rate
 *   - Guard: cannot generate if time <= 0 or rate <= 0
 *   - Due date: periodEnd + paymentTerms days
 *
 * Groups approved timesheets by engagement, calculates line items per
 * sell contract, then creates one Invoice per engagement covering the period.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!hasPermission(caller.permissions, 'invoices.issue')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Requires invoices.issue permission' } },
      { status: 403 }
    )
  }

  const body = await request.json()
  const { engagementId, periodStart, periodEnd } = body

  if (!engagementId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'engagementId is required', field: 'engagementId' } },
      { status: 422 }
    )
  }

  // Verify engagement and get payment terms
  const engagement = await prisma.engagement.findUnique({
    where: { id: engagementId },
    include: {
      msa: {
        include: {
          vendor: { select: { id: true, name: true } },
          client: { select: { id: true, name: true } },
        },
      },
      // The order the work was authorized under, where no agreement
      // sits above it. One document per buyer-and-seller pair, so the
      // engagement's own orders name the same two firms its lines do.
      workOrders: {
        select: {
          number: true,
          issuedById: true, issuedToId: true,
          issuedBy: { select: { id: true, name: true } },
          issuedTo: { select: { id: true, name: true } },
          paymentTerms: true,
        },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
      sellContracts: {
        where: { state: 'IN_PROGRESS' },
        include: {
          person: { select: { id: true, name: true } },
          // ── Who is who on the invoice ──────────────────────────────
          //
          // A large client signs in one entity, is billed through a
          // shared services center in another, and has the work done at a
          // third site. `Invoice` has carried soldTo, billTo, shipTo and
          // payer columns since it was written and nothing filled them,
          // so every invoice went to whoever the agreement named — which
          // is how an invoice reaches the wrong address and ages ninety
          // days before anybody notices.
          clientCompany: { select: { id: true, name: true } },
          endClientCompany: { select: { id: true, name: true } },
          workLocation: {
            select: { id: true, name: true, country: true, state: true, companyId: true },
          },
          // The document this line is on. A purchase order is a header
          // and its lines, and the rhythm and the net days are the
          // header's — `lib/money/order-terms` decides which copy wins.
          workOrder: { select: ORDER_HEADER_SELECT },
        },
      },
    },
  })

  if (!engagement) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Engagement not found' } },
      { status: 404 }
    )
  }

  // Only the supplier bills under this engagement. The permission check
  // above says the caller may issue invoices at their own company; it
  // says nothing about whose engagement this is, and an engagement id is
  // not a secret. Without this, a firm could raise an invoice in another
  // supplier's name, addressed to that supplier's client.
  //
  // Who this engagement is between. The agreement where there is one;
  // the order it was authorized under where there is not; and the lines
  // under it where there is neither — a firm recording its own book has
  // all three eventually and may have only the last today.
  const parties = partiesOf({
    agreement: engagement.msa,
    order: engagement.workOrders[0] ?? null,
    lines: engagement.sellContracts,
  })

  const { vendor: billedBy_, client: billedTo } = parties
  if (!billedBy_ || !billedTo || billedBy_.id !== caller.company!.id) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_THE_SUPPLIER',
          message: billedBy_
            ? `This engagement is ${billedBy_.name ?? 'another firm'}'s to bill, not ${caller.company!.name}'s.`
            : `Nothing says who this engagement is between, so nobody can bill under it. ${parties.says}`,
        },
      },
      { status: 403 }
    )
  }

  if (engagement.sellContracts.length === 0) {
    return NextResponse.json(
      { error: { code: 'NO_CONTRACTS', message: 'No active sell contracts under this engagement' } },
      { status: 422 }
    )
  }

  // ── Which hours does each of our contracts bill? ────────────────────
  //
  // Not necessarily its own. Hours are filed once, against the contract
  // of the firm that actually employs the person, and everybody above
  // bills the same week at their own rate. A prime's own contract
  // therefore has no timesheets on it and never will — which used to
  // mean a prime could pay its sub and had nothing to invoice its client
  // from, so the money chain stopped one hop short of the person paying
  // for the work.
  //
  // The ladder descends from our contracts to the ones carrying the
  // hours. On a direct placement it descends nowhere and this is the
  // identity, which is the ordinary case and stays the ordinary case.
  const ownIds = engagement.sellContracts.map((sc) => sc.id)
  const rungs = await ladderFor(ownIds)

  /** Where the hours are → which of our contracts bills them. */
  const billedBy = new Map<string, string>()
  for (const own of ownIds) billedBy.set(whereHoursLive(own, rungs), own)
  const contractIds = [...billedBy.keys()]

  const timesheetWhere: any = {
    sellContractId: { in: contractIds },
    // A live client approval in the ledger, not a column. The column
    // held one answer; a chain has one per leg, and billing follows the
    // end client's — a prime may invoice as soon as they have signed,
    // without waiting on the sub to settle what it owes its own
    // employee.
    assertions: {
      some: { role: 'CLIENT_APPROVAL', state: 'LIVE' },
    },
    // Not yet billed *by us*. A line exists per contract rather than per
    // timesheet, because one week in a chain is legitimately billed at
    // each hop — the sub to the prime at its rate, the prime to the
    // client at its own. So the question is not whether anybody has
    // billed these hours; it is whether we have.
    invoiceLines: { none: { sellContractId: { in: ownIds } } },
  }

  // Anything that *overlaps* the requested window, not only what sits
  // wholly inside it.
  //
  // A week running 27 July to 2 August has four days that belong to July,
  // and `periodEnd <= 31 July` excluded it entirely — so a month billed
  // from weekly timesheets quietly lost its first few days every time.
  if (periodStart) {
    timesheetWhere.periodEnd = { gte: new Date(periodStart) }
  }
  if (periodEnd) {
    timesheetWhere.periodStart = { lte: new Date(periodEnd) }
  }

  const timesheets = await prisma.timesheet.findMany({
    where: timesheetWhere,
    include: {
      person: { select: { id: true, name: true } },
      // What somebody decided about each week that went over the line.
      // The invoice prices from these and from nothing else: a contract
      // multiplier says what an overtime hour COULD be worth, never what
      // this week's was, and a week nobody has answered is not billable
      // at any price.
      overtimeDecisions: true,
      sellContract: {
        select: {
          id: true, billRate: true, billCurrency: true, workOrderId: true,
          overtimeAfterHours: true, overtimeMultiplierBps: true,
          startDate: true,
          // The contract says what a period is — unless it is on an
          // order, and then the order does. Both are selected and
          // `lib/money/order-terms` picks; these three are never read
          // directly.
          billFrequency: true, billAnchor: true, billStraddle: true,
          workOrder: { select: ORDER_HEADER_SELECT },
        },
      },
    },
    orderBy: { periodStart: 'asc' },
  })

  // Read through our own contract from here on.
  //
  // The hours are the sub's; the rate, the currency, the billing period
  // and the purchase order are ours. Everything below this line groups
  // and prices by `sellContract`, so doing the substitution once here —
  // rather than in six places — is what keeps a prime from accidentally
  // invoicing its client at its sub's rate.
  const ourContract = new Map(engagement.sellContracts.map((sc) => [sc.id, sc]))
  const billing = timesheets.map((ts) => {
    const ours = ourContract.get(billedBy.get(ts.sellContractId) ?? ts.sellContractId)
    if (!ours) return ts
    return {
      ...ts,
      sellContractId: ours.id,
      sellContract: {
        id: ours.id,
        billRate: ours.billRate,
        billCurrency: ours.billCurrency,
        workOrderId: ours.workOrderId,
        // From the contract being billed, never the one underneath it.
        // A prime's overtime terms with its client are its own; reading
        // the sub's here would bill the client on somebody else's
        // agreement, the same way reading the sub's rate would.
        overtimeAfterHours: ours.overtimeAfterHours,
        overtimeMultiplierBps: ours.overtimeMultiplierBps,
        startDate: ours.startDate,
        billFrequency: ours.billFrequency,
        billAnchor: ours.billAnchor,
        billStraddle: ours.billStraddle,
        // And the document our contract is on, never the sub's. The
        // period a prime bills its client is the period on the prime's
        // own purchase order.
        workOrder: ours.workOrder,
      },
    }
  })

  // ── Expenses that ride on this invoice ──────────────────────────────
  //
  // Approved, client-billable, not yet on an invoice, on our own
  // contracts. They become lines of their own with the expense behind
  // them (src/lib/expense-billing.ts). An invoice may carry only expenses
  // — a month with no hours and one flight is still a month to bill.
  const expenseRows = await prisma.expense.findMany({
    where: {
      sellContractId: { in: ownIds },
      status: 'APPROVED', billable: true, invoiceId: null,
      ...(periodStart ? { periodEnd: { gte: new Date(periodStart) } } : {}),
      ...(periodEnd ? { periodStart: { lte: new Date(periodEnd) } } : {}),
    },
    include: {
      person: { select: { name: true } },
      sellContract: {
        select: {
          id: true, billCurrency: true, startDate: true,
          billFrequency: true, billAnchor: true, billStraddle: true,
          workOrder: { select: ORDER_HEADER_SELECT },
        },
      },
    },
    orderBy: { periodEnd: 'asc' },
  })

  // ── Milestones accepted under this engagement's orders ──────────────
  //
  // A fixed sum the client has accepted, on a work order for this
  // engagement, not yet billed. No person and no contract behind it —
  // the acceptance is the receipt.
  const milestones = await prisma.orderMilestone.findMany({
    where: { status: 'ACCEPTED', order: { engagementId, issuedToId: caller.company!.id } },
    include: { order: { select: { id: true, number: true, title: true } } },
    orderBy: { acceptedAt: 'asc' },
  })

  if (timesheets.length === 0 && expenseRows.length === 0 && milestones.length === 0) {
    return NextResponse.json(
      { error: { code: 'NO_TIMESHEETS', message: 'No approved uninvoiced timesheets found for this engagement and period' } },
      { status: 422 }
    )
  }

  // Build line items grouped by sell contract (person)
  //
  // In cents, added up as integers and divided into whole currency once
  // at the end. Adding fractions of a dollar and rounding at the bottom
  // is how a header disagrees with its own lines by a cent.
  const linesByContract = new Map<string, {
    sellContractId: string
    personId: string
    personName: string
    billRate: number
    currency: string
    totalHours: number
    overtimeHours: number
    /** Over the line and undecided. Not billed, and said out loud. */
    pendingHours: number
    amountCents: number
    timesheetIds: string[]
    periodEnd: Date
  }>()

  // ── The period the contract bills ───────────────────────────────────
  //
  // Taken from the contract, not from the timesheets. Four weekly sheets
  // ending on the 3rd, 10th, 17th and 24th of August used to produce an
  // invoice for "28 July to 24 August" — a period in no contract, matching
  // no purchase order window, and reconciling against nothing the client
  // holds.
  //
  // Which period: the one containing the date asked for, or the one
  // containing the most recent work when nobody asked.
  // The contract whose terms shape the period: the first with hours, or,
  // on an expenses-only invoice, the first expense's own contract.
  const anchorContract =
    billing[0]?.sellContract ??
    expenseRows[0]?.sellContract ??
    (await prisma.sellContract.findFirstOrThrow({
      where: { engagementId },
      select: {
        id: true, billCurrency: true, startDate: true,
        billFrequency: true, billAnchor: true, billStraddle: true,
        workOrder: { select: ORDER_HEADER_SELECT },
      },
    }))
  // The document first, the line where there is no document. The line's
  // own start date either way — an order is not a person, and a header
  // covering five people starts before four of them do.
  const terms: Terms = periodTermsFor('SELL', anchorContract)

  const latestWork = [...billing.map((t) => t.periodEnd), ...expenseRows.map((e) => e.periodEnd), ...milestones.map((m) => m.acceptedAt ?? new Date())]
    .reduce((latest, d) => (d > latest ? d : latest))
  const askedAbout = periodStart ? new Date(periodStart) : latestWork

  const period = periodFor(askedAbout, terms)

  /**
   * What each timesheet is worth to this invoice, priced once and read
   * twice — once into the person's grouped line, once into the
   * `InvoiceLine` row the three-way match reads. They were computed two
   * different ways before, so a premium reached the header and never the
   * lines, and the match failed its own addition on every invoice that
   * carried one.
   */
  const priced = new Map<string, { hours: number; cents: number; working: string | null }>()

  /**
   * Decisions whose hours reach this invoice. A decision that has been
   * billed is history and cannot be changed afterwards — `mayChange` in
   * lib/overtime enforces it and this is what makes the flag true.
   */
  const decisionsBilled = new Set<string>()

  /** Over the line and nobody has answered. Left off, and said out loud. */
  let pendingHours = 0

  for (const ts of billing) {
    const rate = ts.sellContract.billRate // cents per hour

    // Guard: LEGACY_RULES.md — cannot invoice if rate <= 0
    if (rate <= 0) continue

    // ── What this week was decided to be worth ────────────────────────
    //
    // The terms are our contract's; the answers are the ones given on
    // our own leg, because a sub's agreement with a prime is not the
    // prime's agreement with the client. Where the chain has answered
    // only on the leg the hours live on — which is every chain today,
    // since approval records one decision per timesheet — that answer
    // is used rather than dropping decided overtime off the invoice
    // silently. Noted in the matrix; it is demand's route to split.
    const policy = policyOf(ts.sellContract)
    const rows = ts.overtimeDecisions ?? []
    const ownLeg = rows.filter((d) => d.sellContractId === ts.sellContractId)
    const answering = ownLeg.length > 0 ? ownLeg : rows

    const decisions: Decision[] = answering.map((d) => ({
      weekOf: d.weekOf.toISOString().slice(0, 10),
      treatment: d.treatment as Decision['treatment'],
      // The price comes from what was applied when somebody decided,
      // never from the contract's multiplier as it stands today.
      appliedBps: d.appliedBps,
      overtimeHours: Number(d.overtimeHours),
      accrualBps: d.accrualBps,
    }))
    const idOfWeek = new Map(answering.map((d) => [d.weekOf.toISOString().slice(0, 10), d.id]))

    // How much of this timesheet belongs to the period being billed, and
    // in which bands. Read from the daily hours, so a week crossing the
    // boundary gives each month exactly its own days — nothing
    // apportioned, nothing rounded, and the same hour never billed
    // twice. The week is still judged whole against the threshold.
    const billable = billableInPeriod(
      {
        id: ts.id,
        periodStart: ts.periodStart,
        periodEnd: ts.periodEnd,
        days: (ts.days as Record<string, number>) ?? {},
        leaveDays: (ts.leaveDays as Record<string, number>) ?? {},
        totalHours: Number(ts.totalHours),
      },
      period,
      terms.straddle,
      rate,
      policy,
      decisions
    )

    if (!billable) continue

    // Hours over the line that nobody has answered are not on this
    // invoice at any price — not as a zero-valued line and not folded
    // into the ordinary hours. They wait for a decision and bill on the
    // next run.
    pendingHours = Math.round((pendingHours + billable.pendingHours) * 100) / 100

    // Guard: LEGACY_RULES.md — cannot invoice if time <= 0
    if (billable.hours <= 0) continue

    // The working, written onto the line itself. A line with a premium
    // on it does not multiply out — forty-five hours at $132 is $5,940
    // and the line says $6,270 — and the client's AP desk files this
    // document rather than opening our screen, so the two bands a paper
    // invoice would print are stated in the description.
    const bands = bandsOf(billable.split, rate)
    const adds = bands.reduce((n, b) => n + b.amountCents, 0) === billable.value.totalCents
    priced.set(ts.id, {
      hours: billable.hours,
      cents: billable.value.totalCents,
      working:
        bands.length > 1 && adds
          ? bands.map((b) => `${b.hours}h ${b.says}`).join(', ')
          : null,
    })
    for (const week of billable.weeksBilled) {
      const id = idOfWeek.get(week)
      if (id) decisionsBilled.add(id)
    }

    const key = ts.sellContractId
    const existing = linesByContract.get(key)

    if (existing) {
      existing.totalHours = Math.round((existing.totalHours + billable.hours) * 100) / 100
      existing.overtimeHours = Math.round((existing.overtimeHours + billable.split.overtimeHours) * 100) / 100
      existing.pendingHours = Math.round((existing.pendingHours + billable.pendingHours) * 100) / 100
      existing.amountCents += billable.value.totalCents
      existing.timesheetIds.push(ts.id)
      if (ts.periodEnd > existing.periodEnd) existing.periodEnd = ts.periodEnd
    } else {
      linesByContract.set(key, {
        sellContractId: ts.sellContractId,
        personId: ts.person.id,
        personName: ts.person.name,
        billRate: rate,
        currency: ts.sellContract.billCurrency,
        totalHours: billable.hours,
        overtimeHours: billable.split.overtimeHours,
        pendingHours: billable.pendingHours,
        amountCents: billable.value.totalCents,
        timesheetIds: [ts.id],
        // The latest week on the line, so the "invoice to raise" cycle
        // it completes is the one this billing period was heading for.
        periodEnd: ts.periodEnd,
      })
    }

  }

  if (linesByContract.size === 0 && expenseRows.length === 0 && milestones.length === 0) {
    return NextResponse.json(
      { error: { code: 'ZERO_VALUE', message: 'All timesheets have zero hours or zero rate' } },
      { status: 422 }
    )
  }

  const lines = Array.from(linesByContract.values())

  const expLines = billableNow(
    expenseRows.map((e) => ({
      id: e.id, status: e.status, billable: e.billable, invoiceId: e.invoiceId,
      sellContractId: e.sellContractId, personId: e.personId, personName: e.person.name,
      category: e.category, description: e.description, total: Number(e.total),
      currency: e.sellContract.billCurrency, periodEnd: e.periodEnd,
    }))
  ).map((e) => expenseLine(e, minorPerUnit(e.currency)))

  // ── Consolidation: contracts may share an invoice, companies may not ──
  //
  // One sales order for a five-person project produces five sell
  // contracts and one invoice a month, which is the ordinary case. What
  // it may never do is cross a bill-to, a payer or a currency — an
  // invoice addressed to two companies is a document neither of them will
  // post, and `currency = lines[0].currency` was quietly asserting they
  // all matched.
  const contractById = new Map(engagement.sellContracts.map((sc) => [sc.id, sc]))
  // A milestone bills to the engagement's client through the contract
  // whose terms shape the period; it has no contract of its own.
  const milestoneParties = milestones.map(() => ({ sellContractId: anchorContract.id, currency: anchorContract.billCurrency }))
  const consolidation = mayConsolidate(
    [...lines, ...expLines, ...milestoneParties].map((l) => {
      const sc = contractById.get(l.sellContractId)
      // The contract's own paying customer, else the firm this
      // engagement is with.
      const billTo = sc?.clientCompany ?? billedTo
      return {
        sellContractId: l.sellContractId,
        billToId: billTo.id,
        // A firm on the platform always has a name; the fallback is for
        // a bill-to read off an order that carried only an id.
        billToName: billTo.name ?? 'the client',
        payerId: billTo.id,
        currency: l.currency,
      }
    })
  )

  if (!consolidation.ok) {
    return NextResponse.json(
      { error: { code: 'CANNOT_CONSOLIDATE', message: consolidation.says } },
      { status: 422 }
    )
  }

  // Said, never swallowed. Hours over the line that nobody has answered
  // are the one thing on this run that will not be billed, and an AR
  // clerk who is not told reads a short invoice as a short month.
  const pendingSays =
    pendingHours > 0
      ? `${pendingHours} hour${pendingHours === 1 ? '' : 's'} over the weekly limit ` +
        'are not on this invoice, because nobody has decided yet whether they are ' +
        'paid at the usual rate, at a premium, or banked as time off. ' +
        'Decide them and they bill on the next run.'
      : null

  const currency = lines[0]?.currency ?? expLines[0]?.currency ?? anchorContract.billCurrency // one currency per invoice, now checked
  const milestoneCents = milestones.reduce((sum, m) => sum + m.amountCents, 0)
  const total = lines.reduce((sum, line) => sum + line.amountCents, 0) / minorPerUnit(currency) + expenseTotal(expLines, minorPerUnit(currency)) + milestoneCents / minorPerUnit(currency)

  // ── The four parties ────────────────────────────────────────────────
  const firstContract = contractById.get(lines[0]?.sellContractId ?? expLines[0]?.sellContractId ?? anchorContract.id)
  // The default for all four: the firm this engagement is with. Every
  // one of them is overridable on the contract, which is the ordinary
  // four-party split.
  const agreementClient: Party = {
    id: billedTo.id,
    name: billedTo.name ?? 'the client',
  }
  const shipTo: Place | null = firstContract?.workLocation
    ? {
        id: firstContract.workLocation.id,
        name: firstContract.workLocation.name,
        country: firstContract.workLocation.country,
        state: firstContract.workLocation.state,
      }
    : null

  const partners = partnerFunctions({
    agreementClient,
    contract: {
      // The contract's own paying customer, which is not always the
      // company that signed the agreement.
      billTo: firstContract?.clientCompany ?? null,
      payer: firstContract?.clientCompany ?? null,
      shipTo,
    },
  })

  // ── Self-billing ────────────────────────────────────────────────────
  //
  // Some clients and every VMS raise the document themselves from the
  // hours they approved. Two numbers for one debt means they post one,
  // ignore the other, and the receipt matches neither — so where they
  // self-bill we carry THEIR number rather than allocating one of ours.
  const self = selfBilling({
    selfBilled: body.selfBilled === true,
    clientDocumentNumber: body.clientDocumentNumber ? String(body.clientDocumentNumber) : null,
  })
  if (self.selfBilled && !self.number) {
    return NextResponse.json(
      { error: { code: 'SELF_BILLED', message: self.says, field: 'clientDocumentNumber' } },
      { status: 422 }
    )
  }

  // ── Tax determination ───────────────────────────────────────────────
  //
  // The place of supply is where the work was done, which is the ship-to
  // and nothing else. Where nobody has set one, `taxFor` returns UNKNOWN
  // and no rate goes anywhere near the invoice — an under-taxed invoice
  // is a liability that surfaces two years later with interest, and a
  // plausible zero is the one output nobody ever audits.
  const vendorSite = await prisma.companyLocation.findFirst({
    where: { companyId: caller.company!.id },
    orderBy: [{ isPrimary: 'desc' }],
    select: { country: true, state: true },
  })
  const customerSite = await prisma.companyLocation.findFirst({
    where: { companyId: partners.billTo.party.id },
    orderBy: [{ isPrimary: 'desc' }],
    select: { country: true, state: true },
  })

  const per = minorPerUnit(currency)
  const tax = vendorSite
    ? taxFor({
        supplier: { country: vendorSite.country, state: vendorSite.state },
        placeOfPerformance: shipTo ? { country: shipTo.country, state: shipTo.state } : null,
        customer: customerSite
          ? { country: customerSite.country, state: customerSite.state }
          : { country: vendorSite.country },
        netMinor: Math.round(total * per),
      })
    : null

  const taxNote = !vendorSite
    ? 'No registered location on this company, so no place of supply can be established ' +
      'and no tax is determined. Set a primary location before billing across a border.'
    : tax?.outcome === 'UNKNOWN'
      ? tax.says
      : null

  // ── When this is due, and what that counts from ─────────────────────
  //
  // It used to be `period.end + paymentTerms`, always. That is wrong
  // against almost every agreement anybody signs: NET 30 runs from
  // receipt of the invoice, and a period ending the 31st is billed on
  // the 6th once the hours are in — so we claimed it due six days early
  // and chased a client who was not late.
  //
  // The anchor cascades the way the days do: this contract, then the
  // agreement, then the end of the work period, which is what every
  // invoice raised before the term existed was counted from.
  const termsContract = firstContract ?? engagement.sellContracts[0]
  // And the net days are the order's where this line is on one. The
  // line's column is not nullable and carries a default, so it cannot
  // say "nobody told me" — which is why it does not get to win.
  const onOrder = termsContract ? termsFor('SELL', termsContract) : null
  const terms_ = resolveBillingTerms({
    company: { name: caller.company!.name },
    agreement: engagement.msa
      ? {
          paymentTermsDays: engagement.msa.paymentTerms,
          paymentTermsFrom: engagement.msa.paymentTermsFrom,
          counterpartyName: billedTo.name ?? 'the client',
        }
      : null,
    contract: {
      paymentTermsDays: termsContract?.paymentTerms,
      paymentTermsFrom: termsContract?.paymentTermsFrom,
    },
    order:
      onOrder?.from.paymentTermsDays === 'ORDER'
        ? { paymentTermsDays: onOrder.paymentTermsDays, number: onOrder.orderNumber }
        : null,
  })
  const paymentTerms = terms_.paymentTermsDays.value
  const issuedAt = new Date()

  // Receipt cannot have happened: we are raising it now. Approval
  // likewise. Both leave the clock unstarted, which `dueOn` says out
  // loud rather than quietly counting from today.
  const due = dueOn({
    anchor: terms_.paymentTermsFrom.value,
    days: paymentTerms,
    periodEnd: period.end,
    issuedAt,
    receivedAt: null,
    approvedAt: null,
  })
  const dueAt = due.dueAt

  // Nothing records when a client approves an invoice — `Invoice` has
  // `receivedAt` and no `approvedAt` — so a contract on APPROVAL_DATE
  // terms cannot be dated at all, and says that rather than counting
  // from a date nobody agreed to.
  const termsNote =
    terms_.paymentTermsFrom.value === 'APPROVAL_DATE'
      ? 'This contract counts its payment days from the day the client approves the invoice, ' +
        'and nothing here records that yet. Until it does, the invoice cannot be dated and ' +
        'will not be chased.'
      : null

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Generate invoice number: IN_{engagement_seq}_{3-digit}
      // Count existing invoices for this engagement for sequencing
      const existingCount = await tx.invoice.count({
        where: { engagementId },
      })
      const seq = String(existingCount + 1).padStart(3, '0')
      // Use engagement ID fragment for the contract portion
      const engFragment = engagementId.slice(-6).toUpperCase()
      // Their number where they self-bill. Never both.
      const number = self.number ?? `IN_${engFragment}_${seq}`

      // Create the invoice
      const invoice = await tx.invoice.create({
        data: {
          engagementId,
          number,
          periodStart: period.start,
          periodEnd: period.end,
          // The day it was actually billed. The column existed for a
          // week with nothing writing it, so every DSO fell back to
          // periodEnd and understated the age. Adding a column is not
          // building a feature; this is the write.
          issuedAt,
          // Queryable, not only in the lines JSON — a rate that exists
          // only inside a blob is not something a return can be filed
          // from. The columns landed for exactly this write.
          taxRegime: tax?.regime ?? null,
          taxOutcome: tax?.outcome ?? (vendorSite ? null : 'UNKNOWN'),
          placeOfSupply: tax?.placeOfSupply ?? null,
          taxTotalCents:
            tax?.rateBps == null
              ? null
              : Math.round((Math.round(total * per) * tax.rateBps) / 10_000),
          lines: [...milestones.map((m) => ({
            sellContractId: null,
            personId: null,
            milestoneId: m.id,
            description: `${m.order.number} — milestone: ${m.name}`,
            billRate: 0,
            totalHours: 0,
            amount: m.amountCents / per,
            tax: null,
          })), ...expLines.map((l) => ({
            sellContractId: l.sellContractId,
            personId: l.personId,
            expenseId: l.expenseId,
            description: l.description,
            billRate: 0,
            totalHours: 0,
            amount: l.amountCents / per,
            tax: null,
          })), ...lines.map((l) => ({
            sellContractId: l.sellContractId,
            personId: l.personId,
            personName: l.personName,
            billRate: l.billRate,
            totalHours: l.totalHours,
            // The hours on the line and the money on the line are the
            // same hours. Where a week is still waiting on a decision,
            // neither its hours nor its money is here.
            overtimeHours: l.overtimeHours,
            pendingHours: l.pendingHours,
            amount: l.amountCents / per,
            // How the tax was determined at the moment of billing, kept
            // with the line rather than recomputed later. A rate table
            // changes; what was charged does not.
            tax: tax
              ? {
                  regime: tax.regime,
                  outcome: tax.outcome,
                  rateBps: tax.rateBps,
                  placeOfSupply: tax.placeOfSupply,
                  basis: tax.basis,
                  amountMinor:
                    tax.rateBps == null
                      ? null
                      : Math.round((l.amountCents * tax.rateBps) / 10_000),
                }
              : null,
          }))],
          currency,
          total,
          dueAt,
          status: 'ISSUED',
          // The four parties, written rather than left null.
          soldToId: partners.soldTo.party.id,
          billToId: partners.billTo.party.id,
          shipToId: partners.shipTo?.party.id ?? null,
          payerId: partners.payer.party.id,
          // Inherit the PO the work was authorized under. Without it the
          // three-way match has only two records to compare.
          workOrderId: billing.find(t => t.sellContract.workOrderId)
            ?.sellContract.workOrderId ?? null,
        },
      })

      // One InvoiceLine per timesheet per contract. The JSON above stays
      // as a display cache grouped by person; these rows are what the
      // three-way match reads, and what the database constrains to a
      // single billing per timesheet *on this contract* — a prime
      // billing the same week its sub billed is two facts, not a
      // duplicate.
      for (const group of lines) {
        for (const tsId of group.timesheetIds) {
          const ts = billing.find((t) => t.id === tsId)
          const worth = priced.get(tsId)
          if (!ts || !worth) continue
          // The same figures the header was added up from, not a second
          // calculation of them. This line used to be the whole
          // timesheet at the plain rate whatever the header said, so an
          // invoice with a premium on it — or one billing half a
          // straddling week — could never pass its own addition.
          await tx.invoiceLine.create({
            data: {
              invoiceId: invoice.id,
              timesheetId: ts.id,
              sellContractId: ts.sellContractId,
              personId: ts.person.id,
              hours: worth.hours,
              rateCents: ts.sellContract.billRate,
              amountCents: worth.cents,
              description:
                `${ts.person.name} — ${ts.periodStart.toISOString().slice(0, 10)} to ${ts.periodEnd.toISOString().slice(0, 10)}` +
                (worth.working ? ` · ${worth.working}` : ''),
            },
          })
        }
      }

      // ── A decision that has reached an invoice is history ────────────
      //
      // Stamped inside the same transaction as the lines, so a decision
      // is billed if and only if the invoice carrying it exists. Until
      // this write, `mayChange` in lib/overtime had nothing to read and
      // a week could be re-answered after the client had been sent a
      // document priced on the first answer.
      //
      // A banked week is stamped too: its ordinary hours are on this
      // invoice, so changing the answer to a premium afterwards would
      // restate a document already sent.
      if (decisionsBilled.size > 0) {
        await tx.overtimeDecision.updateMany({
          where: { id: { in: [...decisionsBilled] }, billedAt: null },
          data: { billedAt: new Date() },
        })
      }

      // The milestones: a line each, the acceptance behind it, the
      // milestone marked INVOICED.
      for (const m of milestones) {
        await tx.invoiceLine.create({
          data: {
            invoiceId: invoice.id,
            milestoneId: m.id,
            timesheetId: null,
            sellContractId: null,
            personId: null,
            hours: 0,
            rateCents: 0,
            amountCents: m.amountCents,
            description: `${m.order.number} — milestone: ${m.name}`,
          },
        })
        await tx.orderMilestone.update({ where: { id: m.id }, data: { status: 'INVOICED' } })
      }

      // The expenses, each a line of its own with the expense behind it,
      // and the expense marked INVOICED with this invoice on it.
      for (const l of expLines) {
        await tx.invoiceLine.create({
          data: {
            invoiceId: invoice.id,
            expenseId: l.expenseId,
            timesheetId: null,
            sellContractId: l.sellContractId,
            personId: l.personId,
            hours: 0,
            rateCents: 0,
            amountCents: l.amountCents,
            description: l.description,
          },
        })
        await tx.expense.update({ where: { id: l.expenseId }, data: { status: 'INVOICED', invoiceId: invoice.id } })
      }

      // Deliberately no write back to Timesheet here. The InvoiceLine rows
      // are the link, and an invoice must never touch the approval state of
      // the receipts that justify it.
      const allTimesheetIds = lines.flatMap((l) => l.timesheetIds)

      // The "invoice to raise" cycle on each contract billed here is done.
      for (const l of lines) {
        await completeCycle(tx, { sellContractId: l.sellContractId, kind: 'INVOICE_GENERATE', periodEnd: l.periodEnd })
      }

      // AutomationLog
      await tx.automationLog.create({
        data: {
          companyId: caller.company!.id,
          action: 'INVOICE_GENERATED',
          summary: `Invoice ${number} generated: ${lines.length} line item(s), ${allTimesheetIds.length} timesheet(s)${expLines.length ? `, ${expLines.length} expense(s)` : ''}${milestones.length ? `, ${milestones.length} milestone(s)` : ''}, $${total.toFixed(2)} total, due ${dueAt.toISOString().slice(0, 10)}${pendingSays ? `. ${pendingSays}` : ''}`,
          reason: `Generated by ${caller.person.name}`,
          payload: {
            invoiceId: invoice.id,
            number,
            engagementId,
            lineCount: lines.length,
            timesheetCount: allTimesheetIds.length,
            total,
            currency,
            dueAt: dueAt.toISOString(),
          },
          reversible: true,
        },
      })

      return invoice
    })

    // After the transaction. An invoice event for an invoice that rolled
    // back would have an AP team chasing a number that does not exist.
    void emit({
      type: 'invoice.generated',
      companyId: caller.company?.id ?? null,
      subjectType: 'Invoice',
      subjectId: result.id,
      actorPersonId: caller.person.id,
      payload: {
        number: result.number,
        engagementId,
        lineCount: lines.length,
        timesheetCount: lines.flatMap((l) => l.timesheetIds).length,
        total,
        currency,
        dueAt: dueAt.toISOString(),
      },
    })

    return NextResponse.json({
      data: {
        invoice: {
          id: result.id,
          number: result.number,
          periodStart: result.periodStart.toISOString(),
          periodEnd: result.periodEnd.toISOString(),
          total: Number(result.total),
          currency: result.currency,
          dueAt: result.dueAt.toISOString(),
          status: result.status,
          lineCount: lines.length,
          timesheetCount: lines.reduce((sum, l) => sum + l.timesheetIds.length, 0),
        },
        partners: {
          soldTo: partners.soldTo.party.name,
          billTo: partners.billTo.party.name,
          shipTo: partners.shipTo?.party.name ?? null,
          payer: partners.payer.party.name,
          split: partners.split,
          says: partners.says,
        },
        consolidation: { count: lines.length, says: consolidation.says },
        // What the due date counts from, said rather than assumed. An AR
        // clerk who sees "net 30 from the end of the work period" on a
        // client whose agreement says receipt knows which document to go
        // and read.
        terms: {
          days: paymentTerms,
          anchor: terms_.paymentTermsFrom.value,
          because: terms_.paymentTermsFrom.because,
          clockStarted: due.clockStarted,
          waitingFor: due.waitingFor,
          says: due.says,
          note: termsNote,
        },
        // What was left off, and why. A blank is an answer here: nothing
        // was waiting.
        overtime: { pendingHours, says: pendingSays },
        selfBilling: { selfBilled: self.selfBilled, says: self.says },
        // Determined and shown. It is NOT a queryable field on the
        // invoice — `Invoice` carries no tax columns, so this lives with
        // the line detail and is stated here rather than left to be
        // discovered by whoever files the return.
        tax: tax
          ? {
              regime: tax.regime,
              outcome: tax.outcome,
              rateBps: tax.rateBps,
              taxMinor: tax.taxMinor,
              grossMinor: tax.grossMinor,
              placeOfSupply: tax.placeOfSupply,
              components: tax.components,
              basis: tax.basis,
              says: tax.says,
            }
          : null,
        taxNote,
        message: `Invoice ${result.number} generated: $${Number(result.total).toFixed(2)} total`,
      },
    }, { status: 201 })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json(
        { error: { code: 'DUPLICATE', message: 'Invoice number already exists — retry' } },
        { status: 409 }
      )
    }
    reportError('Invoice generation failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Invoice generation failed' } },
      { status: 500 }
    )
  }
}
