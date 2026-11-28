import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, as, req, json, freshWorld } from './harness'
import { GET as benchProfit } from '@/app/api/bench/profit/route'
import { GET as me } from '@/app/api/me/route'
import { GET as myCommissions } from '@/app/api/me/commissions/route'
import { GET as consultantGET } from '@/app/api/consultants/[id]/route'
import { GET as concentrationGET } from '@/app/api/vendors/concentration/route'
import { seedToday } from '@/lib/seed-days'

/**
 * The Owner gives access by team, by role or for the whole company
 * (founder, 2026-11-08), read on supply's side on the seeded world, at
 * Pellwright Validation Partners: Tobias Wren and Noor Abernathy are on
 * placements through Sundara Systems, and Priyanka Solis is the recruiter
 * who reads no margin until the Owner says so.
 *
 * A team grant is given on a team the test adds, with Tobias's line
 * charged to it; an own-work grant reads the line the recruiter earns a
 * commission on, which the test sets on Noor's line.
 */

const D = '@demo.etyme.local'
const OWNER = `world-pellwright${D}`
const RECRUITER = `world-pellwright-recruiter${D}`

let firmId = ''
let ownerId = ''
let recruiterId = ''
let recruiterSeat = ''
let tobiasLine = ''
let noorLine = ''
let tobiasProfile = ''
let unitId = ''

async function grant(scope: 'UNIT' | 'PERSON') {
  await prisma.permissionGrant.updateMany({ where: { companyId: firmId, contextId: recruiterSeat, revokedAt: null }, data: { revokedAt: new Date() } })
  await prisma.permissionGrant.create({
    data: {
      companyId: firmId, permission: 'margin.read', contextId: recruiterSeat, scope,
      orgUnitId: scope === 'UNIT' ? unitId : null, grantedById: ownerId, reason: 'The test gives it.',
    },
  })
}
async function revokeAll() {
  await prisma.permissionGrant.updateMany({ where: { companyId: firmId, contextId: recruiterSeat, revokedAt: null }, data: { revokedAt: new Date() } })
}
const names = (body: any) => body.data.people.map((p: any) => p.name).sort()

beforeAll(async () => {
  await freshWorld()
  const firm = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-pellwright' }, select: { id: true } })
  firmId = firm.id
  ownerId = (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: OWNER }, select: { id: true } })).id
  const r = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: RECRUITER }, select: { id: true } })
  recruiterId = r.id
  recruiterSeat = (await prisma.context.findFirstOrThrow({ where: { personId: r.id, companyId: firmId, revokedAt: null }, select: { id: true } })).id
  const line = async (name: string) =>
    (await prisma.sellContract.findFirstOrThrow({ where: { companyId: firmId, person: { name } }, orderBy: { startDate: 'desc' }, select: { id: true } })).id
  tobiasLine = await line('Tobias Wren')
  noorLine = await line('Noor Abernathy')
  tobiasProfile = (await prisma.consultantProfile.findFirstOrThrow({ where: { person: { name: 'Tobias Wren' } }, select: { id: true } })).id
  unitId = (await prisma.orgUnit.create({ data: { companyId: firmId, name: 'Validation East', kind: 'PRACTICE' }, select: { id: true } })).id
  await prisma.sellContract.update({ where: { id: tobiasLine }, data: { deliveryUnitId: unitId } })
  // Noor's line carries a recruiting commission for the recruiter: a share of the margin.
  const noorBuy = await prisma.contractLink.findFirstOrThrow({ where: { sellContractId: noorLine }, select: { buyContractId: true } })
  await prisma.contractCommission.create({
    data: {
      companyId: firmId, buyContractId: noorBuy.buyContractId, earnedById: recruiterId,
      kind: 'RECRUITING', basis: 'SHARE_OF_MARGIN', rateBps: 1000, capCents: 500_000,
      fromDate: new Date(Date.UTC(2020, 0, 1)), accrueOn: 'ACCEPTED', setById: ownerId, reason: 'She recruited Noor.',
    },
  })
}, 900_000)

