import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { prisma, resetDatabase } from './harness'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { weeklySummaryAgent, WEEKLY_SUMMARY_AGENT } from '@/lib/agents/weekly-summary'

const tag = `ws${Date.now()}`
const w: Record<string, any> = {}
const at = (s: string) => new Date(`${s}T12:00:00Z`)
const run = (when: Date) => { registerAgent(WEEKLY_SUMMARY_AGENT, weeklySummaryAgent); return runAgent(WEEKLY_SUMMARY_AGENT, w.firm.id, when) }
const lines = () => prisma.recordAction.findMany({ where: { companyId: w.firm.id, agentKey: WEEKLY_SUMMARY_AGENT, action: 'WEEKLY_SUMMARY' } })
const cards = () => prisma.decisionItem.findMany({ where: { companyId: w.firm.id, question: { startsWith: 'This week: ' } } })

beforeAll(async () => {
  await resetDatabase()
  w.firm = await prisma.company.create({ data: { name: `Summary Firm ${tag}`, slug: `summary-firm-${tag}`, kind: 'VENDOR' } as any })
  await prisma.legalEntity.create({ data: { companyId: w.firm.id, name: 'Summary Firm LLC', country: 'US', currency: 'USD' } })
  const role = await prisma.role.create({ data: { companyId: w.firm.id, name: 'Owner', permissions: ['*'] } })
  w.owner = await prisma.person.create({ data: { name: 'Dana Owner', primaryEmail: `dana.${tag}@example.invalid` } })
  await prisma.context.create({ data: { personId: w.owner.id, companyId: w.firm.id, type: 'EMPLOYEE', roleId: role.id } as any })
  await prisma.agentSwitch.create({ data: { companyId: w.firm.id, agentKey: WEEKLY_SUMMARY_AGENT, state: 'DRAFT_ONLY', changedById: w.owner.id } })
}, 600_000)
afterEach(() => unregisterAgent(WEEKLY_SUMMARY_AGENT))

describe('the weekly summary, on the record', () => {
  it('on a day that is not Monday it writes nothing and opens no card', async () => {
    await run(at('2026-11-24'))
    expect(await lines()).toHaveLength(0)
    expect(await cards()).toHaveLength(0)
  })
  it('on Monday it writes one line and one card to the Owner, and sends no mail', async () => {
    await run(at('2026-11-23'))
    expect(await lines()).toHaveLength(1)
    const c = await cards()
    expect(c).toHaveLength(1)
    expect(c[0].ownerPersonId).toBe(w.owner.id)
    expect(await prisma.mailSend.count({ where: { companyId: w.firm.id } })).toBe(0)
  })
  it('a second run the same Monday writes no second line and no second card', async () => {
    await run(at('2026-11-23'))
    expect(await lines()).toHaveLength(1)
    expect(await cards()).toHaveLength(1)
  })
  it('a firm with nothing on its record reads zero hours and no customers, never a made-up figure', async () => {
    expect((await lines())[0].summary).toContain('0 customers active, 0 dormant')
    expect((await lines())[0].summary).toContain('0 hours waiting for acceptance')
  })
})
