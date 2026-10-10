import { NextRequest, NextResponse } from 'next/server'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import {
  total, forCandidate, forCustomer, health, belowFloor,
} from '@/lib/profitability'
import { placementBooks, pairsFor, bookEarned, billingTotal, REVENUE_HEADING, AGREED_SPREAD, EARNED_MARGIN } from '@/lib/money/margin'
import {
  spreadOn, blendedSpread, sellSideRate, isLive, scopeSays, spreadHealth,
  type Pair, type Scope,
} from '@/lib/money/placement-margin'
import {
  resultOf, byPerson as postingsByPerson, byCustomer as postingsByCustomer,
  byMonth, allocate, standing, type Posting,
} from '@/lib/order'

/**
 * GET /api/profitability?by=book|order|contract|candidate|customer
 *                       &scope=all|live
 *
 * ── The pair is what a placement is; the roll-up is optional ─────────
 *
 * Corrected 2026-09-26, on a walk of Teleworld Solutions. `by=order`
 * grouped strictly by `projectOrderId`, so a firm that had tagged nothing
 * to a master contract read an empty page while `/dashboard/reports`
 * computed a margin from the same two placements two clicks away.
 *
 * CLAUDE.md says the roll-up is optional by design — "a company tags
 * lines to one when it wants to see contract profitability;
 * `projectOrderId` is nullable on both lines" — and that a pair is not,
 * because `ContractLink` is written by the award. The screen was built the
 * other way round: it showed nothing unless the optional thing existed.
 * 2017's mandatory container is named in CLAUDE.md as the mistake not to
 * repeat, and an empty page for every firm that has not tagged anything is
 * that mistake wearing a blank instead of a form.
 *
 * So the order view reads the pair where there is no roll-up. A tagged
 * line reads under its master contract; an untagged one reads as the
 * placement it is; a sell line with no buy line behind it is a sentence
 * saying so rather than a silent omission.
 *
 * `by=book` is the one blended figure, and it exists so that
 * `/dashboard/reports` asks this route rather than recomputing a margin
 * of its own in the browser. Two screens that each do their own
 * arithmetic will disagree, and this pair did: Reports read 10.1% by
 * averaging every active sell rate against every active buy rate, which
 * for a GSI put its own sub-vendor's rate into its own revenue. One door
 * or two numbers; there is no third option.
 *
 * `scope` is a real decision and is echoed on every answer. Default is
 * every placement to date, finished work included, because profitability
 * is a historical question and hiding a placement that ran ten months and
 * lost money is the opposite of the point. `live` is offered, and the
 * sentence says which is being shown.
 *
 * What placements actually made, once burden, commission, expenses and
 * the bench are counted.
 *
 * Every number comes from the work ledger rather than from a rate card.
 * The client approved forty hours and the employer accepted thirty-eight
 * — those are two different figures and the margin is neither rate times
 * one of them.
 *
 * Gated on `margin.read`, which has been a real permission since the
 * first commit and until now guarded nothing.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Profitability')
  if (notStaff) return notStaff

  if (!hasPermission(caller.permissions, 'margin.read') && !hasPermission(caller.permissions, 'pnl.read')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          // Names the desks that do read it, at this firm, rather than
          // guessing the reader's job: a delivery engineer was told he was
          // a recruiter.
          message: askTheDesk({
            doing: 'Reading what placements earn',
            needs: ['margin.read', 'pnl.read'],
            kind: caller.company?.kind,
            companyName: caller.company?.name,
          }),
        },
      },
      { status: 403 }
    )
  }

  const companyId = caller.company!.id
  const params = new URL(request.url).searchParams
  const by = params.get('by') ?? 'contract'
  const scope: Scope = params.get('scope')?.toLowerCase() === 'live' ? 'LIVE' : 'ALL'

  // ── The pairs, which exist whether or not anybody tagged them ───────
  //
  // Read before the postings, because the book has to be answerable for a
  // firm that has never opened a master contract. Loaded once and used by
  // `by=book` and by the order view's fallback.
  const pairs = await pairsFor(companyId, scope)

  // The one margin service (lib/money/margin), read once for every view:
  // each placement this firm sells, priced on its own rates.
  const books = await placementBooks(companyId, { scope, pairs })
  const booksInScope = scope === 'LIVE' ? books.filter((b) => b.live) : books
  // The earned figure across the book and the three revenue figures, on
  // every answer, under the names every screen uses.
  const common = {
    labels: { agreed: AGREED_SPREAD, earned: EARNED_MARGIN, revenue: REVENUE_HEADING },
    earned: bookEarned(booksInScope.map((b) => ({ earned: b.earned, currency: b.currency }))),
    billing: billingTotal(booksInScope.map((b) => b.billing)),
  }

  if (by === 'book') {
    const book = blendedSpread(pairs.pairs, scope)
    return NextResponse.json({
      data: {
        ...common,
        by: 'book',
        scope: scope.toLowerCase(),
        scopeSays: scopeSays(scope),
        // The one blended figure, from the one door. Reports reads this
        // rather than averaging rates in the browser, because two screens
        // doing their own arithmetic is two numbers.
        agreed: book,
        // What is billed, over the firm's own sell lines, whether or not
        // anything is priced behind them. Revenue does not need a cost,
        // and a live placement with no buy line has revenue and no margin.
        revenue: sellSideRate(pairs.all, scope),
        // The same figure split by the client it is billed to, so a screen
        // drawing revenue per client reads it here rather than filtering a
        // contract list it cannot scope. Only the firm's own sell lines are
        // in `pairs`, which is the whole correction.
        revenueByClient: byClient(pairs.all, scope),
        // The firm's own placements by state. A screen counting its sell
        // lines has the same problem the revenue figure had: a supplier's
        // line billing us is on the sell list and is not our placement.
        pipeline: pipelineOf(pairs.all),
        health: spreadHealth(book, null),
        placements: pairs.pairs.length,
        unlinked: pairs.unlinked,
        note:
          'What was agreed, per hour, across every placement once at its own weight. ' +
          'Not what the work earned \u2014 hours, burden, commission and the bench are on Profitability.',
      },
    })
  }

  // ── The order, where anything has posted to one ─────────────────────
  //
  // Postings are the ledger. Where they exist they are what the money
  // actually did, so they win over anything re-derived from a contract
  // and a rate card. Where a company has none yet — nothing awarded
  // since orders went in — the contract-derived views below still
  // answer, and the note says which is being read.
  const posted = await prisma.orderPosting.findMany({
    where: { companyId },
    select: {
      id: true, kind: true, amountCents: true, postedAt: true, says: true,
      reversalOfId: true, sellContractId: true, buyContractId: true,
      currency: true, txCurrency: true, txAmountCents: true,
      settledAt: true, settledCents: true,
      personId: true, person: { select: { name: true } },
      clientCompanyId: true, clientCompany: { select: { name: true } },
      projectOrderId: true,
      projectOrder: {
        select: {
          id: true, code: true, name: true, budgetCents: true, currency: true,
          // The close section needs to know where an order stands and
          // where its balance would go. An order with no cost center
          // cannot be settled, and saying so before somebody presses the
          // button is cheaper than a 422 afterwards.
          status: true, settledAt: true,
          settlesTo: { select: { id: true, code: true, name: true } },
        },
      },
    },
    orderBy: { postedAt: 'asc' },
    take: 20_000,
  })

  if (posted.length > 0 && (by === 'order' || by === 'candidate' || by === 'customer')) {
    const ps: Posting[] = posted.map((p) => ({
      id: p.id,
      kind: p.kind as Posting['kind'],
      amountCents: p.amountCents,
      personId: p.personId,
      personName: p.person?.name ?? null,
      clientCompanyId: p.clientCompanyId,
      clientName: p.clientCompany?.name ?? null,
      sellContractId: p.sellContractId,
      buyContractId: p.buyContractId,
      postedAt: p.postedAt,
      says: p.says,
      reversalOfId: p.reversalOfId,
      currency: p.currency,
      txCurrency: p.txCurrency,
      txAmountCents: p.txAmountCents,
      settledAt: p.settledAt,
      settledCents: p.settledCents,
    }))

    if (by === 'candidate') {
      return NextResponse.json({
        data: {
          ...common,
          by: 'candidate',
          source: 'POSTINGS',
          rows: postingsByPerson(ps),
          overall: resultOf(ps),
          note:
            'One consultant, every customer and every rate they ever had. ' +
            'A rate change no longer splits them in two.',
        },
      })
    }

    if (by === 'customer') {
      return NextResponse.json({
        data: {
          ...common,
          by: 'customer',
          source: 'POSTINGS',
          rows: postingsByCustomer(ps),
          overall: resultOf(ps),
          note:
            'One customer, every consultant placed there. ' +
            'The customer is a field now, not part of a consultant\u2019s name.',
        },
      })
    }

    // by === 'order'
    const orders = new Map<string, typeof posted>()
    for (const p of posted) {
      orders.set(p.projectOrderId, [...(orders.get(p.projectOrderId) ?? []), p])
    }

    const rows = [...orders.entries()].map(([orderId, theirs]) => {
      const mine = ps.filter((x) => theirs.some((t) => t.id === x.id))
      const meta = theirs[0].projectOrder
      return {
        orderId,
        code: meta.code,
        name: meta.name,
        currency: meta.currency,
        status: meta.status,
        settledAt: meta.settledAt,
        settlesTo: meta.settlesTo,
        result: resultOf(mine),
        standing: standing(meta.budgetCents, mine),
        people: postingsByPerson(mine),
        months: byMonth(mine),
      }
    })

    // What the sheet left at the bottom of the page. Overhead belongs to
    // the work that caused it, and the basis is stated rather than
    // buried, because an allocated cost is an opinion.
    const pot = ps
      .filter((p) => p.kind === 'OVERHEAD' && !p.sellContractId)
      .reduce((n, p) => n + p.amountCents, 0)

    const spread = allocate(
      pot,
      rows.map((r) => ({
        key: r.orderId,
        label: r.name,
        revenueCents: r.result.revenueCents,
        people: r.people.length,
      })),
      'REVENUE'
    )

    return NextResponse.json({
      data: {
        ...common,
        by: 'order',
        source: 'POSTINGS',
        rows: rows
          .map((r) => ({
            ...r,
            allocatedOverhead: spread.find((a) => a.key === r.orderId) ?? null,
          }))
          .sort((a, b) => b.result.revenueCents - a.result.revenueCents),
        overall: resultOf(ps),
        note:
          'Everything posts to the order — what was billed, what was paid, ' +
          'burden, expenses, commission. Ask it by person, by customer or by month.',
      },
    })
  }

  // ── The order view with no postings: read the pairs ─────────────────
  //
  // This used to return an empty list and the note below, which is true
  // about postings and reads as "nothing has happened here". Teleworld
  // Solutions had two placements, two `ContractLink` rows and a margin
  // worth 18.3% when this said nothing at all.
  if (by === 'order') {
    const names = new Map<string, { code: string; name: string; status: string }>()
    if (pairs.pairs.length > 0) {
      const tagged = [
        ...new Set(
          pairs.pairs.flatMap((p) =>
            [p.sell.masterContractId, p.buy?.masterContractId ?? null].filter(
              (x): x is string => !!x
            )
          )
        ),
      ]
      if (tagged.length > 0) {
        const orders = await prisma.projectOrder.findMany({
          where: { id: { in: tagged } },
          select: { id: true, code: true, name: true, status: true },
        })
        for (const o of orders) names.set(o.id, { code: o.code, name: o.name, status: o.status })
      }
    }

    const rows = masterContractRows(pairs.pairs, names, scope)

    return NextResponse.json({
      data: {
        ...common,
        by: 'order',
        // Named so the screen can say where the figure came from. PAIRS is
        // the rates two firms agreed; POSTINGS is what the money did.
        source: pairs.pairs.length > 0 ? 'PAIRS' : 'NONE',
        scope: scope.toLowerCase(),
        scopeSays: scopeSays(scope),
        rows,
        agreed: blendedSpread(pairs.pairs, scope),
        unlinked: pairs.unlinked,
        multiLinked: pairs.multiLinked,
        tagged: rows.filter((r) => r.tagged).length,
        untagged: rows.filter((r) => !r.tagged).length,
        note:
          pairs.pairs.length === 0
            ? scope === 'LIVE'
              ? 'Nothing is running right now. Ask for every placement to date to see what has finished.'
              : 'No placements on the record yet. One appears when a candidate is awarded.'
            : 'Nothing has posted to a master contract yet, so this is what the two sides agreed \u2014 ' +
              'the rates, not the hours. A placement reads under its master contract where the ' +
              'company tagged it to one, and as itself where nobody did.',
      },
    })
  }

  // ── By contract, person and customer: the one margin service ────────
  //
  // Every placement this firm sells — its own employees and the people it
  // buys in — priced on its own rates from the signatures on the rungs it
  // is party to (lib/money/margin). Computer Systems' line to Northbend
  // carries none of Helena Marsh's weeks, which are filed on Techpeple's;
  // it read nothing here until 2026-10-06 and reads her now, at its own
  // $145 against its own $118.
  const contracts = await prisma.sellContract.findMany({
    where: { id: { in: books.map((b) => b.sellContractId) } },
    select: { id: true, startDate: true, endDate: true, engagementId: true, msa: { select: { minMarginPct: true } } },
  })
  const meta = new Map(contracts.map((c) => [c.id, c]))

  const bySell = new Map(pairs.all.map((p) => [p.sell.id, p]))
  const engagementOf = (sellContractId: string) => {
    const pair = bySell.get(sellContractId)
    if (!pair?.buy || pair.buy.payRateCents <= 0) return null
    return { type: pair.buy.contractType, payRate: pair.buy.payRateCents, pair }
  }

  const rows = books.map((b) => {
    const floor = meta.get(b.sellContractId)?.msa?.minMarginPct ?? null
    return {
      contractId: b.sellContractId,
      person: b.person,
      client: b.customer,
      contractType: b.contractType ?? 'C2C',
      profit: b.profit,
      health: health(b.profit, floor),
      floorBreach: belowFloor(b.profit, floor),
      agreed: b.agreed,
      earned: b.earned,
      billing: b.billing,
      live: b.live,
      // Its own supplier only — the rung directly below — and how many
      // hops lie either side. Never what any of them charge.
      vendorName: b.boughtFrom,
      hopsAbove: b.hopsAbove,
      hopsBelow: b.hopsBelow,
      // Unpaid on this line: what it billed less what came back, from its
      // own bill lines — never an engagement's total split evenly.
      unpaidCents: Math.max(0, b.billing.billedCents - b.billing.collectedCents),
    }
  })

  // Which rows the reader asked for. Applied once, above all three views,
  // because "running now" meant only the contract view until 2026-09-26
  // and the candidate view went on listing somebody whose placement ended
  // eight months ago under a heading that said it would not.
  const inScope = scope === 'LIVE' ? rows.filter((r) => r.live) : rows

  // ── By candidate: the bench is the point ────────────────────────────
  if (by === 'candidate') {
    const byPerson = new Map<string, typeof rows>()
    for (const r of inScope) {
      byPerson.set(r.person.id, [...(byPerson.get(r.person.id) ?? []), r])
    }

    // Days on a bench listing with no contract running. What the gaps
    // cost appears on no invoice and is the number that turns a
    // profitable consultant into an unprofitable year.
    const listings = await prisma.benchListing.findMany({
      where: { companyId, revokedAt: null },
      select: { consultant: { select: { personId: true } }, grantedAt: true },
    })
    const listedSince = new Map(
      listings.map((l) => [l.consultant.personId, l.grantedAt])
    )

    const out = [...byPerson.entries()].map(([personId, theirs]) => {
      const worked = theirs.reduce((n, r) => {
        const c = contracts.find((x) => x.id === r.contractId)!
        const end = c.endDate ?? new Date()
        return n + Math.max(0, (end.getTime() - c.startDate.getTime()) / 86_400_000)
      }, 0)

      const since = listedSince.get(personId)
      const listed = since ? (Date.now() - since.getTime()) / 86_400_000 : worked
      const idle = Math.max(0, Math.round(listed - worked))

      // What this person is paid, from the buy line on their most recent
      // placement. Keyed on the person rather than the placement, because
      // a bench day belongs to nobody's placement by definition — but read
      // through the pair, so a consultant with two engagements is costed
      // at the rate they were last on rather than at whichever row a map
      // wrote last.
      const latest = theirs
        .map((r) => ({ r, c: contracts.find((x) => x.id === r.contractId)! }))
        .sort((a, b) => b.c.startDate.getTime() - a.c.startDate.getTime())[0]
      const eng = latest ? engagementOf(latest.r.contractId) : null

      // Nobody pays a corp-to-corp consultant to sit. A W2 employee on
      // the bench is paid, and that is the whole cost.
      const perIdleDay =
        eng && (eng.type === 'W2' || eng.type === 'C2H_W2')
          ? Math.round(eng.payRate * 8)
          : 0

      return {
        person: theirs[0].person,
        contracts: theirs.length,
        ...forCandidate(theirs.map((r) => r.profit), { idleDays: idle, costPerIdleDayCents: perIdleDay }),
        idleDays: idle,
      }
    })

    return NextResponse.json({
      data: {
        ...common,
        by: 'candidate',
        scope: scope.toLowerCase(),
        scopeSays: scopeSays(scope),
        rows: out.sort((a, b) => a.netMarginCents - b.netMarginCents),
        agreed: blendedSpread(pairs.pairs, scope),
        note: 'Bench days are counted. A consultant can be profitable on every assignment and lose money over a year.',
      },
    })
  }

  // ── By customer: margin cannot tell you about cash ──────────────────
  if (by === 'customer') {
    const byClient = new Map<string, typeof rows>()
    for (const r of inScope) {
      byClient.set(r.client.id, [...(byClient.get(r.client.id) ?? []), r])
    }

    const out = [...byClient.entries()].map(([, theirs]) => ({
      client: theirs[0].client,
      ...forCustomer(theirs.map((r) => r.profit), {
        contracts: theirs.length,
        people: new Set(theirs.map((r) => r.person.id)).size,
        unpaidCents: theirs.reduce((n, r) => n + r.unpaidCents, 0),
      }),
    }))

    return NextResponse.json({
      data: {
        ...common,
        by: 'customer',
        scope: scope.toLowerCase(),
        scopeSays: scopeSays(scope),
        rows: out.sort((a, b) => b.marginCents - a.marginCents),
        agreed: blendedSpread(pairs.pairs, scope),
        note: 'A client at a good margin who settles at ninety days is a different client from one at the same margin at thirty.',
      },
    })
  }

  // ── By contract ─────────────────────────────────────────────────────
  // Added up as lib/profitability always has, with the rate taken from the
  // weeks the margin covers — never the margin over revenue it has no cost
  // against — and blank where one placement has no cost behind it.
  const summed = total(inScope.map((r) => r.profit))
  const overall = { ...summed, marginPct: common.earned.pct, says: common.earned.says }

  return NextResponse.json({
    data: {
      ...common,
      by: 'contract',
      scope: scope.toLowerCase(),
      scopeSays: scopeSays(scope),
      rows: inScope.sort((a, b) => a.profit.marginCents - b.profit.marginCents),
      overall,
      // What the work earned, and what the two sides agreed. Both, both
      // labeled. A book with nothing in the hours ledger has no earned
      // margin and still has an agreed one, and saying only the first
      // reads as though the placements were not happening.
      agreed: blendedSpread(pairs.pairs, scope),
      breaches: inScope.filter((r) => r.floorBreach).length,
      // Counted separately from breaches. A placement nobody can price
      // is a different problem from one priced too thin.
      unpriced: inScope.filter((r) => r.profit.costUnknown).length,
      // Sell lines the award never linked a buy line to. On the screen as
      // a count rather than dropped from the list.
      unlinked: pairs.unlinked,
      multiLinked: pairs.multiLinked,
      note: 'Every figure comes from what was actually approved and accepted, not from a rate card.',
    },
  })
}

/**
 * The order view, read off the pairs rather than off postings.
 *
 * A tagged line reads under its master contract by name. An untagged one
 * reads as the placement it is, under its own heading, because a company
 * that has tagged nothing still has placements and still has margins on
 * them. The roll-up is the option; the pair is the placement.
 */
