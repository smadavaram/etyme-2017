import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { as, req, json, freshWorld, prisma } from './harness'
import { GET as myBenches } from '@/app/api/me/benches/route'
import { GET as bench } from '@/app/api/bench/route'
import { GET as candidates } from '@/app/api/consultants/route'
import { PATCH as patchListing } from '@/app/api/bench/listings/[id]/route'
import { firmReadsAt } from '@/lib/consultant-portfolio/before-her-yes'
import { resendListingId } from '@/lib/consultant-portfolio/bench-invites'

/**
 * Layer four of the fix list, the bench's own share, on the seeded world
 * (founder, 2026-11-16).
 *
 * Marisol Quintero is asked by Brightmoor Staffing and has not answered.
 * Her own My benches page shows the range Brightmoor saved, in
 * Brightmoor's currency, above the yes, and where its top is under the
 * lowest rate on her own record, she alone is told. Brightmoor reads
 * nothing that moves with her lowest rate. A rate Brightmoor saves on
 * the ask says she has not answered yet, by the name it typed. And she
 * is a sample person, on an address no email reaches, so Candidates
 * offers no Resend on her row.
 */

const BRIGHTMOOR = 'world-brightmoor@demo.etyme.local'
const params = (id: string) => ({ params: Promise.resolve({ id }) })

let listingId = ''
let profileId = ''
let companyId = ''
let herEmail = ''
let before: {
  state: string; rateMin: number | null; rateMax: number | null; floor: number | null; currency: string
} = { state: 'GRANTED', rateMin: null, rateMax: null, floor: null, currency: 'USD' }

const mine = async () => {
  as(herEmail)
  const r = await json(await myBenches(req('GET', '/api/me/benches')))
  expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBe(200)
  return (r.body.data.invited as any[]).find((a) => a.listingId === listingId)
}

beforeAll(async () => {
  await freshWorld()
  const l = await prisma.benchListing.findFirstOrThrow({
    where: { consultant: { person: { name: 'Marisol Quintero' } }, company: { slug: 'world-brightmoor' } },
    select: {
      id: true, state: true, rateMin: true, rateMax: true,
      company: { select: { id: true, homeCurrency: true } },
      consultant: { select: { id: true, rateFloor: true, person: { select: { primaryEmail: true } } } },
    },
  })
  listingId = l.id
  profileId = l.consultant.id
  companyId = l.company.id
  herEmail = l.consultant.person.primaryEmail
  before = { state: l.state, rateMin: l.rateMin, rateMax: l.rateMax, floor: l.consultant.rateFloor, currency: l.company.homeCurrency }
  await prisma.benchListing.update({ where: { id: listingId }, data: { state: 'INVITED', rateMin: 8_000, rateMax: 9_000, revokedAt: null } })
  await prisma.consultantProfile.update({ where: { id: profileId }, data: { rateFloor: 9_700 } })
}, 600_000)

afterAll(async () => {
  await prisma.benchListing.update({ where: { id: listingId }, data: { state: before.state, rateMin: before.rateMin, rateMax: before.rateMax } })
  await prisma.consultantProfile.update({ where: { id: profileId }, data: { rateFloor: before.floor } })
  await prisma.company.update({ where: { id: companyId }, data: { homeCurrency: before.currency } })
})

