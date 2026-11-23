/**
 * Chain 7 of record 112, through the real routes and the real database:
 * the switch, the runner, the daily cap, the per-task approval record and
 * the mail door's gate. Builds its own firm.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { prisma, resetDatabase, as, req, json } from './harness'
import * as agents from '@/app/api/decision-items/agents/route'
import * as item from '@/app/api/decision-items/[id]/route'
import { decideBody } from '@/lib/decision-queue'
import { runAgent, runAllAgents, registerAgent, unregisterAgent, actsToday } from '@/lib/agents/runner'
import { proposeTask, approvalOf, mayAgentSend, closeTask, type TaskPlan } from '@/lib/agents/tasks'
import { sendMail } from '@/lib/notify/mail-door'

const tag = `ag${Date.now()}`
const w: Record<string, any> = {}
const mail = (n: string) => `${n}.${tag}@example.invalid`
const p = (id: string) => ({ params: Promise.resolve({ id }) })
const KEY = 'chase-and-reconciliation'
const OTHER = 'census-keeper'
const PLAN: TaskPlan = { messages: [{ template: 'timesheet-chase', label: 'Timesheet reminder' }], retries: 1, daysApart: 2, closesWhen: 'the timesheet arrives' }
const env = { NOTIFY_FROM_EMAIL: 'hello@etyme.example', RESEND_API_KEY: 'k' }
const sent: string[] = []
const deps = { env, isDemo: () => false, hand: async () => { sent.push('x'); return { provider: 'Resend' as const, messageId: 'm' } } }

const switchTo = async (agentKey: string, state: string, dailyCap?: number | null) => {
  as(w.owner.primaryEmail)
  return json(await agents.PATCH(req('PATCH', '/api/decision-items/agents', { agentKey, state, actingEntityId: w.entity.id, ...(dailyCap !== undefined ? { dailyCap } : {}) })))
}
const propose = (recordId: string, extra: Record<string, unknown> = {}) => proposeTask({
  companyId: w.firm.id, agentKey: KEY, kind: 'TIMESHEET_CHASE', recordType: 'MoneyChain', recordId, plan: PLAN,
  ownerPersonId: w.owner.id, question: `Chase the missing timesheet for ${recordId}?`, ...extra,
} as any)
const say = async (decisionId: string, verdict: 'APPROVE' | 'REJECT') => {
  as(w.owner.primaryEmail)
  return json(await item.POST(req('POST', `/api/decision-items/${decisionId}`, decideBody(verdict, verdict === 'REJECT' ? 'Not this one.' : '', w.entity.id)), p(decisionId)))
}
const mailAbout = (taskId: string | null, recordId: string, extra: Record<string, unknown> = {}) => ({
  to: 'someone@example.invalid', subject: 'Your timesheet', text: 'Please file it.',
  about: { companyId: w.firm.id, agentKey: KEY, agentTaskId: taskId, recordType: 'MoneyChain', recordId, template: 'timesheet-chase', ...extra },
})

beforeAll(async () => {
  await resetDatabase()
  w.firm = await prisma.company.create({ data: { name: `Agent Firm ${tag}`, slug: `agent-firm-${tag}`, kind: 'VENDOR' } })
  w.entity = await prisma.legalEntity.create({ data: { companyId: w.firm.id, name: 'Agent Firm LLC', country: 'US', currency: 'USD' } })
  const role = (name: string, permissions: string[]) => prisma.role.create({ data: { companyId: w.firm.id, name, permissions } })
  const ownerRole = await role('Owner', ['*']); const adminRole = await role('Admin', ['settings.manage', 'people.manage'])
  const person = (n: string) => prisma.person.create({ data: { name: n, primaryEmail: mail(n.toLowerCase().replace(/\s/g, '.')) } })
  w.owner = await person('Dana Owner'); w.admin = await person('Ivo Admin')
  await prisma.context.create({ data: { personId: w.owner.id, companyId: w.firm.id, type: 'EMPLOYEE', roleId: ownerRole.id } as any })
  await prisma.context.create({ data: { personId: w.admin.id, companyId: w.firm.id, type: 'EMPLOYEE', roleId: adminRole.id } as any })
})
afterEach(() => { unregisterAgent(KEY); unregisterAgent(OTHER); sent.length = 0 })

describe('the agent switch, through its route', () => {
  it('every agent is off until the Owner switches it on, and an Admin cannot', async () => {
    as(w.admin.primaryEmail)
    const view = await json(await agents.GET(req('GET', '/api/decision-items/agents')))
    expect(view.body.data.agents.map((a: any) => a.state)).toEqual(Array(13).fill('Off').map((x, i) => (i === 1 ? 'Not live yet' : x)))
    expect(view.body.data.canSwitch).toBe(false)
    const denied = await json(await agents.PATCH(req('PATCH', '/api/decision-items/agents', { agentKey: KEY, state: 'ON', actingEntityId: w.entity.id })))
    expect(denied.status).toBe(403)
    expect(denied.body.error.message).toMatch(/Only the firm’s Owner/)
    expect(await prisma.agentSwitch.count({ where: { companyId: w.firm.id } })).toBe(0)
  })

  it('the Owner switches an agent to drafts only and the change is on the ledger under her own name', async () => {
    const res = await switchTo(KEY, 'DRAFT_ONLY')
    expect(res.status).toBe(200)
    const row = await prisma.recordAction.findFirstOrThrow({ where: { companyId: w.firm.id, action: 'SWITCH_CHANGED' } })
    expect([row.personId, row.summary]).toEqual([w.owner.id, 'Set Chase and reconciliation to Drafts only.'])
  })

  it('a firm with exactly one legal entity changes a switch without being asked which entity, and the row is for that entity', async () => {
    as(w.owner.primaryEmail)
    const res = await json(await agents.PATCH(req('PATCH', '/api/decision-items/agents', { agentKey: KEY, state: 'DRAFT_ONLY' })))
    expect(res.status).toBe(200)
    const row = await prisma.recordAction.findFirstOrThrow({ where: { companyId: w.firm.id, action: 'SWITCH_CHANGED' }, orderBy: { createdAt: 'desc' } })
    expect(row.actingEntityId).toBe(w.entity.id)
  })

  it('a firm with several legal entities cannot change a switch without saying which entity it is made for', async () => {
    const second = await prisma.legalEntity.create({ data: { companyId: w.firm.id, name: 'Agent Firm Two LLC', country: 'US', currency: 'USD' } })
    try {
      as(w.owner.primaryEmail)
      const res = await json(await agents.PATCH(req('PATCH', '/api/decision-items/agents', { agentKey: KEY, state: 'ON' })))
      expect(res.status).toBe(422)
    } finally { await prisma.legalEntity.delete({ where: { id: second.id } }) }
  })
})

describe('the runner', () => {
  it('an agent that is off does nothing and writes why', async () => {
    await switchTo(OTHER, 'OFF')
    let called = 0
    registerAgent(OTHER, { ruleVersion: 'v1', step: async () => { called++ } })
    const out = await runAgent(OTHER, w.firm.id)
    expect([out.ran, called]).toEqual([false, 0])
    expect(out.why).toMatch(/Census keeper is off, so it did nothing/)
    const why = await prisma.recordAction.findFirstOrThrow({ where: { companyId: w.firm.id, agentKey: OTHER, action: 'NOT_RUN' } })
    expect([why.heldAs, why.actingEntityId]).toEqual(['agent', w.entity.id])
  })

  it('an agent never switched on at all does nothing', async () => {
    registerAgent('digest-scanner', { ruleVersion: 'v1', step: async () => { throw new Error('must not run') } })
    const out = await runAgent('digest-scanner', w.firm.id)
    expect(out.ran).toBe(false)
    unregisterAgent('digest-scanner')
  })

  it('every act an agent does is on the ledger as the agent, with its rule version, its entity and no human’s role', async () => {
    await switchTo(KEY, 'ON')
    registerAgent(KEY, { ruleVersion: 'chase-rules-3', step: async (ctx) => { await ctx.act({ recordType: 'MoneyChain', recordId: 'mc-1', action: 'CHECKED', summary: 'Checked the week.' }) } })
    const out = await runAgent(KEY, w.firm.id)
    expect([out.ran, out.acts]).toEqual([true, 1])
    const row = await prisma.recordAction.findFirstOrThrow({ where: { companyId: w.firm.id, action: 'CHECKED' } })
    expect([row.agentKey, row.ruleVersion, row.heldAs, row.actingEntityId]).toEqual([KEY, 'chase-rules-3', 'agent', w.entity.id])
  })

  it('an agent stops at its daily cap and says so, and the control view reads “N of M today”', async () => {
    await switchTo(KEY, 'ON', 2)
    const before = await actsToday(w.firm.id, KEY, new Date())
    registerAgent(KEY, { ruleVersion: 'v1', step: async (ctx) => { for (let i = 0; i < 5; i++) await ctx.act({ recordType: 'MoneyChain', recordId: `cap-${i}`, action: 'CHECKED', summary: 'Checked.' }) } })
    const out = await runAgent(KEY, w.firm.id)
    expect(out.why).toMatch(/reached its cap of 2 for today/)
    expect(await actsToday(w.firm.id, KEY, new Date())).toBe(2)
    expect(before).toBeLessThanOrEqual(2)
    const again = await runAgent(KEY, w.firm.id)
    expect([again.ran, again.acts]).toEqual([false, 0])
    expect(await prisma.recordAction.count({ where: { companyId: w.firm.id, agentKey: KEY, action: 'STOPPED_AT_CAP' } })).toBeGreaterThanOrEqual(2)
    as(w.owner.primaryEmail)
    const view = await json(await agents.GET(req('GET', '/api/decision-items/agents')))
    expect(view.body.data.agents.find((a: any) => a.key === KEY).cap).toBe('2 of 2 today')
    await switchTo(KEY, 'ON', null)
  })

  it('a step that writes two rows a unit stops cleanly at its cap, never past it, and writes one stopped-at-its-cap row', async () => {
    await switchTo(OTHER, 'ON', 3)
    registerAgent(OTHER, {
      ruleVersion: 'v1',
      step: async (ctx) => {
        for (let i = 0; i < 5; i++) {
          if (!(await ctx.mayAct(2))) return
          await ctx.act({ recordType: 'MoneyChain', recordId: `unit-${i}-a`, action: 'CHECKED', summary: 'First row of the unit.' })
          await ctx.act({ recordType: 'MoneyChain', recordId: `unit-${i}-b`, action: 'CHECKED', summary: 'Second row of the unit.' })
        }
      },
    })
    const out = await runAgent(OTHER, w.firm.id)
    expect(out.why).toMatch(/reached its cap of 3 for today/)
    expect(await actsToday(w.firm.id, OTHER, new Date())).toBe(2)
    expect(await prisma.recordAction.count({ where: { companyId: w.firm.id, agentKey: OTHER, action: 'STOPPED_AT_CAP' } })).toBe(1)
    await switchTo(OTHER, 'OFF', null)
  })

  it('an agent with no cap is always allowed to act', async () => {
    await switchTo(OTHER, 'ON', null)
    let allowed: boolean | null = null
    registerAgent(OTHER, { ruleVersion: 'v1', step: async (ctx) => { allowed = await ctx.mayAct(50) } })
    const out = await runAgent(OTHER, w.firm.id)
    expect([out.why, allowed]).toEqual([null, true])
    await switchTo(OTHER, 'OFF', null)
  })

  it('one agent’s failure does not stop another’s run, and the failure is a ledger row and an incident', async () => {
    await switchTo(KEY, 'ON'); await switchTo(OTHER, 'ON')
    registerAgent(KEY, { ruleVersion: 'v1', step: async () => { throw new Error('the chase broke') } })
    let ran = false
    registerAgent(OTHER, { ruleVersion: 'v1', step: async () => { ran = true } })
    const out = await runAllAgents()
    expect(ran).toBe(true)
    expect(out.broke.map((b) => b.agentKey)).toContain(KEY)
    expect(out.ran.map((r) => r.agentKey)).toContain(OTHER)
    expect(await prisma.recordAction.count({ where: { companyId: w.firm.id, agentKey: KEY, action: 'FAILED' } })).toBe(1)
    expect(await prisma.incident.count({ where: { where: `agents/${KEY}`, companyId: w.firm.id } })).toBeGreaterThanOrEqual(1)
  })
})

describe('the per-task approval record', () => {
  it('an agent in drafts only prepares a task and sends nothing even after a yes', async () => {
    await switchTo(KEY, 'DRAFT_ONLY')
    const task = await propose('mc-draft')
    expect((await approvalOf(task.id)).verdict).toBe('OPEN')
    expect((await say(task.decisionId, 'APPROVE')).status).toBe(200)
    expect((await approvalOf(task.id)).task.state).toBe('APPROVED')
    const door = await sendMail(mailAbout(task.id, 'mc-draft'), deps)
    expect([door.outcome, sent.length]).toEqual(['REFUSED', 0])
    expect(door.note).toMatch(/drafts only/)
  })

  it('a task opens a card for a named seat, with its plan in plain words as proof and a link to the task', async () => {
    await switchTo(KEY, 'ON')
    const task = await propose('mc-card')
    const card = await prisma.decisionItem.findUniqueOrThrow({ where: { id: task.decisionId } })
    expect(card.ownerPersonId).toBe(w.owner.id)
    expect(card.proof).toMatch(/sends “Timesheet reminder”/)
    expect(card.proofLinks).toEqual([{ recordType: 'AgentTask', recordId: task.id }])
  })

  it('a task waits for its yes: nothing is sent before a person approves it, and a no refuses it for good', async () => {
    const task = await propose('mc-wait')
    expect((await mayAgentSend(task.id, { companyId: w.firm.id, agentKey: KEY, recordType: 'MoneyChain', recordId: 'mc-wait', template: 'timesheet-chase', attempt: 1 })).ok).toBe(false)
    await say(task.decisionId, 'REJECT')
    expect((await approvalOf(task.id)).task.state).toBe('REFUSED')
    const door = await sendMail(mailAbout(task.id, 'mc-wait'), deps)
    expect([door.outcome, sent.length]).toEqual(['REFUSED', 0])
  })

  it('one yes releases the whole task, its retry and its closing, and the sends are on the mail ledger tied to the task', async () => {
    const task = await propose('mc-run')
    await say(task.decisionId, 'APPROVE')
    const first = await sendMail(mailAbout(task.id, 'mc-run'), deps)
    const retry = await sendMail(mailAbout(task.id, 'mc-run', { agentAttempt: 2 }), deps)
    expect([first.outcome, retry.outcome]).toEqual(['SENT', 'SENT'])
    const run = await prisma.agentTask.findUniqueOrThrow({ where: { id: task.id } })
    expect([run.state, run.sentCount, run.approvedById]).toEqual(['RUNNING', 2, w.owner.id])
    expect(await prisma.mailSend.count({ where: { agentTaskId: task.id, outcome: 'SENT' } })).toBe(2)
    expect(await closeTask(task.id, 'The timesheet arrived.', 'CLOSED_BY_ARRIVAL')).toBe(true)
    expect((await prisma.agentTask.findUniqueOrThrow({ where: { id: task.id } })).state).toBe('CLOSED_BY_ARRIVAL')
    expect(await closeTask(task.id, 'Again.', 'DONE')).toBe(false)
    const after = await sendMail(mailAbout(task.id, 'mc-run'), deps)
    expect(after.outcome).toBe('REFUSED')
  })

  it('a retry beyond the approved plan is refused at the mail door and needs a new task', async () => {
    const task = await propose('mc-beyond')
    await say(task.decisionId, 'APPROVE')
    const third = await sendMail(mailAbout(task.id, 'mc-beyond', { agentAttempt: 3 }), deps)
    expect(third.outcome).toBe('REFUSED')
    expect(third.note).toMatch(/beyond the retries/)
    const unplanned = await sendMail(mailAbout(task.id, 'mc-beyond', { template: 'final-notice' }), deps)
    expect(unplanned.note).toMatch(/not in the approved plan/)
    expect(sent.length).toBe(0)
  })

  it('approval of one task never lets the agent send for another', async () => {
    const a = await propose('mc-a'); const b = await propose('mc-b')
    await say(a.decisionId, 'APPROVE')
    const forB = await sendMail(mailAbout(a.id, 'mc-b'), deps)
    expect(forB.note).toMatch(/approved for another record/)
    const bUnapproved = await sendMail(mailAbout(b.id, 'mc-b'), deps)
    expect(bUnapproved.note).toMatch(/waiting for a yes/)
    expect(sent.length).toBe(0)
  })

  it('an escalation is its own task with its own yes and its parent’s id, and the parent’s yes does not release it', async () => {
    const parent = await propose('mc-esc')
    await say(parent.decisionId, 'APPROVE')
    const esc = await propose('mc-esc', { parentTaskId: parent.id, kind: 'WHATEVER', plan: { messages: [{ template: 'final-notice' }], retries: 0, daysApart: 0, closesWhen: 'the timesheet arrives' } })
    expect([esc.kind, esc.parentTaskId]).toEqual(['ESCALATION', parent.id])
    expect(esc.decisionId).not.toBe(parent.decisionId)
    const before = await sendMail(mailAbout(esc.id, 'mc-esc', { template: 'final-notice' }), deps)
    expect(before.note).toMatch(/waiting for a yes/)
    const asParent = await sendMail(mailAbout(parent.id, 'mc-esc', { template: 'final-notice' }), deps)
    expect(asParent.note).toMatch(/not in the approved plan/)
    await say(esc.decisionId, 'APPROVE')
    expect((await sendMail(mailAbout(esc.id, 'mc-esc', { template: 'final-notice' }), deps)).outcome).toBe('SENT')
  })

  it('switching an agent off stops a running task’s next send at once', async () => {
    const task = await propose('mc-kill')
    await say(task.decisionId, 'APPROVE')
    expect((await sendMail(mailAbout(task.id, 'mc-kill'), deps)).outcome).toBe('SENT')
    await switchTo(KEY, 'OFF')
    const next = await sendMail(mailAbout(task.id, 'mc-kill', { agentAttempt: 2 }), deps)
    expect([next.outcome, sent.length]).toEqual(['REFUSED', 1])
    expect(next.note).toMatch(/is off/)
    await switchTo(KEY, 'ON')
  })

  it('an agent’s send that names no task is refused in a sentence, and the refusal is on the mail ledger', async () => {
    const door = await sendMail(mailAbout(null, 'mc-none'), deps)
    expect(door.outcome).toBe('REFUSED')
    expect(door.note).toMatch(/names no task/)
    expect(await prisma.mailSend.count({ where: { recordId: 'mc-none', outcome: 'REFUSED', agentKey: KEY } })).toBe(1)
  })

  it('a task cannot be proposed by an agent that is off, and the control view lists tasks waiting for a yes', async () => {
    await switchTo(KEY, 'ON')
    const waiting = await propose('mc-list')
    as(w.owner.primaryEmail)
    const view = await json(await agents.GET(req('GET', '/api/decision-items/agents')))
    expect(view.body.data.tasks.find((t: any) => t.id === waiting.id)).toMatchObject({ state: 'PROPOSED', ownerName: 'Dana Owner' })
    await switchTo(KEY, 'OFF')
    await expect(propose('mc-off')).rejects.toThrow(/is off/)
  })
})
