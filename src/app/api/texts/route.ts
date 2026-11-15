import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasAnyPermission } from '@/lib/permissions'
import { CHECK_IN_READERS, notYoursToRead } from '@/lib/releasing-soon'
import { staffOnly } from '@/lib/seat'
import { configured } from '@/lib/messages'
import {
  CHECK_IN_LOG_ACTIONS, notSentChip, whatEachWas, whatItWasSays, whyNotSent, type CheckInLog,
} from '@/lib/notify/check-in-rows'
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

  // Read by the desks that staff, run or pay the work, never by an
  // engineer who reads only his own (lib/releasing-soon, CHECK_IN_READERS).
  if (!hasAnyPermission(caller.permissions, CHECK_IN_READERS)) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: notYoursToRead('Bench check-ins', caller.company?.name) } },
      { status: 403 }
    )
  }

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
            confirmedAt: true, unanswered: true, textsOffAt: true,
            person: { select: { name: true, primaryEmail: true } },
          },
        },
      },
    }),
  ])

  // What each row was (`lib/notify/check-in-rows`): two real tries read
  // as one row listed twice while both were drawn as "reply" (fix list,
  // layer five, F3). Read from the first letter on each listing and the
  // log rows that name a letter, never from the letter's words.
  const listingIds = [...new Set(messages.filter((m) => m.direction === 'OUT' && m.aboutType === 'LISTING' && m.aboutId).map((m) => m.aboutId!))]
  const oldest = messages.length ? messages[messages.length - 1].at : null
  const [letters, logRows] = await Promise.all([
    listingIds.length
      ? prisma.textMessage.findMany({
          where: { companyId, direction: 'OUT', kind: 'LINK', aboutType: 'LISTING', aboutId: { in: listingIds } },
          orderBy: [{ at: 'asc' }, { id: 'asc' }],
          select: { id: true, aboutId: true },
        })
      : Promise.resolve([]),
    oldest
      ? prisma.automationLog.findMany({
          where: { companyId, action: { in: [...CHECK_IN_LOG_ACTIONS] }, at: { gte: oldest } },
          select: { action: true, at: true, payload: true },
        })
      : Promise.resolve([]),
  ])
  const firstOnListing = new Map<string, string>()
  for (const l of letters) if (l.aboutId && !firstOnListing.has(l.aboutId)) firstOnListing.set(l.aboutId, l.id)
  const logs: CheckInLog[] = logRows.map((l) => {
    const p = (l.payload ?? {}) as Record<string, unknown>
    return {
      action: l.action,
      at: l.at,
      messageId: typeof p.messageId === 'string' ? p.messageId : null,
      listingId: typeof p.listingId === 'string' ? p.listingId : null,
    }
  })
  const what = whatEachWas(messages, { logs, firstOnListing })

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
        // The words after the name: what this letter was. Only an
        // inbound row reads "replied".
        what: whatItWasSays(what.get(m.id) ?? (m.direction === 'IN' ? 'REPLIED' : 'MESSAGE')),
        status: m.status,
        // A try that did not go says so, and why, in the words every
        // screen uses for an email that did not go.
        notSent: m.direction === 'OUT' ? notSentChip(m.status) : null,
        whyNotSent: m.direction === 'OUT' ? whyNotSent(m.status, m.failReason) : null,
        read: m.read,
        at: m.at.toISOString(),
      })),
      // How much of this bench nobody has heard from. The number the whole
      // loop exists to move.
      bench: {
        total: bench.length,
        unconfirmed: stale.length,
        noEmail: bench.filter((b) => !b.consultant.person.primaryEmail).length,
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
