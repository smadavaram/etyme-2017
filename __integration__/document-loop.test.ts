import { describe, it, expect, beforeAll } from 'vitest'
import { resetDatabase, prisma, as, req, json } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { contractClearance, lineExtras } from '@/lib/contract-clearance'
import { lookAtDocInstances, checksToRedo, documentFindings } from '@/lib/document-request'
import { GET as compliance } from '@/app/api/compliance/route'
import { GET as myPapersRoute, POST as openMyAsk } from '@/app/api/me/papers/route'
import { POST as setRequirement, GET as readRequirements } from '@/app/api/documents/requirements/route'
import { POST as askForPapers } from '@/app/api/packets/route'
import { GET as packStanding, POST as sendPack } from '@/app/api/outbound-pack/route'

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
        subjectId: line.personId,
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

    // And the nightly watcher reads it in the shape it already reads six
    // others in, so wiring it is one line rather than a second pipeline.
    const findings = await documentFindings(new Date())
    const mine = findings.find((f) => f.subjectId === found!.id)
    expect(mine, 'the firm holding the line hears about it').toBeTruthy()
    expect(mine!.action).toBe('NOTIFY_ONLY')
    expect(mine!.companyId).toBe(line.companyId)
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

describe('who renders the verdict, walked on the seeded world', () => {
  // The founder, 2026-09-22: "Ultimately background check companies are
  // the ones that confirm background pass or fail — the risk is passed
  // there to background check companies; our job would be to collect
  // all info and pass it to them to verify."
  //
  // Before this, /api/me/papers put a background check on a worker's
  // outstanding list owed by her, and POST opened a DocInstance for it
  // through the same door as a passport scan. She does not have the
  // report. The provider posts it to whoever ordered it.

  async function aWorkerOnALine() {
    return prisma.sellContract.findFirstOrThrow({
      where: { state: { notIn: ['ENDED', 'CANCELLED'] } },
      select: { personId: true, person: { select: { primaryEmail: true, name: true } } },
    })
  }

  it('a worker cannot open a document request for a background check, and the refusal names the firm that orders it', async () => {
    const line = await aWorkerOnALine()
    as(line.person.primaryEmail!)
    const r = await json(
      await openMyAsk(req('POST', '/api/me/papers', { documentTypeKey: 'BACKGROUND_CHECK' }))
    )
    expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBe(409)
    expect(r.body.error.code).toBe('NOT_HERS_TO_SEND')
    expect(r.body.error.message).toMatch(/orders it from a screening company/)
    expect(r.body.error.message).toMatch(/your consent/)
    // And nothing was written. A refusal that leaves a request behind is
    // a document asked for that nobody asked for.
    const asks = await prisma.docInstance.count({
      where: { subjectType: 'PERSON', subjectId: line.personId, template: { name: { contains: 'ackground' } } },
    })
    expect(asks).toBe(0)
  })

  it('a worker can still open a document request for a document she actually holds', async () => {
    const line = await aWorkerOnALine()
    as(line.person.primaryEmail!)
    const r = await json(
      await openMyAsk(req('POST', '/api/me/papers', { documentTypeKey: 'RIGHT_TO_WORK' }))
    )
    expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBe(200)
    expect(r.body.data.uploadTo).toMatch(/\/api\/documents\/.+\/upload/)
  })

  it('a worker’s own page offers her nothing to press on a check a screening company runs', async () => {
    const line = await aWorkerOnALine()
    as(line.person.primaryEmail!)
    const r = await json(await myPapersRoute(req('GET', '/api/me/papers')))
    expect(r.status).toBe(200)
    const row = (r.body.data.papers ?? []).find(
      (p: { kind: string; documentTypeKey?: string }) =>
        p.kind === 'OUTSTANDING' && p.documentTypeKey === 'BACKGROUND_CHECK'
    )
    if (row) {
      expect(row.todo).toBeNull()
      expect(row.openAskAt).toBeNull()
      expect(row.why).toMatch(/consent/)
    }
  })
})

