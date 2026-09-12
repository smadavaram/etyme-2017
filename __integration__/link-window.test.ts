import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { GET as payroll } from '@/app/api/payroll/route'

/**
 * A consultant moves from one sub-vendor to another on the Wednesday.
 *
 * ContractLink carries effectiveFrom and effectiveTo; award, convert and
 * import all write them, and until now nothing read them. So payroll
 * picked up every timesheet on every linked sell contract whatever
 * period it covered, and the old vendor kept being paid for hours worked
 * under the new one — reconciling cleanly on both sides against a number
 * that was wrong before either of them looked.
 *
 * The pure suite proves the arithmetic. This proves the route uses it.
 */

const VENDOR = 'owner@midweek-swap.test'
let oldBuyId = ''
let newBuyId = ''

beforeAll(async () => {
  await resetDatabase()

  const company = await prisma.company.create({
    data: { name: 'Midweek Swap Ltd', slug: 'midweek-swap', kind: 'VENDOR', currency: 'USD' },
  })
  const person = await prisma.person.create({ data: { name: 'Anita Desai', primaryEmail: 'anita@midweek.test' } })
  const owner = await prisma.person.create({ data: { name: 'Owner', primaryEmail: VENDOR } })
  const role = await prisma.role.create({
    data: { companyId: company.id, name: 'Owner', permissions: ['*'], isDefault: true },
  })
  await prisma.context.create({
    data: { personId: owner.id, companyId: company.id, roleId: role.id, type: 'EMPLOYEE', grantReason: 'test' },
  })
  const client = await prisma.company.create({
    data: { name: 'The Client', slug: 'midweek-client', kind: 'CLIENT', currency: 'USD' },
  })

  const sell = await prisma.sellContract.create({
    data: {
      companyId: company.id, personId: person.id, clientCompanyId: client.id,
      billRate: 12000, billCurrency: 'USD', startDate: new Date('2026-01-01'), state: 'IN_PROGRESS',
    },
  })

  // One working week, eight hours a day, Monday to Friday, with the
  // employer's acceptance in the ledger — payroll follows that rather
  // than the client's approval, because in a chain the two are
  // different companies.
  const ts = await prisma.timesheet.create({
    data: {
      sellContractId: sell.id, personId: person.id,
      periodStart: new Date('2026-09-07'), periodEnd: new Date('2026-09-11'),
      days: { '2026-09-07': 8, '2026-09-08': 8, '2026-09-09': 8, '2026-09-10': 8, '2026-09-11': 8 },
      totalHours: 40, status: 'APPROVED', approvedAt: new Date('2026-09-12'),
    },
  })

  await prisma.workAssertion.create({
    data: {
      timesheetId: ts.id, companyId: company.id, role: 'EMPLOYER_ACCEPTANCE',
      hours: 40, rateCents: 9000, state: 'LIVE',
    },
  })

  // Two sub-vendors. The first is paid up to Tuesday; the second from
  // Wednesday. Both link to the same sell contract, which is what makes
  // the old behaviour pay each of them for the whole week.
  for (const [name, from, to] of [
    ['old', '2026-01-01', '2026-09-08'],
    ['new', '2026-09-09', null],
  ] as const) {
    const buy = await prisma.buyContract.create({
      data: {
        companyId: company.id, payCurrency: 'USD', contractType: 'C2C', state: 'IN_PROGRESS',
        startDate: new Date(from),
        candidates: { create: { personId: person.id, payRate: 9000, startDate: new Date(from) } },
      },
    })
    await prisma.contractLink.create({
      data: {
        sellContractId: sell.id, buyContractId: buy.id,
        effectiveFrom: new Date(from), effectiveTo: to ? new Date(to) : null,
      },
    })
    if (name === 'old') oldBuyId = buy.id
    else newBuyId = buy.id
  }
}, 180_000)

describe('a consultant who changes sub-vendor mid-week', () => {
  it('pays the old contract for Monday and Tuesday only', async () => {
    as(VENDOR)
    const r = await json(await payroll(req('GET', '/api/payroll')))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()

    const rows: any[] = r.body.data.payItems ?? []
    const old = rows.find((x) => x.buyContractId === oldBuyId)
    expect(old, `rows=${rows.length}`).toBeTruthy()
    expect(Number(old.totalApprovedHours ?? 0)).toBe(16)
  }, 60_000)

  it('pays the new contract for Wednesday, Thursday and Friday', async () => {
    as(VENDOR)
    const r = await json(await payroll(req('GET', '/api/payroll')))
    const rows: any[] = r.body.data.payItems ?? []
    const fresh = rows.find((x) => x.buyContractId === newBuyId)
    expect(Number(fresh.totalApprovedHours ?? 0)).toBe(24)
  }, 60_000)

  it('never pays forty hours twice, which is what it used to do', async () => {
    // The whole point. Before this, both contracts saw the full week and
    // the vendor paid eighty hours for forty worked.
    as(VENDOR)
    const r = await json(await payroll(req('GET', '/api/payroll')))
    const rows: any[] = r.body.data.payItems ?? []
    const total = rows
      .filter((x) => [oldBuyId, newBuyId].includes(x.buyContractId))
      .reduce((a, x) => a + Number(x.totalApprovedHours ?? 0), 0)
    expect(total).toBe(40)
  }, 60_000)
})
