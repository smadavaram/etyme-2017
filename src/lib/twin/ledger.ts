/**
 * The twin's ledger, and the one way the twin acts.
 *
 * Decided by the founder, 2026-10-12: **no twin action without a ledger
 * entry.** The only way the twin does anything is `act`, which reads the
 * role contract, refuses, asks or performs, and writes exactly one
 * `TwinAction` row saying which — with the twin and the human role it
 * acted under, the rule it cited and the reason in plain English. Where
 * it performs, the record's writes, the entry and the automation-log row
 * are one transaction: all three stand or none does. A notice leaves only
 * after the transaction commits.
 *
 * ── Why the rules are not here ───────────────────────────────────────
 *
 * The rules — the time limit, the invoice tolerance — are regulatory's
 * and money's (lib/twin/rules). They decide that something is worth an
 * act and call `act` with what they found. This file decides only
 * whether the twin may, and keeps the record. The model is never the
 * gate: `tierOf` is a list, and a model talked into anything is still
 * held to it.
 *
 * ── Durability, the way a refusal is kept ────────────────────────────
 *
 * The same rule as `recordRefusal` in lib/access-log: a write is awaited
 * before the answer goes out, and a write that fails is reported to
 * staff (`reportError`, awaited) rather than swallowed. A refusal whose
 * entry could not be written is still a refusal. An act whose entry
 * could not be written was not done — the transaction rolled it back —
 * and `act` says so.
 *
 * ── Who reads it ─────────────────────────────────────────────────────
 *
 * `ledgerFeed` scopes at the query: the program owner reads every entry
 * of its company's twin; anybody else at that company reads the entries
 * made on their own authority; another company — a supplier — reads only
 * entries about records it is a party to, without the payload.
 */

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { reportError } from '@/lib/alerts'
import { TWIN_ACTS, isTwinAct } from '@/lib/autonomy'
import { askTheDesk, hasAnyPermission, hasPermission, type Permission } from '@/lib/permissions'
import { twinRefusal, type TwinRefusalWhy } from '@/lib/refusal-words'
import { logBulkAccess } from '@/lib/access-log'
import type { CallerContext } from '@/lib/api-context'
import { contractFor, tierIn, type Contract, type Tier, type TwinKindName } from '@/lib/twin/role-contract'
import { PERFORMERS, type PerformContext } from '@/lib/twin/performers'

export type Surface = 'TEAMS' | 'WEB' | 'CRON'
export type ActorType = 'TWIN' | 'PERSON' | 'SYSTEM'
export type Outcome = 'PERFORMED' | 'AWAITING_APPROVAL' | 'REFUSED' | 'REJECTED'

/** The human role the twin acts under, and the person whose seat it is. */
export interface Authority {
  /** The person holding the seat. Null only where the company has nobody in it yet. */
  personId: string | null
  /** The role's own name at the company: "Program Manager". */
  role: string
  /** For a refusal's sentence. */
  personName?: string | null
}

/** One ledger line, as written. */
export interface LedgerEntry {
  companyId: string
  twinKind?: TwinKindName
  actorType: ActorType
  /** The twin's kind, the person's id, or the job's name. */
  actorId: string
  onAuthorityOfRole: string
  authorityPersonId: string | null
  roleContractId: string | null
  roleContractVersion: number
  tier: Tier
  outcome: Outcome
  action: string
  entityType: string
  entityId: string
  partyCompanyIds: string[]
  ruleCited: string
  rationale: string
  surface: Surface
  approvalId?: string | null
  payload: Record<string, unknown>
  dedupKey?: string | null
}

type Db = Pick<Prisma.TransactionClient, 'twinAction'>

function writeEntry(db: Db, e: LedgerEntry) {
  return db.twinAction.create({
    data: {
      companyId: e.companyId,
      twinKind: e.twinKind ?? 'PROGRAM_MANAGER',
      actorType: e.actorType,
      actorId: e.actorId,
      onAuthorityOfRole: e.onAuthorityOfRole,
      authorityPersonId: e.authorityPersonId,
      roleContractId: e.roleContractId,
      roleContractVersion: e.roleContractVersion,
      tier: e.tier,
      outcome: e.outcome,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      partyCompanyIds: e.partyCompanyIds,
      ruleCited: e.ruleCited,
      rationale: e.rationale,
      surface: e.surface,
      approvalId: e.approvalId ?? null,
      payload: e.payload as Prisma.InputJsonValue,
      dedupKey: e.dedupKey ?? null,
    },
    select: { id: true },
  })
}

