import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { cronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'
import { COLD_AFTER_DAYS, coldSince } from '@/lib/openings'

/**
 * GET /api/cron/cold-openings
 *
 * A seat nobody has advertised for six weeks is cold. Runs in the daily
 * job; one automation-log line per company naming the seats.
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const now = new Date()
  const cutoff = new Date(now.getTime() - COLD_AFTER_DAYS * 86_400_000)
  try {
    const stale = await prisma.opening.findMany({
      where: { status: 'LIVE', lastSeen: { lt: cutoff } },
      select: { id: true, companyId: true, title: true, lastSeen: true },
    })
    if (stale.length === 0) {
      return NextResponse.json({ data: { cold: 0, says: 'Every live seat has been seen inside six weeks.' } })
    }
    await prisma.$transaction(async (tx) => {
      await tx.opening.updateMany({ where: { id: { in: stale.map((o) => o.id) } }, data: { status: 'COLD' } })
      const byCompany = new Map<string, string[]>()
      for (const o of stale) byCompany.set(o.companyId, [...(byCompany.get(o.companyId) ?? []), `${o.title} (${coldSince(o.lastSeen, now)})`])
      for (const [companyId, seats] of byCompany) {
        await tx.automationLog.create({
          data: {
            companyId,
            action: 'OPENINGS_COLD',
            summary: seats.length === 1 ? `${seats[0]} — gone cold.` : `${seats.length} seats gone cold: ${seats.join('; ')}.`,
            reason: `Nobody has advertised it in ${COLD_AFTER_DAYS} days. A seat that is not being advertised is not being filled.`,
            payload: { openingIds: stale.filter((o) => o.companyId === companyId).map((o) => o.id) },
            reversible: true,
          },
        })
      }
    })
    return NextResponse.json({ data: { cold: stale.length, says: `${stale.length} seat${stale.length === 1 ? '' : 's'} gone cold.` } })
  } catch (err) {
    void reportError('cron/cold-openings', err)
    return NextResponse.json({ error: { code: 'FAILED', message: 'Marking cold seats failed; the failure has been recorded.' } }, { status: 500 })
  }
}
