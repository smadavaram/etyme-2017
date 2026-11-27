/**
 * The timesheet chase's golden snapshot (record 123, plan step 8): what the
 * agent leaves on the seeded world over three days, kept in
 * `golden/timesheet-chase.json`. Monday: one worker's week that fell due
 * and is not filed is proposed as one chase with one card, one week that
 * fell due long before is listed with its own card for a person, and a
 * filed week and a sub-vendor's worker are left alone. Tuesday, after a yes,
 * the letter is tried once and the mail door says why it did not leave.
 * Wednesday the worker files the week and the chase is closed. The agent
 * moves onto skills in the next commit and this file must pass unchanged.
 * GOLDEN_WRITE=1 rewrites it.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { prisma, resetDatabase } from './harness'
import { buildGoldenWorld, switchAgent, GOLDEN_MONDAY, GOLDEN_TUESDAY, type GoldenWorld } from './golden-world'
import { addTimesheetWorld, GOLDEN_WEDNESDAY, goldenDay } from './golden-world-extras'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { timesheetChaseStep, TIMESHEET_CHASE_AGENT, TIMESHEET_CHASE_RULES } from '@/lib/notify/timesheet-chase-agent'
import { captureSnapshot, diffSnapshots, canonical, type GoldenSnapshot } from '@/lib/skills/golden'

process.env.NEXTAUTH_SECRET ||= 'test-secret-for-golden'
process.env.NEXTAUTH_URL = 'https://etyme.example'
for (const k of ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'NOTIFY_FROM_EMAIL']) delete process.env[k]
const KEY = TIMESHEET_CHASE_AGENT
const FILE = path.join(process.cwd(), '__integration__/golden/timesheet-chase.json')
let w: GoldenWorld
let x: Awaited<ReturnType<typeof addTimesheetWorld>>

beforeAll(async () => {
  await resetDatabase()
  w = await buildGoldenWorld()
  x = await addTimesheetWorld(w)
  await switchAgent(w, KEY, 'ON')
}, 600_000)

describe('the timesheet chase golden snapshot', () => {
  it('on the seeded world over a Monday, the Tuesday after a yes and the Wednesday the worker files the week, the timesheet chase leaves exactly the rows kept in its golden file', async () => {
    const since = new Date(Date.now() - 1000)
    registerAgent(KEY, { ruleVersion: TIMESHEET_CHASE_RULES, step: (ctx) => timesheetChaseStep(ctx) })
    await runAgent(KEY, w.firm.id, GOLDEN_MONDAY)
    const tasks = await prisma.agentTask.findMany({ where: { companyId: w.firm.id, agentKey: KEY } })
    expect(tasks).toHaveLength(1)
    await prisma.decisionItem.update({ where: { id: tasks[0].decisionId }, data: { state: 'APPROVED', decidedByPersonId: w.owner.id, decidedAt: new Date() } })
    await runAgent(KEY, w.firm.id, GOLDEN_TUESDAY)
    await prisma.timesheet.create({
      data: { sellContractId: x.ana.line.id, personId: x.ana.p.id, periodStart: goldenDay('2026-11-15'), periodEnd: goldenDay('2026-11-21'), days: { '2026-11-16': 40 }, totalHours: 40, status: 'SUBMITTED', submittedAt: goldenDay('2026-11-24') } as any,
    })
    await runAgent(KEY, w.firm.id, GOLDEN_WEDNESDAY)
    unregisterAgent(KEY)
    const got = await captureSnapshot(w.firm.id, KEY, since)
    if (process.env.GOLDEN_WRITE === '1') fs.writeFileSync(FILE, JSON.stringify(canonical(got), null, 2) + '\n')
    const kept = JSON.parse(fs.readFileSync(FILE, 'utf8')) as GoldenSnapshot
    expect(diffSnapshots(kept, got)).toEqual([])
    const acts = got.recordActions.map((a) => a.action)
    expect(acts).toContain('CHASE_PROPOSED')
    expect(acts).toContain('CHASE_BACKLOG_LISTED')
    expect(acts).toContain('CHASE_NOT_SENT')
    expect(got.tasks).toMatchObject([{ kind: 'TIMESHEET_CHASE', status: 'CLOSED_BY_ARRIVAL' }])
  })
})
