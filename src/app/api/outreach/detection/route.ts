import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { queueSeat } from '../../decision-items/door'
import { outreachNo } from '../door'
import { scanTripwires } from '@/lib/outreach/tripwires'
import { releaseWaiting } from '@/lib/outreach/pack'
import { resultsOf } from '@/lib/outreach/results'
import { TRIPWIRE_WORDS, type TripwireKind } from '@/lib/outreach/tripwire-rules'
import { CONTENT_LABELS, type ContentKind } from '@/lib/outreach/match-rules'

/**
 * GET  /api/outreach/detection  what fired on the record, what was drafted, what waits, and the Owner's results
 * POST /api/outreach/detection  look now: the same scan the nightly job runs, for this firm only
 *
 * Advanced outreach, detection (record 135). Each firing is a row with its
 * reason. A push is a firing plus a matched segment and content; it sits in an
 * approved pack or waits as a card. Nothing here sends mail. The nightly job
 * (`/api/cron/outreach-detect`) runs it each night, before the outreach walker; this is its door by hand.
 */
export async function GET(request: NextRequest) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  const no = outreachNo(seat)
  if (no) return no
  const firings = await prisma.outreachTripwireFiring.findMany({ where: { companyId: seat.companyId }, orderBy: [{ firedAt: 'desc' }, { id: 'desc' }], take: 50, include: { pushes: true } })
  const results = seat.ownerOrAdmin ? await resultsOf(seat.companyId) : null
  return NextResponse.json({
    data: {
      firings: firings.map((f) => ({
        id: f.id, kind: f.kind, words: TRIPWIRE_WORDS[f.kind as TripwireKind] ?? f.kind, reason: f.reason, state: f.state, firedAt: f.firedAt,
        pushes: f.pushes.map((p) => ({ id: p.id, contentKind: p.contentKind, contentLabel: CONTENT_LABELS[p.contentKind as ContentKind] ?? p.contentKind, subject: p.subject, state: p.state, drafter: p.drafter, packId: p.packId })),
      })),
      results,
    },
  })
}

export async function POST(request: NextRequest) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  const no = outreachNo(seat)
  if (no) return no
  const now = new Date()
  const scan = await scanTripwires(seat.companyId, now)
  const released = await releaseWaiting(seat.companyId, now)
  return NextResponse.json({ data: { fired: scan.fired, pushes: scan.pushes, queued: scan.queued + released, waiting: scan.waiting, notes: scan.notes } })
}
