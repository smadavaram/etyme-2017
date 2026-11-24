/**
 * The confirmation tracker (record 112, chain 1, "Win work"). Key
 * `confirmation-tracker`.
 *
 * Submissions out against confirmations in, for one firm. A person records
 * a confirmation on the submission (`recordConfirmation`); or, where the
 * other side's reply is already on Etyme (a message on the submission's own
 * thread that proposes an interview or confirms a rate), the tracker matches
 * it. It never reads a mailbox. A draft is never a confirmation, and a
 * bounce on the mail ledger reopens the item as "failed delivery".
 *
 * Each run:
 *  1. The same person put forward twice for the same job in overlapping
 *     time is a dual authorization. Neither submission takes a confirmation
 *     until two different people have said yes on two cards. The tracker
 *     opens the two cards and never lifts the block itself.
 *  2. An item still awaiting, with a reply already on the thread, is
 *     matched. On Drafts only the match is noted on the ledger and nothing
 *     is recorded: probation is scope.
 *  3. An item whose letter bounced opens one card, owed by the Account
 *     Manager else the Owner.
 *  4. A submission still waiting after three days is proposed as one chase
 *     task; once a person says yes it sends one letter and one reminder
 *     (`submission-chase`).
 *  5. Once a week one ledger line gives the tally.
 *
 * It sends only inside that approved task, moves no money and changes no submission.
 */

import { prisma } from '@/lib/db'
import { LedgerRefusal, writeRecordAction } from '@/lib/record-ledger'
import { openDecision, firmSeats, seatAtFirm, firmToday } from '@/lib/decision-items'
import { mailSendsAbout, mailSendsAboutMany, type sendMail } from '@/lib/notify/mail-door'
import { ownerForRoles } from '@/lib/money/agent-owners'
import { submissionChaseStep } from './submission-chase'
import { AGENT_HELD_AS, registerAgent, type AgentContext, type AgentDef } from './runner'
import {
  CONFIRMATION_AGENT, CONFIRMATION_RULE, CONFIRMING_MESSAGE_TYPES, PROPOSED_LATE_AFTER_DAYS,
  blockReleased, confirmationRefusal, confirmedMoment, daysWaiting, dualAuthorizations, dualProof, dualQuestion,
  failedQuestion, itemState, twoSeats, type ItemState, type SubmissionFact,
} from './confirmation-rules'

/**
 * Acts and card links are written on the person put forward: the record view opens a
 * person and does not open a submission, so a line on a submission would be a dead link.
 */
export const PERSON_RECORD = 'Person'
/** The mail ledger's own name for a letter about a submission; the letters, not the ledger lines, are read by it. */
export const MAIL_ABOUT = 'Submission'
const ENDED = ['REJECTED', 'WITHDRAWN']

export interface Item { fact: SubmissionFact; state: ItemState; confirmations: { id: string; mailSendId: string | null; confirmedAt: Date }[]; toCompanyId: string }

/** Every live submission the firm sent, with its confirmations and the letters about it, and where each stands. */
export async function trackerItems(companyId: string, now: Date = new Date(), onlyId?: string): Promise<Item[]> {
  const rows = await prisma.submission.findMany({
    where: { fromCompanyId: companyId, status: { notIn: ENDED } },
    select: {
      id: true, personId: true, submittedAt: true, rejectedAt: true, checkState: true, toCompanyId: true,
      person: { select: { name: true } },
      requirement: { select: { title: true, companyId: true, endClientCompanyId: true } },
    },
    orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
    take: 3000,
  })
  const ids = rows.map((r) => r.id)
  const [confs, mails] = await Promise.all([
    prisma.submissionConfirmation.findMany({ where: { companyId, submissionId: { in: ids } }, select: { id: true, submissionId: true, mailSendId: true, confirmedAt: true } }),
    mailSendsAboutMany(companyId, MAIL_ABOUT, ids),
  ])
  const facts: SubmissionFact[] = rows.map((r) => ({
    id: r.id, personId: r.personId, personName: r.person.name,
    jobKey: `${r.requirement.endClientCompanyId ?? r.requirement.companyId}|${r.requirement.title.trim().toLowerCase()}`,
    jobTitle: r.requirement.title, submittedAt: r.submittedAt, endedAt: r.rejectedAt, checkState: r.checkState,
  }))
  const blocked = await blockedIds(companyId, facts)
  const items = rows.map((r, i) => {
    const confirmations = confs.filter((c) => c.submissionId === r.id)
    const letters = mails.filter((m) => m.recordId === r.id)
    return { fact: facts[i], confirmations, toCompanyId: r.toCompanyId, state: itemState({ submission: facts[i], confirmations, mails: letters, blocked: blocked.has(r.id) }) }
  })
  // The whole book is read so a double authorization is seen; only then is it narrowed.
  return onlyId ? items.filter((i) => i.fact.id === onlyId) : items
}