async function report(what: string, err: unknown, companyId: string, personId: string | null): Promise<void> {
  await reportError(
    'twin-ledger',
    new Error(`${what} Cause: ${err instanceof Error ? err.message : String(err)}`),
    { companyId, personId }
  ).catch(() => undefined)
}

/**
 * One entry on its own, awaited. Never throws: a failure is reported to
 * staff, awaited too, and the caller is told it was not written.
 */
export async function ledger(entry: LedgerEntry): Promise<{ ok: true; id: string } | { ok: false }> {
  try {
    const row = await writeEntry(prisma, entry)
    return { ok: true, id: row.id }
  } catch (err) {
    await report(
      `Could not write the twin's ledger entry for ${entry.action} on ${entry.entityType} ${entry.entityId} (${entry.outcome}). It is not in the trail.`,
      err, entry.companyId, entry.authorityPersonId
    )
    return { ok: false }
  }
}

/**
 * An entry asking a person, with the question beside it, in one
 * transaction. Never throws; reports instead.
 */
export async function requestApproval(
  entry: Omit<LedgerEntry, 'outcome' | 'approvalId'>,
  needsPermission: string
): Promise<{ ok: true; entryId: string; approvalId: string } | { ok: false }> {
  try {
    const out = await prisma.$transaction(async (tx) => {
      const row = await writeEntry(tx, { ...entry, outcome: 'AWAITING_APPROVAL' })
      const approval = await tx.twinApproval.create({
        data: { twinActionId: row.id, companyId: entry.companyId, needsPermission },
        select: { id: true },
      })
      await tx.automationLog.create({
        data: {
          companyId: entry.companyId,
          action: 'TWIN_APPROVAL_REQUESTED',
          summary: `The program manager’s twin asked a person: ${TWIN_ACTS[entry.action]?.says ?? entry.action}`,
          reason: entry.ruleCited,
          payload: { twinActionId: row.id, approvalId: approval.id, twinAct: entry.action, entityType: entry.entityType, entityId: entry.entityId },
          // Nothing withdraws a question once asked; a person answers it.
          reversible: false,
        },
      })
      return { entryId: row.id, approvalId: approval.id }
    })
    return { ok: true, ...out }
  } catch (err) {
    await report(
      `Could not ask for approval of ${entry.action} on ${entry.entityType} ${entry.entityId}. Nobody was asked.`,
      err, entry.companyId, entry.authorityPersonId
    )
    return { ok: false }
  }
}

// ── Acting ────────────────────────────────────────────────────────────

export interface ActInput {
  /** The company whose program the twin works in. */
  companyId: string
  twin?: TwinKindName
  /** A name from `TWIN_ACTS` in lib/autonomy. */
  action: string
  /**
   * What it is about. `partyCompanyIds` is every company the record
   * concerns — on an invoice receipt, the payer and the supplier. It
   * must include `companyId`; it defaults to just that.
   */
  entity: { type: string; id: string; partyCompanyIds?: string[] }
  /** The rule, cited with its numbers. */
  rule: string
  /** Why, in plain English, for the person reading the ledger. */
  rationale: string
  surface: Surface
  authority: Authority
  /** What the rule found; kept on the entry. */
  payload?: Record<string, unknown>
  /** Who asked for the thing this act would decide, where somebody did. */
  requestedByPersonId?: string | null
  /** A rule's key for one finding, so a daily run records it once. */
  dedupKey?: string | null
  /** Whether a model wrote the rationale. The gate is never a model. */
  writtenBy?: 'RULE' | 'MODEL'
}

export type ActResult =
  | { outcome: 'PERFORMED'; entryId: string; result: Record<string, unknown> }
  | { outcome: 'AWAITING_APPROVAL'; entryId: string; approvalId: string; says: string }
  | { outcome: 'REFUSED'; entryId: string | null; says: string }
  /** The same finding was already recorded under this key. No new entry. */
  | { outcome: 'ALREADY'; entryId: string; says: string }
  /** It could not be recorded, so it was not done. Staff were told. */
  | { outcome: 'FAILED'; says: string }

const NOT_RECORDED = 'Nothing was done, because the twin’s ledger could not record it. Staff have been told.'

