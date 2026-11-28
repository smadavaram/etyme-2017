import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as decisionsRoute } from '@/app/api/decisions/route'
import { SAMPLE_PERSON_EMAIL } from '@/lib/sample-seat'

/**
 * The second production walk, 2026-10-26: "Accept … — Colleen Byrne" sat
 * on Byrne Critical Care LLC's queue. Colleen is Byrne Critical Care; the
 * approve route stands the client's signature in for her firm's
 * acceptance, so the queue must not ask anybody at her firm for it.
 *
 * The seat reading the queue here is the shared sample person, seated at
 * Byrne for the test: a seat the acceptance rule never counts as somebody
 * who may accept, so the firm still accepts only for Colleen — the shape
 * the walk found, where the row was offered to a seat that is not her.
 */

const BOOKKEEPER = 'byrne-bookkeeper@own-firm-week.invalid'

const s: Record<string, any> = {}
const queueAt = async (email: string, contextId: string) => {
  as(email)
  const r = await json((await decisionsRoute(req('GET', '/api/decisions', undefined, { 'x-context-id': contextId })))!)
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data.decisions as any[]
}

describe('a one-person firm is never asked to accept its own week on the queue', () => {
  beforeAll(async () => {
    await freshWorld()
    const colleen = await prisma.person.findFirstOrThrow({ where: { name: 'Colleen Byrne' }, select: { id: true } })
    const byrne = await prisma.company.findFirstOrThrow({ where: { name: 'Byrne Critical Care LLC' }, select: { id: true } })
    const owner = await prisma.role.findFirstOrThrow({ where: { companyId: byrne.id, name: 'Owner' }, select: { id: true } })
    const line = await prisma.sellContract.findFirstOrThrow({ where: { companyId: byrne.id, personId: colleen.id } })
    // Byrne sells Colleen to the firm above directly, so the week goes from
    // that firm's signature straight to her own firm's turn.
    const direct = await prisma.sellContract.create({
      data: {
        companyId: line.companyId, clientCompanyId: line.clientCompanyId, endClientCompanyId: null,
        personId: colleen.id, requirementId: line.requirementId, engagementId: line.engagementId, msaId: line.msaId,
        billRate: line.billRate, billCurrency: line.billCurrency, paymentTerms: line.paymentTerms,
        state: 'IN_PROGRESS', startDate: line.startDate, endDate: line.endDate,
      },
    })
    const like = await prisma.timesheet.findFirstOrThrow({ where: { sellContractId: line.id }, orderBy: { periodStart: 'desc' } })
    const week = await prisma.timesheet.create({
      data: {
        sellContractId: direct.id, personId: colleen.id, periodStart: like.periodStart, periodEnd: like.periodEnd,
        days: like.days ?? {}, totalHours: like.totalHours, status: 'SUBMITTED', submittedAt: like.periodEnd,
        clientApprovedAt: new Date(),
      },
    })
    await prisma.workAssertion.create({
      data: { timesheetId: week.id, companyId: line.clientCompanyId, role: 'CLIENT_APPROVAL', hours: like.totalHours ?? 40, rateCents: 10_000, state: 'LIVE' },
    })
    const sample = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: SAMPLE_PERSON_EMAIL }, select: { id: true } })
    const seat = await prisma.context.create({ data: { personId: sample.id, companyId: byrne.id, type: 'EMPLOYEE', roleId: owner.id } as any })
    Object.assign(s, { byrne, owner, week, seat })
  }, 240_000)

  it('a one-person firm’s own week is never on its queue to accept', async () => {
    const rows = await queueAt(SAMPLE_PERSON_EMAIL, s.seat.id)
    expect(rows.filter((r) => r.entityId === s.week.id)).toEqual([])
  })

  it('once the firm seats somebody else who may accept hours, the worker’s week is on that person’s queue to accept', async () => {
    // The control: the same week, the same firm, a second person who may
    // accept. The row is there, so the sentence above is the rule and not
    // a week the queue could never have shown.
    const keeper = await prisma.person.create({ data: { name: 'Bo Keeper', primaryEmail: BOOKKEEPER } as any })
    const seat = await prisma.context.create({ data: { personId: keeper.id, companyId: s.byrne.id, type: 'EMPLOYEE', roleId: s.owner.id } as any })
    const rows = await queueAt(BOOKKEEPER, seat.id)
    expect(rows.filter((r) => r.entityId === s.week.id).map((r) => r.type)).toEqual(['TIMESHEET_APPROVAL'])
  })
})
