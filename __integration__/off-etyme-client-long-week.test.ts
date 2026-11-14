import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { as, req, json, prisma, freshWorld } from './harness'
import { POST as listClient, PATCH as recordContact } from '@/app/api/clients/route'
import { GET as readApprovals, POST as sendOrAttach } from '@/app/api/week-approvals/route'
import { GET as readPayroll, PATCH as changePayroll } from '@/app/api/settings/payroll/route'
import { POST as addHolidays } from '@/app/api/settings/holidays/route'
import { GET as readSettings } from '@/app/api/settings/route'
import { POST as applyPack } from '@/app/api/companies/[id]/template-pack/route'

/**
 * The Tapin walk, 2026-11-14: every client of the founder's firm is a
 * client not on Etyme, and a week over forty hours could never be
 * approved there, because nobody at the client can sign in. Now the
 * client's attached approval carries its reason and how it approved the
 * hours over forty, both refused when missing, and a client on Etyme
 * still signs in Etyme as before.
 *
 * The world is made here: Brightmoor Staffing lists Lakeshore Mills (not
 * on Etyme), records Ruth Abara there, and places Paloma Ruiz on a
 * line with no hours written down, so forty is the line. Her week of
 * Oct 11 is 46 hours.
 */

const OWNER = 'world-brightmoor@demo.etyme.local'
const RUTH = 'ruth.abara@lakeshore-mills.example'
const it_: Record<string, string> = {}

async function attach(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return json(await sendOrAttach(new NextRequest('http://localhost:3000/api/week-approvals', { method: 'POST', body: fd })))
}
const approval = () => ({
  timesheetId: it_.week, how: 'EVIDENCE', approverName: 'Ruth Abara', approverEmail: RUTH,
  kind: 'EMAIL', pastedText: 'Approved, 46 hours. The line changeover ran long. Bill the six extra hours at your usual rate. Ruth',
})

