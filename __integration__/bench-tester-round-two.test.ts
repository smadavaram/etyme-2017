import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, as, req, json, freshWorld } from './harness'
import { GET as bench } from '@/app/api/bench/route'
import { GET as profit } from '@/app/api/bench/profit/route'
import { PATCH as patchListing } from '@/app/api/bench/listings/[id]/route'

/**
 * The bench tester's second walk (2026-10-01), on the seeded world.
 * The rules are sentences in __tests__/invariants/bench-tester-round-two;
 * this is the same findings read through the routes a screen calls.
 */

const D = '@demo.etyme.local'
const PELLWRIGHT = `world-pellwright${D}`
const PELLWRIGHT_FINANCE = `world-pellwright-finance${D}`
const PELLWRIGHT_RECRUITER = `world-pellwright-recruiter${D}`
const SUNDARA = `world-sundara${D}`
const NORTHBEND = `world-nike${D}`
const params = (id: string) => ({ params: Promise.resolve({ id }) })

async function benchAs(email: string, scope: string) {
  as(email)
  return json(await bench(req('GET', `/api/bench?scope=${scope}`)))
}
const rowOf = (body: any, name: string) => {
  return listingsOf(body).find((l: any) => l.consultant?.person?.name === name)
}
const listingsOf = (body: any): any[] => Object.values(body.data?.tiers ?? {}).flat() as any[]

beforeAll(async () => {
  await freshWorld()
}, 600_000)

describe('who is free, read off the work on the firm’s own bench', () => {
  it('Pellwright’s bench reads somebody on no placement as free now, and somebody placed at a client as on a placement', async () => {
    const r = await benchAs(PELLWRIGHT, 'company')
    expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBe(200)
    const hector = rowOf(r.body, 'Hector Valdivia')
    const tobias = rowOf(r.body, 'Tobias Wren')
    expect(hector?.free?.state).toBe('NOW')
    expect(hector.free.says).toBe('Free now')
    expect(tobias?.free?.state).toBe('PLACED')
    expect(tobias.free.says).toMatch(/^On a placement (until|with no end date)/)
  })
})

describe('a partner’s bench', () => {
  it('sends no person’s email address to a firm that is not theirs', async () => {
    const r = await benchAs(SUNDARA, 'network')
    expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBe(200)
    const listings = listingsOf(r.body)
    expect(listings.length).toBeGreaterThan(0)
    for (const l of listings) expect(l.consultant.person.email, l.consultant.person.name).toBeNull()
  })
})

describe('a client never browses a bench', () => {
  it('Northbend Athletic is refused the partner bench and the listed bench in a sentence that points to matching', async () => {
    for (const scope of ['network', 'company']) {
      const r = await benchAs(NORTHBEND, scope)
      expect(r.status).toBe(403)
      expect(r.body.error.message).toContain('a client does not browse one')
      expect(r.body.error.message).toContain('Find matches')
    }
  })
})

describe('a desk that reads no people', () => {
  it('Pellwright’s finance desk is told whose page the bench is in a sentence, never a permission code', async () => {
    const r = await benchAs(PELLWRIGHT_FINANCE, 'company')
    expect(r.status).toBe(403)
    expect(r.body.error.message).not.toContain('consultants.read')
    expect(r.body.error.message).toContain('The bench at Pellwright Validation Partners is read by')
  })

  it('while bench profit opens for it, and the recruiter is refused bench profit in a sentence', async () => {
    as(PELLWRIGHT_FINANCE)
    expect((await json(await profit(req('GET', '/api/bench/profit')))).status).toBe(200)
    as(PELLWRIGHT_RECRUITER)
    const no = await json(await profit(req('GET', '/api/bench/profit')))
    expect(no.status).toBe(403)
    expect(no.body.error.message).toContain('is none of them')
  })
})

describe('bench profit counts what it says it counted', () => {
  it('every cost on the owner’s page reads the working days it was counted over, which times the day rate is the cost', async () => {
    as(PELLWRIGHT)
    const r = await json(await profit(req('GET', '/api/bench/profit')))
    const priced = (r.body.data.people as any[]).filter((p) => p.costCents != null && p.costCents > 0 && p.costCounted)
    expect(priced.length).toBeGreaterThan(0)
    for (const p of priced) {
      const m = (p.costCounted as string).match(/^(\d+) working days? of (\d+) at (\d+)% of \$([\d,.]+) a day/)
      expect(m, p.costCounted).not.toBeNull()
      const [, worked, of, pct, rate] = m!
      expect(Number(of)).toBe(p.days)
      const perDay = Math.round(Number(rate.replace(/,/g, '')) * 100 * Number(pct)) / 100
      expect(Math.round(Number(worked) * perDay), p.name).toBe(p.costCents)
    }
  })

  it('nobody only put forward to a job request is counted as a move', async () => {
    as(PELLWRIGHT)
    const r = await json(await profit(req('GET', '/api/bench/profit')))
    const holds = await prisma.projectHold.findMany({ where: { endedHow: 'PLACED', placedSellContractId: null }, select: { placedSubmissionId: true, person: { select: { name: true } } } })
    const unplaced = []
    for (const h of holds) {
      const s = h.placedSubmissionId ? await prisma.submission.findUnique({ where: { id: h.placedSubmissionId }, select: { status: true } }) : null
      if (s?.status !== 'PLACED') unplaced.push(h.person.name)
    }
    const moves = ((r.body.data.moves ?? []) as any[]).map((m) => m.name)
    for (const n of unplaced) expect(moves).not.toContain(n)
  })
})

describe('Add to bench on somebody already asked', () => {
  it('saves the rate onto the listing they have, and says so, instead of refusing them as a duplicate', async () => {
    const pell = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-pellwright' }, select: { id: true } })
    const listing = await prisma.benchListing.findFirstOrThrow({ where: { companyId: pell.id, revokedAt: null }, select: { id: true, consultant: { select: { person: { select: { name: true } }, rateFloor: true } } } })
    as(PELLWRIGHT)
    const low = Math.max(listing.consultant.rateFloor ?? 0, 7_000)
    const r = await json(await patchListing(req('PATCH', `/api/bench/listings/${listing.id}`, { rateMin: low, rateMax: low + 1_500 }), params(listing.id)))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.message).toContain(`${listing.consultant.person.name} is already on your bench. Their rate is now`)
    const saved = await prisma.benchListing.findUniqueOrThrow({ where: { id: listing.id }, select: { rateMin: true, rateMax: true } })
    expect(saved).toEqual({ rateMin: low, rateMax: low + 1_500 })
  })
})