function baseEntry(input: ActInput, contract: Contract, tier: Tier, parties: string[]): Omit<LedgerEntry, 'outcome'> {
  const kind = input.twin ?? 'PROGRAM_MANAGER'
  return {
    companyId: input.companyId,
    twinKind: kind,
    actorType: 'TWIN',
    actorId: kind,
    onAuthorityOfRole: input.authority.role,
    authorityPersonId: input.authority.personId,
    roleContractId: contract.id,
    roleContractVersion: contract.version,
    tier,
    action: input.action,
    entityType: input.entity.type,
    entityId: input.entity.id,
    partyCompanyIds: parties,
    ruleCited: input.rule.trim() || 'No rule was cited.',
    rationale: input.rationale.trim() || 'No reason was given.',
    surface: input.surface,
    payload: {
      ...(input.payload ?? {}),
      ...(input.requestedByPersonId ? { requestedByPersonId: input.requestedByPersonId } : {}),
      ...(input.writtenBy ? { writtenBy: input.writtenBy } : {}),
    },
    dedupKey: input.dedupKey ?? null,
  }
}

/** Write a refusal and its automation-log row; the refusal stands either way. */
async function refuse(base: Omit<LedgerEntry, 'outcome'>, says: string, rule: string): Promise<ActResult> {
  // No key on a refusal: a finding refused tonight (nobody seated to
  // tell, say) is tried again tomorrow rather than marked as done.
  const entry: LedgerEntry = {
    ...base, outcome: 'REFUSED', ruleCited: rule, dedupKey: null,
    payload: { ...base.payload, said: says, ruleTheActCited: base.ruleCited, ...(base.dedupKey ? { findingKey: base.dedupKey } : {}) },
  }
  try {
    const id = await prisma.$transaction(async (tx) => {
      const row = await writeEntry(tx, entry)
      await tx.automationLog.create({
        data: {
          companyId: base.companyId,
          action: 'TWIN_REFUSED',
          summary: says,
          reason: rule,
          payload: { twinActionId: row.id, twinAct: base.action, entityType: base.entityType, entityId: base.entityId },
          reversible: false,
        },
      })
      return row.id
    })
    return { outcome: 'REFUSED', entryId: id, says }
  } catch (err) {
    await report(
      `Could not record that the twin was refused ${base.action} on ${base.entityType} ${base.entityId}. The refusal stood and is not in the trail.`,
      err, base.companyId, base.authorityPersonId
    )
    return { outcome: 'REFUSED', entryId: null, says }
  }
}

/** Did the twin itself draft or ask for this record? Then it may not decide it. */
async function twinDrafted(companyId: string, entityType: string, entityId: string): Promise<boolean> {
  const drafting = Object.keys(TWIN_ACTS).filter((a) => TWIN_ACTS[a].drafts)
  const prior = await prisma.twinAction.findFirst({
    where: {
      companyId, actorType: 'TWIN', entityType, entityId,
      OR: [
        { outcome: 'PERFORMED', action: { in: drafting } },
        { outcome: 'AWAITING_APPROVAL' },
      ],
    },
    select: { id: true },
  })
  return !!prior
}

/**
 * The one way the twin acts.
 *
 * Reads the role contract, then: refuses in a sentence (NEVER, an
 * unknown act, another company's record, a decision on something the
 * twin or its own authority asked for, or a record that says no); asks
 * the desk that decides (NEEDS_APPROVAL); or performs (ACTS_ALONE). Each
 * writes exactly one ledger entry. Never throws.
 */
