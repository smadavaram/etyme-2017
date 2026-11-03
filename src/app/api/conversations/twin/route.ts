import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { reportError } from '@/lib/alerts'
import { respond, whereAnswer, menuOf, placeOf, today, modelState, boundarySays, cardIdsOf, partyOf, queueFrom, readAsk, withOwnPapers, withoutOwnWeek, questionsFor, pictureOf, readsPicture, monthOf, type Readers, type Picture, type Answer, type Party, type QueueRead, type RichLine } from './ask'
import { mapSeatOf, mapView, mapNeeds, mapOwed, mapChips, mapAnswer, mapHelp, siteLine, REGION_BOUNDARY, type MapSeat } from './regions'
import { fromPrismaDecimal } from '@/lib/money'
import { readThread, appendTurn, markCard, clearThread, type SavedThread, type SavedTurn, type CardState } from '@/lib/ask-etyme-thread'
import { prisma } from '@/lib/db'
import { modelSwitchFor, MODEL_SWITCH_HREF } from '@/lib/model-boundary'
import { programView } from '@/app/api/program/view'
import { programSummary } from '@/app/api/program/summary'
import { GET as decisionQueue } from '@/app/api/decisions/route'
import { readersFor } from './read'
import { unreadNotices, unreadThreads, markNoticesSeen } from './notices'
import { isWorkerSeat, workerToday, respondWorker, readWorkerAsk, latestWeekLine, paperCards, type WorkerFacts, type PaperAsk } from './worker'
import { seatFor, permissionsToJudgeBy, type LiveSeat } from '@/lib/program-seat'
import { workerFacts, workerPapers } from './worker-read'
import { owedTotal } from './owed'
import { firstActFor, welcomeFor, setupLineFor } from './first-act'
import { setupReminderFor } from '@/lib/setup-checklist-state'
import { hasPermission } from '@/lib/permissions'
import { firstActFacts } from './first-act-read'
import { linkAsksFor, joinAsksFor, firmAskItems, withFirmAsks } from './firm-asks'
import { mailLeaves } from '@/lib/notify/mail-leaves'
import { ownPageFor } from '@/lib/portfolio-data'
import { cookieHatOf, greetsAsYou, noticesForHat, youOffered, type HatFacts } from './hat'
import type { CompanyKind } from '@/lib/nav-table'

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
 *
 * A seat that reads the program by region (./regions, founder 2026-10-27):
 * a regional manager is greeted and answered from By region's own read
 * (`regionsView`), narrowed to its region, and nothing else is read for
 * it — not the decisions queue, not the readers, not the model — which is
 * why this route asks for the caller with `{ narrowsToRegion: true }`. The
 * head of operations and the CFO over a program in several regions are
 * greeted with the rollup's first line, and the mark carries its number;
 * a hiring manager on a plant keeps its own queue and is answered about
 * its plant from the same read.
 */
/**
 * The program page's own read, once per request (2026-11-01: the greeting
 * read it twice for a firm seated in a client's program, once for the
 * queue and once for the picture, and a client's went through
 * GET /api/program and back through JSON to read four figures). The
 * page's `programView`, for this caller, the same call GET /api/program
 * makes, for the program a seated firm's seat is in: its queue is the
 * page's own. Null for any other seat (a client reads the page's figures
 * alone, `programSummary`), and where it refuses.
 */
const programs = new WeakMap<object, Promise<ProgramRead | null>>()
type ProgramRead = NonNullable<Awaited<ReturnType<typeof programView>>['data']>
function programOf(caller: Caller): Promise<ProgramRead | null> {
  let got = programs.get(caller)
  if (!got) {
    got = (async () => {
      const seat = await seatOf(caller)
      if (!seat) return null
      const view = await programView(caller, seat.clientCompany.id, { trail: 'Ask Etyme' })
      return view.error || !view.data ? null : view.data
    })().catch(() => null)
    programs.set(caller, got)
  }
  return got
}

/**
 * People on site today and the suppliers they come through, as the
 * program dashboard counts them (`pictureOf` over the page's own read),
 * never counted a second way here. Read only for a greeting that says it
 * (`readsPicture`): a client's, and a seated firm's.
 */
