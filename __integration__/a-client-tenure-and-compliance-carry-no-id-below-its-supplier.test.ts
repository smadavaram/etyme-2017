import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, as, req, json, freshWorld } from './harness'
import { GET as tenure } from '@/app/api/tenure/route'
import { GET as compliance } from '@/app/api/compliance/route'

/**
 * Record 119: no trace of a firm below its supplier reaches a client, not
 * its id and not the id of the line between the supplier and that firm.
 * Priya Ramesh is employed by the sub-vendor, sold to the prime, and sold on
 * by the prime to the client.
 */
const CLIENT = 'world-harlow-health@demo.etyme.local'

let subId = ''
let harlowId = ''
let subLine = ''
let primeLine = ''

const slug = (s: string) => prisma.company.findFirstOrThrow({ where: { slug: s }, select: { id: true, name: true } })

beforeAll(async () => {
  await freshWorld()
  const [tecwyn, cs, harlow] = await Promise.all(['world-tecwyn', 'world-computer-systems', 'world-harlow-health'].map(slug))
  subId = tecwyn.id
  harlowId = harlow.id
  subLine = (await prisma.sellContract.findFirstOrThrow({ where: { companyId: tecwyn.id, clientCompanyId: cs.id, person: { name: 'Priya Ramesh' } }, select: { id: true } })).id
  primeLine = (await prisma.sellContract.findFirstOrThrow({ where: { companyId: cs.id, clientCompanyId: harlow.id, person: { name: 'Priya Ramesh' } }, select: { id: true } })).id
}, 600_000)

describe('the tenure ledger a client reads', () => {
  const read = async (seat: string) => {
    as(seat)
    return json(await tenure(req('GET', `/api/tenure?clientCompanyId=${harlowId}`)))
  }

  it('a client reads no id of the line between its supplier and the firm below it', async () => {
    const r = await read(CLIENT)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const text = JSON.stringify(r.body)
    expect(text).not.toContain(subLine)
    expect(text).not.toContain(subId)
    expect(text.toLowerCase()).not.toContain('tecwyn')
  })

  it('a client still reads Priya Ramesh with the line it pays for under its own id', async () => {
    const r = await read(CLIENT)
    const priya = r.body.data.people.find((p: { name: string }) => p.name === 'Priya Ramesh')
    expect(priya).toBeDefined()
    expect(priya.contracts.map((c: { id: string | null }) => c.id)).toContain(primeLine)
    expect(priya.contracts.every((c: { id: string | null }) => c.id === null || c.id === primeLine)).toBe(true)
  })
})

describe('the compliance page a client reads', () => {
  const read = async (seat: string) => {
    as(seat)
    return json(await compliance(req('GET', '/api/compliance')))
  }

  it('a client reads no id of a firm below its supplier, and no id beside a withheld name', async () => {
    const r = await read(CLIENT)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const text = JSON.stringify(r.body)
    expect(text).not.toContain(subId)
    expect(text).not.toContain(subLine)
    expect(text.toLowerCase()).not.toContain('tecwyn')
    const lists = [r.body.data?.verification?.companies, r.body.data?.lapsed].flat().filter(Boolean)
    for (const c of lists as Array<{ nameWithheld?: boolean; companyId?: string | null }>) {
      if (c.nameWithheld) expect(c.companyId ?? null).toBeNull()
    }
  })
})
