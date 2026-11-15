import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { POST as addConsultant } from '@/app/api/consultants/route'
import { POST as createListing } from '@/app/api/bench/listings/route'
import { PATCH as editListing } from '@/app/api/bench/listings/[id]/route'

/**
 * Her lowest rate is never read off a refusal before her yes (the reader
 * of a626b0b18, item 1), through the real routes. Every firm and person
 * here is made up, on reserved domains.
 */

const NW_OWNER = 'owner@northwind-staffing.example'
const FLOOR = 6_000

let nwId = ''
const id: Record<string, string> = {}

async function firm(name: string, slug: string, owner: string, ownerName: string) {
  const c = await prisma.company.create({ data: { name, slug, kind: 'VENDOR', currency: 'USD' } })
  const role = await prisma.role.create({ data: { companyId: c.id, name: 'Owner', permissions: ['*'], isDefault: true } })
  const p = await prisma.person.create({ data: { name: ownerName, primaryEmail: owner } })
  await prisma.context.create({ data: { personId: p.id, companyId: c.id, roleId: role.id, type: 'EMPLOYEE', grantReason: 'owner' } })
  return c.id
}

/** A person with an account of her own, her own lowest rate, and another firm that once listed her. */
async function withAccount(key: string, name: string, email: string, otherFirmId: string) {
  const p = await prisma.person.create({ data: { name, primaryEmail: email, passwordHash: 'not-a-real-hash' } })
  const c = await prisma.consultantProfile.create({ data: { personId: p.id, headline: `${name}’s own headline`, skills: ['Commissioning'], rateFloor: FLOOR } })
  await prisma.benchListing.create({ data: { consultantId: c.id, companyId: otherFirmId, tier: 'MARKETING', state: 'GRANTED', revokedAt: new Date() } })
  id[key] = c.id
}

const listingOf = (consultantId: string) =>
  prisma.benchListing.findUniqueOrThrow({ where: { consultantId_companyId: { consultantId, companyId: nwId } } })

/** Every figure in an answer, so two answers can be compared for anything that moves with her floor. */
const figures = (body: unknown) => JSON.stringify(body).match(/\d+/g) ?? []

beforeAll(async () => {
  await resetDatabase()
  process.env.NEXTAUTH_SECRET = 'integration-test-secret'
  process.env.NEXTAUTH_URL = 'http://localhost:3000'

  nwId = await firm('Northwind Staffing', 'northwind-staffing', NW_OWNER, 'Nell Aster')
  const hlId = await firm('Harborline Tech', 'harborline-tech', 'owner@harborline-tech.example', 'Hal Brook')

  await withAccount('tove', 'Tove Lindqvist', 'tove.lindqvist@example.invalid', hlId)
  await withAccount('uma', 'Uma Okoro', 'uma.okoro@example.invalid', hlId)

  as(NW_OWNER)
  for (const [key, typed, email] of [['tove', 'T. Lindqvist', 'tove.lindqvist@example.invalid'], ['uma', 'U. Okoro', 'uma.okoro@example.invalid']]) {
    const r = await json(await addConsultant(req('POST', '/api/consultants', { name: typed, email })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.consultant.id).toBe(id[key])
  }
  // Tove took Northwind's ask back, so Add to bench asks her afresh.
  await prisma.benchListing.update({
    where: { consultantId_companyId: { consultantId: id.tove, companyId: nwId } },
    data: { revokedAt: new Date() },
  })

  // Zora: a record Northwind made itself, with no account. Every word on
  // it is Northwind's, her lowest rate included.
  const z = await json(await addConsultant(req('POST', '/api/consultants', { name: 'Zora Vance', email: 'zora.vance@example.invalid' })))
  expect(z.status, JSON.stringify(z.body)).toBe(201)
  id.zora = z.body.data.consultant.id
  await prisma.consultantProfile.update({ where: { id: id.zora }, data: { rateFloor: FLOOR } })
}, 180_000)

describe('A firm that has only asked her cannot read her lowest rate', () => {
  it('a firm that has only asked her cannot learn her lowest rate by trying rates', async () => {
    as(NW_OWNER)
    const listing = await listingOf(id.uma)
    expect(listing.state).toBe('INVITED')
    const tries = [FLOOR - 1_000, FLOOR - 1, FLOOR, FLOOR + 1, FLOOR + 1_000]
    const answers = []
    for (const max of tries) {
      const r = await json(await editListing(req('PATCH', `/api/bench/listings/${listing.id}`, { rateMin: 100, rateMax: max }), { params: Promise.resolve({ id: listing.id }) }))
      answers.push(r)
    }
    // The same status every time, and the same answer once the rate it was sent is taken out.
    expect(new Set(answers.map((a) => a.status))).toEqual(new Set([200]))
    for (const [i, a] of answers.entries()) {
      expect(a.body.data.listing.rateMax).toBe(tries[i])
      expect(JSON.stringify(a.body)).not.toContain('Uma Okoro')
    }
    const shapes = answers.map((a) => a.body.data.message.replace(/is now .* an hour\./, 'is now (the rate sent) an hour.'))
    expect(new Set(shapes).size).toBe(1)
    expect((await listingOf(id.uma)).rateMax).toBe(FLOOR + 1_000)
  })

  it('Add to bench saves a range below her lowest rate before her yes, and says nothing of it', async () => {
    as(NW_OWNER)
    const r = await json(await createListing(req('POST', '/api/bench/listings', { consultantId: id.tove, tier: 'MARKETING', rateMin: 1_000, rateMax: FLOOR - 1 })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(figures(r.body)).not.toContain(String(FLOOR))
    expect(JSON.stringify(r.body)).not.toMatch(/lowest rate|floor/i)
    expect((await listingOf(id.tove)).rateMax).toBe(FLOOR - 1)
  })

  it('where the firm reads her lowest rate, a range under it is refused in a sentence with no figure', async () => {
    as(NW_OWNER)
    const listing = await listingOf(id.zora)
    const r = await json(await editListing(req('PATCH', `/api/bench/listings/${listing.id}`, { rateMin: 100, rateMax: FLOOR - 1 }), { params: Promise.resolve({ id: listing.id }) }))
    expect(r.status).toBe(422)
    expect(r.body.error.message).toBe('The highest rate is under the least Zora Vance said they take an hour.')
    const ok = await json(await editListing(req('PATCH', `/api/bench/listings/${listing.id}`, { rateMin: 100, rateMax: FLOOR }), { params: Promise.resolve({ id: listing.id }) }))
    expect(ok.status, JSON.stringify(ok.body)).toBe(200)
  })
})
