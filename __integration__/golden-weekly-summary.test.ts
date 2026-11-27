/**
 * The weekly summary's golden snapshot (record 123, plan step 8): what the
 * agent leaves on the seeded world at a fixed clock, kept in
 * `golden/weekly-summary.json`. The agent moves onto skills in the next
 * commit and this file must pass unchanged. GOLDEN_WRITE=1 rewrites it.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { prisma, resetDatabase } from './harness'
import { buildGoldenWorld, switchAgent, GOLDEN_MONDAY, type GoldenWorld } from './golden-world'
import { registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { weeklySummaryAgent, WEEKLY_SUMMARY_AGENT } from '@/lib/agents/weekly-summary'
import { runAndCapture, diffSnapshots, canonical, type GoldenSnapshot } from '@/lib/skills/golden'

const FILE = path.join(process.cwd(), '__integration__/golden/weekly-summary.json')
let w: GoldenWorld

beforeAll(async () => {
  await resetDatabase()
  w = await buildGoldenWorld()
  await switchAgent(w, WEEKLY_SUMMARY_AGENT, 'DRAFT_ONLY')
}, 600_000)

describe('the weekly summary golden snapshot', () => {
  it('on the seeded world at the fixed Monday the weekly summary leaves exactly the rows kept in its golden file', async () => {
    registerAgent(WEEKLY_SUMMARY_AGENT, weeklySummaryAgent)
    const got = await runAndCapture(w.firm.id, WEEKLY_SUMMARY_AGENT, GOLDEN_MONDAY)
    unregisterAgent(WEEKLY_SUMMARY_AGENT)
    if (process.env.GOLDEN_WRITE === '1') fs.writeFileSync(FILE, JSON.stringify(canonical(got), null, 2) + '\n')
    const kept = JSON.parse(fs.readFileSync(FILE, 'utf8')) as GoldenSnapshot
    expect(diffSnapshots(kept, got)).toEqual([])
    expect(got.recordActions).toHaveLength(1)
    expect(got.cards).toHaveLength(1)
  })
})
