/**
 * The proposals agent (record 124, plugin 5). Key `proposals-agent`.
 *
 * A person records a bid (title, issuing body, due day, link, the
 * requirements she pasted). Each run, for a firm with the plugin On, the
 * agent does four things and nothing else:
 *
 *  1. DRAFT. It writes the first draft from the firm's own record
 *     (`proposal.draft`): skills and counts of people who agreed to be
 *     listed and of engagements, never a name, never a rate, never a
 *     compliance statement. The paragraphs come through the model gateway
 *     by tier; with no model set up the rules write them and the run says
 *     "Not configured". A model answer that breaks a rule is not used.
 *  2. CHECK. It adds a missing piece for each kind the requirements name,
 *     fills a piece from the record only where the record holds it, flags
 *     every requirement nothing answers, and moves the proposal between
 *     waiting on pieces and ready for a person (`proposal.check`).
 *  3. ASK. When it is ready it opens one card for a person's yes
 *     (`proposal.ask`). Her yes approves the proposal as her own act.
 *  4. CHASE. For each seat that owes a piece it drafts a reminder as a
 *     task (`proposal.chase`): one yes releases the whole task. On Drafts
 *     only nothing is sent, even after the yes.
 *
 * Every act is a row on the record ledger, a skill run, and a TwinAction
 * under the supplier twin's role contract: an act the contract puts at
 * "never" is not done. It never approves, signs, publishes compliance
 * copy or marks a proposal sent: those are a person's, and the proposal
 * rules give the agent no such move.
 */

import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/db'
import { daysOffFor } from '@/lib/days-off'
import { baseUrl } from '@/lib/signed-link'
import { isOn } from '@/lib/plugins'
import { sendMail, mailSendsAbout } from '@/lib/notify/mail-door'
import { nextLetter } from '@/lib/notify/timesheet-chase-agent'
import { ownerForRoles, pickOwner } from '@/lib/money/agent-owners'
import { hasPermission } from '@/lib/permissions'
import { firmSeats, seatAtFirm } from '@/lib/decision-items'
import { callModel, type ModelDeps } from '@/lib/model-gateway/call'
import { runSkill } from '@/lib/skills/runner'
import type { RecordType } from '@/lib/agent-run'
import { ledger } from '@/lib/twin/ledger'
import { contractFor, tierIn, twinKindFor } from '@/lib/twin/role-contract'
import { proposalFacts } from '@/lib/proposals/facts'
import { mayMove, type ProposalState } from '@/lib/proposals/rules'
import {
  MAX_PROPOSALS_A_RUN, PIECE_LABEL, PIECE_ROLES, PROPOSAL_AGENT, PROPOSAL_CHASE_KIND, PROPOSAL_CHASE_TEMPLATE, PROPOSAL_DRAFT_PURPOSE,
  PROPOSAL_RECORD, PROPOSAL_REVIEW_KIND, PROPOSAL_RULE, DRAFT_SYSTEM, acceptAnswer, checkProposal, composeDraft, draftPrompt,
  paragraphsFromRules, piecesToAdd, reminderLetter, requirementLines, reviewProof, reviewQuestion, sourceFromRecord, stateAfterCheck,
  type PieceKind, type ProposalFacts,
} from '@/lib/proposals/draft-rules'
import { TASK_RECORD, approvalOf, closeTask, proposeTask, type TaskPlan } from './tasks'
import { registerPlan } from './plans'
import { registerAgent, type AgentContext, type AgentDef } from './runner'

registerPlan({ agentKey: PROPOSAL_AGENT, skills: ['proposal.draft', 'proposal.check', 'proposal.ask', 'proposal.chase', 'chase.send'], outputSkill: 'proposal.draft' })

const OPEN = ['PROPOSED', 'APPROVED', 'RUNNING'] as const
const WORKING: ProposalState[] = ['DRAFT', 'NEEDS_PIECES', 'READY_FOR_PERSON']
const AS = (r: string) => r as RecordType

