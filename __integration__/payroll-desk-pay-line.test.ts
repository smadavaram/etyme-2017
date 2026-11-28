import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { ensureDefaultRoles } from '@/lib/company-roles'
import { RATE_CHANGE_PERSON } from '@/lib/seed-rate-change'

import { GET as openPlacement } from '@/app/api/placements/[id]/route'
import { PATCH as chooseMethod } from '@/app/api/placements/[id]/overtime-method/route'
import { PATCH as chooseCut } from '@/app/api/placements/[id]/cut-overtime/route'

/**
 * Brightmoor's payroll desks, on Rosa Delgado's placement.
 *
 * A browser walk on 2026-09-30 opened her placement as each Brightmoor
 * desk. The AP & Payroll desk — Desmond Achebe, who accepts her weeks
 * and runs her pay — and the Finance desk were told the page "does not
 * read money", and the pay line that everybody could read showed $66 an
 * hour two months after her $70 had been approved and paid. Each
 * sentence below is one of those, put right, and the account manager
 * still refused.
 */

type Seat = { id: string; personId: string; email: string }

let firmId = ''
let sellId = ''
let riseOn = ''
let payroll: Seat
let finance: Seat
let account: Seat
let owner: Seat

async function call(seat: Seat, fn: any, method: string, url: string, body?: unknown, params?: unknown) {
  as(seat.email)
  const r = req(method, url, body, { 'x-context-id': seat.id })
  return json(params ? await fn(r, { params: Promise.resolve(params) }) : await fn(r))
}
const open = (seat: Seat) => call(seat, openPlacement, 'GET', `/api/placements/${sellId}`, undefined, { id: sellId })
const method = (seat: Seat, body: unknown) =>
  call(seat, chooseMethod, 'PATCH', `/api/placements/${sellId}/overtime-method`, body, { id: sellId })
const cut = (seat: Seat, body: unknown) =>
  call(seat, chooseCut, 'PATCH', `/api/placements/${sellId}/cut-overtime`, body, { id: sellId })

async function seatOf(name: string): Promise<Seat> {
  const c = await prisma.context.findFirstOrThrow({
    where: { companyId: firmId, type: 'EMPLOYEE', person: { name } },
    include: { person: true },
  })
  return { id: c.id, personId: c.personId, email: c.person.primaryEmail }
}

