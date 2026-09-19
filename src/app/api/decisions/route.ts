import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { staffOnly } from '@/lib/seat'
import { hasAnyPermission } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { endClientFilter } from '@/lib/resolve-end-client'
import { payerRung } from '@/lib/chain-top'
import { mayNameSubVendors, namesForClient } from '@/lib/chain-names'
import { timesheetFlag, periodWord } from '@/lib/timesheet-flag'
import { desksFor } from '@/lib/supplier-desks'
import { mayActAt, STAGE_WORD, type Stage, type Decision } from '@/lib/supplier-onboarding'
import { paperingRow } from '@/lib/papering'

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
 *   ROLLOFF_ACTION     — contracts ending soon with no action
 *   SUBMISSION_REVIEW  — submissions waiting for vendor review
 *   INVOICE_OVERDUE    — invoices past due
 *   RATE_CONFIRMATION  — rate changes that need confirmation
 *   SUPPLIER_REVIEW    — a firm recommended, waiting on Procurement's paperwork and yes
 *   CONTRACT_PAPERING  — a placement won and still a draft: the contract desk's
 *   CONTRACT_START     — a contract papered and nobody started on it yet
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
      const daysSinceSubmit = Math.floor(
        (now.getTime() - ts.periodEnd.getTime()) / (1000 * 60 * 60 * 24)
      )
      const sc = ts.sellContract
      const asClient = sc.companyId !== companyId
      // Inside a sentence, so the phrase and not the cell: "through
      // Computer Systems" where the name is this reader's to read, and
      // "through the firm supplied through Computer Systems" where it is
      // not. Never the employer's own name, which is what a blank walk
      // used to fall through to.
      const supplier = !asClient
        ? sc.company.name
        : seenNames.get(sc.companyId)?.phrase ?? 'a supplier on this site'
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
      const flag = timesheetFlag({
        hours: Number(ts.totalHours), hoursPerWeek: sc.requirement?.hoursPerWeek ?? null,
        periodEnd: ts.periodEnd, contractEnd: sc.endDate,
      })

      decisions.push({
        type: 'TIMESHEET_APPROVAL',
        title: `Approve timesheet — ${ts.person.name}`,
        subtitle: asClient
          ? `${ts.totalHours}h · through ${supplier} · ${period}`
          : `${ts.totalHours}h · ${sc.clientCompany?.name ?? 'Unknown client'} · ${period}`,
        urgency: daysSinceSubmit >= 5 ? 'HIGH' : daysSinceSubmit >= 2 ? 'MEDIUM' : 'LOW',
        entityType: 'TIMESHEET',
        entityId: ts.id,
        dueDate: null,
        actionUrl: '/dashboard/timesheets',
        amount,
        flag,
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

  // ── 2b. Bills that did not match ─────────────────
  //
  // Three-way match exceptions, routed to the desk that pays. A bill
  // recorded as DISPUTED stays out of every payment run until somebody
  // with authority says why it should go in — so it is a decision, and
  // it belongs here rather than in a filter on the AP page.
  if (hasAnyPermission(caller.permissions, ['payments.record'])) {
    const disputed = await prisma.vendorBill.findMany({
      where: { companyId, status: 'DISPUTED' },
      include: { vendorCompany: { select: { name: true } } },
      orderBy: { receivedAt: 'asc' },
      take: 20,
    })
    for (const b of disputed) {
      decisions.push({
        type: 'BILL_DISPUTED',
        title: `Bill ${b.number} from ${b.vendorCompany.name} does not match`,
        subtitle: `$${(b.totalCents / 100).toFixed(2)} · held out of payment runs until somebody says why it should go in`,
        urgency: 'HIGH',
        entityType: 'VENDOR_BILL',
        entityId: b.id,
        dueDate: b.dueAt?.toISOString() ?? null,
        actionUrl: '/dashboard/ap',
        amount: b.totalCents / 100,
        createdAt: b.receivedAt.toISOString(),
      })
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
          subtitle: required.length > 0
            ? `Recommended by ${nameOf.get(w.recommendedById) ?? 'somebody'} · ${STAGE_WORD[stage]}: ${held} of ${required.length} verified${provided ? `, ${provided} to verify` : ''}`
            : `Recommended by ${nameOf.get(w.recommendedById) ?? 'somebody'} · ${STAGE_WORD[stage]} desk: ${w.skills.length ? w.skills.join(', ') : w.reason.slice(0, 60)}`,
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
  if (hasAnyPermission(caller.permissions, ['assignments.read'])) {
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
      decisions.push({
        type: 'ROLLOFF_ACTION',
        title: `Rolloff in ${daysLeft}d — ${sc.person.name}`,
        subtitle: `${endClientName} · $${sc.billRate / 100}/hr · ${rolloffEvent ? 'Event created' : 'No action yet'}`,
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

      decisions.push({
        type: 'INVOICE_OVERDUE',
        title: `Overdue invoice — ${inv.number}`,
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

  return NextResponse.json({
    data: {
      decisions,
      counts,
      total: decisions.length,
    },
  })
}
