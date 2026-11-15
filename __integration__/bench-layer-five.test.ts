import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { GET as listConsultants, POST as addConsultant } from '@/app/api/consultants/route'
import { PATCH as editConsultant } from '@/app/api/consultants/[id]/route'
import { POST as createListing } from '@/app/api/bench/listings/route'

/**
 * Layer five of the fix list, the bench (2026-11-15), through the real
 * routes. Every firm and person here is made up, on reserved domains.
 */

const NW_OWNER = 'owner@northwind-staffing.example'
const HL_OWNER = 'owner@harborline-tech.example'
const CR_OWNER = 'owner@cobaltridge-partners.example'
const DAY = 86_400_000

let nwId = ''
let hlId = ''
let crId = ''
const id: Record<string, string> = {}
const personOf: Record<string, string> = {}

async function firm(name: string, slug: string, owner: string, ownerName: string) {
  const c = await prisma.company.create({ data: { name, slug, kind: 'VENDOR', currency: 'USD', outsideAccess: 'ALLOWED' } })
  const role = await prisma.role.create({ data: { companyId: c.id, name: 'Owner', permissions: ['*'], isDefault: true } })
  const p = await prisma.person.create({ data: { name: ownerName, primaryEmail: owner } })
  await prisma.context.create({ data: { personId: p.id, companyId: c.id, roleId: role.id, type: 'EMPLOYEE', grantReason: 'owner' } })
  return c.id
}

/** A person with an account of her own, and her own record. */
async function withAccount(key: string, name: string, email: string) {
  const p = await prisma.person.create({ data: { name, primaryEmail: email, passwordHash: 'not-a-real-hash' } })
  const c = await prisma.consultantProfile.create({ data: { personId: p.id, headline: `${name}’s own headline`, skills: ['Commissioning'] } })
  id[key] = c.id
  personOf[key] = p.id
}

/** Northwind asks somebody on Add consultant, under the name it types. */
async function northwindAdds(key: string, typed: string, email: string) {
  as(NW_OWNER)
  const r = await json(await addConsultant(req('POST', '/api/consultants', { name: typed, email, headline: 'Validation engineer' })))
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  id[key] = r.body.data.consultant.id
  personOf[key] = r.body.data.consultant.personId
}

const ask = async (consultantId: string) => json(await createListing(req('POST', '/api/bench/listings', { consultantId, tier: 'MARKETING' })))

beforeAll(async () => {
  await resetDatabase()
  process.env.NEXTAUTH_SECRET = 'integration-test-secret'
  process.env.NEXTAUTH_URL = 'http://localhost:3000'

  nwId = await firm('Northwind Staffing', 'northwind-staffing', NW_OWNER, 'Nell Aster')
  hlId = await firm('Harborline Tech', 'harborline-tech', HL_OWNER, 'Hal Brook')
  crId = await firm('Cobalt Ridge Partners', 'cobaltridge-partners', CR_OWNER, 'Cyra Dunn')
  // Northwind trades with Cobalt Ridge, and not with Harborline.
  await prisma.counterparty.create({ data: { companyId: nwId, otherCompanyId: crId, relationship: 'SUPPLIER' } })

  // Mara: nobody at Northwind has met her.
  await withAccount('mara', 'Mara Quill', 'mara.quill@example.invalid')
  // Tove: Northwind asked her as "T. Lindqvist", and she took it back.
  await withAccount('tove', 'Tove Lindqvist', 'tove.lindqvist@example.invalid')
  // Uma: Northwind asked her as "U. Okoro" and she has not answered.
  await withAccount('uma', 'Uma Okoro', 'uma.okoro@example.invalid')
  // Pia: Cobalt Ridge shows her on its bench, with her yes.
  await withAccount('pia', 'Pia Brandt', 'pia.brandt@example.invalid')
  await prisma.benchListing.create({ data: { consultantId: id.pia, companyId: crId, tier: 'MARKETING', state: 'GRANTED' } })

  as(NW_OWNER)
  for (const [key, typed, email] of [['tove', 'T. Lindqvist', 'tove.lindqvist@example.invalid'], ['uma', 'U. Okoro', 'uma.okoro@example.invalid']]) {
    const r = await json(await addConsultant(req('POST', '/api/consultants', { name: typed, email })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.consultant.id).toBe(id[key])
  }
  await prisma.benchListing.update({
    where: { consultantId_companyId: { consultantId: id.tove, companyId: nwId } },
    data: { revokedAt: new Date() },
  })

  // Records Northwind made itself, with no account: its own words.
  await northwindAdds('zora', 'Zora Vance', 'zora.vance@example.invalid')
  await northwindAdds('ivo', 'Ivo Lund', 'ivo.lund@example.invalid')
  // Harborline listed Ivo once, and that listing was taken back.
  await prisma.benchListing.create({ data: { consultantId: id.ivo, companyId: hlId, tier: 'MARKETING', state: 'GRANTED', revokedAt: new Date() } })
}, 180_000)

describe('Add to bench asks only somebody the firm knows', () => {
  it('Add to bench refuses a person this firm does not know, as an id that does not exist', async () => {
    as(NW_OWNER)
    const stranger = await ask(id.mara)
    const missing = await ask('cl_no_such_consultant_here')
    expect(stranger.status).toBe(404)
    expect(stranger.body).toEqual(missing.body)
    expect(JSON.stringify(stranger.body)).not.toContain('Mara')
    expect(await prisma.benchListing.count({ where: { consultantId: id.mara } })).toBe(0)
    // The refusal is on her access trail.
    const row = await prisma.accessLog.findFirst({ where: { subjectId: personOf.mara, allowed: false }, orderBy: { at: 'desc' } })
    expect(row?.reason).toContain('Refused Add to bench')
  })

  it('a firm that does not trade with the firm showing her is refused the same way', async () => {
    as(HL_OWNER)
    const r = await ask(id.pia)
    expect(r.status).toBe(404)
  })

  it('Add to bench never writes or says her own name before her yes', async () => {
    as(NW_OWNER)
    const r = await ask(id.tove)
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.message).toMatch(/^Asked T\. Lindqvist to agree to be on your bench\. Nobody can put them forward until they say yes\./)
    expect(JSON.stringify(r.body)).not.toContain('Tove Lindqvist')
    const listing = await prisma.benchListing.findUniqueOrThrow({ where: { consultantId_companyId: { consultantId: id.tove, companyId: nwId } } })
    expect(listing.firmName).toBe('T. Lindqvist')
    expect(listing.state).toBe('INVITED')
    const log = await prisma.automationLog.findFirst({ where: { companyId: nwId, action: 'BENCH_LISTING_REQUESTED' }, orderBy: { at: 'desc' } })
    expect(log?.summary).toContain('T. Lindqvist')
    expect(log?.summary).not.toContain('Tove Lindqvist')
  })

  it('Ask to represent still asks somebody a partner shows on its bench', async () => {
    as(NW_OWNER)
    const r = await ask(id.pia)
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.message).toMatch(/^Asked Pia Brandt to agree to be on your bench\./)
  })
})

