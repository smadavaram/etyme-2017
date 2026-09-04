import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { notify } from '@/lib/notify'

/**
 * GET /api/cron/loose-ends — tells somebody, so nobody has to remember to look.
 *
 * The failure this exists for is not a bug. It is that closing is
 * somebody's job and accounting is somebody else's, often part-time, and
 * a placement raised without its buy side breaks nothing on the day. It
 * breaks at month end, when the margin report reads a hundred per cent
 * and the person who knew the rate has moved on.
 *
 * So the queue is pushed rather than pulled. A report is something
 * somebody has to think to ask for, and the person who would think to ask
 * is the one who already knows the numbers are wrong.
 *
 * Only two things are told: a gap that has just appeared, while it is
 * still a phone call, and one about to go cold, while somebody can still
 * answer it. Telling anybody about the same gap every morning for four
 * months is how a daily digest gets filtered to a folder.
 */

const DAY = 86_400_000

/** Told once when it appears. Long enough for the same-day paperwork. */
const FRESH_DAYS = 3

/** And once more just before nobody remembers. */
const GOING_COLD_DAYS = 75

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = Date.now()
  let told = 0
  let companies = 0

  // Sell contracts with nothing on record saying what they cost. The
  // single gap that matters most, checked directly rather than through
  // the whole detector, because a cron should be cheap.
  const sells = await prisma.sellContract.findMany({
    where: { state: { notIn: ['CANCELLED'] } },
    select: {
      id: true, companyId: true, createdAt: true, startDate: true,
      person: { select: { id: true, name: true } },
      clientCompany: { select: { name: true } },
      buyLinks: { select: { id: true }, take: 1 },
    },
    take: 5000,
  })

  const byCompany = new Map<string, { name: string; client: string; days: number; fresh: boolean }[]>()

  for (const s of sells) {
    if (s.buyLinks.length > 0) continue

    const buy = await prisma.buyContract.findFirst({
      where: { companyId: s.companyId, candidates: { some: { personId: s.person.id } } },
      select: { id: true },
    })
    if (buy) continue

    const days = Math.floor((now - (s.startDate ?? s.createdAt).getTime()) / DAY)
    const fresh = days <= FRESH_DAYS
    const goingCold = days >= GOING_COLD_DAYS && days < GOING_COLD_DAYS + 3

    // Everything in between is on the screen and does not need an email.
    if (!fresh && !goingCold) continue

    byCompany.set(s.companyId, [
      ...(byCompany.get(s.companyId) ?? []),
      { name: s.person.name, client: s.clientCompany.name, days, fresh },
    ])
  }

  for (const [companyId, gaps] of byCompany) {
    companies++

    // Whoever actually fixes this. A recruiter cannot set a pay rate they
    // were never told, so it goes to the people who can.
    const owners = await prisma.context.findMany({
      where: {
        companyId,
        revokedAt: null,
        role: { permissions: { has: 'margin.read' } },
      },
      select: { personId: true },
      take: 5,
    })

    const cold = gaps.filter((g) => !g.fresh)
    const body =
      cold.length > 0
        ? `${cold.map((g) => `${g.name} at ${g.client}, ${g.days} days`).join('; ')}. ` +
          `Past ninety days nobody usually remembers what rate was agreed, so these are ` +
          `close to being unanswerable.`
        : `${gaps.map((g) => `${g.name} at ${g.client}`).join('; ')}. ` +
          `Each is billed with nothing on record saying what they cost, so their margin ` +
          `reads as a hundred per cent. Two minutes each today; an archaeology exercise in April.`

    for (const o of owners) {
      await notify({
        personId: o.personId,
        companyId,
        type: 'SYSTEM',
        title:
          cold.length > 0
            ? `${cold.length} placement${cold.length === 1 ? '' : 's'} about to become unanswerable`
            : `${gaps.length} placement${gaps.length === 1 ? '' : 's'} with no cost on record`,
        body,
      })
      told++
    }
  }

  return NextResponse.json({
    data: {
      companies,
      told,
      says:
        companies === 0
          ? 'Every placement has a cost behind it. Nobody needed telling.'
          : `${companies} compan${companies === 1 ? 'y' : 'ies'} told about placements with no cost on record.`,
    },
  })
}
