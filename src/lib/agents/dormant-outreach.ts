/**
 * The dormant outreach (record 112, chain 1, "Win work", part B of "Drafts
 * of outreach and chases"; record 116). A step of the census keeper, under
 * its key `census-keeper`. The rules are in `dormant-outreach-rules`.
 *
 * Two parts, each run:
 *  1. For each company that went from active to dormant since last week,
 *     one task and one card for a yes, owed by the Account Manager else the
 *     Owner, holding the plain letter and the person it goes to. The person
 *     is a contact the firm itself recorded at that company, never one who
 *     unsubscribed, never an address that bounced. Where no letter can be
 *     drafted (no contact, everyone unsubscribed, a bounced address, no
 *     postal address for the firm) one card says why, once.
 *  2. Every released task is walked. With the agent On, one letter goes
 *     through the mail door with the task, then the task closes. On Drafts
 *     only nothing is sent, even after a yes. One letter, no reminders.
 *
 * A company is written to once in 180 days per side (a proposal); the
 * older draft cards count, because a card was what this step opened
 * before it could send. This step never writes a register row.
 */

import { prisma } from '@/lib/db'
import { LedgerRefusal } from '@/lib/record-ledger'
import { openDecision } from '@/lib/decision-items'
import { ownerForRoles } from '@/lib/money/agent-owners'
import { sendMail, mailSendsAbout } from '@/lib/notify/mail-door'
import { unsubscribeUrlFor } from '@/lib/notify/outreach-optout'
import { baseUrl } from '@/lib/signed-link'
import { AGENT_HELD_AS, type AgentContext } from './runner'
import type { CensusRow, Side } from './census-rules'
import { TASK_RECORD, approvalOf, closeTask, proposeTask } from './tasks'
import {
  OUTREACH_KINDS, OUTREACH_PLAN, OUTREACH_RECORD, OUTREACH_TEMPLATE, becameDormant, blockedCard, chooseRecipient,
  coolingOffHolds, outreachCard, outreachKind, outreachLetter, outreachPrefix, postalLine, type Block,
} from './dormant-outreach-rules'

const OPEN = ['PROPOSED', 'APPROVED', 'RUNNING'] as const

/** The firm's postal address as one line (legal, else billing); null where none is recorded. */
async function postalOf(companyId: string): Promise<string | null> {
  const rows = await prisma.companyAddress.findMany({ where: { companyId } })
  return postalLine(rows.find((a) => a.kind === 'LEGAL') ?? rows.find((a) => a.kind === 'BILLING') ?? null)
}

/** Addresses this firm's outreach letters bounced on, lower case. A new address is simply not in the set. */
async function bouncedAddresses(companyId: string, contactIds: readonly string[]): Promise<Set<string>> {
  // Read through the mail door's own reader, by firm and record together.
  const rows = (await Promise.all(contactIds.map((id) => mailSendsAbout(companyId, OUTREACH_RECORD, id)))).flat()
  return new Set(rows.filter((r) => r.template === OUTREACH_TEMPLATE && r.outcome === 'FAILED_DELIVERY').flatMap((r) => r.toAddresses.map((a) => a.trim().toLowerCase())))
}

