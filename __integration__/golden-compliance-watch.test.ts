/**
 * The compliance watch's golden snapshot (record 123, plan step 8): what the
 * agent leaves on the seeded world over a Monday and the Tuesday after, kept
 * in `golden/compliance-watch.json`. Monday: one tenure card to the Program
 * Manager, one card for the notice whose period ended long ago, one for the
 * notice dated after its filing day, and a public access file tracked with
 * its card. Tuesday: the second notice's period ends, the access file is a
 * day late and its second card opens. The agent moves onto skills in the
 * next commit and this file must pass unchanged. GOLDEN_WRITE=1 rewrites it.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { prisma, resetDatabase } from './harness'
import { buildGoldenWorld, switchAgent, GOLDEN_MONDAY, GOLDEN_TUESDAY, type GoldenWorld } from './golden-world'
import { addComplianceWorld } from './golden-world-extras'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { complianceWatchStep, COMPLIANCE_WATCH_AGENT, COMPLIANCE_WATCH_RULES } from '@/lib/agents/compliance-watch'
import { captureSnapshot, diffSnapshots, canonical, type GoldenSnapshot } from '@/lib/skills/golden'

process.env.NEXTAUTH_SECRET ||= 'test-secret-for-golden'
process.env.NEXTAUTH_URL = 'https://etyme.example'
for (const k of ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'NOTIFY_FROM_EMAIL']) delete process.env[k]
const KEY = COMPLIANCE_WATCH_AGENT
const FILE = path.join(process.cwd(), '__integration__/golden/compliance-watch.json')
let w: GoldenWorld

beforeAll(async () => {
  await resetDatabase()
  w = await buildGoldenWorld()
  await addComplianceWorld(w)
  await switchAgent(w, KEY, 'ON')
}, 600_000)

describe('the compliance watch golden snapshot', () => {
  it('on the seeded world over a Monday and the Tuesday after, the compliance watch leaves exactly the rows kept in its golden file', async () => {
    const since = new Date(Date.now() - 1000)
    registerAgent(KEY, { ruleVersion: COMPLIANCE_WATCH_RULES, step: complianceWatchStep })
    await runAgent(KEY, w.firm.id, GOLDEN_MONDAY)
    await runAgent(KEY, w.firm.id, GOLDEN_TUESDAY)
    unregisterAgent(KEY)
    const got = await captureSnapshot(w.firm.id, KEY, since)
    if (process.env.GOLDEN_WRITE === '1') fs.writeFileSync(FILE, JSON.stringify(canonical(got), null, 2) + '\n')
    const kept = JSON.parse(fs.readFileSync(FILE, 'utf8')) as GoldenSnapshot
    expect(diffSnapshots(kept, got)).toEqual([])
    const acts = got.recordActions.map((a) => a.action)
    for (const a of ['TENURE_WARNING_OPENED', 'NOTICE_PERIOD_ENDED', 'NOTICE_TIMING_FLAGGED', 'ACCESS_FILE_TRACKED', 'ACCESS_FILE_CARD_OPENED']) expect(acts).toContain(a)
  })
})
