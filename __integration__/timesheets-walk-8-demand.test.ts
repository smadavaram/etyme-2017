import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { POST as approve } from '@/app/api/timesheets/[id]/approve/route'
import { GET as list } from '@/app/api/timesheets/route'
import { GET as readJob, PATCH as editJob } from '@/app/api/requisitions/[id]/route'
import { rateCell, valueCell } from '@/app/dashboard/timesheets/cells'
import { acceptFewerBody } from '@/app/api/timesheets/accept-fewer'
import { corvaneSeatEmail } from '@/lib/seed-corvane'

/**
 * Walk 8 on the seeded world: Helena Marsh's week, filed on Techpeple's
 * line to Computer Systems and worked at Northbend, accepted for fewer
 * hours by Computer Systems; and a Corvane week in dong. Rows are found by
 * their facts, never by a calendar day.
 */

const D = '@demo.etyme.local'
const NIKE = `world-nike-hiring${D}`
const CS = `world-computer-systems${D}`
const TECHPEPLE = `world-techpeple${D}`
const PROGRAM = `world-nike-programme${D}`

const sign = async (id: string, body: unknown = {}) =>
  json(await approve(req('POST', `/api/timesheets/${id}/approve`, body), { params: Promise.resolve({ id }) }))
const row = async (id: string) => {
  const r = await json(await list(req('GET', `/api/timesheets?id=${id}`)))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data.timesheets.find((t: any) => t.id === id)
}

const s: Record<string, any> = {}

describe('walk 8 on the seeded world: a week accepted for fewer hours, and a week in dong', () => {
  beforeAll(async () => {
    await freshWorld()
    const helena = await prisma.person.findFirstOrThrow({ where: { name: 'Helena Marsh' } })
    const cs = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-computer-systems' } })
    const week = await prisma.timesheet.findFirstOrThrow({
      where: { personId: helena.id, status: 'SUBMITTED', clientApprovedAt: null, sellContract: { clientCompanyId: cs.id } },
      orderBy: { periodStart: 'desc' },
      include: { sellContract: true },
    })
    Object.assign(s, { week: week.id, filed: Number(week.totalHours), rate: week.sellContract.billRate, currency: week.sellContract.billCurrency })
    as(NIKE)
    const signed = await sign(week.id, Number(week.totalHours) > 40 ? { note: 'Agreed with the manager.' } : {})
    expect(signed.body?.error, JSON.stringify(signed.body)).toBeUndefined()
  }, 240_000)

  it('a firm accepts fewer hours than were filed from the Timesheets row with a reason', async () => {
    as(CS)
    const more = await sign(s.week, acceptFewerBody({ hours: String(s.filed + 1), reason: 'She says she stayed late.' }))
    expect(more.status).toBe(422)
    expect(more.body.error).toMatchObject({ code: 'MORE_THAN_FILED', field: 'acceptedHours' })
    const noReason = await sign(s.week, acceptFewerBody({ hours: String(s.filed - 2), reason: '' }))
    expect(noReason.status).toBe(422)
    expect(noReason.body.error).toMatchObject({ code: 'NEEDS_REASON', field: 'note' })
    const ok = await sign(s.week, acceptFewerBody({ hours: String(s.filed - 2), reason: 'Two hours were a Friday training session we do not pay for.' }))
    expect(ok.body?.error, JSON.stringify(ok.body)).toBeUndefined()
    s.reply = ok.body.data
    const mine = await prisma.workAssertion.findFirstOrThrow({ where: { timesheetId: s.week, role: 'PASS_THROUGH', state: 'LIVE' } })
    expect(Number(mine.hours)).toBe(s.filed - 2)
  })

  it('the acceptance reply prices the accepted hours', () => {
    expect(s.reply.message).toContain(`${s.filed - 2}`)
    // A straight week: the accepted hours at Techpeple's rate, in whole units.
    expect(s.reply.billAmount).toBe(((s.filed - 2) * s.rate) / 100)
  })

  it('the row reads the accepted hours and their value after a partial acceptance', async () => {
    as(CS)
    const mine = await row(s.week)
    expect(mine.accepted).toMatchObject({ hours: s.filed - 2, filed: s.filed })
    expect(mine.accepted.says).toMatch(/^You accepted .* Friday training session/)
    expect(mine.overtime.billableCents).toBe((s.filed - 2) * s.rate)
    // Techpeple bills Computer Systems on the hours Computer Systems accepted.
    as(TECHPEPLE)
    const theirs = await row(s.week)
    expect(theirs.accepted).toMatchObject({ hours: s.filed - 2 })
    expect(theirs.accepted.says).toMatch(/^Computer Systems/)
    expect(theirs.overtime.billableCents).toBe((s.filed - 2) * s.rate)
  })

  it('a Vietnam week on Timesheets reads in dong with no cents', async () => {
    const corvane = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-corvane' } })
    const vn = await prisma.timesheet.findFirst({
      where: { sellContract: { billCurrency: 'VND', OR: [{ clientCompanyId: corvane.id }, { endClientCompanyId: corvane.id }] } },
      select: { id: true },
    })
    expect(vn, 'the seed holds a Corvane week in dong').not.toBeNull()
    as(corvaneSeatEmail('operations', 'demo.etyme.local'))
    const r = await row(vn!.id)
    expect(r.rate.currency).toBe('VND')
    expect(rateCell(r.rate)).toMatch(/^₫[\d,]+$/)
    expect(valueCell(r.overtime.billableCents, r.rate.currency)).toMatch(/^₫[\d,]+$/)
  })

  it('saving the job’s Edit form writes only the fields changed', async () => {
    const northbend = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' } })
    const job = await prisma.requirement.findFirstOrThrow({ where: { companyId: northbend.id, archivedAt: null, status: { in: ['DRAFT', 'OPEN'] } } })
    await prisma.requirement.update({ where: { id: job.id }, data: { workMode: 'HYBRID', requiredQualification: 'BSN' } })
    const before = await prisma.requirement.findUniqueOrThrow({ where: { id: job.id } })
    as(PROGRAM)
    const r = await json(await editJob(req('PATCH', `/api/requisitions/${job.id}`, { action: 'edit', months: (before.months ?? 6) + 1 }), { params: Promise.resolve({ id: job.id }) }))
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300)
    const after = await prisma.requirement.findUniqueOrThrow({ where: { id: job.id } })
    expect(after.months).toBe((before.months ?? 6) + 1)
    expect(after.workMode).toBe('HYBRID')
    expect(after.location).toBe(before.location)
    expect(after.requiredQualification).toBe('BSN')
    s.job = job.id
  })

  it('the job page shows the qualification it asks for', async () => {
    as(PROGRAM)
    const r = await json(await readJob(req('GET', `/api/requisitions/${s.job}`), { params: Promise.resolve({ id: s.job }) }))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.requisition).toMatchObject({ requiredQualification: 'BSN', workMode: 'HYBRID' })
  })
})
