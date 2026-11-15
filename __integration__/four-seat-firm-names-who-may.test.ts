import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as weekSection } from '@/app/api/contracts/weeks/[timesheetId]/route'
import { POST as generate } from '@/app/api/invoices/generate/route'
import { GET as preflight, POST as activate } from '@/app/api/contracts/[id]/activate/route'
import { POST as sendBill } from '@/app/api/invoices/[id]/submit/route'
import { GET as billList } from '@/app/api/invoices/route'
import { rolesFor } from '@/lib/company-defaults'

/**
 * The layer 2 press of the money chain, 2026-11-15: a small staffing firm
 * seated with an Owner, HR, an Account Manager and AP & Payroll, and
 * nobody else. The week page told AP & Payroll to ask "Accounts
 * Receivable, Finance or Admin", and the placement's drawer told the
 * Account Manager to ask "Resource Manager or Contract Manager". Nobody
 * there holds any of those roles; only the Owner bills and starts. Who may
 * do each act is unchanged: only whom the sentence names.
 *
 * Brightmoor's seeded seats are paused here, all but its Owner, and the
 * three roles are seated on the same domain.
 */
const D = '@demo.etyme.local'
const AP = `world-brightmoor-walk-ap${D}`
const AM = `world-brightmoor-walk-am${D}`
const HR = `world-brightmoor-walk-hr${D}`