describe("Brightmoor's payroll desks read and set Rosa Delgado's pay line", () => {
  beforeAll(async () => {
    await freshWorld()

    const sell = await prisma.sellContract.findFirstOrThrow({
      where: { person: { name: RATE_CHANGE_PERSON.name }, buyLinks: { some: {} } },
      include: { buyLinks: { include: { buyContract: true } } },
    })
    sellId = sell.id
    firmId = sell.companyId
    const buy = sell.buyLinks[0].buyContract
    const rise = await prisma.rateHistory.findFirstOrThrow({
      where: { contractType: 'BUY', contractId: buy.id, approvalState: 'APPROVED', rate: 7_000 },
    })
    riseOn = rise.fromDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

    payroll = await seatOf('Desmond Achebe')
    finance = await seatOf('Rosalind Tay')
    account = await seatOf('Marisa Delacroix')
    const ctxs = await prisma.context.findMany({
      where: { companyId: firmId, type: 'EMPLOYEE', role: { isNot: null } },
      include: { role: true, person: true },
    })
    const o = ctxs.find((c) => c.role!.permissions.includes('*'))!
    owner = { id: o.id, personId: o.personId, email: o.person.primaryEmail }
  }, 900_000)

  it('a firm formed before the payroll desk could read pay is given it the next time somebody opens users and permissions, and the account manager is not', async () => {
    // As Brightmoor's roles stood before 2026-09-30.
    for (const name of ['AP & Payroll', 'Finance']) {
      const r = await prisma.role.findFirstOrThrow({ where: { companyId: firmId, name } })
      await prisma.role.update({ where: { id: r.id }, data: { permissions: r.permissions.filter((p) => p !== 'consultants.cost') } })
    }
    const before = await open(payroll)
    expect(before.body.data.contracts.buy.payRate).toBeNull()

    const { granted } = await ensureDefaultRoles(firmId, 'VENDOR')
    expect(granted).toEqual(expect.arrayContaining(['AP & Payroll → consultants.cost', 'Finance → consultants.cost']))
    for (const name of ['AP & Payroll', 'Finance']) {
      const r = await prisma.role.findFirstOrThrow({ where: { companyId: firmId, name } })
      expect(r.permissions).toContain('consultants.cost')
    }
    const am = await prisma.role.findFirstOrThrow({ where: { companyId: firmId, name: 'Account Manager' } })
    expect(am.permissions).not.toContain('consultants.cost')
  })

  it("the AP & Payroll desk reads Rosa Delgado's pay line at the $70 in force today, with the change said in a line", async () => {
    const r = await open(payroll)
    expect(r.status).toBe(200)
    const buy = r.body.data.contracts.buy
    expect(buy.payRate).toBe(70)
    expect(buy.payRateSays).toBe(`$70/hr since ${riseOn} — was $66`)
    expect(buy.overtime.mayChange).toBe(true)
    expect(buy.cutOvertime.mayChange).toBe(true)
  })

  it('the AP & Payroll desk may change how overtime is paid on the pay line, and a cut-week choice with no reason is refused in words', async () => {
    const m = await method(payroll, { method: 'HIGHER_RATE', reason: 'Agreed with Rosa at her six-month review' })
    expect(m.status).toBe(200)
    expect(m.body.data.method).toBe('HIGHER_RATE')

    const refused = await cut(payroll, { rule: 'KEEP_WEEK_OVERTIME', reason: '' })
    expect(refused.status).toBe(422)
    expect(refused.body.error.message).toContain('Say why Rosa Delgado should keep the week')
  })

  it('the Finance desk reads the pay line and may change the cut-week setting', async () => {
    const r = await open(finance)
    expect(r.body.data.contracts.buy.payRate).toBe(70)
    const c = await cut(finance, { rule: 'KEEP_WEEK_OVERTIME', reason: 'Agreed with Rosa when she joined Brightmoor' })
    expect(c.status).toBe(200)
    expect(c.body.data.rule).toBe('KEEP_WEEK_OVERTIME')
  })

  it('an account manager does not read the pay line and is refused when choosing how overtime is paid', async () => {
    const r = await open(account)
    expect(r.status).toBe(200)
    expect(r.body.data.contracts.buy.payRate).toBeNull()
    expect(r.body.data.contracts.buy.payRateSays).toBeNull()
    expect(r.body.data.contracts.buy.overtime).toBeNull()
    expect(r.body.data.contracts.buy.cutOvertime).toBeNull()

    const m = await method(account, { method: 'US_REGULAR_RATE' })
    expect(m.status).toBe(403)
    const c = await cut(account, { rule: 'ABOVE_THE_LINE' })
    expect(c.status).toBe(403)
    expect(c.body.error.message).toContain("Rosa Delgado's overtime")
  })

  it('a bill rate changed and approved is shown at the new rate, with the change said in a line', async () => {
    // Thirty days ago, whatever day the suite runs.
    const from = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() - 30))
    const said = from.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    await prisma.rateHistory.create({
      data: {
        contractType: 'SELL', contractId: sellId, rate: 11_800, rateType: 'HOURLY',
        fromDate: from, toDate: null, reason: 'Renewal',
        changedById: owner.personId, previousRate: 11_200,
        approvalState: 'APPROVED', approvedById: owner.personId, approvedAt: from,
      },
    })
    const r = await open(owner)
    expect(r.body.data.contracts.sell.billRate).toBe(118)
    expect(r.body.data.contracts.sell.billRateSays).toBe(`$118/hr since ${said} — was $112`)
  })
})