async function pictureFor(caller: Caller, party: Party): Promise<Picture | null> {
  if (!readsPicture(party)) return null
  // A seated firm reads the page anyway, for its queue; a client reads the
  // page's four figures alone (demand's `programSummary`, 2026-11-02), which
  // works out no paperwork, names nobody and so logs nobody.
  if (await seatOf(caller)) return pictureOf(await programOf(caller))
  const summary = await programSummary(caller, null).catch(() => null)
  return summary?.data ? pictureOf(summary.data) : null
}

/**
 * Which map this caller reads (./regions), read once per request. A
 * region seat whose map cannot be read is answered by nothing else: the
 * caller is told, never handed an unnarrowed read.
 */
const maps = new WeakMap<object, Promise<MapSeat | null>>()
function mapOf(caller: Caller): Promise<MapSeat | null> {
  let got = maps.get(caller)
  if (!got) {
    got = mapSeatOf(caller).catch(() => null)
    maps.set(caller, got)
  }
  return got
}

/** A map seat greeted with the rollup's line rather than its own queue: a region, or the whole program. */
function readsTheRollup(map: MapSeat | null): boolean {
  return !!map && map.reach !== 'SITE'
}

/**
 * The seat this caller's firm holds in a client's program, read once per
 * request (the greeting, the mark and the party all ask). Null for a
 * client, a one-person firm, a worker, or a firm with no seat.
 */
const seats = new WeakMap<object, Promise<LiveSeat | null>>()
function seatOf(caller: Caller): Promise<LiveSeat | null> {
  let got = seats.get(caller)
  if (!got) {
    const kind = caller.company?.kind ?? null
    got = !asWorker(caller) && kind && kind !== 'CLIENT' && kind !== 'CONSULTANT_CORP'
      ? seatFor(caller, null).catch(() => null)
      : Promise.resolve(null)
    seats.set(caller, got)
  }
  return got
}

/**
 * Which hat this request is greeted in (./hat), read once per request.
 * The work is asked about (`ownPage`) only where it can change the
 * answer: a firm seat whose cookie names the You hat, or a firm greeting
 * that must leave the person's own notices for the You hat.
 */
const hats = new WeakMap<object, Promise<HatFacts>>()
const hatsWithWork = new WeakMap<object, Promise<HatFacts>>()
function hatFactsOf(caller: Caller, request: NextRequest, opts: { askWork?: boolean } = {}): Promise<HatFacts> {
  const memo = opts.askWork ? hatsWithWork : hats
  let got = memo.get(caller)
  if (!got) {
    got = (async (): Promise<HatFacts> => {
      const workerSeat = asWorker(caller)
      const region = caller.region?.label ?? null
      const cookieHat = cookieHatOf(request)
      const seat = await seatOf(caller)
      const menuKind = ((seat ? 'CLIENT' : caller.company?.kind) ?? null) as CompanyKind | null
      const ask = !workerSeat && !region && !!caller.company && (opts.askWork || cookieHat === 'you')
      const worker = ask ? (await ownPageFor(caller.person.id).catch(() => ({ ok: false }))).ok : false
      return { workerSeat, region, cookieHat, menuKind, worker, seatedAtClient: seat?.clientCompany.name ?? null, permissions: await judgedBy(caller) }
    })()
    memo.set(caller, got)
  }
  return got
}

/** Whether this request is answered as the person's own Ask Etyme: a worker's seat, or the You hat. */
async function asYou(caller: Caller, request: NextRequest): Promise<boolean> {
  if (caller.region) return false
  if (asWorker(caller)) return true
  if (cookieHatOf(request) !== 'you') return false
  return greetsAsYou(await hatFactsOf(caller, request))
}

