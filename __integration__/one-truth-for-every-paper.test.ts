import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { prisma, as, req, json, freshWorld } from './harness'
import { POST as examinePOST } from '@/app/api/documents/[id]/examine/route'
import { POST as askPOST } from '@/app/api/packets/route'
import { GET as placementGET } from '@/app/api/placements/[id]/route'
import { POST as backfillPOST } from '@/app/api/packets/backfill/route'

/**
 * One truth for every paper, walked as the founder's tester walked it on
 * production, 2026-11-03.
 *
 * Brightmoor accepted Rajesh Iyer's background check, drug screen, NDA
 * and confidentiality undertaking on Paperwork, and the placement went on
 * reading all four as "needed / Not on file" while a fresh W-2 request
 * said "everything is already on file and current". Here Samuel
 * Adeyinka, placed at Cavanaugh Glassworks through Halcyon Talent, sends
 * the same papers, Halcyon's HR accepts them, and the placement, the
 * request and the record read one answer. Then papers accepted before the
 * fix get their record from the backfill, once.
 */

const HIM = 'samuel.adeyinka@seed.etyme.invalid'
const HR = 'world-halcyon@demo.etyme.local'

let personId = ''
let companyId = ''
let contractId = ''
let hrId = ''
const paperOf: Record<string, string> = {}
const itemOf: Record<string, string> = {}

async function packetWith(keys: { key: string; label: string; state: string; validUntil?: Date }[]) {
  const packet = await prisma.documentPacket.create({
    data: {
      companyId, packetKey: 'CONTRACT_START_W2', label: 'Start papers', purpose: 'CONTRACT_START',
      subjectPersonId: personId, recipientEmail: HIM, token: randomBytes(24).toString('hex'),
      expiresAt: new Date(Date.now() + 30 * 86_400_000), createdById: hrId,
    },
  })
  for (const [i, k] of keys.entries()) {
    const item = await prisma.packetItem.create({
      data: {
        packetId: packet.id, key: k.key, label: k.label, hint: '', position: i, state: k.state,
        fileName: `${k.key.toLowerCase()}.pdf`, receivedAt: new Date(), validUntil: k.validUntil ?? null,
        ...(k.state === 'ACCEPTED' ? { reviewedById: hrId, reviewedAt: new Date() } : {}),
      },
    })
    const template =
      (await prisma.docTemplate.findFirst({ where: { companyId, name: k.label } })) ??
      (await prisma.docTemplate.create({ data: { companyId, name: k.label, audience: 'GENERAL', needsSignature: false } }))
    const paper = await prisma.docInstance.create({
      data: {
        templateId: template.id, subjectType: 'PACKET_ITEM', subjectId: item.id, status: 'UPLOADED',
        sentAt: new Date(), signedAt: new Date(), fileName: `${k.key.toLowerCase()}.pdf`,
        ...(k.state === 'ACCEPTED' ? { examinedById: hrId, examinedAt: new Date(), expiresAt: k.validUntil ?? null } : {}),
      },
    })
    itemOf[k.key] = item.id
    paperOf[k.key] = paper.id
  }
  return packet.id
}

const examine = async (key: string, body: Record<string, unknown>) =>
  json(await examinePOST(req('POST', `/api/documents/${paperOf[key]}/examine`, body), { params: Promise.resolve({ id: paperOf[key] }) }))

async function checklist() {
  as(HR)
  const res = await json(await placementGET(req('GET', `/api/placements/${contractId}`), { params: Promise.resolve({ id: contractId }) }))
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  const items = (res.body.data.paperwork?.checklist?.items ?? res.body.data.checklist?.items ?? findItems(res.body.data)) as { key: string; state: string }[]
  return new Map(items.map((i) => [i.key, i.state]))
}

/** The checklist's items, wherever the placement's answer carries them. */
function findItems(data: any): unknown[] {
  const stack = [data]
  while (stack.length) {
    const v = stack.pop()
    if (v && typeof v === 'object') {
      if (Array.isArray(v.items) && v.items.some((i: any) => i && typeof i.key === 'string' && typeof i.state === 'string')) return v.items
      for (const x of Object.values(v)) stack.push(x)
    }
  }
  return []
}

