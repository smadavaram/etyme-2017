/**
 * The immigration checklist's golden snapshot (record 123, plan step 8): what
 * the agent leaves on the seeded world over a Monday and the Tuesday after,
 * kept in `golden/immigration-checklist.json`. Monday: the three papers the
 * petition lacked are listed and the three signature lines each send one
 * card, the petition form's to HR, who is named on it, and the others to the
 * Owner. A person records every paper as on hand; Tuesday the agent says the
 * list is complete and files nothing. The agent moves onto skills in the next
 * commit and this file must pass unchanged. GOLDEN_WRITE=1 rewrites it.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { prisma, resetDatabase } from './harness'
import { buildGoldenWorld, switchAgent, GOLDEN_MONDAY, GOLDEN_TUESDAY, type GoldenWorld } from './golden-world'
import { addImmigrationWorld } from './golden-world-extras'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { immigrationChecklistStep, IMMIGRATION_CHECKLIST_AGENT, IMMIGRATION_CHECKLIST_RULES } from '@/lib/agents/immigration-checklist'
import { captureSnapshot, diffSnapshots, canonical, type GoldenSnapshot } from '@/lib/skills/golden'

process.env.NEXTAUTH_SECRET ||= 'test-secret-for-golden'
process.env.NEXTAUTH_URL = 'https://etyme.example'
for (const k of ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'NOTIFY_FROM_EMAIL']) delete process.env[k]
const KEY = IMMIGRATION_CHECKLIST_AGENT
const FILE = path.join(process.cwd(), '__integration__/golden/immigration-checklist.json')
let w: GoldenWorld
let x: Awaited<ReturnType<typeof addImmigrationWorld>>

beforeAll(async () => {
  await resetDatabase()
  w = await buildGoldenWorld()
  x = await addImmigrationWorld(w)
  await switchAgent(w, KEY, 'ON')
}, 600_000)

describe('the immigration checklist golden snapshot', () => {
  it('on the seeded world over a Monday, and the Tuesday after a person records every paper, the immigration checklist leaves exactly the rows kept in its golden file', async () => {
    const since = new Date(Date.now() - 1000)
    registerAgent(KEY, { ruleVersion: IMMIGRATION_CHECKLIST_RULES, step: immigrationChecklistStep })
    await runAgent(KEY, w.firm.id, GOLDEN_MONDAY)
    expect(await prisma.checklistItem.count({ where: { ownerId: x.petition.id } })).toBe(4)
    await prisma.checklistItem.updateMany({ where: { ownerId: x.petition.id }, data: { state: 'MET', decidedById: w.owner.id } })
    await runAgent(KEY, w.firm.id, GOLDEN_TUESDAY)
    unregisterAgent(KEY)
    const got = await captureSnapshot(w.firm.id, KEY, since)
    if (process.env.GOLDEN_WRITE === '1') fs.writeFileSync(FILE, JSON.stringify(canonical(got), null, 2) + '\n')
    const kept = JSON.parse(fs.readFileSync(FILE, 'utf8')) as GoldenSnapshot
    expect(diffSnapshots(kept, got)).toEqual([])
    const acts = got.recordActions.map((a) => a.action)
    expect(acts.filter((a) => a === 'SIGNATURE_CARD_OPENED')).toHaveLength(3)
    expect(acts).toContain('PETITION_CHECKLIST_LISTED')
    expect(acts).toContain('PETITION_PAPERS_COMPLETE')
    expect(got.cards.map((c) => c.owedSeat).sort()).toEqual(['HR', 'Owner', 'Owner'])
  })
})
