import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { theNumber, reading, trend, seatMap, TARGET_HOURS, plain, type Role } from '@/lib/first-good'

/**
 * GET /api/first-good — how long until the first submission worth reading
 *
 * The buyer's one number. Counted from a role opening to the first
 * arrival that survives the screen — not the first CV, because a
 * supplier can flood an inbox in an hour and a number that cannot tell
 * flooding from a shortlist is a number that rewards flooding.
 *
 * Two windows, so the page can say "down from four days" rather than a
 * percentage nobody repeats.
 */

const WINDOW_DAYS = 30

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'The number')
  if (notStaff) return notStaff

  const companyId = caller.company!.id
  const now = new Date()
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000)
  const before = new Date(now.getTime() - WINDOW_DAYS * 2 * 86_400_000)

  // Roles this client raised or pays for. Not roles they were invited
  // to — a supplier's own pipeline is a different number entirely.
  //
  // Mirrors excluded. A prime forwarding a role produces a second
  // requirement record pointing at the same seat, and counting it as a
  // second role invented an extra opening with one held-back CV on it —
  // which read as a role sitting stuck for eight days when the real one
  // had four people worth reading. One seat, one number.
  const requirements = await prisma.requirement.findMany({
    where: {
      OR: [{ companyId }, { payerCompanyId: companyId }],
      createdAt: { gte: before },
      mirroredFromId: null,
    },
    select: {
      id: true, title: true, createdAt: true, openingId: true,
      mirrors: { select: { id: true } },
    },
  })

  // Everything pointing at the same seat, mapped back to the role the
  // client actually opened.
  const seats = requirements.filter((r) => r.openingId).map((r) => r.openingId!)
  const sameSeat = seats.length
    ? await prisma.requirement.findMany({
        where: { openingId: { in: seats } },
        select: { id: true, openingId: true },
      })
    : []

  const parentOf = seatMap(requirements, sameSeat)

  const arrivals = await prisma.submission.findMany({
    where: {
      toCompanyId: companyId,
      requirementId: { in: [...parentOf.keys()] },
    },
    select: { requirementId: true, submittedAt: true, screenState: true },
  })

  const byRole = new Map<string, { at: Date; cleared: boolean | null }[]>()
  for (const a of arrivals) {
    const parent = parentOf.get(a.requirementId) ?? a.requirementId
    byRole.set(parent, [
      ...(byRole.get(parent) ?? []),
      {
        at: a.submittedAt,
        // Null, never false, where nobody has screened it. Not looked at
        // is not the same as not good enough.
        cleared:
          a.screenState === 'READY' ? true : a.screenState === 'NEEDS_FIX' ? false : null,
      },
    ])
  }

  const asRole = (r: (typeof requirements)[number]): Role => ({
    requirementId: r.id,
    title: r.title,
    openedAt: r.createdAt,
    arrivals: byRole.get(r.id) ?? [],
  })

  const thisWindow = requirements.filter((r) => r.createdAt >= since).map(asRole)
  const lastWindow = requirements
    .filter((r) => r.createdAt < since && r.createdAt >= before)
    .map(asRole)

  const number = theNumber(thisWindow, now)
  const was = theNumber(lastWindow, since)

  return NextResponse.json({
    data: {
      ...number,
      // Kept whole so a page can show the worst three without another
      // round trip, but capped — a client with sixty stuck roles has a
      // different problem than a long list will solve.
      stuck: number.stuck.slice(0, 5),
      stuckTotal: number.stuck.length,
      target: { hours: TARGET_HOURS, says: plain(TARGET_HOURS) },
      trend: trend(number, was),
      // Evidence, not the target. As a headline it would reward a screen
      // that holds everything back.
      reading: reading(thisWindow),
      windowDays: WINDOW_DAYS,
      roles: thisWindow.length,
    },
  })
}
