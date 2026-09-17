import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { POST as activate } from '@/app/api/contracts/[id]/activate/route'
import { GET as programDesk } from '@/app/api/program/route'

/**
 * The same certificate, read at the button and at the preview of it.
 *
 * `Verification` has carried `validFrom` since 2026-09-16 and two of the
 * demand side's queries went on selecting only `expiresAt`, so the floor
 * read as undefined and the clearance fell back to the day the policy was
 * printed. A certificate printed today for cover beginning in October
 * passed as held at activation — the moment somebody starts work — and
 * the client's "starting soon" preview said the same, wrongly, a week
 * earlier.
 *
 * Every branch of that arithmetic was already under test and every one
 * passed, because a column that is never selected is invisible to a unit
 * test. Only a run against the database catches it, which is why this
 * story is here.
 */

const DAY = 86_400_000
const at = (n: number) => new Date(Date.now() + n * DAY)

const ctx: Record<string, any> = {}

/** Replace a company's general liability cover with the given policies. */
async function coverIs(companyId: string, policies: { validFrom: Date; expiresAt: Date }[]) {
  await prisma.verification.deleteMany({ where: { companyId, type: 'INSURANCE_GL' } })
  for (const p of policies) {
    await prisma.verification.create({
      data: {
        companyId,
        type: 'INSURANCE_GL',
        status: 'CLEAR',
        // The broker printed it today. When the cover runs is its own fact.
        issuedAt: new Date(),
        validFrom: p.validFrom,
        expiresAt: p.expiresAt,
        verifiedAt: new Date(),
        uploadedById: ctx.uploaderId,
      },
    })
  }
}

async function previewRow() {
  as(ctx.clientEmail)
  const res = await json(await programDesk(req('GET', '/api/program')))
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  const row = res.body.data.startingSoon.find((s: any) => s.contractId === ctx.contractId)
  expect(row, 'the contract about to start is not on the client’s desk at all').toBeTruthy()
  return row
}

async function pressActivate(body: Record<string, unknown> = { action: 'activate' }) {
  as(ctx.supplierEmail)
  return json(
    await activate(req('POST', `/api/contracts/${ctx.contractId}/activate`, body), {
      params: Promise.resolve({ id: ctx.contractId }),
    })
  )
}

