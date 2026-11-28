import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { prisma, as, req, json, freshWorld } from './harness'
import { GET as listGET } from '@/app/api/packets/route'
import { POST as resendPOST } from '@/app/api/packets/[id]/resend/route'

/**
 * A request stuck at 0 of 3, opened and sent again from Document requests,
 * as Halcyon Talent's HR (the founder's tester, 2026-11-03).
 */

const HIM = 'samuel.adeyinka@seed.etyme.invalid'
const HR = 'world-halcyon@demo.etyme.local'
const STRANGER = 'world-vertex-global@demo.etyme.local'
let packetId = ''
let token = ''

beforeAll(async () => {
  await freshWorld()
  const [person, hr] = await Promise.all([
    prisma.person.findUniqueOrThrow({ where: { primaryEmail: HIM }, select: { id: true } }),
    prisma.person.findUniqueOrThrow({ where: { primaryEmail: HR }, select: { id: true } }),
  ])
  const seat = await prisma.context.findFirstOrThrow({ where: { personId: hr.id, revokedAt: null, companyId: { not: null } }, select: { companyId: true } })
  token = randomBytes(24).toString('hex')
  const packet = await prisma.documentPacket.create({
    data: {
      companyId: seat.companyId!, packetKey: 'CONTRACT_START_W2', label: 'Start papers', purpose: 'CONTRACT_START',
      subjectPersonId: person.id, recipientEmail: HIM, token, expiresAt: new Date(Date.now() - 3 * 86_400_000), createdById: hr.id,
      items: { create: [
        { key: 'I9_EVERIFY', label: 'I-9 and E-Verify', hint: '', position: 0 },
        { key: 'BACKGROUND_CHECK', label: 'Background check', hint: '', position: 1 },
        { key: 'NDA', label: 'Signed non-disclosure agreement', hint: '', position: 2 },
      ] },
    },
  })
  packetId = packet.id
}, 600_000)

describe('Document requests', () => {
  it('a packet row opens its packet and shows its link', async () => {
    as(HR)
    const res = await json(await listGET(req('GET', '/api/packets')))
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    const row = res.body.data.packets.find((p: any) => p.id === packetId)
    expect(row.link).toBe(`/packet/${token}`)
    expect(row.items.map((i: any) => [i.label, i.state])).toEqual([
      ['I-9 and E-Verify', 'PENDING'], ['Background check', 'PENDING'], ['Signed non-disclosure agreement', 'PENDING'],
    ])
  })

  it('a stuck packet can be sent again from the page', async () => {
    as(HR)
    const res = await json(await resendPOST(req('POST', `/api/packets/${packetId}/resend`), { params: Promise.resolve({ id: packetId }) }))
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(res.body.data.link).toBe(`/packet/${token}`)
    expect(res.body.data.message).toMatch(/I-9 and E-Verify, Background check and Signed non-disclosure agreement|send .* the link yourself/)
    const after = await prisma.documentPacket.findUniqueOrThrow({ where: { id: packetId } })
    expect(after.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000)
  })

  it('a firm that did not send the request is told it is not theirs', async () => {
    as(STRANGER)
    const res = await json(await resendPOST(req('POST', `/api/packets/${packetId}/resend`), { params: Promise.resolve({ id: packetId }) }))
    expect(res.status).toBe(404)
    expect(res.body.error.message).toMatch(/not sent by your company/)
  })
})
