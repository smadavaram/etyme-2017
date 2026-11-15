import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'

import { POST as registerCompany } from '@/app/api/companies/route'
import { POST as addClient } from '@/app/api/clients/route'
import { POST as recordPlacement } from '@/app/api/contracts/route'
import { GET as billWaits } from '@/app/api/invoices/generate/route'
import { GET as receipts } from '@/app/api/ap/receipts/route'
import { FIRST_DAY_HREF } from '@/lib/money/pay-periods'

/**
 * Area E of the 2026-11-14 fix list, walked on a firm the test makes: a
 * small supplier with W-2 people at a client that is not on Etyme. Its
 * accounts receivable clerk opened Bills and read one condition on the
 * page and another in the dialog; its payroll person opened Payables and
 * read only that no receipt had been typed in.
 *
 * Every date is fixed in the test. Nothing reads the seeded world.
 */

const ADMIN = 'dana@northwind-staffing.example'
const AR = 'ari.receivable@northwind-staffing.example'
const CONTRACTS = 'cole.contracts@northwind-staffing.example'

let firmId = ''
let adminId = ''
let adminName = ''
let clientId = ''
let lineId = ''

async function seat(email: string, name: string, role: string) {
  const r = await prisma.role.findFirstOrThrow({ where: { companyId: firmId, name: role }, select: { id: true } })
  const p = await prisma.person.create({ data: { primaryEmail: email, name }, select: { id: true } })
  await prisma.context.create({ data: { personId: p.id, companyId: firmId, type: 'EMPLOYEE', roleId: r.id, grantReason: 'Seated for the test' } })
  return p.id
}

const waits = async (who: string) => {
  as(who)
  const r = await json(await billWaits(req('GET', '/api/invoices/generate')))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data
}

const w2 = (personId: string) => ({
  personId, companyId: firmId, clientCompanyId: clientId,
  billRate: 9000, billCurrency: 'USD', startDate: '2026-09-14', payRate: 6000, payCurrency: 'USD', contractType: 'W2',
})

beforeAll(async () => {
  await resetDatabase()
  as(ADMIN)
  const r = await json(await registerCompany(req('POST', '/api/companies', { name: 'Northwind Staffing', kind: 'VENDOR' })))
  expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  firmId = r.body.data.company.id
  const admin = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: ADMIN }, select: { id: true, name: true } })
  adminId = admin.id
  adminName = admin.name
  const added = await json(await addClient(req('POST', '/api/clients', { name: 'Harborline Tech' })))
  expect(added.status, JSON.stringify(added.body)).toBeLessThan(300)
  clientId = (await prisma.company.findFirstOrThrow({ where: { name: 'Harborline Tech', listedById: firmId }, select: { id: true } })).id
  await seat(AR, 'Ari Mendes', 'Accounts Receivable')
  await seat(CONTRACTS, 'Cole Pruitt', 'Contract Manager')
}, 120_000)