/** The submissions held by a dual authorization no two people have released. */
export async function blockedIds(companyId: string, facts: readonly SubmissionFact[]): Promise<Set<string>> {
  const out = new Set<string>()
  for (const group of dualAuthorizations(facts)) {
    const cards = await prisma.decisionItem.findMany({
      where: { companyId, question: dualQuestion(group[0].personName, group[0].jobTitle), state: 'APPROVED', proofLinks: { array_contains: [{ recordType: PERSON_RECORD, recordId: group[0].personId }] } },
      select: { decidedByPersonId: true },
    })
    if (!blockReleased(cards.map((c) => c.decidedByPersonId))) for (const m of group) out.add(m.id)
  }
  return out
}

export interface RecordConfirmationInput {
  companyId: string
  submissionId: string
  personId: string
  heldAs: string
  actingEntityId?: string | null
  channel: unknown
  note?: string | null
  mailSendId?: string | null
  /** The day it was confirmed, as YYYY-MM-DD; today where nothing is typed. */
  confirmedOn?: unknown
  /** Set where the tracker matched a reply it already holds. */
  agentKey?: string
  ruleVersion?: string
  /** The person at the other firm, where a reply names one; never an id from another firm's table. */
  now?: Date
}

/**
 * Record that the other side confirmed a submission. Refused, in a sentence,
 * for a submission that has not gone out, one held by a dual authorization,
 * or one already confirmed. Written with its ledger row, or not at all.
 */
export async function recordConfirmation(input: RecordConfirmationInput) {
  const now = input.now ?? new Date()
  const [item] = await trackerItems(input.companyId, now, input.submissionId)
  if (!item) throw new LedgerRefusal('There is no such submission at this firm, or it was already turned down or withdrawn.')
  const says = confirmationRefusal({
    state: item.state, channel: input.channel,
    alreadyConfirmed: item.state === 'CONFIRMED',
  })
  if (says) throw new LedgerRefusal(says)
  const when = confirmedMoment(input.confirmedOn, item.fact.submittedAt, now)
  if (!when.ok) throw new LedgerRefusal(when.says)
  let mailSendId: string | null = null
  if (input.mailSendId) {
    const mail = (await mailSendsAbout(input.companyId, MAIL_ABOUT, input.submissionId)).find((m) => m.id === input.mailSendId)
    if (!mail) throw new LedgerRefusal('That letter is not one about this submission.')
    mailSendId = mail.id
  }
  const note = input.note?.trim() || null
  return prisma.$transaction(async (tx) => {
    const row = await tx.submissionConfirmation.create({
      data: {
        companyId: input.companyId, submissionId: input.submissionId, channel: input.channel as string, mailSendId, note,
        confirmedByPersonId: input.agentKey ? null : input.personId, confirmedAt: when.at,
      },
    })
    await writeRecordAction(tx, {
      companyId: input.companyId, recordType: 'SubmissionConfirmation', recordId: row.id,
      action: input.agentKey ? 'CONFIRMATION_MATCHED' : 'CONFIRMATION_RECORDED',
      summary: `${tag(item.fact)}: confirmed by ${String(input.channel).toLowerCase()}${note ? `. ${note}` : '.'}`,
      personId: input.personId, heldAs: input.heldAs, actingEntityId: input.actingEntityId ?? null,
      agentKey: input.agentKey ?? null, ruleVersion: input.ruleVersion ?? null,
    })
    return row
  })
}

const weekStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - d.getUTCDay()))