describe('a firm seated with an Owner, HR, an Account Manager and AP & Payroll', () => {
  let weekId = ''
  let engagementId = ''
  let period = { periodStart: '', periodEnd: '' }
  let draftId = ''
  let startedId = ''

  beforeAll(async () => {
    await freshWorld()
    const co = await prisma.company.findFirstOrThrow({ where: { slug: 'world-brightmoor' } })
    const owner = await prisma.person.findFirstOrThrow({ where: { primaryEmail: `world-brightmoor${D}` } })
    // Everybody but the Owner is paused, so the firm holds four seats.
    await prisma.context.updateMany({
      where: { companyId: co.id, type: { not: 'CONSULTANT' }, personId: { not: owner.id }, suspendedAt: null },
      data: { suspendedAt: new Date() },
    })
    const shipped = rolesFor('VENDOR')
    for (const [email, name, roleName] of [[AP, 'Wren Callow', 'AP & Payroll'], [AM, 'Odile Brannock', 'Account Manager'], [HR, 'Tamsin Ure', 'HR']] as const) {
      const permissions = [...shipped.find((r) => r.name === roleName)!.permissions]
      const role = (await prisma.role.findFirst({ where: { companyId: co.id, name: roleName } }))
        ?? (await prisma.role.create({ data: { companyId: co.id, name: roleName, permissions } }))
      const p = await prisma.person.create({ data: { name, primaryEmail: email } })
      await prisma.context.create({ data: { personId: p.id, companyId: co.id, roleId: role.id, type: 'EMPLOYEE', grantReason: 'Walk' } })
    }
    const rosa = await prisma.person.findFirstOrThrow({ where: { name: 'Rosa Delgado' } })
    const week = await prisma.timesheet.findFirstOrThrow({
      where: { personId: rosa.id, sellContract: { companyId: co.id }, invoiceLines: { none: {} }, assertions: { some: { role: 'CLIENT_APPROVAL', state: 'LIVE' } } },
      orderBy: { periodStart: 'asc' },
      select: { id: true, periodStart: true, periodEnd: true, sellContract: { select: { engagementId: true } } },
    })
    weekId = week.id
    engagementId = week.sellContract!.engagementId!
    period = { periodStart: week.periodStart.toISOString().slice(0, 10), periodEnd: week.periodEnd.toISOString().slice(0, 10) }
    const line = await prisma.sellContract.findFirstOrThrow({ where: { companyId: co.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
    draftId = (await prisma.sellContract.create({
      data: {
        companyId: co.id, clientCompanyId: line.clientCompanyId, endClientCompanyId: line.endClientCompanyId,
        personId: line.personId, billRate: line.billRate, billCurrency: line.billCurrency,
        startDate: line.startDate, endDate: line.endDate, state: 'DRAFT',
      },
    })).id
    startedId = line.id
  }, 240_000)

  const weekSays = async (email: string) => {
    as(email)
    const r = await json(await weekSection(req('GET', `/api/contracts/weeks/${weekId}`), { params: Promise.resolve({ timesheetId: weekId }) }))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    return r.body.data
  }

  it('AP & Payroll reads on the week page the same sentence the Bills page gives it: ask the Owner', async () => {
    const week = await weekSays(AP)
    expect(week.mayBill).toBe(false)
    as(AP)
    const bills = await json(await generate(req('POST', '/api/invoices/generate', { engagementId, ...period })))
    expect(bills.status).toBe(403)
    expect(week.says).toBe('Raising a bill is for the Owner here. Ask them.')
    expect(week.says).toBe(bills.body.error.message)
  })

  it('the week page never names Accounts Receivable, Finance or Admin at a firm that seats none of them', async () => {
    for (const email of [AP, AM, HR]) {
      const week = await weekSays(email)
      expect(week.says).not.toMatch(/Accounts Receivable|Finance|Admin/)
    }
  })

  it('the Account Manager and AP & Payroll read that starting a placement is for the Owner here, before and after the press', async () => {
    for (const email of [AM, AP]) {
      as(email)
      const before = await json(await preflight(req('GET', `/api/contracts/${draftId}/activate`), { params: Promise.resolve({ id: draftId }) }))
      expect(before.body.data).toMatchObject({ may: false, code: 'FORBIDDEN', says: 'Starting a placement is for the Owner here. Ask them.' })
      as(email)
      const pressed = await json(await activate(req('POST', `/api/contracts/${draftId}/activate`, { action: 'activate' }), { params: Promise.resolve({ id: draftId }) }))
      expect(pressed.status).toBe(403)
      expect(pressed.body.error.message).toBe('Starting a placement is for the Owner here. Ask them.')
      expect(pressed.body.error.message).not.toMatch(/Resource Manager|Contract Manager/)
    }
  })

  it('every act the placement door refuses names the Owner at this firm: pause, resume, end, cancel and verify', async () => {
    const said: Record<string, string> = {
      verify: 'Sending a placement for verification is for the Owner here. Ask them.',
      pause: 'Pausing a placement is for the Owner here. Ask them.',
      resume: 'Resuming a placement is for the Owner here. Ask them.',
      complete: 'Ending a placement is for the Owner here. Ask them.',
      cancel: 'Canceling a placement before it starts is for the Owner here. Ask them.',
    }
    for (const [action, says] of Object.entries(said)) {
      as(AM)
      const id = action === 'pause' || action === 'complete' || action === 'resume' ? startedId : draftId
      const r = await json(await activate(req('POST', `/api/contracts/${id}/activate`, { action }), { params: Promise.resolve({ id }) }))
      expect(r.status, `${action}: ${JSON.stringify(r.body)}`).toBe(403)
      expect(r.body.error.message).toBe(says)
    }
  })

  it('after Send, the answer names the bill’s state in the word its page and the Bills list read: Sent, not yet paid', async () => {
    as(`world-brightmoor${D}`)
    const raised = await json(await generate(req('POST', '/api/invoices/generate', { engagementId, ...period })))
    expect(raised.status, JSON.stringify(raised.body)).toBe(201)
    const id = raised.body.data.invoice?.id ?? raised.body.data.invoices?.[0]?.id
    as(`world-brightmoor${D}`)
    const sent = await json(await sendBill(req('POST', `/api/invoices/${id}/submit`, {}), { params: Promise.resolve({ id }) }))
    expect(sent.status, JSON.stringify(sent.body)).toBe(200)
    const number = sent.body.data.invoice.number
    expect(sent.body.data.message).toBe(`Bill ${number}: Sent, not yet paid`)
    expect(sent.body.data.message).not.toMatch(/client review|submitted/)
    as(`world-brightmoor${D}`)
    const list = await json(await billList(req('GET', `/api/invoices?limit=50&engagementId=${engagementId}`)))
    const row = list.body.data.invoices.find((r: any) => r.id === id)
    expect(row?.status).toBe('SUBMITTED')
  })
})
