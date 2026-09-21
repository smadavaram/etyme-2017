import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'

import { POST as activate } from '@/app/api/contracts/[id]/activate/route'

/**
 * A contract cannot go live on missing paperwork.
 *
 * Activation used to check governance — the client's policy — and
 * nothing about the supplier's own house. A person with no I-9 on file
 * could be activated, and the first anybody heard of it was an audit.
 *
 * The gate runs before governance, because paperwork is ours and policy
 * is theirs, and it follows the same contract: BLOCK where legally
 * grounded, WARN with a reason recorded everywhere else. Never silently.
 */
describe('activating a contract on paperwork', () => {
  let seat: string
  let seatPersonId: string
  let contractId: string
  let personId: string

  const post = async (body: Record<string, unknown>) =>
    json(await activate(req('POST', `/api/contracts/${contractId}/activate`, body), { params: Promise.resolve({ id: contractId }) }))

  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()

    seat = 'world-cloudepa@demo.etyme.local'
    seatPersonId = (await prisma.person.findFirstOrThrow({ where: { primaryEmail: seat } })).id

    // A brand-new person with nothing on file, on a fresh draft contract
    // shaped like CloudEPA's seeded one — same MSA, engagement and
    // requirement, so nothing but the paperwork is missing.
    const co = await prisma.company.findFirstOrThrow({ where: { slug: 'world-cloudepa' } })
    const template = await prisma.sellContract.findFirstOrThrow({ where: { companyId: co.id } })
    const person = await prisma.person.create({
      data: { name: 'Nobody Onfile', primaryEmail: 'nobody.onfile@seed.etyme.invalid' },
    })
    personId = person.id
    const draft = await prisma.sellContract.create({
      data: {
        companyId: template.companyId,
        clientCompanyId: template.clientCompanyId,
        endClientCompanyId: template.endClientCompanyId,
        personId: person.id,
        requirementId: template.requirementId,
        engagementId: template.engagementId,
        msaId: template.msaId,
        billRate: template.billRate,
        billCurrency: template.billCurrency,
        paymentTerms: template.paymentTerms,
        state: 'DRAFT',
        startDate: new Date(),
        endDate: new Date(Date.now() + 180 * 86_400_000),
      },
    })
    contractId = draft.id
  }, 180_000)

  it('with no I-9 on file, activation is refused — nobody may start without authorization', async () => {
    as(seat)
    const r = await post({ action: 'activate' })
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('DOCUMENTS_BLOCK')
    expect(r.body.error.message).toMatch(/cannot start without/)
    expect(r.body.error.blocking.map((b: { key: string }) => b.key)).toContain('I9_EVERIFY')
    const still = await prisma.sellContract.findUniqueOrThrow({ where: { id: contractId } })
    expect(still.state).toBe('DRAFT')
  })

  it('with an I-9 but no background check, it warns and asks for a reason', async () => {
    await prisma.verification.create({
      data: {
        personId,
        type: 'I9_EVERIFY',
        status: 'CLEAR',
        provider: 'E-Verify',
        issuedAt: new Date(),
        uploadedById: seatPersonId,
        verifiedById: seatPersonId,
        verifiedAt: new Date(),
      },
    })
    as(seat)
    const r = await post({ action: 'activate' })
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('DOCUMENTS_WARN')
    expect(r.body.error.overridable).toBe(true)
    expect(r.body.error.chasing.map((c: { key: string }) => c.key)).toContain('BACKGROUND_CHECK')
    const still = await prisma.sellContract.findUniqueOrThrow({ where: { id: contractId } })
    expect(still.state).toBe('DRAFT')
  })

  it('with a reason recorded, it proceeds — and the reason travels with the record', async () => {
    as(seat)
    const r = await post({ action: 'activate', overrideReason: 'Client waived the background check in writing.' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const live = await prisma.sellContract.findUniqueOrThrow({ where: { id: contractId } })
    expect(live.state).toBe('IN_PROGRESS')

    // This contract's own log line, found by its payload rather than "the
    // latest", so a parallel activation elsewhere cannot make this pass.
    const log = await prisma.automationLog.findFirst({
      where: { action: 'CONTRACT_ACTIVATED', payload: { path: ['contractId'], equals: contractId } },
    })
    expect(log).not.toBeNull()
    expect((log!.payload as { documentsOverride?: string }).documentsOverride).toMatch(/waived/)
  })

  it('a supplier whose insurance has lapsed cannot activate, however complete the person is', async () => {
    // A second draft, for a person who is fully on file, under a
    // supplier whose general liability certificate ran out last week.
    const co = await prisma.company.findFirstOrThrow({ where: { slug: 'world-cloudepa' } })
    const template = await prisma.sellContract.findFirstOrThrow({ where: { companyId: co.id, state: 'IN_PROGRESS' } })
    const person = await prisma.person.create({
      data: { name: 'Fully Onfile', primaryEmail: 'fully.onfile@seed.etyme.invalid' },
    })
    for (const type of ['I9_EVERIFY', 'BACKGROUND_CHECK'] as const) {
      await prisma.verification.create({
        data: {
          personId: person.id, type, status: 'CLEAR', provider: 'Sterling',
          issuedAt: new Date(), expiresAt: type === 'BACKGROUND_CHECK' ? new Date(Date.now() + 300 * 86_400_000) : null,
          uploadedById: seatPersonId, verifiedById: seatPersonId, verifiedAt: new Date(),
        },
      })
    }
    // Lapse the supplier's GL.
    await prisma.verification.updateMany({
      where: { companyId: co.id, type: 'INSURANCE_GL' },
      data: { expiresAt: new Date(Date.now() - 7 * 86_400_000) },
    })
    const draft = await prisma.sellContract.create({
      data: {
        companyId: template.companyId, clientCompanyId: template.clientCompanyId,
        endClientCompanyId: template.endClientCompanyId, personId: person.id,
        requirementId: template.requirementId, engagementId: template.engagementId, msaId: template.msaId,
        billRate: template.billRate, billCurrency: template.billCurrency, paymentTerms: template.paymentTerms,
        state: 'DRAFT', startDate: new Date(), endDate: new Date(Date.now() + 180 * 86_400_000),
      },
    })
    as(seat)
    const r = await json(
      await activate(req('POST', `/api/contracts/${draft.id}/activate`, { action: 'activate', overrideReason: 'trying anyway' }),
        { params: Promise.resolve({ id: draft.id }) })
    )
    // A reason does not unlock a BLOCK. That is the difference between the two.
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('DOCUMENTS_BLOCK')
    expect(r.body.error.cover).toBe('BLOCK')
  })

  it('a start refuses on an item the client\'s order asked for, and says whose order asked', async () => {
    // The gate ran off one fixed list — the shipped packet, the person's
    // file, the supplier's insurance — and read nothing the line itself
    // required. So a client could write a site induction, a drug screen
    // or a security clearance onto its own order, in its own words, and
    // nothing at activation would ever look. A requirement a client typed
    // and nobody enforces is worse than one it was never offered.
    //
    // Cavanaugh Glassworks buys Wrenfield Technical's contractor on a
    // purchase order with no agreement behind it, which is the line in
    // the seeded world that carries an order at all.
    const cavanaugh = await prisma.company.findFirstOrThrow({ where: { slug: 'world-corning' } })
    const wrenfield = await prisma.company.findFirstOrThrow({ where: { slug: 'world-wrenfield' } })
    // The line first, then the order it sits on — the order the LINE
    // carries is the one the clearance will read, and a firm can be on
    // more than one.
    const onOrder = await prisma.sellContract.findFirstOrThrow({
      where: { companyId: wrenfield.id, workOrderId: { not: null } },
    })
    const order = await prisma.workOrder.findUniqueOrThrow({
      where: { id: onOrder.workOrderId! },
      select: { id: true, number: true, issuedBy: { select: { name: true } } },
    })
    expect(order.issuedBy.name).toBe('Cavanaugh Glassworks')

    // The client's own word for it, in the client's own dictionary.
    await prisma.documentType.upsert({
      where: { companyId_key: { companyId: cavanaugh.id, key: 'SITE_SAFETY_INDUCTION' } },
      create: {
        companyId: cavanaugh.id,
        key: 'SITE_SAFETY_INDUCTION',
        label: 'Site safety induction',
        hint: 'The hour every contractor sits through before going on the floor.',
        purpose: 'COMPLIANCE',
        validityShape: 'END_ONLY',
        suppliedBy: 'CANDIDATE',
        blocks: true,
      },
      update: { blocks: true },
    })
    await prisma.documentRequirement.create({
      data: {
        workOrderId: order.id,
        documentTypeKey: 'SITE_SAFETY_INDUCTION',
        required: true,
        owedBy: 'WORKER',
        blocks: true,
        note: 'Nobody on the floor without it.',
      },
    })

    // Somebody whose federal paperwork is complete, so the induction is
    // the only thing missing and the refusal can only be about it.
    const wrenfieldSeat = await prisma.person.findFirstOrThrow({
      where: { primaryEmail: 'world-wrenfield@demo.etyme.local' },
    })
    const person = await prisma.person.create({
      data: { name: 'Marguerite Ashby', primaryEmail: 'marguerite.ashby@seed.etyme.invalid' },
    })
    for (const type of ['I9_EVERIFY', 'BACKGROUND_CHECK'] as const) {
      await prisma.verification.create({
        data: {
          personId: person.id, type, status: 'CLEAR', provider: 'Sterling',
          issuedAt: new Date(),
          expiresAt: type === 'BACKGROUND_CHECK' ? new Date(Date.now() + 300 * 86_400_000) : null,
          uploadedById: wrenfieldSeat.id, verifiedById: wrenfieldSeat.id, verifiedAt: new Date(),
        },
      })
    }

    const draft = await prisma.sellContract.create({
      data: {
        companyId: onOrder.companyId,
        clientCompanyId: onOrder.clientCompanyId,
        endClientCompanyId: onOrder.endClientCompanyId,
        personId: person.id,
        requirementId: onOrder.requirementId,
        engagementId: onOrder.engagementId,
        msaId: onOrder.msaId,
        workOrderId: order.id,
        billRate: onOrder.billRate,
        billCurrency: onOrder.billCurrency,
        paymentTerms: onOrder.paymentTerms,
        state: 'DRAFT',
        startDate: new Date(),
        endDate: new Date(Date.now() + 180 * 86_400_000),
      },
    })

    as('world-wrenfield@demo.etyme.local')
    const r = await json(
      await activate(
        req('POST', `/api/contracts/${draft.id}/activate`, { action: 'activate' }),
        { params: Promise.resolve({ id: draft.id }) }
      )
    )

    expect(r.status, JSON.stringify(r.body)).toBe(403)
    expect(r.body.error.code).toBe('DOCUMENTS_BLOCK')

    const blocked = r.body.error.blocking.find((b: { key: string }) => b.key === 'SITE_SAFETY_INDUCTION')
    expect(blocked, `blocked on ${r.body.error.blocking.map((b: any) => b.key).join(', ')}`).toBeTruthy()

    // Whose order asked — by the buyer's name and the order's number, so
    // the supplier reading the refusal knows who to go back to.
    expect(blocked.asked).toContain('Cavanaugh Glassworks')
    expect(blocked.asked).toContain(order.number)
    expect(blocked.label).toBe('Site safety induction')

    const still = await prisma.sellContract.findUniqueOrThrow({ where: { id: draft.id } })
    expect(still.state).toBe('DRAFT')
  })
})
