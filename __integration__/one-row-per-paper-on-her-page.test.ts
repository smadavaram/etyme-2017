import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, as, req, json, freshWorld } from './harness'
import { POST as docsPOST } from '@/app/api/documents/route'
import { POST as sendPOST } from '@/app/api/documents/[id]/send/route'
import { GET as mePapers } from '@/app/api/me/papers/route'

/**
 * Walk 7, 2026-11-08, item 2: Halcyon Talent pressed "Ask Samuel" for the
 * NDA on his placement, and his own page then listed it twice: "Non-
 * disclosure agreement · Not on file" and "Signed non-disclosure
 * agreement · Asked for". One paper, one firm that asked, one row.
 */
const HIM = 'samuel.adeyinka@seed.etyme.invalid'
const HALCYON = 'world-halcyon@demo.etyme.local'
let askId = ''

beforeAll(async () => {
  await freshWorld()
  const person = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: HIM }, select: { id: true } })
  const line = await prisma.sellContract.findFirstOrThrow({ where: { personId: person.id }, select: { id: true } })
  as(HALCYON)
  // The placement's own Ask door: the request, then it is sent to him.
  const made = await json(await docsPOST(req('POST', '/api/documents', { type: 'ask', documentTypeKey: 'NDA', paperLabel: 'Signed non-disclosure agreement', personId: person.id, contractId: line.id })))
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  askId = made.body.data.instance.id
  const sent = await json(await sendPOST(req('POST', `/api/documents/${askId}/send`, {}), { params: Promise.resolve({ id: askId }) } as never))
  expect(sent.status, JSON.stringify(sent.body)).toBe(200)
}, 600_000)

describe('one row per paper per firm that asked, on the worker’s own page', () => {
  it('an NDA his employer asked for from the placement is one row on his own page, the request, and never a second row saying it is not on file', async () => {
    as(HIM)
    const r = await json(await mePapers(req('GET', '/api/me/papers')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const ndas = r.body.data.papers.filter((p: any) => /non-disclosure/i.test(p.name))
    expect(ndas.map((p: any) => [p.id, p.word]), JSON.stringify(ndas)).toHaveLength(1)
    expect(ndas[0].id).toBe(askId)
    expect(ndas[0].askedBy).toBe('Halcyon Talent')
  })
})
