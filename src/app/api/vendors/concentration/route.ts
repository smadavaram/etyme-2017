import { NextRequest, NextResponse } from 'next/server'
import { hasPermission } from '@/lib/permissions'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { fromPrismaDecimal } from '@/lib/money'
import {
  concentration, concentrationReport,
  type Concentration, type Exposure, type Owners,
} from '@/lib/concentration'

/**
 * GET /api/vendors/concentration — the shape of the book.
 *
 * One client, one supplier, one person. None of the three is a loss and
 * none of them appears on a margin report; together they decide whether a
 * bad quarter is survivable.
 *
 * ── Where each number comes from ─────────────────────────────────────
 *
 *   **Client.** Invoices raised under an agreement where we are the
 *   vendor, rolled up on the client on the agreement rather than on
 *   whichever of their entities the invoice was posted to. If they stop
 *   paying, all of their entities stop.
 *
 *   **Supplier.** What we were billed by sub-vendors. Where nothing has
 *   been billed yet, the fallback is people supplied on live buy
 *   contracts — a different unit, and the answer says which one it is
 *   rather than letting a headcount read as money.
 *
 *   **Person.** Invoice lines, which carry the person. Invoices raised
 *   before line-level billing hold their lines in a JSON column and carry
 *   no person, so they are counted for the client and cannot be counted
 *   for anybody by name. That gap is reported rather than quietly halving
 *   somebody's share.
 *
 * ── The blank that matters ───────────────────────────────────────────
 *
 * A firm with two clients gets no percentage. Its first client is a
 * hundred per cent of its revenue and that is arithmetic, not a finding.
 */

/** How far back this looks. A year, the way a book is normally read. */
const WINDOW_DAYS = 365

const NOT_REVENUE = ['DRAFT', 'CANCELLED', 'VOID']
const NOT_SPEND = ['CANCELLED', 'DISPUTED']

/**
 * Who holds each of the three here.
 *
 * There is no field anywhere for this yet, so nothing is invented: where
 * nobody is named the arithmetic says so and the threshold's role stands
 * in. A made-up name is worse than an honest blank, because somebody
 * would be told they owned something nobody had asked them about.
 */