/**
 * What needs this seat, as one number and its rows: the figure the Ask
 * Etyme mark carries as its badge, so the headline and the badge cannot
 * disagree. Null where the queue refuses the seat or cannot be read; the
 * headline then says what the twin's own questions say.
 *
 * Which queue is the program page's own answer (the founder's walk,
 * 2026-10-22): a firm seated in a client's program reads that program's
 * queue, `programQueue` (app/api/program/queue), the very rows the
 * program page draws under "needs you"; every other seat reads
 * GET /api/decisions for its own firm. An MSP's greeting read its own
 * firm's decisions while its page read the client's, and the two said
 * different things about one program.
 */
/**
 * A one-person firm's own facts as the worker, read once per request: her
 * week for the greeting's line, and the papers asked of her for the queue.
 * Null where they could not be read; nothing is said from a guess.
 */
const soloFacts = new WeakMap<object, Promise<WorkerFacts | null>>()
function ownFactsOf(caller: Caller, request: NextRequest): Promise<WorkerFacts | null> {
  let got = soloFacts.get(caller)
  if (!got) {
    got = caller.company?.kind === 'CONSULTANT_CORP' ? workerFacts(caller, request).catch(() => null) : Promise.resolve(null)
    soloFacts.set(caller, got)
  }
  return got
}

/**
 * The papers asked of a one-person firm's owner as the worker, read once
 * per request: off her facts where the greeting already reads them for her
 * week, and otherwise off her papers page alone (the mark, 2026-11-02: it
 * read all four of her pages to count her papers). Null for anybody else,
 * and where they could not be read.
 */
const soloPapers = new WeakMap<object, Promise<PaperAsk[] | null>>()
function ownPapersOf(caller: Caller, request: NextRequest): Promise<PaperAsk[] | null> {
  let got = soloPapers.get(caller)
  if (!got) {
    const facts = soloFacts.get(caller)
    got = caller.company?.kind !== 'CONSULTANT_CORP'
      ? Promise.resolve(null)
      : facts
        ? facts.then((f) => (f ? f.papers : null))
        : workerPapers(caller, request).catch(() => null)
    soloPapers.set(caller, got)
  }
  return got
}

function queueFor(request: NextRequest, caller: Caller): () => Promise<QueueRead | null> {
  let read: Promise<QueueRead | null> | null = null
  // Read once per request however often it is asked: the headline, the
  // names in it and the cards are one read of one queue.
  return () => (read ??= (async () => {
    try {
      const seat = await seatOf(caller)
      if (seat) {
        // `programQueue`'s rows, off the one read of the page this request
        // makes (`programOf`), so the picture is not a second read of it.
        const rows = (await programOf(caller))?.programQueue
        if (!rows) return null
        // The page's rows, read through the same door as the decisions
        // queue's, so a card and a name are drawn one way.
        return queueFrom({ data: { total: rows.length, decisions: rows } })
      }
      const res = await decisionQueue(request)
      if (!res.ok) return null
      // The same field the mark reads (`owedFrom` in lib/owed-count): one
      // answer, one figure — and the rows behind it, which the headline names.
      const queue = queueFrom(await res.json())
      // A one-person firm is the worker too: what is asked of her on paper
      // is in her one queue, so her greeting and her mark count it.
      // Nor is she asked to accept her own week: she is the firm (CLAUDE.md,
      // shipped 2026-10-21), whether or not her papers could be read.
      const solo = caller.company?.kind === 'CONSULTANT_CORP'
      const papers = solo ? await ownPapersOf(caller, request) : null
      const mine = solo ? withOwnPapers(withoutOwnWeek(queue, caller.person.name), paperCards(papers ?? [])) : queue
      // What another party waits on this firm for (./firm-asks): a firm
      // asking to link, and, where no letter can leave, somebody who asked
      // from the page to join the bench. Rows of the one queue, counted.
      if (!mine || !caller.company) return mine
      const [links, joins] = await Promise.all([
        linkAsksFor(caller).catch(() => []),
        joinAsksFor(caller, mailLeaves()).catch(() => []),
      ])
      return withFirmAsks(mine, firmAskItems(links, joins, caller.company.kind ?? ''))
    } catch {
      return null
    }
  })())
}

