/**
 * The confirmation tracker's golden snapshot (record 123, plan step 8): what
 * the agent, with its submission chase, leaves on the seeded world over
 * three days, kept in `golden/confirmation-tracker.json`. Monday: one person
 * put forward twice for one job is held with a card to each of two people,
 * a reply the customer already put on the thread is recorded as a
 * confirmation, a letter that bounced reopens its submission with one card,
 * a submission waiting five days after a letter that left is proposed as one
 * chase, and the week's tally is written once. Tuesday, after a yes, the
 * chase letter goes once. Wednesday a person records the confirmation and
 * the chase is closed. The agent moves onto skills in the next commit and
 * this file must pass unchanged. GOLDEN_WRITE=1 rewrites it.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { prisma, resetDatabase } from './harness'
import { buildGoldenWorld, switchAgent, GOLDEN_MONDAY, GOLDEN_TUESDAY, type GoldenWorld } from './golden-world'
import { addConfirmationWorld, GOLDEN_WEDNESDAY } from './golden-world-extras'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { confirmationTrackerAgent, recordConfirmation } from '@/lib/agents/confirmation-tracker'
import { CONFIRMATION_AGENT } from '@/lib/agents/confirmation-rules'
import { captureSnapshot, diffSnapshots, canonical, type GoldenSnapshot } from '@/lib/skills/golden'

process.env.NEXTAUTH_SECRET ||= 'test-secret-for-golden'
process.env.NEXTAUTH_URL = 'https://etyme.example'
for (const k of ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'NOTIFY_FROM_EMAIL']) delete process.env[k]
const KEY = CONFIRMATION_AGENT
const FILE = path.join(process.cwd(), '__integration__/golden/confirmation-tracker.json')
let w: GoldenWorld
let x: Awaited<ReturnType<typeof addConfirmationWorld>>

beforeAll(async () => {
  await resetDatabase()
  w = await buildGoldenWorld()
  x = await addConfirmationWorld(w)
  await switchAgent(w, KEY, 'ON')
}, 600_000)

describe('the confirmation tracker golden snapshot', () => {
  it('on the seeded world over a Monday, the Tuesday after a yes and the Wednesday a person records the confirmation, the confirmation tracker leaves exactly the rows kept in its golden file', async () => {
    const since = new Date(Date.now() - 1000)
    registerAgent(KEY, confirmationTrackerAgent)
    await runAgent(KEY, w.firm.id, GOLDEN_MONDAY)
    const tasks = await prisma.agentTask.findMany({ where: { companyId: w.firm.id, agentKey: KEY } })
    expect(tasks).toHaveLength(1)
    await prisma.decisionItem.update({ where: { id: tasks[0].decisionId }, data: { state: 'APPROVED', decidedByPersonId: w.am.id, decidedAt: new Date() } })
    await runAgent(KEY, w.firm.id, GOLDEN_TUESDAY)
    await recordConfirmation({ companyId: w.firm.id, submissionId: x.waiting.id, personId: w.am.id, heldAs: 'Account Manager', actingEntityId: w.entity.id, channel: 'PHONE', now: GOLDEN_WEDNESDAY })
    await runAgent(KEY, w.firm.id, GOLDEN_WEDNESDAY)
    unregisterAgent(KEY)
    const got = await captureSnapshot(w.firm.id, KEY, since)
    if (process.env.GOLDEN_WRITE === '1') fs.writeFileSync(FILE, JSON.stringify(canonical(got), null, 2) + '\n')
    const kept = JSON.parse(fs.readFileSync(FILE, 'utf8')) as GoldenSnapshot
    expect(diffSnapshots(kept, got)).toEqual([])
    const acts = got.recordActions.map((a) => a.action)
    expect(acts).toContain('DUAL_AUTHORIZATION_BLOCKED')
    expect(acts).toContain('CONFIRMATION_MATCHED')
    expect(acts).toContain('FAILED_DELIVERY_REOPENED')
    expect(acts).toContain('SUBMISSION_CHASE_PROPOSED')
    expect(acts.filter((a) => a === 'WEEKLY_TALLY')).toHaveLength(1)
    expect(got.tasks).toMatchObject([{ kind: 'SUBMISSION_CHASE', status: 'CLOSED_BY_ARRIVAL' }])
  })
})
