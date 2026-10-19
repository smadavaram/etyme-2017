import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { reportError } from '@/lib/alerts'
import { respond, today, modelState, cardIdsOf, type Picture, type Answer } from './ask'
import { readThread, appendTurn, markCard, clearThread, type SavedThread, type SavedTurn, type CardState } from '@/lib/ask-etyme-thread'
import { prisma } from '@/lib/db'
import { modelSwitchFor } from '@/lib/model-boundary'
import { GET as programPicture } from '@/app/api/program/route'
import { GET as decisionQueue } from '@/app/api/decisions/route'
import { readersFor } from './read'
import { unreadNotices, markNoticesSeen } from './notices'
import { isWorkerSeat, workerToday, respondWorker } from './worker'
import { workerFacts } from './worker-read'
import { owedTotal } from './owed'

/**
 * GET    /api/conversations/twin[?take=n][&only=thread]   the greeting, and the seat's saved thread
 * GET    /api/conversations/twin?only=owed       { data: { total } } the mark's number, nothing marked seen (./owed)
 * POST   /api/conversations/twin   { text, companyId? }  one question, one answer, both kept
 * PATCH  /api/conversations/twin   { approvalId, state, turnId?, number?, said? }
 *                                                        what became of a card, and the reply after a yes or a no
 * DELETE /api/conversations/twin                         Clear: start over from the greeting
 *
 * Ask Etyme, the twin's second door, in Conversations: one message in,
 * one answer out, for the signed-in seat. The greeting is the first
 * message of the chat — what needs this seat today, who else is asked,
 * and who is near the time limit — built from the ledger and the rules,
 * never the model. Rules first — what needs me, why, approve, reject,
 * invoice variance by supplier — answered from the ledger by plain code
 * (`respond` in ./ask); a question with no record behind it is refused
 * by rule; anything else goes to the model over the ledger lines the
 * seat may read, only where the company turned it on and a key is set.
 *
 * One conversation per seat, kept (CLAUDE.md, "One Ask Etyme conversation
 * per person, saved"). Every question and its answer are kept on the
 * seat's own thread through lib/ask-etyme-thread, the only door to it,
 * keyed on the caller and never on the request. **The greeting is not
 * kept.** It is "what needs you now", rebuilt from the ledger on every
 * load, so a stored greeting would be yesterday's queue with yesterday's
 * cards, and the badge and the first line could disagree; the saved
 * lines sit above it, and the greeting is always the newest message. A
 * seat that keeps no thread — a seeded demo seat every visitor shares,
 * the shared sample, a machine's key — reads `saved: false` and the
 * sentence that says why, and the chat still works on the screen.
 *
 * Beyond the thread this route writes one thing: the greeting's "Since
 * you last looked" marks the notices it said as read, the reader's own
 * rows and only the ones shown (./notices). It acts on nothing. An
 * approve or a reject comes back as a confirm card, and the chat sends
 * the person's yes or no to POST /api/twin/approvals/:id, the one door
 * the web and Teams share; PATCH here only records on the seat's own
 * line what that route already said, and a yes or a no it records must
 * be the record's own decision.
 *
 * `companyId` is the company whose twin is asked, the reader's own by
 * default; a supplier reads another company's twin only through the
 * ledger's own scope. The thread is always the seat's own, at the seat's
 * own company.
 *
 * A worker's seat (./worker, `isWorkerSeat`) — somebody on a firm's
 * bench, or a firm's own employee whose seat reads only their own work —
 * is greeted and answered about her own work, from her own doors
 * (./worker-read), by rules only: no model, no twin act, no firm's queue.
 * Her thread is kept exactly as any seat's. A candidate with no company
 * seat at all keeps one thread of her own, keyed on her alone by the door
 * (`threadKey` in lib/ask-etyme-thread), and Clear clears it.
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

const NO_COMPANY = 'Ask Etyme answers about a company’s program. Switch to your company first.'

/** Whether this caller reads Ask Etyme as a worker. */
function asWorker(caller: Caller): boolean {
  return isWorkerSeat({ contextType: caller.context.type, permissions: caller.permissions, isService: caller.isService, readOnly: caller.readOnly })
}
const NOT_ANSWERED = 'Etyme could not read the record just now, so there is no answer. Staff have been told; try again in a minute.'

