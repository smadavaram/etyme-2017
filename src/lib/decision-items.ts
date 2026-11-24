/**
 * Decision items a person opens (2026-11-21 → 105, 107).
 *
 * A decision the firm owes, in a sentence, with the seat that owes it,
 * the legal entity it is for, the day a person says it opened, and the
 * proof (text, and links to the records it points at). Its true age
 * counts from that day in whole days. A decision made by phone stays
 * open until somebody records it here.
 *
 * Three acts: approve (closes it, an optional note), reject (closes it,
 * a reason) and send back (keeps it open and its age counting, a
 * reason). Opening and each act write a row on the record ledger with
 * the actor's own three stamps; `recordTimeline` in lib/record-ledger
 * reads the item's whole history.
 *
 * Only the owner, or the firm's Owner or Admin, acts on it, and only from
 * a working seat at the firm (`seatAtFirm`): never a bench (CONSULTANT)
 * seat, a revoked or paused one, or one ended by its date as `seatByDate`
 * reads it. An invited seat that never signed in may be named owner and
 * cannot decide until she signs in.
 *
 * "Today" is the firm's own day: its primary site's time zone where one is
 * set (Setup → Your company's Time zone box is the primary site's), else
 * UTC (`firmToday`). The refusal of a future day and the age read it.
 */

import type { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/db'
import { writeRecordAction, stampRefusal, LedgerRefusal, aboutPayroll, PAYROLL_LEDGER_READS } from '@/lib/record-ledger'
import { hasPermission, type Permission } from '@/lib/permissions'
import { OWNER_ROLE, ADMIN_ROLE } from '@/lib/owner-rules'
import { seatByDate, type DatedSeat } from '@/lib/account-lifecycle'
import { seatHasSignedIn } from '@/lib/access-grant'
import { signedInHere } from '@/lib/access-log'
import { dayFor } from '@/lib/when'

type Db = Prisma.TransactionClient | PrismaClient

export const DECISION_RECORD = 'DecisionItem'
const DAY = 86_400_000

export type Verdict = 'APPROVE' | 'REJECT' | 'SEND_BACK'
export interface ProofLink { recordType: string; recordId: string }

/** A date as its UTC calendar day, in whole days since the epoch. Pure. */
function dayNumber(d: Date): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / DAY)
}

/** Whole days from the day it opened to today. Pure. */
export function ageInDays(openedOn: Date, today: Date = new Date()): number {
  return Math.max(0, dayNumber(today) - dayNumber(openedOn))
}

/**
 * The calendar day a moment falls on in a time zone, as that day's UTC
 * midnight, so `dayNumber` reads it as the zone's own day. No zone is
 * UTC. Pure.
 */
export function todayIn(zone: string | null | undefined, now: Date = new Date()): Date {
  return new Date(`${dayFor(now, zone)}T00:00:00Z`)
}

/** The firm's own time zone: its primary site's, else null (read as UTC). */
export async function firmZone(companyId: string, db: Db = prisma): Promise<string | null> {
  const site = await db.companyLocation.findFirst({ where: { companyId, isPrimary: true, timeZone: { not: null } }, select: { timeZone: true } })
  return site?.timeZone ?? null
}

/** Today, as the firm's own calendar day (`todayIn` over `firmZone`). */
export async function firmToday(companyId: string, now: Date = new Date(), db: Db = prisma): Promise<Date> {
  return todayIn(await firmZone(companyId, db), now)
}

/**
 * A decision's age: whole days from the day it opened to today while it
 * is open, and to the day it was decided once it is closed, so a closed
 * item stops aging. Both days are the firm's. Pure.
 */
export function ageOf(item: { openedOn: Date; decidedAt: Date | null }, today: Date, zone: string | null | undefined): number {
  return ageInDays(item.openedOn, item.decidedAt ? todayIn(zone, item.decidedAt) : today)
}

// ── Who holds a working seat at the firm ────────────────────────────

