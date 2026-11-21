import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { accessActor, recordAccess } from '@/lib/access-log'
import { reportError } from '@/lib/alerts'
import {
  PAGE_ASK_ACTION, assignPageAsk, closePageAsk, firmOfPageAsk, markPageAskAnswered, readPageAsk,
} from '@/lib/page-asks'
import { refuseUnlessMayAnswer } from '../door'

/**
 * GET  /api/page-asks/:id           one question of the caller's firm
 * POST /api/page-asks/:id  { act: 'assign' | 'answered' | 'close', assigneePersonId? }
 *
 * The one route the decision card's acts go through (Assign to me,
 * Answered) and the list's (Close, and giving one to somebody else). A
 * question at another firm reads as nowhere on this one, and the attempt is
 * a refusal row naming that firm, written before the answer goes out.
 */
type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const refused = await refuseUnlessMayAnswer(caller, `read question ${id} without the role, or at a firm it is not.`, await firmOfPageAsk(id))
  if (refused) return refused
  try {
    const ask = await readPageAsk(id, caller.company!.id)
    if (!ask) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That question is not on your firm’s page.' } }, { status: 404 })
    await recordAccess([{ companyId: caller.company!.id }], { ...accessActor(caller), action: PAGE_ASK_ACTION, reason: `Read question ${id} asked on the firm’s own public page.` })
    return NextResponse.json({ data: { ask } })
  } catch (err) {
    reportError('A question asked on a firm’s page could not be read:', err)
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'That question could not be read. Try again in a minute.' } }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const body = (await request.json().catch(() => ({}))) as { act?: unknown; assigneePersonId?: unknown }
  const refused = await refuseUnlessMayAnswer(caller, `act on question ${id} without the role, or at a firm it is not.`, await firmOfPageAsk(id))
  if (refused) return refused

  const companyId = caller.company!.id
  const me = caller.person.id
  try {
    const result =
      body.act === 'assign'
        ? await assignPageAsk(id, companyId, me, typeof body.assigneePersonId === 'string' && body.assigneePersonId ? body.assigneePersonId : null)
        : body.act === 'answered'
          ? await markPageAskAnswered(id, companyId, me)
          : body.act === 'close'
            ? await closePageAsk(id, companyId, me)
            : null
    if (!result) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say what to do with the question: assign it, mark it answered or close it.' } }, { status: 422 })
    }
    if (!result.ok) return NextResponse.json({ error: { code: result.status === 404 ? 'NOT_FOUND' : 'CONFLICT', message: result.says } }, { status: result.status })
    return NextResponse.json({ data: { ask: result.ask, message: result.says } })
  } catch (err) {
    reportError('An act on a question asked on a firm’s page failed:', err)
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'That did not save. Try again in a minute.' } }, { status: 500 })
  }
}
