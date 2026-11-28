/** The golden-snapshot harness on the database, through the real runner. */
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { prisma, resetDatabase } from './harness'
import { registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { runAndCapture, diffSnapshots } from '@/lib/skills/golden'

const tag = `gs${Date.now()}`
const KEY = 'golden-test-agent'
const NOW = new Date('2026-11-23T12:00:00Z')
const w: Record<string, any> = {}
let summary = 'Drafted one chase'

beforeAll(async () => {
  await resetDatabase()
  w.firm = await prisma.company.create({ data: { name: `Golden ${tag}`, slug: `golden-${tag}`, kind: 'VENDOR' } })
  w.owner = await prisma.person.create({ data: { name: 'Dana Owner', primaryEmail: `dana.${tag}@example.invalid` } })
  await prisma.agentSwitch.create({ data: { companyId: w.firm.id, agentKey: KEY, state: 'ON', changedById: w.owner.id } })
  registerAgent(KEY, {
    ruleVersion: 'golden-1',
    step: async (ctx) => {
      await ctx.act({ recordType: 'Timesheet', recordId: 't1', action: 'DRAFTED', summary })
      await ctx.act({ recordType: 'Timesheet', recordId: 't2', action: 'DRAFTED', summary: 'Drafted a second chase' })
    },
  })
})
afterEach(async () => { summary = 'Drafted one chase'; await prisma.recordAction.deleteMany({ where: { companyId: w.firm.id } }) })

describe('the golden snapshot on the database', () => {
  it('the same agent run twice on the same world leaves equal snapshots', async () => {
    const a = await runAndCapture(w.firm.id, KEY, NOW)
    await prisma.recordAction.deleteMany({ where: { companyId: w.firm.id } })
    const b = await runAndCapture(w.firm.id, KEY, NOW)
    expect(a.recordActions.map((r) => r.order)).toEqual([1, 2])
    expect(diffSnapshots(a, b)).toEqual([])
  })
  it('a one-row change in what the agent writes is named by the comparison', async () => {
    const a = await runAndCapture(w.firm.id, KEY, NOW)
    await prisma.recordAction.deleteMany({ where: { companyId: w.firm.id } })
    summary = 'Drafted one chase, changed'
    const b = await runAndCapture(w.firm.id, KEY, NOW)
    const d = diffSnapshots(a, b)
    expect(d).toHaveLength(1)
    expect(d[0]).toContain('recordActions row 1')
  })
})