/** A reply the other firm already put on the submission's own thread that says, on its face, it has the package. */
async function replyOn(companyId: string, item: Item): Promise<{ at: Date; type: string; who: string; messageId: string } | null> {
  const threads = await prisma.conversation.findMany({
    where: {
      topic: 'SUBMISSION', topicId: item.fact.id,
      OR: [{ companyId, withCompanyId: item.toCompanyId }, { companyId: item.toCompanyId, withCompanyId: companyId }],
    },
    select: { id: true },
  })
  if (threads.length === 0) return null
  const messages = await prisma.message.findMany({
    where: { conversationId: { in: threads.map((t) => t.id) }, deletedAt: null, type: { in: [...CONFIRMING_MESSAGE_TYPES] }, createdAt: { gte: item.fact.submittedAt } },
    orderBy: { createdAt: 'asc' }, select: { id: true, authorId: true, type: true, createdAt: true },
  })
  for (const m of messages) {
    const seat = await prisma.context.findFirst({ where: { personId: m.authorId, companyId: item.toCompanyId }, select: { id: true } })
    if (!seat) continue
    const who = await prisma.person.findUnique({ where: { id: m.authorId }, select: { name: true } })
    return { at: m.createdAt, type: m.type, who: who?.name ?? 'Someone at the other firm', messageId: m.id }
  }
  return null
}

/** The words that say which submission a line is about: the person, the job and the day it went out. */
const tag = (f: SubmissionFact) => `${f.personName} for ${f.jobTitle} (put forward ${f.submittedAt.toISOString().slice(0, 10)})`

const said = (companyId: string, action: string, f: SubmissionFact) =>
  prisma.recordAction.count({ where: { companyId, agentKey: CONFIRMATION_AGENT, action, recordId: f.personId, summary: { contains: tag(f) } } }).then((n) => n > 0)

