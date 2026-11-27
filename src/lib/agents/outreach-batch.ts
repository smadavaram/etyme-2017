/**
 * The outreach batch (record 117, step 4; record 116). Key `outreach-batch`.
 *
 * The batch is raised by a person from Companies, Outreach (`lib/outreach/
 * batch`): one task, one card, one yes. This agent walks every released
 * batch on each run. With the agent On, each contact's letter goes through
 * the mail door as its own email with one To; a follow-up goes five working
 * days after the one before, twice at most. On Drafts only nothing is sent,
 * even after the yes. Before each send the contact is read again: an
 * unsubscribe, an "I'm interested", a bounce, or an address gone stops that
 * letter, and the door and the task ledger still refuse anything beyond the
 * yes. Each send counts one row against the agent's daily cap; what the cap
 * does not allow today stays ready for the next run. It never reads a
 * mailbox, and the links in the letters are signed and never kept.
 */

import { prisma } from '@/lib/db'
import { baseUrl } from '@/lib/signed-link'
import { publicSite } from '@/lib/public-site'
import { sendMail, mailSendsAboutMany } from '@/lib/notify/mail-door'
import { unsubscribeUrlFor } from '@/lib/notify/outreach-optout'
import { interestedUrlFor } from '@/lib/notify/outreach-interest'
import { postalLine } from './dormant-outreach-rules'
import { TASK_RECORD, approvalOf, closeTask, mayAgentSend, outreachPause } from './tasks'
import { registerPlan } from './plans'
import { runSkill } from '@/lib/skills/runner'
import { registerAgent, type AgentContext, type AgentDef } from './runner'
import {
  OUTREACH_BATCH_AGENT, OUTREACH_BATCH_KIND, OUTREACH_BATCH_RULE, OUTREACH_BATCH_TEMPLATE, OUTREACH_LETTER_TYPE,
  batchBlock, buildLetter, letterDue, letterOpen, settleLetter, stopFor,
} from '@/lib/outreach/batch-rules'

// The skill this agent runs (record 123). The batch is raised by a person from Companies, Outreach, so the agent only sends.
registerPlan({ agentKey: OUTREACH_BATCH_AGENT, skills: ['chase.send'], outputSkill: 'chase.send' })

const OPEN = ['PROPOSED', 'APPROVED', 'RUNNING'] as const

async function postalOf(companyId: string): Promise<string | null> {
  const rows = await prisma.companyAddress.findMany({ where: { companyId } })
  return postalLine(rows.find((a) => a.kind === 'LEGAL') ?? rows.find((a) => a.kind === 'BILLING') ?? null)
}

