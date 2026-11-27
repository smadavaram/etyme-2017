/**
 * The census keeper's golden snapshot, dormant outreach included (record
 * 123, plan step 8): what the agent leaves on the seeded world over two
 * days, kept in `golden/census-keeper.json`. Monday: the census line, the
 * change card, two check-in letters proposed and one company with nobody
 * to write to. A person says yes to the letters; Tuesday, with the agent
 * On, they go. The agent moves onto skills in the next commit and this
 * file must pass unchanged. GOLDEN_WRITE=1 rewrites it.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { prisma, resetDatabase } from './harness'
import { buildGoldenWorld, switchAgent, GOLDEN_MONDAY, GOLDEN_TUESDAY, type GoldenWorld } from './golden-world'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { censusKeeperAgent } from '@/lib/agents/census-keeper'
import { captureSnapshot, diffSnapshots, canonical, type GoldenSnapshot } from '@/lib/skills/golden'

process.env.NEXTAUTH_SECRET ||= 'test-secret-for-golden'
process.env.NEXTAUTH_URL = 'https://etyme.example'
// No sender is set, so every letter is tried and none leaves, on any machine.
for (const k of ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'NOTIFY_FROM_EMAIL']) delete process.env[k]
const KEY = 'census-keeper'
const FILE = path.join(process.cwd(), '__integration__/golden/census-keeper.json')
let w: GoldenWorld

beforeAll(async () => {
  await resetDatabase()
  w = await buildGoldenWorld()
  await switchAgent(w, KEY, 'ON')
}, 600_000)

describe('the census keeper golden snapshot', () => {
  it('on the seeded world over a Monday and the Tuesday after a yes the census keeper leaves exactly the rows kept in its golden file', async () => {
    const since = new Date(Date.now() - 1000)
    registerAgent(KEY, censusKeeperAgent)
    await runAgent(KEY, w.firm.id, GOLDEN_MONDAY)
    const tasks = await prisma.agentTask.findMany({ where: { companyId: w.firm.id, agentKey: KEY } })
    expect(tasks).toHaveLength(2)
    for (const t of tasks) await prisma.decisionItem.update({ where: { id: t.decisionId }, data: { state: 'APPROVED', decidedByPersonId: w.am.id, decidedAt: new Date() } })
    await runAgent(KEY, w.firm.id, GOLDEN_TUESDAY)
    unregisterAgent(KEY)
    const got = await captureSnapshot(w.firm.id, KEY, since)
    if (process.env.GOLDEN_WRITE === '1') fs.writeFileSync(FILE, JSON.stringify(canonical(got), null, 2) + '\n')
    const kept = JSON.parse(fs.readFileSync(FILE, 'utf8')) as GoldenSnapshot
    expect(diffSnapshots(kept, got)).toEqual([])
    expect(got.mail).toHaveLength(2)
    expect(got.recordActions.some((a) => a.action === 'CENSUS_WEEKLY')).toBe(true)
  })
})