async function askedFor(): Promise<string[]> {
  as(HR)
  const res = await json(await askPOST(req('POST', '/api/packets', {
    packetKey: 'CONTRACT_START_W2', subjectPersonId: personId, recipientEmail: HIM, recipientName: 'Samuel Adeyinka',
  })))
  expect(res.status, JSON.stringify(res.body)).toBeLessThan(300)
  if (res.body.data.created === false) return []
  const packet = await prisma.documentPacket.findFirstOrThrow({
    where: { companyId, subjectPersonId: personId }, orderBy: { createdAt: 'desc' }, include: { items: true },
  })
  const keys = packet.items.map((i) => i.key)
  // Asked and closed again, so the next ask in this file starts from the record.
  await prisma.documentPacket.update({ where: { id: packet.id }, data: { cancelledAt: new Date() } })
  return keys
}

beforeAll(async () => {
  await freshWorld()
  const [person, hr] = await Promise.all([
    prisma.person.findUniqueOrThrow({ where: { primaryEmail: HIM }, select: { id: true } }),
    prisma.person.findUniqueOrThrow({ where: { primaryEmail: HR }, select: { id: true } }),
  ])
  personId = person.id
  hrId = hr.id
  const line = await prisma.sellContract.findFirstOrThrow({ where: { personId, state: 'DRAFT' }, select: { id: true, companyId: true } })
  contractId = line.id
  companyId = line.companyId
  // He starts from nothing on file about the papers this walks.
  await prisma.verification.deleteMany({ where: { personId, type: { in: ['BACKGROUND_CHECK', 'DRUG_SCREENING', 'PASSPORT'] } } })
  await prisma.documentPacket.deleteMany({ where: { subjectPersonId: personId } })
  await packetWith([
    { key: 'BACKGROUND_CHECK', label: 'Background check', state: 'RECEIVED' },
    { key: 'DRUG_SCREENING', label: 'Drug screening', state: 'RECEIVED' },
    { key: 'NDA', label: 'Signed non-disclosure agreement', state: 'RECEIVED' },
  ])
}, 600_000)

describe('a paper accepted on Paperwork is the record the placement reads', () => {
  it('a background check accepted with no screening company named is refused, naming the field to fill', async () => {
    as(HR)
    const res = await examine('BACKGROUND_CHECK', { verdict: 'ACCEPT', expiresAt: '2027-11-01' })
    expect(res.status, JSON.stringify(res.body)).toBe(422)
    expect(res.body.error.field).toBe('provider')
    expect(res.body.error.message).toMatch(/Name the screening company/)
  })

  it('a background check accepted on Paperwork is the record the placement’s checklist reads', async () => {
    as(HR)
    const res = await examine('BACKGROUND_CHECK', {
      verdict: 'ACCEPT', provider: 'Sterling', reference: 'ST-4471', renderedOn: '2026-10-28', outcome: 'CLEAR',
      providerSays: 'Clear. No records found.',
    })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    const check = await prisma.verification.findFirstOrThrow({ where: { personId, type: 'BACKGROUND_CHECK' } })
    expect(check.provider).toBe('Sterling')
    expect(check.referenceId).toBe('ST-4471')
    expect(check.status).toBe('CLEAR')
    const item = await prisma.packetItem.findUniqueOrThrow({ where: { id: itemOf.BACKGROUND_CHECK } })
    expect(item.state).toBe('ACCEPTED')
    expect(item.verificationId).toBe(check.id)
    const states = await checklist()
    expect(states.get('BACKGROUND_CHECK'), JSON.stringify([...states])).not.toBe('NEEDED')
  })

  it('a drug screen accepted on Paperwork carries the laboratory’s name, reference and date', async () => {
    as(HR)
    const res = await examine('DRUG_SCREENING', {
      verdict: 'ACCEPT', provider: 'Quest Diagnostics', reference: 'Q-88120', renderedOn: '2026-10-29', outcome: 'CLEAR',
      providerSays: 'Negative.',
    })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    const check = await prisma.verification.findFirstOrThrow({ where: { personId, type: 'DRUG_SCREENING' } })
    expect([check.provider, check.referenceId, check.verifiedAt?.toISOString().slice(0, 10)]).toEqual(['Quest Diagnostics', 'Q-88120', '2026-10-29'])
  })

  it('an NDA accepted on Paperwork stands behind the start the way the clearance expects', async () => {
    const before = await checklist()
    expect(before.get('NDA')).toBe('NEEDED')
    as(HR)
    const res = await examine('NDA', { verdict: 'ACCEPT', validFrom: '2026-10-28', expiresAt: '2027-11-01' })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    const after = await checklist()
    expect(after.get('NDA'), JSON.stringify([...after])).not.toBe('NEEDED')
  })

  it('a packet request and the placement’s checklist never disagree about a paper', async () => {
    const states = await checklist()
    const asked = await askedFor()
    for (const key of ['BACKGROUND_CHECK', 'DRUG_SCREENING', 'NDA']) {
      const onFile = states.get(key) !== undefined && states.get(key) !== 'NEEDED'
      expect(asked.includes(key), `${key}: checklist ${states.get(key)}, request ${asked.includes(key) ? 'asks' : 'does not ask'}`).toBe(!onFile)
    }
  })
})

