import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cron-auth'
import { reportError } from '@/lib/alerts'
import { backfillAcceptedPapers } from '../backfill'

/**
 * POST /api/packets/backfill — staff only, behind the CRON_SECRET bearer.
 *   {}                counts the accepted papers with no record behind them, by kind
 *   { "write": true } writes the record behind each one that can be written
 *
 * Run once on production after the one-truth fix of 2026-11-03, so the
 * papers accepted before it read on the placement the way they read on
 * Paperwork. The rule is `backfillAcceptedPapers` in ../backfill.
 */
export async function POST(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await request.json().catch(() => null)
  const write = !!body && typeof body === 'object' && (body as { write?: unknown }).write === true
  try {
    return NextResponse.json({ data: await backfillAcceptedPapers({ write }) })
  } catch (err) {
    await reportError('packets/backfill', err).catch(() => undefined)
    return NextResponse.json(
      { error: { code: 'FAILED', message: 'The records could not all be written. Staff have been told. Run it again: it only touches papers still without one.' } },
      { status: 500 }
    )
  }
}