export async function act(input: ActInput): Promise<ActResult> {
  const parties = [...new Set(input.entity.partyCompanyIds?.length ? input.entity.partyCompanyIds : [input.companyId])]
  let contract: Contract
  try {
    contract = await contractFor(input.companyId, input.twin ?? 'PROGRAM_MANAGER')
  } catch (err) {
    await report(`Could not read the twin's role contract, so ${input.action} was not attempted.`, err, input.companyId, input.authority.personId)
    return { outcome: 'FAILED', says: NOT_RECORDED }
  }
  const tier = tierIn(contract, input.action)
  const base = baseEntry(input, contract, tier, parties)
  const known = isTwinAct(input.action)
  const doing = known ? TWIN_ACTS[input.action].says : input.action
  const no = (why: TwinRefusalWhy, rule: string) =>
    refuse(base, twinRefusal({ why, doing, authorityName: input.authority.personName }), rule)

  if (input.dedupKey) {
    const seen = await prisma.twinAction.findFirst({
      where: { companyId: input.companyId, action: input.action, dedupKey: input.dedupKey },
      select: { id: true },
    })
    if (seen) return { outcome: 'ALREADY', entryId: seen.id, says: 'This was already recorded; nothing new was done.' }
  }

  if (!input.rule.trim() || !input.rationale.trim()) {
    return refuse(base, 'The twin acts only with the rule it followed and the reason in words. One was missing, so nothing was done.', 'A twin act cites a rule and a reason')
  }
  if (!known) return no('UNKNOWN', 'Only acts the role contract names')
  if (!parties.includes(input.companyId)) return no('OTHER_COMPANY', 'The twin works only on its own company’s records')
  if (tier === 'NEVER') return no('NEVER', `Role contract v${contract.version}: never`)

  const what = TWIN_ACTS[input.action]
  if (what.decides) {
    if (input.requestedByPersonId && input.requestedByPersonId === input.authority.personId) {
      return no('OWN_AUTHORITY', 'Segregation of duties: nobody signs their own')
    }
    if (await twinDrafted(input.companyId, input.entity.type, input.entity.id)) {
      return no('OWN_DRAFT', 'Segregation of duties: the twin that asks never approves')
    }
  }

  const performer = PERFORMERS[input.action]
  if (!performer) return no('NEVER', 'An act with no performer cannot be done')

  const ctx: PerformContext = {
    companyId: input.companyId,
    action: input.action,
    entity: { type: input.entity.type, id: input.entity.id, partyCompanyIds: parties },
    authorityPersonId: input.authority.personId,
    ruleCited: base.ruleCited,
    rationale: base.rationale,
    payload: base.payload,
  }

  // The record is asked before a person is: a question the record already
  // answers "no" to is not one to put in somebody's queue.
  const recordSays = performer.check ? await performer.check(ctx) : null
  if (recordSays) return refuse(base, recordSays, 'The record says no')

  if (tier === 'NEEDS_APPROVAL') {
    const needs = what.approverNeeds ?? 'settings.manage'
    const asked = await requestApproval(base, needs)
    if (!asked.ok) return { outcome: 'FAILED', says: NOT_RECORDED }
    void tellTheDesk(input, needs, asked.approvalId).catch((err) =>
      report(`Asked for approval of ${input.action} and could not tell the desk.`, err, input.companyId, input.authority.personId)
    )
    return {
      outcome: 'AWAITING_APPROVAL',
      entryId: asked.entryId,
      approvalId: asked.approvalId,
      says: `Waiting for a person: ${doing}`,
    }
  }

  // ACTS_ALONE: the record's writes, the entry and the automation-log row, together.
  const alone = what.alone ?? 'TOLD'
  try {
    const done = await prisma.$transaction(async (tx) => {
      const result = performer.inTx ? await performer.inTx(tx, ctx) : {}
      const row = await writeEntry(tx, { ...base, outcome: 'PERFORMED', payload: { ...base.payload, result } })
      await tx.automationLog.create({
        data: {
          companyId: input.companyId,
          action: alone === 'NOTED' ? 'TWIN_NOTED' : alone === 'DREW_UP' ? 'TWIN_DREW_UP' : 'TWIN_TOLD',
          summary: `${doing} — ${base.rationale}`.slice(0, 500),
          reason: base.ruleCited,
          payload: {
            twinActionId: row.id, twinAct: input.action, entityType: input.entity.type, entityId: input.entity.id,
            onAuthorityOf: input.authority.role, authorityPersonId: input.authority.personId,
            ...(input.writtenBy ? { writtenBy: input.writtenBy } : {}),
          },
          reversible: what.reversible,
        },
      })
      return { id: row.id, result }
    })
    if (performer.after) {
      await performer.after(ctx).catch((err) =>
        report(`The twin did ${input.action} and the notice that follows it did not go.`, err, input.companyId, input.authority.personId)
      )
    }
    return { outcome: 'PERFORMED', entryId: done.id, result: done.result }
  } catch (err) {
    // A rule's key already written by a run racing this one is not a failure.
    if (input.dedupKey && (err as { code?: string })?.code === 'P2002') {
      const seen = await prisma.twinAction.findFirst({
        where: { companyId: input.companyId, action: input.action, dedupKey: input.dedupKey }, select: { id: true },
      })
      if (seen) return { outcome: 'ALREADY', entryId: seen.id, says: 'This was already recorded; nothing new was done.' }
    }
    await report(`The twin could not do ${input.action} on ${input.entity.type} ${input.entity.id}; nothing was written.`, err, input.companyId, input.authority.personId)
    return { outcome: 'FAILED', says: NOT_RECORDED }
  }
}