export const REVIEW_PLAN: TaskPlan = {
  messages: [], retries: 0, daysApart: 0, sendsNothing: true,
  closesWhen: 'a person approves the proposal, or a piece goes missing again',
}
export const CHASE_PLAN: TaskPlan = {
  messages: [{ template: PROPOSAL_CHASE_TEMPLATE, label: 'Proposal reminder' }], retries: 1, daysApart: 2,
  closesWhen: 'the pieces it names are in the record',
}

export interface ProposalDeps { send?: typeof sendMail; gateway?: ModelDeps }

/** The twin's one row for an act, under the supplier twin's contract. Nothing is written for an act the contract puts at never. */
async function twinRow(ctx: AgentContext, a: { companyId: string; action: string; proposalId: string; person: string | null; rationale: string; rule: string; key: string }) {
  const firm = await prisma.company.findUnique({ where: { id: a.companyId }, select: { kind: true } })
  const kind = twinKindFor(firm?.kind)
  const contract = await contractFor(a.companyId, kind)
  const tier = tierIn(contract, a.action)
  if (tier === 'NEVER') return
  await ledger({
    companyId: a.companyId, twinKind: kind, actorType: 'TWIN', actorId: kind, onAuthorityOfRole: 'Account Manager', authorityPersonId: a.person,
    roleContractId: contract.id, roleContractVersion: contract.version, tier, outcome: 'PERFORMED', action: a.action,
    entityType: PROPOSAL_RECORD, entityId: a.proposalId, partyCompanyIds: [a.companyId], ruleCited: a.rule, rationale: a.rationale,
    surface: 'CRON', payload: { agentKey: ctx.agentKey, ruleVersion: ctx.ruleVersion }, dedupKey: a.key,
  })
}

async function actAllowed(companyId: string, action: string): Promise<boolean> {
  const firm = await prisma.company.findUnique({ where: { id: companyId }, select: { kind: true } })
  return tierIn(await contractFor(companyId, twinKindFor(firm?.kind)), action) !== 'NEVER'
}

/**
 * The seat that owes a kind of piece: the first role with a working seat that may open the Proposals
 * page, else the Owner. A reminder to a seat that cannot open the page would be a dead end, so such a
 * seat is passed over.
 */
const seatFor = (seats: Awaited<ReturnType<typeof firmSeats>>, kind: PieceKind, now: Date) =>
  pickOwner(seats.filter((s) => hasPermission(s.rolePermissions, 'submissions.read')), PIECE_ROLES[kind], now)

async function draftIt(ctx: AgentContext, p: { id: string; title: string; buyer: string | null; dueAt: Date | null }, lines: string[], pieces: { kind: string; haveIt: boolean; label: string; source: string | null }[], facts: ProposalFacts, personId: string, gateway?: ModelDeps) {
  const { result } = await runSkill(ctx, 'proposal.draft', { recordType: PROPOSAL_RECORD, recordId: p.id, unitsPlanned: 1 }, async () => {
    // The gateway's own run row is left to this skill's row, so one call is one row and the cost is counted once.
    const got = await callModel({
      companyId: ctx.companyId, personId, skillKey: 'proposal.draft', purpose: PROPOSAL_DRAFT_PURPOSE,
      prompt: draftPrompt(facts, p.title, p.buyer), system: DRAFT_SYSTEM,
      vocab: { keep: [facts.firm, ...facts.skills, ...facts.firm.split(/\s+/)] },
      record: { recordType: AS(PROPOSAL_RECORD) as never, recordId: p.id }, maxTokens: 500,
    }, { ...(gateway ?? {}), recordRun: async () => null })
    let paragraphs = paragraphsFromRules(facts)
    let by: 'MODEL' | 'RULES' = 'RULES'
    let note: string | null = null
    let verdict: 'PASS' | 'FAIL' = 'PASS'
    if (got.ok) {
      const took = acceptAnswer(got.text, facts)
      paragraphs = took.paragraphs; by = took.by
      if (took.problems.length > 0) { verdict = 'FAIL'; note = `The model’s words were not used: ${took.problems.join(' ')} The rules wrote the draft.` }
    } else {
      note = got.status === 'NOT_CONFIGURED' || got.status === 'OFF' ? `Not configured: ${got.says} The rules wrote the draft.` : `${got.says} The rules wrote the draft.`
    }
    const draft = composeDraft({ title: p.title, buyer: p.buyer, dueAt: p.dueAt, facts, ...paragraphs, check: checkProposal(lines, pieces) })
    return {
      result: { draft, by, note },
      verdict, failReason: note,
      ...(got.ok ? { model: got.model, usage: got.usage, fallbackFrom: got.fallbackFrom } : {}),
    }
  })
  return result
}

