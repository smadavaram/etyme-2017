import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, as, req, json, freshWorld } from './harness'
import { GET as placement } from '@/app/api/placements/[id]/route'
import { GET as programRoute } from '@/app/api/program/route'
import type { NextRequest } from 'next/server'
import { GET as listSubmissions } from '@/app/api/submissions/route'

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

describe('the Open link on a submission row', () => {
  // The prime put Priya forward to the client on the job both lines are on:
  // one submission per job and person, with two lines behind it.
  beforeAll(async () => {
    const found = await prisma.sellContract.findUniqueOrThrow({ where: { id: primeLine }, select: { requirementId: true, personId: true, companyId: true, clientCompanyId: true } })
    const line = { ...found, requirementId: found.requirementId! }
    await prisma.submission.upsert({
      where: { requirementId_personId: { requirementId: line.requirementId, personId: line.personId } },
      update: {},
      create: { requirementId: line.requirementId, personId: line.personId, fromCompanyId: line.companyId, toCompanyId: line.clientCompanyId, kind: 'BENCH', rate: 11200, status: 'PLACED' },
    })
  })

  const rowsOf = async (seat: string) => {
    as(seat)
    const r = await json(await listSubmissions(req('GET', '/api/submissions?limit=50&direction=' + (seat === CLIENT ? 'received' : 'sent'))))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const all = (r.body.data?.submissions ?? r.body.data ?? r.body.submissions) as Array<{ person?: { name?: string }; personName?: string; contractId: string | null }>
    return all.filter((s) => (s.person?.name ?? s.personName) === 'Priya Ramesh')
  }

  it('a client’s Open link on a submission opens its own line and never the sub-vendor’s', async () => {
    const rows = await rowsOf(CLIENT)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.contractId).not.toBe(subLine)
      expect(row.contractId).toBe(primeLine)
    }
  })

  it('the prime’s Open link on a submission leads to the line it sells', async () => {
    const own = await rowsOf(PRIME)
    expect(own.length).toBeGreaterThan(0)
    expect(own[0].contractId).toBe(primeLine)
  })

  it('every Open link a client is offered on a submission opens, never a 404', async () => {
    for (const row of await rowsOf(CLIENT)) {
      if (row.contractId) expect((await open(CLIENT, row.contractId)).status).toBe(200)
    }
  })
})

describe('the program view a client reads', () => {
  // A person whose prime leg is paused sits in the roster through the
  // sub-vendor's own line, the one case where a firm below the supplier
  // is a row on the client's program.
  const readProgram = async () => {
    const before = await prisma.sellContract.findUniqueOrThrow({ where: { id: primeLine }, select: { state: true } })
    await prisma.sellContract.update({ where: { id: primeLine }, data: { state: 'PAUSED' } })
    try {
      as(CLIENT)
      const res = await programRoute(req('GET', '/api/program') as NextRequest)
      return { status: res.status, body: await res.json() }
    } finally {
      await prisma.sellContract.update({ where: { id: primeLine }, data: { state: before.state } })
    }
  }

  it('a client’s program view carries no id of a firm below its supplier', async () => {
    const r = await readProgram()
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const text = JSON.stringify(r.body)
    expect(text).not.toContain(subId)
    expect(text.toLowerCase()).not.toContain('tecwyn')
    expect(text).toContain('Supplied through')
  })

  it('a client’s program view still carries the id of the supplier it pays', async () => {
    const r = await readProgram()
    const prime = await slug('world-computer-systems')
    expect(JSON.stringify(r.body)).toContain(prime.id)
  })

  it('where the agreement discloses the firm below, its name is shown and its id is still withheld', async () => {
    const prime = await slug('world-computer-systems')
    const agreement = await prisma.masterAgreement.findFirst({ where: { clientId, vendorId: prime.id } })
    expect(agreement, 'the seeded world has an agreement between the client and the prime').not.toBeNull()
    await prisma.masterAgreement.update({ where: { id: agreement!.id }, data: { disclosesSubVendors: true, status: 'ACTIVE' } })
    try {
      const r = await readProgram()
      const text = JSON.stringify(r.body)
      expect(text).toContain(subName)
      expect(text).not.toContain(subId)
    } finally {
      await prisma.masterAgreement.update({ where: { id: agreement!.id }, data: { disclosesSubVendors: agreement!.disclosesSubVendors, status: agreement!.status } })
    }
  })
})
