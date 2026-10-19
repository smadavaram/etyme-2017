/**
 * A seat's one Ask Etyme conversation, saved — the only door to it.
 *
 * Decided by the founder, 2026-10-18 (CLAUDE.md, "One Ask Etyme
 * conversation per person, saved, and it never leaves the tenant or the
 * transaction"): each seat has one thread, kept on the record, so it
 * survives a reload, a phone switch and a sign-out; Clear starts over;
 * there is no list of old chats; a card already answered stays answered.
 *
 *   readThread(seat, { personId?, take? })   the seat's own thread, oldest line first
 *   appendTurn(seat, { speaker, text, ... }) one line said, by the person or by Ask Etyme
 *   markCard(seat, { turnId, approvalId, state, number? })
 *                                            what became of one card on one line
 *   clearThread(seat)                        Clear: start over, the old lines kept on the record
 *
 * ── Isolation at the query ───────────────────────────────────────────
 *
 * Every read and write here is keyed on the caller's own person and the
 * caller's own company, taken from the caller and never from the
 * request, so there is no argument that names somebody else's thread.
 * The one argument that names a person — `readThread`'s `personId`, for a
 * screen that asks by id — is refused unless it is the caller, and the
 * refusal is written to the access log before it is returned
 * (`recordRefusal`), like any other read of another person's data. The
 * same person seated at two companies has two threads, and each seat
 * reads only its own. Nothing here reads across tenants. A person with no
 * company seat — a candidate on a firm's bench — has one thread of their
 * own, keyed on the person alone (`threadKey`), and it carries no card a
 * company asked, because a question is always a company's.
 *
 * ── Who has no saved thread ──────────────────────────────────────────
 *
 * - a machine holding an API key: it is not a person;
 * - the shared sample the home page frames (`readOnly`): anybody at all
 *   sits in it, so a saved thread would show one stranger another's
 *   questions;
 * - a seeded demo seat at a reserved address: the demo door seats every
 *   visitor who asks for that desk as the same seeded person, so the same
 *   is true. Their thread lives on the screen, as before, and the answer
 *   says so in a sentence the screen can show (`NOT_KEPT_IN_DEMO`).
 *   A visitor's own sandbox, seated at their own address, is kept.
 *
 * ── What it is not ───────────────────────────────────────────────────
 *
 * It sends nothing anywhere. The thread holds the words as the person saw
 * them, unmasked, because it is the record and it stays where the record
 * is kept; text that leaves for a model still leaves only through
 * lib/model-boundary (off per company by default, masked, logged). It
 * decides nothing either: a card's yes or no still goes through the one
 * approval route, and `markCard` only records what the screen was told.
 * Where the approval's own decision on the record differs from what was
 * marked here (a card answered on Teams), the record wins on the way out.
 */

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { accessActor, recordRefusal, type AccessAction } from '@/lib/access-log'
import { reservedAddress } from '@/lib/demo-session'

// ── Shapes ────────────────────────────────────────────────────────────

/** The caller, as much of it as this door reads. Structural, so a test or a route hands over its CallerContext. */
export interface ThreadSeat {
  person: { id: string; primaryEmail: string }
  company: { id: string; name: string } | null
  context?: { id: string } | null
  isService?: boolean
  readOnly?: boolean
}

export type Speaker = 'PERSON' | 'ETYME'

/** What became of a card: answered yes or no, Not now (nothing sent), or closed by events. */
export type CardState = 'APPROVED' | 'REJECTED' | 'LATER' | 'OVERTAKEN'

export interface CardMark {
  state: CardState
  /** The number a sent bill was given, where the route said one. */
  number?: string
  /** When it was marked, ISO. */
  at: string
}

export interface SavedTurn {
  id: string
  speaker: Speaker
  /** The words as shown. */
  text: string
  /** Ask Etyme's answer as the route returned it; null on the person's own line. */
  answer: unknown | null
  /** The questions (TwinApproval ids) whose cards this line carries. */
  cardApprovalIds: string[]
  /** What became of each card, by approval id — the record's decision over the mark. */
  cards: Record<string, CardMark>
  /** The question this line answered, where it answered one. */
  approvalId: string | null
  createdAt: Date
}