describe('The Candidates list never hints at a name the firm was not shown', () => {
  it('people the firm reads only as typed come after everyone else, newest asked first, and every page adds up', async () => {
    // Asked on different days, set here so no two asks tie.
    const now = Date.now()
    const asked: Array<[string, number]> = [['tove', 1], ['uma', 2], ['pia', 3]]
    for (const [key, daysAgo] of asked) {
      await prisma.benchListing.update({
        where: { consultantId_companyId: { consultantId: id[key], companyId: nwId } },
        data: { invitedAt: new Date(now - daysAgo * DAY) },
      })
    }
    as(NW_OWNER)
    const all = await json(await listConsultants(req('GET', '/api/consultants?limit=100')))
    expect(all.status, JSON.stringify(all.body)).toBe(200)
    const ids: string[] = all.body.data.consultants.map((c: any) => c.id)
    const typed = [id.tove, id.uma, id.pia]
    const firstTyped = Math.min(...typed.map((t) => ids.indexOf(t)))
    for (const own of [id.zora, id.ivo]) expect(ids.indexOf(own)).toBeLessThan(firstTyped)
    expect(ids.filter((x) => typed.includes(x))).toEqual(typed)

    // One row a page: the same rows, once each, and the total says how many.
    const paged: string[] = []
    for (let page = 1; page <= ids.length; page++) {
      const r = await json(await listConsultants(req('GET', `/api/consultants?limit=1&page=${page}`)))
      expect(r.body.data.pagination.total).toBe(ids.length)
      paged.push(...r.body.data.consultants.map((c: any) => c.id))
    }
    expect(paged).toEqual(ids)
  })
})

describe('Whose record it is counts every listing, taken back or not', () => {
  it('a firm cannot change the name on a record another firm once listed, even after that listing was taken back', async () => {
    as(NW_OWNER)
    const all = await json(await listConsultants(req('GET', '/api/consultants?limit=100')))
    const ivo = all.body.data.consultants.find((c: any) => c.id === id.ivo)
    const zora = all.body.data.consultants.find((c: any) => c.id === id.zora)
    expect(ivo.keptBy).toBe('THEM')
    expect(zora.keptBy).toBe('FIRM')
    const r = await json(await editConsultant(req('PATCH', `/api/consultants/${id.ivo}`, { name: 'Ivar Lund' }), { params: Promise.resolve({ id: id.ivo }) }))
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('THEIRS_TO_CHANGE')
    expect((await prisma.person.findUniqueOrThrow({ where: { id: personOf.ivo } })).name).toBe('Ivo Lund')
  })
})
