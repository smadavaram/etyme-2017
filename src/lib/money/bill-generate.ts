/**
 * One way a bill is made, whoever makes it.
 *
 * ── Why this is not the route any more ───────────────────────────────
 *
 * Until 2026-10-18 the whole of bill generation lived inside
 * `POST /api/invoices/generate`. The founder's decision that day —
 * "billing and paying follow the agreement between each pair" — gave the
 * supplier's twin the job of drafting the bill on the agreement's billing
 * date, for Accounts Receivable to send. A second copy of this arithmetic
 * for the twin would be two answers to "what does this period bill", and
 * the first week they disagreed a client would receive two bills for one
 * week, or one bill priced two ways. So the route and the twin both call
 * `generateBill`, and the only things that differ are the status the bill
 * is written in (ISSUED from the Bills page, DRAFT from the twin), who it
 * says made it, and whether it is written inside somebody else's
 * transaction (the twin's ledger entry and the draft stand or fall
 * together).
 *
 * A week is billed once by a firm whatever made the bill: the weeks this
 * reads are the signed ones with no line of ours on them, and a draft's
 * lines are lines. So a twin's draft and a bill pressed on the Bills page
 * for the same weeks are one bill, never two — whichever came first holds
 * the weeks, and the other finds nothing left to bill.
 *
 * Everything below `const { engagementId } = body` is the route's former
 * body, unchanged in what it computes. Its comments still say "this
 * route" in places; read them as "this bill".
 */

import type { Prisma } from '@prisma/client'
import { reportError } from '@/lib/alerts'
import { prisma } from '@/lib/db'
import { completeCycle } from '@/lib/cycle-complete'
import { sortForBill, expenseLine, expenseTotal, type LeftOff } from '@/lib/expense-billing'
import { billsOnLeg, payersOwn, APPROVED_BY_EMPLOYER } from '@/lib/money/expense-acceptance'
import { legsOverMany, acceptancesOn } from '@/lib/money/expense-acceptance-read'
import { emit } from '@/lib/events'
import { billableInPeriod, bandsOf, type Terms } from '@/lib/periods'
import {
  partnerFunctions, mayConsolidate, selfBilling, taxFor, dueOn,
  type Place, type Party, type BillingTerms, type DueVerdict,
} from '@/lib/billing-cascade'
import { minorPerUnit } from '@/lib/money'
import { drawnOnOrder } from '@/lib/money/order-drawn'
import { fromUnits, amount } from '@/lib/money-display'
import { whereHoursLive, descend } from '@/lib/work-chain'
import { ladderFor } from '@/lib/work-chain-read'
import { lineFor, type Decision } from '@/lib/overtime'
import {
  ORDER_HEADER_SELECT, AGREEMENT_TERMS_SELECT, SELL_LINE_TERMS_SELECT, periodTermsFor, moneyTermsFor,
  type OrderLine, type AgreementTerms,
} from '@/lib/money/order-terms'
import { partiesOf, mayBillUnder } from '@/lib/money/invoice-parties'
import { readWindow, billingWindow, inWindow } from '@/lib/money/invoice-window'
import { whatTheRungBills } from '@/lib/money/rung-billing'
import { billedElsewhere, type ReceiptOnRecord } from '@/lib/money/billed-elsewhere'
import { carriedOvertime } from '@/lib/money/client-overtime'
import { topLegsOver } from '@/lib/money/client-overtime-read'
import { nothingToBillSays } from '@/lib/money/nothing-to-bill'

type Tx = Prisma.TransactionClient

/** Who is making the bill: a person on the Bills page, or the twin on a person's authority. */
export interface BillCaller {
  company: { id: string; name: string; kind?: string | null }
  person: { id: string | null; name: string }
}

/** What a bill would be, before it is written — what a twin's question shows. */
export interface PlannedBill {
  engagementId: string
  /** Who it is addressed to. */
  customerName: string
  periodStart: Date
  periodEnd: Date
  /** "September 2026". */
  periodLabel: string
  currency: string
  /** The bill's total in minor units. */
  totalMinor: number
  /** Hours billed across every person on it. */
  hours: number
  people: { personName: string; hours: number; amountMinor: number }[]
  /** The signed weeks it is built from. */
  timesheetIds: string[]
  sellContractIds: string[]
  expenseCount: number
  milestoneCount: number
  /** Weeks, and expenses, left off because the firm above has not accepted them, in words. */
  heldBack: string | null
  /** Overtime nobody has decided, left off, in words. */
  pending: string | null
  /** When it falls due, in words. */
  dueSays: string
  /** Terms an order or a line said with no reason, set aside, in words. */
  setAside: string[]
  /**
   * Each signed week this bill carries, as its lines price it: the hours
   * billed and their amount in minor units. The same numbers the
   * `InvoiceLine` rows get, so a reader of a dry run (the firm's Today
   * figures, `lib/money/firm-today`) and the bill cannot disagree.
   */
  weeks: { timesheetId: string; hours: number; amountMinor: number }[]
  /**
   * Each week left off, and why: the firm above has not accepted it
   * (WAITING), or the arithmetic is not decided (HELD). `billedElsewhere`
   * is set where the week is already on an invoice receipt the payer
   * recorded from this firm — billed, off the platform — wholly or for
   * some of its days.
   */
  weeksLeftOff: { timesheetId: string; kind: 'WAITING' | 'HELD'; says: string; billedElsewhere?: 'WHOLE' | 'PART' }[]
  /** Each week with hours over the line nobody has decided, and how many. Those hours are on no bill. */
  weeksUndecided: { timesheetId: string; pendingHours: number }[]
}

export type BillOutcome =
  | { ok: false; status: number; body: { error: Record<string, unknown> } }
  | { ok: true; status: 200; planned: PlannedBill; body: { data: { planned: PlannedBill } }; invoiceId?: undefined }
  | { ok: true; status: 201; invoiceId: string; planned: PlannedBill; body: { data: Record<string, unknown> } }

