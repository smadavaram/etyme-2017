import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'

import { PATCH as chooseCut } from '@/app/api/placements/[id]/cut-overtime/route'
import { GET as openPlacement } from '@/app/api/placements/[id]/route'

/**
 * The paying firm chooses how overtime is paid when fewer hours are
 * accepted than were worked. The founder, 2026-09-30: overtime only on
 * the accepted hours over the line by default; the firm may keep the
 * week's overtime instead, recorded with who chose it and why.
 *
 * Priya is a W2 on a forty-hour line at a firm in the seeded world. The
 * route is the door; the pay arithmetic that reads it is money's and is
 * tested there.
 */

type Seat = { id: string; personId: string; email: string }

let firmId = ''
let buyId = ''
let sellId = ''
let personId = ''
let owner: Seat
let noCost: Seat
let client: Seat

async function call(seat: Seat, fn: any, method: string, url: string, body?: unknown, params?: unknown) {
  as(seat.email)
  const r = req(method, url, body, { 'x-context-id': seat.id })
  return json(params ? await fn(r, { params: Promise.resolve(params) }) : await fn(r))
}

const choose = (seat: Seat, body: unknown) =>
  call(seat, chooseCut, 'PATCH', `/api/placements/${sellId}/cut-overtime`, body, { id: sellId })

const open = (seat: Seat) =>
  call(seat, openPlacement, 'GET', `/api/placements/${sellId}`, undefined, { id: sellId })

async function trail(where: Record<string, unknown>) {
  // The access log is written without holding the response up.
  for (let i = 0; i < 20; i++) {
    const row = await prisma.accessLog.findFirst({ where, orderBy: { at: 'desc' } })
    if (row) return row
    await new Promise((r) => setTimeout(r, 50))
  }
  return null
}

