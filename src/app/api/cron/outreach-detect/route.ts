import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { cronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'
import { scanTripwires } from '@/lib/outreach/tripwires'
import { releaseWaiting } from '@/lib/outreach/pack'
import { gatewayDrafter } from '@/lib/outreach/push'

/**
 * GET /api/cron/outreach-detect
 *
 * Advanced outreach, detection (record 135). For every firm with Outreach
 * on, looks for what the record says is worth a letter (a team with room, a
 * contract ending, a job open too long, a course finished, a visitor who came
 * back), writes one firing for each with its reason, and drafts the push. A
 * push joins an approved pack or waits as a card. This route sends nothing:
 * the outreach agent sends only what a person approved. A firm with Outreach
 * off is not read at all. One firm failing never stops another.
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const now = new Date()
  const firms = await prisma.company.findMany({ where: { pluginsOn: { has: 'OUTREACH' } }, select: { id: true } })
  let fired = 0, pushes = 0, queued = 0, waiting = 0, broke = 0
  for (const f of firms) {
    try {
      // The model writes only under the firm's own switch and tier; with no Owner to answer for it, or no model, the rules write the letter.
      const owner = await prisma.context.findFirst({ where: { companyId: f.id, role: { name: 'Owner' } }, select: { personId: true } })
      const scan = await scanTripwires(f.id, now, { draft: owner ? gatewayDrafter(f.id, owner.personId) : null })
      const released = await releaseWaiting(f.id, now)
      fired += scan.fired.length; pushes += scan.pushes; waiting += scan.waiting; queued += scan.queued + released
    } catch (err) {
      broke++
      void reportError('cron/outreach-detect', err)
    }
  }
  const says = `${firms.length} firm${firms.length === 1 ? '' : 's'} with Outreach on looked at: ${fired} new, ${pushes} drafted, ${queued} in an approved pack, ${waiting} waiting for a person${broke ? `, ${broke} could not be read` : ''}.`
  return NextResponse.json({ data: { firms: firms.length, fired, pushes, queued, waiting, broke, says } })
}
