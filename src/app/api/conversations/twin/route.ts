import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { reportError } from '@/lib/alerts'
import { respond, today, modelState, type Picture } from './ask'
import { modelSwitchFor } from '@/lib/model-boundary'
import { GET as programPicture } from '@/app/api/program/route'
import { GET as decisionQueue } from '@/app/api/decisions/route'
import { readersFor } from './read'
import { unreadNotices, markNoticesSeen } from './notices'

/**
 * GET  /api/conversations/twin                       the greeting
 * POST /api/conversations/twin   { text, companyId? }
 *
 * Ask Etyme, the twin's second door, in Conversations: one message in,
 * one answer out, for the signed-in seat. The greeting is the first
 * message of the chat — what needs this seat today, who else is asked,
 * and who is near the time limit — built from the ledger and the rules,
 * never the model. Rules first — what needs me, why, approve, reject,
 * invoice variance by supplier — answered from the ledger by plain code
 * (`respond` in ./ask); anything else goes to the model over the ledger
 * lines the seat may read, and only where a key is configured.
 *
 * This route writes one thing: the greeting's "Since you last looked"
 * marks the notices it said as read, the reader's own rows and only the
 * ones shown (./notices). It acts on nothing. An approve or a reject
 * comes back as a confirm card, and the chat sends the person's yes or
 * no to POST /api/twin/approvals/:id, the one door the web and Teams
 * share.
 *
 * `companyId` is the company whose twin is asked, the reader's own by
 * default; a supplier reads another company's twin only through the
 * ledger's own scope.
 */
/**
 * People on site today and the suppliers they come through, as the
 * program dashboard counts them: `/api/program`'s own answer, read for
 * this caller, never counted a second way here. Null for a seat that is
 * not at a client's program, or where the dashboard refuses it.
 */
async function pictureFor(request: NextRequest): Promise<Picture | null> {
  try {
    const res = await programPicture(request)
    if (!res.ok) return null
    const body = await res.json()
    const summary = body?.data?.summary
    if (typeof summary?.activeContractors !== 'number') return null
    const contractors: Array<{ state?: string; vendor?: { id?: string } | null }> = Array.isArray(body.data.contractors) ? body.data.contractors : []
    const suppliers = new Set(contractors.filter((c) => c.state === 'IN_PROGRESS' && c.vendor?.id).map((c) => c.vendor!.id))
    return { onSite: summary.activeContractors, suppliers: suppliers.size }
  } catch {
    return null
  }
}

/**
 * What needs this seat, as one number: GET /api/decisions' own `total`
 * for this caller, the figure the Ask Etyme mark carries as its badge, so
 * the headline and the badge cannot disagree. Null where the queue
 * refuses the seat or cannot be read; the headline then says what the
 * twin's own questions say.
 */
function needsFor(request: NextRequest): () => Promise<number | null> {
  return async () => {
    try {
      const res = await decisionQueue(request)
      if (!res.ok) return null
      // The same field the mark reads (`owedFrom` in lib/owed-count): one
      // answer, one figure.
      const total = (await res.json())?.data?.total
      return typeof total === 'number' && Number.isInteger(total) && total >= 0 ? total : null
    } catch {
      return null
    }
  }
}

const NO_COMPANY = 'Ask Etyme answers about a company’s program. Choose your company’s seat first.'
const NOT_ANSWERED = 'Etyme could not read the record just now, so there is no answer. Staff have been told; try again in a minute.'

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json({ error: { code: 'NO_COMPANY', message: NO_COMPANY } }, { status: 403 })
  }
  try {
    const notices = await unreadNotices(caller)
    // The boundary line reads the company's own switch, so it says what is
    // true for this company; it is the greeting's last line.
    const model = modelState((await modelSwitchFor(caller.company.id)).on, process.env)
    const answer = await today(readersFor(caller, caller.company.id), {
      greeting: true, picture: await pictureFor(request), needs: needsFor(request), notices, model,
    })
    // Said, so read: the section empties itself on the next greeting.
    await markNoticesSeen(caller, notices.shown.map((n) => n.id))
    return NextResponse.json({ data: { answer, model } })
  } catch (err) {
    await reportError('Ask Etyme could not greet', err, { path: '/api/conversations/twin', personId: caller.person.id, companyId: caller.company.id })
    return NextResponse.json({ error: { code: 'NOT_ANSWERED', message: NOT_ANSWERED } }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json({ error: { code: 'NO_COMPANY', message: NO_COMPANY } }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const text = typeof body.text === 'string' ? body.text.slice(0, 2000) : ''
  const companyId = typeof body.companyId === 'string' && body.companyId ? body.companyId : caller.company.id

  try {
    const answer = await respond(text, readersFor(caller, companyId), {
      env: process.env, companyKind: caller.company.kind, permissions: caller.permissions, needs: needsFor(request),
    })
    return NextResponse.json({ data: { answer } })
  } catch (err) {
    await reportError('Ask Etyme could not answer', err, { path: '/api/conversations/twin', personId: caller.person.id, companyId: caller.company.id })
    return NextResponse.json({ error: { code: 'NOT_ANSWERED', message: NOT_ANSWERED } }, { status: 500 })
  }
}
