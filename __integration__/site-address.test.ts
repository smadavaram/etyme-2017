import { describe, it, expect, beforeAll } from 'vitest'
import { freshWorld, prisma, as, req, json } from './harness'
import { GET as sites, POST as addSite, PATCH as editSite } from '@/app/api/settings/locations/route'
import { PUT as saveItem } from '@/app/api/settings/setup/[item]/route'
import { corvaneSeatEmail } from '@/lib/seed-corvane'

/**
 * A site's address on the seeded world, from the tester's fix list of
 * 2026-11-14 (A5, G5): a ZIP box kept in its own column, a country typed
 * as a name read as its code, and nothing cut or dropped without a word.
 */

const OWNER = corvaneSeatEmail('owner', 'demo.etyme.local')
const put = (item: string, body: unknown) => saveItem(req('PUT', `/api/settings/setup/${item}`, body), { params: { item } })
let corvaneId = ''

beforeAll(async () => {
  await freshWorld()
  corvaneId = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-corvane' } })).id
}, 600_000)

describe('a site’s address is saved as typed, and read back', () => {
  it('a site added with a country name and a ZIP is saved as its code with the ZIP, and reads back when opened', async () => {
    as(OWNER)
    const made = await json(await addSite(req('POST', '/api/settings/locations', {
      name: 'North yard', address: '100 Dock Road', city: 'Toledo', state: 'OH', postalCode: '43604', country: 'United States', timeZone: 'America/New_York',
    })))
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    const row = await prisma.companyLocation.findUniqueOrThrow({ where: { id: made.body.data.location.id } })
    expect(row).toMatchObject({ companyId: corvaneId, country: 'US', postalCode: '43604', address: '100 Dock Road', timeZone: 'America/New_York' })
    const back = await json(await sites(req('GET', '/api/settings/locations')))
    expect(back.body.data.sites.find((s: any) => s.id === row.id)).toMatchObject({ postalCode: '43604', country: 'US' })
  })

  it('a country that is neither two letters nor a name is refused in a sentence beside the box, and nothing is saved', async () => {
    as(OWNER)
    const before = await prisma.companyLocation.count({ where: { companyId: corvaneId } })
    const r = await json(await addSite(req('POST', '/api/settings/locations', { name: 'Nowhere yard', country: 'Narnia' })))
    expect(r.status).toBe(422)
    expect(r.body.error).toMatchObject({ field: 'country', message: 'Type the country as two letters, such as US, or as its name. “Narnia” is neither.' })
    expect(await prisma.companyLocation.count({ where: { companyId: corvaneId } })).toBe(before)
  })

  it('a time zone nothing knows is refused beside its box, and the site keeps the one it had', async () => {
    as(OWNER)
    const r = await json(await editSite(req('PATCH', '/api/settings/locations', { id: 'cv_site_dayton', timeZone: 'Central' })))
    expect(r.status).toBe(422)
    expect(r.body.error.field).toBe('timeZone')
    expect((await prisma.companyLocation.findUniqueOrThrow({ where: { id: 'cv_site_dayton' } })).timeZone).toBe('America/New_York')
  })

  it('a ZIP added to a site saved before the box is kept, and the site’s other answers are unchanged', async () => {
    as(OWNER)
    const was = await prisma.companyLocation.findUniqueOrThrow({ where: { id: 'cv_site_dayton' } })
    expect(was.postalCode).toBeNull()
    const r = await json(await editSite(req('PATCH', '/api/settings/locations', { id: 'cv_site_dayton', postalCode: '45402' })))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const now = await prisma.companyLocation.findUniqueOrThrow({ where: { id: 'cv_site_dayton' } })
    expect(now).toMatchObject({ postalCode: '45402', country: was.country, city: was.city, timeZone: was.timeZone, region: was.region })
  })
})

describe('Setup reads a country and a time zone the same way', () => {
  it('a legal address typed with a country name is kept as its code, with its ZIP', async () => {
    as(OWNER)
    const r = await json(await put('addresses', { legal: { street: '1 Commerce Way', city: 'Dayton', state: 'OH', postalCode: '45402', country: 'United States' }, billingSameAsLegal: true }))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const legal = await prisma.companyAddress.findUniqueOrThrow({ where: { companyId_kind: { companyId: corvaneId, kind: 'LEGAL' } } })
    expect(legal).toMatchObject({ country: 'US', postalCode: '45402' })
  })

  it('a legal address with a country nobody can read is refused in a sentence that names the address', async () => {
    as(OWNER)
    const r = await json(await put('addresses', { legal: { street: '1 Commerce Way', city: 'Dayton', country: 'Narnia' }, billingSameAsLegal: true }))
    expect(r.status).toBe(422)
    expect(r.body.error.message).toBe('Legal address: Type the country as two letters, such as US, or as its name. “Narnia” is neither.')
  })

  it('a time zone typed in Setup that nothing knows is refused in a sentence, never dropped', async () => {
    as(OWNER)
    const r = await json(await put('company', { legalName: 'Corvane Packaging', timeZone: 'Central' }))
    expect(r.status).toBe(422)
    expect(r.body.error.message).toBe('“Central” is not a time zone name. Type one like America/Chicago or Europe/London.')
  })

  it('the time zone typed in Setup lands on the site the box was read from, and an empty box clears it', async () => {
    as(OWNER)
    const site = await prisma.companyLocation.findFirstOrThrow({ where: { companyId: corvaneId }, orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] })
    const set = await json(await put('company', { legalName: 'Corvane Packaging', timeZone: 'America/Chicago' }))
    expect(set.status, JSON.stringify(set.body)).toBe(200)
    expect(set.body.data.detail.COMPANY.timeZone).toBe('America/Chicago')
    expect((await prisma.companyLocation.findUniqueOrThrow({ where: { id: site.id } })).timeZone).toBe('America/Chicago')
    const cleared = await json(await put('company', { legalName: 'Corvane Packaging', timeZone: '' }))
    expect(cleared.status).toBe(200)
    expect((await prisma.companyLocation.findUniqueOrThrow({ where: { id: site.id } })).timeZone).toBeNull()
  })
})
