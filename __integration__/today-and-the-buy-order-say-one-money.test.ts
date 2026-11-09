import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as today } from '@/app/api/today/route'
import { POST as generate } from '@/app/api/invoices/generate/route'
import { GET as openPlacement } from '@/app/api/placements/[id]/route'
import { GET as ordersRoute } from '@/app/api/purchase-orders/route'
import { signedAndBilled } from '@/lib/money/signed-unbilled'
import { orderLedgers } from '@/lib/money/order-ledger'
import { minorFromWhole } from '@/lib/money'

/**
 * Walk 9, items 3 and 6 (2026-11-09). Today read a draft as the sum of its
 * weeks' hours ($21,504 for a $22,080 bill with a $576 expense line) and
 * signed-and-not-billed without the expenses; Computer Systems' placement
 * read its buy order as "Billed —, Left —" while its PO page said $451,400
 * left. Every row is found by its facts.
 */

const D = '@demo.etyme.local'
const BRIGHTMOOR_AR = `world-brightmoor-ar${D}`
const CSI = `world-computer-systems${D}`

describe('Today says each draft’s own bill and the line reader’s signed-and-not-billed', () => {
  let brightmoor = ''
  let rosaLine = { id: '', engagementId: '' }

  beforeAll(async () => {
    await freshWorld()
    brightmoor = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })).id
    const rosa = await prisma.person.findFirstOrThrow({ where: { name: 'Rosa Delgado' }, select: { id: true } })
    const line = await prisma.sellContract.findFirstOrThrow({
      where: { companyId: brightmoor, personId: rosa.id },
      orderBy: { startDate: 'asc' },
      select: { id: true, engagementId: true },
    })
    rosaLine = { id: line.id, engagementId: line.engagementId! }
  }, 600_000)

  async function todayAs(email: string) {
    as(email)
    const r = await json(await today(req('GET', '/api/today')))
    expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBe(200)
    return r.body.data
  }

  it('Today’s signed-and-not-billed equals the line reader’s, expenses included', async () => {
    const own = await prisma.sellContract.findMany({ where: { companyId: brightmoor }, select: { id: true } })
    const lines = await signedAndBilled(own.map((l) => l.id))
    const want = new Map<string, number>()
    for (const l of lines.values()) want.set(l.currency, (want.get(l.currency) ?? 0) + l.notBilled.amountMinor)
    const t = await todayAs(BRIGHTMOOR_AR)
    for (const total of t.signed.totals as { currency: string; amountMinor: number }[]) {
      expect(total.amountMinor, total.currency).toBe(want.get(total.currency) ?? 0)
    }
    // Rosa's line carries an expense the weeks alone leave out.
    expect(lines.get(rosaLine.id)!.notBilled.expenseMinor).toBeGreaterThan(0)
  })

  it('Today’s draft amount equals the draft bill’s own total, expenses included', async () => {
    const lb = (await signedAndBilled([rosaLine.id])).get(rosaLine.id)!
    const weeks = lb.notBilled.weeks
    expect(weeks.length).toBeGreaterThan(0)
    // The bill for the month her first accepted billable expense falls in:
    // the generator bills one period at a time, and that month carries
    // both her signed weeks and the expense.
    const expense = await prisma.expense.findFirstOrThrow({
      where: { sellContractId: rosaLine.id, billable: true, invoiceId: null, status: 'APPROVED' },
      orderBy: { periodStart: 'asc' },
      select: { periodStart: true },
    })
    const y = expense.periodStart.getUTCFullYear()
    const m = expense.periodStart.getUTCMonth()
    const day = (d: Date) => d.toISOString().slice(0, 10)
    as(BRIGHTMOOR_AR)
    const made = await json(await generate(req('POST', '/api/invoices/generate', {
      engagementId: rosaLine.engagementId,
      periodStart: day(new Date(Date.UTC(y, m, 1))),
      periodEnd: day(new Date(Date.UTC(y, m + 1, 0))),
    })))
    expect(made.status, JSON.stringify(made.body).slice(0, 400)).toBe(201)
    const draft = await prisma.invoice.findUniqueOrThrow({
      where: { id: made.body.data.invoice.id as string },
      select: { id: true, total: true, currency: true, invoiceLines: { select: { timesheetId: true, amountCents: true } } },
    })
    const totalMinor = minorFromWhole(draft.total, draft.currency)
    const hoursOnly = draft.invoiceLines.filter((l) => l.timesheetId).reduce((n, l) => n + l.amountCents, 0)
    expect(totalMinor, 'the draft carries an expense line beside its hours').toBeGreaterThan(hoursOnly)

    const t = await todayAs(BRIGHTMOOR_AR)
    const drafts = (t.signed.byClient as { drafts: { invoiceId: string; amountMinor: number | null; weeks: number }[] }[]).flatMap((g) => g.drafts)
    const shown = drafts.find((d) => d.invoiceId === draft.id)!
    expect(shown, 'Today lists the draft').toBeTruthy()
    expect(shown.amountMinor).toBe(totalMinor)
    expect(shown.weeks).toBe(new Set(draft.invoiceLines.map((l) => l.timesheetId).filter(Boolean)).size)
  })
})

describe('the buy-side order on the placement reads the order ledger', () => {
  beforeAll(async () => { await freshWorld() }, 600_000)

  it('the buy-side order’s Billed and Left on the placement equal its PO page', async () => {
    const csi = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-computer-systems' }, select: { id: true } })
    // A Computer Systems line it pays a firm below by an order it raised.
    const buy = await prisma.buyContract.findFirstOrThrow({
      where: { companyId: csi.id, workOrderId: { not: null }, workOrder: { issuedById: csi.id }, sellLinks: { some: {} } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { workOrderId: true, sellLinks: { select: { sellContractId: true } } },
    })
    const orderId = buy.workOrderId!
    const ledger = (await orderLedgers([orderId])).get(orderId)!

    as(CSI)
    const id = buy.sellLinks[0].sellContractId
    const r = await json(await openPlacement(req('GET', `/api/placements/${id}`), { params: Promise.resolve({ id }) }))
    expect(r.status).toBe(200)
    const o = r.body.data.contracts.buy.document.order
    expect(o.billedMinor).toBe(ledger.billedMinor)
    expect(o.leftMinor).toBe(ledger.leftMinor)

    const po = await json(await ordersRoute(req('GET', '/api/purchase-orders')))
    const row = (po.body.data.orders as { id: string; currency: string; remaining: number; invoiced: number }[]).find((x) => x.id === orderId)!
    expect(row, 'the PO page lists the order').toBeTruthy()
    const per = (c: string) => (['VND', 'JPY'].includes(c.toUpperCase()) ? 1 : 100)
    expect(Math.round(row.remaining * per(row.currency))).toBe(o.leftMinor)
    expect(Math.round(row.invoiced * per(row.currency))).toBe(o.billedMinor)
  })
})