describe('the rate range on her own My benches page', () => {
  it('her own page shows the range she is saying yes to, in the firm’s currency', async () => {
    await prisma.company.update({ where: { id: companyId }, data: { homeCurrency: 'USD' } })
    const ask = await mine()
    expect(ask, 'Brightmoor’s ask is under Asking to market you').toBeTruthy()
    expect(ask.range.says).toBe('Brightmoor Staffing will put you forward at $80–$90 an hour.')

    // A firm that keeps its books in pounds says its range in pounds.
    await prisma.company.update({ where: { id: companyId }, data: { homeCurrency: 'GBP' } })
    const pounds = await mine()
    await prisma.company.update({ where: { id: companyId }, data: { homeCurrency: 'USD' } })
    expect(pounds.range.says).toMatch(/^Brightmoor Staffing will put you forward at £80–£90 an hour\.$/)
  })

  it('where it is below her own lowest rate, she is told, and the firm reads nothing', async () => {
    const ask = await mine()
    expect(ask.range.belowFloor).toBe('This is below the lowest rate on your record, $97 an hour.')

    // At or under the top of the range, nothing is said about it.
    await prisma.consultantProfile.update({ where: { id: profileId }, data: { rateFloor: 9_000 } })
    expect((await mine()).range.belowFloor).toBeNull()
    await prisma.consultantProfile.update({ where: { id: profileId }, data: { rateFloor: 9_700 } })

    // Reading her page writes nothing Brightmoor reads.
    const logs = () => prisma.automationLog.count({ where: { companyId } })
    const told = () => prisma.notification.count({ where: { companyId } })
    const [logsBefore, toldBefore] = [await logs(), await told()]
    await mine()
    expect(await logs()).toBe(logsBefore)
    expect(await told()).toBe(toldBefore)

    // What Brightmoor reads of her, on Bench and on Candidates, is the
    // same whether her lowest rate is above its range, under it, or unset.
    const theirRead = async () => {
      as(BRIGHTMOOR)
      const b = await json(await bench(req('GET', '/api/bench?scope=company')))
      const c = await json(await candidates(req('GET', '/api/consultants?limit=100')))
      expect(b.status).toBe(200)
      expect(c.status).toBe(200)
      // Asked and not answered: listed under `asked`, never under a tier.
      const row = ([...(Object.values(b.body.data?.tiers ?? {}).flat() as any[]), ...(b.body.data?.asked ?? [])]).find((x) => x.id === listingId) ?? null
      const card = (c.body.data.consultants as any[]).find((x) => x.id === profileId) ?? null
      expect(row, 'her row on Brightmoor’s Bench').toBeTruthy()
      expect(card, 'her row on Brightmoor’s Candidates').toBeTruthy()
      return JSON.stringify({ row, card })
    }
    const above = await theirRead()
    expect(above).not.toMatch(/lowest rate on your record/)
    await prisma.consultantProfile.update({ where: { id: profileId }, data: { rateFloor: 7_000 } })
    const under = await theirRead()
    await prisma.consultantProfile.update({ where: { id: profileId }, data: { rateFloor: null } })
    const none = await theirRead()
    await prisma.consultantProfile.update({ where: { id: profileId }, data: { rateFloor: 9_700 } })
    expect(under).toBe(above)
    expect(none).toBe(above)
  })
})

describe('a rate saved on somebody asked who has not answered', () => {
  it('says she has not answered yet, by the name the firm typed, and never that she is on the bench', async () => {
    // Her lowest rate is not what is tested here; unset, nothing refuses.
    await prisma.consultantProfile.update({ where: { id: profileId }, data: { rateFloor: null } })
    as(BRIGHTMOOR)
    const seat = await prisma.context.findFirstOrThrow({
      where: { companyId, revokedAt: null, person: { primaryEmail: BRIGHTMOOR } },
      select: { personId: true },
    })
    const read = (await firmReadsAt({ companyId, callerPersonId: seat.personId, consultantIds: [profileId] })).get(profileId)
    const name = read?.typed ? read.typed.name : 'Marisol Quintero'
    const r = await json(await patchListing(req('PATCH', `/api/bench/listings/${listingId}`, { rateMin: 8_000, rateMax: 9_000 }), params(listingId)))
    await prisma.consultantProfile.update({ where: { id: profileId }, data: { rateFloor: 9_700 } })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.message).toBe(`${name} has not answered yet. The rate on your ask is now $80–$90 an hour.`)
    expect(r.body.data.message).not.toContain('already on your bench')
  })
})

describe('Candidates offers nothing to send to a sample person', () => {
  it('a sample person asked and not answered reads as a sample on her Candidates row, and no Resend is offered', async () => {
    as(BRIGHTMOOR)
    const c = await json(await candidates(req('GET', '/api/consultants?limit=100')))
    expect(c.status).toBe(200)
    const card = (c.body.data.consultants as any[]).find((x) => x.id === profileId)
    expect(card, 'Marisol is on Brightmoor’s Candidates list').toBeTruthy()
    expect(card.sample).toBe(true)
    expect(card.listings[0].consent).toBe('INVITED')
    expect(resendListingId(card, true)).toBeNull()
  })
})