/** The thread as the screen reads it: dates as text, nothing the screen does not draw. */
interface ThreadOut {
  saved: boolean
  notKeptBecause: string | null
  earlier: boolean
  turns: Array<Pick<SavedTurn, 'id' | 'speaker' | 'text' | 'answer' | 'cards' | 'cardApprovalIds' | 'approvalId'> & { at: string }>
}

const NOT_READ_BACK = 'Your earlier lines could not be read just now, so only today’s greeting is shown. Staff have been told.'
const NOT_KEPT_THIS_TIME = 'This answer was not kept, so it will not be here after a reload. Staff have been told.'

function threadOut(t: SavedThread): ThreadOut {
  return {
    saved: t.saved,
    notKeptBecause: t.notKeptBecause,
    earlier: t.earlier,
    turns: t.turns.map((x) => ({
      id: x.id, speaker: x.speaker, text: x.text, answer: x.answer, cards: x.cards,
      cardApprovalIds: x.cardApprovalIds, approvalId: x.approvalId, at: x.createdAt.toISOString(),
    })),
  }
}

type Caller = NonNullable<Awaited<ReturnType<typeof getCallerContext>>['caller']>

/** The seat's own thread, or the sentence that says why there is none. Never throws. */
async function threadFor(caller: Caller, take: number | undefined): Promise<ThreadOut> {
  try {
    const got = await readThread(caller, { take })
    if (!got.ok) return { saved: false, notKeptBecause: got.says, earlier: false, turns: [] }
    return threadOut(got.thread)
  } catch (err) {
    await reportError('Ask Etyme could not read a saved conversation', err, { path: '/api/conversations/twin', personId: caller.person.id, companyId: caller.company?.id })
    return { saved: false, notKeptBecause: NOT_READ_BACK, earlier: false, turns: [] }
  }
}

function takeOf(request: NextRequest): number | undefined {
  const raw = request.nextUrl.searchParams.get('take')
  const n = raw ? Number.parseInt(raw, 10) : NaN
  return Number.isInteger(n) && n > 0 ? Math.min(n, 1_000) : undefined
}

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  // The mark's number: the greeting's own count, read with no notice
  // marked seen and no line kept, so polling it changes nothing.
  if (request.nextUrl.searchParams.get('only') === 'owed') return owedCount(caller, request)
  if (asWorker(caller)) return workerGreeting(caller, request)
  if (!caller.company) {
    return NextResponse.json({ error: { code: 'NO_COMPANY', message: NO_COMPANY } }, { status: 403 })
  }
  const take = takeOf(request)
  // "Show earlier": the thread alone, without building the greeting again.
  if (request.nextUrl.searchParams.get('only') === 'thread') {
    return NextResponse.json({ data: { thread: await threadFor(caller, take) } })
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
    return NextResponse.json({ data: { answer, model, thread: await threadFor(caller, take) } })
  } catch (err) {
    await reportError('Ask Etyme could not greet', err, { path: '/api/conversations/twin', personId: caller.person.id, companyId: caller.company.id })
    return NextResponse.json({ error: { code: 'NOT_ANSWERED', message: NOT_ANSWERED } }, { status: 500 })
  }
}

/**
 * `{ data: { total } }` for the Ask Etyme mark: a worker's cards, or a
 * firm seat's decisions total; null where it could not be read. Reads only.
 */
async function owedCount(caller: Caller, request: NextRequest) {
  const worker = asWorker(caller)
  if (!worker && !caller.company) {
    return NextResponse.json({ error: { code: 'NO_COMPANY', message: NO_COMPANY } }, { status: 403 })
  }
  try {
    const total = await owedTotal({ worker, facts: () => workerFacts(caller, request), needs: needsFor(request) })
    return NextResponse.json({ data: { total } })
  } catch (err) {
    await reportError('Ask Etyme could not count what a seat owes', err, { path: '/api/conversations/twin', personId: caller.person.id, companyId: caller.company?.id })
    return NextResponse.json({ error: { code: 'NOT_ANSWERED', message: NOT_ANSWERED } }, { status: 500 })
  }
}