/** A seat at the firm, as the working-seat rule reads it. */
export interface FirmSeat extends DatedSeat {
  personId: string
  type: string
  roleName: string | null
}

/**
 * What a seat may do with the firm's decisions: DECIDES (it may own one,
 * and decide), MAY_OWE (invited and never signed in: it may be named
 * owner and cannot decide yet), or null (not a working seat: a bench
 * seat, revoked, paused, or ended by its date). Pure.
 */
export function seatAtFirm(seat: FirmSeat, atCompany: readonly FirmSeat[], now: Date = new Date()): 'DECIDES' | 'MAY_OWE' | null {
  if (seat.type === 'CONSULTANT') return null
  if (seat.revokedAt || seat.suspendedAt) return null
  if (!seatByDate(seat, atCompany, now).open) return null
  return seat.hasSignedIn ? 'DECIDES' : 'MAY_OWE'
}

/** Every unrevoked seat at the firm, read for `seatAtFirm`. */
export async function firmSeats(companyId: string, db: Db = prisma): Promise<FirmSeat[]> {
  const rows = await db.context.findMany({
    where: { companyId, revokedAt: null },
    select: {
      id: true, personId: true, type: true, companyId: true, expiresAt: true, revokedAt: true, suspendedAt: true,
      invitedAt: true, lastUsedAt: true, role: { select: { name: true, permissions: true } },
    },
  })
  const here = await signedInHere(companyId, rows.filter((r) => r.invitedAt !== null && r.lastUsedAt === null).map((r) => r.personId), db as typeof prisma)
  return rows.map((r) => ({
    contextId: r.id, personId: r.personId, type: String(r.type), roleName: r.role?.name ?? null,
    companyId: r.companyId, expiresAt: r.expiresAt, isOwner: r.role?.name === OWNER_ROLE,
    rolePermissions: (r.role?.permissions as string[] | undefined) ?? [],
    revokedAt: r.revokedAt, suspendedAt: r.suspendedAt,
    hasSignedIn: seatHasSignedIn({ invitedAt: r.invitedAt, lastUsedAt: r.lastUsedAt, signedInHere: here.has(r.personId) }),
  }))
}

/**
 * The people who may be named owner of a decision: the owner picker's
 * list, and exactly what `openDecision` accepts. With `holding`, only
 * those whose working seat's role holds that permission: who decides a
 * disagreement about payroll amounts reads payroll.
 */
