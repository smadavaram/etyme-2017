import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { shellNotice, isShell } from '@/lib/off-system'
import { GET as ap } from '@/app/api/ap/route'

/**
 * A firm with a seat is on Etyme.
 *
 * `Company.claimedAt` is null for a shell — a firm on the register that
 * nobody at it has taken possession of — and nothing in the seed ever
 * wrote the column. So every seeded firm was a shell, and
 * `/dashboard/purchase-orders` told Northbend Athletic that "Pinnacle
 * Resourcing is not on Etyme. You listed them, so this is your record of
 * them — they cannot see it" about a firm that submits candidates to it
 * and answers its threads in the same seeded world. It reached a
 * front-page screenshot.
 *
 * The rule is one sentence: a seat is possession.
 */
describe('a firm on the register and a firm on the system', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
  }, 600_000)

  it('a firm that holds a seat on Etyme is never described as off it', async () => {
    const firms = await prisma.company.findMany({
      where: { slug: { startsWith: 'world-' }, contexts: { some: {} } },
      select: { id: true, name: true, slug: true, claimedAt: true, listedById: true },
    })

    expect(firms.length).toBeGreaterThan(20)
    const called = firms.filter((f) => shellNotice(f) !== null)
    expect(
      called.map((f) => f.slug),
      'these firms have people signed in at them and a screen still calls them off Etyme'
    ).toEqual([])
    for (const f of firms) expect(isShell(f), f.slug).toBe(false)
  })

  it('the three suppliers on the purchase orders screen are the ones that answer its threads', async () => {
    // The exact firms in the screenshot, checked by name rather than by
    // count, so the sentence keeps meaning something if the world grows.
    for (const slug of ['world-pinnacle', 'world-halcyon', 'world-arcadia']) {
      const firm = await prisma.company.findFirst({
        where: { slug },
        select: { id: true, name: true, claimedAt: true, _count: { select: { contexts: true } } },
      })
      expect(firm, slug).toBeTruthy()
      expect(firm!._count.contexts, `${slug} has somebody seated at it`).toBeGreaterThan(0)
      expect(shellNotice({ id: firm!.id, name: firm!.name, claimedAt: firm!.claimedAt })).toBeNull()
    }
  })

  it('a sub-vendor a prime pays that never joined stays a shell, and the demo has exactly one', async () => {
    // A world where every firm is here can demonstrate none of the three
    // answers that turn on the difference, so one firm in it is
    // deliberately outside the sweep: Pinnacle buys an HCM integration
    // lead from Bluecrest and pays it, and nobody at Bluecrest has ever
    // signed in.
    const shells = await prisma.company.findMany({
      where: { slug: { startsWith: 'world-' }, claimedAt: null },
      select: { slug: true, name: true },
    })
    expect(shells.map((s) => s.slug)).toEqual(['world-bluecrest'])

    const bluecrest = await prisma.company.findFirstOrThrow({ where: { slug: 'world-bluecrest' } })
    expect(shellNotice(bluecrest)).toContain('is not on Etyme')
    // On the register and traded with, which is the whole point of the
    // row: it is somebody's record of a firm, not an empty name.
    const paid = await prisma.buyContract.count({ where: { vendorCompanyId: bluecrest.id } })
    expect(paid, 'a shell nobody pays proves nothing about a chain').toBeGreaterThan(0)
    // And nobody's consent is granted to a firm nobody has joined.
    expect(await prisma.benchListing.count({ where: { companyId: bluecrest.id } })).toBe(0)
  })

  it('accounts payable tells the prime that the firm it pays is not here, so the float is carried where nobody can see it', async () => {
    as('world-pinnacle@demo.etyme.local')
    const { status, body } = await json(await ap(req('GET', '/api/ap')))
    expect(status).toBe(200)

    const gaps: string[] = body.data.gaps ?? []
    const offPlatform = gaps.find((g) => g.includes('not on the platform'))
    expect(offPlatform, 'the one sentence the seeded world could not reach').toBeTruthy()
    expect(offPlatform).toContain('Bluecrest Staffing')

    // And the chain below it stops rather than pretending to continue.
    const blind = (body.data.chains ?? []).filter((c: any) => c.beyond?.blind)
    for (const c of blind) expect(c.beyond.lastPartyName).toBe('Bluecrest Staffing')
  })

  it('a firm somebody listed and nobody has joined is still a shell, which is what the column is for', async () => {
    // The sweep claims a firm because somebody holds a seat at it, not
    // because it is seeded. A recommended supplier with no seat yet must
    // still read as off Etyme, or the notice stops meaning anything.
    const listed = await prisma.company.create({
      data: { slug: 'world-not-joined-yet', name: 'Marbridge Staffing', kind: 'VENDOR', currency: 'USD' },
    })
    expect(isShell(listed)).toBe(true)
    expect(shellNotice(listed)).toContain('is not on Etyme')

    await seedWorld()
    const after = await prisma.company.findUnique({ where: { id: listed.id }, select: { claimedAt: true } })
    expect(after!.claimedAt, 'a second seeding does not take possession on nobody’s behalf').toBeNull()
  }, 600_000)
})
