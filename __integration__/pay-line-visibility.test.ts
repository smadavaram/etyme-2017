import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { ensureDefaultRoles } from '@/lib/company-roles'
import { RATE_CHANGE_PERSON } from '@/lib/seed-rate-change'
import { placementEarned } from '@/lib/money/placement-earned'
import { ratePeriods } from '@/lib/contract-rate'

import { GET as listContracts } from '@/app/api/contracts/route'
import { GET as readExempt } from '@/app/api/contracts/[id]/exempt/route'
import { GET as listOrders } from '@/app/api/purchase-orders/route'
import { GET as exportPayroll } from '@/app/api/payroll/export/route'
import { GET as profitability } from '@/app/api/profitability/route'

/**
 * Who reads what a person is paid, walked on the seeded world.
 *
 * Found 2026-09-30: Karthik Menon, a delivery engineer on Teleworld
 * Solutions' own payroll, opened Buy contracts and read what Teleworld
 * pays each of his colleagues. His seat reads assignments and timesheets
 * and nothing about money.
 *
 * And Rosa Delgado's placement: raised from $66 to $70 on the seeded
 * world, her cost priced day by day at the rate in force.
 */

type Seat = { id: string; personId: string; email: string }

let teleworldId = ''
let karthik: Seat
let payroll: Seat
let colleagueBuyId = ''
let colleagueIds: string[] = []

async function call(seat: Seat, fn: any, url: string, params?: unknown) {
  as(seat.email)
  const r = req('GET', url, undefined, { 'x-context-id': seat.id })
  return json(params ? await fn(r, { params: Promise.resolve(params) }) : await fn(r))
}

async function seatAt(companyId: string, name: string): Promise<Seat> {
  const c = await prisma.context.findFirstOrThrow({
    where: { companyId, type: 'EMPLOYEE', person: { name } },
    include: { person: true },
  })
  return { id: c.id, personId: c.personId, email: c.person.primaryEmail }
}

describe('what each person at Teleworld is paid is read by the payroll desk, not the delivery team', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()

    const teleworld = await prisma.company.findFirstOrThrow({ where: { name: 'Teleworld Solutions' } })
    teleworldId = teleworld.id
    karthik = await seatAt(teleworldId, 'Karthik Menon')

    // Teleworld seats no payroll desk on the seeded world, so one is seated
    // here under the GSI's own AP & Payroll role — the permissions a real
    // Teleworld would hold, from lib/company-defaults.
    await ensureDefaultRoles(teleworldId, 'GSI')
    const role = await prisma.role.findFirstOrThrow({ where: { companyId: teleworldId, name: 'AP & Payroll' } })
    const who = await prisma.person.create({
      data: { name: 'Teleworld Payroll', primaryEmail: 'payroll@teleworld-walk.invalid' },
    })
    const ctx = await prisma.context.create({
      data: { personId: who.id, companyId: teleworldId, roleId: role.id, type: 'EMPLOYEE', grantReason: 'pay-line walk' },
    })
    payroll = { id: ctx.id, personId: who.id, email: who.primaryEmail }

    const colleagueLine = await prisma.buyContract.findFirstOrThrow({
      where: { companyId: teleworldId, candidates: { some: { personId: { not: karthik.personId }, payRate: { gt: 0 } } } },
      include: { candidates: true },
    })
    colleagueBuyId = colleagueLine.id
    colleagueIds = colleagueLine.candidates.map((c) => c.personId).filter((id) => id !== karthik.personId)
  }, 900_000)

  it("Karthik Menon's seat does not hold the permission a pay figure is read under", async () => {
    const ctx = await prisma.context.findUniqueOrThrow({ where: { id: karthik.id }, include: { role: true } })
    const perms = ctx.role?.permissions ?? []
    expect(perms).not.toContain('consultants.cost')
    expect(perms).not.toContain('*')
  })

  it("a delivery engineer cannot read a colleague's pay from the buy contracts list", async () => {
    const r = await call(karthik, listContracts, '/api/contracts?side=buy&limit=50')
    expect(r.status).toBe(200)
    const lines = r.body.data.contracts as any[]
    expect(lines.length).toBeGreaterThan(0)
    const colleague = lines.find((l) => l.id === colleagueBuyId)
    expect(colleague, 'the line is still listed').toBeTruthy()
    for (const l of lines) {
      for (const cd of l.candidates) {
        if (cd.person.id === karthik.personId) continue
        expect(cd.payRate, `${cd.person.name}'s pay`).toBeNull()
        expect(cd.payWithheld).toBe(true)
      }
      if (l.candidates.some((cd: any) => cd.person.id !== karthik.personId)) {
        expect(l.payRate).toBeNull()
        expect(l.payRateMin).toBeNull()
        expect(l.payRateMax).toBeNull()
      }
    }
    expect(r.body.data.payWithheldSays).toContain('AP & Payroll')
  })

  it("the delivery engineer's refusal is on the access trail for every colleague whose pay was withheld", async () => {
    const rows = await prisma.accessLog.findMany({
      where: { actorPersonId: karthik.personId, action: 'PAYROLL_VIEW', allowed: false },
    })
    const subjects = new Set(rows.map((r) => r.subjectId))
    for (const id of colleagueIds) expect(subjects.has(id)).toBe(true)
    expect(subjects.has(karthik.personId)).toBe(false)
    expect(rows[0].reason).toContain('consultants.cost')
  })

  it('the payroll desk still reads every pay line it runs', async () => {
    const r = await call(payroll, listContracts, '/api/contracts?side=buy&limit=50')
    expect(r.status).toBe(200)
    const stored = await prisma.buyContractCandidate.findMany({
      where: { buyContract: { companyId: teleworldId } },
      select: { buyContractId: true, personId: true, payRate: true },
    })
    const lines = r.body.data.contracts as any[]
    let checked = 0
    for (const l of lines) {
      for (const cd of l.candidates) {
        const s = stored.find((x) => x.buyContractId === l.id && x.personId === cd.person.id)!
        expect(cd.payRate).toBe(s.payRate)
        expect(cd.payWithheld).toBe(false)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
    expect(r.body.data.payWithheldSays).toBeNull()

    const reads = await prisma.accessLog.findMany({
      where: { actorPersonId: payroll.personId, action: 'PAYROLL_VIEW', allowed: true },
    })
    expect(new Set(reads.map((x) => x.subjectId)).size).toBeGreaterThan(0)
  })

  it('whether a colleague is owed overtime is refused to a delivery engineer in a sentence, because it is judged on their pay', async () => {
    const r = await call(karthik, readExempt, `/api/contracts/${colleagueBuyId}/exempt`, { id: colleagueBuyId })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toContain('shown only to the desks that run pay')
    const p = await call(payroll, readExempt, `/api/contracts/${colleagueBuyId}/exempt`, { id: colleagueBuyId })
    expect(p.status).toBe(200)
  })

  it('the payroll file is refused to a delivery engineer and handed to the payroll desk', async () => {
    const r = await call(karthik, exportPayroll, '/api/payroll/export')
    expect(r.status).toBe(403)
    expect(r.body.error.message).toContain('only the desks that run pay may download it')
    as(payroll.email)
    const p = await exportPayroll(req('GET', '/api/payroll/export', undefined, { 'x-context-id': payroll.id }))
    expect(p.status).toBe(200)
  })
})

