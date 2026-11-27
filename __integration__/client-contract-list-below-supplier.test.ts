import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as listContracts } from '@/app/api/contracts/route'

/**
 * Record 119: no trace of a firm below a client's supplier reaches the
 * client. Found live: GET /api/contracts returned the buy line's id and
 * the sub-vendor's name to the client reading its own sell line.
 */
const CLIENT = 'world-northbend-programme@demo.etyme.local'
const PRIME = 'world-computer-systems@demo.etyme.local'
const co: Record<string, string> = {}

async function list(email: string) {
  as(email)
  const r = await json(await listContracts(req('GET', '/api/contracts?side=sell&limit=50')))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data.contracts as any[]
}
const ofChain = (rows: any[]) => rows.filter((c) => c.pairedWith)

beforeAll(async () => {
  await freshWorld()
  for (const slug of ['world-northbend', 'world-computer-systems', 'world-tecwyn']) {
    co[slug] = (await prisma.company.findUniqueOrThrow({ where: { slug }, select: { id: true } })).id
  }
  await prisma.masterAgreement.updateMany({
    where: { clientId: co['world-northbend'], vendorId: co['world-computer-systems'] },
    data: { disclosesSubVendors: false },
  })
}, 600_000)

describe('a client reading its contract list', () => {
  it('a client’s contract list carries no name or id of a firm below its supplier', async () => {
    const rows = await list(CLIENT)
    const below = await prisma.buyContract.findMany({
      where: { vendorCompanyId: co['world-tecwyn'] },
      select: { id: true },
    })
    expect(below.length).toBeGreaterThan(0)
    const text = JSON.stringify(rows)
    for (const b of below) expect(text).not.toContain(b.id)
    expect(text).not.toMatch(/tecwyn/i)
    for (const c of rows.filter((c) => c.companyId === co['world-computer-systems'])) {
      expect(c.pairedWith).toBeNull()
    }
  })

  it('where the client’s agreement requires disclosure, the firm below is named and its id is still withheld', async () => {
    const a = await prisma.masterAgreement.findFirstOrThrow({
      where: { clientId: co['world-northbend'], vendorId: co['world-computer-systems'] },
      select: { id: true },
    })
    await prisma.masterAgreement.update({ where: { id: a.id }, data: { disclosesSubVendors: true } })
    try {
      const rows = await list(CLIENT)
      const named = ofChain(rows).filter((c) => c.companyId === co['world-computer-systems'])
      expect(named.length).toBeGreaterThan(0)
      for (const c of named) expect(c.pairedWith.id).toBeNull()
      expect(JSON.stringify(named)).toMatch(/tecwyn/i)
    } finally {
      await prisma.masterAgreement.update({ where: { id: a.id }, data: { disclosesSubVendors: false } })
    }
  })

  it('the prime still sees its own pair, id and sub-vendor name', async () => {
    const rows = await list(PRIME)
    const pairs = ofChain(rows).filter((c) => c.pairedWith.counterpartName)
    expect(pairs.length).toBeGreaterThan(0)
    for (const c of pairs) expect(typeof c.pairedWith.id).toBe('string')
  })
})

import { POST as rollOff } from '@/app/api/contracts/[id]/rolloff/route'
import { GET as payLine } from '@/app/api/contracts/[id]/pay-line/route'

describe('a client opening the line between its supplier and a firm below it', () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

  async function lineBelow() {
    return prisma.sellContract.findFirstOrThrow({
      where: { companyId: co['world-tecwyn'], clientCompanyId: co['world-computer-systems'], endClientCompanyId: co['world-northbend'], state: 'IN_PROGRESS' },
      select: { id: true },
      orderBy: { id: 'asc' },
    })
  }

  it('a client cannot roll somebody off the line between its supplier and a firm below it, and the refusal names no firm', async () => {
    const line = await lineBelow()
    as(CLIENT)
    const r = await json(await rollOff(req('POST', `/api/contracts/${line.id}/rolloff`, {}), ctx(line.id) as any))
    expect(r.status).toBe(404)
    expect(JSON.stringify(r.body)).not.toMatch(/tecwyn|computer systems/i)
    expect(await prisma.rolloffEvent.count({ where: { sellContractId: line.id } })).toBe(0)
  })

  it('a firm that is no party to a placement is refused without being told who is on it', async () => {
    const line = await lineBelow()
    as('world-cavanaugh-programme@demo.etyme.local')
    const r = await json(await rollOff(req('POST', `/api/contracts/${line.id}/rolloff`, {}), ctx(line.id) as any))
    expect(r.status).toBe(403)
    expect(JSON.stringify(r.body)).not.toMatch(/tecwyn|computer systems|northbend|northbend/i)
  })

  it('a client asking about the pay line behind a placement is told nothing about a firm below', async () => {
    const line = await lineBelow()
    as(CLIENT)
    const r = await json(await payLine(req('GET', `/api/contracts/${line.id}/pay-line`), ctx(line.id) as any))
    expect(r.status).toBe(200)
    expect(r.body.data.hasBuyLine).toBe(false)
  })
})