/** Tell the people at the desk that decides, never the twin's own authority. */
async function tellTheDesk(input: ActInput, needs: string, approvalId: string): Promise<void> {
  const { notifyBulk } = await import('@/lib/notify')
  const desk = await prisma.context.findMany({
    where: {
      companyId: input.companyId, revokedAt: null, type: { not: 'CONSULTANT' },
      role: { permissions: { hasSome: [needs, '*'] } },
    },
    select: { personId: true },
    take: 10,
  })
  const to = [...new Set(desk.map((d) => d.personId))].filter((p) => p !== input.authority.personId)
  await notifyBulk(to.map((personId) => ({
    personId,
    companyId: input.companyId,
    type: 'SYSTEM' as const,
    title: 'The program manager’s twin is asking you to decide',
    body: `${TWIN_ACTS[input.action]?.says ?? input.action} ${input.rule} ${input.rationale}`.trim(),
    entityId: approvalId,
    data: { twinApprovalId: approvalId, href: '/dashboard' },
  })))
}

// ── A person answering ────────────────────────────────────────────────

export interface Decider {
  personId: string
  personName: string
  companyId: string
  companyKind?: string | null
  companyName?: string | null
  permissions: readonly string[]
}

export type DecideResult =
  | { ok: true; outcome: 'PERFORMED' | 'REJECTED'; entryId: string; result?: Record<string, unknown> }
  | { ok: false; status: 403 | 404 | 409 | 422 | 500; says: string }

/**
 * A person says yes or no to what the twin asked. The one door both
 * Teams and the web call (POST /api/twin/approvals/:id).
 *
 * Refused, in a sentence and with an entry, where the person does not
 * hold the desk the act needs, or is the person on whose authority the
 * twin asked, or asked for the thing themselves. A yes is checked
 * against the record again — a receipt approved on Monday's reading is
 * not approved on Friday's — and then performed in one transaction with
 * the answer and its entry.
 */