describe("a paying firm's choice of how overtime is paid on a cut week", () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()

    const direct = await prisma.buyContract.findFirstOrThrow({
      where: { contractType: 'W2', supplierSellContractId: null, sellLinks: { some: {} } },
      include: { sellLinks: { include: { sellContract: true } } },
    })
    const theirSell = direct.sellLinks.find((l) => l.sellContract.companyId === direct.companyId)!.sellContract
    firmId = direct.companyId

    const ownerOf = async (companyId: string): Promise<Seat> => {
      const ctxs = await prisma.context.findMany({
        where: { companyId, type: 'EMPLOYEE', role: { isNot: null } },
        include: { role: true, person: true },
      })
      const o = ctxs.find((c) => c.role!.permissions.includes('*'))!
      return { id: o.id, personId: o.personId, email: o.person.primaryEmail }
    }
    owner = await ownerOf(firmId)
    client = await ownerOf(theirSell.clientCompanyId)

    const role = await prisma.role.create({
      data: { companyId: firmId, name: 'Payroll clerk (no cost)', permissions: ['payroll.read', 'rates.read', 'timesheets.read'] },
    })
    const p2 = await prisma.person.create({ data: { name: 'Dev Raghunathan', primaryEmail: 'dev@cut-ot.etyme.invalid' } })
    const c2 = await prisma.context.create({
      data: { personId: p2.id, companyId: firmId, roleId: role.id, type: 'EMPLOYEE', grantReason: 'Cut-week overtime test' },
    })
    noCost = { id: c2.id, personId: p2.id, email: p2.primaryEmail }

    const priya = await prisma.person.create({ data: { name: 'Priya Natarajan', primaryEmail: 'priya@cut-ot.etyme.invalid' } })
    personId = priya.id
    const start = new Date('2026-06-01T00:00:00Z')
    const sell = await prisma.sellContract.create({
      data: { companyId: firmId, clientCompanyId: theirSell.clientCompanyId, personId, billRate: 11_200, startDate: start, state: 'IN_PROGRESS' },
    })
    sellId = sell.id
    const buy = await prisma.buyContract.create({
      data: {
        companyId: firmId, contractType: 'W2', state: 'IN_PROGRESS', startDate: start, payCurrency: 'USD',
        overtimeAfterHours: 40, overtimeMultiplierBps: 15_000,
        candidates: { create: { personId, payRate: 7_000, startDate: start } },
      },
    })
    buyId = buy.id
    await prisma.contractLink.create({ data: { sellContractId: sellId, buyContractId: buyId, effectiveFrom: start } })
  }, 900_000)

  it('the placement shows overtime only on the accepted hours over the line as the default until somebody chooses otherwise', async () => {
    const r = await open(owner)
    expect(r.status).toBe(200)
    const cut = r.body.data.contracts.buy.cutOvertime
    expect(cut.rule).toBe('ABOVE_THE_LINE')
    expect(cut.chosen).toBe(false)
    expect(cut.mayChange).toBe(true)
    expect(cut.says).toContain('When fewer hours are accepted, overtime is paid only on the accepted hours over the line.')
    // Payroll reads the line (cutOvertimeFor), so the sentence is the rule
    // it pays, with no "not yet" beside it.
    expect(cut.says).not.toContain('does not read this setting')
  })

  it("a desk that cannot see what the worker is paid cannot change how a cut week's overtime is paid, and the refusal is logged", async () => {
    const r = await choose(noCost, { rule: 'KEEP_WEEK_OVERTIME', reason: 'Agreed with Priya when she joined' })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toContain("Changing how Priya Natarajan's overtime is paid when fewer hours are accepted")
    const line = await prisma.buyContract.findUniqueOrThrow({ where: { id: buyId } })
    expect(line.cutOvertime).toBe('ABOVE_THE_LINE')
    expect(line.cutOvertimeById).toBeNull()
    const refused = await trail({ subjectId: personId, actorPersonId: noCost.personId, allowed: false })
    expect(refused?.reason).toContain('FORBIDDEN')
  })

  it('does not show that desk the setting, because it follows the pay rate', async () => {
    const r = await open(noCost)
    expect(r.status).toBe(200)
    expect(r.body.data.contracts.buy.cutOvertime).toBeNull()
  })

  it('refuses the client, which is a party to the placement and pays nobody on this line', async () => {
    const r = await choose(client, { rule: 'KEEP_WEEK_OVERTIME', reason: 'We would like her to keep overtime' })
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('NOT_THE_PAYER')
    expect(r.body.error.message).toBe(
      'Only the firm that pays Priya Natarajan can choose how their overtime is paid when fewer hours are accepted.'
    )
  })

  it("keeping the week's overtime is refused without a reason, and nothing changes", async () => {
    const r = await choose(owner, { rule: 'KEEP_WEEK_OVERTIME' })
    expect(r.status).toBe(422)
    expect(r.body.error.field).toBe('reason')
    expect(r.body.error.message).toContain("Say why Priya Natarajan should keep the week's overtime")
    const line = await prisma.buyContract.findUniqueOrThrow({ where: { id: buyId } })
    expect(line.cutOvertime).toBe('ABOVE_THE_LINE')
  })

  it('a rule that is neither of the two is refused', async () => {
    const r = await choose(owner, { rule: 'DOUBLE_TIME', reason: 'Agreed with Priya when she joined' })
    expect(r.status).toBe(422)
    expect(r.body.error.field).toBe('rule')
  })

  it("a firm's choice to keep a cut week's overtime is recorded with who chose it, when and why", async () => {
    const r = await choose(owner, { rule: 'KEEP_WEEK_OVERTIME', reason: 'Agreed with Priya when she joined' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.rule).toBe('KEEP_WEEK_OVERTIME')
    expect(r.body.data.says).toContain('the week keeps its overtime and the cut comes off ordinary hours first. Chosen by ')

    const line = await prisma.buyContract.findUniqueOrThrow({ where: { id: buyId } })
    expect(line.cutOvertime).toBe('KEEP_WEEK_OVERTIME')
    expect(line.cutOvertimeById).toBe(owner.personId)
    expect(line.cutOvertimeAt).not.toBeNull()
    expect(line.cutOvertimeReason).toBe('Agreed with Priya when she joined')

    const logged = await prisma.automationLog.findFirstOrThrow({
      where: { companyId: firmId, action: 'CUT_OVERTIME_CHOSEN' },
      orderBy: { at: 'desc' },
    })
    expect(logged.reason).toBe('Agreed with Priya when she joined')
    expect(logged.reversible).toBe(true)
    expect((logged.payload as any).from).toBe('ABOVE_THE_LINE')
    expect((logged.payload as any).to).toBe('KEEP_WEEK_OVERTIME')
    const read = await trail({ subjectId: personId, actorPersonId: owner.personId, allowed: true, action: 'PAYROLL_VIEW' })
    expect(read).not.toBeNull()

    const shown = await open(owner)
    expect(shown.body.data.contracts.buy.cutOvertime.chosen).toBe(true)
    expect(shown.body.data.contracts.buy.cutOvertime.reason).toBe('Agreed with Priya when she joined')
  })

  it('going back to the default needs no reason, and the line says who chose it', async () => {
    const r = await choose(owner, { rule: 'ABOVE_THE_LINE' })
    expect(r.status).toBe(200)
    const line = await prisma.buyContract.findUniqueOrThrow({ where: { id: buyId } })
    expect(line.cutOvertime).toBe('ABOVE_THE_LINE')
    expect(line.cutOvertimeReason).toBeNull()
    expect(line.cutOvertimeById).toBe(owner.personId)
    const shown = await open(owner)
    expect(shown.body.data.contracts.buy.cutOvertime.says).toMatch(/Chosen by .+ on /)
  })
})
