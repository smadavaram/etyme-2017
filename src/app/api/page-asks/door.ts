import { NextResponse } from 'next/server'
import { accessActor, recordRefusal } from '@/lib/access-log'
import type { CallerContext } from '@/lib/api-context'
import { PAGE_ASK_ACTION, mayAnswerPageAsks, NOT_YOURS_TO_READ } from '@/lib/page-asks'

/**
 * The one check both page-ask routes make after the caller check: the seat
 * has a firm and may answer its questions. A refusal's row is written, and
 * waited for, before the refusal is sent (CLAUDE.md, invariants, 2026-10-08).
 * `whose` is the firm the question belongs to where the caller asked for one
 * by id, so a seat at another firm leaves a row naming whose it tried to read.
 */
export async function refuseUnlessMayAnswer(
  caller: CallerContext,
  reason: string,
  whose?: string | null
): Promise<NextResponse | null> {
  const own = caller.company?.id ?? null
  if (own && mayAnswerPageAsks(caller.permissions) && (!whose || whose === own)) return null
  const subject = whose ?? own
  if (subject) {
    await recordRefusal([{ companyId: subject }], { ...accessActor(caller), action: PAGE_ASK_ACTION, reason: `Refused: ${reason}` })
  }
  // A question that is another firm's is said to be nowhere on this one.
  const message = own && mayAnswerPageAsks(caller.permissions) ? 'That question is not on your firm’s page.' : NOT_YOURS_TO_READ
  return NextResponse.json(
    { error: { code: own && mayAnswerPageAsks(caller.permissions) ? 'NOT_FOUND' : 'FORBIDDEN', message } },
    { status: own && mayAnswerPageAsks(caller.permissions) ? 404 : 403 }
  )
}
