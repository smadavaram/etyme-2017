import { describe, it, expect, beforeAll } from 'vitest'
import { freshWorld, prisma } from './harness'
import { seedWorld, worldStepNames } from '@/lib/seed-world'

/**
 * Postings derive from live signatures and nothing else.
 *
 * Two seed paths withdraw a signature after the world may already have
 * been posted: Halcyon's acceptance of Colleen Byrne's weeks, withdrawn
 * when the weeks moved to her own company's line (lib/seed-doors), and a
 * client approval superseded by emailed evidence (lib/seed-week-approval).
 * Neither reverses what was posted under it. The seed's posting step now
 * removes postings under any signature that no longer stands, once, on
 * its last share — so a seeded world never carries one.
 *
 * It also posts every live signature itself under the hop-ledger rule,
 * the middle firm's acceptance included.
 */

/** Postings under a signature that is not LIVE, and that nothing reversed. */
async function underWithdrawn() {
  const stale = await prisma.workAssertion.findMany({ where: { state: { not: 'LIVE' } }, select: { id: true } })
  return prisma.orderPosting.findMany({
    where: { source: 'TIMESHEET', sourceId: { in: stale.map((a) => a.id) }, reversalOfId: null, reverses: null },
    select: { id: true },
  })
}

beforeAll(async () => {
  await freshWorld()
}, 600_000)

describe('a seeded world’s books stand only on signatures that stand', () => {
  it('a freshly seeded world holds no posting under a withdrawn signature', async () => {
    // The world does withdraw signatures, so the sentence is not empty.
    expect(await prisma.workAssertion.count({ where: { state: { not: 'LIVE' } } })).toBeGreaterThan(0)
    expect(await underWithdrawn()).toEqual([])
  })

  it('a middle firm’s acceptance is revenue to the firm below it and its own cost, in a freshly seeded world', async () => {
    const byrne = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-byrne-critical-care' } })).id
    const halcyon = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-halcyon' } })).id
    const accepted = await prisma.workAssertion.findMany({
      where: { companyId: halcyon, role: 'PASS_THROUGH', state: 'LIVE', timesheet: { sellContract: { companyId: byrne } } },
      select: { id: true },
    })
    expect(accepted.length).toBeGreaterThan(0)
    for (const a of accepted) {
      const rows = await prisma.orderPosting.findMany({ where: { source: 'TIMESHEET', sourceId: a.id }, select: { kind: true, companyId: true } })
      expect(rows.some((r) => r.kind === 'REVENUE' && r.companyId === byrne)).toBe(true)
      expect(rows.some((r) => r.kind === 'PAY' && r.companyId === halcyon)).toBe(true)
    }
  })

  it('a signature withdrawn after its week was posted takes its postings with it when the seed posts again', async () => {
    // As a world posted by an earlier version and walked again after a
    // deploy: a client approval with postings under it is withdrawn the
    // way the seed withdraws one, in place.
    const posted = await prisma.orderPosting.findFirstOrThrow({
      where: { source: 'TIMESHEET', kind: 'REVENUE', reversalOfId: null, reverses: null, projectOrder: { status: { notIn: ['SETTLED', 'CLOSED'] } } },
      select: { sourceId: true },
    })
    await prisma.workAssertion.update({ where: { id: posted.sourceId! }, data: { state: 'WITHDRAWN' } })
    expect((await underWithdrawn()).length).toBeGreaterThan(0)

    const last = worldStepNames().filter((n) => n.startsWith('order-to-cash:postings:')).pop()!
    await seedWorld({ skip: new Set(worldStepNames().filter((n) => n !== last)) })

    expect(await underWithdrawn()).toEqual([])
  }, 600_000)
})
