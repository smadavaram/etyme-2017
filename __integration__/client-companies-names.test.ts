import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as listCompanies } from '@/app/api/companies/route'

/**
 * A client's Companies page names the firms it deals with, and never a
 * sub-vendor below the prime it pays unless its agreement with that
 * prime requires disclosure.
 *
 * Found live on 2026-09-30: Northbend Athletic buys Helena Marsh from
 * Computer Systems Inc, which buys her from CloudEPA. The disclosure
 * term on the Northbend–Computer Systems agreement is off, and
 * Northbend's Companies page listed CloudEPA anyway, because every sell
 * line naming Northbend as the end client added its seller to the list.
 */

const NIKE_PROGRAMME = 'world-nike-programme@demo.etyme.local'
const COMPUTER_SYSTEMS = 'world-computer-systems@demo.etyme.local'
const CLOUDEPA = 'world-cloudepa@demo.etyme.local'

const co: Record<string, string> = {}

async function namesFor(email: string): Promise<string[]> {
  as(email)
  const r = await json(await listCompanies(req('GET', '/api/companies')))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data.companies.map((c: { slug: string }) => c.slug)
}

beforeAll(async () => {
  await freshWorld()
  for (const slug of ['world-nike', 'world-computer-systems', 'world-cloudepa']) {
    co[slug] = (await prisma.company.findUniqueOrThrow({ where: { slug }, select: { id: true } })).id
  }
  // The world as the tester found it: CloudEPA sells to Computer Systems,
  // which sells to Northbend, and Northbend's paper with Computer Systems
  // does not ask for the names below.
  const chain = await prisma.sellContract.count({
    where: { companyId: co['world-cloudepa'], clientCompanyId: co['world-computer-systems'], endClientCompanyId: co['world-nike'] },
  })
  expect(chain).toBeGreaterThan(0)
  await prisma.masterAgreement.updateMany({
    where: { clientId: co['world-nike'], vendorId: co['world-computer-systems'] },
    data: { disclosesSubVendors: false },
  })
}, 600_000)

describe('whose names a client reads on its Companies page', () => {
  it('a client’s companies list never names a firm below its prime unless its agreement requires disclosure', async () => {
    const names = await namesFor(NIKE_PROGRAMME)
    expect(names).toContain('world-computer-systems')
    expect(names).not.toContain('world-cloudepa')
  })

  it('once the client’s agreement with the prime requires disclosure, the firm below is named', async () => {
    const agreement = await prisma.masterAgreement.findFirst({
      where: { clientId: co['world-nike'], vendorId: co['world-computer-systems'] },
      select: { id: true },
    })
    const made = agreement
      ? null
      : await prisma.masterAgreement.create({
          data: { clientId: co['world-nike'], vendorId: co['world-computer-systems'], disclosesSubVendors: true, status: 'ACTIVE' } as any,
        })
    if (agreement) await prisma.masterAgreement.update({ where: { id: agreement.id }, data: { disclosesSubVendors: true } })
    try {
      expect(await namesFor(NIKE_PROGRAMME)).toContain('world-cloudepa')
    } finally {
      if (made) await prisma.masterAgreement.delete({ where: { id: made.id } })
      if (agreement) await prisma.masterAgreement.update({ where: { id: agreement.id }, data: { disclosesSubVendors: false } })
    }
  })

  it('the prime reads both its client and its own sub-vendor, because it is a party to both lines', async () => {
    const names = await namesFor(COMPUTER_SYSTEMS)
    expect(names).toContain('world-nike')
    expect(names).toContain('world-cloudepa')
  })

  it('the sub-vendor reads the firm it sells to and the site its person works at', async () => {
    const names = await namesFor(CLOUDEPA)
    expect(names).toContain('world-computer-systems')
    expect(names).toContain('world-nike')
  })
})