describe('bench profit reads the Owner’s grants', () => {
  it('a recruiter with no grant is refused bench profit in a sentence naming who reads it, and is shown no figure', async () => {
    await revokeAll()
    as(RECRUITER)
    const r = await json(await benchProfit(req('GET', '/api/bench/profit')))
    expect(r.status).toBe(403)
    expect(r.body.data).toBeUndefined()
    expect(r.body.error.message).toContain('anybody the Owner gives the right to read what placements make')
  })

  it('a recruiter given margin on a team reads that team’s people only, with the owner’s figures for them, and no course', async () => {
    as(OWNER)
    const owner = await json(await benchProfit(req('GET', '/api/bench/profit')))
    await grant('UNIT')
    as(RECRUITER)
    const r = await json(await benchProfit(req('GET', '/api/bench/profit')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(names(r.body)).toEqual(['Tobias Wren'])
    expect(r.body.data.people[0]).toEqual(owner.body.data.people.find((p: any) => p.name === 'Tobias Wren'))
    expect(r.body.data.courses).toEqual([])
    expect(r.body.data.reach.scope).toBe('UNIT')
    expect(r.body.data.reach.says).toContain('the Validation East team')
    expect(r.body.data.reach.firmWideOnly).toContain('whole firm')
    expect(owner.body.data.reach.says).toBeNull()
  })

  it('a recruiter given margin on her own work reads the people on the placements she earns on, and nobody else’s', async () => {
    await grant('PERSON')
    as(RECRUITER)
    const r = await json(await benchProfit(req('GET', '/api/bench/profit')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(names(r.body)).toContain('Noor Abernathy')
    expect(names(r.body)).not.toContain('Tobias Wren')
    expect(r.body.data.reach.says).toContain('your own people only')
  })
})

describe('/api/me reads the grants', () => {
  it('the recruiter’s own seat lists the granted permission with its reach, beside the role’s own', async () => {
    await grant('UNIT')
    as(RECRUITER)
    const r = await json(await me(req('GET', '/api/me', undefined, { 'x-context-id': recruiterSeat })))
    expect(r.status).toBe(200)
    const seat = r.body.data.activeContext
    expect(seat.role.permissions).not.toContain('margin.read')
    expect(seat.permissions).toContain('margin.read')
    expect(seat.granted).toEqual(['margin.read'])
    expect(seat.grants[0].reachSays).toBe('for the Validation East team and every team under it')
  })

  it('a revoked grant is gone from /api/me', async () => {
    await revokeAll()
    as(RECRUITER)
    const r = await json(await me(req('GET', '/api/me', undefined, { 'x-context-id': recruiterSeat })))
    expect(r.body.data.activeContext.permissions).not.toContain('margin.read')
    expect(r.body.data.activeContext.grants).toEqual([])
  })
})

describe('the bill rate and the firm-wide figures read the grant’s lines', () => {
  it('a recruiter given margin on a team reads the bill rate on the team’s line and not on another, and with no grant reads none', async () => {
    await grant('UNIT')
    as(RECRUITER)
    const r = await json(await consultantGET(req('GET', `/api/consultants/${tobiasProfile}`), { params: Promise.resolve({ id: tobiasProfile }) }))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const line = r.body.data.consultant.contracts.find((c: any) => c.id === tobiasLine)
    expect(line, JSON.stringify(r.body.data.consultant.contracts)).toBeDefined()
    expect(line.billRate).toBe(14_500)
    // Noor's line is not the team's, so its price is not read.
    const noorProfile = (await prisma.consultantProfile.findFirstOrThrow({ where: { person: { name: 'Noor Abernathy' } }, select: { id: true } })).id
    const noor = await json(await consultantGET(req('GET', `/api/consultants/${noorProfile}`), { params: Promise.resolve({ id: noorProfile }) }))
    const noorRow = noor.body.data.consultant.contracts.find((c: any) => c.id === noorLine)
    expect(noorRow).toBeDefined()
    expect(noorRow.billRate).toBeUndefined()

    await revokeAll()
    const n = await json(await consultantGET(req('GET', `/api/consultants/${tobiasProfile}`), { params: Promise.resolve({ id: tobiasProfile }) }))
    expect(n.body.data.consultant.contracts.length).toBeGreaterThan(0)
    for (const c of n.body.data.consultant.contracts) expect(c.billRate).toBeUndefined()
  })

  it('concentration is refused to a team grant in a sentence, because it is the whole firm’s book', async () => {
    await grant('UNIT')
    as(RECRUITER)
    const r = await json(await concentrationGET(req('GET', '/api/vendors/concentration')))
    expect(r.status).toBe(403)
    expect(r.body.error.message).toContain('a figure about the whole of Pellwright Validation Partners')
  })
})

describe('a person reads their own commissions', () => {
  // A month the seeded weeks fall in, whatever day the world was born.
  const month = new Date(seedToday().getTime() - 14 * 86_400_000).toISOString().slice(0, 7)

  it('the recruiter reads her commission on Noor’s line, its cap and where it stands, and no margin while she reads none', async () => {
    await revokeAll()
    as(RECRUITER)
    const r = await json(await myCommissions(req('GET', `/api/me/commissions?month=${month}`)))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.rows).toHaveLength(1)
    const row = r.body.data.rows[0]
    expect(row.line).toBe('Noor Abernathy at Sundara Systems, on the buy line')
    expect(row.kind).toBe('Recruiting commission')
    expect(row.cap).toContain('$5,000.00 cap')
    expect(row.says).not.toMatch(/of \$[\d,.]+ margin/)
    expect(row.withheldSays).toContain('read by the Owner')
  })

  it('given margin on her own work, she reads the share with the margin money worked it from', async () => {
    await grant('PERSON')
    as(RECRUITER)
    const r = await json(await myCommissions(req('GET', `/api/me/commissions?month=${month}`)))
    expect(r.body.data.rows[0].withheldSays).toBeNull()
  })

  it('nobody reads another person’s commissions here, and the refusal is on the trail before it goes out', async () => {
    as(RECRUITER)
    const r = await json(await myCommissions(req('GET', `/api/me/commissions?personId=${ownerId}`)))
    expect(r.status).toBe(403)
    expect(r.body.error.message).toContain('Payroll, Commissions')
    const row = await prisma.accessLog.findFirst({ where: { actorPersonId: recruiterId, subjectId: ownerId, allowed: false, action: 'PAYROLL_VIEW' } })
    expect(row).not.toBeNull()
  })

  it('the owner, who earns no commission, reads an empty page that says who sets one', async () => {
    as(OWNER)
    const r = await json(await myCommissions(req('GET', `/api/me/commissions?month=${month}`)))
    expect(r.body.data.rows).toEqual([])
    expect(r.body.data.empty).toContain('Contract Manager')
  })
})
