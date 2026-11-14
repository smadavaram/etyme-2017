import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { POST as runPayroll } from '@/app/api/payroll/run/route'
import { GET as payroll } from '@/app/api/payroll/route'
import { GET as payrollExport } from '@/app/api/payroll/export/route'
import { POST as recordExempt } from '@/app/api/contracts/[id]/exempt/route'

/**
 * A W-2 employee nobody has said is exempt from overtime, at $96 an hour,
 * with no overtime line on either contract. The skeptic's figures,
 * 2026-11-14: a 46-hour week is $4,704 if she is not exempt
 * (40 x 96 + 6 x 144) and $4,416 at straight time, $288 short. So the
 * week is held off the run, the screen's total and the file until the
 * person who runs payroll records the answer, and then paid once.
 *
 * Calendar facts: Monday 8 June 2026 and Monday 15 June 2026.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const iso = (x: Date) => x.toISOString().slice(0, 10)

type Seat = { id: string; personId: string; email: string }

let firmId = ''
let clientId = ''
let owner: Seat

async function call(seat: Seat, fn: any, method: string, url: string, body?: unknown, params?: unknown) {
  as(seat.email)
  const r = req(method, url, body, { 'x-context-id': seat.id })
  return json(params ? await fn(r, { params: Promise.resolve(params) }) : await fn(r))
}

interface Line { personId: string; sellId: string; buyId: string; name: string }

async function line(name: string, email: string): Promise<Line> {
  const person = await prisma.person.create({ data: { name, primaryEmail: email } })
  const start = d('2026-06-01')
  const sell = await prisma.sellContract.create({
    data: { companyId: firmId, clientCompanyId: clientId, personId: person.id, billRate: 13_200, startDate: start, state: 'IN_PROGRESS' },
  })
  const buy = await prisma.buyContract.create({
    data: {
      companyId: firmId, contractType: 'W2', state: 'IN_PROGRESS', startDate: start, payCurrency: 'USD',
      payFrequency: 'MONTHLY', payAnchor: 'CALENDAR', payStraddle: 'SPLIT',
      candidates: { create: { personId: person.id, payRate: 9_600, startDate: start } },
    },
  })
  await prisma.contractLink.create({ data: { sellContractId: sell.id, buyContractId: buy.id, effectiveFrom: start } })
  return { personId: person.id, sellId: sell.id, buyId: buy.id, name }
}

/** Monday to Friday, accepted as filed. */
async function week(l: Line, monday: string, hours: number[]) {
  const m = d(monday)
  const days: Record<string, number> = {}
  hours.forEach((h, i) => { days[iso(new Date(+m + i * 86_400_000))] = h })
  const total = hours.reduce((a, b) => a + b, 0)
  const end = new Date(+m + 4 * 86_400_000)
  const ts = await prisma.timesheet.create({
    data: {
      sellContractId: l.sellId, personId: l.personId, periodStart: new Date(+m - 86_400_000), periodEnd: new Date(+m + 5 * 86_400_000), days, totalHours: total,
      status: 'APPROVED', submittedAt: end, approvedAt: end, clientApprovedAt: end, employerAcceptedAt: end,
      employerAcceptedById: owner.personId,
    },
  })
  await prisma.workAssertion.create({
    data: { timesheetId: ts.id, companyId: firmId, role: 'EMPLOYER_ACCEPTANCE', hours: total, rateCents: 9_600, state: 'LIVE', byId: owner.personId },
  })
  return { id: ts.id, days }
}

const row = async (l: Line) => {
  const r = await call(owner, payroll, 'GET', `/api/payroll?period=2026-06&companyId=${firmId}`)
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data.payItems.find((x: any) => x.buyContractId === l.buyId)
}