describe('the packet, the pack and the verdict ask one question of one door', () => {
  /**
   * The last place the loop still cracked.
   *
   * `lib/document-requirements` landed on 2026-09-21 and clearance was
   * rewired to read it the same day. The two screens whose whole job is
   * documents were not: `POST /api/packets` asked the shipped list in
   * `lib/packets` and nothing else, and `/api/outbound-pack` assembled
   * from the five packs in its own file — `packForLine` existed, was
   * tested, and no production caller had ever run it.
   *
   * So a client that asked for a certificate of good standing on its
   * own order had it refused at a start and chased by the nightly
   * watch, and the one screen that exists to ask for documents never
   * mentioned it. These are the sentences that close that.
   */

  /** The one Cavanaugh line in this world, and the person on it. */
  async function theLine() {
    const wrenfield = await firm('world-wrenfield')
    const order = await prisma.workOrder.findFirstOrThrow({
      where: { issuedToId: wrenfield.id },
      select: { id: true },
    })
    return prisma.sellContract.findFirstOrThrow({
      where: { workOrderId: order.id },
      select: {
        id: true,
        person: { select: { id: true, name: true, primaryEmail: true } },
        company: { select: { slug: true, name: true } },
      },
    })
  }

  async function seatAt(slug: string, needs: string[]) {
    const seats = await prisma.context.findMany({
      where: { company: { slug }, revokedAt: null },
      select: { person: { select: { primaryEmail: true, name: true } }, role: { select: { permissions: true } } },
    })
    // An owner holds the wildcard, which is how a small firm is seated:
    // one person, every desk. A seat with no role at all holds nothing.
    const held = seats.find((c) => {
      const p = (c.role?.permissions ?? []) as string[]
      return p.includes('*') || needs.some((n) => p.includes(n))
    })
    return held?.person.primaryEmail ?? null
  }

  it('a supplier is asked for the certificate of good standing its customer’s own order requires, in the packet that customer sends it', async () => {
    const wrenfield = await firm('world-wrenfield')
    const desk = await seatAt('world-corning', ['vendors.manage', 'consultants.write'])
    expect(desk, 'somebody at the client may ask a supplier for documents').toBeTruthy()
    as(desk!)

    const r = await json(
      await askForPapers(
        req('POST', '/api/packets', {
          packetKey: 'VENDOR_ONBOARDING_US',
          subjectCompanyId: wrenfield.id,
          recipientEmail: 'office@wrenfield.example',
        })
      )
    )
    expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBe(201)

    const asked = (r.body.data.asking ?? []) as { label: string; becauseOf: string | null }[]
    const standing = asked.find((a) => /good standing/i.test(a.label))
    expect(standing, 'the shipped supplier packet has never asked for one; the order does').toBeTruthy()
    // And it says whose order asked, in that order’s own words, because
    // "the system requires it" is the answer that makes somebody phone
    // you.
    expect(standing!.becauseOf).toMatch(/Cavanaugh Glassworks/)
    expect(standing!.becauseOf).toMatch(/order/)
  })

  it('a submission packet asks the application list and nothing the award collects, even about somebody already placed', async () => {
    const line = await theLine()
    const desk = await seatAt(line.company.slug, ['consultants.write', 'vendors.manage'])
    expect(desk, 'somebody at the supplier may ask its own contractor for papers').toBeTruthy()
    as(desk!)

    const r = await json(
      await askForPapers(
        req('POST', '/api/packets', {
          packetKey: 'SUBMISSION_STANDARD',
          subjectPersonId: line.person!.id,
          recipientEmail: line.person!.primaryEmail ?? 'somebody@example.invalid',
        })
      )
    )
    expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBe(201)

    const labels = ((r.body.data.asking ?? []) as { label: string }[]).map((a) => a.label.toLowerCase())
    // Questions at application, documents at award. A line exists only
    // because somebody was awarded the work, so nothing read off one
    // belongs on the list asked before there was an offer.
    expect(labels.join(' ')).not.toMatch(/i-9|hot floor|crane/)
    expect(labels.some((l) => /work authorization/.test(l)), 'the question is still asked').toBe(true)
  })

  it('the start packet asks for the document the client invented, and never again for the one it waived', async () => {
    const line = await theLine()
    const desk = await seatAt(line.company.slug, ['consultants.write', 'vendors.manage'])
    expect(desk, 'somebody at the supplier may ask its own contractor for papers').toBeTruthy()
    as(desk!)

    const r = await json(
      await askForPapers(
        req('POST', '/api/packets', {
          packetKey: 'CONTRACT_START_W2',
          subjectPersonId: line.person!.id,
          recipientEmail: line.person!.primaryEmail ?? 'somebody@example.invalid',
        })
      )
    )
    expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBe(201)

    const asked = (r.body.data.asking ?? []) as { label: string; becauseOf: string | null }[]
    const induction = asked.find((a) => /hot floor/i.test(a.label))
    expect(induction, 'the plant’s own induction reaches the person who has to do it').toBeTruthy()
    expect(induction!.becauseOf).toMatch(/Cavanaugh Glassworks/)

    // The crane signaller card was waived on this line, by name, with a
    // reason, earlier in this walk. A waiver is a decision somebody took
    // with their name on it, and asking again relitigates it.
    expect(asked.map((a) => a.label).join(' ')).not.toMatch(/crane/i)
    const log = await prisma.automationLog.findFirst({
      where: { action: 'PACKET_REQUESTED' },
      orderBy: { at: 'desc' },
    })
    expect(log!.reason).toMatch(/Crane signaller card .* waived on the line/)
  })

  it('the pack a supplier sends its customer carries what that customer’s order asks of the firm, and none of the worker’s own file', async () => {
    const cavanaugh = await firm('world-corning')
    const desk = await seatAt('world-wrenfield', ['settings.manage', 'vendors.manage'])
    expect(desk, 'somebody at the supplier may send its own documents out').toBeTruthy()
    as(desk!)

    const r = await json(
      await packStanding(req('GET', `/api/outbound-pack?clientCompanyId=${cavanaugh.id}`))
    )
    expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBe(200)
    expect(r.body.data.askedBy?.name).toBe('Cavanaugh Glassworks')

    const added = (r.body.data.addedByCustomer ?? []) as { key: string; label: string }[]
    expect(added.map((a) => a.key), 'the standing to trade this customer insists on').toContain('GOOD_STANDING')
    // A qualification pack is our papers going out. What the order asks
    // of the worker is her file, and sending it to a procurement team is
    // the document abuse the two-stage split exists to stop.
    expect(added.map((a) => a.key)).not.toContain('HOT_FLOOR_INDUCTION')
    expect(r.body.data.addedSays).toMatch(/Cavanaugh Glassworks asks for/)

    // And the shipped pack, answered to nobody in particular, is the
    // shipped pack.
    const plain = await json(await packStanding(req('GET', '/api/outbound-pack')))
    expect(plain.body.data.addedByCustomer).toEqual([])
    expect(plain.body.data.addedSays).toBeNull()
  })

  it('a certificate the customer’s order asks for, lapsed, stops the pack rather than being left out of it quietly', async () => {
    const cavanaugh = await firm('world-corning')
    const desk = await seatAt('world-wrenfield', ['settings.manage', 'vendors.manage'])
    expect(desk, 'somebody at the supplier may send its own documents out').toBeTruthy()
    as(desk!)

    const r = await json(
      await sendPack(
        req('POST', '/api/outbound-pack', {
          packKey: 'CLIENT_SCREENING_US',
          recipientEmail: 'procurement@cavanaugh.example',
          clientCompanyId: cavanaugh.id,
        })
      )
    )
    expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBe(422)
    expect(r.body.error.code).toBe('NOT_SENDABLE')
    const named = JSON.stringify(r.body.error)
    expect(named).toMatch(/good standing/i)
    // There is no force flag here and there should never be one.
    expect(r.body.error.fix).toMatch(/Nothing here can be overridden/)
  })
})
