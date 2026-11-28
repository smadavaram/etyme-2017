/**
 * The outreach batch while Outreach is off (records 122, 123 answers 4 and 5),
 * on the database: an approved batch waits under its own yes, says so on its
 * own page in one sentence, shows the Owner the way to Settings, and goes on
 * under the same yes when Outreach is turned on.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import { prisma, resetDatabase } from './harness'
import { buildGoldenWorld, switchAgent, GOLDEN_MONDAY, GOLDEN_TUESDAY, type GoldenWorld } from './golden-world'
import { addOutreachBatchWorld } from './golden-world-extras'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { walkOutreachBatches } from '@/lib/agents/outreach-batch'
import { createBatch, batchView } from '@/lib/outreach/batch'
import { OUTREACH_BATCH_AGENT } from '@/lib/outreach/batch-rules'
import { outreachPausedSays, OUTREACH_PAUSED, OUTREACH_RESUMED, OUTREACH_SETTINGS_HREF, TASK_RECORD } from '@/lib/agents/tasks'
import { sendMail } from '@/lib/notify/mail-door'

process.env.NEXTAUTH_SECRET ||= 'test-secret-for-batch-pause'
process.env.NEXTAUTH_URL = 'https://etyme.example'
for (const k of ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'NOTIFY_FROM_EMAIL']) delete process.env[k]
const KEY = OUTREACH_BATCH_AGENT
let w: GoldenWorld
let taskId = ''
const sent: string[] = []
const deps = { env: { NOTIFY_FROM_EMAIL: 'hello@etyme.example', RESEND_API_KEY: 'k' }, isDemo: () => false, hand: async (e: any) => { sent.push(String(e.text)); return { provider: 'Resend' as const, messageId: 'm' } } }
const setOutreach = (on: boolean) => prisma.company.update({ where: { id: w.firm.id }, data: { pluginsOn: on ? ['OUTREACH'] : [] } })
const rows = (action: string) => prisma.recordAction.count({ where: { recordType: TASK_RECORD, recordId: taskId, action } })
const run = (when: Date) => {
  registerAgent(KEY, { ruleVersion: 't', step: (ctx) => walkOutreachBatches(ctx, { send: (m) => sendMail(m, deps as any) }) })
  return runAgent(KEY, w.firm.id, when).finally(() => unregisterAgent(KEY))
}

beforeAll(async () => {
  await resetDatabase()
  w = await buildGoldenWorld()
  await switchAgent(w, KEY, 'ON')
  await addOutreachBatchWorld(w)
  const made = await createBatch({ companyId: w.firm.id, personId: w.owner.id }, {
    audience: 'ALL_CUSTOMERS', offerKind: 'HOT_LIST', offer: { lines: [{ skills: 'Spark, SQL', availability: 'from December 8' }] },
    subject: 'Golden Firm: people available', body: 'Two data engineers are free from December 8.',
  }, GOLDEN_MONDAY)
  taskId = (made as { id: string }).id
  const t = await prisma.agentTask.findUniqueOrThrow({ where: { id: taskId } })
  await prisma.decisionItem.update({ where: { id: t.decisionId }, data: { state: 'APPROVED', decidedByPersonId: w.am.id, decidedAt: new Date() } })
  await setOutreach(false)
}, 600_000)

describe('an approved outreach batch while Outreach is off', () => {
  it('sends no letter and leaves every letter ready, with one paused row however many runs go by', async () => {
    await run(GOLDEN_TUESDAY); await run(GOLDEN_TUESDAY)
    expect(sent).toHaveLength(0)
    expect(await prisma.outreachLetter.count({ where: { agentTaskId: taskId, state: 'READY', attempt: 0 } })).toBe(3)
    expect(await rows(OUTREACH_PAUSED)).toBe(1)
    expect((await prisma.agentTask.findUniqueOrThrow({ where: { id: taskId } })).state).toBe('APPROVED')
  })

  it('the batch page says it is paused in the one sentence the control list uses', async () => {
    const v = await batchView(w.firm.id, taskId, GOLDEN_TUESDAY)
    expect(v!.stopped).toBe(outreachPausedSays('Golden Firm'))
  })

  it('the batch page reaches the Owner’s Settings from the paused sentence and nobody else', () => {
    const page = fs.readFileSync('src/app/dashboard/companies/outreach/[id]/page.tsx', 'utf8')
    expect(page).toMatch(/pausedHref/)
    const route = fs.readFileSync('src/app/api/outreach/batches/[id]/route.ts', 'utf8')
    expect(route).toMatch(/roleName === 'Owner'[\s\S]*OUTREACH_SETTINGS_HREF|OUTREACH_SETTINGS_HREF[\s\S]*roleName === 'Owner'/)
  })

  it('goes on under the same yes when Outreach is turned on, and writes one resumed row', async () => {
    await setOutreach(true)
    await run(GOLDEN_TUESDAY)
    expect(sent).toHaveLength(3)
    expect(await rows(OUTREACH_RESUMED)).toBe(1)
    expect((await batchView(w.firm.id, taskId, GOLDEN_TUESDAY))!.stopped).toBeNull()
  })

  it('the settings link is the plugins page in Settings', () => { expect(OUTREACH_SETTINGS_HREF).toBe('/dashboard/settings') })
})
