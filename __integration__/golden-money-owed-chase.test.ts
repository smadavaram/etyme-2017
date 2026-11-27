/**
 * The money-owed chase's golden snapshot (record 123, plan step 8): what the
 * agent leaves on the seeded world over three days, kept in
 * `golden/money-owed-chase.json`. Monday: two bills past due at one customer,
 * one at a customer nobody can write to, each proposed as one chase with a
 * card owed by Accounts Receivable; a bill with a payment question open is
 * held and said once; a chase that ended with no answer gets one final
 * notice, drafted for a person to send. Tuesday, after a yes on each, one
 * letter goes for each bill that has someone to write to, one card asks for
 * the missing contact, and the final notice is closed as handed to a person,
 * with nothing sent for it. Wednesday one bill is paid in full and its chase
 * closes; the other waits for its reminder. The agent moves onto skills in
 * the next commit and this file must pass unchanged. GOLDEN_WRITE=1 rewrites it.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { prisma, resetDatabase } from './harness'
import { buildGoldenWorld, switchAgent, GOLDEN_MONDAY, GOLDEN_TUESDAY, type GoldenWorld } from './golden-world'
import { addMoneyChaseWorld, GOLDEN_WEDNESDAY } from './golden-world-extras'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { moneyOwedChaseStep, MONEY_OWED_CHASE_AGENT, MONEY_OWED_CHASE_RULES } from '@/lib/money/money-owed-chase'
import { sendMail } from '@/lib/notify/mail-door'
import { captureSnapshot, diffSnapshots, canonical, type GoldenSnapshot } from '@/lib/skills/golden'

process.env.NEXTAUTH_SECRET ||= 'test-secret-for-golden'
process.env.NEXTAUTH_URL = 'https://etyme.example'
for (const k of ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'NOTIFY_FROM_EMAIL']) delete process.env[k]
const KEY = MONEY_OWED_CHASE_AGENT
const FILE = path.join(process.cwd(), '__integration__/golden/money-owed-chase.json')
let w: GoldenWorld
let x: Awaited<ReturnType<typeof addMoneyChaseWorld>>
const sent: string[] = []
const deps = {
  env: { NOTIFY_FROM_EMAIL: 'hello@etyme.example', RESEND_API_KEY: 'k' }, isDemo: () => false,
  hand: async (e: any) => { sent.push(String(e.text ?? e.body ?? '')); return { provider: 'Resend' as const, messageId: 'm' } },
}
const agent = { ruleVersion: MONEY_OWED_CHASE_RULES, step: (ctx: any) => moneyOwedChaseStep(ctx, { send: (m) => sendMail(m, deps as any) }) }
const yes = async (taskId: string) => {
  const t = await prisma.agentTask.findUniqueOrThrow({ where: { id: taskId } })
  await prisma.decisionItem.update({ where: { id: t.decisionId }, data: { state: 'APPROVED', decidedByPersonId: w.am.id, decidedAt: new Date() } })
}

beforeAll(async () => {
  await resetDatabase()
  w = await buildGoldenWorld()
  x = await addMoneyChaseWorld(w)
  await switchAgent(w, KEY, 'ON')
}, 600_000)

describe('the money-owed chase golden snapshot', () => {
  it('on the seeded world over a Monday, the Tuesday after a yes and the Wednesday a bill is paid in full, the money-owed chase leaves exactly the rows kept in its golden file', async () => {
    const since = new Date(Date.now() - 1000)
    registerAgent(KEY, agent)
    await runAgent(KEY, w.firm.id, GOLDEN_MONDAY)
    const open = await prisma.agentTask.findMany({ where: { companyId: w.firm.id, agentKey: KEY, createdAt: { gte: since } }, orderBy: { createdAt: 'asc' } })
    expect(open.map((t) => [t.kind, t.state])).toEqual([['MONEY_OWED_CHASE', 'PROPOSED'], ['MONEY_OWED_CHASE', 'PROPOSED'], ['MONEY_OWED_CHASE', 'PROPOSED'], ['ESCALATION', 'PROPOSED']])
    for (const t of open) await yes(t.id)
    await runAgent(KEY, w.firm.id, GOLDEN_TUESDAY)
    await x.payB()
    await runAgent(KEY, w.firm.id, GOLDEN_WEDNESDAY)
    unregisterAgent(KEY)
    const got = await captureSnapshot(w.firm.id, KEY, since)
    if (process.env.GOLDEN_WRITE === '1') fs.writeFileSync(FILE, JSON.stringify(canonical(got), null, 2) + '\n')
    const kept = JSON.parse(fs.readFileSync(FILE, 'utf8')) as GoldenSnapshot
    expect(diffSnapshots(kept, got)).toEqual([])
    const acts = got.recordActions.map((a) => a.action)
    expect(acts.filter((a) => a === 'MONEY_CHASE_PROPOSED')).toHaveLength(3)
    expect(acts).toContain('MONEY_FINAL_NOTICE_PROPOSED')
    expect(acts.filter((a) => a === 'MONEY_CHASE_HELD')).toHaveLength(1)
    expect(acts.filter((a) => a === 'MONEY_CHASE_SENT')).toHaveLength(2)
    expect(acts).toContain('MONEY_CHASE_NOT_SENT')
    expect(acts).toContain('TASK_CLOSED_BY_ARRIVAL')
    // Two letters left, to the customer's accounts payable contact, and none for the final notice.
    expect(got.mail).toEqual([{ template: 'money-owed-chase', to: 'ap.golden-dunning-customer@example.invalid' }, { template: 'money-owed-chase', to: 'ap.golden-dunning-customer@example.invalid' }])
    expect(sent).toHaveLength(2)
    expect(sent.some((t) => /final notice/i.test(t))).toBe(false)
    expect(got.cards.map((c) => c.owedSeat).every((s) => s === 'Accounts Receivable')).toBe(true)
  })
})
