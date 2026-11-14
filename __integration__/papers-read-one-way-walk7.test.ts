import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, as, req, json, freshWorld } from './harness'
import { GET as packetsGET } from '@/app/api/packets/route'
import { GET as documentsGET } from '@/app/api/documents/route'

/**
 * Walk 7, 2026-11-08, on the seeded world: Samuel Adeyinka (Halcyon
 * Talent → Cavanaugh Glassworks) sent his I-9 and nobody has examined it.
 * The placement read "arrived at Halcyon Talent, being examined" while
 * Cavanaugh's Document requests read nothing at its suppliers, and
 * Halcyon's Paperwork counted the paper while its Document requests read
 * "Waiting on you 0".
 */
const HIM = 'samuel.adeyinka@seed.etyme.invalid'
const HALCYON_HR = 'world-halcyon@demo.etyme.local'
const CAVANAUGH = 'world-corning-compliance@demo.etyme.local'
const HELENA = 'helena.marsh@seed.etyme.invalid'
const TECHPEPLE = 'world-techpeple@demo.etyme.local'
const NORTHBEND = 'world-nike-compliance@demo.etyme.local'

async function uploadAt(firmSeatEmail: string, personEmail: string, name: string) {
  const [person, seatPerson] = await Promise.all([
    prisma.person.findUniqueOrThrow({ where: { primaryEmail: personEmail }, select: { id: true } }),
    prisma.person.findUniqueOrThrow({ where: { primaryEmail: firmSeatEmail }, select: { id: true } }),
  ])
  const seat = await prisma.context.findFirstOrThrow({ where: { personId: seatPerson.id, revokedAt: null, companyId: { not: null } }, select: { companyId: true } })
  const template =
    (await prisma.docTemplate.findFirst({ where: { companyId: seat.companyId!, name }, select: { id: true } })) ??
    (await prisma.docTemplate.create({ data: { companyId: seat.companyId!, name, audience: 'GENERAL', needsSignature: false }, select: { id: true } }))
  await prisma.docInstance.create({
    data: { templateId: template.id, subjectType: 'PERSON', subjectId: person.id, status: 'UPLOADED', sentAt: new Date(), signedAt: new Date(), fileName: 'paper.pdf' },
  })
}

beforeAll(async () => {
  await freshWorld()
  // His own upload, from his own page: arrived at his employer, examined by nobody, answering no request.
  await uploadAt(HALCYON_HR, HIM, 'I-9 and E-Verify')
  // Hers, at Techpeple, the firm below the supplier Northbend pays.
  await uploadAt(TECHPEPLE, HELENA, 'I-9 and E-Verify')
}, 600_000)

describe('papers read one way, on the seeded world', () => {
  it('the client’s Document requests lists the I-9 that arrived at its supplier, in the placement’s own words, as at your suppliers', async () => {
    as(CAVANAUGH)
    const r = await json(await packetsGET(req('GET', '/api/packets')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const says = r.body.data.atSuppliers.map((a: any) => a.says)
    expect(says).toContain('Samuel Adeyinka’s I-9: arrived at Halcyon Talent, being examined.')
  })

  it('a paper that arrived at a firm below the supplier the client pays is listed without naming that firm', async () => {
    as(NORTHBEND)
    const r = await json(await packetsGET(req('GET', '/api/packets')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const hers = r.body.data.atSuppliers.filter((a: any) => a.personName === 'Helena Marsh')
    expect(hers.length, JSON.stringify(r.body.data.atSuppliers)).toBeGreaterThanOrEqual(1)
    for (const row of hers) {
      expect(row.says).not.toContain('Techpeple')
      expect(row.firmName).not.toContain('Techpeple')
    }
  })

  it('a worker’s own upload counts under Document requests’ Waiting on you exactly as it counts on Paperwork', async () => {
    as(HALCYON_HR)
    const [packets, papers] = await Promise.all([
      json(await packetsGET(req('GET', '/api/packets'))),
      json(await documentsGET(req('GET', '/api/documents?view=instances'))),
    ])
    expect(packets.status, JSON.stringify(packets.body)).toBe(200)
    expect(papers.status, JSON.stringify(papers.body)).toBe(200)
    expect(packets.body.data.awaitingReview).toBeGreaterThanOrEqual(1)
    expect(packets.body.data.awaitingReview).toBe(papers.body.data.waitingOnYou.count)
    expect(packets.body.data.waitingOutsideRequests).toBeGreaterThanOrEqual(1)
  })
})