/** The worker's greeting and her saved thread. Rules only; the one write is her own notices marked read. */
async function workerGreeting(caller: Caller, request: NextRequest) {
  const take = takeOf(request)
  const thread = () => threadFor(caller, take)
  if (request.nextUrl.searchParams.get('only') === 'thread') {
    return NextResponse.json({ data: { thread: await thread() } })
  }
  try {
    const notices = await unreadNotices(caller)
    const answer = workerToday(await workerFacts(caller, request), { greeting: true, notices })
    await markNoticesSeen(caller, notices.shown.map((n) => n.id))
    return NextResponse.json({ data: { answer, model: 'OFF', worker: true, thread: await thread() } })
  } catch (err) {
    await reportError('Ask Etyme could not greet a worker', err, { path: '/api/conversations/twin', personId: caller.person.id, companyId: caller.company?.id })
    return NextResponse.json({ error: { code: 'NOT_ANSWERED', message: NOT_ANSWERED } }, { status: 500 })
  }
}

/**
 * Keep the question and its answer on the seat's own thread, in that
 * order. A seat that keeps none is told why; a write that failed leaves
 * the answer standing and says it was not kept.
 */
async function keep(caller: Caller, question: string, answer: Answer): Promise<{ kept: boolean; turnId: string | null; notKeptBecause: string | null }> {
  try {
    const asked = await appendTurn(caller, { speaker: 'PERSON', text: question })
    if (!asked.ok) return { kept: false, turnId: null, notKeptBecause: asked.says }
    if (!asked.saved) return { kept: false, turnId: null, notKeptBecause: asked.says }
    const said = await appendTurn(caller, { speaker: 'ETYME', text: answer.says || 'Ask Etyme answered.', answer, cardApprovalIds: cardIdsOf(answer) })
    if (!said.ok) return { kept: false, turnId: null, notKeptBecause: said.says }
    if (!said.saved) return { kept: false, turnId: null, notKeptBecause: said.says }
    return { kept: true, turnId: said.turn.id, notKeptBecause: null }
  } catch (err) {
    await reportError('Ask Etyme could not keep a line of the conversation', err, { path: '/api/conversations/twin', personId: caller.person.id, companyId: caller.company?.id })
    return { kept: false, turnId: null, notKeptBecause: NOT_KEPT_THIS_TIME }
  }
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (asWorker(caller)) {
    const body = await request.json().catch(() => ({}))
    const text = typeof body.text === 'string' ? body.text.slice(0, 2000) : ''
    let answer: Answer
    try {
      answer = await respondWorker(text, { facts: () => workerFacts(caller, request) })
    } catch (err) {
      await reportError('Ask Etyme could not answer a worker', err, { path: '/api/conversations/twin', personId: caller.person.id, companyId: caller.company?.id })
      return NextResponse.json({ error: { code: 'NOT_ANSWERED', message: NOT_ANSWERED } }, { status: 500 })
    }
    const kept = !text.trim()
      ? { kept: false, turnId: null, notKeptBecause: null }
      : await keep(caller, text.trim(), answer)
    return NextResponse.json({ data: { answer, ...kept } })
  }
  if (!caller.company) {
    return NextResponse.json({ error: { code: 'NO_COMPANY', message: NO_COMPANY } }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const text = typeof body.text === 'string' ? body.text.slice(0, 2000) : ''
  const companyId = typeof body.companyId === 'string' && body.companyId ? body.companyId : caller.company.id

  let answer: Answer
  try {
    answer = await respond(text, readersFor(caller, companyId), {
      env: process.env, companyKind: caller.company.kind, permissions: caller.permissions, needs: needsFor(request),
    })
  } catch (err) {
    await reportError('Ask Etyme could not answer', err, { path: '/api/conversations/twin', personId: caller.person.id, companyId: caller.company.id })
    return NextResponse.json({ error: { code: 'NOT_ANSWERED', message: NOT_ANSWERED } }, { status: 500 })
  }
  // An empty box is answered ("help") and not kept: nobody said anything.
  const kept = text.trim()
    ? await keep(caller, text.trim(), answer)
    : { kept: false, turnId: null, notKeptBecause: null }
  return NextResponse.json({ data: { answer, ...kept } })
}

const CARD_STATES: readonly CardState[] = ['APPROVED', 'REJECTED', 'LATER', 'OVERTAKEN']
const BAD_MARK = 'Say which card and what became of it: approved, rejected or not now.'
const NOT_DECIDED_SO = 'The record does not show that answer on this question, so it is not kept in your conversation.'

/** The reply after a yes or a no, as the screen drew it: a sentence and links inside Etyme, nothing else kept. */
function replyOf(raw: unknown): Answer | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { kind?: unknown; says?: unknown; links?: unknown }
  if (r.kind !== 'TEXT' || typeof r.says !== 'string' || !r.says.trim()) return null
  const links = Array.isArray(r.links)
    ? r.links
      .filter((l): l is { label: string; href: string } =>
        !!l && typeof l === 'object' && typeof (l as { label?: unknown }).label === 'string' &&
        typeof (l as { href?: unknown }).href === 'string' && /^\/(?!\/)/.test((l as { href: string }).href))
      .slice(0, 6)
      .map((l) => ({ label: l.label.slice(0, 120), href: l.href.slice(0, 300) }))
    : []
  return { kind: 'TEXT', says: r.says.trim().slice(0, 2000), links }
}

export async function PATCH(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json({ error: { code: 'NO_COMPANY', message: NO_COMPANY } }, { status: 403 })
  }
  const body = await request.json().catch(() => ({}))
  const approvalId = typeof body.approvalId === 'string' ? body.approvalId : ''
  const state = body.state as CardState
  const turnId = typeof body.turnId === 'string' && body.turnId ? body.turnId : null
  const number = typeof body.number === 'string' ? body.number : null
  if (!approvalId || !CARD_STATES.includes(state)) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: BAD_MARK } }, { status: 422 })
  }

  try {
    let notKeptBecause: string | null = null
    // The card on the line that drew it. A card in the greeting is on no
    // line: the greeting is not kept, and the record's decision is what
    // the next greeting reads.
    if (turnId) {
      const marked = await markCard(caller, { turnId, approvalId, state, number })
      if (!marked.ok) return NextResponse.json({ error: { code: marked.code, message: marked.says } }, { status: marked.status })
      if (!marked.saved) notKeptBecause = marked.says
    }
    // The reply after a yes or a no, kept as Ask Etyme's line, only where
    // the record already bears that answer out: this route records what
    // the approval route did, and never says it did something it did not.
    const said = replyOf(body.said)
    let reply: string | null = null
    if (said && (state === 'APPROVED' || state === 'REJECTED')) {
      const onRecord = await prisma.twinApproval.findUnique({ where: { id: approvalId }, select: { decision: true } })
      if (onRecord?.decision !== state) {
        return NextResponse.json({ error: { code: 'CONFLICT', message: NOT_DECIDED_SO } }, { status: 409 })
      }
      const kept = await appendTurn(caller, { speaker: 'ETYME', text: said.says, answer: said, approvalId })
      if (!kept.ok) return NextResponse.json({ error: { code: kept.code, message: kept.says } }, { status: kept.status })
      if (kept.saved) reply = kept.turn.id
      else notKeptBecause = kept.says
    }
    return NextResponse.json({ data: { kept: notKeptBecause === null, notKeptBecause, replyTurnId: reply } })
  } catch (err) {
    await reportError('Ask Etyme could not keep a card’s answer', err, { path: '/api/conversations/twin', personId: caller.person.id, companyId: caller.company.id })
    return NextResponse.json({ error: { code: 'NOT_KEPT', message: NOT_KEPT_THIS_TIME } }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  // A candidate with no company seat clears her own thread, keyed on her alone.
  if (!caller.company && !asWorker(caller)) {
    return NextResponse.json({ error: { code: 'NO_COMPANY', message: NO_COMPANY } }, { status: 403 })
  }
  try {
    const cleared = await clearThread(caller)
    if (!cleared.ok) return NextResponse.json({ error: { code: cleared.code, message: cleared.says } }, { status: cleared.status })
    return NextResponse.json({
      data: cleared.saved
        ? { saved: true, clearedAt: cleared.clearedAt.toISOString(), notKeptBecause: null }
        : { saved: false, clearedAt: null, notKeptBecause: cleared.says },
    })
  } catch (err) {
    await reportError('Ask Etyme could not clear a conversation', err, { path: '/api/conversations/twin', personId: caller.person.id, companyId: caller.company?.id })
    return NextResponse.json({ error: { code: 'NOT_CLEARED', message: 'Your conversation was not cleared, so nothing changed. Staff have been told; try again in a minute.' } }, { status: 500 })
  }
}
