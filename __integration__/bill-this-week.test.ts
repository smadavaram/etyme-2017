import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as section, POST as billIt } from '@/app/api/invoices/week/[timesheetId]/route'

/**
 * "Bill this week" on the seeded world. Rosa Delgado's signed week of
 * Mar 29 at Brightmoor, never billed: Imelda Santoro, Brightmoor's
 * Accounts Receivable, drafts it from the week. Helena Marsh's Oct 4–10
 * week: Computer Systems has sent its bill, and Techpeple's own bill for
 * it is already an invoice receipt at Computer Systems, so it is offered
 * no second bill.
 */
describe('an approved week’s page and its bill', () => {
  let rosaWeek = ''
  let helenaWeek = ''
  let imelda = ''
  const OWNER = 'world-brightmoor@demo.etyme.local'
  const at = (id: string) => ({ params: Promise.resolve({ timesheetId: id }) })
  const read = async (id: string) => json(await section(req('GET', `/api/invoices/week/${id}`), at(id)))

  beforeAll(async () => {
    await freshWorld()
    const rosa = await prisma.person.findFirstOrThrow({ where: { name: 'Rosa Delgado' } })
    const brightmoor = await prisma.company.findFirstOrThrow({ where: { slug: 'world-brightmoor' } })
    rosaWeek = (await prisma.timesheet.findFirstOrThrow({
      where: { personId: rosa.id, sellContract: { companyId: brightmoor.id }, invoiceLines: { none: {} }, assertions: { some: { role: 'CLIENT_APPROVAL', state: 'LIVE' } } },
      orderBy: { periodStart: 'asc' },
    })).id
    const helena = await prisma.person.findFirstOrThrow({ where: { name: 'Helena Marsh' } })
    helenaWeek = (await prisma.timesheet.findFirstOrThrow({ where: { personId: helena.id, periodStart: new Date('2026-10-04T00:00:00Z') } })).id
    imelda = (await prisma.person.findFirstOrThrow({ where: { name: 'Imelda Santoro' } })).primaryEmail!
  }, 180_000)

  it('an approved week’s page offers Bill this week to the seat that bills, and says the bill’s state after', async () => {
    as(imelda)
    const before = await read(rosaWeek)
    expect(before.body.data, JSON.stringify(before.body)).toMatchObject({ approved: true, bill: null, mayBill: true, says: null })

    as(imelda)
    const r = await json(await billIt(req('POST', `/api/invoices/week/${rosaWeek}`), at(rosaWeek)))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.week.mayBill).toBe(false)
    expect(r.body.data.week.bill.status).toBe('DRAFT')
    expect(r.body.data.week.bill.says).toMatch(/^On bill .+, drafted and not sent yet\.$/)
    // The draft bills that one week and nothing else.
    const lines = await prisma.invoiceLine.findMany({ where: { invoiceId: r.body.data.week.bill.invoiceId } })
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.every((l) => l.timesheetId === rosaWeek)).toBe(true)

    as(imelda)
    const again = await json(await billIt(req('POST', `/api/invoices/week/${rosaWeek}`), at(rosaWeek)))
    expect(again.status).toBe(409)
    expect(again.body.error.message).toMatch(/drafted and not sent yet/)
  })

  it('the Owner is not offered the button where Accounts Receivable bills, and is told who does', async () => {
    const rosa = await prisma.person.findFirstOrThrow({ where: { name: 'Rosa Delgado' } })
    const next = await prisma.timesheet.findFirstOrThrow({
      where: { personId: rosa.id, invoiceLines: { none: {} }, assertions: { some: { role: 'CLIENT_APPROVAL', state: 'LIVE' } } },
      orderBy: { periodStart: 'asc' },
    })
    as(OWNER)
    const r = await read(next.id)
    expect(r.body.data.mayBill).toBe(false)
    expect(r.body.data.says).toMatch(/Imelda Santoro/)
    expect(r.body.data.says).toMatch(/bills this week\.$/)
    as(OWNER)
    expect((await json(await billIt(req('POST', `/api/invoices/week/${next.id}`), at(next.id)))).status).toBe(403)
  })

  it('a week the firm above already holds from this firm is offered no second bill, and each rung reads its own bill', async () => {
    as('world-techpeple@demo.etyme.local')
    const tp = await read(helenaWeek)
    expect(tp.body.data.mayBill).toBe(false)
    expect(tp.body.data.says).toMatch(/already on invoice .+, which Computer Systems Inc recorded from you, so it is not billed again\.$/)

    as('world-computer-systems@demo.etyme.local')
    const csi = await read(helenaWeek)
    expect(csi.body.data.bill.says).toMatch(/^On bill IN-\S+, sent and not yet paid\.$/)
    expect(csi.body.data.mayBill).toBe(false)
  })
})
