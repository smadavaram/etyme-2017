import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { as, req, json, freshWorld, prisma } from './harness'
import { GET as openLink } from '@/app/api/bench-invite/[token]/route'
import { signInvite } from '@/lib/bench-invite'

/**
 * Her yes page shows the rate range she is saying yes to, on the seeded
 * world (founder, 2026-11-16).
 *
 * Marisol Quintero is asked by Brightmoor Staffing and has not answered.
 * Before her yes Brightmoor may save any range on its ask, and her lowest
 * rate is never checked then. So the link shows her the range, and, only
 * where she is the one signed in, says when it is under the lowest rate
 * on her own record. Brightmoor holds the same link (Copy link on Bench),
 * and what it reads never moves with her lowest rate.
 */

const BRIGHTMOOR = 'world-brightmoor@demo.etyme.local'
const withToken = (token: string) => ({ params: Promise.resolve({ token }) })
const open = async (t: string) => json(await openLink(req('GET', `/api/bench-invite/${t}`), withToken(t)))
const nobody = () => { delete process.env.DEV_BYPASS_AUTH }

let listingId = ''
let profileId = ''
let herEmail = ''
let token = ''
let before: { rateMin: number | null; rateMax: number | null; floor: number | null } = { rateMin: null, rateMax: null, floor: null }

beforeAll(async () => {
  await freshWorld()
  process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'integration-test-secret'
  const l = await prisma.benchListing.findFirstOrThrow({
    where: { consultant: { person: { name: 'Marisol Quintero' } }, company: { slug: 'world-brightmoor' } },
    select: { id: true, rateMin: true, rateMax: true, consultant: { select: { id: true, rateFloor: true, person: { select: { primaryEmail: true } } } } },
  })
  listingId = l.id
  profileId = l.consultant.id
  herEmail = l.consultant.person.primaryEmail
  before = { rateMin: l.rateMin, rateMax: l.rateMax, floor: l.consultant.rateFloor }
  token = signInvite(l.id)
  await prisma.benchListing.update({ where: { id: listingId }, data: { state: 'INVITED', rateMin: 8_000, rateMax: 9_000 } })
  await prisma.consultantProfile.update({ where: { id: profileId }, data: { rateFloor: 9_700 } })
}, 180_000)

afterAll(async () => {
  nobody()
  await prisma.benchListing.update({ where: { id: listingId }, data: { rateMin: before.rateMin, rateMax: before.rateMax } })
  await prisma.consultantProfile.update({ where: { id: profileId }, data: { rateFloor: before.floor } })
})

describe('the rate range on the link Marisol Quintero is emailed', () => {
  it('her yes page shows the rate range the firm saved before she says yes', async () => {
    nobody()
    const r = await open(token)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.awaiting).toBe(true)
    expect(r.body.data.range).toEqual({ says: 'Brightmoor Staffing will put you forward at $80–$90 an hour.', belowFloor: null })
  })

  it('where the range is below her own lowest rate, she is told before she says yes, and the firm is told nothing', async () => {
    // She, signed in, reads her own lowest rate beside the range.
    as(herEmail)
    const hers = await open(token)
    expect(hers.body.data.range).toEqual({
      says: 'Brightmoor Staffing will put you forward at $80–$90 an hour.',
      belowFloor: 'This is below the lowest rate on your record, $97 an hour, if that rate is in USD.',
    })

    // Brightmoor, holding the same link, reads the range and nothing of her floor,
    // and its reply is the same whether her floor is above the range, below it, or not set.
    as(BRIGHTMOOR)
    const above = await open(token)
    expect(above.body.data.range).toEqual({ says: 'Brightmoor Staffing will put you forward at $80–$90 an hour.', belowFloor: null })
    expect(JSON.stringify(above.body)).not.toMatch(/97|lowest rate/)
    await prisma.consultantProfile.update({ where: { id: profileId }, data: { rateFloor: 7_000 } })
    const under = await open(token)
    await prisma.consultantProfile.update({ where: { id: profileId }, data: { rateFloor: null } })
    const none = await open(token)
    expect(under.body).toEqual(above.body)
    expect(none.body).toEqual(above.body)

    // Nobody signed in reads the same as Brightmoor.
    await prisma.consultantProfile.update({ where: { id: profileId }, data: { rateFloor: 9_700 } })
    nobody()
    expect((await open(token)).body).toEqual(above.body)
  })

  it('where her lowest rate is at or under the top of the range, she is told nothing about it', async () => {
    await prisma.consultantProfile.update({ where: { id: profileId }, data: { rateFloor: 9_000 } })
    as(herEmail)
    expect((await open(token)).body.data.range).toEqual({ says: 'Brightmoor Staffing will put you forward at $80–$90 an hour.', belowFloor: null })
    await prisma.consultantProfile.update({ where: { id: profileId }, data: { rateFloor: 9_700 } })
  })

  it('where no range was saved, her yes page says nothing about a range', async () => {
    await prisma.benchListing.update({ where: { id: listingId }, data: { rateMin: null, rateMax: null } })
    as(herEmail)
    expect((await open(token)).body.data.range).toBeNull()
    await prisma.benchListing.update({ where: { id: listingId }, data: { rateMin: 8_000, rateMax: 9_000 } })
  })
})