export async function confirmationTrackerStep(ctx: AgentContext, deps: { send?: typeof sendMail } = {}): Promise<void> {
  const { companyId, now } = ctx
  const sw = await prisma.agentSwitch.findUnique({ where: { companyId_agentKey: { companyId, agentKey: ctx.agentKey } } })
  if (!sw) return
  const entities = await prisma.legalEntity.findMany({ where: { companyId }, select: { id: true } })
  const entityId = entities.length === 1 ? entities[0].id : null
  const today = await firmToday(companyId, now)
  const items = await trackerItems(companyId, now)

  // 1. Dual authorizations: two cards, two different people, and the tracker never lifts the block.
  const facts = items.map((i) => i.fact)
  const blocked = await blockedIds(companyId, facts)
  for (const group of dualAuthorizations(facts)) {
    if (!group.some((m) => blocked.has(m.id))) continue
    const first = group[0]
    const link = { recordType: PERSON_RECORD, recordId: first.personId }
    const had = await prisma.decisionItem.count({ where: { companyId, question: dualQuestion(first.personName, first.jobTitle), proofLinks: { array_contains: [link] } } })
    if (had > 0) continue
    if (!(await ctx.mayAct())) return
    const seats = await firmSeats(companyId)
    const working = seats.filter((s) => seatAtFirm(s, seats, now) !== null)
    const owner = await ownerForRoles(companyId, [], now)
    const manager = await ownerForRoles(companyId, ['Account Manager'], now)
    const other = working.map((s) => s.personId).sort().find((p) => p !== (manager ?? owner)) ?? null
    const pair = twoSeats(manager, owner, other)
    if (!pair) {
      if (!(await said(companyId, 'DUAL_AUTHORIZATION_BLOCKED', first))) {
        await ctx.act({ recordType: PERSON_RECORD, recordId: first.personId, action: 'DUAL_AUTHORIZATION_BLOCKED', summary: `${tag(first)} is put forward twice. Both are on hold, and the firm has one working seat, so nobody can release it. Add a second seat.` })
      }
      continue
    }
    for (const ownerPersonId of pair) {
      await openDecision({
        companyId, personId: sw.changedById, heldAs: AGENT_HELD_AS, actingEntityId: entityId,
        question: dualQuestion(first.personName, first.jobTitle), ownerPersonId, openedOn: today, proof: dualProof(group), proofLinks: [link],
      }, undefined)
    }
    await ctx.act({ recordType: PERSON_RECORD, recordId: first.personId, action: 'DUAL_AUTHORIZATION_BLOCKED', summary: `${tag(first)} is put forward ${group.length} times for the same job. No confirmation is recorded on either until two different people say yes.` })
  }

  // 2. Replies Etyme already holds.
  for (const item of items) {
    if (item.state !== 'AWAITING') continue
    const reply = await replyOn(companyId, item)
    if (!reply) continue
    const says = `${reply.who} replied on the submission’s own thread (${reply.type === 'INTERVIEW' ? 'an interview' : 'a rate'}), so ${tag(item.fact)} reads confirmed.`
    if (ctx.mode !== 'ON') {
      if (!(await said(companyId, 'CONFIRMATION_FOUND_NOT_RECORDED', item.fact))) {
        if (!(await ctx.mayAct())) return
        await ctx.act({ recordType: PERSON_RECORD, recordId: item.fact.personId, action: 'CONFIRMATION_FOUND_NOT_RECORDED', summary: `${says} Not recorded: this agent is on drafts only.` })
      }
      continue
    }
    if (!(await ctx.mayAct())) return
    try {
      await recordConfirmation({
        companyId, submissionId: item.fact.id, personId: sw.changedById, heldAs: AGENT_HELD_AS, actingEntityId: entityId,
        channel: 'PORTAL', note: `${reply.who} replied on Etyme on ${reply.at.toISOString().slice(0, 10)} (${reply.type.toLowerCase().replace('_', ' ')}).`,
        agentKey: ctx.agentKey, ruleVersion: ctx.ruleVersion, now,
      })
    } catch (e) {
      if (e instanceof LedgerRefusal) continue
      throw e
    }
    item.state = 'CONFIRMED'
  }

  // 3. A letter that bounced reopens the item, with one card.
  const owner = await ownerForRoles(companyId, ['Account Manager'], now)
  for (const item of items) {
    if (item.state !== 'FAILED_DELIVERY' || !owner) continue
    const link = { recordType: PERSON_RECORD, recordId: item.fact.personId }
    const question = failedQuestion(item.fact.personName, item.fact.jobTitle)
    const open = await prisma.decisionItem.count({ where: { companyId, state: 'OPEN', question, proofLinks: { array_contains: [link] } } })
    if (open > 0) continue
    if (!(await ctx.mayAct())) return
    await openDecision({
      companyId, personId: sw.changedById, heldAs: AGENT_HELD_AS, actingEntityId: entityId,
      question, ownerPersonId: owner, openedOn: today,
      proof: `The mail ledger shows the letter about submission ${item.fact.id} did not reach the other side. It is open again until a person confirms it another way or sends it again. This agent sends nothing.`,
      proofLinks: [link],
    })
    await ctx.act({ recordType: PERSON_RECORD, recordId: item.fact.personId, action: 'FAILED_DELIVERY_REOPENED', summary: `${tag(item.fact)}: the letter did not reach the other side, so it is open again.` })
  }

  // 4. A submission still waiting after three days is proposed for a chase; a released chase is walked.
  await submissionChaseStep(ctx, items, deps)

  // 5. The week's tally, once.
  const from = weekStart(now)
  const tallied = await prisma.recordAction.count({ where: { companyId, agentKey: ctx.agentKey, action: 'WEEKLY_TALLY', createdAt: { gte: from } } })
  if (tallied === 0 && (await ctx.mayAct())) {
    const out = items.filter((i) => i.state !== 'NOT_SENT')
    const n = (s: ItemState) => out.filter((i) => i.state === s).length
    const late = out.filter((i) => i.state === 'AWAITING' && daysWaiting(i.fact.submittedAt, now) > PROPOSED_LATE_AFTER_DAYS).length
    await ctx.act({
      recordType: 'Company', recordId: companyId, action: 'WEEKLY_TALLY',
      summary: `Submissions out ${out.length}: confirmed ${n('CONFIRMED')}, awaiting ${n('AWAITING')} (${late} waiting more than ${PROPOSED_LATE_AFTER_DAYS} days, a proposal), failed delivery ${n('FAILED_DELIVERY')}, on hold ${n('BLOCKED')}.`,
    })
  }
}

export const confirmationTrackerAgent: AgentDef = { ruleVersion: CONFIRMATION_RULE, step: confirmationTrackerStep }

export function registerConfirmationTracker(): void { registerAgent(CONFIRMATION_AGENT, confirmationTrackerAgent) }
