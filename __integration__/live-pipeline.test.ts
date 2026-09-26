import { describe, it, expect, beforeAll } from 'vitest'
import { resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { headline, rowToInterview } from '@/lib/interviews'

/**
 * The seeded world has work still in flight.
 *
 * Every placement the seed builds is finished — requirement FILLED,
 * submission PLACED, both rounds DONE — and for a while that was the
 * whole world. Two things went wrong with it.
 *
 * The demo one: the interviews queue showed five completed rounds and
 * gave nobody a reason to open it, because there was nothing to do.
 *
 * The real one: the line that prints a round's time and zone only runs
 * for a round that has not happened yet, so the timezone work shipped
 * type-checked and never once executed against a stored row. These tests
 * exist so that cannot be true again.
 */
describe('the seeded world', () => {
  let now: Date

  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
    now = new Date()
  }, 120_000)

  it('has at least one interview round still ahead of now', async () => {
    const ahead = await prisma.interview.count({ where: { scheduledAt: { gt: now } } })
    expect(ahead).toBeGreaterThan(0)
  })

  it('never records a finished round as happening in the future', async () => {
    const impossible = await prisma.interview.count({
      where: { state: 'DONE', scheduledAt: { gt: now } },
    })
    expect(impossible).toBe(0)
  })

  it('never books a round on a Saturday or a Sunday', async () => {
    const rounds = await prisma.interview.findMany({
      where: { scheduledAt: { not: null } },
      select: { scheduledAt: true },
    })
    expect(rounds.length).toBeGreaterThan(0)
    const weekend = rounds.filter((r) => [0, 6].includes(r.scheduledAt!.getUTCDay()))
    expect(weekend).toEqual([])
  })

  it('tells two readers in different zones the same moment in their own words', async () => {
    const i = await prisma.interview.findFirst({
      where: { scheduledAt: { gt: now } },
      include: { submission: { include: { person: true } }, company: true, vendor: true },
      orderBy: { scheduledAt: 'asc' },
    })
    expect(i).not.toBeNull()
    const names = {
      vendor: i!.vendor.name,
      client: i!.company.name,
      consultant: i!.submission.person.name,
    }
    const round = rowToInterview(i!)
    const mumbai = headline(round, now, names, 'Asia/Kolkata')
    const sanJose = headline(round, now, names, 'America/Los_Angeles')

    expect(mumbai).not.toBe(sanJose)
    // Whatever the platform's zone data is called, both must name one.
    expect(mumbai).toMatch(/\d{2}:\d{2}\s\S+/)
    expect(sanJose).toMatch(/\d{2}:\d{2}\s\S+/)
  })

  it('says UTC out loud rather than silently assuming it when nobody set a zone', async () => {
    const i = await prisma.interview.findFirst({
      where: { scheduledAt: { gt: now } },
      include: { submission: { include: { person: true } }, company: true, vendor: true },
    })
    const said = headline(
      rowToInterview(i!),
      now,
      { vendor: i!.vendor.name, client: i!.company.name, consultant: i!.submission.person.name },
      null
    )
    expect(said).toContain('UTC')
  })

  it('names the people who will be in the room', async () => {
    const i = await prisma.interview.findFirst({ where: { scheduledAt: { gt: now } } })
    expect(i!.interviewers.length).toBeGreaterThan(0)
  })

  it('offers a proposed round more than one slot to choose between', async () => {
    const proposals = await prisma.interview.findMany({ where: { state: 'PROPOSED' } })
    expect(proposals.length).toBeGreaterThan(0)
    for (const p of proposals) {
      expect(p.scheduledAt).toBeNull() // proposed means no time is fixed yet
      expect((p.proposedSlots as unknown[]).length).toBeGreaterThan(1)
    }
  })

  it('offers two proposed slots that are not the same slot twice', async () => {
    const proposals = await prisma.interview.findMany({ where: { state: 'PROPOSED' } })
    for (const p of proposals) {
      const starts = (p.proposedSlots as { start: string }[]).map((s) => s.start)
      expect(new Set(starts).size).toBe(starts.length)
    }
  })

  it('reaches a live client requirement through a supplier that submitted onward', async () => {
    const live = await prisma.interview.findFirst({
      where: { scheduledAt: { gt: now } },
      include: { submission: { include: { requirement: true, parentSubmission: true } } },
    })
    // The round is on the hop the client received, and that hop came from
    // somewhere: a bench vendor sold to a prime, the prime sold onward.
    expect(live!.submission.requirement.status).toBe('OPEN')
    expect(live!.submission.parentSubmissionId).not.toBeNull()
    expect(live!.submission.parentSubmission!.fromCompanyId).not.toBe(
      live!.submission.fromCompanyId
    )
  })

  it('never charges the client what the bench vendor charged the prime', async () => {
    const onward = await prisma.submission.findMany({
      where: { parentSubmissionId: { not: null } },
      include: { parentSubmission: true },
    })
    expect(onward.length).toBeGreaterThan(0)
    for (const s of onward) expect(s.rate).toBeGreaterThan(s.parentSubmission!.rate)
  })

  it('can be run twice without building a second copy of the pipeline', async () => {
    const before = await prisma.interview.count()
    await seedWorld()
    expect(await prisma.interview.count()).toBe(before)
  }, 120_000)
})
