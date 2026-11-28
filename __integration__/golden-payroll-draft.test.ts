/**
 * The payroll draft agent's golden snapshot (record 123, plan step 8): what
 * the agent leaves on the seeded world over a Monday, the Tuesday after and
 * the Wednesday after another accepted week arrives, kept in
 * `golden/payroll-draft.json`. Monday: October, the one ended month with
 * accepted weeks still to pay, is drafted once and one card goes to AP &
 * Payroll; September was run and is not drafted. Tuesday nothing changed and
 * nothing is written. Wednesday the draft changed, so a new draft replaces
 * the earlier one and a second card is sent. No pay day is marked and no run
 * is logged. The agent moves onto skills in the next commit and this file
 * must pass unchanged. GOLDEN_WRITE=1 rewrites it.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { prisma, resetDatabase } from './harness'
import { buildGoldenWorld, switchAgent, GOLDEN_MONDAY, GOLDEN_TUESDAY, type GoldenWorld } from './golden-world'
import { addPayrollWorld, GOLDEN_WEDNESDAY } from './golden-world-extras'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { payrollDraftAgent, PAYROLL_DRAFT } from '@/lib/agents/payroll-draft'
import { captureSnapshot, diffSnapshots, canonical, type GoldenSnapshot } from '@/lib/skills/golden'

process.env.NEXTAUTH_SECRET ||= 'test-secret-for-golden'
process.env.NEXTAUTH_URL = 'https://etyme.example'
for (const k of ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'NOTIFY_FROM_EMAIL']) delete process.env[k]
const KEY = PAYROLL_DRAFT
const FILE = path.join(process.cwd(), '__integration__/golden/payroll-draft.json')
let w: GoldenWorld
let x: Awaited<ReturnType<typeof addPayrollWorld>>

beforeAll(async () => {
  await resetDatabase()
  w = await buildGoldenWorld()
  x = await addPayrollWorld(w)
  await switchAgent(w, KEY, 'ON')
}, 600_000)

describe('the payroll draft golden snapshot', () => {
  it('on the seeded world over a Monday, the Tuesday after and the Wednesday another accepted week arrives, the payroll draft agent leaves exactly the rows kept in its golden file', async () => {
    const since = new Date(Date.now() - 1000)
    const runsBefore = await prisma.automationLog.count({ where: { companyId: w.firm.id, action: 'PAYROLL_RUN' } })
    const cyclesBefore = await prisma.cycle.count({ where: { completedAt: { not: null } } })
    registerAgent(KEY, payrollDraftAgent)
    await runAgent(KEY, w.firm.id, GOLDEN_MONDAY)
    const first = await prisma.payrollDraft.findMany({ where: { companyId: w.firm.id }, orderBy: { createdAt: 'asc' } })
    await runAgent(KEY, w.firm.id, GOLDEN_TUESDAY)
    await x.moreWeek()
    await runAgent(KEY, w.firm.id, GOLDEN_WEDNESDAY)
    unregisterAgent(KEY)
    const got = await captureSnapshot(w.firm.id, KEY, since)
    if (process.env.GOLDEN_WRITE === '1') fs.writeFileSync(FILE, JSON.stringify(canonical(got), null, 2) + '\n')
    const kept = JSON.parse(fs.readFileSync(FILE, 'utf8')) as GoldenSnapshot
    expect(diffSnapshots(kept, got)).toEqual([])
    expect(got.recordActions.map((a) => a.action)).toEqual(['PAYROLL_DRAFTED', 'PAYROLL_DRAFTED'])
    expect(got.cards.map((c) => c.owedSeat)).toEqual(['AP & Payroll', 'AP & Payroll'])
    // The draft is the run's own figures: kept here beside the rows, since a snapshot holds no draft.
    expect(first).toHaveLength(1)
    expect((first[0].rows as any[]).map((r) => [r.person, r.hours, r.grossPay, r.currency, r.held.length])).toEqual([['Leila Farouk', 160, 1_056_000, 'USD', 0], ['Mo Ito', 0, 0, 'USD', 1]])
    const all = await prisma.payrollDraft.findMany({ where: { companyId: w.firm.id }, orderBy: { createdAt: 'asc' } })
    expect(all.map((d) => d.state)).toEqual(['SUPERSEDED', 'DRAFT'])
    expect(all[1].contentHash).not.toBe(all[0].contentHash)
    // Nothing was run and no pay day was marked.
    expect(await prisma.automationLog.count({ where: { companyId: w.firm.id, action: 'PAYROLL_RUN' } })).toBe(runsBefore)
    expect(await prisma.cycle.count({ where: { completedAt: { not: null } } })).toBe(cyclesBefore)
  })
})
