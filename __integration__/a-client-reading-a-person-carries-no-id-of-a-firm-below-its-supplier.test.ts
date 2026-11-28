import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, as, req, json, freshWorld } from './harness'
import { GET as person } from '@/app/api/people/[id]/route'

/**
 * Record 119: no name or id of a firm below its supplier reaches a client.
 * Priya Ramesh is employed by the sub-vendor (Tecwyn), sold to the prime
 * (Computer Systems), and sold on by the prime to the client (Harlow Health).
 */
const CLIENT = 'world-harlow-health@demo.etyme.local'

let subId = ''
let personId = ''

beforeAll(async () => {
  await freshWorld()
  subId = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-tecwyn' }, select: { id: true } })).id
  personId = (await prisma.person.findFirstOrThrow({ where: { name: 'Priya Ramesh' }, select: { id: true } })).id
}, 600_000)

describe('the page a client reads for one person', () => {
  const read = async () => {
    as(CLIENT)
    return json(await person(req('GET', `/api/people/${personId}`), { params: Promise.resolve({ id: personId }) }))
  }

  it('a client reading a person carries no id of a firm below its supplier', async () => {
    const r = await read()
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const text = JSON.stringify(r.body)
    expect(text).not.toContain(subId)
    expect(text.toLowerCase()).not.toContain('tecwyn')
    const rows = [...r.body.data.engagements.map((e: { supplier: { id: string | null; nameWithheld: boolean } }) => e.supplier), ...r.body.data.representedBy]
    for (const f of rows as Array<{ id: string | null; nameWithheld?: boolean }>) {
      if (f.nameWithheld) expect(f.id).toBeNull()
    }
  })
})