export async function proposalsAgentStep(ctx: AgentContext, deps: ProposalDeps = {}): Promise<void> {
  const { companyId, now } = ctx
  const firm = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true, pluginsOn: true } })
  // Off means nothing: no draft, no card, no reminder. What exists is kept.
  if (!firm || !isOn(firm.pluginsOn, 'PUBLIC_SECTOR')) return
  const sw = await prisma.agentSwitch.findUnique({ where: { companyId_agentKey: { companyId, agentKey: ctx.agentKey } } })
  if (!sw) return
  const owner = await ownerForRoles(companyId, ['Account Manager'], now)
  const send = deps.send ?? sendMail

  const proposals = await prisma.proposal.findMany({
    where: { companyId, state: { in: WORKING } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: MAX_PROPOSALS_A_RUN, include: { pieces: { orderBy: { label: 'asc' } } },
  })
  const canDraft = await actAllowed(companyId, 'proposal.draft')
  const canAsk = await actAllowed(companyId, 'proposal.ask')
  const canChase = await actAllowed(companyId, 'proposal.chase')
  const seats = await firmSeats(companyId)

  for (const p of proposals) {
    const lines = requirementLines(p.requirements)
    let pieces = p.pieces.map((x) => ({ id: x.id, kind: x.kind, label: x.label, haveIt: x.haveIt, source: x.source }))
    let state = p.state as ProposalState
    const facts = await proposalFacts(companyId)

    // 1. Draft, once. A person's edit is never overwritten: only a proposal with no draft is written.
    if (p.draft === null && canDraft) {
      if (!(await ctx.mayAct())) return
      const made = await draftIt(ctx, p, lines, pieces, facts, sw.changedById, deps.gateway)
      const saved = await prisma.proposal.updateMany({ where: { id: p.id, draft: null }, data: { draft: made.draft } })
      if (saved.count === 1) {
        await ctx.act({ recordType: PROPOSAL_RECORD, recordId: p.id, action: 'PROPOSAL_DRAFTED', summary: `Drafted the proposal for ${p.title} from the firm’s own record, written by ${made.by === 'MODEL' ? 'the model, checked against the record' : 'the rules'}. A person reads and edits it.` })
        await twinRow(ctx, { companyId, action: 'proposal.draft', proposalId: p.id, person: owner, rule: 'Words only, from the firm’s own record: no rate, no name, no compliance statement.', rationale: `The proposal for ${p.title} had no draft.`, key: `${p.id}:draft` })
      }
    }

    // 2. Check: add the pieces the requirements name, fill one from the record only where the record holds it, and move the state.
    const toAdd = piecesToAdd(lines, pieces)
    const fills = pieces.filter((x) => !x.haveIt && x.source === null).map((x) => ({ x, source: sourceFromRecord(x.kind, facts) })).filter((f) => f.source !== null)
    const added: { id: string; kind: string; label: string; haveIt: boolean; source: string | null }[] = []
    const after = [...pieces.map((x) => ({ ...x }))]
    for (const f of fills) { const hit = after.find((y) => y.id === f.x.id)!; hit.haveIt = true; hit.source = f.source }
    for (const kind of toAdd) {
      const source = sourceFromRecord(kind, facts)
      after.push({ id: `new:${kind}`, kind, label: PIECE_LABEL[kind], haveIt: source !== null, source })
    }
    const check = checkProposal(lines, after)
    const target = stateAfterCheck(check)
    const moves = target !== state && mayMove('AGENT', state, target)
    if (toAdd.length > 0 || fills.length > 0 || moves) {
      if (!(await ctx.mayAct())) return
      await runSkill(ctx, 'proposal.check', { recordType: PROPOSAL_RECORD, recordId: p.id, unitsPlanned: 1 }, async () => {
        for (const f of fills) await prisma.proposalPiece.updateMany({ where: { id: f.x.id, haveIt: false }, data: { haveIt: true, source: f.source } })
        for (const kind of toAdd) {
          const source = sourceFromRecord(kind, facts)
          const row = await prisma.proposalPiece.create({ data: { proposalId: p.id, kind, label: PIECE_LABEL[kind], source, haveIt: source !== null } })
          added.push({ id: row.id, kind, label: row.label, haveIt: row.haveIt, source: row.source })
        }
        if (moves) await prisma.proposal.updateMany({ where: { id: p.id, state }, data: { state: target } })
        return { result: true }
      })
      if (moves) state = target
      await ctx.act({
        recordType: PROPOSAL_RECORD, recordId: p.id, action: 'PROPOSAL_CHECKED',
        summary: `Checked the proposal for ${p.title}: ${check.missing.length} ${check.missing.length === 1 ? 'requirement needs' : 'requirements need'} a piece the record does not hold, ${check.toWrite.length} ${check.toWrite.length === 1 ? 'needs' : 'need'} a person’s words${toAdd.length ? `, ${toAdd.length} ${toAdd.length === 1 ? 'piece' : 'pieces'} added` : ''}.`,
      })
      await twinRow(ctx, { companyId, action: 'proposal.draft', proposalId: p.id, person: owner, rule: 'A requirement is answered only by a piece that is in hand; the rest are flagged, never filled in.', rationale: `Checked the requirements of ${p.title} against the pieces the firm holds.`, key: `${p.id}:check:${randomUUID()}` })
      pieces = (await prisma.proposalPiece.findMany({ where: { proposalId: p.id }, orderBy: { label: 'asc' } })).map((x) => ({ id: x.id, kind: x.kind, label: x.label, haveIt: x.haveIt, source: x.source }))
    }

    // 3. Ask: one card for a person's yes once nothing is missing.
    if (state === 'READY_FOR_PERSON' && canAsk && owner) {
      const blocking = await prisma.agentTask.count({ where: { companyId, agentKey: ctx.agentKey, kind: PROPOSAL_REVIEW_KIND, recordType: PROPOSAL_RECORD, recordId: p.id, state: { in: [...OPEN, 'REFUSED'] } } })
      if (blocking === 0 && (await ctx.mayAct(2))) {
        const fresh = await prisma.proposal.findUniqueOrThrow({ where: { id: p.id }, select: { draft: true } })
        await runSkill(ctx, 'proposal.ask', { recordType: PROPOSAL_RECORD, recordId: p.id, unitsPlanned: 1 }, async () => {
          const task = await proposeTask({
            companyId, agentKey: ctx.agentKey, kind: PROPOSAL_REVIEW_KIND, recordType: PROPOSAL_RECORD, recordId: p.id, plan: REVIEW_PLAN,
            ownerPersonId: owner, openedOn: now, question: reviewQuestion(p.title), detail: reviewProof({ draft: fresh.draft ?? '', check: checkProposal(lines, pieces) }),
          })
          await ctx.act({ recordType: TASK_RECORD, recordId: task.id, action: 'PROPOSAL_ASKED', summary: `Put the proposal for ${p.title} to a person for a yes. Nothing goes to the agency.` })
          return { result: task }
        })
        await twinRow(ctx, { companyId, action: 'proposal.ask', proposalId: p.id, person: owner, rule: 'A person approves; the agent only asks.', rationale: `Every piece of ${p.title} is in hand, so it is ready for a person’s yes.`, key: `${p.id}:ask:${randomUUID()}` })
      }
    }

    // 4. Chase: one reminder task for each seat that owes a piece, once while the piece is missing.
    if (state === 'NEEDS_PIECES' && canChase && owner) {
      const owing = new Map<string, { id: string; label: string }[]>()
      for (const x of pieces.filter((y) => !y.haveIt)) {
        const seat = seatFor(seats, x.kind as PieceKind, now)
        if (seat) owing.set(seat, [...(owing.get(seat) ?? []), { id: x.id, label: x.label }])
      }
      for (const [seat, mine] of owing) {
        const had = await prisma.agentTask.count({ where: { companyId, agentKey: ctx.agentKey, kind: PROPOSAL_CHASE_KIND, recordType: PROPOSAL_RECORD, recordId: p.id, payload: { path: ['seatPersonId'], equals: seat } } })
        if (had > 0 || !(await ctx.mayAct(2))) continue
        const who = await prisma.person.findUnique({ where: { id: seat }, select: { name: true } })
        await runSkill(ctx, 'proposal.chase', { recordType: PROPOSAL_RECORD, recordId: p.id, unitsPlanned: 1 }, async () => {
          const task = await proposeTask({
            companyId, agentKey: ctx.agentKey, kind: PROPOSAL_CHASE_KIND, recordType: PROPOSAL_RECORD, recordId: p.id, plan: CHASE_PLAN,
            ownerPersonId: owner, openedOn: now, question: `Remind ${who?.name ?? 'a colleague'} about the ${p.title} proposal?`,
            detail: `The reminder, to ${who?.name ?? 'the seat'}: ${mine.map((m) => m.label).join(', ')}. It goes to a colleague at this firm and to nobody outside.`,
            payload: { seatPersonId: seat, pieceIds: mine.map((m) => m.id) },
          })
          await ctx.act({ recordType: TASK_RECORD, recordId: task.id, action: 'PROPOSAL_CHASE_PROPOSED', summary: `Proposed a reminder to ${who?.name ?? 'a colleague'} for ${mine.map((m) => m.label).join(', ')} on ${p.title}. Nothing is sent until a person says yes.` })
          return { result: task }
        })
        await twinRow(ctx, { companyId, action: 'proposal.chase', proposalId: p.id, person: owner, rule: 'A reminder to a colleague is a task: one yes releases it.', rationale: `${mine.map((m) => m.label).join(', ')} for ${p.title} ${mine.length === 1 ? 'is' : 'are'} owed by ${who?.name ?? 'a seat'}.`, key: `${p.id}:chase:${seat}:propose` })
      }
    }
  }

  await walkReviewTasks(ctx)
  await walkChaseTasks(ctx, send, firm.name)
}

