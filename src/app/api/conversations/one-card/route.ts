import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { readOneCard } from '@/lib/notify/one-card/read'

/**
 * GET /api/conversations/one-card — what the one-card screen draws (record 130).
 *
 * A read, and only a read: it asks the decisions list, so the number on
 * Ask Etyme and this screen are one count, and it adds what this seat
 * finished today, the agent word and each card's latest ledger line.
 * Every signed-in seat is answered from its own queue: a worker's own
 * work, a firm seat's decisions, and for a region seat, which reads a
 * rollup and not a list of cards, no cards at all (`own: 'NONE'`).
 * It reads nothing a region seat must not, so it narrows by reading none.
 * Yes and Not now never come here; Yes goes through the route its row
 * already has.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request, { narrowsToRegion: true })
  if (error) return error
  const got = await readOneCard(request, caller)
  if ('refusal' in got) return got.refusal as NextResponse
  return NextResponse.json({ data: got.read })
}