/** The firm's own rolodex at one company: only rows whose owner is the sending firm. */
const rolodexAt = (companyId: string, otherId: string) =>
  prisma.companyContact.findMany({
    where: { companyId, atCompanyId: otherId },
    select: { id: true, name: true, email: true, kind: true, outreachOptOutAt: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })

/** When this company was last written to or drafted for on this side: an old draft card, or a task. */
async function lastOutreachOn(companyId: string, otherId: string, side: Side): Promise<Date | null> {
  const card = await prisma.decisionItem.findFirst({
    where: { companyId, question: { startsWith: outreachPrefix(side) }, proofLinks: { array_contains: [{ recordType: 'Company', recordId: otherId }] } },
    orderBy: { openedOn: 'desc' }, select: { openedOn: true },
  })
  const ids = (await prisma.companyContact.findMany({ where: { companyId, atCompanyId: otherId }, select: { id: true } })).map((c) => c.id)
  const task = ids.length
    ? await prisma.agentTask.findFirst({ where: { companyId, kind: outreachKind(side), recordType: OUTREACH_RECORD, recordId: { in: ids } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } })
    : null
  const dates = [card?.openedOn, task?.createdAt].filter((d): d is Date => !!d)
  return dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null
}

export async function draftDormantOutreach(ctx: AgentContext, census: { before: readonly CensusRow[]; after: readonly CensusRow[] }): Promise<void> {
  const { companyId, now } = ctx
  const gone = becameDormant(census.before, census.after)
  if (gone.length === 0) return
  const sw = await prisma.agentSwitch.findUnique({ where: { companyId_agentKey: { companyId, agentKey: ctx.agentKey } } })
  if (!sw) return
  const owner = await ownerForRoles(companyId, ['Account Manager'], now)
  if (!owner) {
    if (await ctx.mayAct(1)) await ctx.act({ recordType: 'Company', recordId: companyId, action: 'DORMANT_OUTREACH_NO_OWNER', summary: `${gone.length} ${gone.length === 1 ? 'company' : 'companies'} went quiet and no check-in was drafted: no Account Manager or Owner seat is working.` })
    return
  }
  const firm = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } })
  const firmName = firm?.name ?? 'We'
  const entities = await prisma.legalEntity.findMany({ where: { companyId }, select: { id: true } })
  const postal = await postalOf(companyId)
  for (const row of gone) {
    const otherId = row.key.slice(row.key.indexOf(':') + 1)
    const link = { recordType: 'Company', recordId: otherId }
    if (coolingOffHolds(await lastOutreachOn(companyId, otherId, row.side), now)) continue
    if (!(await ctx.mayAct(2))) return // a task writes two counted rows

    const rolodex = await rolodexAt(companyId, otherId)
    const picked = chooseRecipient(rolodex, await bouncedAddresses(companyId, rolodex.map((c) => c.id)), row.side)
    const block: Block | null = !postal ? 'NO_ADDRESS' : !baseUrl() ? 'NO_LINK' : picked.ok ? null : picked.block
    const quiet = { side: row.side, firmName, companyName: row.name, lastActivity: row.lastActivity }

    if (block || !picked.ok || !postal) {
      const card = blockedCard(quiet, block ?? 'NO_CONTACT')
      try {
        await openDecision({
          companyId, personId: sw.changedById, heldAs: AGENT_HELD_AS, actingEntityId: entities.length === 1 ? entities[0].id : null,
          question: card.question, ownerPersonId: owner, openedOn: now, proof: card.proof, proofLinks: [link],
        }, now)
      } catch (e) {
        if (e instanceof LedgerRefusal) continue
        throw e
      }
      await ctx.act({ recordType: 'Company', recordId: otherId, action: 'DORMANT_OUTREACH_NOT_DRAFTED', summary: `No check-in letter was drafted for ${row.name}: ${card.proof.split('\n')[0]}` })
      continue
    }

    const card = outreachCard({ ...quiet, postal, today: now, recipient: picked.to, unsubscribeUrl: null })
    try {
      const task = await proposeTask({
        companyId, agentKey: ctx.agentKey, kind: outreachKind(row.side), recordType: OUTREACH_RECORD, recordId: picked.to.id,
        plan: OUTREACH_PLAN, ownerPersonId: owner, openedOn: now, today: now, question: card.question, detail: card.detail,
        actingEntityId: entities.length === 1 ? entities[0].id : null,
      })
      await ctx.act({ recordType: TASK_RECORD, recordId: task.id, action: 'DORMANT_OUTREACH_PROPOSED', summary: `Drafted a check-in letter for ${row.name} as a ${row.side === 'CUSTOMER' ? 'customer' : 'supplier'}. Nothing is sent until a person says yes.` })
    } catch (e) {
      if (e instanceof LedgerRefusal) continue
      throw e
    }
  }
}

/**
 * Walk every released outreach task. `rows` is today's census, to name the
 * company and say how long it has been quiet; a company that is active again
 * stops its task. Sends only with the agent On, after the yes, once.
 */
