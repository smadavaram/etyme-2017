import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { GET as listConsultants, POST as addConsultant } from '@/app/api/consultants/route'
import { GET as oneConsultant } from '@/app/api/consultants/[id]/route'
import { GET as bench } from '@/app/api/bench/route'

/**
 * Before her yes, a firm reads only what it typed (fix list A4, 2026-11-15),
 * through the real routes. Firm B asks two addresses onto its bench: one
 * firm A keeps (A made the record), and one with an account of its own.
 * Every person and firm here is made up, on reserved domains.
 */

const A_OWNER = 'owner@keel-harbor.test'
const B_OWNER = 'owner@ridgeway-bench.test'
const HANA = 'hana.okafor@example.test'
const DEV = 'devika.patel@example.test'
let bId = ''
let hanaProfile = ''
let devProfile = ''

async function firm(name: string, slug: string, owner: string, ownerName: string) {
  const c = await prisma.company.create({ data: { name, slug, kind: 'VENDOR', currency: 'USD' } })
  const role = await prisma.role.create({ data: { companyId: c.id, name: 'Owner', permissions: ['*'], isDefault: true } })
  const p = await prisma.person.create({ data: { name: ownerName, primaryEmail: owner } })
  await prisma.context.create({ data: { personId: p.id, companyId: c.id, roleId: role.id, type: 'EMPLOYEE', grantReason: 'owner' } })
  return c.id
}

const rows = async (query = '') => {
  const r = await json(await listConsultants(req('GET', `/api/consultants${query}`)))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data.consultants as any[]
}

beforeAll(async () => {
  await resetDatabase()
  process.env.NEXTAUTH_SECRET = 'integration-test-secret'
  process.env.NEXTAUTH_URL = 'http://localhost:3000'

  await firm('Keel Harbor Staffing', 'keel-harbor', A_OWNER, 'Ansel Moreau')
  bId = await firm('Ridgeway Bench Partners', 'ridgeway-bench', B_OWNER, 'Bea Lindqvist')

  // Hana has an account of her own: a password, her own words, her résumé's education.
  const hana = await prisma.person.create({ data: { name: 'Hana Okafor', primaryEmail: HANA, passwordHash: 'not-a-real-hash' } })
  hanaProfile = (await prisma.consultantProfile.create({
    data: {
      personId: hana.id, headline: 'Clinical trial monitor', skills: ['Site monitoring'], location: 'Columbus',
      workAuth: 'GC', visibility: 'INTERNAL',
      education: [{ institution: 'Lakeview State University', qualification: 'B.S.', fieldOfStudy: 'Biology', year: 2014, quote: 'B.S. in Biology, Lakeview State University, 2014', source: 'RESUME' }],
    },
  })).id

  // Firm A makes Devika's record by asking her.
  as(A_OWNER)
  const a = await json(await addConsultant(req('POST', '/api/consultants', {
    name: 'Devika Patel', email: DEV, headline: 'Validation engineer', skills: ['Cleaning validation'], location: 'Raleigh', workAuth: 'H1B',
  })))
  expect(a.status, JSON.stringify(a.body)).toBe(201)
  devProfile = a.body.data.consultant.id

  // Firm B asks both.
  as(B_OWNER)
  const b1 = await json(await addConsultant(req('POST', '/api/consultants', { name: 'H. Okafor', email: HANA, headline: 'Study monitor' })))
  expect(b1.status, JSON.stringify(b1.body)).toBe(201)
  const b2 = await json(await addConsultant(req('POST', '/api/consultants', { name: 'D. Patel', email: DEV, headline: 'Commissioning lead' })))
  expect(b2.status, JSON.stringify(b2.body)).toBe(201)
}, 180_000)