export async function walkOutreachBatches(ctx: AgentContext, deps: { send?: typeof sendMail } = {}): Promise<void> {
  const send = deps.send ?? sendMail
  const { companyId, now } = ctx
  const tasks = await prisma.agentTask.findMany({
    where: { companyId, agentKey: ctx.agentKey, kind: OUTREACH_BATCH_KIND, state: { in: [...OPEN] } }, orderBy: { createdAt: 'asc' },
  })
  if (tasks.length === 0) return
  const firm = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true, slug: true } })
  const postal = await postalOf(companyId)
  for (const t0 of tasks) {
    const { task } = await approvalOf(t0.id)
    if (task.state !== 'APPROVED' && task.state !== 'RUNNING') continue // nothing is sent before a person's yes
    if (ctx.mode !== 'ON') continue // Drafts only: nothing is sent, even after a yes.
    if (await outreachPause(task)) continue // Outreach is off: the batch waits under its yes (record 123, answer 5)
    const block = batchBlock({ postal, base: baseUrl() })
    if (block || !postal || !firm) { await closeTask(task.id, `${block?.says ?? 'The firm has no postal address on record.'} Nothing more is sent.`, 'STOPPED'); continue }
    const payload = (task.payload ?? {}) as { subject?: string; body?: string }
    if (!payload.subject || !payload.body) { await closeTask(task.id, 'The batch has no letter written down, so nothing is sent.', 'STOPPED'); continue }
    let storefront: string | null = null
    try { storefront = (await publicSite(firm.slug)) ? `${baseUrl()}/site/${firm.slug}` : null } catch { storefront = null }

    const letters = await prisma.outreachLetter.findMany({ where: { agentTaskId: task.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
    const contacts = await prisma.companyContact.findMany({ where: { id: { in: letters.map((l) => l.contactId) } }, select: { id: true, name: true, email: true, companyId: true, outreachOptOutAt: true } })
    const byId = new Map(contacts.map((c) => [c.id, c]))
    const names = new Map((await prisma.company.findMany({ where: { id: { in: letters.map((l) => l.atCompanyId) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]))
    const sends = letters.length ? await mailSendsAboutMany(companyId, OUTREACH_LETTER_TYPE, letters.map((l) => l.id)) : []
    const bouncedLetters = new Set(sends.filter((s) => s.outcome === 'FAILED_DELIVERY').map((s) => s.recordId))
    // An address that bounced in any letter of this batch or an earlier one is left alone.
    const bouncedEmails = new Set(letters.filter((l) => bouncedLetters.has(l.id)).map((l) => l.email.trim().toLowerCase()))

    for (const l of letters) {
      const stop = async (reason: string) => { await prisma.outreachLetter.updateMany({ where: { id: l.id, state: { not: 'STOPPED' } }, data: { state: 'STOPPED', stoppedReason: reason, nextDueAt: null } }) }
      if (!letterOpen(l)) continue
      const due = letterDue(l, now)
      if (!due) continue
      const c = byId.get(l.contactId)
      const email = c?.email?.trim() ?? ''
      const why = stopFor(l, {
        optedOut: c?.outreachOptOutAt != null, interested: l.interestedAt !== null,
        bounced: bouncedLetters.has(l.id) || bouncedEmails.has(email.toLowerCase()),
        reachable: !!c && c.companyId === companyId && email !== '' && email.toLowerCase() === l.email.trim().toLowerCase(),
      })
      if (why) { await stop(why); continue }
      // The task's own yes is read again before every send; a refusal ends this batch's turn.
      const may = await mayAgentSend(task.id, { companyId, agentKey: ctx.agentKey, recordType: OUTREACH_LETTER_TYPE, recordId: l.id, template: OUTREACH_BATCH_TEMPLATE, attempt: l.attempt + 1 })
      if (!may.ok) break
      if (!(await ctx.mayAct(1))) return // the letter and its row are one unit; the rest wait for the next run
      const letter = buildLetter({
        firm: firm.name, postal, recipientName: c!.name, companyName: names.get(l.atCompanyId) ?? 'your company', subject: payload.subject, body: payload.body,
        unsubscribeUrl: unsubscribeUrlFor(l.contactId), interestedUrl: interestedUrlFor(l.id), storefrontUrl: storefront, attempt: l.attempt + 1,
      })
      // Claim the letter first, so two runs at once can never both send it: only the run whose claim moves it sends.
      const claimed = await prisma.outreachLetter.updateMany({ where: { id: l.id, state: l.state, attempt: l.attempt }, data: { attempt: l.attempt + 1, nextDueAt: null } })
      if (claimed.count !== 1) continue
      const { result: res } = await runSkill(ctx, 'chase.send', { recordType: OUTREACH_LETTER_TYPE, recordId: l.id, unitsPlanned: 1 }, async () => ({
        result: await send({
          to: email, subject: letter.subject, text: letter.text,
          about: { companyId, agentKey: ctx.agentKey, agentTaskId: task.id, agentAttempt: l.attempt + 1, recordType: OUTREACH_LETTER_TYPE, recordId: l.id, template: OUTREACH_BATCH_TEMPLATE },
        }),
      }))
      if (res.outcome === 'NOT_CONFIGURED') { // nothing can leave this deployment; the letter is let go and stays as it was
        await prisma.outreachLetter.update({ where: { id: l.id }, data: { attempt: l.attempt, nextDueAt: l.nextDueAt } })
        return
      }
      const next = settleLetter(l, res.outcome, now)
      await prisma.outreachLetter.update({ where: { id: l.id }, data: { state: next.state, attempt: next.attempt, nextDueAt: next.nextDueAt, stoppedReason: next.stoppedReason } })
      const to = `${c!.name} at ${names.get(l.atCompanyId) ?? 'a company'}`
      await ctx.act({
        recordType: TASK_RECORD, recordId: task.id,
        action: res.outcome === 'SENT' ? (due === 'LETTER' ? 'OUTREACH_LETTER_SENT' : 'OUTREACH_FOLLOW_UP_SENT') : 'OUTREACH_LETTER_NOT_SENT',
        summary: res.outcome === 'SENT'
          ? `Sent ${due === 'LETTER' ? 'the outreach letter' : `follow-up ${next.attempt - 1}`} to ${to}.`
          : `The outreach letter to ${to} was not sent: ${res.note}`,
      })
      l.state = next.state; l.attempt = next.attempt; l.nextDueAt = next.nextDueAt
    }

    const fresh = await prisma.outreachLetter.findMany({ where: { agentTaskId: task.id }, select: { state: true, attempt: true, nextDueAt: true } })
    if (!fresh.some(letterOpen)) await closeTask(task.id, 'Every letter has gone, been answered or been stopped. Anything more is a new batch and asks again.', 'DONE')
  }
}

export const outreachBatchAgent: AgentDef = { ruleVersion: OUTREACH_BATCH_RULE, step: (ctx) => walkOutreachBatches(ctx) }

export function registerOutreachBatch(): void { registerAgent(OUTREACH_BATCH_AGENT, outreachBatchAgent) }