export async function walkOutreach(ctx: AgentContext, rows: () => Promise<readonly CensusRow[]>, deps: { send?: typeof sendMail } = {}): Promise<void> {
  const send = deps.send ?? sendMail
  const { companyId, now } = ctx
  const tasks = await prisma.agentTask.findMany({
    where: { companyId, agentKey: ctx.agentKey, kind: { in: OUTREACH_KINDS }, recordType: OUTREACH_RECORD, state: { in: [...OPEN] } },
    orderBy: { createdAt: 'asc' },
  })
  if (tasks.length === 0) return
  let census: readonly CensusRow[] | null = null
  let firm: { name: string } | null = null
  for (const t0 of tasks) {
    const { task } = await approvalOf(t0.id)
    if (task.state !== 'APPROVED' && task.state !== 'RUNNING') continue // nothing is sent before a person's yes
    if (ctx.mode !== 'ON') continue // Drafts only: nothing is sent, even after a yes.
    const side: Side = task.kind === outreachKind('CUSTOMER') ? 'CUSTOMER' : 'SUPPLIER'
    const stop = (why: string) => closeTask(task.id, why, 'STOPPED')

    if ((await mailSendsAbout(companyId, OUTREACH_RECORD, task.recordId)).some((r) => r.agentTaskId === task.id)) {
      await closeTask(task.id, 'The letter was already tried once. It is not sent again; anything more is a new task.', 'DONE'); continue
    }
    const contact = await prisma.companyContact.findUnique({ where: { id: task.recordId }, select: { id: true, name: true, email: true, companyId: true, atCompanyId: true, outreachOptOutAt: true } })
    if (!contact || contact.companyId !== companyId || !contact.email?.trim()) { await stop('The contact is no longer in the firm’s own records with an email, so nothing was sent.'); continue }
    if (contact.outreachOptOutAt) { await stop(`${contact.name} asked for no more outreach, so nothing was sent.`); continue }
    if ((await bouncedAddresses(companyId, [contact.id])).has(contact.email.trim().toLowerCase())) { await stop('The last outreach letter to this address bounced, so nothing was sent. Record a new address first.'); continue }
    census ??= await rows()
    const row = census.find((r) => r.key === `${side}:${contact.atCompanyId}`)
    if (!row || row.standing !== 'DORMANT') { await stop('The company has work with the firm again, or is no longer on its register, so the check-in is stopped.'); continue }
    const postal = await postalOf(companyId)
    const url = unsubscribeUrlFor(contact.id)
    if (!postal) { await stop('The firm has no postal address on record, and every letter must carry one. Add it in Settings, then send the check-in yourself.'); continue }
    if (!url) { await stop('Etyme has no public web address on this deployment, so the letter cannot carry its unsubscribe link. Nothing was sent.'); continue }
    firm ??= await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } })

    if (!(await ctx.mayAct(2))) return // the letter, its row and the close row are one unit
    const letter = outreachLetter({ side, firmName: firm?.name ?? 'We', postal, companyName: row.name, lastActivity: row.lastActivity, today: now, recipient: { name: contact.name }, unsubscribeUrl: url })
    const res = await send({
      to: contact.email.trim(), subject: letter.subject, text: letter.text,
      about: { companyId, agentKey: ctx.agentKey, agentTaskId: task.id, agentAttempt: 1, recordType: OUTREACH_RECORD, recordId: contact.id, template: OUTREACH_TEMPLATE },
    })
    const went = res.outcome === 'SENT'
    await ctx.act({
      recordType: TASK_RECORD, recordId: task.id, action: went ? 'DORMANT_OUTREACH_SENT' : 'DORMANT_OUTREACH_NOT_SENT',
      summary: went ? `Sent the check-in letter to ${contact.name} at ${row.name}.` : `The check-in letter to ${contact.name} at ${row.name} was not sent: ${res.note}`,
    })
    await closeTask(task.id, went ? 'The letter went. One letter, no reminders; anything more is a new task and asks again.' : `No letter could leave: ${res.note} Nothing was sent. A person follows up.`, 'DONE')
  }
}
