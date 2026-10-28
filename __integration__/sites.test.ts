import { describe, it, expect, beforeAll } from 'vitest'
import { freshWorld, prisma, as, req, json } from './harness'
import { GET as sites, PATCH as editSite, DELETE as deleteSite } from '@/app/api/settings/locations/route'
import { PUT as nameSuppliers } from '@/app/api/settings/locations/[id]/suppliers/route'
import { corvaneSeatEmail } from '@/lib/seed-corvane'
import { approvedSuppliersOf, checkSiteSupplier, jobSiteDefaults } from '@/lib/sites'

/**
 * Settings → Sites on the seeded world (founder, 2026-10-28, "Build it,
 * sites sounds good"): Corvane's plants as drawn, the suppliers a site
 * may name, and every refusal in a sentence.
 */

const DOMAIN = 'demo.etyme.local'
const OWNER = corvaneSeatEmail('owner', DOMAIN)
const params = (id: string) => ({ params: Promise.resolve({ id }) })
let corvaneId = ''

/** Somebody seated at a firm whose role holds `permission` (or everything). */
async function seatHolding(companyId: string, permission: string): Promise<string> {
  const ctx = await prisma.context.findFirstOrThrow({
    where: { companyId, type: 'EMPLOYEE', revokedAt: null, role: { OR: [{ permissions: { has: '*' } }, { permissions: { has: permission } }] } },
    select: { person: { select: { primaryEmail: true } } },
    orderBy: { grantedAt: 'asc' },
  })
  return ctx.person.primaryEmail
}

beforeAll(async () => {
  await freshWorld()
  corvaneId = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-corvane' } })).id
}, 600_000)

describe('Corvane’s sites, as the drawing has them', () => {
  it('Corvane’s Dayton site names three suppliers and Marcus Hollins', async () => {
    as(OWNER)
    const r = await json(await sites(req('GET', '/api/settings/locations')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.sites).toHaveLength(31)
    const dayton = r.body.data.sites.find((s: any) => s.id === 'cv_site_dayton')
    expect(dayton.suppliers.map((s: any) => s.name)).toEqual(['Harbor Industrial Labor', 'Keystone Crew Partners', 'Ridgeline Staffing'])
    expect(dayton.everyApproved).toBe(false)
    expect(dayton.managers.map((m: any) => [m.name, m.from])).toEqual([['Marcus Hollins', 'JOBS']])
    expect(dayton).toMatchObject({ contractors: 14, source: 'IMPORT', region: 'United States', timeZone: 'America/New_York' })
    // Lakemont is approved for Corvane and not named at Dayton: a tick waiting, not a refusal.
    expect(r.body.data.approved.map((f: any) => f.name)).toContain('Lakemont Workforce')
    expect(r.body.data.regionalManagers['United States']).toBe('Dana Whitcombe')
  })

  it('every Corvane plant names a hiring manager read from the jobs they posted there', async () => {
    as(OWNER)
    const r = await json(await sites(req('GET', '/api/settings/locations')))
    for (const s of r.body.data.sites) expect(s.managers.length, s.name).toBeGreaterThan(0)
  })

  it('a job at Dayton goes to Dayton’s three suppliers, and Lakemont is refused there in a sentence that says to ask Procurement', async () => {
    const d = await jobSiteDefaults(corvaneId, 'cv_site_dayton')
    expect(d.suppliers.map((f) => f.name)).toEqual(['Harbor Industrial Labor', 'Keystone Crew Partners', 'Ridgeline Staffing'])
    const lakemont = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-cv-lakemont-workforce' } })
    expect(await checkSiteSupplier('cv_site_dayton', lakemont.id)).toEqual({
      ok: false, says: 'Lakemont Workforce is not approved at Dayton. Ask Procurement to add them to this site, or pick another supplier.',
    })
    // With no site picked, the primary site, said so.
    expect((await jobSiteDefaults(corvaneId, null)).says).toMatch(/^No site was picked, so the job is posted at Dayton, Ohio\./)
  })
})

describe('a site names only suppliers approved for the company', () => {
  it('names an approved firm at a site with who and when', async () => {
    as(OWNER)
    const lakemont = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-cv-lakemont-workforce' } })
    const named = (await prisma.siteSupplier.findMany({ where: { locationId: 'cv_site_greenville' } })).map((s) => s.supplierCompanyId)
    const ids = [...new Set([...named, lakemont.id])]
    const r = await json(await nameSuppliers(req('PUT', '/api/settings/locations/cv_site_greenville/suppliers', { supplierIds: ids }), params('cv_site_greenville')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const owner = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: OWNER } })
    expect(await prisma.siteSupplier.findUniqueOrThrow({ where: { locationId_supplierCompanyId: { locationId: 'cv_site_greenville', supplierCompanyId: lakemont.id } } }))
      .toMatchObject({ namedById: owner.id, source: 'PERSON' })
  })

  it('refuses a firm on probation with nothing signed, and writes nothing', async () => {
    const firm = await prisma.company.create({ data: { name: 'Quarry Temps', slug: 'sites-quarry-temps', kind: 'VENDOR' } })
    await prisma.counterparty.create({ data: { companyId: corvaneId, otherCompanyId: firm.id, relationship: 'SUPPLIER', tier: 'PROBATION' } })
    expect((await approvedSuppliersOf(corvaneId)).map((f) => f.id)).not.toContain(firm.id)
    as(OWNER)
    const r = await json(await nameSuppliers(req('PUT', '/api/settings/locations/cv_site_dayton/suppliers', { supplierIds: [firm.id] }), params('cv_site_dayton')))
    expect(r.status).toBe(409)
    expect(r.body.error.message).toBe('Quarry Temps is not approved for Corvane Packaging. Procurement approves a firm first, under Suppliers; then any site may name it.')
    expect(await prisma.siteSupplier.count({ where: { locationId: 'cv_site_dayton' } })).toBe(3)
  })
})

