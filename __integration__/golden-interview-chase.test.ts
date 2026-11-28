/**
 * The interview chase's golden snapshot (record 123, plan step 8): what the
 * agent leaves on the seeded world over three days, kept in
 * `golden/interview-chase.json`. Monday: one quiet submission becomes one
 * task and one card, and a second quiet submission whose client has no one
 * to write to is left alone. Tuesday, after a yes, nothing is written to
 * the client. Wednesday the client moves the submission and the task is
 * closed. The agent moves onto skills in the next commit and this file must
 * pass unchanged. GOLDEN_WRITE=1 rewrites it.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { prisma, resetDatabase } from './harness'
import { buildGoldenWorld, switchAgent, GOLDEN_MONDAY, GOLDEN_TUESDAY, type GoldenWorld } from './golden-world'
import { addInterviewWorld, GOLDEN_WEDNESDAY } from './golden-world-extras'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { interviewChaseAgent, INTERVIEW_CHASE } from '@/lib/agents/interview-chase'
import { captureSnapshot, diffSnapshots, canonical, type GoldenSnapshot } from '@/lib/skills/golden'

process.env.NEXTAUTH_SECRET ||= 'test-secret-for-golden'
process.env.NEXTAUTH_URL = 'https://etyme.example'
for (const k of ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'NOTIFY_FROM_EMAIL']) delete process.env[k]
const FILE = path.join(process.cwd(), '__integration__/golden/interview-chase.json')
let w: GoldenWorld

beforeAll(async () => {
  await resetDatabase()
  w = await buildGoldenWorld()
  await addInterviewWorld(w)
  await switchAgent(w, INTERVIEW_CHASE, 'ON')
}, 600_000)

describe('the interview chase golden snapshot', () => {
  it('on the seeded world over a Monday, the Tuesday after a yes and the Wednesday the client moves, the interview chase leaves exactly the rows kept in its golden file', async () => {
    const since = new Date(Date.now() - 1000)
    registerAgent(INTERVIEW_CHASE, interviewChaseAgent)
    await runAgent(INTERVIEW_CHASE, w.firm.id, GOLDEN_MONDAY)
    const tasks = await prisma.agentTask.findMany({ where: { companyId: w.firm.id, agentKey: INTERVIEW_CHASE } })
    expect(tasks).toHaveLength(1)
    await prisma.decisionItem.update({ where: { id: tasks[0].decisionId }, data: { state: 'APPROVED', decidedByPersonId: w.am.id, decidedAt: new Date() } })
    await runAgent(INTERVIEW_CHASE, w.firm.id, GOLDEN_TUESDAY)
    await prisma.submission.update({ where: { id: tasks[0].recordId }, data: { status: 'SHORTLISTED' } })
    await runAgent(INTERVIEW_CHASE, w.firm.id, GOLDEN_WEDNESDAY)
    unregisterAgent(INTERVIEW_CHASE)
    const got = await captureSnapshot(w.firm.id, INTERVIEW_CHASE, since)
    if (process.env.GOLDEN_WRITE === '1') fs.writeFileSync(FILE, JSON.stringify(canonical(got), null, 2) + '\n')
    const kept = JSON.parse(fs.readFileSync(FILE, 'utf8')) as GoldenSnapshot
    expect(diffSnapshots(kept, got)).toEqual([])
    expect(got.recordActions.map((a) => a.action)).toEqual(['TASK_PROPOSED', 'CHASE_PROPOSED', 'TASK_RELEASED', 'TASK_CLOSED_BY_ARRIVAL'])
    expect(got.tasks).toMatchObject([{ kind: 'INTERVIEW_CHASE', status: 'CLOSED_BY_ARRIVAL' }])
    expect(got.mail).toHaveLength(0)
  })
})
