import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { matchInvoice } from '@/lib/invoice-match'
import { POST as generateInvoice } from '@/app/api/invoices/generate/route'

/**
 * Two money faults from the founder's lifecycle walk of 2026-09-28,
 * against a real database and the seeded world.
 *
 * **A bill asked for one week pulled three.** The generator loaded
 * every signed week touching the dates asked for, then billed each of
 * them against the contract's whole month. A week grazing the window by
 * a day was billed whole under a header reading the month, and a period
 * asked for as `from` and `to` was not read at all.
 *
 * **Helena Marsh at $145 against a $118 contract.** The seed is right:
 * Northbend Athletic pays Computer Systems $145, Computer Systems pays
 * CloudEPA $118, and her hours are filed once, on CloudEPA's line,
 * because CloudEPA employs her. The fault was in the three-way match,
 * which held every line to the rate of the contract the HOURS were on —
 * the rung underneath — whenever no opening rate-history row stood in
 * front of it. The seed writes one for every contract it makes, which is
 * why the seeded world never showed it; a placement made through the
 * product writes none.
 */

const D = '@demo.etyme.local'
const CSI = `world-computer-systems${D}`
const DAY = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)

const it_: Record<string, any> = {}

describe('Helena Marsh, billed through a chain, at the rate of the line that bills her', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()

    const lines = await prisma.sellContract.findMany({
      where: { person: { name: 'Helena Marsh' }, state: 'IN_PROGRESS' },
      select: {
        id: true, billRate: true, engagementId: true, personId: true, clientCompanyId: true,
        company: { select: { slug: true } },
      },
    })
    it_.top = lines.find((l) => l.company.slug === 'world-computer-systems')!
    it_.bottom = lines.find((l) => l.company.slug === 'world-cloudepa')!
  }, 240_000)

  it('the seed bills Northbend Athletic at $145 on Computer Systems’ line and files the hours on CloudEPA’s $118 line', () => {
    expect(it_.top.billRate).toBe(14_500)
    expect(it_.bottom.billRate).toBe(11_800)
  })

  it('every hours line in the seeded world carries the rate of the contract line it bills', async () => {
    const lines = await prisma.invoiceLine.findMany({
      where: { timesheetId: { not: null } },
      select: {
        rateCents: true,
        person: { select: { name: true } },
        sellContract: { select: { billRate: true } },
        timesheet: { select: { sellContract: { select: { billRate: true } } } },
      },
    })
    expect(lines.length).toBeGreaterThan(0)
    const wrong = lines.filter((l) => l.rateCents !== l.sellContract?.billRate)
    expect(wrong.map((l) => `${l.person?.name}: ${l.rateCents} on a ${l.sellContract?.billRate} line`)).toEqual([])

    // And the chain is really in there: lines whose rate is not the
    // rate of the rung the hours were filed on, and are right.
    const aboveTheHours = lines.filter((l) => l.rateCents !== l.timesheet?.sellContract.billRate)
    expect(aboveTheHours.length).toBeGreaterThan(0)
  })

  it('the three-way match holds a chain’s line to the rate of the contract it bills, not the rung the hours were filed on', async () => {
    // A placement made through the product has no opening rate-history
    // row; only the seed writes one. Take them away and the match has to
    // find the rate on the contract itself.
    await prisma.rateHistory.deleteMany({ where: { contractId: { in: [it_.top.id, it_.bottom.id] } } })

    const invoices = await prisma.invoice.findMany({
      where: { invoiceLines: { some: { sellContractId: it_.top.id, timesheetId: { not: null } } } },
      select: { id: true },
    })
    expect(invoices.length).toBeGreaterThan(0)
    for (const inv of invoices) {
      const m = await matchInvoice(inv.id)
      const price = m!.checks.find((c) => c.code === 'PRICE')!
      expect(price.outcome, price.reason).toBe('PASS')
    }
  })

  it('no seeded invoice fails on price once the opening rate rows are gone', async () => {
    await prisma.rateHistory.deleteMany({ where: { approvalState: 'APPROVED' } })
    const invoices = await prisma.invoice.findMany({ select: { id: true, number: true } })
    const failing: string[] = []
    for (const inv of invoices) {
      const m = await matchInvoice(inv.id)
      const price = m?.checks.find((c) => c.code === 'PRICE')
      if (price && price.outcome !== 'PASS') failing.push(`${inv.number}: ${price.reason}`)
    }
    expect(failing).toEqual([])
  })
})

