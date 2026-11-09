import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { staffOnly } from '@/lib/seat'
import { logBulkAccess } from '@/lib/access-log'
import { firmTuesday, totalsByCurrency, SELLING_KINDS, type CurrencyTotal } from '@/lib/money/firm-today'
import { todayReads, pictureLine, byClient, NO_READS, draftSend } from '@/lib/today-page'
import { draftsOf, withExpenses, type DraftBillFacts } from './drafts'
import { signedAndBilled } from '@/lib/money/signed-unbilled'
import { minorFromWhole } from '@/lib/money'
import { prisma } from '@/lib/db'
import { maySendBills } from '@/lib/money/bill-send'
import { seatFor } from '@/lib/program-seat'
import { rollingOffAt, benchAt, unpaidBills } from './reads'

/**
 * GET /api/today
 *
 * A selling firm's Today page: what a firm asks on a Tuesday (founder,
 * 2026-10-19). Billing this month and the weeks signed and not yet
 * billed, from money's `firmTuesday`; who rolls off within thirty days;
 * who is on the bench and since when; who is where, by client; and the
 * bills sent and not yet paid. Each part is read only for the seat that
 * may read it (`todayReads`), and a part it may not is null, never zero.
 *
 * Read once per request, for the caller's own company, and nothing is
 * kept between requests: one firm's book is never served to another.
 *
 * Every person the answer names is on the access trail, the reader's own
 * line excepted, the way the bench and the decision queue log the rows
 * the old page read — `firmTuesday` itself writes nothing.
 *
 * Not the decision queue. The headline and "Yours to decide" are
 * `GET /api/decisions`, so the page, the Ask Etyme mark and the greeting
 * say one number and one sentence.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Today')
  if (notStaff) return notStaff

  const company = caller.company
  if (!company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Today is a firm’s page, and your seat is not at a firm. Your own work is under Your work.' } },
      { status: 404 }
    )
  }
  if (!(SELLING_KINDS as readonly string[]).includes(company.kind)) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_A_SELLER',
          message: `${company.name} buys from its suppliers and bills nobody, so its Today is its program page.`,
        },
      },
      { status: 403 }
    )
  }

  const now = new Date()

  // ── A seat in a client's program reads that program, not its book ──
  //
  // Decided 2026-10-26 (the second production walk): a firm seated in a
  // client's program is in that program for the whole session. Today's
  // headline and queue are the program's (`GET /api/decisions?in=program`,
  // the rows the program page, the mark and the chat read), so nothing of
  // the firm's own book is read here, and nobody in it is logged as read.
  // The seat is found the way the decisions route and the chat find it:
  // the live seat this firm holds, `clientCompanyId` choosing among several.
  const seat = await seatFor(caller, request.nextUrl.searchParams.get('clientCompanyId')).catch(() => null)
  if (seat) {
    return NextResponse.json({
      data: {
        asOf: now.toISOString().slice(0, 10),
        company: { name: company.name, kind: company.kind },
        seated: { clientName: seat.clientCompany.name },
        reads: NO_READS,
        picture: '',
        billing: null, signed: null, rollingOff: null, bench: null, whoIsWhere: null, unpaid: null,
      },
    })
  }

  const reads = todayReads(caller.permissions, company.kind)

  const [tuesday, rolling, bench, unpaid] = await Promise.all([
    reads.billing || reads.bills || reads.people ? firmTuesday(company.id, now) : Promise.resolve(null),
    reads.people ? rollingOffAt(company.id, now) : Promise.resolve(null),
    reads.bench ? benchAt(company.id, now) : Promise.resolve(null),
    reads.bills ? unpaidBills(company.id, now) : Promise.resolve(null),
  ])

  const onSite = tuesday?.billingThisMonth.people ?? []
  const weeks = tuesday?.signedNotBilled.weeks ?? []
  const asOf = tuesday?.asOf ?? now.toISOString().slice(0, 10)

  // ── Billing this month ─────────────────────────────────────────────
  const billing = reads.billing && tuesday
    ? {
        totals: tuesday.billingThisMonth.totals,
        people: onSite.length,
        names: onSite.map((p) => p.personName),
        basis: tuesday.billingThisMonth.basis,
        // A person with no figure says so in money's own sentence.
        unpriced: onSite.filter((p) => p.says).map((p) => p.says as string),
      }
    : null

  // ── Send on a draft: the send route's own verdict, one read for all ─
  //
  // Today draws Send only where POST /api/invoices/:id/submit would send
  // the bill for this seat (`maySendBills`, the rule the route reads
  // first): a bill Ask Etyme drafted on the Owner's authority is sent by
  // another seat that sends bills wherever one exists (second production
  // walk, 2026-10-26: Brightmoor's Owner was offered Send the route refuses).
  const draftIds = reads.bills ? [...new Set(weeks.filter((w) => w.draft).map((w) => w.draft!.invoiceId))] : []
  const verdicts = draftIds.length > 0
    ? await maySendBills({ personId: caller.person.id, companyId: company.id, permissions: caller.permissions }, draftIds)
    : new Map()

  // ── What the line reader counts beside the weeks ───────────────────
  //
  // Signed and not billed is the line reader's notBilled.amountMinor: the
  // priced weeks and the accepted billable expenses no sent bill carries.
  // The weeks above carry only the hours, so each line's expenses are
  // added here, by the client it bills and by currency, never a figure of
  // this route's own (walk 9: Rosa read $131,376 here against $131,952 on
  // the placement and the budget, the $576 expense left out). And a draft
  // says its own bill's total, expenses included.
  const expenseByClient = new Map<string, Map<string, number>>()
  const expenseAll = new Map<string, number>()
  const draftBills = new Map<string, DraftBillFacts>()
  if (reads.bills && tuesday) {
    const own = await prisma.sellContract.findMany({ where: { companyId: company.id }, select: { id: true } })
    const lines = own.length ? await signedAndBilled(own.map((l) => l.id), now) : new Map()
    for (const l of lines.values()) {
      const minor = l.notBilled.expenseMinor ?? 0
      if (!minor) continue
      const ccy = l.currency.toUpperCase()
      const client = l.billedToName ?? ''
      const at = expenseByClient.get(client) ?? new Map<string, number>()
      at.set(ccy, (at.get(ccy) ?? 0) + minor)
      expenseByClient.set(client, at)
      expenseAll.set(ccy, (expenseAll.get(ccy) ?? 0) + minor)
    }
    if (draftIds.length > 0) {
      const bills = await prisma.invoice.findMany({
        where: { id: { in: draftIds } },
        select: { id: true, total: true, currency: true, invoiceLines: { select: { timesheetId: true } } },
      })
      for (const b of bills) {
        draftBills.set(b.id, {
          totalMinor: minorFromWhole(b.total, b.currency),
          currency: b.currency.toUpperCase(),
          weeks: new Set(b.invoiceLines.map((x) => x.timesheetId).filter(Boolean)).size,
        })
      }
    }
  }

  // ── Signed, not yet billed, by the firm that pays the bill ─────────
  const signed = reads.bills && tuesday
    ? {
        count: tuesday.signedNotBilled.count,
        onDrafts: tuesday.signedNotBilled.onDrafts,
        totals: withExpenses(tuesday.signedNotBilled.totals, expenseAll),
        unpriced: [...new Set(weeks.filter((w) => w.says).map((w) => w.says as string))],
        byClient: byClient(weeks, (w) => w.billedToName).map((g) => ({
          client: g.client,
          weeks: g.rows.length,
          totals: withExpenses(totalsByCurrency(g.rows), expenseByClient.get(g.client) ?? new Map()),
          people: g.rows.map((w) => ({ personName: w.personName })),
          // One Send per draft bill, however many weeks it holds, each with
          // its own amount: the weeks that bill holds, priced as it prices
          // them, never the client's whole unbilled total printed beside
          // the bill's number (the tester's scale audit, 2026-11-09).
          drafts: draftsOf(g.rows, draftBills).map((d) => ({ ...d, ...draftSend(verdicts.get(d.invoiceId)) })),
        })),
      }
    : null

  // ── Who is where, by the client whose site they are at ─────────────
  const whoIsWhere = reads.people && tuesday
    ? byClient(onSite, (p) => p.atName).map((g) => ({
        client: g.client,
        people: g.rows.map((p) => ({ personId: p.personId, name: p.personName })),
        totals: reads.billing
          ? (totalsByCurrency(g.rows.map((p) => ({ currency: p.currency, amountMinor: p.monthlyMinor }))) as CurrencyTotal[])
          : null,
      }))
    : null

  const clients = new Set(onSite.map((p) => p.atName)).size
  const picture = pictureLine({
    onSite: reads.people || reads.billing ? { people: new Set(onSite.map((p) => p.personId)).size, clients } : null,
    rollingOff: rolling ? rolling.length : null,
    bench: bench ? bench.length : null,
    signedWeeks: signed ? signed.count : null,
  })

  // ── The access trail ───────────────────────────────────────────────
  //
  // Every person named here was read, the reader's own line excepted.
  const others = (ids: (string | undefined)[]) =>
    [...new Set(ids.filter((id): id is string => !!id && id !== caller.person.id))]
  const placed = others([
    ...((reads.people || reads.billing) ? onSite.map((p) => p.personId) : []),
    ...(reads.bills ? weeks.map((w) => w.personId) : []),
    ...(rolling ?? []).map((r) => r.personId),
  ])
  if (placed.length > 0) {
    logBulkAccess(placed, {
      actorPersonId: caller.person.id,
      actorCompanyId: company.id,
      action: 'CONTRACT_VIEW',
      reason: 'Read on the firm’s Today page: on site, rolling off, or a week signed and not yet billed',
    })
  }
  const benched = others((bench ?? []).map((b) => b.personId))
  if (benched.length > 0) {
    logBulkAccess(benched, {
      actorPersonId: caller.person.id,
      actorCompanyId: company.id,
      action: 'TALENT_VIEW_ANON',
      reason: 'Read on the firm’s Today page: on the bench',
    })
  }

  return NextResponse.json({
    data: {
      asOf,
      company: { name: company.name, kind: company.kind },
      seated: null,
      reads,
      picture,
      billing,
      signed,
      rollingOff: rolling,
      bench,
      whoIsWhere,
      unpaid,
    },
  })
}

