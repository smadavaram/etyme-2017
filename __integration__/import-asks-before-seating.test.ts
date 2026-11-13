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
const TELEWORLD_OWNER = `world-teleworld${D}`
let teleworld = ''
let importId = ''
let elsewhere = ''
let ownEmployee = ''
const call = async (fn: (r: any, ctx: any) => Promise<Response>, url: string, id: string) =>
  json(await fn(req('POST', url), { params: Promise.resolve({ id }) }))

beforeAll(async () => {
  await freshWorld()
  teleworld = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-teleworld' }, select: { id: true } })).id

  // Somebody already on Etyme, working at another firm, with no seat at Teleworld.
  const other = await prisma.company.create({ data: { name: 'Harrow Analytics', slug: 'harrow-import-ask', kind: 'VENDOR', currency: 'USD', claimedAt: new Date() } })
  const p = await prisma.person.create({ data: { name: 'Ines Harrow', primaryEmail: 'ines@harrow-import.example' } })
  await prisma.context.create({ data: { personId: p.id, companyId: other.id, type: 'EMPLOYEE', grantReason: 'Owner' } })
  elsewhere = p.id

  // Somebody Teleworld already seats as its own employee.
  const own = await prisma.person.create({ data: { name: 'Kofi Teleworld', primaryEmail: 'kofi@teleworld-own.example' } })
  await prisma.context.create({ data: { personId: own.id, companyId: teleworld, type: 'EMPLOYEE', grantReason: 'Hired' } })
  ownEmployee = own.id

  const imp = await prisma.import.create({
    data: {
      companyId: teleworld, kind: 'PEOPLE', fileName: 'teleworld-more.csv',
      mapping: { mappings: [], unmapped: [], warnings: [], refused: [] }, rowCount: 4, issueCount: 0,
    },
  })
  importId = imp.id
  const rows = [
    { name: 'Ines H', email: 'ines@harrow-import.example', contractType: 'W2', skills: ['dbt'], payRate: 6000, billRate: 9000, startDate: '2026-11-02T00:00:00.000Z' },
    { name: 'Kofi Teleworld', email: 'kofi@teleworld-own.example', contractType: 'W2', skills: ['SAP'], payRate: 5000, startDate: '2026-11-02T00:00:00.000Z' },
    { name: 'Nadia Fresh', email: 'nadia@fresh-import.example', contractType: 'W2', skills: ['Kafka'] },
  ]
  for (const parsed of rows) {
    await prisma.importRow.create({ data: { importId, raw: parsed as object, parsed: parsed as object, issues: [] } })
  }
  as(TELEWORLD_OWNER)
  const r = await call(commitImport, `/api/imports/${importId}/commit`, importId)
  expect(r.status, JSON.stringify(r.body)).toBe(200)
}, 600_000)

describe('an import meets somebody who already has an account on Etyme', () => {
  it('a W2 row whose address belongs to somebody already on Etyme seats nobody at the importing firm and makes no employee of them', async () => {
    expect(await prisma.context.count({ where: { personId: elsewhere, companyId: teleworld } })).toBe(0)
  })

  it('that person is only asked onto the bench, on their own record, and their own name is kept', async () => {
    const person = await prisma.person.findUniqueOrThrow({ where: { id: elsewhere }, include: { consultant: { include: { listings: true } } } })
    expect(person.name).toBe('Ines Harrow')
    const listing = person.consultant?.listings.find((l) => l.companyId === teleworld)
    expect(listing?.state).toBe('INVITED')
  })

  it('no contract names somebody who has not said yes', async () => {
    expect(await prisma.sellContract.count({ where: { personId: elsewhere } })).toBe(0)
    expect(await prisma.buyContractCandidate.count({ where: { personId: elsewhere } })).toBe(0)
  })

  it('looking them up by address is on the access log', async () => {
    expect(await prisma.accessLog.count({ where: { subjectId: elsewhere, actorCompanyId: teleworld } })).toBeGreaterThan(0)
  })

  it('the summary says they wait on their own yes, and counts them apart from the firm’s own employees', async () => {
    const log = await prisma.automationLog.findFirstOrThrow({ where: { companyId: teleworld, action: 'IMPORT_COMMITTED', payload: { path: ['importId'], equals: importId } } })
    expect((log.payload as any).alreadyOnEtyme).toBe(1)
    expect((log.payload as any).employees).toBe(2)
  })
})

describe('an import of people the firm already holds, or nobody holds, works as before', () => {
  it('a person the firm already seats is imported as before, with the contract the row carries', async () => {
    expect(await prisma.context.count({ where: { personId: ownEmployee, companyId: teleworld, revokedAt: null } })).toBe(1)
    expect(await prisma.buyContractCandidate.count({ where: { personId: ownEmployee } })).toBe(1)
  })

  it('a W2 row for a person nobody holds is still written as the firm’s own employee', async () => {
    const p = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: 'nadia@fresh-import.example' } })
    const seats = await prisma.context.findMany({ where: { personId: p.id, companyId: teleworld } })
    expect(seats).toHaveLength(1)
    expect(seats[0].type).toBe('EMPLOYEE')
  })
})
