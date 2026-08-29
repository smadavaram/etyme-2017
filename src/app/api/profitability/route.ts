import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import {
  profitOf, total, forCandidate, forCustomer, health, belowFloor,
  type Line, type ContractType,
} from '@/lib/profitability'

/**
 * GET /api/profitability?by=contract|candidate|customer
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

  if (!caller.permissions.includes('margin.read') && !caller.permissions.includes('pnl.read')) {
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
  const by = new URL(request.url).searchParams.get('by') ?? 'contract'

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

  // How each person is engaged, which decides the burden. A W2
  // placement carries employer taxes and a C2C one does not, and
  // treating them alike pushes a firm towards the wrong work.
  const buys = await prisma.buyContract.findMany({
    where: { companyId },
    select: {
      contractType: true,
      commissionRate: true,
      candidates: { select: { personId: true, payRate: true } },
    },
  })

  const engagement = new Map<string, { type: ContractType; payRate: number }>()
  for (const b of buys) {
    for (const c of b.candidates) {
      engagement.set(c.personId, {
        type: b.contractType as ContractType,
        payRate: c.payRate,
      })
    }
  }

  const rows = contracts.map((c) => {
    // Both sides from the ledger. Neither is a rate card multiplied by
    // one hours figure.
    let billedHours = 0
    let paidHours = 0
    let payRateFromLedger = 0

    for (const t of c.timesheets) {
      for (const a of t.assertions) {
        if (a.role === 'CLIENT_APPROVAL') billedHours += Number(a.hours)
        if (a.role === 'EMPLOYER_ACCEPTANCE') {
          paidHours += Number(a.hours)
          payRateFromLedger = a.rateCents || payRateFromLedger
        }
      }
    }

    const eng = engagement.get(c.person.id)
    const payRate = payRateFromLedger || eng?.payRate || 0

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

  // ── By candidate: the bench is the point ────────────────────────────
  if (by === 'candidate') {
    const byPerson = new Map<string, typeof rows>()
    for (const r of rows) {
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

      const eng = engagement.get(personId)
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
        rows: out.sort((a, b) => a.netMarginCents - b.netMarginCents),
        note: 'Bench days are counted. A consultant can be profitable on every assignment and lose money over a year.',
      },
    })
  }

  // ── By customer: margin cannot tell you about cash ──────────────────
  if (by === 'customer') {
    const byClient = new Map<string, typeof rows>()
    for (const r of rows) {
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
        rows: out.sort((a, b) => b.marginCents - a.marginCents),
        note: 'A client at a good margin who settles at ninety days is a different client from one at the same margin at thirty.',
      },
    })
  }

  // ── By contract ─────────────────────────────────────────────────────
  const overall = total(rows.map((r) => r.profit))

  return NextResponse.json({
    data: {
      by: 'contract',
      rows: rows.sort((a, b) => a.profit.marginCents - b.profit.marginCents),
      overall,
      breaches: rows.filter((r) => r.floorBreach).length,
      // Counted separately from breaches. A placement nobody can price
      // is a different problem from one priced too thin.
      unpriced: rows.filter((r) => r.profit.costUnknown).length,
      note: 'Every figure comes from what was actually approved and accepted, not from a rate card.',
    },
  })
}
