import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { isConsultantSeat } from '@/lib/seat'
import { ratePeriods } from '@/lib/contract-rate'
import { placementEarned, priceSheets, type SheetToPrice } from '@/lib/money/placement-earned'
import { placementPayTermsMany, placementMoneySheets, payTermsKey } from '@/lib/money/placement-pay-terms'
import { payTrail } from '@/lib/money/pay-visibility'
import { writePayTrail } from '@/lib/money/pay-trail'
import { standingOf, type RosterLine } from '@/lib/consultant-portfolio'
import type { Policy } from '@/lib/bench-policy'
import {
  mayReadBenchProfit, benchSpell, benchToBill, courseGroup, utilization, moveSaving, policySays, isMove,
  type Earned, type LineSpan, type Placed, type Standing,
} from '@/lib/bench-profit'
import { benchHolidays } from '../holiday-pay'

/**
 * GET /api/bench/profit
 *
 * Bench profit, on Our bench (CLAUDE.md, decided 2026-09-30): per person,
 * what their days on the bench cost and when the margin paid it back; per
 * course, what it cost and what it placed; for an integrator, utilization
 * and what its internal moves cost on the bench.
 *
 * Read by the owner, the admin and the finance desk and by nobody else
 * (`mayReadBenchProfit`). Never a client: a supplier's margin is the one
 * thing it keeps from its client. Every figure is the firm's own — its
 * own lines, its own pay, its own courses — and every person whose pay a
 * figure was worked from is on the access trail before the answer leaves.
 *
 * Nothing here decides money. The bench cost is `benchCost` under the
 * firm's policy, the day rate is `burnOf`'s, and the margin is
 * `placementEarned`'s — the placement page's own figure, read week by week
 * so the week it caught up can be named.
 */