describe('a 46-hour week at a client that is not on Etyme', () => {
  beforeAll(async () => {
    await freshWorld()
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 200 }))
    as(OWNER)
    const listed = await json(await listClient(req('POST', '/api/clients', { name: 'Lakeshore Mills', domain: 'lakeshore-mills.example' })))
    expect(listed.status, JSON.stringify(listed.body)).toBe(201)
    it_.client = listed.body.data.client.id
    const recorded = await json(await recordContact(req('PATCH', '/api/clients', { clientId: it_.client, email: RUTH, contactName: 'Ruth Abara' })))
    expect(recorded.status, JSON.stringify(recorded.body)).toBe(200)

    const brightmoor = await prisma.company.findFirstOrThrow({ where: { contexts: { some: { person: { primaryEmail: OWNER } } } }, select: { id: true } })
    it_.brightmoor = brightmoor.id
    const worker = await prisma.person.create({ data: { name: 'Paloma Ruiz', primaryEmail: 'paloma.ruiz.long-week@seed.etyme.invalid' } })
    const line = await prisma.sellContract.create({
      data: { companyId: brightmoor.id, clientCompanyId: it_.client, personId: worker.id, billRate: 7000, state: 'IN_PROGRESS', startDate: new Date('2026-09-06T00:00:00.000Z') },
      select: { id: true },
    })
    it_.line = line.id
    it_.worker = worker.id
    const t = await prisma.timesheet.create({
      data: {
        sellContractId: line.id, personId: worker.id,
        periodStart: new Date('2026-10-11T00:00:00.000Z'), periodEnd: new Date('2026-10-17T00:00:00.000Z'),
        days: { '2026-10-12': 10, '2026-10-13': 9, '2026-10-14': 9, '2026-10-15': 9, '2026-10-16': 9 }, totalHours: 46,
        status: 'SUBMITTED', submittedAt: new Date('2026-10-17T00:00:00.000Z'),
      },
      select: { id: true },
    })
    it_.week = t.id
  }, 240_000)

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('the week page offers the attach form with the two questions, and says the link cannot be used', async () => {
    as(OWNER)
    const r = await json(await readApprovals(req('GET', `/api/week-approvals?timesheetId=${it_.week}`)))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const act = r.body.data.act
    expect(act.refused).toBeNull()
    expect(act.linkRefused).toMatch(/^46h claimed on a 40h-a-week job\. A week like this is signed in Etyme by somebody at Lakeshore Mills/)
    expect(act.asks.says).toBe('46h claimed on a 40h-a-week job. Lakeshore Mills is not on Etyme, so attach its approval with its reason and its answer on the extra hours.')
    expect(act.asks.overtime.asks).toBe('How Lakeshore Mills approved the 6 hours over 40')
  })

  it('is refused without the client’s reason, and without how it approved the hours over forty, and nothing is signed', async () => {
    as(OWNER)
    const noReason = await attach({ ...approval(), overtime: 'SAME_RATE' })
    expect(noReason.status).toBe(422)
    expect(noReason.body.error).toMatchObject({ field: 'clientReason', message: 'Give the reason Lakeshore Mills gave for this week, in its own words. It goes on the approval.' })
    const noChoice = await attach({ ...approval(), clientReason: 'The line changeover ran long.' })
    expect(noChoice.status).toBe(422)
    expect(noChoice.body.error).toMatchObject({ field: 'overtime', message: 'Say how Lakeshore Mills approved the 6 hours over 40: at the usual rate, or at a premium.' })
    expect((await prisma.timesheet.findUniqueOrThrow({ where: { id: it_.week } })).clientApprovedAt).toBeNull()
    expect(await prisma.weekApproval.count({ where: { timesheetId: it_.week } })).toBe(0)
    expect(await prisma.overtimeDecision.count({ where: { timesheetId: it_.week } })).toBe(0)
  })

  it('the same week at a client that is on Etyme is still refused, word for word as before', async () => {
    as(OWNER)
    await prisma.company.update({ where: { id: it_.client }, data: { claimedAt: new Date() } })
    try {
      const r = await attach({ ...approval(), clientReason: 'The line changeover ran long.', overtime: 'SAME_RATE' })
      expect(r.status).toBe(409)
      expect(r.body.error.code).toBe('SIGN_IN_ETYME')
      expect(r.body.error.message).toBe('46h claimed on a 40h-a-week job. A week like this is signed in Etyme by somebody at Lakeshore Mills, with the reason it is right, so it cannot be approved by email.')
    } finally {
      await prisma.company.update({ where: { id: it_.client }, data: { claimedAt: null } })
    }
  })

  it('is approved by the client’s attached approval with its reason and its overtime choice, and every firm on it reads both', async () => {
    as(OWNER)
    const r = await attach({ ...approval(), clientReason: 'The line changeover ran long.', overtime: 'SAME_RATE' })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.status).toBe(201)
    const said = 'Reason given by Lakeshore Mills: “The line changeover ran long”. Ruth Abara approved the 6 hours over 40 at the usual rate.'
    expect(r.body.data.says).toContain(said)

    // The record: the week signed for the client, the client's decision on the six hours on its own rung.
    const week = await prisma.timesheet.findUniqueOrThrow({ where: { id: it_.week } })
    expect(week.clientApprovedAt).not.toBeNull()
    const decision = await prisma.overtimeDecision.findFirstOrThrow({ where: { timesheetId: it_.week } })
    expect(decision).toMatchObject({ sellContractId: it_.line, treatment: 'SAME_RATE', appliedBps: 10_000, afterHours: 40, decidedByCompanyId: it_.client })
    expect(Number(decision.overtimeHours)).toBe(6)
    expect(decision.reason).toBe('Ruth Abara at Lakeshore Mills approved it by email: The line changeover ran long.')
    const signature = await prisma.workAssertion.findFirstOrThrow({ where: { timesheetId: it_.week, role: 'CLIENT_APPROVAL', state: 'LIVE' } })
    expect(signature.note).toBe(`Approved by email: Ruth Abara, ${RUTH} — Lakeshore Mills was not on Etyme. ${said}`)
    expect(decision.workAssertionId).toBe(signature.id)

    // On reload, the approval carries what the client said.
    const seen = await json(await readApprovals(req('GET', `/api/week-approvals?timesheetId=${it_.week}`)))
    expect(seen.body.data.approvals[0].clientSays).toBe(said)
  })
})