export interface SavedThread {
  /** Null where nothing has been said yet, or where nothing is kept. */
  id: string | null
  /** False for a seat whose conversation is not kept; `notKeptBecause` says why. */
  saved: boolean
  notKeptBecause: string | null
  clearedAt: Date | null
  lastTurnAt: Date | null
  /** Oldest first, newest last — the order a chat is drawn in. */
  turns: SavedTurn[]
  /** True where older lines since the last Clear exist than were returned. */
  earlier: boolean
}

export interface NewTurn {
  speaker: Speaker
  text: string
  answer?: unknown
  cardApprovalIds?: readonly string[]
  approvalId?: string | null
}

export type ThreadRefusalCode =
  | 'NO_COMPANY' | 'NO_PERSON' | 'NOT_YOUR_THREAD' | 'NOT_IN_YOUR_THREAD' | 'NOT_A_CARD'
  | 'NO_SUCH_QUESTION' | 'EMPTY' | 'TOO_LONG' | 'BAD_STATE'

export interface ThreadRefusal {
  ok: false
  status: 400 | 403 | 404 | 413
  code: ThreadRefusalCode
  says: string
}

/** A write that was accepted and not kept, for a seat whose conversation lives on the screen. */
export interface NotKept { ok: true; saved: false; says: string }

// ── Words ─────────────────────────────────────────────────────────────

export const NO_COMPANY_SAYS = 'Ask Etyme keeps one conversation for each company you work at. Switch to your company first.'
export const NO_PERSON_SAYS = 'An API key has no Ask Etyme conversation. Only a person signed in at a company has one.'
export const NOT_KEPT_IN_DEMO =
  'This conversation is not kept after you leave the page, because other visitors use this demo seat too. Open your own demo to keep one.'
export const NOT_KEPT_IN_SAMPLE =
  'The sample keeps no conversation, because anybody can open it. Open your own demo to keep one.'
export const notYourThread = (company: string) =>
  `An Ask Etyme conversation is read only by the person it belongs to. Nobody else at ${company} can open it, and nobody at another company.`
export const NOT_IN_YOUR_THREAD = 'That line is not in your Ask Etyme conversation.'
export const NOT_A_CARD = 'That card is not on this line of your conversation.'
export const NO_SUCH_QUESTION = 'That question is not on the record, so this line cannot say it answered it.'
export const EMPTY_SAYS = 'A line in the conversation needs words.'
export const TOO_LONG_SAYS = 'That answer is too large to keep in the conversation.'
export const BAD_STATE_SAYS = 'A card is approved, rejected, kept for later or overtaken; nothing else.'

/**
 * The access-log action a refused read of somebody else's thread is filed
 * under. One line in AccessAction since 2026-10-19 (regulatory), so the
 * type checks the name and no cast is needed.
 */
export const THREAD_READ_ACTION = 'ASK_ETYME_THREAD_VIEW' satisfies AccessAction

/** How many lines a read returns by default, newest kept. */
export const SHOWN_TURNS = 200
/** The longest line kept, in characters. The route already caps a question at 2,000. */
export const MAX_TEXT = 8_000
/** The largest answer kept, as JSON, in bytes. */
export const MAX_ANSWER_BYTES = 256_000

const CARD_STATES: readonly CardState[] = ['APPROVED', 'REJECTED', 'LATER', 'OVERTAKEN']

// ── Pure rules ────────────────────────────────────────────────────────

/**
 * Whether this seat keeps a saved thread, and why not where it does not.
 * A refusal where the seat has no thread to keep at all.
 */
export function keptFor(seat: ThreadSeat): { kept: true } | { kept: false; says: string } | ThreadRefusal {
  if (seat.isService) return { ok: false, status: 403, code: 'NO_PERSON', says: NO_PERSON_SAYS }
  // A person with no company seat — a candidate on a firm's bench — keeps
  // a thread of their own (2026-10-19), keyed on the person alone.
  if (seat.readOnly) return { kept: false, says: NOT_KEPT_IN_SAMPLE }
  if (reservedAddress(seat.person.primaryEmail)) return { kept: false, says: NOT_KEPT_IN_DEMO }
  return { kept: true }
}

/**
 * What became of each card: the record's decision where it has one, the
 * mark where it does not. A mark of a yes or a no that the record does
 * not bear out is dropped, so the card reads open again rather than
 * claiming an answer nobody gave; Not now is the screen's own and stands.
 */
