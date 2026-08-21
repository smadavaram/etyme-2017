import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { statusNote, configured } from '@/lib/sms'
import { PING_EVERY_DAYS } from '@/lib/texts'

/**
 * GET /api/texts
 *
 * What has been said to consultants, and what came back.
 *
 * Scoped to the caller's company, and that is not a formality: a
 * consultant on two benches must never learn that from us, so one vendor
 * sees only the messages sent in their own name.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Consultant messages')
  if (notStaff) return notStaff

  const companyId = caller.company!.id
  const limit = Math.min(100, Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') ?? '50', 10)))

  const [messages, bench] = await Promise.all([
    prisma.textMessage.findMany({
      where: { companyId },
      orderBy: { at: 'desc' },
      take: limit,
      include: { person: { select: { id: true, name: true } } },
    }),
    prisma.benchListing.findMany({
      where: { companyId, revokedAt: null },
      select: {
        consultant: {
          select: {
            confirmedAt: true, unanswered: true, mobile: true, textsOffAt: true,
            person: { select: { name: true } },
          },
        },
      },
    }),
  ])

  const now = Date.now()
  const stale = bench.filter((b) => {
    const c = b.consultant.confirmedAt
    return !c || (now - c.getTime()) / 86400000 > PING_EVERY_DAYS * 2
  })

  return NextResponse.json({
    data: {
      messages: messages.map((m) => ({
        id: m.id,
        person: m.person,
        kind: m.kind,
        direction: m.direction,
        body: m.body,
        status: m.status,
        statusNote: statusNote(m.status),
        read: m.read,
        at: m.at.toISOString(),
      })),
      // How much of this bench nobody has heard from. The number the whole
      // loop exists to move.
      bench: {
        total: bench.length,
        unconfirmed: stale.length,
        noMobile: bench.filter((b) => !b.consultant.mobile).length,
        optedOut: bench.filter((b) => b.consultant.textsOffAt).length,
        says:
          bench.length === 0
            ? 'Nobody on the bench yet.'
            : stale.length === 0
              ? `All ${bench.length} confirmed within the last month.`
              : `${stale.length} of ${bench.length} have not confirmed anything for a month. Their records rank below people we have heard from.`,
      },
      provider: configured()
        ? 'configured'
        : 'not set up — messages are written down and not sent',
    },
  })
}