describe('what a firm pays below it on a purchase order is the payroll desk’s to read', () => {
  it('an account manager reads a purchase order’s lines without what the firm pays below it, and the payroll desk reads it', async () => {
    const order = await prisma.workOrder.findFirst({
      where: { buyContracts: { some: { candidates: { some: { payRate: { gt: 0 } } } } } },
      select: { issuedById: true },
    })
    expect(order, 'the seeded world has an order with a paid buy line on it').toBeTruthy()
    const firmId = order!.issuedById
    await ensureDefaultRoles(firmId, (await prisma.company.findUniqueOrThrow({ where: { id: firmId } })).kind as any)
    const seatFor = async (roleName: string, email: string): Promise<Seat> => {
      const role = await prisma.role.findFirstOrThrow({ where: { companyId: firmId, name: roleName } })
      const who = await prisma.person.upsert({ where: { primaryEmail: email }, update: {}, create: { name: roleName, primaryEmail: email } })
      const ctx = await prisma.context.create({
        data: { personId: who.id, companyId: firmId, roleId: role.id, type: 'EMPLOYEE', grantReason: 'pay-line walk' },
      })
      return { id: ctx.id, personId: who.id, email }
    }
    const account = await seatFor('Account Manager', 'account@po-walk.invalid')
    const pay = await seatFor('AP & Payroll', 'payroll@po-walk.invalid')

    const a = await call(account, listOrders, '/api/purchase-orders?side=issued')
    expect(a.status).toBe(200)
    const buyLinesA = (a.body.data.orders as any[]).flatMap((o) => o.lines).filter((l: any) => l.side === 'BUY')
    expect(buyLinesA.length).toBeGreaterThan(0)
    for (const l of buyLinesA) {
      expect(l.rate).toBeNull()
      expect(l.payWithheld).toBe(true)
    }

    const p = await call(pay, listOrders, '/api/purchase-orders?side=issued')
    const buyLinesP = (p.body.data.orders as any[]).flatMap((o) => o.lines).filter((l: any) => l.side === 'BUY')
    expect(buyLinesP.some((l: any) => typeof l.rate === 'number' && l.rate > 0)).toBe(true)
  })
})

