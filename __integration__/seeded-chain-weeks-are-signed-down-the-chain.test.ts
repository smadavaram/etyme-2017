import { describe, it, expect, beforeAll } from 'vitest'
import { resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { signersOf, topDown, turnOf, type LadderRung } from '@/app/api/timesheets/chain-turn'

/**
 * A signed week in a seeded program carries every signature the product
 * would have asked for, in the order it asks for them.
 *
 * Helena Marsh works at Northbend Athletic, sold by Computer Systems,
 * employed by CloudEPA. Since 2026-09-28 a week travels down the chain:
 * Northbend signs, Computer Systems accepts what it pays CloudEPA, and
 * CloudEPA accepts last (`api/timesheets/chain-turn`). The seed wrote
 * two of the three — Northbend's and CloudEPA's — so every seeded bill
 * from CloudEPA to Computer Systems had no acceptance of Computer
 * Systems' own behind it, and the invoice-receipt match rightly found
 * nothing to match it against.
 */

let helenaWeeks: { id: string }[] = []
const ids: Record<string, string> = {}

beforeAll(async () => {
  await resetDatabase()
  await seedWorld()
  const helena = await prisma.person.findFirstOrThrow({ where: { name: 'Helena Marsh' } })
  helenaWeeks = await prisma.timesheet.findMany({
    where: { personId: helena.id, status: 'APPROVED' },
    select: { id: true },
  })
  for (const slug of ['nike', 'computer-systems', 'cloudepa']) {
    ids[slug] = (await prisma.company.findUniqueOrThrow({ where: { slug: `world-${slug}` } })).id
  }
}, 600_000)

const signaturesOn = (timesheetId: string) =>
  prisma.workAssertion.findMany({
    where: { timesheetId, state: 'LIVE' },
    orderBy: { at: 'asc' },
    select: { companyId: true, role: true, rateCents: true, at: true },
  })

describe('a seeded week on a chain is signed down the chain', () => {
  it('has signed weeks to read, so the sentences below mean something', () => {
    expect(helenaWeeks.length).toBeGreaterThan(0)
  })

  it('carries the client’s signature, then the firm in the middle accepting what it pays, then the employer’s, in that order', async () => {
    for (const w of helenaWeeks) {
      const signed = await signaturesOn(w.id)
      expect(signed.map((s) => [s.companyId, s.role])).toEqual([
        [ids.nike, 'CLIENT_APPROVAL'],
        [ids['computer-systems'], 'PASS_THROUGH'],
        [ids.cloudepa, 'EMPLOYER_ACCEPTANCE'],
      ])
      // Strictly in order: no rung accepted before the rung above it signed.
      expect(signed[0].at.getTime()).toBeLessThan(signed[1].at.getTime())
      expect(signed[1].at.getTime()).toBeLessThan(signed[2].at.getTime())
    }
  })

  it('records the firm in the middle at the rate it pays the firm below, never the client’s rate', async () => {
    for (const w of helenaWeeks) {
      const pass = (await signaturesOn(w.id)).find((s) => s.role === 'PASS_THROUGH')!
      expect(pass.rateCents).toBe(11800)
    }
  })

  it('leaves nobody on the chain a turn still to take, as the approve route itself would read it', async () => {
    const week = await prisma.timesheet.findUniqueOrThrow({
      where: { id: helenaWeeks[0].id },
      select: { sellContractId: true },
    })
    // The ladder, read the way the route reads it: the worker's rung and
    // every rung above it that buys from the one below.
    const rungs: LadderRung[] = []
    let at: string | null = week.sellContractId
    while (at) {
      const c: { id: string; companyId: string; clientCompanyId: string; endClientCompanyId: string | null } =
        await prisma.sellContract.findUniqueOrThrow({
          where: { id: at },
          select: { id: true, companyId: true, clientCompanyId: true, endClientCompanyId: true },
        })
      const below = rungs[rungs.length - 1]
      rungs.push({
        sellContractId: c.id, companyId: c.companyId, clientCompanyId: c.clientCompanyId,
        endClientCompanyId: c.endClientCompanyId, supplierSellContractId: below?.sellContractId ?? null,
      })
      const above = await prisma.buyContract.findFirst({
        where: { supplierSellContractId: c.id },
        select: { companyId: true, sellLinks: { select: { sellContractId: true } } },
      })
      at = above?.sellLinks[0]?.sellContractId ?? null
    }
    const signers = signersOf(topDown(rungs))
    expect(signers.map((s) => s.role)).toEqual(['CLIENT_APPROVAL', 'PASS_THROUGH', 'EMPLOYER_ACCEPTANCE'])

    const signed = await signaturesOn(helenaWeeks[0].id)
    const has = (s: { companyId: string; role: string }) =>
      signed.some((x) => x.companyId === s.companyId && x.role === s.role)
    for (const firm of [ids.nike, ids['computer-systems'], ids.cloudepa]) {
      const turn = turnOf(signers, firm, has, () => 'somebody')
      expect(turn.ok ? 'still to sign' : turn.code, firm).toBe('ALREADY_SIGNED')
    }
  })

  it('signs nothing twice when the world is seeded again', async () => {
    const before = await prisma.workAssertion.count()
    await seedWorld()
    expect(await prisma.workAssertion.count()).toBe(before)
  }, 600_000)
})
