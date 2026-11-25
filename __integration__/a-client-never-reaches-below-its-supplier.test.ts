import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, as, req, json, freshWorld } from './harness'
import { GET as placement } from '@/app/api/placements/[id]/route'

/**
 * Record 119: a client never reaches below its supplier. The line between
 * its supplier and the firm below it is a deal between two other firms.
 *
 * The seeded world: Priya Ramesh is employed by the sub-vendor, sold up to
 * the prime, and sold on by the prime to the client.
 */
const SUB = 'world-tecwyn@demo.etyme.local'
const PRIME = 'world-computer-systems@demo.etyme.local'
const CLIENT = 'world-harlow-health@demo.etyme.local'

let subLine = ''
let primeLine = ''
let subName = ''
let subId = ''
let clientId = ''
let personId = ''

const slug = (s: string) => prisma.company.findFirstOrThrow({ where: { slug: s }, select: { id: true, name: true } })
const open = async (seat: string, id: string) => {
  as(seat)
  return json(await placement(req('GET', `/api/placements/${id}`), { params: Promise.resolve({ id }) }))
}

beforeAll(async () => {
  await freshWorld()
  const [tecwyn, cs, harlow] = await Promise.all(['world-tecwyn', 'world-computer-systems', 'world-harlow-health'].map(slug))
  subName = tecwyn.name
  subId = tecwyn.id
  clientId = harlow.id
  const sub = await prisma.sellContract.findFirstOrThrow({ where: { companyId: tecwyn.id, clientCompanyId: cs.id, person: { name: 'Priya Ramesh' } }, select: { id: true, personId: true } })
  subLine = sub.id
  personId = sub.personId
  primeLine = (await prisma.sellContract.findFirstOrThrow({ where: { companyId: cs.id, clientCompanyId: harlow.id, person: { name: 'Priya Ramesh' } }, select: { id: true } })).id
}, 600_000)

describe('a client and the line between its supplier and the firm below it', () => {
  it('a client opening the sub-vendor’s line is refused as not found, in the one sentence', async () => {
    const r = await open(CLIENT, subLine)
    expect(r.status).toBe(404)
    expect(r.body.error.message).toBe('You can open only contracts your company is on. Yours are listed under Contracts.')
    expect(JSON.stringify(r.body)).not.toContain(subName)
  })

  it('the refusal of a client opening the sub-vendor’s line is logged before the answer is sent', async () => {
    const row = await prisma.accessLog.findFirst({
      where: { actorCompanyId: clientId, subjectId: personId, allowed: false, action: 'CONTRACT_VIEW' },
    })
    expect(row).not.toBeNull()
  })

  it('a client’s own line still opens, with the standing of whoever employs the person', async () => {
    const r = await open(CLIENT, primeLine)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.viewer.side).toBe('PAYER')
    expect(r.body.data.checklist.cover).toBeDefined()
  })

  it('a client’s full JSON of its own line carries no id or name of the firm below its supplier', async () => {
    const r = await open(CLIENT, primeLine)
    const text = JSON.stringify(r.body)
    expect(text).not.toContain(subId)
    expect(text.toLowerCase()).not.toContain(subName.toLowerCase())
    expect(text.toLowerCase()).not.toContain('tecwyn')
  })

  it('the prime and the sub-vendor still read their lines fully', async () => {
    const prime = await open(PRIME, primeLine)
    expect(prime.status).toBe(200)
    expect(prime.body.data.viewer.side).toBe('SUPPLIER')
    const sub = await open(SUB, subLine)
    expect(sub.status).toBe(200)
    expect(sub.body.data.viewer.side).toBe('SUPPLIER')
    const primeBuys = await open(PRIME, subLine)
    expect(primeBuys.status).toBe(200)
    expect(primeBuys.body.data.viewer.side).toBe('PAYER')
  })
})
