import { describe, it, expect, beforeAll } from 'vitest'
import { resetDatabase, prisma, as, req, json } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { contractClearance, lineExtras } from '@/lib/contract-clearance'
import { lookAtDocInstances, checksToRedo } from '@/lib/document-request'
import { GET as compliance } from '@/app/api/compliance/route'
import { GET as myPapersRoute } from '@/app/api/me/papers/route'
import { POST as setRequirement, GET as readRequirements } from '@/app/api/documents/requirements/route'

/**
 * The loop of documents, walked on the seeded world.
 *
 * "Ensure the loop of documents never cracks between parties."
 * — the founder, 2026-09-21.
 *
 * The table that says what a line requires landed this morning and
 * nothing read it: the refusal at a start, the packet that asks, the
 * pack that goes out and the worker's own page each kept their own idea
 * of what a placement needed. These are the sentences that join them —
 * on the seeded world, where Cavanaugh Glassworks has one contractor
 * working under a purchase order with no agreement behind it.
 */

const D = '@demo.etyme.local'

async function firm(slug: string) {
  return prisma.company.findFirstOrThrow({ where: { slug }, select: { id: true, name: true } })
}

describe('the loop of documents, between the parties', () => {
  let cavanaughLine = ''
  let cavanaughOrder = ''

  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()

    const wrenfield = await firm('world-wrenfield')
    const order = await prisma.workOrder.findFirstOrThrow({
      where: { issuedToId: wrenfield.id },
      select: { id: true },
    })
    cavanaughOrder = order.id
    const line = await prisma.sellContract.findFirstOrThrow({
      where: { workOrderId: order.id },
      select: { id: true },
    })
    cavanaughLine = line.id
  }, 600_000)

  it('Cavanaugh’s contractor on the no-agreement order shows the missing MSA on the clearance verdict, and the supplier’s row says whose order asked for it', async () => {
    const line = await prisma.sellContract.findUniqueOrThrow({
      where: { id: cavanaughLine },
      select: {
        id: true, personId: true, companyId: true, startDate: true, endDate: true,
        person: { select: { name: true } },
        company: { select: { name: true } },
        clientCompany: { select: { name: true } },
        requirement: { select: { title: true } },
      },
    })
    const extras = await lineExtras({ sellContractId: line.id })
    const verdict = contractClearance({
      personName: line.person.name,
      personVerifications: (await prisma.verification.findMany({
        where: { personId: line.personId },
        select: { type: true, status: true, issuedAt: true, validFrom: true, expiresAt: true, verifiedAt: true },
      })) as never,
      supplierName: line.company.name,
      supplierCertificates: [],
      clientName: line.clientCompany?.name ?? null,
      on: new Date(),
      role: line.requirement?.title ?? null,
      ...extras,
    })

    const msa = verdict.items.find((i) => i.key === 'MSA')
    expect(msa, 'the order asks for an agreement').toBeTruthy()
    expect(msa!.from).toBe('ORDER')
    // Nobody ever papered one, so it is outstanding rather than held.
    expect(['NEEDED', 'EXPIRED', 'NOT_YET_VALID']).toContain(msa!.state)
    expect(verdict.outcome).not.toBe('PASS')
    expect(verdict.says).toContain('Cavanaugh Glassworks')
    expect(msa!.asked).toContain('order')
  })

  it('the compliance page reads a supplier’s standing to trade beside its cover, not its insurance alone', async () => {
    const cavanaugh = await firm('world-corning')
    const wrenfield = await firm('world-wrenfield')
    // The state that registered the firm says it may not contract: a
    // certificate that ran out last month, on file.
    const staff = await prisma.context.findFirstOrThrow({
      where: { companyId: wrenfield.id, revokedAt: null },
      select: { personId: true },
    })
    await prisma.verification.create({
      data: {
        companyId: wrenfield.id,
        type: 'GOOD_STANDING',
        status: 'CLEAR',
        provider: 'Secretary of State',
        issuedAt: new Date(Date.now() - 400 * 86_400_000),
        validFrom: new Date(Date.now() - 400 * 86_400_000),
        expiresAt: new Date(Date.now() - 30 * 86_400_000),
        uploadedById: staff.personId,
        verifiedById: staff.personId,
        verifiedAt: new Date(Date.now() - 400 * 86_400_000),
        result: { outcome: 'CLEAR' },
      },
    })

    as(`world-corning-compliance${D}`)
    const r = await json(await compliance(req('GET', '/api/compliance')))
    expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBe(200)

    const row = (r.body.data.verifications.companies ?? []).find(
      (c: { name: string }) => c.name === wrenfield.name
    )
    expect(row, 'the firm with somebody on Cavanaugh’s site is on the page').toBeTruthy()
    const standing = row.checks.find((c: { type: string }) => c.type === 'GOOD_STANDING')
    expect(standing, 'its standing to trade is shown beside its cover').toBeTruthy()
    expect(standing.standing).toBe('EXPIRED')
    expect(row.cover.outcome).toBe('BLOCK')
    expect(row.cover.says).toMatch(/good standing/i)
    void cavanaugh
  })

  it('a client adds a document type of its own to an order and the next start asks for it', async () => {
    const cavanaugh = await firm('world-corning')
    await prisma.documentType.upsert({
      where: { companyId_key: { companyId: cavanaugh.id, key: 'CRANE_SIGNALLER' } },
      create: {
        companyId: cavanaugh.id,
        key: 'CRANE_SIGNALLER',
        label: 'Crane signaller card',
        hint: 'The card itself, with the day it runs out.',
        purpose: 'COMPLIANCE',
        validityShape: 'END_ONLY',
        suppliedBy: 'CANDIDATE',
        blocks: false,
      },
      update: {},
    })

    as(`world-corning-programme${D}`)
    const wrote = await json(
      await setRequirement(
        req('POST', '/api/documents/requirements', {
          workOrderId: cavanaughOrder,
          documentTypeKey: 'CRANE_SIGNALLER',
          owedBy: 'WORKER',
          note: 'Anybody within the bay while the crane is live.',
        })
      )
    )
    expect(wrote.status, JSON.stringify(wrote.body)).toBe(200)
    expect(wrote.body.data.says).toContain('Crane signaller card')

    const extras = await lineExtras({ sellContractId: cavanaughLine })
    expect(extras.requirements!.map((i) => i.key)).toContain('CRANE_SIGNALLER')

    const verdict = contractClearance({
      personName: 'Aisha Bello',
      personVerifications: [],
      supplierName: 'Wrenfield Technical',
      supplierCertificates: [],
      on: new Date(),
      ...extras,
    })
    expect(verdict.items.map((i) => i.key)).toContain('CRANE_SIGNALLER')
    // The client said it does not stop work, so it does not.
    expect(verdict.blocking.map((b) => b.key)).not.toContain('CRANE_SIGNALLER')

    // And the log says who decided it, in their own words.
    const logged = await prisma.automationLog.findFirst({
      where: { action: 'DOCUMENT_REQUIREMENT_SET', payload: { path: ['documentTypeKey'], equals: 'CRANE_SIGNALLER' } },
    })
    expect(logged, 'a change to the rulebook is on the record').toBeTruthy()
    expect(logged!.reason).toContain('crane is live')
  })

  it('a compliance officer waives one item with a reason and the start proceeds with the waiver on the record', async () => {
    as(`world-corning-compliance${D}`)
    const r = await json(
      await setRequirement(
        req('POST', '/api/documents/requirements', {
          sellContractId: cavanaughLine,
          documentTypeKey: 'CRANE_SIGNALLER',
          waivedReason: 'She works the annealing line and never enters the bay.',
        })
      )
    )
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.says).toContain('waived')

    const extras = await lineExtras({ sellContractId: cavanaughLine })
    const item = extras.requirements!.find((i) => i.key === 'CRANE_SIGNALLER')!
    expect(item.waived).toBe(true)
    expect(item.waivedSays).toContain('annealing line')
    expect(item.waivedSays).toMatch(/Miriam Osei|Waived/)

    const verdict = contractClearance({
      personName: 'Aisha Bello',
      personVerifications: [{ type: 'I9_EVERIFY', status: 'CLEAR' }] as never,
      supplierName: 'Wrenfield Technical',
      supplierCertificates: [],
      on: new Date(),
      ...extras,
    })
    expect(verdict.blocking.map((b) => b.key)).not.toContain('CRANE_SIGNALLER')
    expect(verdict.chasing.map((c) => c.key)).not.toContain('CRANE_SIGNALLER')
    expect(verdict.waived.map((w) => w.key)).toContain('CRANE_SIGNALLER')
    expect(verdict.says).toContain('annealing line')
  })

  it('work authorization cannot be waived, whoever asks and however urgent', async () => {
    as(`world-corning-programme${D}`)
    const r = await json(
      await setRequirement(
        req('POST', '/api/documents/requirements', {
          sellContractId: cavanaughLine,
          documentTypeKey: 'I9_EVERIFY',
          waivedReason: 'She starts Monday and we have seen her passport.',
        })
      )
    )
    expect(r.status).toBe(422)
    expect(r.body.error.message).toContain('cannot be waived')
    expect(r.body.error.message).toContain('Get it on file, then activate.')

    const written = await prisma.documentRequirement.findFirst({
      where: { sellContractId: cavanaughLine, documentTypeKey: 'I9_EVERIFY' },
    })
    expect(written, 'a waiver nobody may honor is refused rather than written').toBeNull()
  })

  it('only the client of the order, or a desk seated there, may change its set', async () => {
    // The supplier working under the order reads it — it has to, or it
    // cannot comply — and cannot change it.
    const wrenfieldSeat = await prisma.context.findFirstOrThrow({
      where: { company: { slug: 'world-wrenfield' }, revokedAt: null },
      select: { person: { select: { primaryEmail: true } } },
    })
    as(wrenfieldSeat.person.primaryEmail!)

    const read = await json(
      await readRequirements(req('GET', `/api/documents/requirements?sellContractId=${cavanaughLine}`))
    )
    expect(read.status, 'a supplier may read what its customer requires of it').toBe(200)

    const wrote = await json(
      await setRequirement(
        req('POST', '/api/documents/requirements', {
          sellContractId: cavanaughLine,
          documentTypeKey: 'BACKGROUND_CHECK',
          required: false,
        })
      )
    )
    expect(wrote.status).toBe(403)
    expect(wrote.body.error.message).toContain('Cavanaugh Glassworks')
    expect(wrote.body.error.message).toContain('cannot change what that order requires')

    // And a desk at the client that is not the program manager or the
    // compliance officer is refused in words rather than by a code.
    as(`world-corning-ap${D}`)
    const clerk = await json(
      await setRequirement(
        req('POST', '/api/documents/requirements', {
          workOrderId: cavanaughOrder,
          documentTypeKey: 'DRUG_SCREENING',
        })
      )
    )
    expect(clerk.status).toBe(403)
    expect(clerk.body.error.message).toContain('program manager')
  })

  it('a worker sees their license and its expiry on their own page before any chase fires', async () => {
    const nurse = await prisma.person.findFirstOrThrow({
      where: { name: 'Colleen Byrne' },
      select: { id: true, primaryEmail: true },
    })
    const agency = await prisma.context.findFirstOrThrow({
      where: { personId: nurse.id, revokedAt: null },
      select: { personId: true },
    })
    // In date, and further out than any chase window — so nothing has
    // asked her for anything and the page must still show it.
    await prisma.verification.create({
      data: {
        personId: nurse.id,
        type: 'PROFESSIONAL_LICENSE',
        status: 'CLEAR',
        provider: 'Wisconsin Board of Nursing',
        issuedAt: new Date(Date.now() - 200 * 86_400_000),
        validFrom: new Date(Date.now() - 200 * 86_400_000),
        expiresAt: new Date(Date.now() + 150 * 86_400_000),
        uploadedById: agency.personId,
        verifiedById: agency.personId,
        verifiedAt: new Date(),
        result: { outcome: 'CLEAR', license: 'RN 154-882', state: 'WI' },
      },
    })

    as(nurse.primaryEmail!)
    const r = await json(await myPapersRoute(req('GET', '/api/me/papers')))
    expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBe(200)

    const row = (r.body.data.papers ?? []).find(
      (p: { kind: string; name: string }) => p.kind === 'HELD' && /license/i.test(p.name)
    )
    expect(row, 'her own license is on her own page').toBeTruthy()
    expect(row.runsOutOn).toBeTruthy()
    expect(row.word).toMatch(/On file until/)
    // Nobody is waiting on her, so she is offered nothing to press.
    expect(row.todo).toBeNull()
  })

  it('a signed paper running out is returned with the party that owes it, and no letter is written here', async () => {
    const line = await prisma.sellContract.findUniqueOrThrow({
      where: { id: cavanaughLine },
      select: { id: true, companyId: true, personId: true },
    })
    const template = await prisma.docTemplate.create({
      data: {
        companyId: line.companyId,
        name: 'Mutual non-disclosure agreement',
        audience: 'CLIENT',
        needsSignature: true,
      },
    })
    await prisma.docInstance.create({
      data: {
        templateId: template.id,
        sellContractId: line.id,
        subjectType: 'PERSON',
        subjectId: line.personId!,
        status: 'SIGNED',
        signedAt: new Date(Date.now() - 300 * 86_400_000),
        countersignedAt: new Date(Date.now() - 300 * 86_400_000),
        validFrom: new Date(Date.now() - 300 * 86_400_000),
        expiresAt: new Date(Date.now() + 12 * 86_400_000),
      },
    })

    const before = new Date()
    const watch = await lookAtDocInstances(new Date())
    const found = watch.lapsing.find((l) => l.line?.id === line.id)
    expect(found, 'an agreement twelve days from running out is seen').toBeTruthy()
    expect(found!.daysLeft).toBeLessThanOrEqual(12)
    expect(found!.says).toMatch(/runs out in \d+ days/)
    // Who is chased is read off the line's own set, not guessed here.
    expect(found!.owedBy).toBeTruthy()
    // And nothing was sent: the letters are conversation's. This
    // function returns facts; the day it starts writing to people is the
    // day two domains are deciding who hears what.
    const letters = await prisma.notification.count({ where: { createdAt: { gte: before } } })
    expect(letters, 'the watch tells nobody — it answers').toBe(0)
  })

  it('a background check that ages out on somebody still on site is chased rather than quietly going green', async () => {
    const live = await prisma.sellContract.findFirstOrThrow({
      where: { state: 'IN_PROGRESS' },
      select: { personId: true, companyId: true },
    })
    const staff = await prisma.context.findFirstOrThrow({
      where: { companyId: live.companyId, revokedAt: null },
      select: { personId: true },
    })
    await prisma.verification.create({
      data: {
        personId: live.personId!,
        type: 'BACKGROUND_CHECK',
        status: 'CLEAR',
        provider: 'Sterling',
        issuedAt: new Date(Date.now() - 360 * 86_400_000),
        validFrom: new Date(Date.now() - 360 * 86_400_000),
        expiresAt: new Date(Date.now() + 5 * 86_400_000),
        uploadedById: staff.personId,
        verifiedById: staff.personId,
        verifiedAt: new Date(Date.now() - 360 * 86_400_000),
        result: { outcome: 'CLEAR' },
      },
    })

    const watch = await checksToRedo(new Date())
    const found = watch.lapsing.find((l) => l.personId === live.personId && l.key === 'BACKGROUND_CHECK')
    expect(found, 'a twelve-month screening reaching its date is work, not silence').toBeTruthy()
    // It is a chase and it has never been a block. Nobody stops working
    // over a screening that needs redoing.
    expect(found!.stopsWork).toBe(false)
  })
})
