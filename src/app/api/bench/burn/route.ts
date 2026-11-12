import { NextRequest, NextResponse } from 'next/server'
import { notAtACompany } from '@/lib/bench-filter'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission, canReadCostAggregates, askTheDesk, type FieldContext } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { requirementScope } from '@/lib/resolve-client-company'
import { payTrail, READS_PAY } from '@/lib/money/pay-visibility'
import { writePayTrail } from '@/lib/money/pay-trail'
import { burnOf } from '@/lib/bench-policy'
import { benchHolidays } from '../holiday-pay'
import { burnTotals, byCostWithinCurrency, WORKING_DAYS_A_MONTH, WORKING_DAYS_A_WEEK } from './totals'

/**
 * GET /api/bench/burn
 *
 * Bench burn dashboard — the daily cost of having unplaced consultants.
 *
 * For each bench listing where the consultant has a BuyContract in
 * BENCH_PAID or IN_PROGRESS state, calculate the daily cost:
 *   dailyCost = payRate × 8 hours
 *
 * Groups by tier (RETAINED vs MARKETING), calculates aggregate burn,
 * and identifies the highest-cost bench sitters.
 *
 * Why this matters: a vendor with 10 bench-paid consultants at $40/hr
 * burns $3,200/day. Proactive matching reduces that to near-zero.
 * This endpoint turns that abstract cost into a visible number.
 *
 * Requires consultants.cost permission for rate visibility.
 *
 * ── Who reads it (checked 2026-09-30, against the pay rule) ───────────
 *
 * Every figure on this page is somebody's pay, or a sum of pay — and a
 * sum over a bench of one is that person's pay. So it is refused whole
 * to a seat without `consultants.cost` (the desks that run pay), rather
 * than withheld figure by figure: a burn page with every figure blank is
 * not a page. A delivery engineer who reads assignments and timesheets
 * is refused in a sentence naming the desks that read pay. A desk that
 * does read it puts each person whose pay it was shown on the access
 * trail (lib/money/pay-trail), the reader's own line excepted.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!hasPermission(caller.permissions, 'consultants.read')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: askTheDesk({
            doing: 'Reading what the bench costs',
            needs: 'consultants.read',
            kind: caller.company?.kind,
            companyName: caller.company?.name,
          }),
        },
      },
      { status: 403 }
    )
  }

  const fieldCtx: FieldContext = {
    permissions: caller.permissions,
    isSubject: false,
  }
  const showCost = canReadCostAggregates(fieldCtx)

  if (!showCost) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: askTheDesk({
            doing: 'Reading what the bench costs',
            needs: READS_PAY,
            kind: caller.company?.kind,
            companyName: caller.company?.name,
          }),
        },
      },
      { status: 403 }
    )
  }

  const companyId = caller.company?.id
  if (!companyId) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: notAtACompany('bench cost') } },
      { status: 403 }
    )
  }

  // Bench listings for this company (not revoked)
  const listings = await prisma.benchListing.findMany({
    where: {
      companyId,
      revokedAt: null,
    },
    include: {
      consultant: {
        select: {
          id: true,
          personId: true,
          headline: true,
          skills: true,
          availableFrom: true,
          person: {
            select: {
              id: true,
              name: true,
              // The pay rate lives on the candidate line, since one buy
              // contract can cover several people at different rates.
              buyCandidacies: {
                where: {
                  state: 'ACTIVE',
                  buyContract: {
                    state: { in: ['IN_PROGRESS', 'BENCH_PAID'] },
                    companyId,
                  },
                },
                select: {
                  id: true,
                  payRate: true,
                  payCurrency: true,
                  buyContract: { select: { id: true, state: true, contractType: true } },
                },
                take: 1,
              },
            },
          },
        },
      },
    },
    orderBy: { grantedAt: 'desc' },
  })

  const now = new Date()

  // Calculate burn for each listing
  interface BurnEntry {
    personId: string
    personName: string
    headline: string | null
    skills: string[]
    tier: string
    payRate: number     // minor units per hour, in `currency`
    /** The person's pay line's currency: every amount on this entry is in it. */
    currency: string
    contractType: string
    daysOnBench: number
    availableFrom: string | null
    /** Minor units per working day, from `burnOf`, in `currency`. */
    dailyCents: number
    toDateCents: number
    workingDays: number
    calendarDays: number
    /** Weekday holidays on the firm's calendar this person is not paid for. */
    holidaysNotPaid: number
    /** Whether they are paid for a public holiday on the bench, in the rule's own words. */
    holidaySays: string
    says: string
  }

  const entries: BurnEntry[] = []

  // Whether each person's hours are billed today, and when they last
  // stopped being: a live sell line here (in progress, started, not ended)
  // makes them a placed person and not a bench cost; the latest ended one
  // is when their bench time began, if it is later than the listing.
  const personIds = listings.map((l) => l.consultant.personId)
  const lines = personIds.length
    ? await prisma.sellContract.findMany({
        where: { companyId, personId: { in: personIds }, state: { in: ['IN_PROGRESS', 'ENDED'] } },
        select: { personId: true, state: true, startDate: true, endDate: true },
      })
    : []
  const liveOf = (pid: string) =>
    lines.some((c) => c.personId === pid && c.state === 'IN_PROGRESS' && c.startDate <= now && (!c.endDate || c.endDate >= now))
  const lastEndedOf = (pid: string) =>
    lines
      .filter((c) => c.personId === pid && c.endDate && (c.state === 'ENDED' || c.endDate < now))
      .reduce<Date | null>((a, c) => (a && a > c.endDate! ? a : c.endDate!), null)

  // Whether each person is paid for a public holiday on the bench — the
  // firm's setting and their own switch (`holidayPayFor`) — and the firm's
  // calendar, back to the earliest listing. The same answer bench profit
  // counts with, so a holiday is paid on both pages or on neither.
  const firmFacts = await prisma.company.findUnique({ where: { id: companyId }, select: { kind: true, country: true } })
  const holidays = await benchHolidays({
    companyId,
    companyKind: firmFacts?.kind ?? caller.company!.kind,
    country: firmFacts?.country ?? null,
    from: listings.reduce((a, l) => (l.grantedAt < a ? l.grantedAt : a), now),
    to: now,
  })

  for (const l of listings) {
    const candidacy = l.consultant.person.buyCandidacies[0]
    if (!candidacy) continue // no active buy contract = no cost

    const payRate = candidacy.payRate // cents per hour
    const ended = lastEndedOf(l.consultant.personId)
    const benchSince = ended && ended > l.grantedAt ? ended : l.grantedAt
    // One door for the arithmetic (`burnOf` in lib/bench-policy): working
    // days counted, not five-sevenths of calendar days guessed.
    const holidayPay = holidays.payOf(l.consultant.personId)
    const currency = (candidacy.payCurrency || 'USD').toUpperCase()
    const b = burnOf({ payRateCents: payRate, billing: liveOf(l.consultant.personId), benchSince, holidayPay }, now, currency)
    if (!b.onBench) continue

    entries.push({
      personId: l.consultant.personId,
      personName: l.consultant.person.name,
      headline: l.consultant.headline,
      skills: l.consultant.skills,
      tier: l.tier,
      payRate,
      currency,
      contractType: candidacy.buyContract.contractType,
      daysOnBench: b.calendarDays,
      availableFrom: l.consultant.availableFrom?.toISOString() ?? null,
      dailyCents: b.dailyCents!,
      toDateCents: b.toDateCents!,
      workingDays: b.workingDays,
      calendarDays: b.calendarDays,
      holidaysNotPaid: b.holidaysNotPaid,
      holidaySays: holidays.answerOf(l.consultant.personId).says,
      says: b.says,
    })
  }

  // Everybody whose pay this desk was just shown, on the trail once each.
  await writePayTrail(
    caller,
    payTrail({ permissions: caller.permissions, personId: caller.person.id }, entries),
    'the bench burn'
  )

  // Every amount stays in its own currency: one total per currency
  // (`burnTotals`), the people ordered by cost inside their own currency
  // (`byCostWithinCurrency`), never two currencies added or ranked as raw
  // numbers. Until 2026-11-12 this divided by a hundred and summed every
  // line as dollars, so a firm paying in dong or euros read the wrong sum.
  const ordered = byCostWithinCurrency(entries)
  const totals = burnTotals(entries)

  // Open roles this firm could actually put somebody forward for.
  //
  // ── What this counted before, and why it was two bugs ─────────────
  //
  // Every OPEN requirement on the platform, with no company filter at
  // all. So Techpeple's bench page read "12 open reqs for matching" over
  // a firm that could see exactly one — and the twelve were every
  // client's open roles across every tenant, including roles this firm
  // was never invited to and cannot open. A count it may not have, and
  // a number that disagreed with the Requirements page on the same menu.
  //
  // `requirementScope` is the composed rule the Requirements list itself
  // uses: the roles a firm raised, the roles it was invited to, and —
  // only where a raiser deliberately opened it — roles open to the
  // network. Read rather than reassembled, so the burn panel and the
  // list cannot drift apart.
  const scope = requirementScope(caller, null)
  const openRequirements = scope
    ? await prisma.requirement.count({ where: { ...scope, status: 'OPEN' } })
    : 0

  return NextResponse.json({
    data: {
      /** One total per currency, the currency with the most people first. */
      totals,
      benchSize: entries.length,
      benchSizeTotal: listings.length, // includes non-paid
      openRequirements,
      entries: ordered.map((e) => ({
        personId: e.personId,
        personName: e.personName,
        headline: e.headline,
        skills: e.skills,
        tier: e.tier,
        payRate: e.payRate,
        currency: e.currency,
        dailyCents: e.dailyCents,
        weeklyCents: e.dailyCents * WORKING_DAYS_A_WEEK,
        monthlyCents: e.dailyCents * WORKING_DAYS_A_MONTH,
        toDateCents: e.toDateCents,
        contractType: e.contractType,
        daysOnBench: e.daysOnBench,
        availableFrom: e.availableFrom,
        workingDays: e.workingDays,
        calendarDays: e.calendarDays,
        holidaysNotPaid: e.holidaysNotPaid,
        holidaySays: e.holidaySays,
        says: e.says,
      })),
    },
  })
}