const LIVE_OR_PAPERED = ['PENDING_VERIFICATION', 'VERIFIED', 'IN_PROGRESS', 'PAUSED', 'ENDED'] as const

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const role = caller.context.roleId
    ? await prisma.role.findUnique({ where: { id: caller.context.roleId }, select: { name: true } })
    : null
  const verdict = mayReadBenchProfit({
    companyName: caller.company?.name ?? 'your firm',
    companyKind: caller.company?.kind ?? null,
    roleName: role?.name ?? null,
    consultantSeat: isConsultantSeat(caller),
  })
  if (!verdict.ok) {
    return NextResponse.json({ error: { code: verdict.code, message: verdict.message } }, { status: 403 })
  }

  const companyId = caller.company!.id
  const now = new Date()

  const firm = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { name: true, kind: true, country: true, homeCurrency: true, benchPolicy: true, benchRateBps: true, benchCarryDays: true, reserveBps: true, reserveOnExit: true },
  })
  const policy: Policy = {
    policy: firm.benchPolicy,
    benchRateBps: firm.benchRateBps,
    carryDays: firm.benchCarryDays,
    reserveBps: firm.reserveBps,
    reserveOnExit: firm.reserveOnExit,
  }

  // ── Who is on this firm's bench, by either consent ──────────────────
  //
  // A listing the person granted, or employment here. Staff with no line
  // and no listing never have a spell and drop out below.
  const [listings, employees] = await Promise.all([
    prisma.benchListing.findMany({
      where: { companyId, revokedAt: null, state: 'GRANTED' },
      select: { grantedAt: true, consultant: { select: { personId: true, person: { select: { name: true } } } } },
    }),
    prisma.context.findMany({
      where: {
        companyId, type: 'EMPLOYEE', revokedAt: null, suspendedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { personId: true, person: { select: { name: true } } },
    }),
  ])
  const names = new Map<string, string>()
  const joined = new Map<string, Date>()
  for (const l of listings) {
    names.set(l.consultant.personId, l.consultant.person.name)
    const had = joined.get(l.consultant.personId)
    if (!had || l.grantedAt < had) joined.set(l.consultant.personId, l.grantedAt)
  }
  for (const e of employees) names.set(e.personId, e.person.name)
  const ids = [...names.keys()]

  const [sells, benchPay] = await Promise.all([
    prisma.sellContract.findMany({
      where: { companyId, personId: { in: ids }, state: { in: [...LIVE_OR_PAPERED] } },
      select: {
        id: true, personId: true, state: true, startDate: true, endDate: true, billRate: true, billCurrency: true,
        clientCompany: { select: { name: true } },
        endClientCompany: { select: { name: true } },
        buyLinks: {
          select: {
            effectiveFrom: true, effectiveTo: true,
            buyContract: {
              select: {
                id: true, contractType: true, payCurrency: true,
                candidates: { select: { personId: true, payRate: true, payCurrency: true } },
              },
            },
          },
          orderBy: { effectiveFrom: 'desc' },
        },
      },
    }),
    // A pay line for somebody between placements, where the firm keeps one.
    prisma.buyContractCandidate.findMany({
      where: { personId: { in: ids }, buyContract: { companyId, state: 'BENCH_PAID' } },
      select: { personId: true, payRate: true, payCurrency: true, buyContract: { select: { contractType: true, payCurrency: true } } },
    }),
  ])

  // Whether each person is paid for a public holiday on the bench, and the
  // firm's calendar back to the earliest day any spell here can start.
  const earliest = [...joined.values(), ...sells.map((s) => s.startDate)].reduce((a, d) => (d < a ? d : a), now)
  const holidays = await benchHolidays({
    companyId, companyKind: firm.kind, country: firm.country ?? null, from: earliest, to: now,
  })

  type Sell = (typeof sells)[number]
  const sellsOf = (pid: string) => sells.filter((s) => s.personId === pid)
  const span = (s: Sell): LineSpan => ({ id: s.id, startsOn: s.startDate, endsOn: s.endDate })

  /** The buy line that funds a sell line, and this person's pay on it. */
  const payOn = (s: Sell) => {
    const link =
      s.buyLinks.find((l) => l.effectiveFrom <= now && (l.effectiveTo == null || l.effectiveTo >= now)) ?? s.buyLinks[0]
    const b = link?.buyContract
    const cand = b?.candidates.find((c) => c.personId === s.personId)
    if (!b || !cand) return null
    return { buyContractId: b.id, payRateCents: cand.payRate, contractType: b.contractType as string, currency: cand.payCurrency ?? b.payCurrency ?? 'USD' }
  }

  // ── The margin on a line, the placement page's way ──────────────────
  const earnedCache = new Map<string, Earned>()
  const rateRows = sells.length
    ? await prisma.rateHistory.findMany({
        where: {
          OR: [
            { contractType: 'SELL', contractId: { in: sells.map((s) => s.id) } },
            { contractType: 'BUY', contractId: { in: sells.flatMap((s) => s.buyLinks.map((l) => l.buyContract.id)) } },
          ],
        },
        select: { id: true, contractType: true, contractId: true, rate: true, fromDate: true, toDate: true, approvalState: true },
      })
    : []
  const periodsOf = (side: 'SELL' | 'BUY', id: string) =>
    ratePeriods(rateRows.filter((r) => r.contractType === side && r.contractId === id))
  const terms = await placementPayTermsMany(
    sells.flatMap((s) => {
      const p = payOn(s)
      return p ? [{ buyContractId: p.buyContractId, sellContractId: s.id, personId: s.personId }] : []
    })
  )

  async function earnedOn(s: Sell): Promise<Earned> {
    const had = earnedCache.get(s.id)
    if (had) return had
    const sheets: SheetToPrice[] = await placementMoneySheets(s.id)
    const p = payOn(s)
    const bill = { openingRateCents: s.billRate, periods: periodsOf('SELL', s.id), currency: s.billCurrency }
    const pay = p
      ? {
          openingRateCents: p.payRateCents,
          periods: periodsOf('BUY', p.buyContractId),
          currency: p.currency,
          overtime: terms.get(payTermsKey({ buyContractId: p.buyContractId, sellContractId: s.id, personId: s.personId })) ?? null,
        }
      : null
    const e = placementEarned({ sheets, bill, pay })
    // The same weeks `placementEarned` took its margin over, priced the
    // same way, so the running total ends on its figure exactly.
    const weekly =
      e.marginCents == null
        ? []
        : priceSheets({ sheets, bill, pay: pay && pay.openingRateCents > 0 ? pay : null }).sheets
            .map((w, i) => ({ w, endsOn: sheets[i].periodEnd }))
            .filter(({ w }) => w.bothSigned)
            .map(({ w, endsOn }) => ({ endsOn, marginCents: w.billedCents - (w.paidCents ?? 0) }))
    const out: Earned = {
      marginCents: e.marginCents,
      refusedBecause: e.marginRefusedBecause,
      currency: s.billCurrency,
      weeks: weekly,
    }
    earnedCache.set(s.id, out)
    return out
  }

  const siteOf = (s: Sell) => {
    const end = s.endClientCompany?.name ?? null
    const via = s.clientCompany?.name ?? null
    return end && via && end !== via ? `${end}, through ${via}` : end ?? via
  }

  // ── Per person ──────────────────────────────────────────────────────
  const listed = new Set(joined.keys())
  const enrollments = await prisma.enrollment.findMany({
    where: { course: { companyId } },
    select: {
      personId: true, status: true, enrolledAt: true, completedAt: true,
      course: { select: { id: true, title: true, price: true, currency: true } },
    },
    orderBy: { enrolledAt: 'asc' },
  })
  const courseOf = new Map<string, string>()
  for (const e of enrollments) if (!courseOf.has(e.personId)) courseOf.set(e.personId, e.course.title)

  const people = []
  // Whose pay each figure was worked from, for the trail.
  const trail: { personId: string; payRate: number }[] = []
  for (const pid of ids) {
    const mine = sellsOf(pid)
    const spell = benchSpell({ joinedBench: joined.get(pid) ?? null, lines: mine.map(span), now })
    if (spell.kind === 'UNKNOWN') continue
    // An employee who went straight onto a project and has not left it
    // has no bench story to tell; a listed person always does.
    if (!listed.has(pid) && spell.kind === 'STRAIGHT_ON') continue

    const placedLine = spell.kind === 'BEFORE' || spell.kind === 'STRAIGHT_ON' ? mine.find((s) => s.id === spell.placement.id)! : null
    const lastEnded = mine
      .filter((s) => s.endDate != null && s.endDate < now)
      .sort((a, b) => b.endDate!.getTime() - a.endDate!.getTime())[0]
    const bench = benchPay.find((b) => b.personId === pid)
    const pay = placedLine
      ? payOn(placedLine)
      : bench
        ? { payRateCents: bench.payRate, contractType: bench.buyContract.contractType as string, currency: bench.payCurrency ?? bench.buyContract.payCurrency ?? 'USD' }
        : lastEnded
          ? payOn(lastEnded)
          : null

    const row = benchToBill({
      spell,
      policy,
      payRateCents: pay?.payRateCents ?? null,
      contractType: pay?.contractType ?? null,
      currency: pay?.currency ?? firm.homeCurrency,
      earned: placedLine ? await earnedOn(placedLine) : null,
      holidayPay: holidays.payOf(pid),
      // Said wherever the rate is not a line paying them on those days, so
      // the figure reads as what the policy says, never as money paid out.
      rateFrom: placedLine
        ? 'Priced at what they are paid on the placement that followed, as your policy reads it.'
        : !bench && lastEnded
          ? 'Nothing on the record pays them today; priced at the pay of their last placement, as your policy reads it.'
          : null,
    })
    trail.push({ personId: pid, payRate: pay?.payRateCents ?? 0 })
    people.push({
      personId: pid,
      name: names.get(pid)!,
      listed: listed.has(pid),
      course: courseOf.get(pid) ?? null,
      placedAt: placedLine ? siteOf(placedLine) : null,
      currency: pay?.currency ?? firm.homeCurrency,
      holiday: holidays.answerOf(pid),
      ...row,
    })
  }
  people.sort((a, b) => (b.days ?? -1) - (a.days ?? -1) || a.name.localeCompare(b.name))

  // ── Per course ──────────────────────────────────────────────────────
  const byCourse = new Map<string, typeof enrollments>()
  for (const e of enrollments) byCourse.set(e.course.id, [...(byCourse.get(e.course.id) ?? []), e])
  const courses = []
  for (const [, seats] of byCourse) {
    const c = seats[0].course
    const placed = new Map<string, Placed>()
    for (const s of seats) {
      const first = sellsOf(s.personId)
        .filter((l) => l.startDate >= s.enrolledAt && l.startDate <= now)
        .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0]
      if (!first) continue
      const e = await earnedOn(first)
      placed.set(s.personId, { startsOn: first.startDate, marginCents: e.marginCents, refusedBecause: e.refusedBecause, currency: e.currency })
    }
    courses.push(
      courseGroup({
        course: { id: c.id, title: c.title, priceCents: c.price, currency: c.currency },
        seats: seats.map((s) => ({ personId: s.personId, status: s.status, enrolledAt: s.enrolledAt, completedAt: s.completedAt })),
        placed,
      })
    )
  }

  // ── For an integrator: utilization, and what its moves cost ─────────
  let util = null
  let moves: unknown[] = []
  if (firm.kind === 'GSI') {
    const employed = [...new Set(employees.map((e) => e.personId))]
    const buys = await prisma.buyContractCandidate.findMany({
      where: {
        personId: { in: employed }, state: { in: ['ACTIVE', 'ENDED'] },
        buyContract: { companyId, state: { in: ['PENDING_VERIFICATION', 'VERIFIED', 'IN_PROGRESS', 'PAUSED', 'ENDED'] } },
      },
      select: { personId: true, startDate: true, endDate: true, state: true, buyContract: { select: { state: true } } },
    })
    const roster = employed.map((pid) => {
      const lines: RosterLine[] = [
        ...sellsOf(pid).map((s) => ({
          live: s.state === 'IN_PROGRESS' || s.state === 'PAUSED',
          paused: s.state === 'PAUSED',
          startsOn: s.startDate, endsOn: s.endDate ?? null,
          clientName: s.endClientCompany?.name ?? s.clientCompany?.name ?? null,
        })),
        ...buys.filter((b) => b.personId === pid).map((b) => ({
          live: b.state === 'ACTIVE' && (b.buyContract.state === 'IN_PROGRESS' || b.buyContract.state === 'PAUSED'),
          paused: b.buyContract.state === 'PAUSED',
          startsOn: b.startDate ?? null, endsOn: b.endDate ?? null, clientName: null,
        })),
      ]
      const v = standingOf({ personId: pid, name: names.get(pid)!, seat: null, practice: null, skills: [], listed: listed.has(pid), lines }, now)
      return { standing: v.standing as Standing, project: v.on }
    })
    util = utilization(roster)

    const endedPlaced = await prisma.projectHold.findMany({
      where: { companyId, endedHow: 'PLACED' },
      select: {
        personId: true, forTitle: true, placedStartsOn: true, placedSellContractId: true, placedSubmissionId: true,
        person: { select: { name: true } },
        release: { select: { sellContractId: true } },
      },
      orderBy: { placedStartsOn: 'desc' },
    })
    // Only a placement is a move. Somebody put forward to a client's job
    // request moves once the client places them (`isMove`).
    const subIds = endedPlaced.map((h) => h.placedSubmissionId).filter((x): x is string => !!x)
    const subStatus = new Map(
      (subIds.length
        ? await prisma.submission.findMany({ where: { id: { in: subIds } }, select: { id: true, status: true } })
        : []
      ).map((x) => [x.id, x.status])
    )
    const placedHolds = endedPlaced.filter((h) =>
      isMove({
        placedSellContractId: h.placedSellContractId,
        placedSubmissionId: h.placedSubmissionId,
        submissionStatus: h.placedSubmissionId ? subStatus.get(h.placedSubmissionId) ?? null : null,
      })
    )
    const oldIds = placedHolds.map((h) => h.release?.sellContractId).filter((x): x is string => !!x)
    const oldLines = oldIds.length ? sells.filter((s) => oldIds.includes(s.id)) : []
    moves = placedHolds.map((h) => {
      const old = oldLines.find((s) => s.id === h.release?.sellContractId) ?? null
      const pay = old ? payOn(old) : null
      trail.push({ personId: h.personId, payRate: pay?.payRateCents ?? 0 })
      return {
        personId: h.personId,
        name: h.person.name,
        to: h.forTitle,
        from: old ? siteOf(old) : null,
        oldEndsOn: old?.endDate?.toISOString().slice(0, 10) ?? null,
        newStartsOn: h.placedStartsOn?.toISOString().slice(0, 10) ?? null,
        currency: pay?.currency ?? firm.homeCurrency,
        ...moveSaving({
          oldEndsOn: old?.endDate ?? null,
          newStartsOn: h.placedStartsOn ?? null,
          policy,
          payRateCents: pay?.payRateCents ?? null,
          contractType: pay?.contractType ?? null,
          currency: pay?.currency ?? firm.homeCurrency,
          holidayPay: holidays.payOf(h.personId),
        }),
      }
    })
  }

  // Everybody whose pay a figure here was worked from, on the trail once.
  await writePayTrail(
    caller,
    payTrail({ permissions: caller.permissions, personId: caller.person.id }, trail),
    'bench profit'
  )

  return NextResponse.json({
    data: {
      firm: firm.name,
      kind: firm.kind,
      policy: firm.benchPolicy,
      policySays: policySays(policy),
      people,
      courses,
      utilization: util,
      moves,
      basis: [
        'Days on the bench run from the day somebody joined your bench, or the day their last placement here ended, to the day their next one started or today.',
        'What those days cost is your bench pay policy applied to what they are paid on the line that pays them when they bill, for an eight-hour day. Housing and other costs carried for them are not on record, so they are not counted.',
        (firm.kind === 'GSI'
          ? 'Public holidays on the bench are paid for your own people by default, unless your firm turned holiday pay off or switched a person off.'
          : 'Public holidays on the bench are not paid unless your firm turned holiday pay on and switched that person on.') +
          ' A holiday not paid is taken out of their cost. The holidays are the ones on your company calendar' +
          (firm.country ? ` for ${firm.country}.` : '.'),
        'The margin is what the client’s approved hours billed, less what you paid for the hours you accepted, on the weeks both sides signed — the same figure as the placement page. Employer burden is not taken off.',
        'A figure the record cannot support is left blank, with the reason beside it.',
      ],
    },
  })
}