describe('who may change a site', () => {
  it('a supplier cannot edit a client’s site', async () => {
    const ridgeline = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-cv-ridgeline-staffing' } })
    as(await seatHolding(ridgeline.id, 'settings.manage'))
    const edit = await json(await editSite(req('PATCH', '/api/settings/locations', { id: 'cv_site_dayton', address: '1 Plant Way' })))
    expect(edit.status).toBe(403)
    expect(edit.body.error.message).toBe("Sites are Corvane Packaging's own to set. Its Owner, Admin or Procurement changes them.")
    const tick = await json(await nameSuppliers(req('PUT', '/api/settings/locations/cv_site_dayton/suppliers', { supplierIds: [ridgeline.id] }), params('cv_site_dayton')))
    expect(tick.status).toBe(403)
    const read = await json(await sites(req('GET', `/api/settings/locations?companyId=${corvaneId}`)))
    expect(read.status).toBe(403)
    expect((await prisma.companyLocation.findUniqueOrThrow({ where: { id: 'cv_site_dayton' } })).address).toBeNull()
  })

  it('an MSP seated in a client’s program cannot edit the client’s site', async () => {
    const seat = await prisma.programSeat.findFirstOrThrow({ select: { officeCompanyId: true, clientCompanyId: true, clientCompany: { select: { name: true } } } })
    const site = await prisma.companyLocation.findFirstOrThrow({ where: { companyId: seat.clientCompanyId } })
    as(await seatHolding(seat.officeCompanyId, 'settings.manage'))
    const r = await json(await editSite(req('PATCH', '/api/settings/locations', { id: site.id, name: 'Renamed by the MSP' })))
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe(`Sites are ${seat.clientCompany.name}'s own to set. Its Owner, Admin or Procurement changes them.`)
  })

  it('a regional manager cannot edit a site outside her region', async () => {
    // Her role is given the settings desk for this story, so the region is the only thing that refuses her.
    const valeria = await prisma.context.findFirstOrThrow({ where: { id: 'cv_ctx_region_latam' }, select: { roleId: true } })
    const role = await prisma.role.findUniqueOrThrow({ where: { id: valeria.roleId! } })
    await prisma.role.update({ where: { id: role.id }, data: { permissions: [...role.permissions, 'settings.manage'] } })
    as(corvaneSeatEmail('region-latam', DOMAIN))
    const read = await json(await sites(req('GET', '/api/settings/locations')))
    expect(read.status, JSON.stringify(read.body)).toBe(200)
    expect(read.body.data.sites.every((s: any) => s.region === 'Latin America')).toBe(true)
    expect(read.body.data.sites).toHaveLength(6)
    const out = await json(await editSite(req('PATCH', '/api/settings/locations', { id: 'cv_site_dayton', address: '1 Plant Way' })))
    expect(out.status).toBe(403)
    expect(out.body.error.message).toBe('Dayton, Ohio is in United States, and your seat covers Latin America only. Ask an Owner or Admin to change it.')
    const own = await json(await editSite(req('PATCH', '/api/settings/locations', { id: 'cv_site_monterrey', address: 'Av. Industrial 100' })))
    expect(own.status, JSON.stringify(own.body)).toBe(200)
    const moved = await json(await editSite(req('PATCH', '/api/settings/locations', { id: 'cv_site_monterrey', region: 'United States' })))
    expect(moved.status).toBe(403)
    await prisma.role.update({ where: { id: role.id }, data: { permissions: role.permissions } })
  })

  it('a site with placements cannot be deleted', async () => {
    as(OWNER)
    const live = await prisma.sellContract.count({ where: { workLocationId: 'cv_site_dayton', state: { notIn: ['ENDED', 'CANCELLED'] } } })
    expect(live).toBeGreaterThan(0)
    const r = await json(await deleteSite(req('DELETE', '/api/settings/locations?id=cv_site_dayton')))
    expect(r.status).toBe(409)
    expect(r.body.error.message).toBe(`Dayton, Ohio has ${live} placements at it. Move the ${live} placements at Dayton first.`)
    expect(await prisma.companyLocation.count({ where: { id: 'cv_site_dayton' } })).toBe(1)
  })
})

describe('no seeded client reads an empty Sites page', () => {
  it('Northbend, Cavanaugh and Talvern each have a primary site that names suppliers approved for them', async () => {
    for (const slug of ['world-nike', 'world-corning', 'world-terumo-bct']) {
      const co = await prisma.company.findUniqueOrThrow({ where: { slug } })
      const primary = await prisma.companyLocation.findFirstOrThrow({ where: { companyId: co.id, isPrimary: true } })
      const named = await prisma.siteSupplier.findMany({ where: { locationId: primary.id } })
      const approved = new Set((await approvedSuppliersOf(co.id)).map((f) => f.id))
      expect(named.length, slug).toBeGreaterThan(0)
      for (const n of named) expect(approved.has(n.supplierCompanyId), slug).toBe(true)
    }
  })
})
