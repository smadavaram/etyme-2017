import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, as, req, json, freshWorld } from './harness'
import { POST as docsPOST, GET as docsGET } from '@/app/api/documents/route'
import { POST as sendPOST } from '@/app/api/documents/[id]/send/route'
import { POST as uploadPOST } from '@/app/api/documents/[id]/upload/route'

/** Walk 7: Halcyon asks Samuel for "Signed non-disclosure agreement"; Paperwork must open it as the NDA. */
const HIM = 'samuel.adeyinka@seed.etyme.invalid'
const HALCYON = 'world-halcyon@demo.etyme.local'
const P = (id: string) => ({ params: Promise.resolve({ id }) } as never)
let id = ''
beforeAll(async () => {
  await freshWorld()
  const p = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: HIM } })
  const line = await prisma.sellContract.findFirstOrThrow({ where: { personId: p.id } })
  as(HALCYON)
  const made = await json(await docsPOST(req('POST', '/api/documents', { type: 'ask', documentTypeKey: 'NDA', paperLabel: 'Signed non-disclosure agreement', personId: p.id, contractId: line.id })))
  id = made.body.data.instance.id
  await sendPOST(req('POST', `/api/documents/${id}/send`, {}), P(id))
  as(HIM)
  await uploadPOST(req('POST', `/api/documents/${id}/upload`, { fileUrl: 'https://files.example/nda.pdf', fileName: 'nda.pdf' }), P(id))
}, 600_000)

describe('every reader knows every name the product gives a paper, on the seeded world', () => {
  it('Paperwork opens the NDA asked as “Signed non-disclosure agreement” with the start and end its dialog asks for', async () => {
    as(HALCYON)
    const list = await json(await docsGET(req('GET', '/api/documents?view=instances')))
    const row = list.body.data.instances.find((i: any) => i.id === id)
    expect(row?.examineNeeds).toMatchObject({ start: true, end: true })
  })
})