function needsFor(request: NextRequest, caller: Caller): () => Promise<number | null> {
  const queue = queueFor(request, caller)
  return async () => {
    // A region or a program read by region: the rollup's own number, so
    // the mark, the greeting and By region carry one figure.
    const map = await mapOf(caller)
    if (readsTheRollup(map)) {
      const data = await mapView(caller, { trail: 'Ask Etyme mark' })
      return data ? mapOwed(data, map!.reach, map!.line ?? null) : null
    }
    if (caller.region) return null
    // A hiring manager on a plant: By region's things for the plant, and
    // any other decision in his queue, so the mark, the greeting and his
    // By region page carry one number.
    if (map?.reach === 'SITE') {
      const data = await mapView(caller, { trail: 'Ask Etyme mark' })
      if (data) return siteLine(data, await queue()).total
    }
    return (await queue())?.total ?? null
  }
}

/**
 * Whose Ask Etyme this is, and for a seat in a client's program, whose
 * program: the closing line, the chips and the box are the party's own.
 */
async function partyFor(caller: Caller): Promise<{ party: Party; client: string | null }> {
  if (asWorker(caller)) return { party: 'WORKER', client: null }
  const kind = caller.company?.kind ?? null
  const seat = await seatOf(caller)
  const client = seat?.clientCompany?.name ?? null
  return { party: partyOf({ companyKind: kind, seatedAt: client }), client }
}

/** The permissions a seat's chips and acts are judged by: the seat's role in a client's program, else its own (lib/program-seat). */
async function judgedBy(caller: Caller): Promise<readonly string[]> {
  return permissionsToJudgeBy(caller, await seatOf(caller))
}

const NO_COMPANY = 'Ask Etyme answers about a company’s program. Switch to your company first.'

/** The reader's own role by name, as a refusal must never name it back to them: the seat's where seated. */
async function roleOf(caller: Caller): Promise<string | null> {
  const seat = await seatOf(caller)
  if (seat) return seat.role.name
  if (!caller.context.roleId) return null
  const role = await prisma.role.findUnique({ where: { id: caller.context.roleId }, select: { name: true } }).catch(() => null)
  return role?.name ?? null
}

/**
 * A one-person firm is paid when a customer pays her bill: the last
 * payment her firm received, from the payment rows themselves. Null where
 * none is on the record.
 */
async function firmPaidOf(caller: Caller) {
  if (!caller.company) return null
  const p = await prisma.payment.findFirst({
    where: { receivedByCompanyId: caller.company.id, invoiceId: { not: null } },
    orderBy: { receivedAt: 'desc' },
    select: { amount: true, currency: true, receivedAt: true, payerCompany: { select: { name: true } }, invoice: { select: { number: true } } },
  })
  if (!p) return null
  return {
    on: p.receivedAt.toISOString().slice(0, 10), amountMinor: fromPrismaDecimal(p.amount, p.currency).minor, currency: p.currency,
    from: p.payerCompany?.name ?? null, bill: p.invoice?.number ?? null,
  }
}