export async function decideApproval(args: {
  approvalId: string
  decider: Decider
  decision: 'APPROVED' | 'REJECTED'
  reason?: string | null
  surface: Surface
}): Promise<DecideResult> {
  const approval = await prisma.twinApproval.findUnique({
    where: { id: args.approvalId },
    select: {
      id: true, companyId: true, decision: true, needsPermission: true,
      twinAction: {
        select: {
          id: true, twinKind: true, action: true, entityType: true, entityId: true, partyCompanyIds: true,
          onAuthorityOfRole: true, authorityPersonId: true, ruleCited: true, rationale: true, payload: true,
          authorityPerson: { select: { name: true } },
        },
      },
    },
  })
  // Isolation at the query: another company's question is not there at all.
  if (!approval || approval.companyId !== args.decider.companyId) {
    return { ok: false, status: 404, says: 'There is no such question from the twin at your company.' }
  }
  if (approval.decision !== 'PENDING') {
    return { ok: false, status: 409, says: 'Somebody has already answered this.' }
  }

  const asked = approval.twinAction
  const payload = (asked.payload ?? {}) as Record<string, unknown>
  const contract = await contractFor(approval.companyId, asked.twinKind)
  const tier = tierIn(contract, asked.action)
  const person: Omit<LedgerEntry, 'outcome'> = {
    companyId: approval.companyId,
    twinKind: asked.twinKind,
    actorType: 'PERSON',
    actorId: args.decider.personId,
    onAuthorityOfRole: asked.onAuthorityOfRole,
    authorityPersonId: asked.authorityPersonId,
    roleContractId: contract.id,
    roleContractVersion: contract.version,
    tier,
    action: asked.action,
    entityType: asked.entityType,
    entityId: asked.entityId,
    partyCompanyIds: asked.partyCompanyIds,
    ruleCited: asked.ruleCited,
    rationale: asked.rationale,
    surface: args.surface,
    approvalId: approval.id,
    payload: { askedIn: asked.id, decision: args.decision, reason: args.reason ?? null },
  }
  const refused = async (status: 403 | 422, says: string, rule: string): Promise<DecideResult> => {
    // Awaited before the refusal goes out; reported, never thrown, on failure.
    await ledger({ ...person, outcome: 'REFUSED', ruleCited: rule, payload: { ...person.payload, said: says } })
    return { ok: false, status, says }
  }

  if (!hasPermission(args.decider.permissions, approval.needsPermission as Permission)) {
    return refused(403, askTheDesk({
      doing: 'Answering this question from the twin',
      needs: approval.needsPermission as Permission,
      kind: args.decider.companyKind,
      companyName: args.decider.companyName,
    }), 'Only the desk the contract names decides')
  }
  if (args.decider.personId === asked.authorityPersonId || args.decider.personId === payload.requestedByPersonId) {
    return refused(403, twinRefusal({
      why: 'OWN_AUTHORITY', doing: TWIN_ACTS[asked.action]?.says ?? asked.action,
      authorityName: args.decider.personId === asked.authorityPersonId ? asked.authorityPerson?.name : args.decider.personName,
    }), 'Segregation of duties: nobody signs their own')
  }

  const reason = args.reason?.trim() || null
  if (args.decision === 'REJECTED') {
    if (!reason) return { ok: false, status: 422, says: 'Say why, so the twin and whoever reads the ledger know.' }
    try {
      const id = await prisma.$transaction(async (tx) => {
        const moved = await tx.twinApproval.updateMany({
          where: { id: approval.id, decision: 'PENDING' },
          data: { decision: 'REJECTED', approverPersonId: args.decider.personId, decidedAt: new Date(), surface: args.surface, reasonFromApprover: reason },
        })
        if (moved.count !== 1) throw new Error('ALREADY_DECIDED')
        const row = await writeEntry(tx, { ...person, outcome: 'REJECTED' })
        await tx.automationLog.create({
          data: {
            companyId: approval.companyId,
            action: 'TWIN_ACT_REJECTED',
            summary: `${args.decider.personName} said no to the twin: ${TWIN_ACTS[asked.action]?.says ?? asked.action}`,
            reason,
            payload: { twinActionId: row.id, approvalId: approval.id, byPersonId: args.decider.personId },
            reversible: false,
          },
        })
        return row.id
      })
      return { ok: true, outcome: 'REJECTED', entryId: id }
    } catch (err) {
      if (err instanceof Error && err.message === 'ALREADY_DECIDED') return { ok: false, status: 409, says: 'Somebody has already answered this.' }
      await report(`Could not record a no to approval ${approval.id}.`, err, approval.companyId, args.decider.personId)
      return { ok: false, status: 500, says: 'Your answer could not be recorded, so nothing changed. Staff have been told.' }
    }
  }

  // A yes. The contract may have tightened since the twin asked.
  if (tier === 'NEVER') {
    return refused(422, twinRefusal({ why: 'NEVER', doing: TWIN_ACTS[asked.action]?.says ?? asked.action }), `Role contract v${contract.version}: never`)
  }
  const performer = PERFORMERS[asked.action]
  if (!performer) return refused(422, 'This act cannot be done by the twin at all.', 'An act with no performer cannot be done')
  const ctx: PerformContext = {
    companyId: approval.companyId,
    action: asked.action,
    entity: { type: asked.entityType, id: asked.entityId, partyCompanyIds: asked.partyCompanyIds },
    authorityPersonId: asked.authorityPersonId,
    ruleCited: asked.ruleCited,
    rationale: asked.rationale,
    payload,
  }
  const recordSays = performer.check ? await performer.check(ctx) : null
  if (recordSays) return refused(422, recordSays, 'The record says no')

  try {
    const done = await prisma.$transaction(async (tx) => {
      const moved = await tx.twinApproval.updateMany({
        where: { id: approval.id, decision: 'PENDING' },
        data: { decision: 'APPROVED', approverPersonId: args.decider.personId, decidedAt: new Date(), surface: args.surface, reasonFromApprover: reason },
      })
      if (moved.count !== 1) throw new Error('ALREADY_DECIDED')
      const result = performer.inTx ? await performer.inTx(tx, ctx) : {}
      const row = await writeEntry(tx, { ...person, outcome: 'PERFORMED', payload: { ...person.payload, result } })
      await tx.automationLog.create({
        data: {
          companyId: approval.companyId,
          action: 'TWIN_ACT_APPROVED',
          summary: `${args.decider.personName} said yes to the twin: ${TWIN_ACTS[asked.action]?.says ?? asked.action}`,
          reason: reason ?? asked.ruleCited,
          payload: { twinActionId: row.id, approvalId: approval.id, byPersonId: args.decider.personId, result: result as Prisma.InputJsonValue },
          reversible: false,
        },
      })
      return { id: row.id, result }
    })
    if (performer.after) {
      await performer.after(ctx).catch((err) =>
        report(`Approval ${approval.id} was done and the notice that follows it did not go.`, err, approval.companyId, args.decider.personId)
      )
    }
    return { ok: true, outcome: 'PERFORMED', entryId: done.id, result: done.result }
  } catch (err) {
    if (err instanceof Error && err.message === 'ALREADY_DECIDED') return { ok: false, status: 409, says: 'Somebody has already answered this.' }
    await report(`Approval ${approval.id} was not done; nothing was written.`, err, approval.companyId, args.decider.personId)
    return { ok: false, status: 500, says: 'Nothing was done, because it could not be recorded. Staff have been told.' }
  }
}