function masterContractRows(
  pairs: Pair[],
  names: Map<string, { code: string; name: string; status: string }>,
  scope: Scope
) {
  const groups = new Map<string, Pair[]>()
  for (const p of pairs) {
    // The line's own tag first, then the buy line's. Either end of a pair
    // may carry it and the founder's rule is that the company tags what it
    // wants to read as one deal.
    const key = p.sell.masterContractId ?? p.buy?.masterContractId ?? UNTAGGED
    groups.set(key, [...(groups.get(key) ?? []), p])
  }

  return [...groups.entries()]
    .map(([key, theirs]) => {
      const meta = key === UNTAGGED ? null : names.get(key) ?? null
      return {
        masterContractId: key === UNTAGGED ? null : key,
        code: meta?.code ?? null,
        // A company that has tagged nothing is not told it has an
        // untitled order. It is told these are its placements.
        name:
          meta?.name ??
          (theirs.length === 1
            ? `${theirs[0].sell.personName} at ${theirs[0].sell.clientName}`
            : 'Not tagged to a master contract'),
        status: meta?.status ?? null,
        tagged: key !== UNTAGGED,
        agreed: blendedSpread(theirs, scope),
        placements: theirs.map((p) => ({
          sellContractId: p.sell.id,
          buyContractId: p.buy?.id ?? null,
          person: { id: p.sell.personId, name: p.sell.personName },
          client: { id: p.sell.clientId, name: p.sell.clientName },
          contractType: p.buy?.contractType ?? null,
          vendorName: p.buy?.vendorName ?? null,
          live: isLive(p),
          agreed: spreadOn(p, scope),
        })),
      }
    })
    .sort((a, b) => {
      // Tagged deals first, then the biggest book. A null rate sorts last
      // rather than as a zero, because unknown is not small.
      if (a.tagged !== b.tagged) return a.tagged ? -1 : 1
      return (b.agreed.totalBillRateCents ?? -1) - (a.agreed.totalBillRateCents ?? -1)
    })
}