/** The reader's own pay, where they are a worker too and payroll paid them a week; null where Etyme keeps none. */
async function ownPayOf(caller: Caller, request: NextRequest, text: string): Promise<Answer | null> {
  const facts = await workerFacts(caller, request).catch(() => null)
  if (!facts || !facts.sent.some((w) => w.stage === 'PAID' && w.paidOn)) return null
  return respondWorker(text, { facts: async () => facts })
}

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
  const { caller, error } = await getCallerContext(request, { narrowsToRegion: true })
  if (error) return error
  // The mark's number: the greeting's own count, read with no notice
  // marked seen and no line kept, so polling it changes nothing.
  if (request.nextUrl.searchParams.get('only') === 'owed') return owedCount(caller, request)
  // The person's own hat (founder, 2026-11-03): their week, pay and papers.
  if (await asYou(caller, request)) return workerGreeting(caller, request)
  if (!caller.company) {
    return NextResponse.json({ error: { code: 'NO_COMPANY', message: NO_COMPANY } }, { status: 403 })
  }
  const take = takeOf(request)
  // "Show earlier": the thread alone, without building the greeting again.
  if (request.nextUrl.searchParams.get('only') === 'thread') {
    return NextResponse.json({ data: { thread: await threadFor(caller, take) } })
  }
  const map = await mapOf(caller)
  if (map && readsTheRollup(map)) return mapGreeting(caller, map, take)
  if (caller.region) return notReadByRegion(caller)
  try {
    // Every read starts at once (founder's walk, 2026-10-19: the AP clerk's
    // first screen sat on "Reading the record…"). The program's picture and
    // the decisions queue were read one after the other, and the saved
    // thread after both; each is its own read and none waits on another.
    // And the rules' own reads start here too (2026-11-01): they waited on
    // the notices, the switch and the first act before, one after another.
    const company = caller.company
    const thread = threadFor(caller, take)
    // A one-person firm is the firm and the worker: her own week is read
    // from her own pages beside the rest, and said in her greeting. Started
    // before the queue, which then takes her papers off the same read.
    const ownWeek = ownFactsOf(caller, request).then((f) => (f ? latestWeekLine(f) : null)).catch(() => null)
    const queue = queueFor(request, caller)
    void queue()
    const who = partyFor(caller)
    const picture = who.then((w) => pictureFor(caller, w.party)).catch(() => null)
    // The setup checklist's one line, read beside the rest.
    const setupLine = setupLineOf(caller)
    const seat = await seatOf(caller)
    const readers = startedReaders(readersFor(caller, company.id, request, { seat }), who)
    // A notice about the person's own work is said in the You hat, and left
    // unread here for it, where the person wears two hats (./hat).
    const firmNotices = Promise.all([
      unreadNotices(caller, { program: seat?.clientCompany.id ?? null }),
      hatFactsOf(caller, request, { askWork: true }).catch(() => null),
    ]).then(([n, f]) => (f ? { ...n, shown: noticesForHat(f, 'firm', n.shown) } : n))
    const [notices, threads, modelSwitch, party, week] = await Promise.all([
      firmNotices,
      unreadThreads(caller), modelSwitchFor(company.id), who, ownWeek,
    ])
    // The boundary line reads the company's own switch, so it says what is
    // true for this company; it is the greeting's last line.
    const model = modelState(modelSwitch.on, process.env)
    // A new party's one next act, read off its own rows, and only where the
    // greeting has nothing else to recommend; a read that fails says nothing rather than a guess.
    const firstAct = () => firstActFacts(company.id, company.kind, party.party).then(firstActFor).catch(() => null)
    const greeted = await today(readers, {
      greeting: true, picture, needs: queue, notices, threads, model, party: party.party, client: party.client, ownWeek: week,
      self: caller.person.name, firstAct, setup: await setupLine,
    })
    const answer = await withWelcome(caller, greeted, party.party, await thread)
    // Said, so read: the section empties itself on the next greeting. One write for both.
    await markNoticesSeen(caller, [...notices.shown.map((n) => n.id), ...threads.noticeIds])
    // The chips are the desk's own: only questions this seat gets an answer to.
    // A hiring manager on a plant asks about the time limit at the plant too.
    const own = questionsFor(party.party, await judgedBy(caller), company.kind)
    const chips = map?.reach === 'SITE' ? mapChips('SITE', own) : own
    return NextResponse.json({ data: { answer: await onThePlant(caller, map, answer, queue), model, party: party.party, client: party.client, chips, thread: await thread } })
  } catch (err) {
    await reportError('Ask Etyme could not greet', err, { path: '/api/conversations/twin', personId: caller.person.id, companyId: caller.company.id })
    return NextResponse.json({ error: { code: 'NOT_ANSWERED', message: NOT_ANSWERED } }, { status: 500 })
  }
}

/**
 * The greeting's rule reads, started the moment the request arrives rather
 * than once the notices, the switch and the first act were in, and each
 * read once however often `today` asks. The month's receipts are asked for
 * the month `today` itself reads (`monthOf`), and a firm's money only for
 * a firm, as `today` asks; any other call goes to the reader as before.
 */