describe('the payroll settings and the holiday calendar of a company in November', () => {
  beforeAll(async () => {
    const brightmoor = await prisma.company.findFirstOrThrow({ where: { contexts: { some: { person: { primaryEmail: OWNER } } } }, select: { id: true } })
    it_.brightmoor = brightmoor.id
    expect(it_.brightmoor).toBeTruthy()
  })

  it('a company with no holidays on its calendar is told on its payroll settings what the Payroll page says, and the screen gets its day-off rule', async () => {
    as(OWNER)
    await prisma.holiday.deleteMany({ where: { companyId: it_.brightmoor } })
    const r = await json(await readPayroll(req('GET', '/api/settings/payroll')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.noHolidays).toBe("No holidays are on Brightmoor Staffing's calendar, so a pay day on a public holiday is not moved. Add them in Settings, under Holidays.")
    expect(r.body.data.dayOffRule.holidays).toEqual([])
  })

  it('the rest of this year’s US holidays are added from the day asked, Christmas Day included, and no earlier day', async () => {
    as(OWNER)
    const r = await json(await addHolidays(req('POST', '/api/settings/holidays', { seedYear: 2026, country: 'US', from: '2026-11-14' })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.message).toMatch(/^Added Thanksgiving Day, Nov 26, and Christmas Day, Dec 25\./)
    const days = (await prisma.holiday.findMany({ where: { companyId: it_.brightmoor }, select: { date: true } })).map((h) => h.date.toISOString().slice(0, 10))
    expect(days).toContain('2026-12-25')
    expect(days.every((d) => d >= '2026-11-14')).toBe(true)
    const after = await json(await readPayroll(req('GET', '/api/settings/payroll')))
    expect(after.body.data.noHolidays).toBeNull()
  })

  it('pressing the button again adds nothing and says every holiday for the rest of 2026 is already on the calendar', async () => {
    as(OWNER)
    const r = await json(await addHolidays(req('POST', '/api/settings/holidays', { seedYear: 2026, country: 'US', from: '2026-11-14' })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.added).toBe(0)
    expect(r.body.data.message).toBe('Nothing was added. Every public holiday for the rest of 2026 is already on your calendar.')
  })

  it('a pay day already written for Paloma Ruiz on Christmas Day is said when Christmas Day is added, keeps its date, and the Owner is told to record holidays before placements', async () => {
    as(OWNER)
    await prisma.holiday.deleteMany({ where: { companyId: it_.brightmoor, date: new Date('2026-12-25T00:00:00.000Z') } })
    const buy = await prisma.buyContract.create({
      data: {
        companyId: it_.brightmoor, startDate: new Date('2026-09-06T00:00:00.000Z'),
        candidates: { create: { personId: it_.worker, payRate: 4500, startDate: new Date('2026-09-06T00:00:00.000Z') } },
      },
      select: { id: true },
    })
    const christmas = new Date('2026-12-25T00:00:00.000Z')
    const cycle = await prisma.cycle.create({ data: { buyContractId: buy.id, kind: 'SALARY_PAY', dueOn: christmas }, select: { id: true } })
    const r = await json(await addHolidays(req('POST', '/api/settings/holidays', { seedYear: 2026, country: 'US', from: '2026-11-14' })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.message).toContain('Added Christmas Day, Dec 25. Thanksgiving Day, Nov 26 was already on your calendar.')
    expect(r.body.data.message).toContain('Pay days already written for ')
    expect(r.body.data.message).toContain('Paloma Ruiz')
    expect(r.body.data.message).toContain('fall on Christmas Day, Dec 25, and keep their dates.')
    expect(r.body.data.message).toMatch(/Record holidays before you record a placement, and its pay days move off them\.$/)
    // Said, never moved: the date written stays Christmas Day.
    expect((await prisma.cycle.findUniqueOrThrow({ where: { id: cycle.id } })).dueOn.toISOString()).toBe(christmas.toISOString())
    await prisma.buyContract.delete({ where: { id: buy.id } })
  })

  it('with no calendar and no first pay Sunday, Settings says a W-2 placement cannot be recorded by hand until the Sunday is set; once it is set, saving says Payroll uses the periods now and Settings says Payroll still lists the W-2 worker', async () => {
    as(OWNER)
    await prisma.company.update({
      where: { id: it_.brightmoor },
      data: { templatePack: null, payPeriod: 'BIWEEKLY', payFirstPeriodStart: null, paySettingsSetAt: new Date() },
    })
    const waits = await json(await readSettings(req('GET', '/api/settings')))
    expect(waits.status, JSON.stringify(waits.body)).toBe(200)
    expect(waits.body.data.noCalendar.says[4]).toBe('A W-2 placement cannot be recorded by hand until "The Sunday your pay periods are counted from" is set.')

    const saved = await json(await changePayroll(req('PATCH', '/api/settings/payroll', { payFirstPeriodStart: '2026-10-11' })))
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    expect(saved.body.data.message).toBe(
      'Saved. The Payroll page and each worker’s own page use these pay periods now. ' +
      'Pay days already written on a placement’s “What is due” list keep their dates.'
    )
    const set = await json(await readSettings(req('GET', '/api/settings')))
    expect(set.body.data.noCalendar.says.slice(3, 5)).toEqual([
      'So no timesheet is due on it, and no bill date is set.',
      'The Payroll page still lists a W-2 worker on it in your own pay periods.',
    ])
  })

  it('Settings, Cycles tells a firm with no calendar of its own what is true and offers the Owner the one sign-up would choose, and pressing it sets it', async () => {
    as(OWNER)
    await prisma.company.update({ where: { id: it_.brightmoor }, data: { templatePack: null } })
    const before = await json(await readSettings(req('GET', '/api/settings')))
    expect(before.status, JSON.stringify(before.body)).toBe(200)
    expect(before.body.data.templatePack).toBeNull()
    expect(before.body.data.noCalendar.says[0]).toBe('Brightmoor Staffing has no calendar of due dates of its own yet.')
    expect(before.body.data.noCalendar.says[2]).toBe('A placement recorded by hand, or a submission turned into a contract, gets no due dates.')
    const offer = before.body.data.noCalendar.offer
    expect(offer).toEqual({ id: 'US_IT', label: 'US weekly hours, biweekly pay' })
    const pressed = await json(await applyPack(req('POST', `/api/companies/${it_.brightmoor}/template-pack`, { pack: offer.id }), { params: Promise.resolve({ id: it_.brightmoor }) }))
    expect(pressed.status, JSON.stringify(pressed.body)).toBe(200)
    expect(pressed.body.data.message).toBe('"US weekly hours, biweekly pay" is now Brightmoor Staffing’s calendar. Contracts made from now on take their due dates from it.')
    const after = await json(await readSettings(req('GET', '/api/settings')))
    expect(after.body.data.templatePack.id).toBe('US_IT')
    expect(after.body.data.noCalendar).toBeNull()
  })
})
