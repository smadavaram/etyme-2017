/**
 * The reconciliation agent's golden snapshot (record 123, plan step 8): what
 * the agent leaves on the seeded world over a Monday and the Tuesday after,
 * kept in `golden/reconciliation.json`. Monday: a payment that matches its
 * bill to the cent, and a loose payment owed by exactly one bill, are
 * matched and their months move to paid, not confirmed; a short pay, an
 * overpay, a payment in another currency, a payment that fits no bill and a
 * bill whose rate is above its contract's each open one card for the
 * receivables seat. Tuesday it finds nothing new and writes nothing. The
 * agent moves onto skills in the next commit and this file must pass
 * unchanged. GOLDEN_WRITE=1 rewrites it.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { prisma, resetDatabase } from './harness'
import { buildGoldenWorld, switchAgent, GOLDEN_MONDAY, GOLDEN_TUESDAY, type GoldenWorld } from './golden-world'
import { addReconciliationWorld } from './golden-world-extras'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { reconciliationAgent, CHASE_AND_RECONCILIATION } from '@/lib/agents/reconciliation'
import { captureSnapshot, diffSnapshots, canonical, type GoldenSnapshot } from '@/lib/skills/golden'

process.env.NEXTAUTH_SECRET ||= 'test-secret-for-golden'
process.env.NEXTAUTH_URL = 'https://etyme.example'
for (const k of ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'NOTIFY_FROM_EMAIL']) delete process.env[k]
const KEY = CHASE_AND_RECONCILIATION
const FILE = path.join(process.cwd(), '__integration__/golden/reconciliation.json')
let w: GoldenWorld
let x: Awaited<ReturnType<typeof addReconciliationWorld>>

beforeAll(async () => {
  await resetDatabase()
  w = await buildGoldenWorld()
  x = await addReconciliationWorld(w)
  await switchAgent(w, KEY, 'ON')
}, 600_000)

describe('the reconciliation golden snapshot', () => {
  it('on the seeded world over a Monday and the Tuesday after, the reconciliation agent leaves exactly the rows kept in its golden file', async () => {
    const since = new Date(Date.now() - 1000)
    registerAgent(KEY, reconciliationAgent)
    await runAgent(KEY, w.firm.id, GOLDEN_MONDAY)
    await runAgent(KEY, w.firm.id, GOLDEN_TUESDAY)
    unregisterAgent(KEY)
    const got = await captureSnapshot(w.firm.id, KEY, since)
    if (process.env.GOLDEN_WRITE === '1') fs.writeFileSync(FILE, JSON.stringify(canonical(got), null, 2) + '\n')
    const kept = JSON.parse(fs.readFileSync(FILE, 'utf8')) as GoldenSnapshot
    expect(diffSnapshots(kept, got)).toEqual([])
    const acts = got.recordActions.map((a) => a.action)
    expect(acts.filter((a) => a === 'PAYMENT_MATCHED')).toHaveLength(2)
    expect(acts.filter((a) => a === 'PAYMENT_FLAGGED')).toHaveLength(4)
    expect(acts.filter((a) => a === 'RATE_DRIFT_FLAGGED')).toHaveLength(1)
    expect((await prisma.moneyChain.findUniqueOrThrow({ where: { id: x.exactChain.id } })).state).toBe('PAID_UNCONFIRMED')
    expect((await prisma.moneyChain.findUniqueOrThrow({ where: { id: x.looseChain.id } })).state).toBe('PAID_UNCONFIRMED')
    expect(got.mail).toHaveLength(0)
  })
})