function startedReaders(r: Readers, who: Promise<{ party: Party }>): Readers {
  const once = <T,>(f: () => Promise<T>): (() => Promise<T>) => {
    let p: Promise<T> | null = null
    return () => (p ??= f())
  }
  const month = monthOf(new Date())
  const spend = once(() => r.spendIn(month.from, month.to))
  const billing = r.billing ? once(() => r.billing!()) : undefined
  const out: Readers = {
    ...r,
    waiting: once(() => r.waiting()),
    othersWaiting: once(() => r.othersWaiting()),
    limits: once(() => r.limits()),
    told: once(() => r.told()),
    spendIn: (from, to) => (from.getTime() === month.from.getTime() && to.getTime() === month.to.getTime() ? spend() : r.spendIn(from, to)),
    ...(r.heldBills ? { heldBills: once(() => r.heldBills!()) } : {}),
    ...(billing ? { billing } : {}),
  }
  // Started now; a read that fails here fails again where `today` asks, and is answered there.
  for (const f of [out.waiting, out.othersWaiting, out.limits, out.told, spend, out.heldBills]) void f?.().catch(() => null)
  // A firm's own money, only for a firm, as `today` asks.
  void who.then((w) => (w.party === 'FIRM' && billing ? billing() : null)).catch(() => null)
  return out
}

/**
 * The setup checklist's one line, for the reader's own company, only where
 * the reader's own seat may run setup (`settings.manage`: the Owner or
 * Admin). A seat in another company's program reads that program for the
 * whole session, and an outside firm never holds the client's settings, so
 * it reads no setup line there. A one-person firm's Owner reads it like
 * any Owner: her firm is set up the same way. A read that fails says
 * nothing in the greeting, and staff are told, because a line that is
 * missing in silence is how the founder's own greeting at Tapin showed no
 * setup line with the checklist open (2026-11-02).
 */
async function setupLineOf(caller: Caller): Promise<RichLine | null> {
  if (!caller.company || asWorker(caller) || (await seatOf(caller))) return null
  const mayRun = hasPermission(caller.permissions, 'settings.manage')
  if (!mayRun) return null
  const companyId = caller.company.id
  return setupReminderFor(companyId, { mayRun }).then(setupLineFor).catch(async (err) => {
    await reportError('Ask Etyme could not read the setup checklist for the greeting', err, { path: '/api/conversations/twin', personId: caller.person.id, companyId })
    return null
  })
}

/**
 * A colleague who came in by an invitation, and has asked nothing yet, is
 * told where she is and what to do first (onboarding walk, 2026-10-27),
 * before the headline. A demo seat, or one that keeps
 * no thread, is never greeted as new: nothing says whether it asked.
 */
async function withWelcome(caller: Caller, answer: Answer, party: Party, thread: ThreadOut): Promise<Answer> {
  if (answer.kind !== 'NEEDS' || !caller.company || caller.company.isDemo || !thread.saved) return answer
  const ctx = await prisma.context.findUnique({ where: { id: caller.context.id }, select: { invitedAt: true } }).catch(() => null)
  if (!ctx?.invitedAt) return answer
  const waiting = Boolean(answer.recommend) || answer.items.length > 0 || (answer.queue?.length ?? 0) > 0 || (answer.held?.length ?? 0) > 0
  const w = welcomeFor({
    company: caller.company.name, role: await roleOf(caller), invitedAt: ctx.invitedAt,
    asked: thread.earlier || thread.turns.length > 0, waiting, now: new Date(),
    today: party === 'CLIENT' ? '/dashboard/program' : '/dashboard',
  })
  if (!w) return answer
  // The welcome leads, before the headline; "nothing waits" only where nothing does.
  return { ...answer, says: `${w.first} ${answer.says}`, more: w.today ? [w.today, ...(answer.more ?? [])] : answer.more }
}

/**
 * A hiring manager on a plant keeps his own cards, and his headline is
 * his plant's line on By region (`siteLine`): the start on hold said as
 * the start's own sentence, the weeks he signs, and any other decision in
 * his queue — one number with the mark. Where By region cannot be read,
 * the queue's own headline stands.
 */