describe('before her yes, a firm reads only what it typed', () => {
  it('a firm that has only asked somebody reads the name it typed and nothing of hers', async () => {
    as(B_OWNER)
    const list = await rows()
    const hana = list.find((r) => r.id === hanaProfile)
    const dev = list.find((r) => r.id === devProfile)
    expect(hana.person.name).toBe('H. Okafor')
    expect(hana.headline).toBe('Study monitor')
    expect(hana.skills).toEqual([])
    expect(hana.location).toBeNull()
    expect(hana.own).toEqual({ headline: null, skills: [], location: null })
    // A record firm A made is not firm B's to read either.
    expect(dev.person.name).toBe('D. Patel')
    expect(dev.headline).toBe('Commissioning lead')
    expect(dev.workAuth).toBeNull()
    // Its own listing still reads as its own: the tier and the consent.
    expect(hana.listings[0].consent).toBe('INVITED')
  })

  it('her own name, work authorization and education are not in the reply before her yes', async () => {
    as(B_OWNER)
    const text = JSON.stringify(await rows())
    for (const hers of ['Hana Okafor', 'Clinical trial monitor', 'Columbus', 'Lakeview State University', 'Site monitoring', 'Devika Patel', 'Validation engineer', 'Raleigh']) {
      expect(text, hers).not.toContain(hers)
    }
    const hana = (await rows()).find((r) => r.id === hanaProfile)
    expect(hana.workAuth).toBeNull()
    expect(hana.education).toBeNull()
    expect(hana.availableFrom).toBeNull()
    expect(hana.visibility).toBeNull()
    // And the one-person read says the same.
    const one = await json(await oneConsultant(req('GET', `/api/consultants/${hanaProfile}`), { params: Promise.resolve({ id: hanaProfile }) }))
    expect(one.status).toBe(200)
    expect(one.body.data.consultant.person.name).toBe('H. Okafor')
    expect(JSON.stringify(one.body)).not.toMatch(/Hana Okafor|Clinical trial monitor|Lakeview/)
    // And the Bench page's asked list.
    const b = await json(await bench(req('GET', '/api/bench?scope=company')))
    expect(b.status, JSON.stringify(b.body)).toBe(200)
    expect(JSON.stringify(b.body)).not.toMatch(/Hana Okafor|Clinical trial monitor|Devika Patel/)
  })

  it('a search by her own headline does not find her for a firm she has not said yes to', async () => {
    as(B_OWNER)
    expect((await rows('?q=Clinical')).map((r) => r.id)).not.toContain(hanaProfile)
    // Her own name as her record holds it; the address the firm typed is its own to search.
    expect((await rows('?q=Hana%20Okafor')).map((r) => r.id)).not.toContain(hanaProfile)
    expect((await rows('?q=Columbus')).map((r) => r.id)).not.toContain(hanaProfile)
    expect((await rows('?workAuth=GC')).map((r) => r.id)).not.toContain(hanaProfile)
    expect((await rows('?workAuth=H1B')).map((r) => r.id)).not.toContain(devProfile)
    expect((await rows('?skills=Site%20monitoring')).map((r) => r.id)).not.toContain(hanaProfile)
    // And it does find her by the name it typed, and by its own words.
    expect((await rows('?q=Okafor')).map((r) => r.id)).toContain(hanaProfile)
    expect((await rows('?q=Study%20monitor')).map((r) => r.id)).toContain(hanaProfile)
  })

  it('the firm that made the record still reads what it typed', async () => {
    as(A_OWNER)
    const dev = (await rows()).find((r) => r.id === devProfile)
    expect(dev.person.name).toBe('Devika Patel')
    expect(dev.headline).toBe('Validation engineer')
    expect(dev.workAuth).toBe('H1B')
    expect(dev.location).toBe('Raleigh')
    // Every ask keeps the name the firm typed on its own listing.
    const listing = await prisma.benchListing.findFirstOrThrow({ where: { consultantId: devProfile, company: { slug: 'keel-harbor' } } })
    expect(listing.firmName).toBe('Devika Patel')
    expect(listing.firmHeadline).toBe('Validation engineer')
    const asked = await prisma.benchListing.findFirstOrThrow({ where: { consultantId: hanaProfile, companyId: bId } })
    expect(asked.firmName).toBe('H. Okafor')
  })

  it('after her yes the firm reads her record as before', async () => {
    await prisma.benchListing.updateMany({ where: { consultantId: hanaProfile, companyId: bId }, data: { state: 'GRANTED', respondedAt: new Date() } })
    as(B_OWNER)
    const hana = (await rows()).find((r) => r.id === hanaProfile)
    expect(hana.person.name).toBe('Hana Okafor')
    expect(hana.workAuth).toBe('GC')
    expect(hana.education?.[0]?.says).toContain('Lakeview State University')
    // The firm's own words still lead where it typed them.
    expect(hana.headline).toBe('Study monitor')
    expect(hana.own.headline).toBe('Clinical trial monitor')
    expect((await rows('?q=Clinical')).map((r) => r.id)).toContain(hanaProfile)
  })
})
