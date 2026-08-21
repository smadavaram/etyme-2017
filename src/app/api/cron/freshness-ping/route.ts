import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { dueAPing, freshnessText, mayText, PING_EVERY_DAYS, GIVE_UP_AFTER } from '@/lib/texts'
import { send, configured } from '@/lib/sms'

/**
 * GET /api/cron/freshness-ping
 *
 * Every fortnight, ask everybody on a bench whether anything has changed.
 *
 * This is the loop that keeps the whole supply side honest. A bench record
 * says somebody is free at $78; that was true three weeks ago, and nobody
 * updated it because updating records is nobody's job. Scoring a stale
 * record produces confident nonsense faster than a human could produce it
 * slowly.
 *
 * Reply 1 and the record is re-stamped as confirmed today. Reply 2 and
 * they get a link. No reply after two asks and the record is marked
 * unconfirmed and quietly drops down the rankings — the silence is
 * information too, and it is never mistaken for a yes.
 *
 * Sent in the vendor's name, one message per bench they are actually on.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  const listings = await prisma.benchListing.findMany({
    where: { revokedAt: null },
    include: {
      company: { select: { id: true, name: true } },
      consultant: {
        select: {
          id: true, rateFloor: true, mobile: true, textsOffAt: true,
          confirmedAt: true, askedAt: true, unanswered: true,
          person: { select: { id: true, name: true } },
        },
      },
    },
  })

  // One ask per person, whatever they are on the bench of. Two vendors
  // texting the same consultant the same fortnight is how a helpful loop
  // becomes spam — and it would also tell the person they are on two
  // benches, which is the vendors' business and not ours to reveal.
  const seen = new Set<string>()

  const sent: any[] = []
  const skipped: { name: string; because: string }[] = []

  for (const listing of listings) {
    const c = listing.consultant
    if (seen.has(c.person.id)) continue

    // Somebody with a live contract is working, not looking.
    const working = await prisma.sellContract.count({
      where: { personId: c.person.id, state: 'IN_PROGRESS' },
    })

    const verdict = dueAPing(
      {
        name: c.person.name,
        mobile: c.mobile,
        textsOffAt: c.textsOffAt,
        confirmedAt: c.confirmedAt,
        askedAt: c.askedAt,
        unanswered: c.unanswered,
        onBench: working === 0,
      },
      now
    )

    if (!verdict.ok) {
      skipped.push({ name: c.person.name, because: verdict.reason })
      continue
    }

    seen.add(c.person.id)

    const out = await send({
      companyId: listing.company.id,
      personId: c.person.id,
      kind: 'FRESHNESS',
      to: c.mobile,
      body: freshnessText({
        personName: c.person.name,
        vendorName: listing.company.name,
        rateCents: c.rateFloor,
      }),
      aboutType: 'LISTING',
      aboutId: listing.id,
    })

    // Asked, and counted as unanswered until they answer. The count is the
    // thing that stops a third ask and marks the record unconfirmed.
    await prisma.consultantProfile.update({
      where: { id: c.id },
      data: { askedAt: now, unanswered: { increment: 1 } },
    })

    sent.push({ person: c.person.name, vendor: listing.company.name, status: out.status })
  }

  return NextResponse.json({
    data: {
      asked: sent.length,
      skipped: skipped.length,
      // Said out loud, because "0 sent" with no explanation reads as broken.
      why: skipped.slice(0, 10),
      sent,
      provider: configured() ? 'configured' : 'not configured — messages recorded, not sent',
      cadence: `every ${PING_EVERY_DAYS} days, giving up after ${GIVE_UP_AFTER} silences`,
    },
  })
}
