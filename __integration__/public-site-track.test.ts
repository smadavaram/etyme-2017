import { describe, it, expect, beforeAll } from 'vitest'
import { freshWorld, prisma } from './harness'
import { publicSite } from '@/lib/public-site'

/**
 * "10 placements through Etyme" on a firm's public page counted four
 * draft lines that never started (walk tpf, stop 3). Every public
 * sentence is something the reader can check, and a placement is work
 * that started: a line running, paused or ended.
 *
 * The seeded firm is Vertex Global. Its sell lines in the seed, by hand:
 *   running  Meridian Bank, Cavanaugh Glassworks, Talvern Medical  = 3
 *   ended    Cavanaugh Glassworks, Talvern Medical                  = 2
 *   draft    Talvern Medical                                        = 1
 * Placements are 3 + 2 = 5, not 6. Clients are Meridian Bank,
 * Cavanaugh Glassworks and Talvern Medical = 3. Working now is 3.
 */

const SLUG = 'world-vertex-global'
let firmId = ''
let draftId = ''

const track = async () => {
  const site = await publicSite(SLUG)
  expect(site).not.toBeNull()
  return site!.track
}

beforeAll(async () => {
  await freshWorld()
  // The seed gives no world firm a live page; this one opens its own.
  const firm = await prisma.company.update({
    where: { slug: SLUG },
    data: { siteLiveAt: new Date(), claimedAt: new Date() },
    select: { id: true },
  })
  firmId = firm.id
  const drafts = await prisma.sellContract.findMany({ where: { companyId: firmId, state: 'DRAFT' }, select: { id: true } })
  expect(drafts).toHaveLength(1)
  draftId = drafts[0].id
}, 300_000)

describe("a firm's public page counts only work that started", () => {
  it('the seeded firm Vertex Global reads 5 placements, 3 working now and 3 clients, because its one draft is left out', async () => {
    const states = await prisma.sellContract.groupBy({ by: ['state'], where: { companyId: firmId }, _count: true })
    const n = (s: string) => states.find((g) => g.state === s)?._count ?? 0
    expect([n('IN_PROGRESS'), n('ENDED'), n('DRAFT')]).toEqual([3, 2, 1])
    expect(await track()).toEqual({ placements: 3 + 2, activeNow: 3, clients: 3, isNew: false })
  })

  it('a draft line is not a placement on the company page', async () => {
    const site = await publicSite(SLUG)
    expect(site!.track.placements).toBe(5)
    expect(site!.intro ?? '').not.toMatch(/\b6 placements\b/)
  })

  it('a client with only a draft line is not counted as a client', async () => {
    // Move the draft to a client this firm has no started line with.
    const other = await prisma.company.findFirstOrThrow({ where: { name: 'Harlow Health' }, select: { id: true } })
    await prisma.sellContract.update({ where: { id: draftId }, data: { clientCompanyId: other.id, endClientCompanyId: other.id } })
    expect((await track()).clients).toBe(3)
  })

  it('the same line counts as a placement and its client as a client once the work has started and paused', async () => {
    await prisma.sellContract.update({ where: { id: draftId }, data: { state: 'PAUSED' } })
    expect(await track()).toEqual({ placements: 6, activeNow: 3, clients: 4, isNew: false })
  })

  it('a cancelled line is never counted, so a public figure cannot overstate', async () => {
    await prisma.sellContract.update({ where: { id: draftId }, data: { state: 'CANCELLED' } })
    expect(await track()).toEqual({ placements: 5, activeNow: 3, clients: 3, isNew: false })
  })

  it('a firm whose every line is a draft reads as new, with no placements and no clients', async () => {
    await prisma.sellContract.updateMany({ where: { companyId: firmId }, data: { state: 'DRAFT' } })
    expect(await track()).toEqual({ placements: 0, activeNow: 0, clients: 0, isNew: true })
  })
})
