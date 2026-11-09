import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as openPlacement } from '@/app/api/placements/[id]/route'
import { orderLedgers } from '@/lib/money/order-ledger'
import { signedAndBilled } from '@/lib/money/signed-unbilled'
import { weeksWhere } from '@/lib/money/weeks-read'

/**
 * The placement page reads money's one definition (the tester's scale
 * audit, 2026-11-09; lib/money/order-ledger and lib/money/signed-unbilled,
 * a9594c4cd). Until this day it summed every invoice on the order, drafts
 * included, and the last twelve invoice lines of the line, and it cut the
 * weeks at twelve. Every row is found by its facts, never a generated
 * number or a calendar day.
 */

const D = '@demo.etyme.local'
const SEATS_AT_THE_CLIENT = [`world-nike-ap${D}`, `world-nike-programme${D}`]
const SEATS_AT_THE_SUPPLIER = [`world-brightmoor-ar${D}`, `world-brightmoor${D}`]

/** The first supplier seat whose page reads money on this line. */
async function supplierReadingMoney(id: string): Promise<string> {
  const brightmoor = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
  const seats = await prisma.context.findMany({
    where: { companyId: brightmoor.id, revokedAt: null, person: { primaryEmail: { endsWith: D } } },
    select: { person: { select: { primaryEmail: true } } },
    orderBy: { grantedAt: 'asc' },
  })
  for (const s of seats) {
    const r = await open(s.person.primaryEmail, id)
    if (r.status === 200 && r.body.data.money?.billedMinor != null) return s.person.primaryEmail
  }
  throw new Error('No Brightmoor seat reads money on this line.')
}

async function open(email: string, id: string) {
  as(email)
  const r = await json(await openPlacement(req('GET', `/api/placements/${id}`), { params: Promise.resolve({ id }) }))
  return r
}

