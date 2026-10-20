import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, as, req, json, freshWorld } from './harness'
import { askForClearance, clearanceQueue, previewFor } from '@/app/api/compliance/clearance/ask'
import { GET as clearanceGET, POST as clearancePOST } from '@/app/api/compliance/clearance/route'
import { POST as activatePOST } from '@/app/api/contracts/[id]/activate/route'
import { POST as reviewPOST } from '@/app/api/packets/[id]/review/route'

/**
 * Samuel Adeyinka is placed, and HR hears about it.
 *
 * He has been awarded a controls engineer seat at Cavanaugh Glassworks
 * through Halcyon Talent, he starts in ten days, and the only paper on
 * his file is a background check. Until today the first time anybody at
 * Halcyon would have learned that he has no I-9 was the moment somebody
 * pressed activate — and the answer would have gone to whoever pressed
 * it, not to the desk that can chase the document.
 *
 * This is that placement walked end to end: the ask goes out when he is
 * placed, it goes to him rather than to his agency, HR is told what is
 * outstanding, asking twice asks nobody twice, and the sentence HR reads
 * is character for character the sentence activation refuses with.
 */

const HIM = 'samuel.adeyinka@seed.etyme.invalid'
const HR_AT_HALCYON = 'world-halcyon@demo.etyme.local'
/** A different firm entirely, so a stranger can be refused in words. */
const SOMEBODY_ELSE = 'world-vertex-global@demo.etyme.local'

let contractId = ''
let personId = ''
let companyId = ''

