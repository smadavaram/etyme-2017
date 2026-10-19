import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { staffOnly } from '@/lib/seat'
import { hasAnyPermission } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { endClientFilter } from '@/lib/resolve-end-client'
import { chainTop, payerRung, viaPhrase } from '@/lib/chain-top'
import { mayNameSubVendors, namesForClient } from '@/lib/chain-names'
import { weekFlag, periodWord } from '@/lib/timesheet-flag'
import { waitingSince, daysWaiting } from '@/lib/auto-approval'
import { weekTurn } from '@/app/api/timesheets/ladder'
import type { LadderRung } from '@/app/api/timesheets/chain-turn'
import { clientDecidedFor, clientDecidedSentence } from '@/app/api/timesheets/client-decided'
import { desksFor } from '@/lib/supplier-desks'
import { mayActAt, STAGE_WORD, yourClientsSays, type Stage, type Decision } from '@/lib/supplier-onboarding'
import { paperingRow } from '@/lib/papering'
import { seatedDesk } from '@/lib/resolve-client-company'
import { rate as rateSays } from '@/lib/money-display'
import { payersBook } from '@/lib/money/payers-acceptance-read'
import { disputedBillDecision } from './disputed-bill'
import { ACCEPTS_EXPENSES, expenseAcceptanceDecision } from './expense-acceptance'
import { expensesWaitingOn } from '@/lib/money/expense-acceptance-read'
import { ENDING_SOON_READERS, rateOnEndingSoon } from '@/lib/releasing-soon'
import { waitingQuestions } from '@/lib/twin/ledger'
import { TWIN_ACTS } from '@/lib/autonomy'
import { ASK_ETYME_HREF } from '@/lib/nav-table'
import { logBulkAccess } from '@/lib/access-log'
import { accountFilterFor } from '@/lib/account-walls'
import { andAll } from '@/lib/walls'
import { startPaperwork, agreementsOnFile } from '@/app/api/program/desk-findings'
import { deskItems, deskRows, deskHeadline } from '@/app/dashboard/program/needs-you'

