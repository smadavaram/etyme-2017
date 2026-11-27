/**
 * The contracts checklist's golden snapshot (record 123, plan step 8): what
 * the agent leaves on the seeded world over a Monday and the Tuesday after,
 * kept in `golden/contracts-checklist.json`. Monday: each placement's items
 * are listed, a payment-terms drift opens one card to the Contract Manager,
 * the placement not started opens its placement card and a pack card goes to
 * HR. Tuesday nothing new is written. The agent moves onto skills in the
 * next commit and this file must pass unchanged. GOLDEN_WRITE=1 rewrites it.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { prisma, resetDatabase } from './harness'
import { buildGoldenWorld, switchAgent, GOLDEN_MONDAY, GOLDEN_TUESDAY, type GoldenWorld } from './golden-world'
import { addContractsWorld } from './golden-world-extras'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { contractsChecklistStep, CONTRACTS_CHECKLIST_AGENT, CONTRACTS_CHECKLIST_RULES } from '@/lib/agents/contracts-checklist'
import { captureSnapshot, diffSnapshots, canonical, type GoldenSnapshot } from '@/lib/skills/golden'

process.env.NEXTAUTH_SECRET ||= 'test-secret-for-golden'
process.env.NEXTAUTH_URL = 'https://etyme.example'
for (const k of ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'NOTIFY_FROM_EMAIL']) delete process.env[k]
const KEY = CONTRACTS_CHECKLIST_AGENT
const FILE = path.join(process.cwd(), '__integration__/golden/contracts-checklist.json')
let w: GoldenWorld

beforeAll(async () => {
  await resetDatabase()
  w = await buildGoldenWorld()
  await addContractsWorld(w)
  await switchAgent(w, KEY, 'ON')
}, 600_000)

describe('the contracts checklist golden snapshot', () => {
  it('on the seeded world over a Monday and the Tuesday after, the contracts checklist leaves exactly the rows kept in its golden file', async () => {
    const since = new Date(Date.now() - 1000)
    registerAgent(KEY, { ruleVersion: CONTRACTS_CHECKLIST_RULES, step: contractsChecklistStep })
    await runAgent(KEY, w.firm.id, GOLDEN_MONDAY)
    const afterMonday = await prisma.recordAction.count({ where: { companyId: w.firm.id, agentKey: KEY } })
    await runAgent(KEY, w.firm.id, GOLDEN_TUESDAY)
    unregisterAgent(KEY)
    expect(await prisma.recordAction.count({ where: { companyId: w.firm.id, agentKey: KEY } })).toBe(afterMonday)
    const got = await captureSnapshot(w.firm.id, KEY, since)
    if (process.env.GOLDEN_WRITE === '1') fs.writeFileSync(FILE, JSON.stringify(canonical(got), null, 2) + '\n')
    const kept = JSON.parse(fs.readFileSync(FILE, 'utf8')) as GoldenSnapshot
    expect(diffSnapshots(kept, got)).toEqual([])
    const acts = got.recordActions.map((a) => a.action)
    for (const a of ['CHECKLIST_LISTED', 'DRIFT_FLAGGED', 'PLACEMENT_RECORD_ASSEMBLED', 'PACK_INCOMPLETE_FLAGGED']) expect(acts).toContain(a)
  })
})