async function onThePlant(caller: Caller, map: MapSeat | null, answer: Answer, queue: () => Promise<QueueRead | null>): Promise<Answer> {
  if (map?.reach !== 'SITE' || answer.kind !== 'NEEDS') return answer
  const data = await mapView(caller, { trail: 'Ask Etyme greeting' }).catch(() => null)
  if (!data) return answer
  const line = siteLine(data, await queue())
  const { saysLinks: _dropped, ...rest } = answer
  return { ...rest, says: `${line.says} Checked just now.` }
}

/**
 * The greeting of a seat that reads the program by region: By region's
 * own first line and its number, read through `regionsView` for this
 * caller. A region seat's boundary line says nothing it asks leaves to a
 * model, because nothing does.
 */
async function mapGreeting(caller: Caller, map: MapSeat, take: number | undefined) {
  try {
    const thread = threadFor(caller, take)
    const data = await mapView(caller, { trail: 'Ask Etyme greeting' })
    if (!data) return notReadByRegion(caller)
    const model = map.reach === 'REGION' ? 'OFF' : modelState((await modelSwitchFor(caller.company!.id)).on, process.env)
    const boundary = map.reach === 'REGION' ? REGION_BOUNDARY : boundarySays(model)
    return NextResponse.json({
      data: { answer: mapNeeds(data, map.reach, true, boundary, { line: map.line }), model, party: 'CLIENT', client: null, chips: mapChips(map.reach), thread: await thread },
    })
  } catch (err) {
    await reportError('Ask Etyme could not greet a seat by region', err, { path: '/api/conversations/twin', personId: caller.person.id, companyId: caller.company?.id })
    return NextResponse.json({ error: { code: 'NOT_ANSWERED', message: NOT_ANSWERED } }, { status: 500 })
  }
}

const NOT_READ_BY_REGION = 'Etyme could not read your region just now, so there is no answer. Open By region on Today, or try again in a minute.'

/** A region seat whose region could not be read: told so, and nothing unnarrowed is read in its place. */
function notReadByRegion(caller: Caller) {
  void reportError('Ask Etyme could not read a region seat’s region', new Error('regionsView refused or failed'), { path: '/api/conversations/twin', personId: caller.person.id, companyId: caller.company?.id })
  return NextResponse.json({ error: { code: 'NOT_ANSWERED', message: NOT_READ_BY_REGION } }, { status: 500 })
}

/**
 * `{ data: { total } }` for the Ask Etyme mark: a worker's cards, or a
 * firm seat's decisions total; null where it could not be read. Reads only.
 */
