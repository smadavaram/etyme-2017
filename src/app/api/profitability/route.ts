import { NextRequest, NextResponse } from 'next/server'
import { hasPermission } from '@/lib/permissions'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { priceByDay, rateInForce, ratePeriods } from '@/lib/contract-rate'
import {
  profitOf, total, forCandidate, forCustomer, health, belowFloor,
  type Line, type ContractType,
} from '@/lib/profitability'
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
          message: 'You cannot see what placements earn. A recruiter role deliberately does not.',
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

  if (by === 'book') {
    const book = blendedSpread(pairs.pairs, scope)
    return NextResponse.json({
      data: {
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

  const contracts = await prisma.sellContract.findMany({
    where: { companyId },
    select: {
      id: true, billRate: true, startDate: true, endDate: true,
      person: { select: { id: true, name: true } },
      clientCompany: { select: { id: true, name: true } },
      msa: { select: { minMarginPct: true } },
      timesheets: {
        select: {
          id: true,
          // The days, so each hour is priced at the rate in force the day
          // it was worked rather than one rate across the whole book.
          days: true, periodStart: true, periodEnd: true,
          assertions: {
            where: { state: 'LIVE' },
            select: { role: true, hours: true, rateCents: true },
          },
        },
      },
      // Invoices hang off the engagement, not the contract — several
      // people on one project bill together. So unpaid is attributed at
      // the customer level, which is the level it matters at anyway.
      engagementId: true,
    },
    take: 1000,
  })

  const invoices = await prisma.invoice.findMany({
    where: {
      engagementId: { in: contracts.map((c) => c.engagementId).filter((x): x is string => !!x) },
    },
    select: { engagementId: true, total: true, paid: true },
  })

  const unpaidByEngagement = new Map<string, number>()
  for (const i of invoices) {
    const outstanding = Math.max(0, Math.round((Number(i.total) - Number(i.paid)) * 100))
    unpaidByEngagement.set(
      i.engagementId,
      (unpaidByEngagement.get(i.engagementId) ?? 0) + outstanding
    )
  }

  // How this placement is funded, which decides the burden and the cost.
  //
  // Paired through `ContractLink` — the sell line to the buy line that
  // actually pays for it. This was a `Map<personId, buyContract>` until
  // 2026-09-26, and pairing by person is wrong twice: a consultant with
  // two placements had one of them priced from the other's buy line, last
  // write winning, and a shared buy line naming four people was read as
  // whichever of them the loop reached last. `ContractLink` is written by
  // the award and is the only thing that says which cost belongs to which
  // placement.
  //
  // A sell line with no link now has no cost on record, which is what it
  // is. Guessing from a buy line that happens to name the same consultant
  // would put a confident wrong number on a screen; the gap belongs on
  // Loose ends, which already counts seven kinds of broken link.
  // Keyed off `all`, never the scoped set. What a placement costs is a
  // fact about the placement; reading it through the scope made an ENDED
  // placement report "no cost on record" the moment somebody asked for
  // live-only, which is a wrong sentence rather than a filtered one.
  const bySell = new Map(pairs.all.map((p) => [p.sell.id, p]))
  const engagementOf = (sellContractId: string) => {
    const pair = bySell.get(sellContractId)
    if (!pair?.buy || pair.buy.payRateCents <= 0) return null
    return { type: pair.buy.contractType, payRate: pair.buy.payRateCents, pair }
  }

  // Every rate change on these lines, read once: the sell line's for what
  // was billed, the buy line's for what was paid. And each buy line's own
  // recorded rate, which is its opening rate — a change never overwrites
  // it, so a day before the change still reads it.
  const buyIdsHere = [
    ...new Set(contracts.map((c) => bySell.get(c.id)?.buy?.id).filter((x): x is string => !!x)),
  ]
  const [rateRows, openingPay] = await Promise.all([
    prisma.rateHistory.findMany({
      where: {
        OR: [
          { contractType: 'SELL', contractId: { in: contracts.map((c) => c.id) } },
          ...(buyIdsHere.length ? [{ contractType: 'BUY', contractId: { in: buyIdsHere } }] : []),
        ],
      },
      select: { id: true, contractType: true, contractId: true, rate: true, fromDate: true, toDate: true, approvalState: true },
    }),
    prisma.buyContractCandidate.findMany({
      where: { buyContractId: { in: buyIdsHere } },
      select: { buyContractId: true, personId: true, payRate: true },
    }),
  ])
  const periodsFor = (side: 'SELL' | 'BUY', id: string) =>
    ratePeriods(rateRows.filter((r) => r.contractType === side && r.contractId === id))

  const rows = contracts.map((c) => {
    // Both sides from the ledger. Neither is a rate card multiplied by
    // one hours figure — and neither is one rate across every week: each
    // accepted hour is priced at the rate in force on the day it was
    // worked, on its own side of the trade.
    //
    // The pay side used to read the rate off the employer's acceptance in
    // the ledger, and the approval route wrote the BILL rate there on a
    // direct placement. Priya's pay read $112 against $112 billed, and a
    // placement agreed at 41% showed a loss.
    let billedHours = 0
    let paidHours = 0
    let billedCents = 0
    let paidCents = 0
    let payRateFromLedger = 0

    const eng = engagementOf(c.id)
    const buyId = eng?.pair.buy?.id ?? null
    const opening = buyId
      ? openingPay.find((x) => x.buyContractId === buyId && x.personId === c.person.id)?.payRate ?? eng!.payRate
      : 0
    const sellPeriods = periodsFor('SELL', c.id)
    const buyPeriods = buyId ? periodsFor('BUY', buyId) : []

    for (const t of c.timesheets) {
      const days = (t.days ?? {}) as Record<string, number>
      for (const a of t.assertions) {
        const h = Number(a.hours)
        if (a.role === 'CLIENT_APPROVAL') {
          billedHours += h
          billedCents += priceByDay({
            contractRateCents: c.billRate, periods: sellPeriods, days, hours: h,
            periodStart: t.periodStart, periodEnd: t.periodEnd,
          }).cents
        }
        if (a.role === 'EMPLOYER_ACCEPTANCE') {
          paidHours += h
          if (buyId && opening > 0) {
            paidCents += priceByDay({
              contractRateCents: opening, periods: buyPeriods, days, hours: h,
              periodStart: t.periodStart, periodEnd: t.periodEnd,
            }).cents
          } else {
            // No buy line behind it: the ledger's own figure is the only
            // one there is, and `costKnown` below says how far to trust it.
            payRateFromLedger = a.rateCents || payRateFromLedger
            paidCents += Math.round(h * a.rateCents)
          }
        }
      }
    }

    const payRate = eng?.payRate || payRateFromLedger || 0

    const line: Line = {
      billedHours,
      billRateCents: c.billRate,
      paidHours,
      payRateCents: payRate,
      contractType: eng?.type ?? 'C2C',
      // No buy contract means no cost on record. Said, rather than
      // computed around — a placement with an unknown cost reads 100%
      // margin, which is the most dangerous number this screen could
      // show because it looks like good news.
      costKnown: eng != null && payRate > 0,
      revenueCents: billedCents,
      payCents: paidCents,
    }

    const p = profitOf(line)
    const floor = c.msa?.minMarginPct ?? null


    return {
      contractId: c.id,
      person: { id: c.person.id, name: c.person.name },
      client: { id: c.clientCompany.id, name: c.clientCompany.name },
      contractType: line.contractType,
      profit: p,
      health: health(p, floor),
      floorBreach: belowFloor(p, floor),
      // The rate the two sides agreed, beside what the work earned. Two
      // figures, two labels, and neither presented as the other: the
      // agreed spread is per hour and knows nothing about hours worked,
      // burden, commission or the bench. Carried here so a placement with
      // nothing in the hours ledger yet still shows the margin on it
      // rather than reading as though nothing were happening.
      agreed: bySell.get(c.id) ? spreadOn(bySell.get(c.id)!, scope) : null,
      live: bySell.get(c.id) ? isLive(bySell.get(c.id)!) : false,
      vendorName: bySell.get(c.id)?.buy?.vendorName ?? null,
      // Split evenly across the contracts on the engagement. Honest
      // rather than precise — an invoice covering four people does not
      // record which of them each line was for.
      unpaidCents: c.engagementId
        ? Math.round(
            (unpaidByEngagement.get(c.engagementId) ?? 0) /
              contracts.filter((x) => x.engagementId === c.engagementId).length
          )
        : 0,
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
  const overall = total(inScope.map((r) => r.profit))

  return NextResponse.json({
    data: {
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

// ── The pairs ─────────────────────────────────────────────────────────

interface Pairs {
  /** Scoped by the caller's `scope`. What a margin is read over. */
  pairs: Pair[]
  /** Unfiltered. A revenue figure asks about the sell line alone. */
  all: Pair[]
  /** Sell lines the award never linked a buy line to. Named, never dropped. */
  unlinked: number
  /** Sell lines with more than one buy line over their life. */
  multiLinked: { sellContractId: string; personName: string; links: number }[]
  /** Everything, including the lines scope filtered out, for a count. */
  totalSellLines: number
}

/**
 * Every placement this company sells, with the buy line that funds it.
 *
 * The pair is the unit, not the person. Pairing by person — which the
 * contract view did until 2026-09-26, through a
 * `Map<personId, buyContract>` whose last write won — hands one
 * placement's cost to another placement of the same consultant, and does
 * it silently. `ContractLink` is written by the award and says which buy
 * line pays for which sell line, so it is the authority.
 *
 * Where a sell line has several links over its life — somebody moved
 * sub-vendor mid-assignment — the one covering today is used, else the
 * latest to start, and the count is reported. Picking one without saying
 * so is how a closed vendor's rate keeps showing up in a margin
 * (`lib/contract-links` has the same problem on the hours side and the
 * same answer).
 */
async function pairsFor(companyId: string, scope: Scope): Promise<Pairs> {
  const sells = await prisma.sellContract.findMany({
    // The firm's own sell lines only. A prime is also somebody's client,
    // and `payerScope` correctly serves it both sides of its placements
    // for a list — but its supplier's bill rate is its own cost, and
    // counting that as revenue is what put 10.1% on the Reports page.
    where: { companyId },
    select: {
      id: true, billRate: true, billCurrency: true, state: true,
      startDate: true, endDate: true, projectOrderId: true,
      person: { select: { id: true, name: true } },
      clientCompany: { select: { id: true, name: true } },
      msa: { select: { minMarginPct: true } },
      projectOrder: { select: { id: true, code: true, name: true, status: true } },
      buyLinks: {
        select: {
          effectiveFrom: true, effectiveTo: true,
          buyContract: {
            select: {
              id: true, contractType: true, state: true, payCurrency: true,
              projectOrderId: true,
              vendorCompany: { select: { name: true } },
              candidates: { select: { personId: true, payRate: true, payCurrency: true } },
            },
          },
        },
        orderBy: { effectiveFrom: 'desc' },
      },
    },
    take: 1000,
  })

  const now = Date.now()
  const multiLinked: Pairs['multiLinked'] = []

  // The rate each side agreed is the rate in force — today, or on the
  // last day of a placement that has ended. A line's own rate is its
  // opening rate and a change never overwrites it.
  const pairRates = await prisma.rateHistory.findMany({
    where: {
      approvalState: 'APPROVED',
      OR: [
        { contractType: 'SELL', contractId: { in: sells.map((c) => c.id) } },
        { contractType: 'BUY', contractId: { in: sells.flatMap((c) => c.buyLinks.map((l) => l.buyContract.id)) } },
      ],
    },
    select: { id: true, contractType: true, contractId: true, rate: true, fromDate: true, toDate: true, approvalState: true },
  })
  const inForce = (side: 'SELL' | 'BUY', id: string, opening: number, end: Date | null) =>
    rateInForce(
      opening,
      ratePeriods(pairRates.filter((r) => r.contractType === side && r.contractId === id)),
      end && end.getTime() < now ? end : new Date(now)
    ).rateCents
  let unlinked = 0

  const all: Pair[] = sells.map((c) => {
    if (c.buyLinks.length > 1) {
      multiLinked.push({
        sellContractId: c.id,
        personName: c.person.name,
        links: c.buyLinks.length,
      })
    }

    const covering =
      c.buyLinks.find(
        (l) =>
          l.effectiveFrom.getTime() <= now &&
          (l.effectiveTo === null || l.effectiveTo.getTime() >= now)
      ) ?? c.buyLinks[0]

    if (!covering) unlinked++

    const b = covering?.buyContract ?? null
    // The candidate line for this person on that buy line. A shared buy
    // line carries several people at several rates, and the one that
    // matters is the one naming the person on this sell line.
    const cand = b?.candidates.find((x) => x.personId === c.person.id) ?? null

    return {
      sell: {
        id: c.id,
        billRateCents: inForce('SELL', c.id, c.billRate, c.endDate),
        billCurrency: c.billCurrency ?? 'USD',
        state: c.state,
        personId: c.person.id,
        personName: c.person.name,
        clientId: c.clientCompany.id,
        clientName: c.clientCompany.name,
        masterContractId: c.projectOrderId,
      },
      buy:
        b == null
          ? null
          : {
              id: b.id,
              // A buy line naming nobody on it has no pay rate for this
              // person, and `spreadOn` refuses on a zero rather than
              // reading the whole bill rate as margin.
              payRateCents: cand ? inForce('BUY', b.id, cand.payRate, c.endDate) : 0,
              payCurrency: cand?.payCurrency ?? b.payCurrency ?? 'USD',
              contractType: b.contractType as ContractType,
              state: b.state,
              vendorName: b.vendorCompany?.name ?? null,
              masterContractId: b.projectOrderId,
            },
    }
  })

  return {
    pairs: scope === 'LIVE' ? all.filter(isLive) : all,
    all,
    unlinked,
    multiLinked,
    totalSellLines: all.length,
  }
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