const NAMED_OWNERS: Owners = {}

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Concentration risk')
  if (notStaff) return notStaff

  // ── Why the whole page is behind margin, and not just some figures ──
  //
  // Checked 2026-09-18 against the nine gates of this exact shape that
  // `lib/money/desks.ts` found were wrong. Those were wrong for two
  // reasons and neither holds here.
  //
  // Theirs was a READ gated harder than the WRITE beside it in the same
  // file — an AR clerk could record a payment against a queue they could
  // not see. There is no write in this file. And theirs refused the desk
  // the page is NAMED for; no default role in `lib/company-defaults` has
  // a blurb that claims this work. The nearest is Finance — "closes the
  // month" — which holds `pnl.read` and gets in, as do Owner and Admin.
  //
  // What is left after that is the payload, and here all of it is the
  // fenced class. AR is the invoice book read by age and AP the bill book
  // read by due date: operational, one side each. This is the firm's
  // turnover for the year, its total supplier spend, and what share of
  // each one client, one supplier and one person carry — with a named
  // risk owner against it. There is no non-money half to show somebody
  // who may not read the money half, so the per-figure fence that
  // `vendors/risk` next door uses has nothing to fence.
  //
  // It is checked per section on the screen, not per page: `dashboard/
  // scorecards` loads standing, scorecards and shape independently, so a
  // refusal here leaves the supplier-standing half of that page working.
  if (!hasPermission(caller.permissions, 'margin.read') && !hasPermission(caller.permissions, 'pnl.read')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message:
            'You cannot see the shape of the book here — what the firm turned over this ' +
            'year and how much of it rides on one client, one supplier or one person. ' +
            'Supplier standing above does not need it. Ask whoever manages roles here for ' +
            'the profitability desk if this is your job.',
        },
      },
      { status: 403 }
    )
  }

  const companyId = caller.company!.id
  const now = new Date()
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000)
  const gaps: string[] = []

  const [invoices, bills, people, lines] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        engagement: { msa: { vendorId: companyId } },
        status: { notIn: NOT_REVENUE },
      },
      select: {
        id: true,
        currency: true,
        total: true,
        issuedAt: true,
        periodEnd: true,
        engagement: {
          select: { msa: { select: { clientId: true, client: { select: { name: true } } } } },
        },
      },
      take: 5_000,
    }),

    prisma.vendorBill.findMany({
      where: {
        companyId,
        status: { notIn: NOT_SPEND },
        receivedAt: { gte: since },
      },
      select: {
        id: true,
        currency: true,
        totalCents: true,
        vendorCompanyId: true,
        vendorCompany: { select: { name: true } },
      },
      take: 5_000,
    }),

    // The fallback unit: people currently supplied through somebody else.
    prisma.buyContractCandidate.findMany({
      where: {
        state: 'ACTIVE',
        buyContract: { companyId, vendorCompanyId: { not: null } },
      },
      select: {
        personId: true,
        buyContract: {
          select: { vendorCompanyId: true, vendorCompany: { select: { name: true } } },
        },
      },
      take: 5_000,
    }),

    prisma.invoiceLine.findMany({
      where: {
        sellContract: { companyId },
        invoice: { status: { notIn: NOT_REVENUE } },
      },
      select: {
        amountCents: true,
        personId: true,
        person: { select: { name: true } },
        invoice: { select: { currency: true, issuedAt: true, periodEnd: true } },
      },
      take: 20_000,
    }),
  ])

  /** The day an invoice counts from. Issued where we know it, billed period otherwise. */
  const countedAt = (i: { issuedAt: Date | null; periodEnd: Date }) => i.issuedAt ?? i.periodEnd

  // ── Revenue by client ───────────────────────────────────────────────
  const inWindow = invoices.filter((i) => countedAt(i) >= since)
  const noIssueDate = inWindow.filter((i) => i.issuedAt == null).length
  if (noIssueDate > 0) {
    gaps.push(
      `${noIssueDate} invoice${noIssueDate === 1 ? '' : 's'} have no issue date, so the end ` +
        `of the period they bill is used instead. Close, and not the same thing.`
    )
  }

  const byClient = new Map<string, Exposure>()
  for (const i of inWindow) {
    const id = i.engagement.msa.clientId
    const had = byClient.get(id)
    const minor = fromPrismaDecimal(i.total, i.currency).minor
    byClient.set(id, {
      id,
      name: i.engagement.msa.client.name,
      amountMinor: (had?.amountMinor ?? 0) + minor,
      currency: i.currency,
    })
  }

  const client = concentration({
    dimension: 'CLIENT',
    unit: 'MONEY',
    exposures: [...byClient.values()],
    owners: NAMED_OWNERS,
  })

  // ── Supply by supplier ──────────────────────────────────────────────
  //
  // Money where we have it, people where we do not, and the answer says
  // which — a headcount presented as a spend share is a wrong number that
  // looks right.
  let supplier: Concentration
  if (bills.length > 0) {
    const bySupplier = new Map<string, Exposure>()
    for (const b of bills) {
      if (!b.vendorCompanyId) continue
      const had = bySupplier.get(b.vendorCompanyId)
      bySupplier.set(b.vendorCompanyId, {
        id: b.vendorCompanyId,
        name: b.vendorCompany?.name ?? 'Unnamed supplier',
        amountMinor: (had?.amountMinor ?? 0) + b.totalCents,
        currency: b.currency,
      })
    }
    supplier = concentration({
      dimension: 'SUPPLIER',
      unit: 'MONEY',
      exposures: [...bySupplier.values()],
      owners: NAMED_OWNERS,
    })
  } else {
    const bySupplier = new Map<string, Exposure>()
    for (const p of people) {
      const id = p.buyContract.vendorCompanyId
      if (!id) continue
      const had = bySupplier.get(id)
      bySupplier.set(id, {
        id,
        name: p.buyContract.vendorCompany?.name ?? 'Unnamed supplier',
        amountMinor: (had?.amountMinor ?? 0) + 1,
      })
    }
    supplier = concentration({
      dimension: 'SUPPLIER',
      unit: 'PEOPLE',
      exposures: [...bySupplier.values()],
      owners: NAMED_OWNERS,
    })
    if (bySupplier.size > 0) {
      gaps.push(
        'No sub-vendor bills on record in this window, so supplier concentration is ' +
          'counted in people supplied rather than in money.'
      )
    }
  }

  // ── Billing by person ───────────────────────────────────────────────
  const linesInWindow = lines.filter((l) => countedAt(l.invoice) >= since)
  const byPerson = new Map<string, Exposure>()
  for (const l of linesInWindow) {
    // A milestone line has no person; it is money, not somebody's hours.
    if (!l.personId || !l.person) continue
    const had = byPerson.get(l.personId)
    byPerson.set(l.personId, {
      id: l.personId,
      name: l.person.name,
      amountMinor: (had?.amountMinor ?? 0) + l.amountCents,
      currency: l.invoice.currency,
    })
  }

  const person = concentration({
    dimension: 'PERSON',
    unit: 'MONEY',
    exposures: [...byPerson.values()],
    owners: NAMED_OWNERS,
  })

  if (inWindow.length > 0 && linesInWindow.length === 0) {
    gaps.push(
      'None of the invoices in this window carry line-level detail, so nothing can be ' +
        'attributed to a named person. The client figures are unaffected.'
    )
  }

  const report = concentrationReport([client, supplier, person])

  return NextResponse.json({
    data: {
      asOf: now.toISOString(),
      windowDays: WINDOW_DAYS,
      report,
      gaps,
      howJudged:
        'Invoices for the client share, sub-vendor bills for the supplier share, invoice ' +
        'lines for the person share. Thresholds are published beside the figures — a line ' +
        'somebody chose is one the next person can move.',
    },
  })
}