async function owedCount(caller: Caller, request: NextRequest) {
  // The mark follows the hat: the person's own cards in the You hat, the firm's queue in a firm hat.
  const worker = await asYou(caller, request)
  if (!worker && !caller.company) {
    return NextResponse.json({ error: { code: 'NO_COMPANY', message: NO_COMPANY } }, { status: 403 })
  }
  try {
    // Her facts in count-only mode: only what decides how many things need her.
    const total = await owedTotal({ worker, facts: () => workerFacts(caller, request, undefined, { forCount: true }), needs: needsFor(request, caller) })
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
    const saved = thread()
    // In the You hat a firm seat's notices about the firm's book, and the
    // threads other companies wrote to the firm, wait for the firm hat.
    const hat = await hatFactsOf(caller, request)
    const own = youOffered(hat)
    const [allNotices, allThreads, facts] = await Promise.all([unreadNotices(caller), unreadThreads(caller), workerFacts(caller, request)])
    const notices = own ? { ...allNotices, shown: noticesForHat(hat, 'you', allNotices.shown) } : allNotices
    const threads = own ? { shown: [], more: 0, noticeIds: [] } : allThreads
    const answer = workerToday(facts, { greeting: true, notices, threads })
    await Promise.all([
      markNoticesSeen(caller, notices.shown.map((n) => n.id)),
      markNoticesSeen(caller, threads.noticeIds),
    ])
    return NextResponse.json({ data: { answer, model: 'OFF', worker: true, party: 'WORKER', client: null, thread: await saved } })
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

/**
 * The page the last answer named, for "take me there": the seat's own
 * saved line first, else what the screen says it last showed. Either is
 * checked against the seat's own menu before it is opened (`whereAnswer`),
 * so nothing sent here opens a page the seat may not open.
 */
async function lastPlace(caller: Caller, said: unknown): Promise<string | null> {
  try {
    const got = await readThread(caller, { take: 4 })
    if (got.ok) {
      const last = [...got.thread.turns].reverse().find((t) => t.speaker === 'ETYME')
      if (last) return placeOf(last.answer)
    }
  } catch { /* the screen's own word stands in */ }
  return typeof said === 'string' && /^\/(?!\/)/.test(said) ? said.slice(0, 300) : null
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request, { narrowsToRegion: true })
  if (error) return error
  if (await asYou(caller, request)) {
    const body = await request.json().catch(() => ({}))
    const text = typeof body.text === 'string' ? body.text.slice(0, 2000) : ''
    let answer: Answer
    try {
      // Where a page is, and "take me there": her own menu, rules only.
      const where = readAsk(text)
      answer = where.kind === 'WHERE' || where.kind === 'GO'
        ? whereAnswer(where, menuOf({ party: 'WORKER', permissions: caller.permissions }), where.kind === 'GO' ? await lastPlace(caller, body.place) : null)
        : await respondWorker(text, { facts: () => workerFacts(caller, request) })
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
    // A seat that reads the program by region: its questions about the
    // map are answered from By region's read; a region seat's are all
    // answered there or told what it may ask, never sent further.
    const map = await mapOf(caller)
    if (caller.region && !map) return notReadByRegion(caller)
    const byRegion = map ? await mapAnswer(caller, map, text) : null
    if (byRegion || map?.reach === 'REGION') {
      answer = byRegion ?? mapHelp(map!)
      const kept = text.trim() ? await keep(caller, text.trim(), answer) : { kept: false, turnId: null, notKeptBecause: null }
      return NextResponse.json({ data: { answer, ...kept } })
    }
    const who = await partyFor(caller)
    // A one-person firm is the firm and the worker at once: her week, her
    // papers and her contract are answered from her own pages, as a
    // worker's are; what she billed and the rest, from the firm's book.
    // Setting up her firm is the firm's book too (2026-11-02).
    const asked = readAsk(text)
    const solo = who.party === 'SOLO' && !['UNPAID', 'SETUP', 'WHERE', 'GO'].includes(asked.kind) &&
      ['SIGNED', 'PAPERS', 'CONTRACT_END', 'OWED', 'CHAIN', 'MY_RATE', 'INTERVIEWS', 'FILE', 'SIGN_WEEK', 'LAST_PAID', 'JOBS'].includes(readWorkerAsk(text))
    const seat = await seatOf(caller)
    answer = solo
      ? await respondWorker(text, { facts: () => workerFacts(caller, request), firmPaid: () => firmPaidOf(caller) })
      : await respond(text, readersFor(caller, companyId, request, { seat }), {
        // Seated in a client's program, the book is the client's: its desks are the ones named.
        env: process.env, companyKind: seat ? seat.clientCompany.kind : caller.company.kind, permissions: await judgedBy(caller), needs: queueFor(request, caller), party: who.party,
        ownCompany: caller.company.name, client: seat?.clientCompany.name ?? null, ownKind: caller.company.kind,
        role: await roleOf(caller), ownPay: () => ownPayOf(caller, request, text),
        modelSwitchHref: MODEL_SWITCH_HREF,
        ...(asked.kind === 'WHERE' || asked.kind === 'GO' ? {
          menu: menuOf({ companyKind: caller.company.kind, party: who.party, permissions: await judgedBy(caller), client: seat?.clientCompany.name ?? null }),
          place: asked.kind === 'GO' ? await lastPlace(caller, body.place) : null,
        } : {}),
      })
    if (!solo) answer = await onThePlant(caller, map, answer, queueFor(request, caller))
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
  // Records a card's answer on the seat's own thread; reads nobody's work.
  const { caller, error } = await getCallerContext(request, { narrowsToRegion: true })
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
  // Clears the seat's own thread; reads nobody's work.
  const { caller, error } = await getCallerContext(request, { narrowsToRegion: true })
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
