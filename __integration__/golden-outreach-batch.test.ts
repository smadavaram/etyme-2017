/**
 * The outreach batch's golden snapshot (record 123, plan step 8): what the
 * agent leaves on the seeded world over three days, kept in
 * `golden/outreach-batch.json`, taken with Outreach on. Monday a batch of
 * the check-in offer goes to the three customers that have someone to write
 * to, as one task and one card owed by the Account Manager, and the customer
 * with nobody recorded is held and said so on the batch. Tuesday, after the
 * one yes, each of the three gets its letter. On the Thursday of the
 * following week one contact has said she is interested and one has
 * unsubscribed, so those two stop, and the third gets her first follow-up.
 * The agent moves onto skills in the next change and this file must pass
 * unchanged. GOLDEN_WRITE=1 rewrites it.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { prisma, resetDatabase } from './harness'
import { buildGoldenWorld, switchAgent, GOLDEN_MONDAY, GOLDEN_TUESDAY, type GoldenWorld } from './golden-world'
import { addOutreachBatchWorld } from './golden-world-extras'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { walkOutreachBatches } from '@/lib/agents/outreach-batch'
import { createBatch } from '@/lib/outreach/batch'
import { OUTREACH_BATCH_AGENT, OUTREACH_BATCH_RULE } from '@/lib/outreach/batch-rules'
import { sendMail } from '@/lib/notify/mail-door'
import { captureSnapshot, diffSnapshots, canonical, type GoldenSnapshot } from '@/lib/skills/golden'

process.env.NEXTAUTH_SECRET ||= 'test-secret-for-golden'
process.env.NEXTAUTH_URL = 'https://etyme.example'
for (const k of ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'NOTIFY_FROM_EMAIL']) delete process.env[k]
const KEY = OUTREACH_BATCH_AGENT
const FILE = path.join(process.cwd(), '__integration__/golden/outreach-batch.json')
const THURSDAY_AFTER = new Date('2026-12-03T12:00:00Z')
let w: GoldenWorld
const sent: string[] = []
const deps = {
  env: { NOTIFY_FROM_EMAIL: 'hello@etyme.example', RESEND_API_KEY: 'k' }, isDemo: () => false,
  hand: async (e: any) => { sent.push(String(e.text ?? e.body ?? '')); return { provider: 'Resend' as const, messageId: 'm' } },
}
const agent = { ruleVersion: OUTREACH_BATCH_RULE, step: (ctx: any) => walkOutreachBatches(ctx, { send: (m) => sendMail(m, deps as any) }) }

beforeAll(async () => {
  await resetDatabase()
  w = await buildGoldenWorld()
  await switchAgent(w, KEY, 'ON')
}, 600_000)

describe('the outreach batch golden snapshot', () => {
  it('on the seeded world over a Monday, the Tuesday after a yes and the Thursday of the next week, the outreach batch leaves exactly the rows kept in its golden file', async () => {
    const x = await addOutreachBatchWorld(w)
    const since = new Date(Date.now() - 1000)
    const made = await createBatch({ companyId: w.firm.id, personId: w.owner.id }, {
      audience: 'ALL_CUSTOMERS', offerKind: 'HOT_LIST', offer: { lines: [{ skills: 'Spark, Airflow, SQL', availability: 'from December 8' }] },
      subject: 'Golden Firm: people available for work', body: 'Two data engineers are free from December 8.',
    }, GOLDEN_MONDAY)
    expect(made).toMatchObject({ ok: true, contacts: 3, held: 1 })
    const taskId = (made as { id: string }).id
    const task = await prisma.agentTask.findUniqueOrThrow({ where: { id: taskId } })
    await prisma.decisionItem.update({ where: { id: task.decisionId }, data: { state: 'APPROVED', decidedByPersonId: w.am.id, decidedAt: new Date() } })
    registerAgent(KEY, agent)
    await runAgent(KEY, w.firm.id, GOLDEN_TUESDAY)
    expect(sent).toHaveLength(3)
    await prisma.outreachLetter.updateMany({ where: { agentTaskId: taskId, contactId: x.bea.id }, data: { interestedAt: new Date('2026-11-30T12:00:00Z') } })
    await prisma.companyContact.update({ where: { id: x.gus.id }, data: { outreachOptOutAt: new Date('2026-11-30T12:00:00Z') } })
    await runAgent(KEY, w.firm.id, THURSDAY_AFTER)
    unregisterAgent(KEY)
    const got = await captureSnapshot(w.firm.id, KEY, since)
    if (process.env.GOLDEN_WRITE === '1') fs.writeFileSync(FILE, JSON.stringify(canonical(got), null, 2) + '\n')
    const kept = JSON.parse(fs.readFileSync(FILE, 'utf8')) as GoldenSnapshot
    expect(diffSnapshots(kept, got)).toEqual([])
    const acts = got.recordActions.map((a) => a.action)
    expect(acts.filter((a) => a === 'OUTREACH_LETTER_SENT')).toHaveLength(3)
    expect(acts.filter((a) => a === 'OUTREACH_FOLLOW_UP_SENT')).toHaveLength(1)
    expect(got.mail.every((m) => m.template === 'outreach-batch')).toBe(true)
    expect(got.mail).toHaveLength(4)
    expect(got.cards.map((c) => c.owedSeat)).toEqual(['Account Manager'])
  })
})