describe("Rosa Delgado's placement is costed at the rate in force on each day", () => {
  it("a placement's margin prices each day at the rate in force that day, so weeks before a raise cost the old rate", async () => {
    const sell = await prisma.sellContract.findFirstOrThrow({
      where: { person: { name: RATE_CHANGE_PERSON.name }, buyLinks: { some: {} } },
      include: {
        buyLinks: { include: { buyContract: { include: { candidates: true } } } },
        timesheets: {
          select: {
            periodStart: true, periodEnd: true, days: true,
            assertions: { where: { state: 'LIVE' }, select: { role: true, hours: true, rateCents: true } },
          },
        },
      },
    })
    const buy = sell.buyLinks[0].buyContract
    const cand = buy.candidates.find((c) => c.personId === sell.personId)!
    const rows = await prisma.rateHistory.findMany({
      where: { OR: [{ contractType: 'SELL', contractId: sell.id }, { contractType: 'BUY', contractId: buy.id }] },
      select: { id: true, contractType: true, rate: true, fromDate: true, toDate: true, approvalState: true },
    })
    const rise = rows.find((r) => r.contractType === 'BUY' && r.approvalState === 'APPROVED' && r.rate === 7_000)!
    expect(cand.payRate).toBe(6_600)

    const earned = placementEarned({
      sheets: sell.timesheets,
      bill: { openingRateCents: sell.billRate, periods: ratePeriods(rows.filter((r) => r.contractType === 'SELL')), currency: sell.billCurrency },
      pay: { openingRateCents: cand.payRate, periods: ratePeriods(rows.filter((r) => r.contractType === 'BUY')), currency: cand.payCurrency ?? buy.payCurrency },
    })

    // Derived by hand from the rows: every accepted hour on a day before
    // the raise at $66, from it at $70, a partial acceptance cut off the
    // latest days first.
    const riseDay = rise.fromDate.toISOString().slice(0, 10)
    let expected = 0
    let hours = 0
    let before = 0
    let after = 0
    for (const t of sell.timesheets) {
      const acc = t.assertions.find((a) => a.role === 'EMPLOYER_ACCEPTANCE')
      if (!acc) continue
      const days = Object.entries((t.days ?? {}) as Record<string, number>)
        .filter(([, h]) => Number(h) > 0).sort(([a], [b]) => a.localeCompare(b))
      let cut = days.reduce((n, [, h]) => n + Number(h), 0) - Number(acc.hours)
      const kept = days.map(([d, h]) => [d.slice(0, 10), Number(h)] as [string, number])
      for (let i = kept.length - 1; i >= 0 && cut > 0; i--) {
        const off = Math.min(cut, kept[i][1]); kept[i][1] -= off; cut -= off
      }
      for (const [d, h] of kept) {
        if (d < riseDay) { expected += h * 6_600; before += h } else { expected += h * 7_000; after += h }
        hours += h
      }
    }
    expect(before, 'weeks before the raise were worked').toBeGreaterThan(0)
    expect(after, 'weeks after the raise were worked').toBeGreaterThan(0)
    expect(earned.costCents).toBe(Math.round(expected))
    // Neither the line's own column across every hour, nor today's rate.
    expect(earned.costCents).not.toBe(Math.round(hours * 6_600))
    expect(earned.costCents).not.toBe(Math.round(hours * 7_000))
  })

  it('the profitability screen reads the same cost for her placement as the one reader does', async () => {
    const sell = await prisma.sellContract.findFirstOrThrow({
      where: { person: { name: RATE_CHANGE_PERSON.name }, buyLinks: { some: {} } },
      select: { id: true, companyId: true },
    })
    const owner = await prisma.context.findFirstOrThrow({
      where: { companyId: sell.companyId, type: 'EMPLOYEE', role: { permissions: { has: '*' } } },
      include: { person: true },
    })
    const seat = { id: owner.id, personId: owner.personId, email: owner.person.primaryEmail }
    const r = await call(seat, profitability, '/api/profitability?by=contract')
    expect(r.status).toBe(200)
    const row = (r.body.data.rows as any[]).find((x) => x.contractId === sell.id)
    expect(row).toBeTruthy()
    expect(row.profit.payCents).toBeGreaterThan(0)
    // The same reader, so the same figure.
    const again = await prisma.sellContract.findUniqueOrThrow({
      where: { id: sell.id },
      include: {
        buyLinks: { include: { buyContract: { include: { candidates: true } } } },
        timesheets: { select: { periodStart: true, periodEnd: true, days: true, assertions: { where: { state: 'LIVE' }, select: { role: true, hours: true, rateCents: true } } } },
      },
    })
    const buy = again.buyLinks[0].buyContract
    const cand = buy.candidates.find((c) => c.personId === again.personId)!
    const rows = await prisma.rateHistory.findMany({
      where: { OR: [{ contractType: 'SELL', contractId: sell.id }, { contractType: 'BUY', contractId: buy.id }] },
      select: { id: true, contractType: true, rate: true, fromDate: true, toDate: true, approvalState: true },
    })
    const earned = placementEarned({
      sheets: again.timesheets,
      bill: { openingRateCents: again.billRate, periods: ratePeriods(rows.filter((x) => x.contractType === 'SELL')), currency: again.billCurrency },
      pay: { openingRateCents: cand.payRate, periods: ratePeriods(rows.filter((x) => x.contractType === 'BUY')), currency: cand.payCurrency ?? buy.payCurrency },
    })
    expect(row.profit.payCents).toBe(earned.costCents)
    expect(row.profit.revenueCents).toBe(earned.revenueCents)
  })
})