describe('a bill asked for one week bills that week', () => {
  beforeAll(async () => {
    // Three signed weeks on Helena's line, Monday to Friday, in one
    // calendar month two months from now — clear of every seeded week,
    // inside her contract, and the same shape whatever day this runs.
    const ahead = new Date(Date.now() + 60 * DAY)
    const first = new Date(Date.UTC(ahead.getUTCFullYear(), ahead.getUTCMonth(), 1))
    const monday = new Date(first.getTime() + (((8 - first.getUTCDay()) % 7) * DAY))
    const signer = await prisma.person.findFirstOrThrow({ where: { name: 'Marcus Oyelaran' }, select: { id: true } })

    it_.weeks = []
    for (let w = 0; w < 3; w++) {
      const start = new Date(monday.getTime() + w * 7 * DAY)
      const days: Record<string, number> = {}
      for (let d = 0; d < 5; d++) days[iso(new Date(start.getTime() + d * DAY))] = 8
      const ts = await prisma.timesheet.create({
        data: {
          sellContractId: it_.bottom.id, personId: it_.bottom.personId,
          periodStart: start, periodEnd: new Date(start.getTime() + 6 * DAY),
          days, totalHours: 40, status: 'APPROVED', submittedAt: start, approvedAt: start,
        },
      })
      await prisma.workAssertion.create({
        data: {
          timesheetId: ts.id, companyId: it_.top.clientCompanyId, role: 'CLIENT_APPROVAL',
          hours: 40, rateCents: it_.top.billRate, state: 'LIVE', byId: signer.id,
        },
      })
      it_.weeks.push({ id: ts.id, start })
    }
    it_.monthLabel = first.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })
  }, 60_000)

  const billedBy = async (sheetId: string) =>
    prisma.invoiceLine.findMany({ where: { timesheetId: sheetId, sellContractId: it_.top.id } })

  it('a period asked for as from and to is refused rather than billing every signed week', async () => {
    as(CSI)
    const [, w2] = it_.weeks
    const r = await json(await generateInvoice(req('POST', '/api/invoices/generate', {
      engagementId: it_.top.engagementId, from: iso(w2.start), to: iso(new Date(w2.start.getTime() + 6 * DAY)),
    })))
    expect(r.status).toBe(422)
    expect(r.body.error.message).toContain('periodStart')
    for (const w of it_.weeks) expect(await billedBy(w.id)).toHaveLength(0)
  })

  it('an invoice generated for one week bills only that week’s hours, even when the dates asked for touch the next week by a day', async () => {
    as(CSI)
    const [w1, w2, w3] = it_.weeks
    // Monday to the following Monday: the founder's "one week", which
    // touches the third week on its first day.
    const r = await json(await generateInvoice(req('POST', '/api/invoices/generate', {
      engagementId: it_.top.engagementId, periodStart: iso(w2.start), periodEnd: iso(w3.start),
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.invoiceId = r.body.data.invoice.id

    const lines = await prisma.invoiceLine.findMany({ where: { invoiceId: it_.invoiceId } })
    expect(lines.map((l) => l.timesheetId)).toEqual([w2.id])
    expect(Number(lines[0].hours)).toBe(40)
    expect(lines[0].rateCents).toBe(14_500)
    expect(lines[0].amountCents).toBe(580_000)
    expect(Number(r.body.data.invoice.total)).toBe(5_800)

    expect(await billedBy(w1.id)).toHaveLength(0)
    expect(await billedBy(w3.id)).toHaveLength(0)
  })

  it('the invoice says the dates it billed, as part of the month, not the whole month around them', async () => {
    const [, w2, w3] = it_.weeks
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: it_.invoiceId } })
    expect(iso(inv.periodStart)).toBe(iso(w2.start))
    expect(iso(inv.periodEnd)).toBe(iso(w3.start))

    // And the match reads it as a part-period bill of the month, which
    // is a thing it accepts, rather than a period the contract lacks.
    const m = await matchInvoice(it_.invoiceId)
    const period = m!.checks.find((c) => c.code === 'CONTRACT_PERIOD')
    if (period) {
      expect(period.outcome, period.reason).toBe('PASS')
      expect(period.reason).toContain(it_.monthLabel)
    }
    expect(m!.checks.find((c) => c.code === 'PRICE')!.outcome).toBe('PASS')
  })

  it('the weeks either side stay unbilled and go on the next bill for the month', async () => {
    as(CSI)
    const [w1, w2, w3] = it_.weeks
    const r = await json(await generateInvoice(req('POST', '/api/invoices/generate', {
      engagementId: it_.top.engagementId,
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const lines = await prisma.invoiceLine.findMany({ where: { invoiceId: r.body.data.invoice.id } })
    expect(lines.map((l) => l.timesheetId).sort()).toEqual([w1.id, w3.id].sort())
    expect(lines.every((l) => l.rateCents === 14_500)).toBe(true)
    // Nothing billed twice.
    expect(await billedBy(w2.id)).toHaveLength(1)
  })

  it('a bill asked for dates holding nothing unbilled says so in a sentence', async () => {
    as(CSI)
    const [, w2] = it_.weeks
    const r = await json(await generateInvoice(req('POST', '/api/invoices/generate', {
      engagementId: it_.top.engagementId, periodStart: iso(w2.start), periodEnd: iso(new Date(w2.start.getTime() + 6 * DAY)),
    })))
    expect(r.status).toBe(422)
    expect(r.body.error.message).not.toMatch(/^[A-Z_]+$/)
  })
})