export function cardsAsRecorded(
  marks: Record<string, CardMark>,
  cardApprovalIds: readonly string[],
  decisions: ReadonlyMap<string, { decision: string; decidedAt: Date | null }>,
): Record<string, CardMark> {
  const out: Record<string, CardMark> = {}
  for (const id of cardApprovalIds) {
    const mark = marks[id]
    const rec = decisions.get(id)
    if (rec && rec.decision !== 'PENDING' && (CARD_STATES as readonly string[]).includes(rec.decision)) {
      const state = rec.decision as CardState
      out[id] = {
        state,
        ...(mark?.number && mark.state === state ? { number: mark.number } : {}),
        at: mark?.state === state ? mark.at : (rec.decidedAt ?? new Date(0)).toISOString(),
      }
      continue
    }
    if (rec && mark && mark.state !== 'LATER') continue
    if (mark) out[id] = mark
  }
  return out
}

/** The marks as stored: only well-formed entries survive a read. */
function marksOf(raw: Prisma.JsonValue | null): Record<string, CardMark> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, CardMark> = {}
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue
    const m = v as { state?: unknown; number?: unknown; at?: unknown }
    if (typeof m.state !== 'string' || !(CARD_STATES as readonly string[]).includes(m.state)) continue
    out[id] = {
      state: m.state as CardState,
      ...(typeof m.number === 'string' ? { number: m.number } : {}),
      at: typeof m.at === 'string' ? m.at : new Date(0).toISOString(),
    }
  }
  return out
}

/**
 * When a new line is stamped: now, but never at or before the last line
 * or the last Clear, so a line said in the same millisecond as Clear is
 * shown and lines keep the order they were said in.
 */
export function stampAfter(now: Date, lastTurnAt: Date | null, clearedAt: Date | null): Date {
  let t = now.getTime()
  for (const floor of [lastTurnAt, clearedAt]) if (floor && t <= floor.getTime()) t = floor.getTime() + 1
  return new Date(t)
}

// ── The door ──────────────────────────────────────────────────────────

type Row = {
  id: string
  speaker: Speaker
  text: string
  answer: Prisma.JsonValue | null
  cardApprovalIds: string[]
  cards: Prisma.JsonValue | null
  approvalId: string | null
  createdAt: Date
}

const TURN_SELECT = {
  id: true, speaker: true, text: true, answer: true, cardApprovalIds: true, cards: true, approvalId: true, createdAt: true,
} as const

/**
 * The record's decision on each question, read only at the seat's own
 * company. A thread with no company behind it carries no questions: a
 * question is a company's, so there is nothing to read.
 */
async function decisionsFor(companyId: string | null, ids: readonly string[]) {
  const unique = [...new Set(ids)]
  if (unique.length === 0 || !companyId) return new Map<string, { decision: string; decidedAt: Date | null }>()
  const rows = await prisma.twinApproval.findMany({
    where: { id: { in: unique }, companyId },
    select: { id: true, decision: true, decidedAt: true },
  })
  return new Map(rows.map((r) => [r.id, { decision: r.decision as string, decidedAt: r.decidedAt }]))
}

function toTurn(row: Row, decisions: ReadonlyMap<string, { decision: string; decidedAt: Date | null }>): SavedTurn {
  return {
    id: row.id,
    speaker: row.speaker,
    text: row.text,
    answer: row.answer ?? null,
    cardApprovalIds: row.cardApprovalIds,
    cards: cardsAsRecorded(marksOf(row.cards), row.cardApprovalIds, decisions),
    approvalId: row.approvalId,
    createdAt: row.createdAt,
  }
}

function emptyThread(notKeptBecause: string | null): SavedThread {
  return { id: null, saved: notKeptBecause === null, notKeptBecause, clearedAt: null, lastTurnAt: null, turns: [], earlier: false }
}

/**
 * Which thread is the seat's: at its company, or the person's own where
 * there is no company. Never from the request.
 */
export function threadKey(personId: string, companyId: string | null): Prisma.AskEtymeThreadWhereUniqueInput {
  return companyId ? { personId_companyId: { personId, companyId } } : { personOnlyId: personId }
}

/** The seat's thread row, made the first time a line is said. */
async function threadRowFor(personId: string, companyId: string | null) {
  const where = threadKey(personId, companyId)
  const select = { id: true, lastTurnAt: true, clearedAt: true } as const
  const create = companyId ? { personId, companyId } : { personId, companyId: null, personOnlyId: personId }
  try {
    return await prisma.askEtymeThread.upsert({ where, create, update: {}, select })
  } catch (err) {
    // Two first lines at once: the other one made it.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return prisma.askEtymeThread.findUniqueOrThrow({ where, select })
    }
    throw err
  }
}