describe('asking for the papers when somebody is placed', () => {
  beforeAll(async () => {
    await freshWorld()
    const person = await prisma.person.findUniqueOrThrow({
      where: { primaryEmail: HIM },
      select: { id: true },
    })
    personId = person.id
    const contract = await prisma.sellContract.findFirstOrThrow({
      where: { personId, state: 'DRAFT' },
      select: { id: true, companyId: true },
    })
    contractId = contract.id
    companyId = contract.companyId

    // The story starts where the founder's question starts: he has been
    // placed and nobody has asked him for anything yet. Cleared rather
    // than assumed, so this file does not depend on which of the other
    // integration stories ran before it.
    await prisma.packetItem.deleteMany({
      where: { packet: { subjectPersonId: personId, purpose: 'CONTRACT_START' } },
    })
    await prisma.documentPacket.deleteMany({
      where: { subjectPersonId: personId, purpose: 'CONTRACT_START' },
    })
  }, 600_000)

  it('the papers are asked for when somebody is placed, not when somebody tries to start them', async () => {
    // Nothing has been asked of him before this runs. His contract is in
    // draft, his start date is ahead, and nobody has pressed activate.
    const before = await prisma.documentPacket.count({
      where: { subjectPersonId: personId, purpose: 'CONTRACT_START' },
    })
    expect(before, 'the seeded world holds no start ask for him').toBe(0)

    const result = await askForClearance({ contractId })
    expect('packetId' in result && result.packetId, 'the placement should have raised the ask').toBeTruthy()

    const packet = await prisma.documentPacket.findFirstOrThrow({
      where: { subjectPersonId: personId, purpose: 'CONTRACT_START' },
      include: { items: { orderBy: { position: 'asc' } } },
    })
    expect(packet.items.map((i) => i.key)).toContain('I9_EVERIFY')
    // The background check on his file is not asked for a second time.
    expect(packet.items.map((i) => i.key)).not.toContain('BACKGROUND_CHECK')
  })

  it('the ask goes to the worker’s own address, with a link that is theirs and an end date on it', async () => {
    const packet = await prisma.documentPacket.findFirstOrThrow({
      where: { subjectPersonId: personId, purpose: 'CONTRACT_START' },
    })
    expect(packet.recipientEmail).toBe(HIM)
    expect(packet.token.length).toBeGreaterThan(20)
    expect(packet.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('it tells him why he is being asked, naming the client and the day he starts', async () => {
    const packet = await prisma.documentPacket.findFirstOrThrow({
      where: { subjectPersonId: personId, purpose: 'CONTRACT_START' },
    })
    expect(packet.reopenedReason).toContain('Cavanaugh Glassworks')
    expect(packet.reopenedReason).toContain('Controls engineer')
    expect(packet.reopenedReason).toMatch(/before your first day/)
    expect(packet.reopenedReason).not.toMatch(/DRAFT|CONTRACT_START/)
  })

  it('asking twice for the same placement asks nobody twice', async () => {
    const again = await askForClearance({ contractId })
    expect('alreadyAsked' in again && again.alreadyAsked).toBe(true)
    const count = await prisma.documentPacket.count({
      where: { subjectPersonId: personId, purpose: 'CONTRACT_START' },
    })
    expect(count, 'one placement, one ask').toBe(1)
  })

  it('HR is told a placement needs clearing, and the notice says what is outstanding', async () => {
    const hr = await prisma.person.findUniqueOrThrow({
      where: { primaryEmail: HR_AT_HALCYON },
      select: { id: true },
    })
    // The award tells HR without waiting for the send, so on a busy machine
    // the notice lands a moment after the award returns. Wait for it.
    let told = null as Awaited<ReturnType<typeof prisma.notification.findFirst>>
    for (let i = 0; i < 50 && !told; i++) {
      told = await prisma.notification.findFirst({
        where: { personId: hr.id, entityId: contractId },
        orderBy: { createdAt: 'desc' },
      })
      if (!told) await new Promise((r) => setTimeout(r, 100))
    }
    expect(told, 'the role that must clear a start is the role that hears one is coming').toBeTruthy()
    expect(told!.title).toContain('Samuel Adeyinka')
    expect(told!.title).toContain('Cavanaugh Glassworks')
    expect(told!.body).toMatch(/cannot start without/)
    expect(told!.body).toMatch(/Controls engineer/)
    // A sentence, never a code.
    expect(told!.body).not.toMatch(/DOCUMENTS_BLOCK|DOCUMENTS_WARN/)
    // Email as well as in the app, because somebody who cannot start is
    // worth leaving the app for.
    expect(told!.channel).toBe('EMAIL')
  })

  it('he is told too, on his own channel, with the papers named', async () => {
    const packet = await prisma.documentPacket.findFirstOrThrow({
      where: { subjectPersonId: personId, purpose: 'CONTRACT_START' },
    })
    const told = await prisma.notification.findFirst({
      where: { personId, entityId: packet.id },
    })
    expect(told).toBeTruthy()
    expect(told!.body).toMatch(/I-9/)
  })

  it('his notice counts the papers in a word and names each one, never “3 document(s)”', async () => {
    const packet = await prisma.documentPacket.findFirstOrThrow({
      where: { subjectPersonId: personId, purpose: 'CONTRACT_START' },
      include: { items: true },
    })
    const told = await prisma.notification.findFirstOrThrow({ where: { personId, entityId: packet.id } })
    expect(told.title).not.toMatch(/document\(s\)|\(s\)/)
    expect(told.title).toMatch(/^Halcyon Talent needs (one paper|two papers|three papers|four papers) before you start as Controls engineer/)
    expect(told.title).toMatch(/proof of right to work \(I-9, checked with E-Verify\)|an I-9/)
    // The job leads the body, so the notice says what it is about wherever it is read.
    expect(told.body).toMatch(/^Controls engineer/)
    expect(told.body).toContain('Cavanaugh Glassworks')
    // One paper is said as one: "This is the paper", never "These are the papers".
    const one = /needs one paper\b/.test(told.title)
    expect(told.body).toMatch(one ? /This is the paper we need/ : /These are the papers we need/)
  })

  it('it writes down that it asked, why, and that cancelling the request undoes it', async () => {
    const packet = await prisma.documentPacket.findFirstOrThrow({
      where: { subjectPersonId: personId, purpose: 'CONTRACT_START' },
    })
    const log = await prisma.automationLog.findFirst({
      where: { action: 'PACKET_REQUESTED', payload: { path: ['packetId'], equals: packet.id } },
    })
    expect(log, 'anything the system does writes a row with a plain-English reason').toBeTruthy()
    expect(log!.summary).toContain('Samuel Adeyinka')
    expect(log!.reason).toMatch(/asked for now rather than when somebody tries to start them/)
    expect(log!.reversible).toBe(true)
    expect((log!.payload as any).contractId).toBe(contractId)
  })

  it('the preview HR reads and the refusal activation gives are the same sentences', async () => {
    const found = await previewFor(contractId)
    expect(found).toBeTruthy()

    as(HR_AT_HALCYON)
    const refusal = await json(
      await activatePOST(req('POST', `/api/contracts/${contractId}/activate`, { action: 'activate' }), {
        params: Promise.resolve({ id: contractId }),
      } as any)
    )
    expect(refusal.status, 'a person with no I-9 cannot be started').toBe(403)
    expect(refusal.body.error.message).toBe(found!.preview.says)
    expect(refusal.body.error.fix).toBe(found!.preview.fix)
  })

  it('HR opens its own queue and finds the placement on it, what cannot start first', async () => {
    as(HR_AT_HALCYON)
    const res = await json(await clearanceGET(req('GET', '/api/compliance/clearance')))
    expect(res.status).toBe(200)
    const mine = res.body.data.rows.find((r: any) => r.contractId === contractId)
    expect(mine, 'a placement that cannot start belongs on the desk that can fix it').toBeTruthy()
    expect(mine.outcome).toBe('BLOCK')
    expect(mine.asked).toBe(true)
    expect(mine.outstanding).toMatch(/Still needed:/)
    expect(res.body.data.rows[0].outcome).toBe('BLOCK')
    expect(res.body.data.says).toMatch(/cannot start until something is on file/)
  })

  it('a stranger to the placement cannot ask its worker for anything, and the refusal says whose it is', async () => {
    as(SOMEBODY_ELSE)
    const res = await json(
      await clearancePOST(req('POST', '/api/compliance/clearance', { contractId }))
    )
    expect(res.status).toBe(403)
    expect(res.body.error.message).toContain('Halcyon Talent')
    expect(res.body.error.message).toMatch(/Only the firm that employs or places somebody/)
  })

  it('the firm’s own insurance is not asked of the worker, because it was never his to produce', async () => {
    const packet = await prisma.documentPacket.findFirstOrThrow({
      where: { subjectPersonId: personId, purpose: 'CONTRACT_START' },
      include: { items: true },
    })
    expect(packet.items.map((i) => i.key)).not.toContain('INSURANCE_GL')
    expect(packet.items.map((i) => i.key)).not.toContain('NDA')
  })

  it('an I-9 accepted from his document request with nothing examined is accepted as a file, says it does not count toward the start yet, and the start stays refused', async () => {
    const item = await receivedItem('I9_EVERIFY')
    as(HR_AT_HALCYON)
    const res = await json(await reviewPOST(
      req('POST', `/api/packets/${item.packetId}/review`, { itemId: item.id, action: 'accept' }),
      { params: Promise.resolve({ id: item.packetId }) } as any
    ))
    expect(res.status).toBe(200)
    expect(res.body.data.countsTowardStart).toBe(false)
    expect(res.body.data.message).toMatch(/It does not count toward the start yet\. Say which edition of the I-9/)
    const after = await prisma.packetItem.findUniqueOrThrow({ where: { id: item.id } })
    expect(after.state).toBe('ACCEPTED')
    expect(after.verificationId, 'a file somebody looked at is not an examination').toBeNull()
    const found = await previewFor(contractId)
    expect(found!.preview.blocking.map((b) => b.key)).toContain('I9_EVERIFY')
  })

  it('an examination given wrong changes nothing and says what to give', async () => {
    const item = await receivedItem('I9_EVERIFY')
    as(HR_AT_HALCYON)
    const res = await json(await reviewPOST(
      req('POST', `/api/packets/${item.packetId}/review`, { itemId: item.id, action: 'accept', formEdition: '01/20/25' }),
      { params: Promise.resolve({ id: item.packetId }) } as any
    ))
    expect(res.status).toBe(422)
    expect(res.body.error.message).toMatch(/Say which document Samuel Adeyinka showed/)
    const after = await prisma.packetItem.findUniqueOrThrow({ where: { id: item.id } })
    expect(after.state, 'nothing changes on a refusal').toBe('RECEIVED')
  })

  it('an I-9 accepted from his document request with the examination recorded is read by the start check the same as a recorded check', async () => {
    const item = await receivedItem('I9_EVERIFY')
    as(HR_AT_HALCYON)
    const passportRunsOut = new Date(Date.now() + 5 * 365 * 86_400_000).toISOString().slice(0, 10)
    const res = await json(await reviewPOST(
      req('POST', `/api/packets/${item.packetId}/review`, {
        itemId: item.id, action: 'accept',
        formEdition: '01/20/25', evidence: [{ type: 'PASSPORT', issuer: 'United States', expiresAt: passportRunsOut }],
      }),
      { params: Promise.resolve({ id: item.packetId }) } as any
    ))
    expect(res.status).toBe(200)
    expect(res.body.data.countsTowardStart).toBe(true)
    expect(res.body.data.message).toMatch(/examined Samuel Adeyinka’s passport and completed the I-9 on the 01\/20\/25 edition/)
    expect(res.body.data.message).toMatch(/It counts toward the start\.$/)

    // The item keeps the row it became, and the row is a recorded check
    // with the passport standing behind it: the same shape Record a check writes.
    const after = await prisma.packetItem.findUniqueOrThrow({ where: { id: item.id } })
    expect(after.verificationId).toBeTruthy()
    const check = await prisma.verification.findUniqueOrThrow({
      where: { id: after.verificationId! },
      select: { personId: true, type: true, status: true, formEdition: true },
    })
    expect(check).toMatchObject({ personId, type: 'I9_EVERIFY', status: 'CLEAR', formEdition: '01/20/25' })
    expect(await prisma.documentBacking.count({ where: { formId: after.verificationId! } })).toBe(1)

    // And the start check reads it: the I-9 no longer holds the start.
    const found = await previewFor(contractId)
    const keys = found!.preview.blocking.map((b) => b.key)
    expect(keys).not.toContain('I9_EVERIFY')
    expect(keys).not.toContain('RIGHT_TO_WORK')

    // The examination read his file, so the read is on his access log.
    const logged = await prisma.accessLog.findFirst({
      where: { subjectId: personId, action: 'COMPLIANCE_CHECK', reason: { contains: 'from a document request' } },
    })
    expect(logged).toBeTruthy()
  })

  it('a placement whose paperwork is in order is not on anybody’s queue', async () => {
    const rows = await clearanceQueue(companyId)
    for (const row of rows) {
      expect(row.outcome, 'work is what is left to do').not.toBe('PASS')
    }
  })
})

/** His start packet's item of this kind, sent back by him and waiting to be looked at. */
async function receivedItem(key: string): Promise<{ id: string; packetId: string }> {
  const item = await prisma.packetItem.findFirstOrThrow({
    where: { key, packet: { subjectPersonId: personId, purpose: 'CONTRACT_START' } },
    select: { id: true, packetId: true },
  })
  await prisma.packetItem.update({
    where: { id: item.id },
    data: { state: 'RECEIVED', fileUrl: 'https://files.example/i9.pdf', fileName: 'i9.pdf', receivedAt: new Date(), verificationId: null },
  })
  return item
}