describe('a 46-hour week for a W-2 employee nobody has said is exempt is held, then paid once with its overtime', () => {
  let omar: Line
  let pia: Line

  beforeAll(async () => {
    await freshWorld()
    const direct = await prisma.buyContract.findFirstOrThrow({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      where: { contractType: 'W2', supplierSellContractId: null, sellLinks: { some: {} } },
      include: { sellLinks: { include: { sellContract: true } } },
    })
    firmId = direct.companyId
    clientId = direct.sellLinks.find((l) => l.sellContract.companyId === direct.companyId)!.sellContract.clientCompanyId
    const ctxs = await prisma.context.findMany({
      where: { companyId: firmId, type: 'EMPLOYEE', role: { isNot: null } },
      include: { role: true, person: true },
    })
    const o = ctxs.find((c) => c.role!.permissions.includes('*'))!
    owner = { id: o.id, personId: o.personId, email: o.person.primaryEmail }

    omar = await line('Omar Haddock', 'omar@exempt-hold.etyme.invalid')
    await week(omar, '2026-06-08', [10, 9, 9, 9, 9]) // 46 hours
    await week(omar, '2026-06-15', [8, 8, 8, 8, 8]) // 40 hours

    pia = await line('Pia Lindgren', 'pia@exempt-hold.etyme.invalid')
  }, 900_000)

  it('the Payroll screen leaves the 46-hour week out of gross pay: 40 x $96 = $3,840, and says why on the row', async () => {
    const mine = await row(omar)
    expect(mine.totalApprovedHours).toBe(40)
    expect(mine.grossPay).toBe(384_000)
    expect(mine.heldHours).toBe(46)
    expect(mine.exemptHeld).toContain("Omar Haddock's week of June 7, 2026, 46 hours, is held off this pay.")
    expect(mine.exemptHeld).toContain('Nobody has recorded whether Omar Haddock is exempt from overtime.')
  })

  it('the payroll run works out and pays the same $3,840, never the $4,416 straight time would have paid', async () => {
    const r = await call(owner, runPayroll, 'POST', '/api/payroll/run', { buyContractIds: [omar.buyId], action: 'calculate', period: '2026-06' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const mine = r.body.data.details.find((x: any) => x.buyContractId === omar.buyId)
    expect(mine.totalHours).toBe(40)
    expect(mine.grossPay).toBe(384_000)
    expect(mine.exemptHeld).toContain('is held off this pay')
  })

  it('the payroll file leaves the 46-hour week off, in the wage rules’ own sentence, and pays nothing at straight time', async () => {
    const r = await call(owner, payrollExport, 'GET', '/api/payroll/export?from=2026-06-07&to=2026-06-13&provider=GENERIC')
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.lines.filter((l: any) => l.personName === 'Omar Haddock')).toHaveLength(0)
    expect(r.body.data.skipped.find((x: any) => x.personName === 'Omar Haddock')).toBeTruthy()
  })

  it('after Process pays the 40-hour week, the row reads "Processed, week held", never "Processed" alone, and the page says above the table who has a week held', async () => {
    const paid = await call(owner, runPayroll, 'POST', '/api/payroll/run', { buyContractIds: [omar.buyId], action: 'process', period: '2026-06' })
    expect(paid.status, JSON.stringify(paid.body)).toBe(200)
    expect(paid.body.data.details.find((x: any) => x.buyContractId === omar.buyId).grossPay).toBe(384_000) // 40 x 96
    const r = await call(owner, payroll, 'GET', `/api/payroll?period=2026-06&companyId=${firmId}`)
    const mine = r.body.data.payItems.find((x: any) => x.buyContractId === omar.buyId)
    expect(mine.payStatus).toBe('HELD')
    expect(mine.statusSays).toBe('Processed, week held')
    expect(mine.exemptHeld).toContain('is held off this pay')
    expect(mine.heldWeeks).toEqual([{ weekOf: '2026-06-07', hours: 46 }])
    // The held week stays off the totals: 40 hours and $3,840.
    expect(mine.totalApprovedHours).toBe(40)
    expect(mine.grossPay).toBe(384_000)
    expect(r.body.data.heldSays).toContain('Omar Haddock')
    expect(r.body.data.heldSays).toContain('until you record on')
    expect(r.body.data.summary.byStatus.HELD).toBeGreaterThanOrEqual(1)
  })

  it('the month’s pay file lists the 40-hour week as paid, with the held 46-hour week named on her line, and never "Paid" alone', async () => {
    as(owner.email)
    const res = await payroll(req('GET', `/api/payroll?period=2026-06&format=csv&companyId=${firmId}`, undefined, { 'x-context-id': owner.id }))
    expect(res.status).toBe(200)
    const [head, ...lines] = (await res.text()).trim().split('\n')
    expect(head.endsWith(',Status,Held off this pay')).toBe(true)
    const hers = lines.filter((x) => x.startsWith('Omar Haddock,'))
    expect(hers).toHaveLength(1)
    // Nothing left to pay, $3,840 paid already, and the held week named.
    expect(hers[0]).toContain(',0,96.00,0,0.00,0.00,3840.00,USD,')
    expect(hers[0].endsWith(',"Paid, week held","Week of June 7, 2026, 46 hours, overtime answer not recorded"')).toBe(true)
  })

  it('once "not exempt" is recorded, the week is back: 86 hours, 80 x 96 + 6 x 144 = $8,544, and Calculate is asked for again', async () => {
    const said = await call(owner, recordExempt, 'POST', `/api/contracts/${omar.buyId}/exempt`, { personId: omar.personId, status: 'NONEXEMPT' }, { id: omar.buyId })
    expect(said.status, JSON.stringify(said.body)).toBe(201)
    const mine = await row(omar)
    expect(mine.exemptHeld).toBeNull()
    expect(mine.totalApprovedHours).toBe(86)
    expect(mine.overtimeHours).toBe(6)
    expect(mine.grossPay).toBe(80 * 9_600 + 6 * 14_400) // 7,680 + 864 = 854,400
    // What Calculate covered before no longer matches what is to pay.
    expect(mine.payStatus).toBe('PENDING')
  })

  it('the 46-hour week alone is $4,704 on the run once worked out and paid, and a second payment pays nothing', async () => {
    // The 40-hour week was paid ($3,840) before the answer was recorded, so
    // this run pays the 46-hour week alone: 40 x 96 + 6 x 144 = $4,704.
    expect((await call(owner, runPayroll, 'POST', '/api/payroll/run', { buyContractIds: [omar.buyId], action: 'calculate', period: '2026-06' })).status).toBe(200)
    const paid = await call(owner, runPayroll, 'POST', '/api/payroll/run', { buyContractIds: [omar.buyId], action: 'process', period: '2026-06' })
    expect(paid.status, JSON.stringify(paid.body)).toBe(200)
    const mine = paid.body.data.details.find((x: any) => x.buyContractId === omar.buyId)
    expect(mine.grossPay).toBe(470_400) // 384,000 + 86,400; the 40-hour week's 384,000 was paid already
    expect(mine.premiumCents).toBe(28_800)
    const again = await call(owner, runPayroll, 'POST', '/api/payroll/run', { buyContractIds: [omar.buyId], action: 'process', period: '2026-06' })
    expect(again.body.data.details.find((x: any) => x.buyContractId === omar.buyId).grossPay).toBe(0)
  })

  it('a 46-hour week a run paid at straight time ($4,416) before "not exempt" was recorded says $288 is still owed, and the run pays the $288 once', async () => {
    const ts = await week(pia, '2026-06-08', [10, 9, 9, 9, 9])
    // A run from before the hold existed, which paid the 46 hours at straight time.
    await prisma.automationLog.create({
      data: {
        companyId: firmId, action: 'PAYROLL_RUN', summary: 'Payroll process: an earlier run', reason: 'An earlier run', reversible: false,
        payload: {
          action: 'process', period: '2026-06',
          contracts: [{
            buyContractId: pia.buyId, person: pia.name, payPeriod: null, hours: 46, grossPay: 441_600, currency: 'USD', refused: null, premiumsPriced: true,
            paid: Object.entries(ts.days).map(([day, hours]) => ({ personId: pia.personId, timesheetId: ts.id, day, hours, rateCents: 9_600 })),
          }],
        } as any,
      },
    })
    // Paid already, so not held: the row reads it paid, at straight time, until somebody says.
    const before = await row(pia)
    expect(before.payStatus).toBe('PROCESSED')
    expect(before.exemptHeld).toBeNull()
    expect(before.payLine).toContain('paid at straight time')

    const said = await call(owner, recordExempt, 'POST', `/api/contracts/${pia.buyId}/exempt`, { personId: pia.personId, status: 'NONEXEMPT' }, { id: pia.buyId })
    expect(said.status, JSON.stringify(said.body)).toBe(201)
    const mine = await row(pia)
    expect(mine.owedSinceRecorded).toBe(
      "Pia Lindgren's week of June 7, 2026 was paid at straight time before the answer on overtime was recorded. " +
        '$288.00 of overtime is still owed. Calculate, then pay it with this period.'
    )
    expect(mine.payStatus).toBe('PENDING')
    expect(mine.toPay).toMatchObject({ hours: 0, grossCents: 28_800, overtimeHours: 6 })

    expect((await call(owner, runPayroll, 'POST', '/api/payroll/run', { buyContractIds: [pia.buyId], action: 'calculate', period: '2026-06' })).status).toBe(200)
    const paid = await call(owner, runPayroll, 'POST', '/api/payroll/run', { buyContractIds: [pia.buyId], action: 'process', period: '2026-06' })
    expect(paid.status, JSON.stringify(paid.body)).toBe(200)
    expect(paid.body.data.details.find((x: any) => x.buyContractId === pia.buyId).grossPay).toBe(28_800) // 4,704 - 4,416
    const after = await row(pia)
    expect(after.owedSinceRecorded).toBeNull()
    expect(after.payStatus).toBe('PROCESSED')
  })
})
