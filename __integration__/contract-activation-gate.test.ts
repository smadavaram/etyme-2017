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

  it('with no I-9 on file, activation is refused — nobody may start without authorisation', async () => {
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
      where: { action: 'CONTRACT_ACTIVATE', payload: { path: ['contractId'], equals: contractId } },
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
})