describe('the placement page says the order ledger’s figures and the line’s, in every seat', () => {
  let lineId = ''
  let orderId = ''

  beforeAll(async () => {
    await freshWorld()
    const [nike, brightmoor] = await Promise.all([
      prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' }, select: { id: true } }),
      prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } }),
    ])
    // A Brightmoor line billing Northbend, on an order, with a bill on it.
    const line = await prisma.sellContract.findFirstOrThrow({
      where: { companyId: brightmoor.id, clientCompanyId: nike.id, workOrderId: { not: null }, invoiceLines: { some: {} } },
      orderBy: { startDate: 'asc' },
      select: { id: true, workOrderId: true },
    })
    lineId = line.id
    orderId = line.workOrderId!
  }, 600_000)

  it('the placement page’s Authorized, Billed and Left equal the order ledger’s in every seat that reads money', async () => {
    const ledger = (await orderLedgers([orderId])).get(orderId)!
    expect(ledger.leftMinor).toBe(ledger.authorizedMinor - ledger.billedMinor)
    let read = 0
    for (const email of [...SEATS_AT_THE_CLIENT, ...SEATS_AT_THE_SUPPLIER]) {
      const r = await open(email, lineId)
      expect(r.status, `${email}: ${JSON.stringify(r.body).slice(0, 300)}`).toBe(200)
      const o = r.body.data.contracts.sell.document?.order
      if (!o || o.authorizedMinor == null) continue // a seat that does not read money
      read++
      expect(o, email).toMatchObject({
        authorizedMinor: ledger.authorizedMinor,
        billedMinor: ledger.billedMinor,
        leftMinor: ledger.leftMinor,
        draftedNotSentMinor: ledger.draftedNotSentMinor,
        draftedNotSent: ledger.draftedNotSent,
      })
    }
    expect(read).toBeGreaterThan(1)
  })

  it('a bill drafted and not sent is never inside Billed on the placement page; it is its own figure', async () => {
    // Draft a bill on the order: a copy of one of its sent bills, left as a draft.
    const sent = await prisma.invoice.findFirstOrThrow({ orderBy: { id: 'asc' }, where: { workOrderId: orderId }, select: { engagementId: true, currency: true, periodStart: true, periodEnd: true } })
    const before = (await orderLedgers([orderId])).get(orderId)!
    await prisma.invoice.create({
      data: {
        engagementId: sent.engagementId, workOrderId: orderId,
        number: `DRAFT-ONE-MONEY-${orderId.slice(-6)}`, status: 'DRAFT', currency: sent.currency,
        periodStart: sent.periodStart, periodEnd: sent.periodEnd, total: 1234, dueAt: new Date(),
      },
    })
    const after = (await orderLedgers([orderId])).get(orderId)!
    expect(after.billedMinor).toBe(before.billedMinor)
    expect(after.draftedNotSent).toBe(before.draftedNotSent + 1)
    const r = await open(await supplierReadingMoney(lineId), lineId)
    const o = r.body.data.contracts.sell.document.order
    expect(o.billedMinor).toBe(before.billedMinor)
    expect(o.leftMinor).toBe(before.leftMinor)
    expect(o.draftedNotSentMinor).toBe(after.draftedNotSentMinor)
  })

  it('the money card’s Billed, billed past signed hours, drafted and signed-not-billed are the line reader’s, over every invoice line, not the newest twelve, and Signed equals Billed less billed past signed plus signed not billed', async () => {
    const lb = (await signedAndBilled([lineId])).get(lineId)!
    const r = await open(await supplierReadingMoney(lineId), lineId)
    const m = r.body.data.money
    expect(m.billedMinor).toBe(lb.billed.amountMinor)
    expect(m.hoursBilledSent).toBe(lb.billed.hours)
    expect(m.drafted.amountMinor).toBe(lb.drafted.amountMinor)
    expect(m.signedNotBilled.amountMinor).toBe(lb.notBilled.amountMinor)
    expect(m.signedNotBilled.hours).toBe(lb.notBilled.hours)
    // Billed past signed hours is its own figure, and the page's figures
    // reconcile: Signed = Billed − billed past signed + signed not billed.
    expect(m.billedOverSigned.amountMinor).toBe(lb.billedOverSigned.amountMinor)
    expect(m.signedMinor).toBe(lb.signed.amountMinor)
    if (m.signedMinor != null) {
      expect(m.signedMinor).toBe(m.billedMinor - m.billedOverSigned.amountMinor + m.signedNotBilled.amountMinor)
    }
    // Accepted hours and billed hours are two labeled figures, and the
    // supplier's revenue on accepted hours sits beside Billed, never in it.
    expect(typeof m.hoursAcceptedTotal).toBe('number')
    expect('revenueMinor' in m).toBe(true)
    const lines = await prisma.invoiceLine.count({ where: { sellContractId: lineId } })
    const listed = (m.invoices as { weeks: number }[]).reduce((n, i) => n + i.weeks, 0)
    expect(listed).toBe(lines)
  })

  it('the Accounts Receivable seat that bills the line reads what it billed on the placement page, and still no pay rate, cost or margin', async () => {
    const lb = (await signedAndBilled([lineId])).get(lineId)!
    const ledger = (await orderLedgers([orderId])).get(orderId)!
    const r = await open(SEATS_AT_THE_SUPPLIER[0], lineId)
    expect(r.status).toBe(200)
    expect(r.body.data.money.billedMinor).toBe(lb.billed.amountMinor)
    expect(r.body.data.contracts.sell.document.order.billedMinor).toBe(ledger.billedMinor)
    expect(r.body.data.money.cost).toBeNull()
    expect(r.body.data.money.margin).toBeNull()
    expect(r.body.data.contracts.buy?.payRate ?? null).toBeNull()
  })

  it('every week filed is on the page, and the page says how many: Rosa Delgado’s are not cut at twelve', async () => {
    const rosa = await prisma.person.findFirstOrThrow({ where: { name: 'Rosa Delgado' }, select: { id: true } })
    const lines = await prisma.sellContract.findMany({ where: { personId: rosa.id }, select: { id: true, companyId: true } })
    let checked = 0
    for (const l of lines) {
      const filed = await prisma.timesheet.count({ where: await weeksWhere([l.id]) })
      if (filed <= 12) continue
      const owner = await prisma.context.findFirst({
        where: { companyId: l.companyId, revokedAt: null, person: { primaryEmail: { endsWith: D } }, role: { name: 'Owner' } },
        select: { person: { select: { primaryEmail: true } } },
      })
      if (!owner) continue
      const r = await open(owner.person.primaryEmail, l.id)
      expect(r.status).toBe(200)
      expect(r.body.data.weeksFiled).toBe(filed)
      expect(r.body.data.timesheets).toHaveLength(filed)
      checked++
    }
    expect(checked).toBeGreaterThan(0)
  })
})
