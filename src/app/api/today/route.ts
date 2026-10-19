import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { staffOnly } from '@/lib/seat'
import { logBulkAccess } from '@/lib/access-log'
import { firmTuesday, totalsByCurrency, SELLING_KINDS, type CurrencyTotal } from '@/lib/money/firm-today'
import { todayReads, pictureLine, byClient } from '@/lib/today-page'
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

  const reads = todayReads(caller.permissions, company.kind)
  const now = new Date()

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

  // ── Signed, not yet billed, by the firm that pays the bill ─────────
  const signed = reads.bills && tuesday
    ? {
        count: tuesday.signedNotBilled.count,
        onDrafts: tuesday.signedNotBilled.onDrafts,
        totals: tuesday.signedNotBilled.totals,
        unpriced: [...new Set(weeks.filter((w) => w.says).map((w) => w.says as string))],
        byClient: byClient(weeks, (w) => w.billedToName).map((g) => ({
          client: g.client,
          weeks: g.rows.length,
          totals: totalsByCurrency(g.rows),
          people: g.rows.map((w) => ({ personName: w.personName })),
          // One Send per draft bill, however many weeks it holds.
          drafts: [...new Map(g.rows.filter((w) => w.draft).map((w) => [w.draft!.invoiceId, w.draft!])).values()],
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