/** Close a review card that has nothing left to ask. A person's yes on the card approved the proposal as her own act; here it is only read. */
async function walkReviewTasks(ctx: AgentContext) {
  const { companyId } = ctx
  const tasks = await prisma.agentTask.findMany({ where: { companyId, agentKey: ctx.agentKey, kind: PROPOSAL_REVIEW_KIND, state: { in: [...OPEN] } }, orderBy: { createdAt: 'asc' } })
  for (const t0 of tasks) {
    const { task } = await approvalOf(t0.id)
    if (task.state === 'REFUSED') continue
    const p = await prisma.proposal.findFirst({ where: { id: task.recordId, companyId }, select: { state: true } })
    if (!p) { await closeTask(task.id, 'The proposal is gone, so the card is closed.', 'STOPPED'); continue }
    if (p.state === 'APPROVED' || p.state === 'SUBMITTED') { await closeTask(task.id, 'A person approved the proposal, so the card is closed.', 'DONE'); continue }
    if (p.state !== 'READY_FOR_PERSON') await closeTask(task.id, 'A piece is missing again, so the card is withdrawn. A new one opens when the proposal is ready.', 'STOPPED')
  }
}

async function walkChaseTasks(ctx: AgentContext, send: typeof sendMail, firmName: string) {
  const { companyId, now } = ctx
  const tasks = await prisma.agentTask.findMany({ where: { companyId, agentKey: ctx.agentKey, kind: PROPOSAL_CHASE_KIND, recordType: PROPOSAL_RECORD, state: { in: [...OPEN] } }, orderBy: { createdAt: 'asc' } })
  if (tasks.length === 0) return
  const daysOff = await daysOffFor(companyId)
  const seats = await firmSeats(companyId)
  for (const t0 of tasks) {
    const { task } = await approvalOf(t0.id)
    if (task.state === 'REFUSED') continue
    const pay = (task.payload ?? {}) as { seatPersonId?: string; pieceIds?: string[] }
    const p = await prisma.proposal.findFirst({ where: { id: task.recordId, companyId }, include: { pieces: true } })
    const still = p ? p.pieces.filter((x) => (pay.pieceIds ?? []).includes(x.id) && !x.haveIt) : []
    if (!p || p.state === 'APPROVED' || p.state === 'SUBMITTED') { await closeTask(task.id, 'The proposal is approved or gone, so the reminder is stopped.', 'STOPPED'); continue }
    if (still.length === 0) {
      await runSkill(ctx, 'proposal.chase', { recordType: PROPOSAL_RECORD, recordId: p.id, unitsPlanned: 1 }, async () => {
        await closeTask(task.id, 'The pieces it named are in the record, so the reminder is closed.', 'CLOSED_BY_ARRIVAL')
        return { result: true }
      })
      continue
    }
    if (task.state === 'PROPOSED') continue // nothing is sent before a person's yes
    if (ctx.mode !== 'ON') continue // Drafts only: nothing is sent, even after a yes.
    const seat = seats.find((s) => s.personId === pay.seatPersonId)
    if (!seat || !seatAtFirm(seat, seats, now)) { await closeTask(task.id, 'The seat that owes the piece no longer works here, so the reminder is stopped. A person picks who is asked.', 'STOPPED'); continue }
    const person = await prisma.person.findUnique({ where: { id: seat.personId }, select: { name: true, primaryEmail: true } })
    const to = person?.primaryEmail?.trim()
    if (!to) { await closeTask(task.id, 'The seat that owes the piece has no email address on record, so nothing was sent.', 'STOPPED'); continue }

    const plan = task.plan as unknown as TaskPlan
    const left = (await mailSendsAbout(companyId, PROPOSAL_RECORD, p.id)).filter((r) => r.agentTaskId === task.id)
    const next = nextLetter(plan, left.length, left.length ? left[left.length - 1].createdAt : null, now, daysOff)
    if (next.act === 'WAIT') continue
    if (next.act === 'END') {
      await closeTask(task.id, left.some((r) => r.outcome === 'SENT') ? 'The reminder and its follow-up went and the pieces are still missing. Anything more is a person’s to do.' : `No reminder could leave: ${left.length ? left[left.length - 1].note ?? 'the mail service gave no reason' : 'no attempt was recorded'}. Nothing was sent.`, 'DONE')
      continue
    }
    if (!(await ctx.mayAct())) return
    const letter = reminderLetter({ firm: firmName, seatName: person?.name ?? 'there', title: p.title, dueAt: p.dueAt, pieces: still.map((x) => x.label), link: `${baseUrl()}/dashboard/proposals` })
    const { result: r } = await runSkill(ctx, 'chase.send', { recordType: PROPOSAL_RECORD, recordId: p.id, unitsPlanned: 1 }, async () => ({
      result: await send({ to, subject: letter.subject, text: letter.text, about: { companyId, agentKey: ctx.agentKey, agentTaskId: task.id, agentAttempt: next.attempt, recordType: PROPOSAL_RECORD, recordId: p.id, template: PROPOSAL_CHASE_TEMPLATE, chase: true } }),
    }))
    const went = r.outcome === 'SENT'
    await ctx.act({ recordType: TASK_RECORD, recordId: task.id, action: went ? 'PROPOSAL_CHASE_SENT' : 'PROPOSAL_CHASE_NOT_SENT', summary: went ? `Sent reminder ${next.attempt} to ${person?.name} about ${p.title}.` : `Reminder ${next.attempt} to ${person?.name} about ${p.title} was not sent: ${r.note}` })
    if (went) await twinRow(ctx, { companyId, action: 'proposal.chase', proposalId: p.id, person: task.approvedById, rule: 'Sent inside a task a person said yes to, to a colleague at the firm.', rationale: `Reminded ${person?.name} of ${still.map((x) => x.label).join(', ')} for ${p.title}.`, key: `${task.id}:sent:${next.attempt}` })
  }
}

export const proposalsAgent: AgentDef = { ruleVersion: PROPOSAL_RULE, step: (ctx) => proposalsAgentStep(ctx) }
export function registerProposalsAgent(): void { registerAgent(PROPOSAL_AGENT, proposalsAgent) }