export async function ownersOnOffer(companyId: string, now: Date = new Date(), db: Db = prisma, holding?: Permission): Promise<{ id: string; name: string }[]> {
  const seats = await firmSeats(companyId, db)
  const ids = [...new Set(seats.filter((s) => seatAtFirm(s, seats, now) !== null && (!holding || hasPermission(s.rolePermissions, holding))).map((s) => s.personId))]
  if (ids.length === 0) return []
  return db.person.findMany({ where: { id: { in: ids } }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
}

/** A person's seats that may decide at the firm; empty when none may. */
async function decidingSeats(companyId: string, personId: string, now: Date, db: Db = prisma): Promise<FirmSeat[]> {
  const seats = await firmSeats(companyId, db)
  return seats.filter((s) => s.personId === personId && seatAtFirm(s, seats, now) === 'DECIDES')
}

/** Who may be named to decide a disagreement about payroll amounts, in the sentence the route refuses anybody else with. */
export const DECIDER_READS_PAYROLL = 'A disagreement about these amounts is decided by somebody whose seat reads payroll. Choose one of the people on the list.'
export const PAYROLL_DECISION_NOT_YOURS = 'This decision is about payroll amounts. It is decided from a seat that reads payroll.'

export const OWNER_NOT_WORKING =
  'A decision is owed by somebody with a working seat at this firm: not on its bench, not paused, and not ended.'

// ── Who reads the proof ─────────────────────────────────────────────

/**
 * Whether a seat reads a decision's proof, proof links and history: its
 * owner, the firm's Owner or an Admin, and whoever sent it back or
 * decided it. Pure.
 */
export function mayReadProof(input: {
  ownerPersonId: string
  readerPersonId: string
  readerRoleNames: readonly (string | null)[]
  /** Everybody who sent it back or decided it, read off its ledger. */
  actedBy: readonly string[]
  /** Its proof points at a payroll record (`aboutPayroll`), so the proof states amounts. */
  aboutPayroll?: boolean
  /** The reader's seat holds `payroll.read`. */
  readsPayroll?: boolean
}): boolean {
  // Amounts are read by a seat that reads payroll, whoever else the reader is.
  if (input.aboutPayroll && !input.readsPayroll) return false
  if (input.readerPersonId === input.ownerPersonId) return true
  if (input.readerRoleNames.some((n) => n === OWNER_ROLE || n === ADMIN_ROLE)) return true
  return input.actedBy.includes(input.readerPersonId)
}

/** Who may read the proof, in the one sentence another seat reads instead. */
export function proofIsFor(ownerName: string, aboutPayroll = false): string {
  const who = `The proof and the history are read by ${ownerName}, who owes this decision, by the firm’s Owner and Admins, and by whoever sent it back or decided it.`
  return aboutPayroll ? `${who} They state payroll amounts, so each of them reads them only from a seat that reads payroll.` : who
}

export { aboutPayroll }

/** Why it cannot be opened, in a sentence; null when it can. Pure. */
export function openRefusal(input: { question: string; proof: string; openedOn: Date }, today: Date = new Date()): string | null {
  if (!input.question?.trim()) return 'A decision says its question in a sentence.'
  if (!input.proof?.trim()) return 'A decision says what shows it is owed.'
  if (Number.isNaN(input.openedOn.getTime())) return 'A decision needs the day it opened.'
  if (dayNumber(input.openedOn) > dayNumber(today)) return 'A decision cannot open on a day that has not happened yet.'
  return null
}

const NOT_YOURS = 'Only the person who owes this decision, or the firm’s Owner or Admin, decides it.'

/** Who may act on a decision, as a rule. Pure. */
export function mayDecide(input: { ownerPersonId: string; deciderPersonId: string; deciderRoleNames: readonly (string | null)[] }): string | null {
  if (input.deciderPersonId === input.ownerPersonId) return null
  if (input.deciderRoleNames.some((n) => n === OWNER_ROLE || n === ADMIN_ROLE)) return null
  return NOT_YOURS
}

/** Why this act cannot be taken on an item in this state, in a sentence; null when it can. Pure. */
export function verdictRefusal(state: string, verdict: Verdict, note: string | null | undefined): string | null {
  if (state !== 'OPEN') return 'This decision is already closed and cannot be decided again.'
  if (verdict === 'REJECT' && !note?.trim()) return 'Say in one line why it is rejected.'
  if (verdict === 'SEND_BACK' && !note?.trim()) return 'Say in one line why it is sent back.'
  return null
}

interface Stamp {
  companyId: string
  personId: string
  heldAs: string
  actingEntityId?: string | null
}

/**
 * Open a decision. `today` defaults to the firm's own day. Pass `tx` to
 * open it inside a caller's transaction, so the decision and what it is
 * about are written together or not at all (lib/money/money-chain).
 */
export async function openDecision(
  input: Stamp & { question: string; ownerPersonId: string; openedOn: Date; proof: string; proofLinks?: ProofLink[] },
  today?: Date,
  tx?: Prisma.TransactionClient,
) {
  const db: Db = tx ?? prisma
  const now = new Date()
  const day = today ?? await firmToday(input.companyId, now, db)
  const refusal = openRefusal(input, day)
  if (refusal) throw new LedgerRefusal(refusal)
  const entities = await db.legalEntity.findMany({ where: { companyId: input.companyId }, select: { id: true } })
  // Exactly one legal entity is used without asking; several are asked.
  if (!input.actingEntityId && entities.length === 1) input = { ...input, actingEntityId: entities[0].id }
  const entityRefusal = stampRefusal({ ...input, action: 'OPENED', summary: input.question }, entities.map((e) => e.id))
  if (entityRefusal) throw new LedgerRefusal(entityRefusal)
  const seats = await firmSeats(input.companyId, db)
  if (!seats.some((s) => s.personId === input.ownerPersonId && seatAtFirm(s, seats, now) !== null)) throw new LedgerRefusal(OWNER_NOT_WORKING)
  const links = (input.proofLinks ?? []).map((l) => ({ recordType: l.recordType, recordId: l.recordId }))
  const write = async (tx: Prisma.TransactionClient) => {
    const item = await tx.decisionItem.create({
      data: {
        companyId: input.companyId,
        question: input.question.trim(),
        ownerPersonId: input.ownerPersonId,
        actingEntityId: input.actingEntityId ?? null,
        openedOn: new Date(dayNumber(input.openedOn) * DAY),
        proof: input.proof.trim(),
        proofLinks: links,
      },
    })
    await writeRecordAction(tx, {
      companyId: input.companyId, recordType: DECISION_RECORD, recordId: item.id,
      action: 'OPENED', summary: `Opened: ${item.question}`,
      personId: input.personId, heldAs: input.heldAs, actingEntityId: input.actingEntityId,
    })
    return item
  }
  return tx ? write(tx) : prisma.$transaction(write)
}

/**
 * The firm's decisions, oldest first by the day they opened, with owner,
 * entity and age in days. `state` 'open' lists only open items, 'decided'
 * only closed ones; a closed item's age stops on the day it was decided.
 */
/**
 * An open card is still owed unless the agent task it asks about has
 * already closed (the bill was paid, the submission confirmed or
 * withdrawn): then there is nothing left to say yes to. The card keeps its
 * state; no verdict is written in a person's name.
 */
export const STILL_OWED: Prisma.DecisionItemWhereInput = { NOT: { agentTasks: { some: { state: { notIn: ['PROPOSED', 'APPROVED', 'RUNNING'] } } } } }

export async function listDecisions(companyId: string, opts: { state?: 'open' | 'decided' | 'all'; now?: Date } = {}) {
  const now = opts.now ?? new Date()
  const zone = await firmZone(companyId)
  const today = todayIn(zone, now)
  const state = opts.state ?? 'all'
  const rows = await prisma.decisionItem.findMany({
    where: { companyId, ...(state === 'open' ? { state: 'OPEN' as const, ...STILL_OWED } : state === 'decided' ? { state: { not: 'OPEN' as const } } : {}) },
    orderBy: [{ openedOn: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    include: {
      ownerPerson: { select: { name: true } },
      actingEntity: { select: { name: true } },
      decidedBy: { select: { name: true } },
      sentBackBy: { select: { name: true } },
    },
  })
  return rows.map((r) => ({
    ...r,
    proofLinks: (r.proofLinks ?? []) as unknown as ProofLink[],
    ownerName: r.ownerPerson.name,
    entityName: r.actingEntity?.name ?? null,
    ageDays: ageOf(r, today, zone),
  }))
}

/** Approve, reject or send back. The ledger row carries the decider's own three stamps. */
export async function decideDecision(input: Stamp & { decisionId: string; verdict: Verdict; note?: string | null }) {
  const item = await prisma.decisionItem.findFirst({ where: { id: input.decisionId, companyId: input.companyId } })
  if (!item) throw new LedgerRefusal('There is no such decision at this firm.')
  const stateRefusal = verdictRefusal(item.state, input.verdict, input.note)
  if (stateRefusal) throw new LedgerRefusal(stateRefusal)
  const now = new Date()
  const seats = await decidingSeats(input.companyId, input.personId, now)
  const who = seats.length === 0
    ? NOT_YOURS
    : mayDecide({ ownerPersonId: item.ownerPersonId, deciderPersonId: input.personId, deciderRoleNames: seats.map((s) => s.roleName) })
  if (who) throw new LedgerRefusal(who)
  // Nobody decides amounts she may not read.
  if (aboutPayroll(item.proofLinks) && !seats.some((s) => hasPermission(s.rolePermissions, PAYROLL_LEDGER_READS))) throw new LedgerRefusal(PAYROLL_DECISION_NOT_YOURS)
  const note = input.note?.trim() || null
  return prisma.$transaction(async (tx) => {
    // Only an item still OPEN moves, so two people deciding at once cannot both close it.
    const data = input.verdict === 'SEND_BACK'
      ? { sentBackReason: note, sentBackByPersonId: input.personId, sentBackAt: now }
      : { state: input.verdict === 'APPROVE' ? 'APPROVED' as const : 'REJECTED' as const, verdictNote: note, decidedByPersonId: input.personId, decidedAt: now }
    const moved = await tx.decisionItem.updateMany({ where: { id: item.id, state: 'OPEN' }, data })
    if (moved.count !== 1) throw new LedgerRefusal('This decision is already closed and cannot be decided again.')
    const words = input.verdict === 'APPROVE' ? 'Approved' : input.verdict === 'REJECT' ? 'Rejected' : 'Sent back'
    await writeRecordAction(tx, {
      companyId: input.companyId, recordType: DECISION_RECORD, recordId: item.id,
      action: input.verdict === 'APPROVE' ? 'APPROVED' : input.verdict === 'REJECT' ? 'REJECTED' : 'SENT_BACK',
      summary: note ? `${words}: ${note}` : `${words}.`,
      personId: input.personId, heldAs: input.heldAs, actingEntityId: input.actingEntityId,
    })
    return tx.decisionItem.findUniqueOrThrow({ where: { id: item.id } })
  })
}

// ── The one list of what needs this seat (GET /api/decisions) ──────

export const DECISION_ITEM_CARD = 'DECISION_ITEM'

/**
 * One card for each open decision item this seat owes, for the one list
 * GET /api/decisions returns, so the number on Ask Etyme, the greeting,
 * Today and Needs attention count it. The card opens the item's page,
 * where its three buttons are; it carries no Yes or Not now of its own.
 * A seat that is not a working seat at the firm owes nothing here.
 */
export async function decisionItemCards(caller: { person: { id: string }; company: { id: string } | null; context: { type: string } }, now: Date = new Date()) {
  if (!caller.company || caller.context.type === 'CONSULTANT') return []
  const companyId = caller.company.id
  const rows = await prisma.decisionItem.findMany({
    where: { companyId, state: 'OPEN', ownerPersonId: caller.person.id, ...STILL_OWED },
    orderBy: [{ openedOn: 'asc' }, { id: 'asc' }],
    select: { id: true, question: true, openedOn: true, createdAt: true, actingEntity: { select: { name: true } } },
    take: 100,
  }).catch(() => [])
  if (rows.length === 0) return []
  const zone = await firmZone(companyId)
  const today = todayIn(zone, now)
  return rows.map((r) => {
    const age = ageInDays(r.openedOn, today)
    return {
      type: DECISION_ITEM_CARD,
      title: r.question,
      subtitle: [age === 0 ? 'Opened today' : `Open ${age === 1 ? '1 day' : `${age} days`}`, r.actingEntity?.name ?? null].filter(Boolean).join(' · '),
      reason: 'A decision you owe. Approve, send back or reject it on its page.',
      named: { whose: null, what: 'a decision you owe', whats: 'decisions you owe' },
      urgency: age > 30 ? 'HIGH' as const : 'MEDIUM' as const,
      entityType: 'DecisionItem',
      entityId: r.id,
      dueDate: null,
      amount: null,
      actionUrl: `/dashboard/decisions/${r.id}`,
      createdAt: r.createdAt.toISOString(),
    }
  })
}