describe('the Bills page says which step the next bill waits on', () => {
  it('a supplier with nobody placed reads that nobody is placed yet, with a link to Record a placement for a seat that may', async () => {
    const data = await waits(ADMIN)
    expect(data.canBill).toBe(false)
    expect(data.says).toBe('Nobody is placed yet, so there is nothing to bill. A bill is made from the weeks a client approved.')
    expect(data.link).toEqual({ href: '/dashboard/contracts?new=1', label: 'Record a placement' })
  })

  it('the accounts receivable clerk, who may not record a placement, is told which role does and shown no link', async () => {
    const data = await waits(AR)
    expect(data.canBill).toBe(false)
    expect(data.link).toBeNull()
    expect(data.says).toMatch(/^Nobody is placed yet, so there is nothing to bill\. A bill is made from the weeks a client approved\. Recording a placement is for .+ here\. Ask (them|one of them)\.$/)
  })

  it('a firm that never saved its payroll records a W-2 placement, and is told her pay days will not show until the Sunday is set', async () => {
    as(ADMIN)
    const r = await json(await recordPlacement(req('POST', '/api/contracts', w2(adminId))))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    lineId = r.body.data.sellContract.id
    expect(r.body.data.firstDay).toEqual({
      says: `The Sunday your pay periods are counted from is not set. ${adminName}'s pay days will not show until it is.`,
      link: { href: FIRST_DAY_HREF, label: 'Set "The Sunday your pay periods are counted from" in Settings' },
    })
  })

  it('a placement recorded and not started is named, and no week can be filed on it yet', async () => {
    const data = await waits(ADMIN)
    expect(data.canBill).toBe(false)
    expect(data.says).toBe(`${adminName}’s placement has not started yet, so no week can be filed or billed. A placement starts from Contracts.`)
  })

  it('a firm whose only placement is paused is told the placement is paused and where it is resumed, never that it has none', async () => {
    await prisma.sellContract.update({ where: { id: lineId }, data: { state: 'PAUSED' } })
    const data = await waits(ADMIN)
    expect(data.canBill).toBe(false)
    expect(data.says).toBe(`${adminName}’s placement is paused, so no week can be filed or billed. A paused placement is resumed from Contracts.`)
    expect(data.says).not.toContain('no engagement')
    expect(data.link).toEqual({ href: '/dashboard/contracts', label: 'Open Contracts' })
  })

  it('a started placement with no week filed says the person has not filed, and that only the person who worked files hours', async () => {
    await prisma.sellContract.update({ where: { id: lineId }, data: { state: 'IN_PROGRESS' } })
    const data = await waits(ADMIN)
    expect(data.canBill).toBe(false)
    expect(data.says).toBe(`${adminName} has not filed a week yet, so there is nothing to bill. Only the person who worked files hours, from their own page.`)
    expect(data.engagements.length).toBe(1)
  })

  it('a filed week at a client off Etyme with nobody there who approves hours recorded says to add that person under Contacts first, then attach', async () => {
    await prisma.timesheet.create({
      data: {
        sellContractId: lineId, personId: adminId,
        periodStart: new Date('2026-09-20T00:00:00Z'), periodEnd: new Date('2026-09-26T00:00:00Z'),
        days: { '2026-09-21': 8, '2026-09-22': 8, '2026-09-23': 8, '2026-09-24': 8, '2026-09-25': 8 },
        totalHours: 40, status: 'SUBMITTED', submittedAt: new Date('2026-09-26T00:00:00Z'),
      },
    })
    const data = await waits(ADMIN)
    expect(data.canBill).toBe(false)
    expect(data.says).toBe(
      `Nothing can be billed until the client signs the week. ${adminName}’s week of Sep 20 is waiting for Harborline Tech to sign it. ` +
        'Harborline Tech is not on Etyme, and nobody there who approves hours is recorded yet. ' +
        'Add the person at Harborline Tech who approves hours, under Contacts. Then attach the client’s approval on the week.'
    )
    expect(data.link).toEqual({ href: '/dashboard/contacts', label: 'Open Contacts' })
  })

  it('a filed week the client has not approved names the client it waits on and links to the week, where the approval is attached', async () => {
    // The person at the client who approves hours, recorded in the firm's own address book.
    await prisma.companyContact.create({ data: { companyId: firmId, atCompanyId: clientId, name: 'Hana Brooks', email: 'hana.brooks@harborline.example' } })
    const ts = await prisma.timesheet.findFirstOrThrow({ where: { sellContractId: lineId, periodStart: new Date('2026-09-20T00:00:00Z') } })
    const data = await waits(ADMIN)
    expect(data.canBill).toBe(false)
    expect(data.says).toBe(`Nothing can be billed until the client signs the week. ${adminName}’s week of Sep 20 is waiting for Harborline Tech to sign it.`)
    expect(data.link).toEqual({ href: `/dashboard/weeks/${ts.id}`, label: 'Attach the client’s approval' })

    // Once the client's approval stands on the week, something can be billed and the button is drawn.
    await prisma.workAssertion.create({ data: { timesheetId: ts.id, companyId: clientId, role: 'CLIENT_APPROVAL', hours: 40, rateCents: 9000, state: 'LIVE' } })
    const after = await waits(ADMIN)
    expect(after.canBill).toBe(true)
    expect(after.says).toBeNull()
  })
})

