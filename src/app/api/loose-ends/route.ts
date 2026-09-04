import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { looseEnd, rank, standing, mayTrustReporting, type LooseEnd } from '@/lib/loose-ends'

/**
 * GET /api/loose-ends — every placement missing a link, worst and oldest first.
 *
 * A recruiter's job is closing. The sell side gets raised because it is
 * how the client gets billed; the buy side, which only finance ever
 * looks at, does not. Nothing breaks that day — it breaks at month end,
 * when the margin report says a hundred per cent, and by then the person
 * who knew what rate was agreed has moved on.
 *
 * So this is not a report anybody has to ask for. It is a queue.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Loose ends')
  if (notStaff) return notStaff

  const companyId = caller.company!.id
  const now = new Date()
  const ends: LooseEnd[] = []

  // ── Placements with a price and no cost ─────────────────────────────
  const sells = await prisma.sellContract.findMany({
    where: { companyId, state: { notIn: ['CANCELLED'] } },
    select: {
      id: true,
      billRate: true,
      startDate: true,
      createdAt: true,
      projectOrderId: true,
      person: { select: { id: true, name: true } },
      clientCompany: { select: { name: true } },
      buyLinks: { select: { buyContractId: true }, take: 1 },
    },
    take: 2000,
  })

  const personIds = [...new Set(sells.map((s) => s.person.id))]
  const buys = await prisma.buyContract.findMany({
    where: { companyId, candidates: { some: { personId: { in: personIds } } } },
    select: {
      id: true,
      createdAt: true,
      startDate: true,
      projectOrderId: true,
      candidates: { select: { personId: true, payRate: true } },
    },
  })

  const buyByPerson = new Map<string, (typeof buys)[number]>()
  for (const b of buys) {
    for (const c of b.candidates) if (!buyByPerson.has(c.personId)) buyByPerson.set(c.personId, b)
  }

  for (const s of sells) {
    const subject = {
      id: s.id,
      label: s.person.name,
      client: s.clientCompany.name,
      // What is billed against the gap, roughly, so the list sorts by
      // consequence rather than by row count.
      amountCents: Math.round(s.billRate * 160),
      since: s.startDate ?? s.createdAt,
    }

    const buy = buyByPerson.get(s.person.id)

    if (!buy && s.buyLinks.length === 0) {
      ends.push(looseEnd('NO_BUY_CONTRACT', subject, now))
    } else if (buy) {
      const rate = buy.candidates.find((c) => c.personId === s.person.id)?.payRate ?? 0
      if (rate === 0) {
        ends.push(
          looseEnd('NO_PAY_RATE', { ...subject, id: buy.id, since: buy.startDate ?? buy.createdAt }, now)
        )
      }
      if (!buy.projectOrderId) {
        ends.push(
          looseEnd('BUY_WITHOUT_ORDER', { ...subject, id: buy.id, since: buy.startDate ?? buy.createdAt }, now)
        )
      }
    }

    if (!s.projectOrderId) {
      ends.push(looseEnd('NO_PROJECT_ORDER', subject, now))
    }
  }

  // ── Orders earning with nothing costed against them ─────────────────
  const orders = await prisma.projectOrder.findMany({
    where: { companyId, isOverheadPool: false },
    select: {
      id: true, code: true, name: true, createdAt: true, opensAt: true,
      clientCompany: { select: { name: true } },
      postings: { select: { kind: true, amountCents: true }, take: 500 },
    },
    take: 500,
  })

  for (const o of orders) {
    const revenue = o.postings
      .filter((p) => p.kind === 'REVENUE')
      .reduce((n, p) => n + p.amountCents, 0)
    const cost = o.postings.filter((p) =>
      ['PAY', 'BURDEN', 'PREMIUM', 'COMMISSION', 'VISA'].includes(p.kind)
    ).length

    if (revenue > 0 && cost === 0) {
      ends.push(
        looseEnd(
          'ORDER_WITHOUT_COST',
          {
            id: o.id,
            label: `${o.code} — ${o.name}`,
            client: o.clientCompany?.name ?? null,
            amountCents: revenue,
            since: o.opensAt ?? o.createdAt,
          },
          now
        )
      )
    }
  }

  // ── Hours billed and never costed ───────────────────────────────────
  const sheets = await prisma.timesheet.findMany({
    where: {
      sellContract: { companyId },
      assertions: { some: { role: 'CLIENT_APPROVAL', state: 'LIVE' } },
    },
    select: {
      id: true,
      periodStart: true,
      periodEnd: true,
      person: { select: { name: true } },
      assertions: { where: { state: 'LIVE' }, select: { role: true, hours: true, rateCents: true } },
    },
    take: 1000,
  })

  for (const t of sheets) {
    const accepted = t.assertions.some((a) => a.role === 'EMPLOYER_ACCEPTANCE')
    if (accepted) continue

    const approved = t.assertions.find((a) => a.role === 'CLIENT_APPROVAL')
    if (!approved) continue

    ends.push(
      looseEnd(
        'APPROVED_NEVER_ACCEPTED',
        {
          id: t.id,
          label: `${t.person.name}, ${t.periodStart.toISOString().slice(0, 10)} to ${t.periodEnd.toISOString().slice(0, 10)}`,
          amountCents: Math.round(Number(approved.hours) * approved.rateCents),
          since: t.periodEnd,
        },
        now
      )
    )
  }

  // ── Awards that never became a contract ─────────────────────────────
  //
  // No relation joins a submission to the contract it produced, so this
  // matches on the pair the contract actually carries. A placement that
  // reached neither is invisible everywhere else — it is not on the
  // profitability screen at all, because nothing was ever raised to put
  // it there.
  const awarded = await prisma.submission.findMany({
    where: { status: 'AWARDED', requirement: { companyId } },
    select: {
      id: true,
      decidedAt: true,
      submittedAt: true,
      rate: true,
      personId: true,
      requirementId: true,
      person: { select: { name: true } },
      requirement: { select: { title: true } },
    },
    take: 500,
  })

  const contracted = new Set(
    (
      await prisma.sellContract.findMany({
        where: { companyId, requirementId: { in: awarded.map((a) => a.requirementId) } },
        select: { requirementId: true, personId: true },
      })
    ).map((c) => `${c.requirementId}:${c.personId}`)
  )

  for (const a of awarded) {
    if (contracted.has(`${a.requirementId}:${a.personId}`)) continue

    ends.push(
      looseEnd(
        'AWARDED_NO_CONTRACT',
        {
          id: a.id,
          label: `${a.person.name} on ${a.requirement.title}`,
          amountCents: a.rate ? Math.round(a.rate * 160) : 0,
          since: a.decidedAt ?? a.submittedAt,
        },
        now
      )
    )
  }

  const ranked = rank(ends)

  return NextResponse.json({
    data: {
      ends: ranked,
      standing: standing(ranked),
      reporting: mayTrustReporting(ranked),
    },
  })
}