// ── Reading the ledger ────────────────────────────────────────────────

export type FeedView = 'OWNER' | 'OWN_AUTHORITY' | 'PARTY'

/** Desks that read every entry of their own company's twin. */
export const OWNER_DESKS: readonly Permission[] = ['governance.read', 'settings.manage']

/**
 * Which entries a reader may see, as a query. Null where none.
 *
 * Pure, so the scope is one place: the program owner reads all of its
 * company's; anybody else there reads what was done on their own
 * authority; another company reads only what concerns a record it is a
 * party to.
 */
export function feedWhere(
  companyId: string,
  reader: Pick<CallerContext, 'company' | 'person' | 'permissions'>
): { where: Prisma.TwinActionWhereInput; view: FeedView } | null {
  if (!reader.company) return null
  if (reader.company.id === companyId) {
    return hasAnyPermission(reader.permissions, OWNER_DESKS)
      ? { where: { companyId }, view: 'OWNER' }
      : { where: { companyId, authorityPersonId: reader.person.id }, view: 'OWN_AUTHORITY' }
  }
  return { where: { companyId, partyCompanyIds: { has: reader.company.id } }, view: 'PARTY' }
}

export interface FeedRow {
  id: string
  ts: Date
  actorType: string
  actorId: string
  onAuthorityOfRole: string
  action: string
  says: string
  tier: string
  outcome: string
  entityType: string
  entityId: string
  ruleCited: string
  rationale: string
  surface: string
  approvalId: string | null
  /** The owner's view only. */
  payload?: unknown
  roleContractVersion?: number
}

export async function ledgerFeed(
  companyId: string,
  reader: Pick<CallerContext, 'company' | 'person' | 'permissions'>,
  opts: { take?: number } = {}
): Promise<{ view: FeedView; rows: FeedRow[] } | null> {
  const scope = feedWhere(companyId, reader)
  if (!scope) return null
  const rows = await prisma.twinAction.findMany({
    where: scope.where,
    orderBy: { ts: 'desc' },
    take: Math.min(Math.max(opts.take ?? 100, 1), 500),
    select: {
      id: true, ts: true, actorType: true, actorId: true, onAuthorityOfRole: true, action: true,
      tier: true, outcome: true, entityType: true, entityId: true, ruleCited: true, rationale: true,
      surface: true, approvalId: true, payload: true, roleContractVersion: true,
    },
  })
  // A person named in an entry is a person whose data was read.
  const people = [...new Set(rows.filter((r) => r.entityType === 'Person').map((r) => r.entityId))]
  if (people.length) {
    logBulkAccess(people, {
      actorPersonId: reader.person.id,
      actorCompanyId: reader.company?.id,
      action: 'TENURE_VIEW',
      reason: 'Read in the program manager’s twin’s ledger',
    })
  }
  const owner = scope.view === 'OWNER'
  return {
    view: scope.view,
    rows: rows.map((r) => ({
      id: r.id, ts: r.ts, actorType: r.actorType,
      // A supplier reads that a person answered, not which person.
      actorId: owner || r.actorType === 'TWIN' ? r.actorId : 'PERSON',
      onAuthorityOfRole: r.onAuthorityOfRole, action: r.action,
      says: TWIN_ACTS[r.action]?.says ?? r.action,
      tier: r.tier, outcome: r.outcome, entityType: r.entityType, entityId: r.entityId,
      ruleCited: r.ruleCited, rationale: r.rationale, surface: r.surface, approvalId: r.approvalId,
      ...(owner ? { payload: r.payload, roleContractVersion: r.roleContractVersion } : {}),
    })),
  }
}
