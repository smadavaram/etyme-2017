import { describe, it, expect, beforeAll } from 'vitest'
import { resetDatabase, prisma } from './harness'
import { seedChain } from '@/lib/demo-chain'
import { addVolume, type VolumeResult } from '@/lib/demo-volume'

/**
 * A demo with enough in it to judge a working surface.
 *
 * The founder opened Requirements, saw one row, and could not tell
 * whether the table worked. Correct verdict: one row cannot show
 * sorting, filtering, search, or pagination. These tests pin the floor
 * he set — two hundred requirements, four hundred submissions — and
 * check that width did not come at the cost of the invariants the
 * one-row world honoured.
 */
describe('a demo company with a real book', () => {
  let companyId: string
  let seatPersonId: string
  let result: VolumeResult

  beforeAll(async () => {
    await resetDatabase()
    const person = await prisma.person.create({
      data: { name: 'Demo Visitor', primaryEmail: 'visitor@demo.etyme.invalid' },
    })
    seatPersonId = person.id
    const chain = await seedChain({
      personId: person.id,
      personName: person.name,
      seat: 'CLIENT',
      slug: 'volume-test',
    })
    companyId = chain.companyId
    result = await addVolume({ companyId, seatPersonId })
  }, 180_000)

  it('gives the company at least two hundred requirements', async () => {
    const n = await prisma.requirement.count({ where: { companyId } })
    expect(n).toBeGreaterThanOrEqual(200)
    expect(result.requirements).toBeGreaterThanOrEqual(200)
  })

  it('gives the company at least four hundred submissions', async () => {
    const n = await prisma.submission.count({ where: { toCompanyId: companyId } })
    expect(n).toBeGreaterThanOrEqual(400)
  })

  it('leaves something unread so the bell has a number', async () => {
    const n = await prisma.notification.count({
      where: { personId: seatPersonId, status: 'UNREAD' },
    })
    expect(n).toBeGreaterThan(0)
  })

  it('every requirement carries a job description in the manager’s own words', async () => {
    const blank = await prisma.requirement.count({
      where: { companyId, OR: [{ description: null }, { description: '' }] },
    })
    // The chain's own one requirement predates the field; everything
    // volume added must have one.
    expect(blank).toBeLessThanOrEqual(1)
  })

  it('never submits somebody from a company to itself', async () => {
    const rows = await prisma.submission.findMany({
      where: { toCompanyId: companyId },
      select: { fromCompanyId: true, toCompanyId: true },
    })
    expect(rows.filter((r) => r.fromCompanyId === r.toCompanyId)).toEqual([])
  })

  it('every submitted consultant sits on a granted bench at the company that sent them', async () => {
    // The invariant the one-row world honoured. Bulk data is not exempt.
    const subs = await prisma.submission.findMany({
      where: { toCompanyId: companyId },
      select: { personId: true, fromCompanyId: true },
    })
    const listings = await prisma.benchListing.findMany({
      where: { state: 'GRANTED' },
      select: { companyId: true, consultant: { select: { personId: true } } },
    })
    const granted = new Set(listings.map((l) => `${l.consultant.personId}:${l.companyId}`))
    const orphans = subs.filter((s) => !granted.has(`${s.personId}:${s.fromCompanyId}`))
    expect(orphans).toEqual([])
  })

  it('fills every stage a requirement can be in, so no tab is empty', async () => {
    const statuses = await prisma.requirement.groupBy({
      by: ['status'],
      where: { companyId },
      _count: true,
    })
    const seen = new Set(statuses.map((s) => s.status))
    for (const s of ['OPEN', 'FILLED', 'DRAFT', 'CANCELLED']) expect(seen).toContain(s)
  })

  it('gives every cancelled requirement a reason, as the schema requires', async () => {
    const silent = await prisma.requirement.count({
      where: { companyId, status: 'CANCELLED', cancelReason: null },
    })
    expect(silent).toBe(0)
  })

  it('never dates a submission before the requirement it answers', async () => {
    const rows = await prisma.submission.findMany({
      where: { toCompanyId: companyId },
      select: { submittedAt: true, requirement: { select: { createdAt: true } } },
    })
    const early = rows.filter((r) => r.submittedAt < r.requirement.createdAt)
    expect(early).toEqual([])
  })

  it('keeps every rate inside the book — nothing free, nothing absurd', async () => {
    const rows = await prisma.submission.findMany({
      where: { toCompanyId: companyId },
      select: { rate: true },
    })
    for (const r of rows) {
      expect(r.rate).toBeGreaterThan(3000)   // $30/hr
      expect(r.rate).toBeLessThan(20000)     // $200/hr
    }
  })

  it('is not all one trade — the demo must not read as an IT staffing tool', async () => {
    const titles = await prisma.requirement.findMany({
      where: { companyId },
      select: { title: true },
      distinct: ['title'],
    })
    const set = titles.map((t) => t.title.toLowerCase())
    expect(set.some((t) => t.includes('nurse'))).toBe(true)
    expect(set.some((t) => t.includes('validation'))).toBe(true)
    expect(set.some((t) => t.includes('engineer'))).toBe(true)
    expect(set.length).toBeGreaterThanOrEqual(15)
  })

  it('does not double the book when run a second time', async () => {
    const before = await prisma.requirement.count({ where: { companyId } })
    const again = await addVolume({ companyId, seatPersonId })
    expect(again.skipped).toBe(true)
    expect(await prisma.requirement.count({ where: { companyId } })).toBe(before)
  })

  it('refuses to bulk-fill a real company', async () => {
    const real = await prisma.company.create({
      data: { name: 'Real Firm', slug: 'real-firm-volume', kind: 'CLIENT', isDemo: false },
    })
    await expect(addVolume({ companyId: real.id, seatPersonId })).rejects.toThrow(/demo/)
  })
})