export interface BillOptions {
  /** ISSUED from the Bills page; DRAFT from the twin. */
  status?: 'ISSUED' | 'DRAFT'
  /** Write inside this transaction; a failure is thrown to it. */
  tx?: Tx
  /** Read and price everything, write nothing. */
  dryRun?: boolean
  /** The automation log's reason, where it is not "Generated by" a person. */
  by?: string
}

function reply(status: number, body: any): BillOutcome {
  return { ok: false, status, body }
}

/**
 * When a bill is due, from the one cascade: the agreement first, then the
 * order and the line where each gives a reason, then the company and the
 * platform (lib/money/order-terms). Generation and sending a draft both
 * ask this, so a draft sent a week later is dated by the same rule it was
 * priced under.
 */
export function billDue(a: {
  line: OrderLine | null
  engagementAgreement: (AgreementTerms & { client?: { name: string } | null }) | null
  companyName: string
  customerName: string
  periodEnd: Date
  issuedAt: Date
}): { terms_: BillingTerms; due: DueVerdict } {
  const line = a.line ?? {}
  const agreement =
    line.msa ?? line.workOrder?.msa ??
    (a.engagementAgreement ? { ...a.engagementAgreement, client: { name: a.customerName } } : null)
  const { billing } = moneyTermsFor('SELL', line, { name: a.companyName }, agreement)
  // Receipt cannot have happened: we are raising it now. Approval
  // likewise. Both leave the clock unstarted, which `dueOn` says out
  // loud rather than quietly counting from today.
  const due = dueOn({
    anchor: billing.paymentTermsFrom.value,
    days: billing.paymentTermsDays.value,
    periodEnd: a.periodEnd,
    issuedAt: a.issuedAt,
    receivedAt: null,
    approvedAt: null,
  })
  return { terms_: billing, due }
}

/**
 * Make a bill for one engagement, over the dates asked for.
 *
 * `body` is what the Bills page posts: `engagementId`, the window
 * (`periodStart`/`periodEnd`, read by `readWindow`), and self-billing.
 * Never throws outside a caller's transaction; inside one, a failure is
 * thrown so the caller's own writes roll back with it.
 */
