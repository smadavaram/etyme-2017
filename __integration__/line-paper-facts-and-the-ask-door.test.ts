import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, as, req, json, freshWorld } from './harness'
import { POST as docsPOST } from '@/app/api/documents/route'
import { POST as sendPOST } from '@/app/api/documents/[id]/send/route'
import { paperDoorsForLine } from '@/lib/document-stages/arrived-papers'
import { paperFactsForLine } from '@/lib/document-stages/line-paper-facts'

/**
 * Record 117, step 2 (regulatory half). The papers on a contract line say
 * what was asked, and the Ask door is offered on a sell line only, which
 * is the one the ask route keeps.
 */
const HIM = 'samuel.adeyinka@seed.etyme.invalid'
const HALCYON = 'world-halcyon@demo.etyme.local'
let personId = ''
let sellId = ''
let companyId = ''

beforeAll(async () => {
  await freshWorld()
  const p = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: HIM }, select: { id: true } })
  personId = p.id
  const line = await prisma.sellContract.findFirstOrThrow({ where: { personId }, select: { id: true, companyId: true } })
  sellId = line.id
  companyId = line.companyId
}, 600_000)

const items = [{ key: 'NDA', label: 'Non-disclosure agreement' }]

describe('the papers on a contract line say what was asked of the person', () => {
  it('an ask made from the line’s page reads as asked only once it is sent, by the ask on the paper, with the firm that asked', async () => {
    as(HALCYON)
    const made = await json(await docsPOST(req('POST', '/api/documents', { type: 'ask', documentTypeKey: 'NDA', paperLabel: 'Non-disclosure agreement', personId, contractId: sellId })))
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    // Made but not yet sent: nobody has been asked, and the view does not say so.
    expect((await paperFactsForLine({ contractId: sellId, items }))?.NDA.asked).toBeNull()
    const id = made.body.data.instance.id
    const sent = await json(await sendPOST(req('POST', `/api/documents/${id}/send`, {}), { params: Promise.resolve({ id }) } as never))
    expect(sent.status, JSON.stringify(sent.body)).toBe(200)
    const facts = await paperFactsForLine({ contractId: sellId, items })
    expect(facts?.NDA.asked?.via).toBe('PAPER')
    expect(facts?.NDA.asked?.firmName).toBeTruthy()
    expect(facts?.NDA.received).toBeNull()
    expect(facts?.NDA.examined).toBeNull()
  })

  it('a line that is not a sell line reads no facts at all, never a guess', async () => {
    expect(await paperFactsForLine({ contractId: 'no-such-line', items })).toBeNull()
  })
})

describe('an ask made from a buy line keeps the line it was asked on, or is never offered there', () => {
  it('a buy line’s id is never given to the paper doors, so the Ask door is never offered on a buy line', async () => {
    const buy = await prisma.buyContract.findFirst({ select: { id: true } })
    expect(buy, 'the seeded world has a buy line').not.toBeNull()
    const doors = await paperDoorsForLine({
      contractId: buy!.id,
      caller: { companyId, permissions: ['*'] },
      items: [{ key: 'NDA', label: 'Non-disclosure agreement', state: 'NEEDED', owedBy: 'WORKER' }],
    })
    expect(doors).toEqual({})
  })

  it('every Ask door the sell line offers names that sell line, and the ask route keeps exactly that line', async () => {
    const doors = await paperDoorsForLine({
      contractId: sellId,
      caller: { companyId, permissions: ['*'] },
      items: [{ key: 'W4', label: 'Tax withholding form', state: 'NEEDED', owedBy: 'WORKER' }],
    })
    const ask = Object.values(doors).flatMap((d) => d.doors).find((d) => d.kind === 'ASK')
    expect(ask, JSON.stringify(doors)).toBeDefined()
    if (ask && ask.kind === 'ASK') {
      expect(ask.contractId).toBe(sellId)
      as(HALCYON)
      const made = await json(await docsPOST(req('POST', '/api/documents', { type: 'ask', documentTypeKey: ask.documentTypeKey, paperLabel: ask.paperLabel, personId: ask.personId, contractId: ask.contractId })))
      expect(made.status, JSON.stringify(made.body)).toBe(201)
      const kept = await prisma.docInstance.findUniqueOrThrow({ where: { id: made.body.data.instance.id }, select: { sellContractId: true } })
      expect(kept.sellContractId).toBe(sellId)
    }
  })
})