describe('cover that has not begun refuses a start, and the preview of it says the same', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()

    ctx.supplierEmail = 'world-cloudepa@demo.etyme.local'
    const supplierSeat = await prisma.person.findFirstOrThrow({
      where: { primaryEmail: ctx.supplierEmail },
    })
    ctx.uploaderId = supplierSeat.id

    const supplier = await prisma.company.findFirstOrThrow({ where: { slug: 'world-cloudepa' } })
    ctx.supplierId = supplier.id
    const template = await prisma.sellContract.findFirstOrThrow({
      where: { companyId: supplier.id, state: 'IN_PROGRESS' },
    })
    ctx.clientId = template.endClientCompanyId ?? template.clientCompanyId

    // Somebody at the client, to read the desk as.
    const clientSeat = await prisma.context.findFirstOrThrow({
      where: {
        companyId: ctx.clientId,
        revokedAt: null,
        person: { primaryEmail: { endsWith: '@demo.etyme.local' } },
      },
      select: { person: { select: { primaryEmail: true } } },
    })
    ctx.clientEmail = clientSeat.person.primaryEmail

    // A person whose own paperwork is complete, so the supplier's cover is
    // the only question either desk can be answering.
    const person = await prisma.person.create({
      data: { name: 'Nora Standing', primaryEmail: 'nora.standing@seed.etyme.invalid' },
    })
    for (const type of ['I9_EVERIFY', 'BACKGROUND_CHECK'] as const) {
      await prisma.verification.create({
        data: {
          personId: person.id,
          type,
          status: 'CLEAR',
          provider: 'Sterling',
          issuedAt: new Date(),
          validFrom: at(-30),
          expiresAt: type === 'BACKGROUND_CHECK' ? at(300) : null,
          uploadedById: ctx.uploaderId,
          verifiedById: ctx.uploaderId,
          verifiedAt: new Date(),
        },
      })
    }

    // The preview shows the five starting soonest, so this one is first.
    const soonest = await prisma.sellContract.findFirst({
      where: { state: { not: 'IN_PROGRESS' } },
      orderBy: { endDate: 'asc' },
      select: { endDate: true },
    })
    const endsBeforeAnyOther = new Date(
      Math.min(soonest?.endDate?.getTime() ?? Date.now() + 90 * DAY, Date.now() + 90 * DAY) - DAY
    )

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
        endDate: endsBeforeAnyOther,
      },
    })
    ctx.contractId = draft.id

    // One policy, printed today, covering from three weeks out.
    await coverIs(ctx.supplierId, [{ validFrom: at(21), expiresAt: at(386) }])
  }, 240_000)

  it('a supplier whose only insurance cover begins in three weeks cannot start anybody today', async () => {
    const r = await pressActivate()
    expect(r.status, JSON.stringify(r.body)).toBe(403)
    expect(r.body.error.code).toBe('DOCUMENTS_BLOCK')
    expect(r.body.error.cover).toBe('BLOCK')
    expect(r.body.error.message).toContain('does not start until')
    const still = await prisma.sellContract.findUniqueOrThrow({ where: { id: ctx.contractId } })
    expect(still.state).toBe('DRAFT')
  })

  it('and a reason does not unlock it, because cover that has not begun is the same exposure as cover that lapsed', async () => {
    const r = await pressActivate({ action: 'activate', overrideReason: 'they start Monday regardless' })
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('DOCUMENTS_BLOCK')
  })

  it('the refusal asks for the policy start to be brought forward, never for a policy that has not started to be renewed', async () => {
    const r = await pressActivate()
    expect(r.body.error.fix).toContain('nobody starts before the cover does')
    // A broker cannot reissue a policy that simply has not begun, so
    // "renew it" and "back in date" are instructions nobody can follow.
    expect(r.body.error.fix).not.toContain('back in date')
    expect(r.body.error.message).not.toContain('back in date')
  })

  it('the client’s starting-soon preview refuses in exactly the words activation uses', async () => {
    const row = await previewRow()
    const pressed = await pressActivate()
    expect(row.paperwork.outcome).toBe('BLOCK')
    // Word for word. A preview that disagrees with the decision it
    // previews is worse than no preview at all.
    expect(row.paperwork.says).toBe(pressed.body.error.message)
    // The remedy is the same remedy. The one word that differs is which
    // company the certificate should name as holder, because each desk
    // names the counterparty it is talking to: the supplier is told to
    // name the customer it bills, the end client is told to name itself.
    expect(row.paperwork.fix).toContain('nobody starts before the cover does')
    expect(pressed.body.error.fix).toContain('nobody starts before the cover does')
  })

  it('and the preview still refuses when it looks a week ahead to the day the person is due to start', async () => {
    await prisma.sellContract.update({
      where: { id: ctx.contractId },
      data: { startDate: at(7) },
    })
    const row = await previewRow()
    expect(row.daysUntil).toBeGreaterThan(0)
    expect(row.paperwork.outcome).toBe('BLOCK')
    expect(row.paperwork.says).toContain('does not start until')
  })

  it('a supplier that filed next year’s certificate early is not blocked by its own diligence', async () => {
    // This year's policy, running out in three weeks, and next year's
    // filed the day the broker issued it. The one covering today is the
    // one that counts — picking the longest-running would report a gap
    // that does not exist.
    await coverIs(ctx.supplierId, [
      { validFrom: at(-340), expiresAt: at(60) },
      { validFrom: at(60), expiresAt: at(425) },
    ])
    const row = await previewRow()
    expect(row.paperwork.outcome).not.toBe('BLOCK')
    expect(row.paperwork.says).not.toContain('does not start until')
  })

  it('and the start the preview cleared is the start that goes through', async () => {
    const r = await pressActivate()
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const live = await prisma.sellContract.findUniqueOrThrow({ where: { id: ctx.contractId } })
    expect(live.state).toBe('IN_PROGRESS')
  })
})