/**
 * The seat's own thread since its last Clear, oldest line first.
 *
 * `personId`, where a screen passes one, must be the caller: anybody
 * else's is refused, and the refusal is in the access log before this
 * returns. The answer is the same whether or not that person exists or
 * has a thread, so a refusal tells the caller nothing about them.
 */
export async function readThread(
  seat: ThreadSeat,
  opts: { personId?: string | null; take?: number } = {},
): Promise<{ ok: true; thread: SavedThread } | ThreadRefusal> {
  const kept = keptFor(seat)
  if ('ok' in kept) return kept
  const company = seat.company
  const where_ = company ? ` at ${company.name}` : ''

  if (opts.personId && opts.personId !== seat.person.id) {
    const subject = await prisma.person.findUnique({ where: { id: opts.personId }, select: { id: true } })
    if (subject) {
      await recordRefusal([subject.id], {
        ...accessActor(seat),
        action: THREAD_READ_ACTION,
        allowed: false,
        reason: `Asked for another person’s Ask Etyme conversation${where_}; a conversation is read only by its own person.`,
      })
    }
    return { ok: false, status: 403, code: 'NOT_YOUR_THREAD', says: notYourThread(company?.name ?? 'their firm') }
  }

  if (!kept.kept) return { ok: true, thread: emptyThread(kept.says) }

  const thread = await prisma.askEtymeThread.findUnique({
    where: threadKey(seat.person.id, company?.id ?? null),
    select: { id: true, lastTurnAt: true, clearedAt: true },
  })
  if (!thread) return { ok: true, thread: emptyThread(null) }

  const take = Math.max(1, Math.min(opts.take ?? SHOWN_TURNS, 1_000))
  const rows = await prisma.askEtymeTurn.findMany({
    where: { threadId: thread.id, ...(thread.clearedAt ? { createdAt: { gt: thread.clearedAt } } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    select: TURN_SELECT,
  })
  const earlier = rows.length > take
  const shown = rows.slice(0, take).reverse() as Row[]
  const decisions = await decisionsFor(company?.id ?? null, shown.flatMap((r) => r.cardApprovalIds))
  return {
    ok: true,
    thread: {
      id: thread.id,
      saved: true,
      notKeptBecause: null,
      clearedAt: thread.clearedAt,
      lastTurnAt: thread.lastTurnAt,
      turns: shown.map((r) => toTurn(r, decisions)),
      earlier,
    },
  }
}

/**
 * One line said, kept on the seat's own thread — made the first time.
 * The person's question is `speaker: 'PERSON'` with no answer; Ask
 * Etyme's reply is `speaker: 'ETYME'` with the answer as the route
 * returned it, the approval ids of the cards it carries, and, after a
 * yes or a no, the question it answered.
 */
export async function appendTurn(
  seat: ThreadSeat,
  line: NewTurn,
): Promise<{ ok: true; saved: true; turn: SavedTurn } | NotKept | ThreadRefusal> {
  const kept = keptFor(seat)
  if ('ok' in kept) return kept
  if (line.speaker !== 'PERSON' && line.speaker !== 'ETYME') {
    return { ok: false, status: 400, code: 'BAD_STATE', says: 'A line is said by the person or by Ask Etyme.' }
  }
  const text = typeof line.text === 'string' ? line.text.trim() : ''
  if (!text) return { ok: false, status: 400, code: 'EMPTY', says: EMPTY_SAYS }
  if (text.length > MAX_TEXT) return { ok: false, status: 413, code: 'TOO_LONG', says: TOO_LONG_SAYS }
  const answer = line.answer === undefined || line.answer === null ? null : line.answer
  if (answer !== null && Buffer.byteLength(JSON.stringify(answer), 'utf8') > MAX_ANSWER_BYTES) {
    return { ok: false, status: 413, code: 'TOO_LONG', says: TOO_LONG_SAYS }
  }
  if (!kept.kept) return { ok: true, saved: false, says: kept.says }
  const company = seat.company

  const approvalId = line.approvalId ?? null
  if (approvalId) {
    const q = await prisma.twinApproval.findUnique({ where: { id: approvalId }, select: { id: true } })
    if (!q) return { ok: false, status: 404, code: 'NO_SUCH_QUESTION', says: NO_SUCH_QUESTION }
  }

  const thread = await threadRowFor(seat.person.id, company?.id ?? null)
  const at = stampAfter(new Date(), thread.lastTurnAt, thread.clearedAt)
  const row = await prisma.$transaction(async (tx) => {
    const made = await tx.askEtymeTurn.create({
      data: {
        threadId: thread.id,
        speaker: line.speaker,
        text,
        answer: answer === null ? Prisma.JsonNull : (answer as Prisma.InputJsonValue),
        cardApprovalIds: [...new Set(line.cardApprovalIds ?? [])],
        approvalId,
        createdAt: at,
      },
      select: TURN_SELECT,
    })
    await tx.askEtymeThread.update({ where: { id: thread.id }, data: { lastTurnAt: at } })
    return made as Row
  })
  return { ok: true, saved: true, turn: toTurn(row, await decisionsFor(company?.id ?? null, row.cardApprovalIds)) }
}

/**
 * What became of one card on one line of the seat's own thread, so it
 * is drawn answered on the next load. It records what the approval route
 * already said; it approves nothing.
 */
export async function markCard(
  seat: ThreadSeat,
  mark: { turnId: string; approvalId: string; state: CardState; number?: string | null },
): Promise<{ ok: true; saved: true; turn: SavedTurn } | NotKept | ThreadRefusal> {
  const kept = keptFor(seat)
  if ('ok' in kept) return kept
  if (!CARD_STATES.includes(mark.state)) return { ok: false, status: 400, code: 'BAD_STATE', says: BAD_STATE_SAYS }
  if (!kept.kept) return { ok: true, saved: false, says: kept.says }
  const company = seat.company

  const turn = await prisma.askEtymeTurn.findUnique({
    where: { id: mark.turnId },
    select: { ...TURN_SELECT, thread: { select: { personId: true, companyId: true } } },
  })
  if (!turn || turn.thread.personId !== seat.person.id || turn.thread.companyId !== (company?.id ?? null)) {
    // A line on somebody else's thread is their data: the attempt is logged
    // against them, and the answer is the same as for a line that does not exist.
    if (turn && turn.thread.personId !== seat.person.id) {
      await recordRefusal([turn.thread.personId], {
        ...accessActor(seat),
        action: THREAD_READ_ACTION,
        allowed: false,
        reason: 'Tried to mark a card on another person’s Ask Etyme conversation; a conversation is written only by its own person.',
      })
    }
    return { ok: false, status: 404, code: 'NOT_IN_YOUR_THREAD', says: NOT_IN_YOUR_THREAD }
  }
  if (!turn.cardApprovalIds.includes(mark.approvalId)) {
    return { ok: false, status: 400, code: 'NOT_A_CARD', says: NOT_A_CARD }
  }

  const marks = marksOf(turn.cards)
  marks[mark.approvalId] = {
    state: mark.state,
    ...(mark.number ? { number: String(mark.number) } : {}),
    at: new Date().toISOString(),
  }
  const row = await prisma.askEtymeTurn.update({
    where: { id: turn.id },
    data: { cards: marks as unknown as Prisma.InputJsonValue },
    select: TURN_SELECT,
  })
  return { ok: true, saved: true, turn: toTurn(row as Row, await decisionsFor(company?.id ?? null, row.cardApprovalIds)) }
}

/**
 * Clear: the seat starts over. The lines said so far stay on the record
 * and are no longer shown; nothing is deleted.
 */
export async function clearThread(seat: ThreadSeat): Promise<{ ok: true; saved: true; clearedAt: Date } | NotKept | ThreadRefusal> {
  const kept = keptFor(seat)
  if ('ok' in kept) return kept
  if (!kept.kept) return { ok: true, saved: false, says: kept.says }
  const company = seat.company
  const thread = await threadRowFor(seat.person.id, company?.id ?? null)
  // After the last line, so a line said in the same millisecond is cleared with the rest.
  const clearedAt = stampAfter(new Date(), thread.lastTurnAt, thread.clearedAt)
  await prisma.askEtymeThread.update({ where: { id: thread.id }, data: { clearedAt } })
  return { ok: true, saved: true, clearedAt }
}
