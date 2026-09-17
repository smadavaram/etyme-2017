import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'

import { POST as activate } from '@/app/api/contracts/[id]/activate/route'
import { GET as placement } from '@/app/api/placements/[id]/route'
import { GET as program } from '@/app/api/program/route'

/**
 * A licensed role with nobody's license on file.
 *
 * The block that shipped on 2026-09-17 reads a `Verification` row: a
 * nurse whose Wisconsin registration has lapsed cannot start. Where
 * there is no row at all there is nothing to be lapsed, and an ICU nurse
 * with no license anywhere in the file activated exactly as a developer
 * does — which is the worse of the two cases, because a lapsed license
 * at least means somebody once checked.
 *
 * The other half was already built and nothing passed it the role:
 * `startPacketFor` picks the licensed start packet off the title, and
 * the license is a required, blocking item on it. Three routes select
 * the person's documents and run the checklist; none of them said what
 * the work was. Two of those files belong to other domains and are
 * changed here on the precedent of c126c1c4 and f901e914, where the same
 * shape of omission — a column nobody selected — was swept the same way.
 */
describe('starting somebody in a role the law says needs a license', () => {
  let halcyonSeat: string
  let seatPersonId: string
  let nurseContractId: string
  let nursePersonId: string
  let developerContractId: string

  const post = async (id: string, body: Record<string, unknown>) =>
    json(await activate(req('POST', `/api/contracts/${id}/activate`, body), { params: Promise.resolve({ id }) }))

  /** A draft contract at the nurse's own agency, for a brand-new person. */
  async function draftFor(name: string, email: string, role: string) {
    const template = await prisma.sellContract.findFirstOrThrow({
      where: { person: { primaryEmail: 'colleen.byrne@seed.etyme.invalid' } },
      include: { requirement: { select: { id: true } } },
    })
    // Found before it is made, the same rule the seeds follow: a suite
    // run twice against one database must tell the same story twice.
    const person = await prisma.person.upsert({
      where: { primaryEmail: email },
      update: {},
      create: { name, primaryEmail: email },
    })
    const existing = await prisma.sellContract.findFirst({ where: { personId: person.id } })
    if (existing) return { contractId: existing.id, personId: person.id }
    const requirement = await prisma.requirement.create({
      data: {
        companyId: template.clientCompanyId,
        raisedById: seatPersonId,
        title: role,
        skills: [],
        status: 'OPEN',
      },
    })
    const contract = await prisma.sellContract.create({
      data: {
        companyId: template.companyId,
        clientCompanyId: template.clientCompanyId,
        endClientCompanyId: template.endClientCompanyId,
        personId: person.id,
        requirementId: requirement.id,
        engagementId: template.engagementId,
        msaId: template.msaId,
        billRate: template.billRate,
        billCurrency: template.billCurrency,
        paymentTerms: template.paymentTerms,
        state: 'DRAFT',
        startDate: new Date(),
        endDate: new Date(Date.now() + 90 * 86_400_000),
      },
    })
    // Work authorization on file, so the only thing that can refuse the
    // start is the license. Without this the I-9 block answers first and
    // the sentence under test never runs.
    await prisma.verification.create({
      data: {
        personId: person.id,
        type: 'I9_EVERIFY',
        status: 'CLEAR',
        provider: 'E-Verify',
        issuedAt: new Date(),
        uploadedById: seatPersonId,
        verifiedById: seatPersonId,
        verifiedAt: new Date(),
      },
    })
    return { contractId: contract.id, personId: person.id }
  }

  beforeAll(async () => {
    await seedWorld()

    const agency = await prisma.sellContract.findFirstOrThrow({
      where: { person: { primaryEmail: 'colleen.byrne@seed.etyme.invalid' } },
      select: { companyId: true },
    })
    const owner = await prisma.context.findFirstOrThrow({
      where: { companyId: agency.companyId, revokedAt: null, role: { permissions: { has: '*' } } },
      select: { person: { select: { id: true, primaryEmail: true } } },
    })
    halcyonSeat = owner.person.primaryEmail
    seatPersonId = owner.person.id

    const nurse = await draftFor('Maren Ostrowski', 'maren.ostrowski@seed.etyme.invalid', 'ICU travel nurse — nights')
    nurseContractId = nurse.contractId
    nursePersonId = nurse.personId

    const developer = await draftFor(
      'Tobias Renner',
      'tobias.renner@seed.etyme.invalid',
      'SAP S/4HANA finance consultant'
    )
    developerContractId = developer.contractId
  }, 600_000)

  it('a licensed role with no license on file cannot be started, and the refusal says which license it needs', async () => {
    as(halcyonSeat)
    const r = await post(nurseContractId, { action: 'activate' })
    expect(r.status, JSON.stringify(r.body)).toBe(403)
    expect(r.body.error.code).toBe('DOCUMENTS_BLOCK')
    expect(r.body.error.message).toMatch(/cannot start without/)
    expect(r.body.error.message.toLowerCase()).toContain('state license')
    expect(r.body.error.blocking.map((b: { key: string }) => b.key)).toContain('PROFESSIONAL_LICENSE')
    expect(r.body.error.fix.toLowerCase()).toContain('state license')

    const still = await prisma.sellContract.findUniqueOrThrow({ where: { id: nurseContractId } })
    expect(still.state).toBe('DRAFT')
  })

  it('the client sees the same refusal a week before the start date, rather than a pass here and a refusal on the day', async () => {
    // The starting-soon preview runs the same checklist activation runs.
    // Until the role reached it, the preview called a nurse with no
    // license ready to start and the button refused her — and a preview
    // that disagrees with the decision it previews is worse than none.
    as('world-harlow-health@demo.etyme.local')
    const r = await json(await program(req('GET', '/api/program')))
    expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBe(200)
    const row = (r.body.data?.startingSoon ?? []).find((s: any) => s.person.name === 'Maren Ostrowski')
    expect(row, JSON.stringify((r.body.data?.startingSoon ?? []).map((s: any) => s.person.name))).toBeTruthy()
    expect(row.paperwork.outcome).toBe('BLOCK')
    expect(row.paperwork.says.toLowerCase()).toContain('state license')
  }, 30_000)

  it('a role no regulator licenses is not asked for one, so nobody is handed a requirement that does not exist', async () => {
    as(halcyonSeat)
    const r = await post(developerContractId, { action: 'activate' })
    const blocking = (r.body?.error?.blocking ?? []).map((b: { key: string }) => b.key)
    const chasing = (r.body?.error?.chasing ?? []).map((c: { key: string }) => c.key)
    expect(blocking).not.toContain('PROFESSIONAL_LICENSE')
    expect(chasing).not.toContain('PROFESSIONAL_LICENSE')
  })

  it('the same nurse starts once the license is on file, and the reason recorded is not about a license', async () => {
    await prisma.verification.create({
      data: {
        personId: nursePersonId,
        type: 'PROFESSIONAL_LICENSE',
        status: 'CLEAR',
        provider: 'Wisconsin Board of Nursing',
        issuedAt: new Date(Date.now() - 200 * 86_400_000),
        validFrom: new Date(Date.now() - 200 * 86_400_000),
        expiresAt: new Date(Date.now() + 400 * 86_400_000),
        uploadedById: seatPersonId,
        verifiedById: seatPersonId,
        verifiedAt: new Date(),
        result: { outcome: 'CLEAR', license: 'RN 900-114', state: 'WI' },
      },
    })
    as(halcyonSeat)
    const r = await post(nurseContractId, { action: 'activate' })
    // Whatever else is outstanding — a background check is chased, never
    // blocked — the license is no longer what stops her.
    expect(r.status, JSON.stringify(r.body)).not.toBe(403)
    const blocking = (r.body?.error?.blocking ?? []).map((b: { key: string }) => b.key)
    expect(blocking).not.toContain('PROFESSIONAL_LICENSE')
  })

  it('the placement thread shows the licensed checklist before anybody presses activate', async () => {
    as(halcyonSeat)
    const r = await json(
      await placement(req('GET', `/api/placements/${nurseContractId}`), {
        params: Promise.resolve({ id: nurseContractId }),
      })
    )
    expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBe(200)
    const keys = (r.body.data?.checklist?.items ?? []).map((i: { key: string }) => i.key)
    expect(keys, 'the thread runs the packet the role asks for').toContain('PROFESSIONAL_LICENSE')
  })
})