describe('the backfill', () => {
  beforeAll(async () => {
    await prisma.verification.deleteMany({ where: { personId, type: { in: ['BACKGROUND_CHECK', 'PASSPORT'] } } })
    // Accepted before the fix: the item reads accepted and nothing stands behind it.
    await packetWith([
      { key: 'BACKGROUND_CHECK', label: 'Background check (old)', state: 'ACCEPTED', validUntil: new Date('2027-11-01') },
      { key: 'PASSPORT', label: 'Passport biographic page', state: 'ACCEPTED', validUntil: new Date('2031-04-30') },
    ])
  })

  it('a background check accepted before the fix with no screening company named is neither on file at the request nor on the placement', async () => {
    const states = await checklist()
    expect(states.get('BACKGROUND_CHECK')).toBe('NEEDED')
    expect(await askedFor()).toContain('BACKGROUND_CHECK')
  })

  it('the backfill writes the record behind every paper already accepted and writes nothing twice', async () => {
    const secret = process.env.CRON_SECRET ?? 'test-cron-secret'
    process.env.CRON_SECRET = secret
    const run = async (write: boolean) =>
      json(await backfillPOST(req('POST', '/api/packets/backfill', { write }, { authorization: `Bearer ${secret}` })))

    const count = await run(false)
    expect(count.status, JSON.stringify(count.body)).toBe(200)
    expect(count.body.data.found.PASSPORT).toBe(1)
    expect(count.body.data.written).toEqual({})
    expect(await prisma.verification.count({ where: { personId, type: 'PASSPORT' } })).toBe(0)

    const first = await run(true)
    expect(first.body.data.written.PASSPORT, JSON.stringify(first.body)).toBe(1)
    // A screening company's verdict is never invented: it is named as held back, with the reason.
    expect(first.body.data.heldBack.BACKGROUND_CHECK.count).toBe(1)
    expect(first.body.data.heldBack.BACKGROUND_CHECK.says).toMatch(/screening company/)
    const passport = await prisma.verification.findFirstOrThrow({ where: { personId, type: 'PASSPORT' } })
    expect(passport.expiresAt?.toISOString().slice(0, 10)).toBe('2031-04-30')
    expect((await prisma.packetItem.findUniqueOrThrow({ where: { id: itemOf.PASSPORT } })).verificationId).toBe(passport.id)

    const second = await run(true)
    expect(second.body.data.written).toEqual({})
    expect(second.body.data.found.PASSPORT ?? 0).toBe(0)
    expect(await prisma.verification.count({ where: { personId, type: 'PASSPORT' } })).toBe(1)
    expect(await prisma.verification.count({ where: { personId, type: 'BACKGROUND_CHECK' } })).toBe(0)
  })

  it('the backfill answers nobody without the cron secret', async () => {
    const res = await backfillPOST(req('POST', '/api/packets/backfill', { write: true }, { authorization: 'Bearer wrong' }))
    expect(res.status).toBe(401)
  })
})
