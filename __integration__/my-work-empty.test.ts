import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as myWork } from '@/app/api/me/work/route'

/**
 * Your work, for somebody with no work on it yet (sign-up walk, round two).
 *
 *   Item 35  a person on a bench, listed and never put forward, read a
 *            row of zeros ending "your vendor bills these".
 *   Item 38  the owner of a one-person firm read the same zeros calling
 *            her "your vendor", when she is the firm.
 *
 * Both now read the empty cards: the first with the firm that lists
 * them, the second in her company's words.
 */

const BENCH = 'pat.bench@fresh-walk.example'
const OWNER = 'ada.owner@fresh-walk.example'
let vendorName = ''

beforeAll(async () => {
  await freshWorld()

  // A bench firm and a person who granted it a listing, with no work at all.
  const vendor = await prisma.company.create({ data: { name: 'Larkspur Clinical Staffing', slug: 'larkspur-walk', kind: 'VENDOR' } })
  vendorName = vendor.name
  const pat = await prisma.person.create({ data: { name: 'Pat Okoye', primaryEmail: BENCH } })
  await prisma.context.create({ data: { personId: pat.id, type: 'CONSULTANT' } })
  const profile = await prisma.consultantProfile.create({ data: { personId: pat.id, skills: ['ICU'], visibility: 'INTERNAL' } })
  await prisma.benchListing.create({ data: { consultantId: profile.id, companyId: vendor.id, tier: 'MARKETING', state: 'GRANTED' } })

  // A one-person firm founded at sign-up: the firm and her seat at it, nothing else.
  const corp = await prisma.company.create({ data: { name: 'Ada Rivera Consulting LLC', slug: 'ada-walk', kind: 'CONSULTANT_CORP' } })
  const ownerRole = await prisma.role.create({ data: { companyId: corp.id, name: 'Owner', permissions: ['*'] } })
  const ada = await prisma.person.create({ data: { name: 'Ada Rivera', primaryEmail: OWNER } })
  await prisma.context.create({ data: { personId: ada.id, companyId: corp.id, roleId: ownerRole.id, type: 'EMPLOYEE' } })
}, 120_000)

describe('a page with no work on it yet is the empty cards, never a row of zeros', () => {
  it('a person on a bench with no work yet reads the empty cards and the firm that lists them, never a row of zeros', async () => {
    as(BENCH)
    const r = await json(await myWork(req('GET', '/api/me/work')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.standing.because).toBe('BENCH')
    expect(r.body.data.empty).toEqual({
      says: r.body.data.standing.says,
      listedBy: `Listed by ${vendorName}. When a firm puts you forward, your work shows here.`,
      ownFirm: null,
    })
  })

  it('the owner of a one-person firm reads her company’s words on Your work, never "your vendor"', async () => {
    as(OWNER)
    const r = await json(await myWork(req('GET', '/api/me/work')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.empty.ownFirm).toBe('Ada Rivera Consulting LLC')
    expect(r.body.data.empty.says).toBe(
      'Ada Rivera Consulting LLC is your own company. When it is on a contract, your company bills your hours and they show here.'
    )
    expect(r.body.data.summary.signed.note).toBe('your company bills these')
    expect(JSON.stringify(r.body)).not.toMatch(/your vendor/i)
  })

  it('somebody with work on the record reads their work, not the empty cards', async () => {
    as('helena.marsh@seed.etyme.invalid')
    const r = await json(await myWork(req('GET', '/api/me/work')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.placements.length).toBeGreaterThan(0)
    expect(r.body.data.empty).toBeNull()
  })
})