/**
 * GET /api/decisions
 *
 * BUILD.md §3 — The machine: "what needs a person right now"
 *
 * Aggregates pending items across all working surfaces into a single
 * prioritized queue. Each item is a decision that requires human input
 * — not an informational notification.
 *
 * Categories:
 *   TIMESHEET_APPROVAL — submitted timesheets awaiting approval
 *   EXPENSE_APPROVAL   — submitted expenses awaiting approval
 *   EXPENSE_ACCEPTANCE — an approved expense this firm pays for, its turn to accept
 *   ROLLOFF_ACTION     — contracts ending soon with no action
 *   SUBMISSION_REVIEW  — submissions waiting for vendor review
 *   INVOICE_OVERDUE    — invoices past due
 *   RATE_CONFIRMATION  — rate changes that need confirmation
 *   SUPPLIER_REVIEW    — a firm recommended, waiting on Procurement's paperwork and yes
 *   CONTRACT_PAPERING  — a placement won and still a draft: the contract desk's
 *   CONTRACT_START     — a contract papered and nobody started on it yet
 *   TWIN_QUESTION      — the twin asked a person, and this seat may answer it
 *   START_HELD         — a client's start the paperwork will refuse on the day
 *   NO_AGREEMENT       — a client's supplier with people on site and no agreement on file
 *
 * Each decision has: type, title, subtitle, urgency (HIGH|MEDIUM|LOW),
 * entityType, entityId, dueDate (if applicable), and actionUrl.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'The decision queue')
  if (notStaff) return notStaff

  const companyId = caller.company?.id
  if (!companyId) {
    return NextResponse.json({ data: { decisions: [], counts: {} } })
  }

  const now = new Date()
  const decisions: any[] = []

  // ── 1. Timesheets pending approval ────────────────
  if (hasAnyPermission(caller.permissions, ['timesheets.approve'])) {
    // Two signatures, two desks. The sheet lives on the employer's
    // contract, which in a chain is two firms away from the site — and
    // the client desk that signs the work never heard it was waiting.
    // Nike's hiring manager read "Nothing needs you" over six weeks of
    // unsigned hours.
    const pendingTimesheets = await prisma.timesheet.findMany({
      where: {
        status: 'SUBMITTED',
        OR: [
          // The employer, accepting what it will pay for.
          { sellContract: { companyId }, employerAcceptedAt: null },
          // The client, signing that the work happened.
          { sellContract: endClientFilter(companyId), clientApprovedAt: null },
        ],
      },
      include: {
        person: { select: { name: true } },
        sellContract: {
          select: {
            id: true, personId: true, startDate: true, endDate: true,
            billRate: true, companyId: true, clientCompanyId: true, endClientCompanyId: true,
            // What an overtime hour is worth between the employer and the
            // firm above it: the line the client's decision is priced on
            // when the week reaches the employer (`clientDecidedOn`).
            overtimeMultiplierBps: true,
            company: { select: { name: true } },
            clientCompany: { select: { name: true } },
            requirement: { select: { hoursPerWeek: true } },
          },
        },
      },
      orderBy: { periodEnd: 'asc' },
      take: 20,
    })

    // The client knows its people by the supplier it pays, not by the
    // firm two rungs down that employs them.
    const clientRows = pendingTimesheets.filter((ts) => ts.sellContract.companyId !== companyId)
    const people = [...new Set(clientRows.map((ts) => ts.personId))]
    // Every rung of every chain these people stand on here, so a week
    // filed against the employer's leg can be walked up to the contract
    // this reader is actually billed on. A queue that prices a week at
    // the leg it happens to be filed against is quoting the client its
    // supplier's supplier's rate.
    const rungs = people.length > 0
      ? await prisma.sellContract.findMany({
          where: { ...endClientFilter(companyId), personId: { in: people } },
          select: {
            id: true, personId: true, companyId: true, clientCompanyId: true,
            startDate: true, endDate: true, billRate: true,
            company: { select: { name: true } },
          },
        })
      : []

    // ── And whose name goes on the row ──────────────────────────────
    //
    // The same walk, for the name rather than the rate (`lib/chain-names`,
    // and they must never disagree). This queue used to name the firm it
    // was billed by where it could and fall back to `sellContract.company`
    // where it could not — which is the employer, the firm two rungs
    // down, printed on its own customer's queue. And it never read the
    // disclosure term, so a client whose agreement entitles it to the
    // sub's name was shown its prime's instead.
    const terms = people.length > 0
      ? await prisma.masterAgreement.findMany({
          where: { clientId: companyId },
          select: { clientId: true, vendorId: true, disclosesSubVendors: true, status: true },
        })
      : []

    /** One rung, in the shape the name rule reads. */
    const asRung = (c: {
      id: string; personId: string; companyId: string; clientCompanyId: string
      company: { name: string }
    }) => ({
      id: c.id, personId: c.personId, companyId: c.companyId,
      companyName: c.company.name, clientCompanyId: c.clientCompanyId,
    })

    // The legs the weeks were filed against go in beside the chains, so
    // the walk starts from the row the desk is actually looking at. One
    // of each: two copies of a rung are two answers to "what is above
    // this", and the rule reads that as a chain nobody can follow.
    const seenNames = namesForClient(
      [
        ...new Map(
          [
            ...rungs.map(asRung),
            ...pendingTimesheets
              .filter((ts) => ts.sellContract.companyId !== companyId)
              .map((ts) => asRung(ts.sellContract)),
          ].map((r) => [r.id, r])
        ).values(),
      ],
      companyId,
      (primeCompanyId: string) => mayNameSubVendors(terms, companyId, primeCompanyId)
    )

    for (const ts of pendingTimesheets) {
      // From the day the week was sent, not the day it ended: a week sent
      // three weeks late has waited on this desk since it arrived.
      const daysSinceSubmit = daysWaiting(ts, now)
      const sc = ts.sellContract
      const asClient = sc.companyId !== companyId
      // The employer's turn comes last, once every firm above it has
      // signed (`app/api/timesheets/chain-turn`). Offering it sooner put
      // a week on its desk that the approve route now refuses.
      let clientDecided: string | null = null
      if (!asClient && sc.companyId !== (sc.endClientCompanyId ?? sc.clientCompanyId)) {
        const { turn, ladder } = await weekTurn(ts, companyId)
        if (!turn.ok) continue
        // Below the top: the client decided the overtime when it signed,
        // and the employer is told, never asked (founder, 2026-10-19).
        clientDecided = await clientDecidedOn(ts.id, ts.person.name, ladder, sc.id, sc.overtimeMultiplierBps)
      }
      // Inside a sentence, so the phrase and not the cell: "through
      // Computer Systems" where the name is this reader's to read, and
      // "through a firm Computer Systems arranged" where it is not
      // (`viaPhrase`, which stops the word appearing twice). Never the
      // employer's own name, which is what a blank walk used to fall
      // through to.
      const seenName = seenNames.get(sc.companyId)
      const supplier = !asClient
        ? sc.company.name
        : seenName
          ? viaPhrase(seenName)
          : 'a supplier on this site'
      // A client sees the hours. The rate on this sheet is what the
      // employer charges the rung above it, which is the client's own
      // rate only on a direct placement. Where the reader is further up
      // the chain the week is priced at the rung it is billed on, and
      // where no single rung covers it there is no price at all — a
      // guess here is either the prime's margin on its own customer's
      // screen or an understated bill.
      const filed = rungs.find((r) => r.id === sc.id)
      const paying =
        !asClient || sc.clientCompanyId === companyId
          ? { clientCompanyId: sc.clientCompanyId, billRate: sc.billRate }
          : filed
            ? payerRung(filed, rungs)
            : null
      const amount =
        paying && (!asClient || paying.clientCompanyId === companyId)
          ? Number(ts.totalHours) * (paying.billRate / 100)
          : null
      const period = periodWord(ts.periodStart, ts.periodEnd)
      // Checked against the contract, so the signer does not have to
      // notice: more hours than the role runs, or a week past its end.
      // The approval route's own flag (`weekFlag`), so the queue offers
      // "Approve anyway" on exactly the weeks the route asks a reason for.
      const flag = weekFlag({
        hours: Number(ts.totalHours), hoursPerWeek: sc.requirement?.hoursPerWeek ?? null,
        periodEnd: ts.periodEnd, contractEnd: sc.endDate,
        anomalyScore: ts.anomalyScore, anomalyReason: ts.anomalyReason,
      })

      decisions.push({
        type: 'TIMESHEET_APPROVAL',
        title: `Approve timesheet — ${ts.person.name}`,
        named: { whose: ts.person.name, what: 'week', whats: 'weeks' },
        subtitle: asClient
          ? `${ts.totalHours}h · through ${supplier} · ${period}`
          : `${ts.totalHours}h · ${sc.clientCompany?.name ?? 'Unknown client'} · ${period}`,
        urgency: daysSinceSubmit >= 5 ? 'HIGH' : daysSinceSubmit >= 2 ? 'MEDIUM' : 'LOW',
        entityType: 'TIMESHEET',
        entityId: ts.id,
        dueDate: null,
        // The week itself, opened — not the list it sits in.
        actionUrl: `/dashboard/timesheets?id=${ts.id}`,
        amount,
        flag,
        // Below the top of a chain, the client's overtime decision as a
        // fact on the card; null at the top and where it decided nothing.
        clientDecided,
        createdAt: waitingSince(ts).toISOString(),
      })
    }

    // ── The firm in the middle, when the week reaches it ──────────────
    //
    // A prime between the client and the employer accepts what it pays
    // the firm below it, after the client has signed and before the
    // employer may. It had no step and heard nothing, so the week sat
    // until somebody noticed a vendor bill with no acceptance behind it.
    const reached = await prisma.timesheet.findMany({
      where: {
        status: 'SUBMITTED',
        clientApprovedAt: { not: null },
        employerAcceptedAt: null,
        sellContract: { companyId: { not: companyId } },
        person: { sellContracts: { some: { companyId } } },
        id: { notIn: pendingTimesheets.map((t) => t.id) },
      },
      include: {
        person: { select: { name: true } },
        sellContract: {
          select: {
            companyId: true, clientCompanyId: true, endClientCompanyId: true, endDate: true,
            requirement: { select: { hoursPerWeek: true } },
          },
        },
      },
      orderBy: { periodEnd: 'asc' },
      take: 20,
    })
    for (const ts of reached) {
      const { turn, ladder } = await weekTurn(ts, companyId)
      if (!turn.ok || turn.signer.role !== 'PASS_THROUGH') continue
      const paysOn = await prisma.sellContract.findUnique({
        where: { id: turn.signer.rungId },
        select: { billRate: true, overtimeMultiplierBps: true, company: { select: { name: true } } },
      })
      const daysSinceSigned = Math.floor((now.getTime() - (ts.clientApprovedAt ?? ts.periodEnd).getTime()) / 86_400_000)
      decisions.push({
        type: 'TIMESHEET_APPROVAL',
        title: `Accept timesheet — ${ts.person.name}`,
        named: { whose: ts.person.name, what: 'week', whats: 'weeks' },
        subtitle: `${ts.totalHours}h · from ${paysOn?.company.name ?? 'your supplier'} · ${periodWord(ts.periodStart, ts.periodEnd)} · signed above you`,
        urgency: daysSinceSigned >= 5 ? 'HIGH' : daysSinceSigned >= 2 ? 'MEDIUM' : 'LOW',
        entityType: 'TIMESHEET',
        entityId: ts.id,
        dueDate: null,
        // The week itself, opened — not the list it sits in.
        actionUrl: `/dashboard/timesheets?id=${ts.id}`,
        // What this firm pays on the rung it is accepting — its own contract.
        amount: paysOn ? Number(ts.totalHours) * (paysOn.billRate / 100) : null,
        // The client's overtime decision, on this firm's own line with the
        // firm it pays. It is told, never asked (founder, 2026-10-19).
        clientDecided: await clientDecidedOn(ts.id, ts.person.name, ladder, turn.signer.rungId, paysOn?.overtimeMultiplierBps),
        flag: weekFlag({
          hours: Number(ts.totalHours), hoursPerWeek: ts.sellContract.requirement?.hoursPerWeek ?? null,
          periodEnd: ts.periodEnd, contractEnd: ts.sellContract.endDate,
          anomalyScore: ts.anomalyScore, anomalyReason: ts.anomalyReason,
        }),
        createdAt: ts.periodEnd.toISOString(),
      })
    }
  }

  // ── 2. Expenses pending approval ──────────────────
  if (hasAnyPermission(caller.permissions, ['invoices.read'])) {
    const pendingExpenses = await prisma.expense.findMany({
      where: {
        companyId,
        status: 'SUBMITTED',
      },
      include: {
        person: { select: { name: true } },
        sellContract: {
          select: {
            clientCompany: { select: { name: true } },
          },
        },
      },
      orderBy: { submittedAt: 'asc' },
      take: 10,
    })

    for (const exp of pendingExpenses) {
      const daysSinceSubmit = exp.submittedAt
        ? Math.floor((now.getTime() - exp.submittedAt.getTime()) / (1000 * 60 * 60 * 24))
        : 0

      decisions.push({
        type: 'EXPENSE_APPROVAL',
        title: `Review expense — ${exp.person.name}`,
        named: { whose: exp.person.name, what: 'expense', whats: 'expenses' },
        // Expense.total is a Decimal in whole currency, not cents — the
        // schema says so where InvoiceLine is defined. Dividing by a
        // hundred turned a $149.98 expense into "$1.50" on the founder's
        // main screen, and an $1,801 one into "$18.01".
        subtitle: `$${Number(exp.total).toFixed(2)} · ${exp.category} · ${exp.billable ? 'Billable' : 'Internal'} · ${exp.sellContract?.clientCompany?.name ?? ''}`,
        urgency: daysSinceSubmit >= 5 ? 'HIGH' : 'MEDIUM',
        entityType: 'EXPENSE',
        entityId: exp.id,
        dueDate: null,
        actionUrl: '/dashboard/expenses',
        amount: Number(exp.total),
        createdAt: exp.submittedAt?.toISOString() ?? exp.createdAt.toISOString(),
      })
    }
  }

  // ── 2a. Expenses waiting on this firm to accept them ──────────────
  //
  // The founder, 2026-10-19 (decision 1): an expense is accepted like a
  // week, by each firm that pays for it, the client first. Money says
  // whose turn it is (`expensesWaitingOn`) and owns the one route that
  // records the answer; the row is `./expense-acceptance`. Gated on the
  // same two permissions that route asks for, so the card is never one
  // the route refuses.
  if (hasAnyPermission(caller.permissions, ACCEPTS_EXPENSES)) {
    const waiting = await expensesWaitingOn(companyId)
    if (waiting.length > 0) {
      // A person's expense read on this firm's queue is a read of their
      // data, and the queue row carries no person id of its own.
      const people = await prisma.expense.findMany({
        where: { id: { in: waiting.map((e) => e.expenseId) } },
        select: { personId: true },
      })
      logBulkAccess([...new Set(people.map((p) => p.personId))], {
        actorPersonId: caller.person.id,
        actorCompanyId: companyId,
        action: 'CONTRACT_VIEW',
        reason: 'Read in the decision queue: an expense this firm pays for, waiting on it to accept',
      })
    }
    for (const e of waiting) {
      decisions.push({
        type: 'EXPENSE_ACCEPTANCE',
        named: { whose: e.personName, what: 'expense', whats: 'expenses' },
        ...expenseAcceptanceDecision(e, now),
      })
    }
  }

  // ── 2b. Bills that did not match ─────────────────
  //
  // Three-way match exceptions, routed to the desk that pays. A bill
  // recorded as DISPUTED stays out of every payment run until somebody
  // with authority says why it should go in — so it is a decision, and
  // it belongs here rather than in a filter on the AP page.
  //
  // Except where what failed is a week this firm has not accepted. That
  // one nobody may wave through (money, 2026-09-28: no rung pays on a
  // week it has not accepted), so it goes to the desk that accepts weeks,
  // in money's own sentence, and not to AP with an offer nobody can take
  // up (`./disputed-bill`).
  const billDesk = {
    mayRecordPayment: hasAnyPermission(caller.permissions, ['payments.record']),
    mayAcceptWeeks: hasAnyPermission(caller.permissions, ['timesheets.approve']),
  }
  if (billDesk.mayRecordPayment || billDesk.mayAcceptWeeks) {
    const disputed = await prisma.vendorBill.findMany({
      where: { companyId, status: 'DISPUTED' },
      include: { vendorCompany: { select: { name: true } } },
      orderBy: { receivedAt: 'asc' },
      take: 20,
    })
    for (const b of disputed) {
      // The same question the AP exception queue asks of the same bill,
      // ending the same way ("then pay this invoice" — it is recorded
      // already), so the two screens cannot word one bill two ways.
      const book = b.buyContractId && b.periodStart && b.periodEnd
        ? await payersBook({
            buyContractId: b.buyContractId, periodStart: b.periodStart, periodEnd: b.periodEnd, then: 'pay',
          })
        : null
      const row = disputedBillDecision(
        {
          id: b.id, number: b.number, vendorName: b.vendorCompany.name,
          totalCents: b.totalCents, dueAt: b.dueAt, receivedAt: b.receivedAt,
        },
        book && book.waiting.length > 0 ? book.notAccepted : null,
        billDesk
      )
      if (row) {
        decisions.push({
          type: 'BILL_DISPUTED',
          named: { whose: b.vendorCompany.name, what: 'invoice receipt', whats: 'invoice receipts' },
          ...row,
        })
      }
    }
  }

  // ── 2c. Suppliers in the pipeline, on this caller's desk ──
  {
    const waiting = await prisma.supplierRequest.findMany({
      where: { companyId, state: { in: ['RECOMMENDED', 'IN_REVIEW'] } },
      orderBy: { createdAt: 'asc' },
      take: 20,
    })
    if (waiting.length > 0) {
      const names = await prisma.person.findMany({ where: { id: { in: waiting.map((w) => w.recommendedById) } }, select: { id: true, name: true } })
      const nameOf = new Map(names.map((n) => [n.id, n.name]))
      for (const w of waiting) {
        const stage = w.stage as Stage
        const desks = await desksFor(companyId, w.recommendedById)
        const verdict = mayActAt({ stage, permissions: caller.permissions, callerId: caller.person.id, recommendedById: w.recommendedById, decisions: (w.decisions as unknown as Decision[]) ?? [], desks, firmName: w.name })
        if (!verdict.ok) continue
        const items = ((w.checklist as any[]) ?? []).filter((i) => i.desk === stage)
        const required = items.filter((i) => i.required)
        const held = required.filter((i) => i.state === 'HELD' || i.state === 'WAIVED').length
        const provided = required.filter((i) => i.state === 'PROVIDED').length
        const days = Math.floor((now.getTime() - w.createdAt.getTime()) / 86_400_000)
        decisions.push({
          type: 'SUPPLIER_REVIEW',
          title: `Review supplier — ${w.name}`,
          named: { whose: w.name, what: 'supplier review', whats: 'supplier reviews' },
          subtitle: required.length > 0
            ? `Recommended by ${nameOf.get(w.recommendedById) ?? 'somebody'} · ${STAGE_WORD[stage]}: ${held} of ${required.length} verified${provided ? `, ${provided} to verify` : ''}`
            : `Recommended by ${nameOf.get(w.recommendedById) ?? 'somebody'} · with ${STAGE_WORD[stage]}: ${w.skills.length ? w.skills.join(', ') : w.reason.slice(0, 60)}`,
          urgency: days >= 7 ? 'HIGH' : 'MEDIUM',
          entityType: 'SUPPLIER_REQUEST',
          entityId: w.id,
          dueDate: null,
          actionUrl: '/dashboard/suppliers',
          amount: null,
          createdAt: w.createdAt.toISOString(),
        })
      }
    }
  }

  // ── 2c-bis. A requisition waiting on this desk ───────────────────
  //
  // "The desk that acts is the desk that hears" — the rule the client
  // dashboard week produced, and the approval chain was the one queue it
  // never reached. Every desk in the program console read timesheets and
  // expenses and nothing else, so an HR partner, a cost-center lead and
  // an account owner each landed on /dashboard/program, were shown
  // nothing, and stopped: the requisition they had to sign existed only
  // on a page they would have had to think to open. Addendum E's
  // governance is worth nothing if the person it routes to is not told.
  //
  // Entitlement here is not a permission. The approve route lets exactly
  // one person decide a row — the one named on it, at the lowest rank
  // still pending ("an approval someone else can click is not an
  // approval") — so the query asks that and nothing else. A desk at rank
  // 2 is not shown a row rank 1 has not cleared, because it is not
  // theirs to decide yet and a queue that lists work nobody may do is a
  // queue people stop reading.
  {
    const mine = await prisma.requirementApproval.findMany({
      where: {
        approverId: caller.person.id,
        outcome: 'PENDING',
        requirement: {
          companyId,
          // A requisition that was cancelled or filled underneath a
          // pending approval is nobody's decision any more.
          status: { notIn: ['CANCELLED', 'FILLED', 'CLOSED'] },
          approvalState: 'PENDING_APPROVAL',
        },
      },
      select: {
        id: true, rank: true, reason: true, createdAt: true,
        requirement: {
          select: {
            id: true, title: true, headcount: true, billMax: true, createdAt: true,
            costCenter: { select: { code: true } },
            approvals: { select: { rank: true, outcome: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
    })

    for (const a of mine) {
      const pending = a.requirement.approvals.filter((r) => r.outcome === 'PENDING')
      const lowest = Math.min(...pending.map((r) => r.rank))
      // Not this desk's turn yet. It will appear the day it is.
      if (a.rank !== lowest) continue

      const days = Math.floor((now.getTime() - a.createdAt.getTime()) / 86_400_000)
      const heads = a.requirement.headcount ?? 1
      const scale = `${heads} ${heads === 1 ? 'position' : 'positions'}`
      // Through the one formatter, which takes minor units only. A
      // hand-rolled dollar sign over a cents column is how a $145/hr
      // placement was written into a diary entry as $14,500/hr.
      const ceiling = a.requirement.billMax != null ? ` · up to ${rateSays(a.requirement.billMax)}` : ''
      const cc = a.requirement.costCenter?.code ? ` · ${a.requirement.costCenter.code}` : ''
      decisions.push({
        type: 'REQUISITION_APPROVAL',
        title: `Approve job request — ${a.requirement.title}`,
        named: { whose: null, what: `the ${a.requirement.title} job request`, whats: 'job requests' },
        // What it is waiting for, in the engine's own words — the reason
        // the rule wrote when it routed this to this desk, which is the
        // question this desk is being asked.
        subtitle: `${a.reason.replace(/\s*\.\s*$/, '')}${scale ? ` · ${scale}` : ''}${ceiling}${cc}`,
        urgency: days >= 5 ? 'HIGH' : days >= 2 ? 'MEDIUM' : 'LOW',
        entityType: 'REQUISITION',
        entityId: a.requirement.id,
        dueDate: null,
        // The role's own page, where the approve, reject and hand-back
        // buttons are, rather than the list it would have to be found in.
        actionUrl: `/dashboard/requisitions/${a.requirement.id}`,
        amount: null,
        createdAt: a.createdAt.toISOString(),
      })
    }
  }

  // ── 2d. Placements won and not yet papered, and papered and not started ──
  //
  // The handoff from the desk that sells to the desk that papers. An
  // Account Manager holds `submissions.create` and not `assignments.write`;
  // a Contract Manager holds the reverse. So the award ends one desk's
  // job and starts another's, and until this row existed the second desk
  // was never told: a won deal became a DRAFT contract on nobody's queue,
  // found only by somebody browsing the contracts list.
  //
  // Gated on the permission that acts, not on a role name. A firm that
  // renamed Contract Manager still sees its own drafts, and an account
  // manager who cannot write a contract is not shown a row they would be
  // refused on — they were told at the award instead, by name, who has it.
  if (hasAnyPermission(caller.permissions, ['assignments.write'])) {
    const waiting = await prisma.sellContract.findMany({
      where: { companyId, state: { in: ['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED'] } },
      select: {
        id: true, state: true, billRate: true, billCurrency: true,
        startDate: true, createdAt: true, updatedAt: true,
        person: { select: { name: true } },
        clientCompany: { select: { name: true } },
        requirement: { select: { title: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
    })

    for (const c of waiting) {
      // When this contract reached the state it is stuck in. A draft has
      // waited since the award, which is when the row was written; a
      // papered one since somebody papered it, which is its last write.
      const since = c.state === 'DRAFT' ? c.createdAt : c.updatedAt
      const row = paperingRow(
        {
          state: c.state,
          personName: c.person.name,
          clientName: c.clientCompany?.name ?? 'a client',
          roleTitle: c.requirement?.title ?? null,
          rateCents: c.billRate,
          currency: c.billCurrency ?? 'USD',
          waitingSince: since,
          startDate: c.startDate ?? null,
        },
        now
      )
      if (!row) continue

      decisions.push({
        type: row.type,
        title: row.title,
        subtitle: row.subtitle,
        named: row.type === 'CONTRACT_START'
          ? { whose: c.person.name, what: 'start', whats: 'starts' }
          : { whose: c.person.name, what: 'contract', whats: 'contracts' },
        urgency: row.urgency,
        entityType: 'SELL_CONTRACT',
        entityId: c.id,
        dueDate: c.startDate?.toISOString() ?? null,
        actionUrl: `/dashboard/contracts/${c.id}`,
        // No amount. A draft contract has committed nothing, and adding
        // its rate to the "needs you" total would read as money waiting.
        amount: null,
        createdAt: since.toISOString(),
      })
    }
  }

  // ── 3. Rolloff warnings ───────────────────────────
  //
  // Read by the desks that staff, run or pay the work — never by a seat
  // that reads only its own. This was gated on assignments.read, which
  // every engineer holds, so Karthik Menon's dashboard printed "Rolloff
  // in 18d — Felix Brenner · Northbend Athletic · $132/hr": a colleague's
  // end date and the firm's bill rate for him. The same door Ending soon
  // uses (`lib/releasing-soon`), and the rate through its own door too.
  if (hasAnyPermission(caller.permissions, ENDING_SOON_READERS)) {
    const rolloffWindow = new Date(now)
    rolloffWindow.setDate(rolloffWindow.getDate() + 28)

    const endingSoon = await prisma.sellContract.findMany({
      where: {
        companyId,
        state: 'IN_PROGRESS',
        endDate: {
          lte: rolloffWindow,
          gte: now,
        },
      },
      include: {
        person: { select: { name: true } },
        clientCompany: { select: { name: true } },
        endClientCompany: { select: { name: true } },
      },
      orderBy: { endDate: 'asc' },
      take: 10,
    })

    for (const sc of endingSoon) {
      const daysLeft = Math.ceil(
        (sc.endDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )

      // Check if a rolloff event already exists
      const rolloffEvent = await prisma.rolloffEvent.findFirst({
        where: { sellContractId: sc.id },
      })

      const endClientName = sc.endClientCompany?.name ?? sc.clientCompany?.name ?? 'Unknown'
      // Null where this seat may not read a bill rate; then no rate at all.
      const shownRate = rateOnEndingSoon(
        { companyId: caller.company?.id ?? null, permissions: caller.permissions },
        sc
      )
      decisions.push({
        type: 'ROLLOFF_ACTION',
        title: `Rolloff in ${daysLeft}d — ${sc.person.name}`,
        named: { whose: sc.person.name, what: 'last day', whats: 'last days' },
        // What a person would say of the roll-off, never the row the
        // system wrote for it ("Event created" was machine talk).
        subtitle: [endClientName, shownRate != null ? `$${shownRate / 100}/hr` : null, rolloffEvent ? 'Roll-off started' : 'Nobody has acted yet']
          .filter(Boolean).join(' · '),
        urgency: daysLeft <= 7 ? 'HIGH' : daysLeft <= 14 ? 'MEDIUM' : 'LOW',
        entityType: 'SELL_CONTRACT',
        entityId: sc.id,
        dueDate: sc.endDate!.toISOString(),
        actionUrl: '/dashboard/rolloff',
        amount: null,
        createdAt: sc.endDate!.toISOString(),
      })
    }
  }

  // ── 4. Submissions to review ──────────────────────
  if (hasAnyPermission(caller.permissions, ['submissions.read'])) {
    const pendingSubmissions = await prisma.submission.findMany({
      where: {
        fromCompanyId: companyId,
        status: 'SUBMITTED',
      },
      include: {
        person: { select: { name: true } },
        requirement: { select: { title: true } },
      },
      orderBy: { submittedAt: 'asc' },
      take: 10,
    })

    for (const sub of pendingSubmissions) {
      const daysSinceSubmit = Math.floor(
        (now.getTime() - sub.submittedAt.getTime()) / (1000 * 60 * 60 * 24)
      )

      decisions.push({
        type: 'SUBMISSION_REVIEW',
        title: `Review submission — ${sub.person.name}`,
        named: { whose: sub.person.name, what: 'submission', whats: 'submissions' },
        subtitle: `${sub.requirement.title} · $${sub.rate / 100}/hr · ${daysSinceSubmit}d since submitted`,
        urgency: daysSinceSubmit >= 7 ? 'HIGH' : daysSinceSubmit >= 3 ? 'MEDIUM' : 'LOW',
        entityType: 'SUBMISSION',
        entityId: sub.id,
        dueDate: null,
        actionUrl: '/dashboard/submissions',
        amount: null,
        createdAt: sub.submittedAt.toISOString(),
      })
    }
  }

  // ── 5. Overdue invoices ───────────────────────────
  if (hasAnyPermission(caller.permissions, ['invoices.read'])) {
    const overdueInvoices = await prisma.invoice.findMany({
      where: {
        status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
        dueAt: { lt: now },
        // Ours, whether or not there is an agreement behind it.
        //
        // This used to ask only `engagement.msa.vendorId`, which was
        // safe while every placement had an agreement because the award
        // invented one. It no longer does — an agreement is the legal
        // umbrella where one exists and a client that sends one order
        // and one contractor is not made to paper one — so an invoice
        // on an engagement with no agreement was ours and was invisible
        // here, which is an overdue invoice nobody is told about.
        OR: [
          { engagement: { msa: { vendorId: companyId } } },
          { engagement: { sellContracts: { some: { companyId } } } },
        ],
      },
      include: {
        engagement: {
          select: {
            title: true,
            msa: {
              select: {
                client: { select: { name: true } },
              },
            },
            // Who the bill is to, where no agreement names them. The
            // contracts underneath are what say which two firms this is
            // between, which is where the schema says to read them.
            sellContracts: {
              select: { clientCompany: { select: { name: true } } },
              take: 1,
            },
          },
        },
      },
      orderBy: { dueAt: 'asc' },
      take: 10,
    })

    for (const inv of overdueInvoices) {
      const daysOverdue = Math.floor(
        (now.getTime() - inv.dueAt!.getTime()) / (1000 * 60 * 60 * 24)
      )
      const outstanding = Number(inv.total) - Number(inv.paid)

      const customer = inv.engagement.msa?.client.name ?? inv.engagement.sellContracts[0]?.clientCompany?.name ?? null
      decisions.push({
        type: 'INVOICE_OVERDUE',
        title: `Overdue bill — ${inv.number}`,
        named: customer
          ? { whose: customer, what: 'overdue bill', whats: 'overdue bills' }
          : { whose: null, what: `overdue bill ${inv.number}`, whats: 'overdue bills' },
        // Same again, and worse here: a $7,600 overdue invoice read
        // "$76.00 outstanding", which is an amount nobody chases.
        subtitle:
          `${inv.engagement.msa?.client.name ?? inv.engagement.sellContracts[0]?.clientCompany?.name ?? 'Client'}` +
          ` · $${outstanding.toFixed(2)} outstanding · ${daysOverdue}d overdue`,
        urgency: daysOverdue >= 60 ? 'HIGH' : daysOverdue >= 30 ? 'MEDIUM' : 'LOW',
        entityType: 'INVOICE',
        entityId: inv.id,
        dueDate: inv.dueAt!.toISOString(),
        actionUrl: '/dashboard/invoices',
        amount: outstanding,
        createdAt: inv.dueAt!.toISOString(),
      })
    }
  }

  // ── 7. A client's held starts, and suppliers with no paper ────────
  //
  // This route is the one count for a seat: the Ask Etyme mark, the
  // greeting and the program page's headline all read its total. The
  // program page used to add two kinds of its own on top — a start the
  // paperwork will refuse, and a supplier with people on site and no
  // agreement — so the dashboard said one number and the mark another.
  // Both are here now, each for the desk that can act on it, and the
  // verdict and the sentence are the program page's own
  // (`startPaperwork`, `deskItems`), so the two cannot disagree.
  //
  // A client's book only: these are about who works on the client's site.
  // A supplier's own unstarted lines are its activation desk's, read on
  // its contracts. Inside a firm that separates its accounts, the same
  // wall as the program page.
  const isClient = caller.company?.kind === 'CLIENT'
  const startsDesk = isClient && hasAnyPermission(caller.permissions, ['assignments.write'])
  const supplierDesk = isClient && hasAnyPermission(caller.permissions, ['vendors.manage'])
  if (startsDesk || supplierDesk) {
    const wall = await accountFilterFor(caller)
    const rungs = await prisma.sellContract.findMany({
      where: andAll(endClientFilter(companyId), wall.where, {
        state: { in: ['IN_PROGRESS', 'DRAFT', 'PENDING_VERIFICATION', 'VERIFIED'] },
      }),
      select: {
        id: true, personId: true, companyId: true, clientCompanyId: true, state: true,
        startDate: true, endDate: true,
        person: { select: { name: true } },
        company: { select: { id: true, name: true } },
        requirement: { select: { title: true } },
      },
    })
    // The contract the client pays, one per person: the firm named is
    // always the one the client buys from, never a rung below it.
    const top = chainTop(rungs)
    const clientName = caller.company!.name

    const held = startsDesk
      ? (await Promise.all(
          top
            .filter((c) => c.state !== 'IN_PROGRESS')
            .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
            .map(async (c) => ({
              contractId: c.id,
              person: { name: c.person.name },
              vendor: { name: c.company.name },
              startDate: c.startDate,
              paperwork: await startPaperwork(c, { supplierPhrase: c.company.name, clientName, now }),
            }))
        ))
      : []

    const onSiteBy = new Map<string, { id: string; name: string; headcount: number }>()
    if (supplierDesk) {
      for (const c of top.filter((x) => x.state === 'IN_PROGRESS')) {
        const v = onSiteBy.get(c.company.id) ?? { id: c.company.id, name: c.company.name, headcount: 0 }
        v.headcount++
        onSiteBy.set(c.company.id, v)
      }
    }
    const agreed = await agreementsOnFile(companyId, [...onSiteBy.keys()])
    const vendors = [...onSiteBy.values()].map((v) => ({ ...v, agreement: agreed.has(v.id) }))

    const startOf = new Map(held.map((h) => [h.contractId, h.startDate]))
    // The rows are the program page's own (`deskRows`), so a held start is
    // one row whether a client's own seat reads it here or a seat another
    // company granted reads it on the program page.
    for (const row of deskRows(deskItems({ startingSoon: held, vendors }), startOf, now)) {
      decisions.push(row)
    }
  }

  // ── 6. What the twin is waiting on this seat for ──────────────────
  //
  // The badge on the Ask Etyme mark and the greeting's headline both read
  // this route's total, so a question the twin put to this desk has to be
  // in it — otherwise the mark says "nothing" over a yes somebody is
  // waiting for. Only the questions this seat may actually answer
  // (`mayDecide`): not one asked on its own authority or that it asked for
  // itself, which somebody else answers, not one for a desk it does not
  // hold, and not one whose act the role contract has since moved to
  // Never. The row is the twin's own sentence and opens Ask Etyme, where
  // the card with Yes and Not now lives; the answer goes through the one
  // approval route, never through here.
  const twinAsks = (await waitingQuestions(caller)).filter((q) => q.mayDecide)
  const askedAbout = twinAsks.filter((q) => q.entityType === 'Person').map((q) => q.entityId)
  if (askedAbout.length > 0) {
    logBulkAccess([...new Set(askedAbout)], {
      actorPersonId: caller.person.id,
      actorCompanyId: companyId,
      action: 'TENURE_VIEW',
      reason: 'Read in the decision queue: a question from the twin this role may answer',
    })
  }
  for (const q of twinAsks) {
    const waited = Math.floor((now.getTime() - q.requestedAt.getTime()) / (1000 * 60 * 60 * 24))
    decisions.push({
      type: 'TWIN_QUESTION',
      title: TWIN_ACTS[q.action]?.says ?? q.rationale,
      named: { whose: null, what: 'a question from Ask Etyme', whats: 'questions from Ask Etyme' },
      subtitle: [q.label, q.rationale, waited <= 0 ? 'asked today' : `asked ${waited}d ago`]
        .filter(Boolean).join(' · '),
      urgency: waited >= 7 ? 'HIGH' : waited >= 3 ? 'MEDIUM' : 'LOW',
      entityType: 'TWIN_APPROVAL',
      entityId: q.id,
      dueDate: null,
      actionUrl: ASK_ETYME_HREF,
      amount: null,
      createdAt: q.requestedAt.toISOString(),
    })
  }

  // ── Sort by urgency, then by created date ─────────
  const urgencyOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }
  decisions.sort((a, b) => {
    const urgDiff = (urgencyOrder[a.urgency] ?? 3) - (urgencyOrder[b.urgency] ?? 3)
    if (urgDiff !== 0) return urgDiff
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })

  // ── Counts by type ────────────────────────────────
  const counts: Record<string, number> = {}
  for (const d of decisions) {
    counts[d.type] = (counts[d.type] ?? 0) + 1
  }

  // ── Whose queue this is ───────────────────────────────────────────
  //
  // Every query above is scoped to `companyId` — the caller's own firm —
  // and that is the only book this route can prove the caller is
  // entitled to. A program office in a seat reads the client's program
  // on the same page, so the page needs to be able to say which of the
  // two it is showing rather than leaving an MSP to read its own supplier
  // work as the client's. The sentence itself is the page's
  // (`whoseQueue` in dashboard/program/needs-you); this says the facts it
  // needs, in the shape `lib/page-framing` already accepts.
  const desk = await seatedDesk(caller)

  // ── A supplier with a client and nothing else yet ─────────────────
  //
  // A firm a client just approved opened its dashboard and read "All
  // clear", with no word that it had a client at all (sign-up walk,
  // 2026-10-08). So where the queue is empty and nothing has been sent
  // to or placed through this firm yet, the first line names who it now
  // supplies. Read from both registers: the client's, which approval
  // writes, and the firm's own.
  let welcome: string | null = null
  if (decisions.length === 0) {
    const [invited, placed] = await Promise.all([
      prisma.requirementInvitation.count({ where: { toCompanyId: companyId } }),
      prisma.sellContract.count({ where: { companyId } }),
    ])
    if (invited === 0 && placed === 0) {
      const [theirs, ours] = await Promise.all([
        prisma.counterparty.findMany({
          where: { otherCompanyId: companyId, relationship: 'SUPPLIER', status: 'ACTIVE' },
          select: { company: { select: { name: true } } },
        }),
        prisma.counterparty.findMany({
          where: { companyId, relationship: 'CLIENT', status: 'ACTIVE' },
          select: { otherCompany: { select: { name: true } } },
        }),
      ])
      welcome = yourClientsSays([...theirs.map((r) => r.company.name), ...ours.map((r) => r.otherCompany.name)])
    }
  }

  return NextResponse.json({
    data: {
      decisions,
      counts,
      total: decisions.length,
      /**
       * The one sentence for this seat, with the names in it: "Two things
       * need you: Ingrid Sørensen's start, and Teleworld's missing
       * agreement." Built from these rows (`deskHeadline`), so the
       * program page's headline, the Ask Etyme mark and the greeting can
       * say one number and one sentence.
       */
      says: deskHeadline(decisions).says,
      /** The first line for a supplier with a client and nothing else yet, or null. */
      welcome,
      reading: {
        company: caller.company?.name ?? null,
        seated: !!desk?.seat,
        clientName: desk?.seat ? desk.companyName : null,
      },
    },
  })
}

/**
 * What the client decided about a week's overtime, said to a firm below
 * the top of its chain — or null where the client decided nothing.
 *
 * The founder, 2026-10-19 (CLAUDE.md, "Four decisions…", item 3): below
 * the top, which hours are overtime is the client's decision when it
 * signed, carried down (`lib/money/client-overtime`), and each firm reads
 * it priced at the multiplier on its own line with the firm it pays —
 * the same reading its invoice will be matched on. Where the client's
 * answer cannot be read, the card says why in the rule's own sentence.
 */
async function clientDecidedOn(
  timesheetId: string,
  personName: string,
  ladder: LadderRung[],
  pairLineId: string,
  pairMultiplierBps: number | null | undefined
): Promise<string | null> {
  const top = ladder[0]
  if (!top) return null
  const clientId = top.endClientCompanyId ?? top.clientCompanyId
  const rows = await prisma.overtimeDecision.findMany({ where: { timesheetId } })
  if (rows.length === 0) return null
  const client = await prisma.company.findUnique({ where: { id: clientId }, select: { name: true } })
  const carried = clientDecidedFor({
    rows,
    top: { sellContractId: top.sellContractId, clientCompanyId: clientId },
    pairLineId,
    pairMultiplierBps,
    personName,
  })
  return clientDecidedSentence(client?.name ?? 'The client', carried)
}
