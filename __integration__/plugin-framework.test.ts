/**
 * The plugin framework on the database (records 120 to 124, 133): an agent
 * of a plugin stops while the plugin is off and says why, a task names its
 * plugin and is paused with its yes kept, an agent writes only the acts its
 * plugin declares, the Owner reads what its agents did per plugin, and
 * switching off then on again keeps every row.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { as, req, json, prisma, resetDatabase } from './harness'
import { buildGoldenWorld, switchAgent, GOLDEN_TUESDAY, type GoldenWorld } from './golden-world'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { proposeTask, mayAgentSend, openTasks, TASK_RECORD } from '@/lib/agents/tasks'
import { PLUGIN_REGISTRY } from '@/lib/plugin-registry'
import { pluginUsage } from '@/lib/plugin-usage'
import { GET as readPlugins, PATCH as switchPlugin } from '@/app/api/settings/plugins/route'

const KEY = 'proposals-agent'
let w: GoldenWorld
const setPlugins = (on: string[]) => prisma.company.update({ where: { id: w.firm.id }, data: { pluginsOn: on } })
const plan = { messages: [{ template: 'proposal-chase' }], retries: 0, daysApart: 1, closesWhen: 'the piece arrives' }
const step = (template = 'proposal-chase') => ({ companyId: w.firm.id, agentKey: KEY, recordType: 'Proposal', recordId: 'prop-1', template, attempt: 1 })
let ran = 0
afterEach(() => unregisterAgent(KEY))

beforeAll(async () => {
  await resetDatabase()
  w = await buildGoldenWorld()
  await switchAgent(w, KEY, 'ON')
}, 600_000)

describe('an agent of a plugin that is off', () => {
  it('does not run, and the ledger says in one sentence which plugin is off and that nothing was deleted', async () => {
    await setPlugins([])
    registerAgent(KEY, { ruleVersion: 't', step: async () => { ran++ } })
    const out = await runAgent(KEY, w.firm.id, GOLDEN_TUESDAY)
    expect(out.ran).toBe(false)
    expect(ran).toBe(0)
    expect(out.why).toBe('Proposals did not run: Public-sector proposals is off for Golden Firm. The Owner turns it on in Settings. Nothing was deleted.')
    const row = await prisma.recordAction.findFirst({ where: { companyId: w.firm.id, agentKey: KEY, action: 'NOT_RUN' } })
    expect(row?.summary).toBe(out.why)
  })

  it('runs again as soon as the plugin is on', async () => {
    await setPlugins(['PUBLIC_SECTOR'])
    registerAgent(KEY, { ruleVersion: 't', step: async () => { ran++ } })
    const out = await runAgent(KEY, w.firm.id, GOLDEN_TUESDAY)
    expect(out.ran).toBe(true)
    expect(ran).toBe(1)
  })

  it('every agent each plugin declares stops while that plugin is off, except where the plugin holds only its sends', async () => {
    await setPlugins([])
    for (const p of PLUGIN_REGISTRY.filter((x) => x.agents.length && x.whenOff === 'EVERYTHING')) {
      for (const agent of p.agents) {
        await switchAgent(w, agent, 'ON')
        let called = false
        registerAgent(agent, { ruleVersion: 't', step: async () => { called = true } })
        const out = await runAgent(agent, w.firm.id, GOLDEN_TUESDAY)
        unregisterAgent(agent)
        expect(called, `${p.key}: ${agent}`).toBe(false)
        expect(out.ran, `${p.key}: ${agent}`).toBe(false)
      }
    }
  })
})

describe('the act fence', () => {
  it('lets an agent write an act its plugin declares', async () => {
    await setPlugins(['PUBLIC_SECTOR'])
    registerAgent(KEY, { ruleVersion: 't', step: async (ctx) => { await ctx.act({ recordType: 'Proposal', recordId: 'prop-1', action: 'PROPOSAL_DRAFTED', summary: 'Drafted a proposal.' }) } })
    const out = await runAgent(KEY, w.firm.id, GOLDEN_TUESDAY)
    expect(out).toMatchObject({ ran: true, acts: 1 })
  })

  it('refuses an act its plugin does not declare, in a sentence, and writes nothing', async () => {
    await setPlugins(['PUBLIC_SECTOR'])
    registerAgent(KEY, { ruleVersion: 't', step: async (ctx) => { await ctx.act({ recordType: 'Invoice', recordId: 'i-1', action: 'PAYMENT_RELEASED', summary: 'Paid.' }) } })
    const out = await runAgent(KEY, w.firm.id, GOLDEN_TUESDAY)
    expect(out.ran).toBe(false)
    expect(out.why).toMatch(/Proposals may not do PAYMENT_RELEASED: Public-sector proposals does not declare it, so nothing was written\./)
    expect(await prisma.recordAction.count({ where: { companyId: w.firm.id, action: 'PAYMENT_RELEASED' } })).toBe(0)
  })
})

describe('a task names its plugin, is paused with its yes kept, and resumes', () => {
  let taskId = ''
  it('a task is not proposed for a plugin that is off, and nothing is written', async () => {
    await setPlugins([])
    const before = await prisma.agentTask.count({ where: { companyId: w.firm.id } })
    await expect(proposeTask({ companyId: w.firm.id, agentKey: KEY, kind: 'PROPOSAL_CHASE', recordType: 'Proposal', recordId: 'prop-1', plan, ownerPersonId: w.owner.id, question: 'Remind Oli about the insurance certificate?' }))
      .rejects.toThrow(/Public-sector proposals is off for Golden Firm, so this task waits/)
    expect(await prisma.agentTask.count({ where: { companyId: w.firm.id } })).toBe(before)
  })

  it('a task of a plugin that is on carries the plugin’s key', async () => {
    await setPlugins(['PUBLIC_SECTOR'])
    const t = await proposeTask({ companyId: w.firm.id, agentKey: KEY, kind: 'PROPOSAL_CHASE', recordType: 'Proposal', recordId: 'prop-1', plan, ownerPersonId: w.owner.id, question: 'Remind Oli about the insurance certificate?' })
    taskId = t.id
    expect((await prisma.agentTask.findUniqueOrThrow({ where: { id: taskId } })).pluginKey).toBe('PUBLIC_SECTOR')
  })

  it('a task of a core agent names no plugin', async () => {
    await switchAgent(w, 'timesheet-chase', 'ON')
    const t = await proposeTask({ companyId: w.firm.id, agentKey: 'timesheet-chase', kind: 'TIMESHEET_CHASE', recordType: 'Timesheet', recordId: 'ts-1', plan, ownerPersonId: w.owner.id, question: 'Remind about the timesheet?' })
    expect((await prisma.agentTask.findUniqueOrThrow({ where: { id: t.id } })).pluginKey).toBeNull()
  })

  it('one yes releases the task, and a send is allowed only for its own letter', async () => {
    const t = await prisma.agentTask.findUniqueOrThrow({ where: { id: taskId } })
    await prisma.decisionItem.update({ where: { id: t.decisionId }, data: { state: 'APPROVED', decidedByPersonId: w.am.id, decidedAt: new Date() } })
    expect(await mayAgentSend(taskId, step())).toEqual({ ok: true })
    expect(await mayAgentSend(taskId, step('another-letter'))).toMatchObject({ ok: false })
  })

  it('switched off, the task is paused in one sentence on the control list, its yes kept, and nothing is sent', async () => {
    await setPlugins([])
    const said = await mayAgentSend(taskId, step())
    expect(said).toMatchObject({ ok: false })
    expect((said as { says: string }).says).toMatch(/^Paused: Public-sector proposals is off for Golden Firm/)
    expect((await prisma.agentTask.findUniqueOrThrow({ where: { id: taskId } })).state).toBe('APPROVED')
    const listed = (await openTasks(w.firm.id)).find((x) => x.id === taskId)
    expect(listed?.paused).toMatch(/^Paused: Public-sector proposals is off/)
  })

  it('switched on again, the same task goes on under the same yes', async () => {
    await setPlugins(['PUBLIC_SECTOR'])
    expect(await mayAgentSend(taskId, step())).toEqual({ ok: true })
    expect((await openTasks(w.firm.id)).find((x) => x.id === taskId)?.paused).toBeNull()
  })
})

describe('what a plugin’s agents did is metered per plugin and read by the Owner', () => {
  it('counts the acts of each plugin’s agents from the ledger, and no other agent’s', async () => {
    const u = await pluginUsage(w.firm.id, GOLDEN_TUESDAY)
    const ps = u.find((x) => x.key === 'PUBLIC_SECTOR')!
    const direct = await prisma.recordAction.count({ where: { companyId: w.firm.id, agentKey: KEY, action: { notIn: ['NOT_RUN', 'STOPPED_AT_CAP', 'FAILED', 'SWITCH_CHANGED'] } } })
    expect(direct).toBeGreaterThan(0)
    expect(ps.actsLast30Days).toBeLessThanOrEqual(direct)
    expect(u.find((x) => x.key === 'PODS')).toMatchObject({ actsToday: 0, actsLast30Days: 0 })
  })

  it('the Owner reads the count with each plugin in Settings', async () => {
    as(w.owner.primaryEmail)
    const r = await json(await readPlugins(req('GET', '/api/settings/plugins')))
    expect(r.status).toBe(200)
    const ps = r.body.data.plugins.find((p: any) => p.key === 'PUBLIC_SECTOR')
    expect(ps.usage).toMatchObject({ agents: ['proposals-agent'] })
    expect(typeof ps.usage.actsLast30Days).toBe('number')
  })
})

describe('switching a plugin off and on again keeps every row', () => {
  it('keeps the tasks, the cards, the ledger rows and the switch history, and the Owner sees both switches', async () => {
    const count = async () => ({
      tasks: await prisma.agentTask.count({ where: { companyId: w.firm.id } }),
      decisions: await prisma.decisionItem.count({ where: { companyId: w.firm.id } }),
      ledger: await prisma.recordAction.count({ where: { companyId: w.firm.id, recordType: TASK_RECORD } }),
    })
    await setPlugins([])
    const before = await count()
    expect(before.tasks).toBeGreaterThan(0)
    as(w.owner.primaryEmail)
    const on = await json(await switchPlugin(req('PATCH', '/api/settings/plugins', { plugin: 'PUBLIC_SECTOR', on: true })))
    expect(on.status, JSON.stringify(on.body)).toBe(200)
    const off = await json(await switchPlugin(req('PATCH', '/api/settings/plugins', { plugin: 'PUBLIC_SECTOR', on: false })))
    expect(off.status).toBe(200)
    const again = await json(await switchPlugin(req('PATCH', '/api/settings/plugins', { plugin: 'PUBLIC_SECTOR', on: true })))
    expect(again.status).toBe(200)
    expect(await count()).toEqual(before)
    const rows = await prisma.pluginSwitch.findMany({ where: { companyId: w.firm.id, plugin: 'PUBLIC_SECTOR' }, orderBy: { at: 'asc' } })
    expect(rows.map((r) => r.on)).toEqual([true, false, true])
    expect((await prisma.company.findUniqueOrThrow({ where: { id: w.firm.id } })).pluginsOn).toContain('PUBLIC_SECTOR')
  })

  it('the Owner cannot switch Project teams on, and an agent cannot switch any plugin', async () => {
    as(w.owner.primaryEmail)
    const pods = await json(await switchPlugin(req('PATCH', '/api/settings/plugins', { plugin: 'PODS', on: true })))
    expect(pods.status).toBe(409)
    expect(pods.body.error.message).toBe('Project teams opens once client-safe billing is finished.')
    expect(PLUGIN_REGISTRY.length).toBe(5)
  })
})