describe('an MSP reads on Bills what is true for a firm that supplies nobody', () => {
  it('an MSP is told it is the supplier on no placement and that Etyme raises no bill for its own fee', async () => {
    const MSP_ADMIN = 'mara@keelpoint-programs.example'
    as(MSP_ADMIN)
    const r = await json(await registerCompany(req('POST', '/api/companies', { name: 'Keelpoint Programs', kind: 'MSP' })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const data = await waits(MSP_ADMIN)
    expect(data.canBill).toBe(false)
    expect(data.says).toBe(
      'Keelpoint Programs is not the supplier on any placement, so it has nothing to bill. Etyme does not raise a bill for an MSP’s own fee.'
    )
    expect(data.link).toBeNull()
  })
})

describe('an empty Payables page says where an invoice receipt comes from', () => {
  it('a supplier with W-2 people reads that its own employees are paid by payroll, with a link to Payroll', async () => {
    as(ADMIN)
    const r = await json(await receipts(req('GET', '/api/ap/receipts')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.receipts).toEqual([])
    expect(r.body.data.empty.detail).toContain('An invoice receipt is a supplier’s invoice for a person you buy from another firm.')
    expect(r.body.data.empty.detail).toContain('Your own employees are paid by payroll, not from here.')
    // The order match is said of the invoice receipt, before the payroll sentence: a W-2 line has no order.
    expect(r.body.data.empty.detail).toBe(
      'An invoice receipt is a supplier’s invoice for a person you buy from another firm. It is typed in here when it arrives. ' +
        'Each invoice receipt is paid from its own page once it matches the order and the hours accepted. ' +
        'Your own employees are paid by payroll, not from here.'
    )
    expect(r.body.data.empty.link).toEqual({ href: '/dashboard/payroll', label: 'Open Payroll' })
  })
})

describe('Record a placement, refused for the first Sunday, links to the box', () => {
  it('a firm that saved its payroll with no Sunday is refused a W-2 placement, with a link to the box for a seat that may open Settings', async () => {
    await prisma.company.update({ where: { id: firmId }, data: { paySettingsSetAt: new Date('2026-11-14T12:00:00Z'), payPeriod: 'BIWEEKLY', payFirstPeriodStart: null } })
    // A second line for the person already on its payroll, so the person is the firm's own.
    as(ADMIN)
    const r = await json(await recordPlacement(req('POST', '/api/contracts', w2(adminId))))
    expect(r.status, JSON.stringify(r.body)).toBe(422)
    expect(r.body.error.field).toBe('startDate')
    expect(r.body.error.message).toBe("A W-2 line's pay days count from the Sunday your pay periods start on, and that Sunday is not set yet.")
    expect(r.body.error.link).toEqual({ href: FIRST_DAY_HREF, label: 'Set "The Sunday your pay periods are counted from" in Settings' })
  })

  it('a contract manager who cannot open Settings is told to ask the Owner or an Admin, and shown no link', async () => {
    as(CONTRACTS)
    const r = await json(await recordPlacement(req('POST', '/api/contracts', w2(adminId))))
    expect(r.status, JSON.stringify(r.body)).toBe(422)
    expect(r.body.error.message).toBe(
      "A W-2 line's pay days count from the Sunday your pay periods start on, and that Sunday is not set yet. Ask the Owner or an Admin to set it."
    )
    expect(r.body.error.link).toBeNull()
  })
})
