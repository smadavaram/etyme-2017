import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, as, req, json, freshWorld } from './harness'
import { POST as commitImport } from '@/app/api/imports/[id]/commit/route'

/**
 * An import never seats somebody who already has an account on Etyme
 * (review of the neutral Company wave, 2026-11-13).
 *
 * The commit found a person by email across every firm and wrote a seat
 * at the importing firm: an employee seat for a W2 row, which then let the
 * firm put them forward as its own with no yes of theirs. Now a row whose
 * address belongs to somebody already on Etyme, and not already seated at
 * this firm, is only asked onto the bench on their own record, the way
 * Add consultant asks. Nobody is seated and no contract names them until
 * they say yes. A person nobody holds is written exactly as before, and so
 * is a person the firm already seats.
 */

const D = '@demo.etyme.local'
const TELLISFORD_OWNER = `world-tellisford${D}`
let tellisford = ''
let importId = ''
let elsewhere = ''
let ownEmployee = ''
const call = async (fn: (r: any, ctx: any) => Promise<Response>, url: string, id: string) =>
  json(await fn(req('POST', url), { params: Promise.resolve({ id }) }))

beforeAll(async () => {
  await freshWorld()
  tellisford = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-tellisford' }, select: { id: true } })).id

  // Somebody already on Etyme, working at another firm, with no seat at Tellisford.
  const other = await prisma.company.create({ data: { name: 'Harrow Analytics', slug: 'harrow-import-ask', kind: 'VENDOR', currency: 'USD', claimedAt: new Date() } })
  const p = await prisma.person.create({ data: { name: 'Ines Harrow', primaryEmail: 'ines@harrow-import.example' } })
  await prisma.context.create({ data: { personId: p.id, companyId: other.id, type: 'EMPLOYEE', grantReason: 'Owner' } })
  elsewhere = p.id

  // Somebody Tellisford already seats as its own employee.
  const own = await prisma.person.create({ data: { name: 'Kofi Tellisford', primaryEmail: 'kofi@tellisford-own.example' } })
  await prisma.context.create({ data: { personId: own.id, companyId: tellisford, type: 'EMPLOYEE', grantReason: 'Hired' } })
  ownEmployee = own.id

  const imp = await prisma.import.create({
    data: {
      companyId: tellisford, kind: 'PEOPLE', fileName: 'tellisford-more.csv',
      mapping: { mappings: [], unmapped: [], warnings: [], refused: [] }, rowCount: 4, issueCount: 0,
    },
  })
  importId = imp.id
  const rows = [
    { name: 'Ines H', email: 'ines@harrow-import.example', contractType: 'W2', skills: ['dbt'], payRate: 29.75, billRate: 52.5, startDate: '2026-11-02T00:00:00.000Z' },
    { name: 'Kofi Tellisford', email: 'kofi@tellisford-own.example', contractType: 'W2', skills: ['SAP'], payRate: 29.75, startDate: '2026-11-02T00:00:00.000Z' },
    { name: 'Nadia Fresh', email: 'nadia@fresh-import.example', contractType: 'W2', skills: ['Kafka'] },
  ]
  for (const parsed of rows) {
    await prisma.importRow.create({ data: { importId, raw: parsed as object, parsed: parsed as object, issues: [] } })
  }
  as(TELLISFORD_OWNER)
  const r = await call(commitImport, `/api/imports/${importId}/commit`, importId)
  expect(r.status, JSON.stringify(r.body)).toBe(200)
}, 600_000)

describe('an import meets somebody who already has an account on Etyme', () => {
  it('a W2 row whose address belongs to somebody already on Etyme seats nobody at the importing firm and makes no employee of them', async () => {
    expect(await prisma.context.count({ where: { personId: elsewhere, companyId: tellisford } })).toBe(0)
  })

  it('that person is only asked onto the bench, on their own record, and their own name is kept', async () => {
    const person = await prisma.person.findUniqueOrThrow({ where: { id: elsewhere }, include: { consultant: { include: { listings: true } } } })
    expect(person.name).toBe('Ines Harrow')
    const listing = person.consultant?.listings.find((l) => l.companyId === tellisford)
    expect(listing?.state).toBe('INVITED')
  })

  it('no contract names somebody who has not said yes', async () => {
    expect(await prisma.sellContract.count({ where: { personId: elsewhere } })).toBe(0)
    expect(await prisma.buyContractCandidate.count({ where: { personId: elsewhere } })).toBe(0)
  })

  it('looking them up by address is on the access log', async () => {
    expect(await prisma.accessLog.count({ where: { subjectId: elsewhere, actorCompanyId: tellisford } })).toBeGreaterThan(0)
  })

  it('the summary says they wait on their own yes, and counts them apart from the firm’s own employees', async () => {
    const log = await prisma.automationLog.findFirstOrThrow({ where: { companyId: tellisford, action: 'IMPORT_COMMITTED', payload: { path: ['importId'], equals: importId } } })
    expect((log.payload as any).alreadyOnEtyme).toBe(1)
    expect((log.payload as any).employees).toBe(2)
  })
})

describe('an import of people the firm already holds, or nobody holds, works as before', () => {
  it('a person the firm already seats is imported as before, with the contract the row carries', async () => {
    expect(await prisma.context.count({ where: { personId: ownEmployee, companyId: tellisford, revokedAt: null } })).toBe(1)
    expect(await prisma.buyContractCandidate.count({ where: { personId: ownEmployee } })).toBe(1)
  })

  it('a typed rate of 29.75 or 52.50 is kept to the cent, never rounded to a whole dollar, in the cents its column holds', async () => {
    const line = await prisma.buyContractCandidate.findFirstOrThrow({ where: { personId: ownEmployee } })
    expect(line.payRate).toBe(2975)
    const listing = await prisma.benchListing.findFirstOrThrow({ where: { companyId: tellisford, consultant: { personId: elsewhere } } })
    expect(listing.rateMin).toBe(2975)
    expect(listing.rateMax).toBe(5250)
  })

  it('a W2 row for a person nobody holds is still written as the firm’s own employee', async () => {
    const p = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: 'nadia@fresh-import.example' } })
    const seats = await prisma.context.findMany({ where: { personId: p.id, companyId: tellisford } })
    expect(seats).toHaveLength(1)
    expect(seats[0].type).toBe('EMPLOYEE')
  })
})