const UNTAGGED = '__untagged__'

/**
 * Revenue per client, over the firm's own sell lines only.
 *
 * Refuses a total where a client is billed in two currencies rather than
 * adding them, and says so on the row instead of drawing a bar.
 */
function byClient(all: Pair[], scope: Scope) {
  const mine = scope === 'LIVE' ? all.filter((p) => p.sell.state === 'IN_PROGRESS') : all
  const groups = new Map<string, Pair[]>()
  for (const p of mine) groups.set(p.sell.clientId, [...(groups.get(p.sell.clientId) ?? []), p])

  return [...groups.entries()]
    .map(([clientId, theirs]) => {
      const r = sellSideRate(theirs, 'ALL')
      return {
        clientId,
        name: theirs[0].sell.clientName,
        placements: theirs.length,
        billRateCents: r.billRateCents,
        monthlyCents: r.monthlyCents,
        currency: r.currency,
        refusedBecause: r.refusedBecause,
      }
    })
    .sort((a, b) => (b.monthlyCents ?? -1) - (a.monthlyCents ?? -1))
}

/** The firm's own placements, by state. Only its own — see `pairsFor`. */
function pipelineOf(all: Pair[]) {
  const counts: Record<string, number> = {}
  for (const p of all) counts[p.sell.state] = (counts[p.sell.state] ?? 0) + 1
  return { counts, total: all.length }
}