export async function generateBill(caller: BillCaller, body: Record<string, any>, opts: BillOptions = {}): Promise<BillOutcome> {
  const { engagementId } = body
  const draft = opts.status === 'DRAFT'

  // The dates asked for, read and checked before anything is loaded. A
  // period under a name this route does not read used to be dropped
  // without a word, and the run billed every signed week there was
  // (lib/money/invoice-window).
  const asked = readWindow(body)
  if (!asked.ok) {
    return reply(422, { error: { code: 'VALIDATION', message: asked.says, field: asked.field } })
  }
  const bounded = Boolean(asked.start || asked.end)

  if (!engagementId) {
    return reply(422, { error: { code: 'VALIDATION', message: 'engagementId is required', field: 'engagementId' } })
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
          // The document this line is on, and the agreement above both.
          // The agreement sets the terms; the order, then the line, differ
          // only with a recorded reason — `lib/money/order-terms` decides.
          workOrder: { select: ORDER_HEADER_SELECT },
          msa: { select: AGREEMENT_TERMS_SELECT },
        },
      },
    },
  })

  if (!engagement) {
    return reply(404, { error: { code: 'NOT_FOUND', message: 'Engagement not found' } })
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
  // The same function the picker filters on, so a list that offers an
  // engagement and a route that refuses it cannot disagree.
  const right = mayBillUnder(parties, caller.company)
  if (!right.ok || !billedBy_ || !billedTo) {
    return reply(403, {
        error: {
          code: 'NOT_THE_SUPPLIER',
          message: right.says,
        },
      })
  }

  if (engagement.sellContracts.length === 0) {
    return reply(422, { error: { code: 'NO_CONTRACTS', message: 'No active sell contracts under this engagement' } })
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
  //
  // This is what to LOAD, and only that. Which of the loaded weeks this
  // bill actually takes is decided below, against the window, by the
  // straddle rule — a week that touches the dates asked for by one day
  // is loaded here and billed only if it belongs.
  if (asked.start) {
    timesheetWhere.periodEnd = { gte: asked.start }
  }
  if (asked.end) {
    timesheetWhere.periodStart = { lte: asked.end }
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
      // Every live signature on the week. A rung below the top bills
      // only what the firm above it accepted, so the payer's own
      // signature is read in the loop below (lib/money/rung-billing).
      assertions: {
        where: { state: 'LIVE' },
        select: { companyId: true, role: true, hours: true, coversFrom: true, coversTo: true },
      },
      sellContract: {
        select: {
          id: true, billRate: true, billCurrency: true, workOrderId: true,
          // Who the hours are filed with and for — which of a payer's
          // signatures is its own is decided from these.
          companyId: true, clientCompanyId: true, endClientCompanyId: true,
          overtimeAfterHours: true, overtimeMultiplierBps: true,
          startDate: true,
          // The job's hours: where the contract draws no overtime line,
          // a week somebody decided was judged against them (lineFor).
          requirement: { select: { hoursPerWeek: true } },
          // The contract says what a period is — unless it is on an
          // order, and then the order does. Both are selected and
          // `lib/money/order-terms` picks; these three are never read
          // directly.
          billFrequency: true, billAnchor: true, billStraddle: true,
          workOrder: { select: ORDER_HEADER_SELECT },
          ...SELL_LINE_TERMS_SELECT,
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
  // The top of the ladder over each week's hours: the contract the end
  // client pays. A bill on any line below it prices overtime on the
  // client's answer (the founder, 2026-10-19; lib/money/client-overtime).
  const tops = await topLegsOver(timesheets.map((ts) => ts.sellContractId))
  const billing = timesheets.map((ts) => {
    const ours = ourContract.get(billedBy.get(ts.sellContractId) ?? ts.sellContractId)
    // The contract the hours are filed on, kept before it is replaced:
    // it says whose signature on the week is the payer's.
    const hoursContract = {
      companyId: ts.sellContract.companyId,
      clientCompanyId: ts.sellContract.clientCompanyId,
      endClientCompanyId: ts.sellContract.endClientCompanyId,
    }
    const top = tops.get(ts.sellContractId) ?? null
    if (!ours) return { ...ts, hoursContract, top, payer: null }
    return {
      ...ts,
      hoursContract,
      top,
      // Who pays this bill: the customer on the contract being billed.
      payer: { id: ours.clientCompanyId, name: ours.clientCompany?.name ?? 'the firm above' },
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
        // And our own agreement with the firm above, never the sub's.
        msa: ours.msa,
        termsDifferReason: ours.termsDifferReason,
        // The job the week was decided against, carried with it.
        requirement: ts.sellContract.requirement,
      },
    }
  })

  // ── Hours already on a bill the firm above recorded from us ─────────
  //
  // "Not yet billed by us" above asks our own invoice lines, and a bill to
  // the firm above also reaches the record as an invoice receipt that
  // firm keyed in from us, with a period and no lines. Both are ours.
  // Every live one the payers hold from us is read, so a week inside one
  // is left off with a sentence rather than billed a second time
  // (lib/money/billed-elsewhere).
  const payerIds = [...new Set(engagement.sellContracts.map((sc) => sc.clientCompanyId).filter((x): x is string => !!x))]
  const receivedFromUs = payerIds.length === 0
    ? []
    : await prisma.vendorBill.findMany({
        where: {
          companyId: { in: payerIds },
          vendorCompanyId: caller.company!.id,
          status: { notIn: ['CANCELLED', 'VOID', 'REJECTED'] },
          periodStart: { not: null },
          periodEnd: { not: null },
        },
        select: {
          number: true, companyId: true, periodStart: true, periodEnd: true,
          company: { select: { name: true } },
          buyContract: { select: { supplierSellContractId: true, candidates: { select: { personId: true } } } },
        },
      })
  /** The receipts one payer holds that could cover hours on our own contract. */
  const receiptsFor = (payerId: string, ourSellId: string): ReceiptOnRecord[] =>
    receivedFromUs
      .filter((b) => b.companyId === payerId)
      // A receipt on the payer's buy line from a different contract of
      // ours is not this contract's.
      .filter((b) => !b.buyContract?.supplierSellContractId || b.buyContract.supplierSellContractId === ourSellId)
      .map((b) => ({
        number: b.number,
        payerName: b.company.name,
        periodStart: b.periodStart!.toISOString().slice(0, 10),
        periodEnd: b.periodEnd!.toISOString().slice(0, 10),
        personIds: b.buyContract ? b.buyContract.candidates.map((c) => c.personId) : null,
      }))

  // ── Expenses that ride on this invoice ──────────────────────────────
  //
  // Approved, not yet on an invoice, on our own contracts. They become
  // lines of their own with the expense behind them
  // (src/lib/expense-billing.ts). An invoice may carry only expenses — a
  // month with no hours and one flight is still a month to bill.
  //
  // Not filtered on the employer's own `billable` flag here: whether this
  // kind of expense is billable on this leg is the agreement's where it
  // says (the founder, 2026-10-19), and the flag only where it is silent.
  // Both are decided below, with what the payer accepted.
  //
  // And on every line below ours in the chain, where we are a firm in the
  // middle (2026-10-19): the expense was raised on the employer's line,
  // and we bill it to our own customer on our own line, at what our
  // customer accepted, once. The employer's `invoiceId` and status are
  // the employer's rung's, so whether we have billed it is our own lines,
  // the same question a week is asked.
  /** A line an expense may be raised on → the contract of ours that bills it. */
  const ourLineOver = new Map<string, string>()
  for (const own of ownIds) {
    for (const line of descend(own, rungs)) if (!ourLineOver.has(line)) ourLineOver.set(line, own)
  }
  const belowIds = [...ourLineOver.keys()].filter((id) => !ownIds.includes(id))
  let expenseRows = await prisma.expense.findMany({
    where: {
      OR: [
        { sellContractId: { in: ownIds }, status: 'APPROVED', invoiceId: null },
        ...(belowIds.length > 0 ? [{ sellContractId: { in: belowIds }, status: { in: [...APPROVED_BY_EMPLOYER] } }] : []),
      ],
      invoiceLines: { none: { sellContractId: { in: ownIds } } },
      ...(asked.start ? { periodEnd: { gte: asked.start } } : {}),
      ...(asked.end ? { periodStart: { lte: asked.end } } : {}),
    },
    include: {
      person: { select: { name: true } },
      sellContract: {
        select: {
          id: true, billCurrency: true, startDate: true,
          billFrequency: true, billAnchor: true, billStraddle: true,
          workOrder: { select: ORDER_HEADER_SELECT },
          ...SELL_LINE_TERMS_SELECT,
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
  let milestones = await prisma.orderMilestone.findMany({
    where: { status: 'ACCEPTED', order: { engagementId, issuedToId: caller.company!.id } },
    include: { order: { select: { id: true, number: true, title: true } } },
    orderBy: { acceptedAt: 'asc' },
  })

  if (timesheets.length === 0 && expenseRows.length === 0 && milestones.length === 0) {
    // Say whose week is waiting and on whom, not just that nothing is
    // there (lib/money/nothing-to-bill). Every week of hours inside the
    // dates asked, whatever its state, read through the same contracts
    // the bill would have been made from.
    const { assertions: _signed, invoiceLines: _billed, ...anyWeek } = timesheetWhere
    const waiting = await prisma.timesheet.findMany({
      where: anyWeek,
      select: {
        periodStart: true, status: true,
        person: { select: { name: true } },
        assertions: { where: { role: 'CLIENT_APPROVAL', state: 'LIVE' }, select: { id: true }, take: 1 },
        invoiceLines: {
          where: { sellContractId: { in: ownIds } },
          select: { invoice: { select: { id: true, number: true, status: true } } },
          take: 1,
        },
        sellContract: {
          select: {
            clientCompany: { select: { name: true } },
            endClientCompany: { select: { name: true } },
          },
        },
      },
      orderBy: { periodStart: 'asc' },
      take: 50,
    })
    // A week held by a draft nobody has sent: name the draft and where it is.
    const draftHolding = waiting.map((w) => w.invoiceLines[0]?.invoice).find((i) => i?.status === 'DRAFT') ?? null
    return reply(422, {
        error: {
          code: 'NO_TIMESHEETS',
          ...(draftHolding ? { draft: { id: draftHolding.id, number: draftHolding.number, href: `/dashboard/invoices/${draftHolding.id}` } } : {}),
          message: nothingToBillSays(
            waiting.map((w) => ({
              personName: w.person?.name ?? 'Somebody',
              periodStart: w.periodStart,
              status: w.status,
              clientSigned: w.assertions.length > 0,
              // The signature a bill upward waits on is the client's at the
              // top of the chain, which is the end client where there is one.
              clientName: w.sellContract?.endClientCompany?.name ?? w.sellContract?.clientCompany?.name ?? null,
              onOurBill: w.invoiceLines[0]?.invoice.number ?? null,
              onOurDraft: w.invoiceLines[0]?.invoice.status === 'DRAFT',
            })),
            { start: asked.start ?? null, end: asked.end ?? null }
          ),
        },
      })
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
  const firstExpenseOurs = expenseRows[0] ? ourContract.get(ourLineOver.get(expenseRows[0].sellContractId) ?? expenseRows[0].sellContractId) : undefined
  const anchorContract =
    billing[0]?.sellContract ??
    // Our own line, never the employer's below it: the period a firm in
    // the middle bills is its own.
    firstExpenseOurs ??
    expenseRows[0]?.sellContract ??
    (await prisma.sellContract.findFirstOrThrow({
      where: { engagementId },
      select: {
        id: true, billCurrency: true, startDate: true,
        billFrequency: true, billAnchor: true, billStraddle: true,
        workOrder: { select: ORDER_HEADER_SELECT },
        ...SELL_LINE_TERMS_SELECT,
      },
    }))
  // The document first, the line where there is no document. The line's
  // own start date either way — an order is not a person, and a header
  // covering five people starts before four of them do.
  const terms: Terms = periodTermsFor('SELL', anchorContract)

  const latestWork = [...billing.map((t) => t.periodEnd), ...expenseRows.map((e) => e.periodEnd), ...milestones.map((m) => m.acceptedAt ?? new Date())]
    .reduce((latest, d) => (d > latest ? d : latest))

  // The contract says what a period is; the dates asked for narrow it
  // and never widen it. `period` from here on is what this bill covers —
  // the header's dates, what every week is judged against, and what the
  // due date counts from where the terms count from the end of the work
  // period. It used to be the whole contract period whatever was asked,
  // so a week grazing a one-week window on its last day was billed
  // whole under a header reading "September 2026".
  const bill = billingWindow(asked, latestWork, terms)
  const period = bill.window

  // An expense or a milestone rides on a bill asked for particular dates
  // only when it falls inside them — by the day its period ends, and the
  // day the client accepted it. With no dates asked for, both still ride
  // on the next bill, as they always have.
  if (bounded) {
    expenseRows = expenseRows.filter((e) => inWindow(e.periodEnd, period))
    milestones = milestones.filter((m) => inWindow(m.acceptedAt ?? new Date(), period))
  }

  // ── Which expenses the firm paying this bill has accepted ───────────
  //
  // An expense is accepted like a week (the founder, 2026-10-19): the
  // payer — the customer on the line being billed — accepts it before it
  // pays it, and the bill carries what it accepted, never what the worker
  // claimed. One it has not accepted, or sent back, and one of a kind the
  // agreement between the two firms does not make billable, is left off
  // and said, the way a week the firm above has not accepted is.
  //
  // The payer is the customer on OUR line — the client, or the firm above
  // us — whichever line below ours the expense was raised on. Whether
  // this leg bills it at all is the whole chain's: it travels up only as
  // far as each leg's agreement takes it (`billsOnLeg`).
  const [expenseChains, expenseDecisions] = await Promise.all([
    legsOverMany(expenseRows.map((e) => e.sellContractId)),
    acceptancesOn(expenseRows.map((e) => e.id)),
  ])
  /** The expenses billed on our own line, the employer's rung: the only ones this bill marks INVOICED. */
  const employersRung = new Set(expenseRows.filter((e) => ownIds.includes(e.sellContractId)).map((e) => e.id))
  const sortedExpenses = sortForBill(
    expenseRows.map((e) => {
      const ours = ourLineOver.get(e.sellContractId) ?? e.sellContractId
      const chain = expenseChains.get(e.sellContractId) ?? []
      const leg = chain.find((l) => l.sellContractId === ours)
      return {
        id: e.id, status: e.status, billable: e.billable, invoiceId: e.invoiceId,
        // Billed on our line, which is the employer's own where we are the employer.
        sellContractId: ours, personId: e.personId, personName: e.person.name,
        category: e.category, description: e.description, total: Number(e.total),
        currency: e.sellContract.billCurrency, periodStart: e.periodStart, periodEnd: e.periodEnd,
        payerName: leg?.payerName,
        own: leg ? payersOwn(leg.payerId, expenseDecisions.get(e.id) ?? []) : { kind: 'NONE' as const },
        leg: leg ? billsOnLeg(e, chain, ours) : undefined,
        aboveTheEmployer: !employersRung.has(e.id),
        billCurrency: ourContract.get(ours)?.billCurrency ?? e.sellContract.billCurrency,
      }
    })
  )
  const expensesLeftOff: LeftOff[] = sortedExpenses.leftOff
  const expensesOn = new Set(sortedExpenses.on.map((e) => e.id))
  expenseRows = expenseRows.filter((e) => expensesOn.has(e.id))

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
  /** The same, per week, for a reader that needs to know which week waits. */
  const pendingByWeek = new Map<string, number>()

  /**
   * Weeks a rung below the top may not bill yet: the firm above has not
   * accepted them, or it accepted a number nobody has said how to price.
   * Left off, and said out loud, the same way as undecided overtime.
   */
  const heldBack: {
    timesheetId: string
    kind: 'WAITING' | 'HELD'
    says: string
    /** Set where the week is already on an invoice receipt the payer recorded from us: all of it, or some days. */
    billedElsewhere?: 'WHOLE' | 'PART'
  }[] = []

  for (const ts of billing) {
    const rate = ts.sellContract.billRate // cents per hour

    // Guard: LEGACY_RULES.md — cannot invoice if rate <= 0
    if (rate <= 0) continue

    // ── What this week was decided to be worth ────────────────────────
    //
    // The terms are our contract's. At the top of a chain the answers are
    // the ones given on our own leg — the client's — and where only the
    // leg the hours live on carries one, that answer is used rather than
    // dropping decided overtime off the bill silently. Below the top, see
    // the next block.
    const rows = ts.overtimeDecisions ?? []

    // ── Below the top: the client's answer, at our own multiplier ─────
    //
    // The founder, 2026-10-19: a sub-vendor's overtime is priced on the
    // decision the client made when it signed the week, carried down the
    // chain the way the hours are. Which hours are overtime, and whether
    // they are a premium, the usual rate or banked, is the client's
    // answer on its own leg; what a premium hour is worth is our own
    // line's multiplier with the firm we bill, never the client's
    // (lib/money/client-overtime). The top of the chain — the prime's
    // bill to the client, and every direct placement — prices from the
    // answer on its own leg at the multiplier chosen there, as before.
    const belowTop = ts.payer != null && ts.top?.sellContractId !== ts.sellContractId
    const carried = belowTop ? carriedOvertime(rows, ts.top, ts.sellContract.overtimeMultiplierBps, ts.person.name) : null
    const unreadable = carried && !carried.ok ? carried.says : null

    const ownLeg = rows.filter((d) => d.sellContractId === ts.sellContractId)
    const answering = carried?.ok ? carried.rows : ownLeg.length > 0 ? ownLeg : rows
    // The line the week was decided against: the contract's own, else —
    // where somebody decided the week — the job's hours, the same line
    // the approval asked the question on. Pricing it against the
    // contract's silence left decided overtime off the bill.
    const policy = carried
      ? carried.ok ? carried.policy : { afterHours: null, multiplierBps: ts.sellContract.overtimeMultiplierBps }
      : lineFor(ts.sellContract, ts.sellContract.requirement, { stillToSign: false, decided: answering.length > 0 })

    const decisions: Decision[] = carried
      ? carried.ok ? carried.decisions : []
      : answering.map((d) => ({
          weekOf: d.weekOf.toISOString().slice(0, 10),
          treatment: d.treatment as Decision['treatment'],
          // The price comes from what was applied when somebody decided,
          // never from the contract's multiplier as it stands today.
          appliedBps: d.appliedBps,
          overtimeHours: Number(d.overtimeHours),
          accrualBps: d.accrualBps ?? undefined,
        }))
    // Rows, not their copies: the client's answer reaching a bill below it
    // is billed too, and no longer changes without restating that bill.
    const idOfWeek = new Map(
      rows
        .filter((d) => answering.some((a) => a.weekOf.getTime() === d.weekOf.getTime() && a.sellContractId === d.sellContractId))
        .map((d) => [d.weekOf.toISOString().slice(0, 10), d.id])
    )

    // How much of this timesheet belongs to the period being billed, and
    // in which bands. Read from the daily hours, so a week crossing the
    // boundary gives each month exactly its own days — nothing
    // apportioned, nothing rounded, and the same hour never billed
    // twice. The week is still judged whole against the threshold.
    const sheet = {
      id: ts.id,
      periodStart: ts.periodStart,
      periodEnd: ts.periodEnd,
      days: (ts.days as Record<string, number>) ?? {},
      leaveDays: (ts.leaveDays as Record<string, number>) ?? {},
      totalHours: Number(ts.totalHours),
    }
    let billable = billableInPeriod(sheet, period, terms.straddle, rate, policy, decisions)

    if (!billable) continue

    // A week of this period whose overtime below the top cannot be read
    // is left off, said, and bills once it can.
    if (unreadable) {
      heldBack.push({ timesheetId: ts.id, kind: 'HELD', says: unreadable })
      continue
    }


    // ── What the firm above accepted ──────────────────────────────────
    //
    // The founder, 2026-09-28: a firm bills only the hours the firm above
    // it accepted. Every rung, the top included: at the top of a chain,
    // and on every direct placement, the firm above is the client, so
    // when Northbend signs 38 of 40 the bill to Northbend is for 38. The
    // payer's accepted hours are billed: the days where it accepted what
    // was worked, the days with the difference cut off them where it
    // accepted fewer (rule 4), the accepted number straight where it
    // accepted more on a straight week, and nothing, said out loud,
    // where it has not accepted or where the arithmetic would be a guess.
    const rung = ts.payer
      ? whatTheRungBills({
          payerCompanyId: ts.payer.id,
          payerName: ts.payer.name,
          week: {
            periodStart: ts.periodStart,
            periodEnd: ts.periodEnd,
            totalHours: Number(ts.totalHours),
            days: sheet.days,
            personName: ts.person.name,
            hoursContract: ts.hoursContract,
            assertions: ts.assertions,
          },
          worked: {
            partial: billable.share.partial,
            overtimeHours: billable.split.overtimeHours,
            pendingHours: billable.split.pendingHours,
            bankedHours: billable.split.bankedHours,
          },
          afterHours: policy.afterHours ?? null,
        })
      : ({ kind: 'AS_WORKED' } as const)

    if (rung.kind === 'WAITING' || rung.kind === 'HELD') {
      heldBack.push({ timesheetId: ts.id, kind: rung.kind, says: rung.says })
      continue
    }

    // Already on a bill the payer recorded from us: never billed twice.
    if (ts.payer) {
      const cover = billedElsewhere(
        {
          personId: ts.person.id,
          personName: ts.person.name,
          days: sheet.days,
          periodStart: ts.periodStart.toISOString().slice(0, 10),
          periodEnd: ts.periodEnd.toISOString().slice(0, 10),
        },
        receiptsFor(ts.payer.id, ts.sellContractId)
      )
      if (cover.covered !== 'NONE') {
        heldBack.push({ timesheetId: ts.id, kind: 'HELD', says: cover.says!, billedElsewhere: cover.covered })
        continue
      }
    }

    // Fewer hours accepted than worked, or only some days (the founder,
    // 2026-09-29, rule 4): the days the acceptance covers, with what it
    // did not accept cut off overtime first and off the last days first.
    // From here the week is priced exactly as a week accepted whole —
    // bands, decisions, undecided hours left off and said — on what is
    // left of the days.
    if (rung.kind === 'CUT') {
      billable = billableInPeriod(sheet, period, terms.straddle, rate, policy, decisions, rung.accepted)
      if (!billable) continue
    }

    if (rung.kind === 'STRAIGHT') {
      // More hours accepted than were worked, on a straight, whole week:
      // `whatTheRungBills` refuses any such week with an hour over the
      // line. Rounded once, the way the
      // three-way check's extension rounds it.
      if (rung.hours <= 0 || rate <= 0) continue
      const cents = Math.round(rung.hours * rate)
      priced.set(ts.id, { hours: rung.hours, cents, working: null })
      const key = ts.sellContractId
      const existing = linesByContract.get(key)
      if (existing) {
        existing.totalHours = Math.round((existing.totalHours + rung.hours) * 100) / 100
        existing.amountCents += cents
        existing.timesheetIds.push(ts.id)
        if (ts.periodEnd > existing.periodEnd) existing.periodEnd = ts.periodEnd
      } else {
        linesByContract.set(key, {
          sellContractId: ts.sellContractId,
          personId: ts.person.id,
          personName: ts.person.name,
          billRate: rate,
          currency: ts.sellContract.billCurrency,
          totalHours: rung.hours,
          overtimeHours: 0,
          pendingHours: 0,
          amountCents: cents,
          timesheetIds: [ts.id],
          periodEnd: ts.periodEnd,
        })
      }
      continue
    }

    // Hours over the line that nobody has answered are not on this
    // invoice at any price — not as a zero-valued line and not folded
    // into the ordinary hours. They wait for a decision and bill on the
    // next run.
    pendingHours = Math.round((pendingHours + billable.pendingHours) * 100) / 100
    if (billable.pendingHours > 0) pendingByWeek.set(ts.id, billable.pendingHours)

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

  // Said, never swallowed: the weeks a rung may not bill yet, each in a
  // sentence naming the week and the firm whose acceptance it waits on.
  const heldSays = heldBack.length + expensesLeftOff.length > 0
    ? [...heldBack.map((h) => h.says), ...expensesLeftOff.map((x) => x.says)].join(' ')
    : null

  if (linesByContract.size === 0 && expenseRows.length === 0 && milestones.length === 0 && heldBack.length + expensesLeftOff.length > 0) {
    return reply(422, {
        error: {
          code: 'NOT_ACCEPTED_ABOVE',
          message: heldSays,
          heldBack,
          expensesLeftOff,
        },
      })
  }

  if (linesByContract.size === 0 && expenseRows.length === 0 && milestones.length === 0) {
    // The period's weeks may be on a draft of ours nobody has sent — the
    // supplier's twin's, typically. Name it and the way out, never the
    // generic reply (release walk, 2026-10-18).
    const heldByDraft = await prisma.invoice.findFirst({
      where: {
        engagementId, status: 'DRAFT',
        invoiceLines: { some: { sellContractId: { in: ownIds } } },
        periodStart: { lte: period.end }, periodEnd: { gte: period.start },
      },
      select: { id: true, number: true },
      orderBy: { periodStart: 'asc' },
    })
    if (heldByDraft) {
      return reply(422, {
        error: {
          code: 'ON_A_DRAFT',
          message: `Those weeks are on draft bill ${heldByDraft.number}, which has not been sent. Send it or withdraw it.`,
          draft: { id: heldByDraft.id, number: heldByDraft.number, href: `/dashboard/invoices/${heldByDraft.id}` },
        },
      })
    }
    return reply(422, {
        error: {
          code: 'ZERO_VALUE',
          message: bounded
            ? `Nothing signed and unbilled belongs to ${period.label}. A week crossing the ` +
              `edge of those dates bills whole in the period it ${terms.straddle === 'START' ? 'starts' : 'ends'} ` +
              'in, so it may be on the bill either side of them.'
            : 'All timesheets have zero hours or zero rate',
        },
      })
  }

  const lines = Array.from(linesByContract.values())

  // At the amount the payer accepted, decided above.
  const expLines = sortedExpenses.on.map((e) => expenseLine(e, minorPerUnit(e.currency)))

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
    return reply(422, { error: { code: 'CANNOT_CONSOLIDATE', message: consolidation.says } })
  }

  // Said, never swallowed. Hours over the line that nobody has answered
  // are the one thing on this run that will not be billed, and an AR
  // clerk who is not told reads a short invoice as a short month.
  const pendingSays =
    pendingHours > 0
      ? `${pendingHours} hour${pendingHours === 1 ? '' : 's'} over the weekly limit ` +
        'are not on this bill, because nobody has decided yet whether they are ' +
        'paid at the usual rate, at a premium, or banked as time off. ' +
        'Decide them and they bill on the next run.'
      : null

  const currency = lines[0]?.currency ?? expLines[0]?.currency ?? anchorContract.billCurrency // one currency per invoice, now checked
  const milestoneCents = milestones.reduce((sum, m) => sum + m.amountCents, 0)
  const total = lines.reduce((sum, line) => sum + line.amountCents, 0) / minorPerUnit(currency) + expenseTotal(expLines, minorPerUnit(currency)) + milestoneCents / minorPerUnit(currency)

  // The order this bill draws on: the one its weeks' line is on, else —
  // on a bill of expenses alone — the one the line its expenses are
  // billed on is on. A bill of only an expense used to name no order, so
  // the payer's check asked for one it had and refused to pay it.
  const billOrderId =
    billing.find((t) => t.sellContract.workOrderId)?.sellContract.workOrderId ??
    expLines.map((l) => contractById.get(l.sellContractId)?.workOrderId ?? null).find((x) => x != null) ??
    null

  // ── The order's ceiling, before anything is drafted ─────────────────
  //
  // Release walk, 2026-10-18: a bill was drafted for $4,720 against an
  // order with $1,000 left and was refused only when somebody pressed
  // Send — the three-way check refuses it there, and only the payer may
  // waive a ceiling, never the firm billing. A draft that can never be
  // sent is refused here instead, in the same terms. It is not cut down
  // to fit: which hours a ceiling leaves off is a choice for the two
  // firms (a change order, or a bill for fewer weeks), not one to make
  // by trimming a line. Counted the way the check counts it — every bill
  // sent and every invoice receipt typed in against the order
  // (lib/money/order-drawn), and only in the order's currency.
  {
    const orderId = billOrderId
    const order = orderId
      ? await prisma.workOrder.findUnique({ where: { id: orderId }, select: { id: true, number: true, amount: true, currency: true } })
      : null
    if (order && order.currency.toUpperCase() === String(currency).toUpperCase()) {
      const per = minorPerUnit(currency)
      const ceilingMinor = Math.round(parseFloat(order.amount.toString()) * per)
      const drawn = await drawnOnOrder(order)
      const thisMinor = Math.round(total * per)
      if (drawn.foreign.length === 0 && drawn.cents + thisMinor > ceilingMinor) {
        const left = Math.max(0, ceilingMinor - drawn.cents)
        return reply(422, {
          error: {
            code: 'PO_CEILING',
            message:
              `Order ${order.number} has ${amount(left, currency)} left and this bill would be ` +
              `${amount(thisMinor, currency)}, over by ${amount(thisMinor - left, currency)}. It could not be sent, ` +
              `so it is not drafted. Ask your customer to raise the order, or bill fewer weeks.`,
          },
        })
      }
    }
  }

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
    return reply(422, { error: { code: 'SELF_BILLED', message: self.says, field: 'clientDocumentNumber' } })
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
  // The agreement first (founder, 2026-10-18): the net days, what they run
  // from and the currency are the agreement's with the firm above; the
  // order, then the line, differ only where they give a reason.
  const issuedAt = new Date()
  const { terms_, due } = billDue({
    line: termsContract ?? null,
    engagementAgreement: engagement.msa,
    companyName: caller.company!.name,
    customerName: billedTo.name ?? 'the client',
    periodEnd: period.end,
    issuedAt,
  })
  const paymentTerms = terms_.paymentTermsDays.value
  const dueAt = due.dueAt

  // Nothing records when a client approves an invoice — `Invoice` has
  // `receivedAt` and no `approvedAt` — so a contract on APPROVAL_DATE
  // terms cannot be dated at all, and says that rather than counting
  // from a date nobody agreed to.
  const termsNote =
    terms_.paymentTermsFrom.value === 'APPROVAL_DATE'
      ? 'This contract counts its payment days from the day the client approves the bill, ' +
        'and nothing here records that yet. Until it does, the bill cannot be dated and ' +
        'will not be chased.'
      : null

  /** What this bill would be, for a person to read before it exists. */
  const plannedOf = (): PlannedBill => ({
    engagementId,
    customerName: partners.billTo.party.name,
    periodStart: period.start,
    periodEnd: period.end,
    periodLabel: period.label,
    currency,
    totalMinor: Math.round(total * minorPerUnit(currency)),
    hours: Math.round(lines.reduce((n, l) => n + l.totalHours, 0) * 100) / 100,
    people: lines.map((l) => ({ personName: l.personName, hours: l.totalHours, amountMinor: l.amountCents })),
    timesheetIds: lines.flatMap((l) => l.timesheetIds),
    sellContractIds: [...new Set([...lines.map((l) => l.sellContractId), ...expLines.map((l) => l.sellContractId)])],
    expenseCount: expLines.length,
    milestoneCount: milestones.length,
    heldBack: heldSays,
    pending: pendingSays,
    dueSays: due.says,
    setAside: terms_.setAside,
    weeks: [...priced].map(([timesheetId, p]) => ({ timesheetId, hours: p.hours, amountMinor: p.cents })),
    weeksLeftOff: heldBack.map((h) => ({ ...h })),
    weeksUndecided: [...pendingByWeek].map(([timesheetId, pendingHours]) => ({ timesheetId, pendingHours })),
  })

  const write = async (tx: Tx) => {
      // Generate invoice number: IN_{engagement_seq}_{3-digit}
      // Count existing invoices for this engagement for sequencing
      const existingCount = await tx.invoice.count({
        where: { engagementId },
      })
      // Use engagement ID fragment for the contract portion
      const engFragment = engagementId.slice(-6).toUpperCase()
      // Counted, then moved past any number still standing: a withdrawn
      // draft leaves a gap, and the count alone would then land on a bill
      // raised after it.
      let n = existingCount + 1
      while (await tx.invoice.findUnique({ where: { number: `IN_${engFragment}_${String(n).padStart(3, '0')}` }, select: { id: true } })) n++
      // Their number where they self-bill. Never both.
      const number = self.number ?? `IN_${engFragment}_${String(n).padStart(3, '0')}`

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
          // building a feature; this is the write. A draft has not been
          // billed: its day is written when it is sent.
          issuedAt: draft ? null : issuedAt,
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
          // A draft stays inside the firm until somebody sends it
          // (lib/money/bill-send); everything else is raised as before.
          status: draft ? 'DRAFT' : 'ISSUED',
          // The four parties, written rather than left null.
          soldToId: partners.soldTo.party.id,
          billToId: partners.billTo.party.id,
          shipToId: partners.shipTo?.party.id ?? null,
          payerId: partners.payer.party.id,
          // Inherit the PO the work was authorized under. Without it the
          // three-way match has only two records to compare.
          workOrderId: billOrderId,
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
      //
      // A draft stamps nothing (release walk, 2026-10-18): it has been sent
      // to nobody, and a person may still withdraw it. Its decisions are
      // written on its "drafted" log row below and stamped when it is sent
      // (`markSent` in lib/money/bill-send).
      if (!draft && decisionsBilled.size > 0) {
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
      // and the expense marked INVOICED with this invoice on it — where
      // this is the employer's own bill of it. A firm above the employer
      // bills it on its own line and leaves the employer's column alone:
      // that column is the employer's rung, and each rung above reads
      // billed and paid from its own lines (coordinator's decision,
      // 2026-10-19).
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
        if (employersRung.has(l.expenseId)) {
          await tx.expense.update({ where: { id: l.expenseId }, data: { status: 'INVOICED', invoiceId: invoice.id } })
        }
      }

      // Deliberately no write back to Timesheet here. The InvoiceLine rows
      // are the link, and an invoice must never touch the approval state of
      // the receipts that justify it.
      const allTimesheetIds = lines.flatMap((l) => l.timesheetIds)

      // The "invoice to raise" cycle on each contract billed here is done
      // — when it is raised. A draft closes it when it is sent.
      if (!draft) {
        for (const l of lines) {
          await completeCycle(tx, { sellContractId: l.sellContractId, kind: 'INVOICE_GENERATE', periodEnd: l.periodEnd })
        }
      }

      // AutomationLog
      await tx.automationLog.create({
        data: {
          companyId: caller.company!.id,
          // The same action either way; the summary says which. The twin's
          // own unprompted act is on its ledger and logged there.
          action: 'INVOICE_GENERATED',
          summary: `Bill ${number} ${draft ? 'drafted' : 'generated'}: ${lines.length} line item(s), ${allTimesheetIds.length} timesheet(s)${expLines.length ? `, ${expLines.length} expense(s)` : ''}${milestones.length ? `, ${milestones.length} milestone(s)` : ''}, ${fromUnits(total, currency)} total, due ${dueAt.toISOString().slice(0, 10)}${pendingSays ? `. ${pendingSays}` : ''}${heldSays ? ` ${heldSays}` : ''}`,
          reason: opts.by ?? `Generated by ${caller.person.name}`,
          payload: {
            invoiceId: invoice.id,
            number,
            engagementId,
            lineCount: lines.length,
            timesheetCount: allTimesheetIds.length,
            total,
            currency,
            dueAt: dueAt.toISOString(),
            ...(draft ? { overtimeDecisionIds: [...decisionsBilled] } : {}),
          },
          reversible: true,
        },
      })

      return invoice
  }

  if (opts.dryRun) {
    return {
      ok: true,
      status: 200,
      planned: plannedOf(),
      body: { data: { planned: plannedOf() } },
    }
  }

  try {
    const result = opts.tx ? await write(opts.tx) : await prisma.$transaction(write)

    // After the transaction. An invoice event for an invoice that rolled
    // back would have an AP team chasing a number that does not exist.
    // A draft is not an invoice anybody has been sent: its event goes
    // when it is sent.
    if (!draft && !opts.tx) void emit({
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

    return {
      ok: true,
      status: 201,
      invoiceId: result.id,
      planned: plannedOf(),
      body: {
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
        // What the bill covers, said where it is less than the contract
        // period or the dates asked for were cut at its end.
        window: {
          periodStart: period.start.toISOString(),
          periodEnd: period.end.toISOString(),
          partOf: bill.contractPeriod.label,
          narrowed: bill.narrowed,
          says: bill.clipped ?? (bill.narrowed ? `Bills ${period.label}.` : null),
        },
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
        // The weeks left off because the firm above has not accepted
        // them, or accepted a number nobody has said how to price.
        heldBack: { weeks: heldBack, expenses: expensesLeftOff, says: heldSays },
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
        message: `Bill ${result.number} ${draft ? 'drafted' : 'generated'}: ${fromUnits(Number(result.total), result.currency)} total`,
      },
      },
    }
  } catch (err: any) {
    // Inside somebody else's transaction, the failure is theirs to roll back.
    if (opts.tx) throw err
    if (err?.code === 'P2002') {
      return reply(409, { error: { code: 'DUPLICATE', message: 'That bill number is already taken — try again' } })
    }
    reportError('Invoice generation failed:', err)
    return reply(500, { error: { code: 'INTERNAL', message: 'The bill could not be generated' } })
  }
}
