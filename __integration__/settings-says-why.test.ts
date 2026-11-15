import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

/**
 * Settings, the daily-flows batch (fix list areas G and A6, 2026-11-15),
 * through the routes on the seeded world: Holidays offers only a year that
 * is missing, the Company tab carries the website the firm typed, an Owner
 * still to be verified is shown the step rather than a button that is
 * refused, and the activity log reads the old Reverse rows in a person's
 * words. No date on the seeded world or the clock is pinned: the years are
 * read from the reply.
 */

const settings = await import('@/app/api/settings/route')
const holidays = await import('@/app/api/settings/holidays/route')
const automation = await import('@/app/api/automation/route')

const OWNER = 'world-brightmoor@demo.etyme.local'
let brightmoor = ''
const read = async () => (await json(await settings.GET(req('GET', '/api/settings')))).body.data

beforeAll(async () => {
  await freshWorld()
  brightmoor = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })).id
  as(OWNER)
}, 600_000)

describe('Settings > Holidays offers only a year that is missing', () => {
  it('next year is offered until its US holidays are on the calendar, then says it is already there and is not offered again', async () => {
    const before = await read()
    const next = before.holidayOffers.find((o: any) => o.from === null)
    expect(next).toBeTruthy()
    // Start from a next year with nothing on it, whatever the seed holds.
    await prisma.holiday.deleteMany({ where: { companyId: brightmoor, date: { gte: new Date(`${next.year}-01-01T00:00:00Z`), lt: new Date(`${next.year + 1}-01-01T00:00:00Z`) } } })
    expect((await read()).holidayOffers.find((o: any) => o.year === next.year)).toMatchObject({ complete: false, says: null })

    const seeded = await json(await holidays.POST(req('POST', '/api/settings/holidays', { seedYear: next.year, country: 'US' })))
    expect(seeded.status, JSON.stringify(seeded.body)).toBeLessThan(300)
    expect((await read()).holidayOffers.find((o: any) => o.year === next.year)).toMatchObject({
      complete: true,
      says: `The US holidays for ${next.year} are already on your calendar.`,
    })
  })

  it('a year with one US holiday missing is offered again', async () => {
    const next = (await read()).holidayOffers.find((o: any) => o.from === null)
    const one = await prisma.holiday.findFirstOrThrow({ where: { companyId: brightmoor, date: { gte: new Date(`${next.year}-01-01T00:00:00Z`) } }, orderBy: { date: 'asc' } })
    await prisma.holiday.delete({ where: { id: one.id } })
    expect((await read()).holidayOffers.find((o: any) => o.year === next.year)).toMatchObject({ complete: false, says: null })
  })
})

describe('the Company tab', () => {
  it('carries the website the firm typed in Setup, so the tab can say where it is typed', async () => {
    await prisma.company.update({ where: { id: brightmoor }, data: { website: 'brightmoor.example' } })
    expect((await read()).company.website).toBe('brightmoor.example')
  })

  it('an Owner at a company still waiting for a verified Owner is shown the step to prove ownership, not a button that would be refused', async () => {
    const was = await prisma.company.findUniqueOrThrow({ where: { id: brightmoor }, select: { ownerProofRequiredAt: true, ownerVerifiedAt: true } })
    expect((await read()).canChangeType).toBe(true)
    await prisma.company.update({ where: { id: brightmoor }, data: { ownerProofRequiredAt: new Date(), ownerVerifiedAt: null } })
    try {
      const d = await read()
      expect(d.canChangeType).toBe(false)
      expect(d.typeLine).toMatchObject({ href: '/dashboard/settings/setup/ownership', linkSays: 'Prove ownership' })
      expect(d.typeLine.says).toMatch(/^Changing the type of company waits until .+ has a verified Owner\. Prove ownership under Setup → Prove ownership\.$/)
    } finally {
      await prisma.company.update({ where: { id: brightmoor }, data: was })
    }
  })
})

describe('Settings > Activity log', () => {
  it('a row the old Reverse button wrote reads in a person’s words, says the press changed nothing, and names no machine word', async () => {
    const row = await prisma.automationLog.create({ data: {
      companyId: brightmoor, action: 'REVERSAL', summary: 'Reversed: Sent to 1 supplier',
      reason: 'Dana Whitfield reversed automation action REQUISITION_DISTRIBUTED',
      payload: { reversedEntryId: 'none', originalAction: 'REQUISITION_DISTRIBUTED' }, reversible: false,
    } })
    const log = await json(await automation.GET(req('GET', '/api/automation?limit=200')))
    const shown = log.body.data.entries.find((e: any) => e.id === row.id)
    expect(shown).toMatchObject({
      summary: 'Reverse pressed on: Sent to 1 supplier',
      reason: 'Dana Whitfield pressed Reverse here. The press was recorded and changed nothing.',
    })
    // The row as written loses nothing.
    expect((await prisma.automationLog.findUniqueOrThrow({ where: { id: row.id } })).summary).toBe('Reversed: Sent to 1 supplier')
  })
})
