import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, freshWorld, prisma } from './harness'
import { GET as profitability } from '@/app/api/profitability/route'
import { POST as rebuild } from '@/app/api/profitability/rebuild/route'
import { GET as payroll } from '@/app/api/payroll/route'
import { GET as contracts } from '@/app/api/contracts/route'
import { GET as invoice } from '@/app/api/invoices/[id]/route'
import { GET as placement } from '@/app/api/placements/[id]/route'
import { rebuildPostings } from '@/lib/order-postings'
import { placementBooks } from '@/lib/money/margin'

/**
 * Every money posting lands on one rung, at that rung's own rate — on the
 * seeded world, through the screens.
 *
 * Helena Marsh works at Northbend Athletic, sold by Computer Systems at
 * $145, bought from Techpeple at $118, employed by Techpeple at $90. Priya
 * Raman is the same chain at Harlow Health: $138 / $112 / $86. Daniel Osei
 * is Computer Systems' own W2 at Harlow: $115 billed, $84 paid.
 *
 * The outside audit of 2026-10-05 read, on these three: Techpeple's profit
 * at $29,000 billed — Helena's hours at Computer Systems' $145; Computer
 * Systems' profit with Helena and Priya missing; and Daniel costing about
 * $140 an hour on an $84 pay rate. The last was the seed writing his bill
 * rate onto his employer's acceptance and the books trusting it: $115 plus
 * 22% burden is $140.30. No posting reads that column now.
 */

const OWNER = {
  northbend: 'world-nike@demo.etyme.local',
  cs: 'world-computer-systems@demo.etyme.local',
  techpeple: 'world-techpeple@demo.etyme.local',
}
const co: Record<string, string> = {}
const line: Record<string, string> = {}

const ask = async (email: string, query: string) => {
  as(email)
  return json(await profitability(req('GET', `/api/profitability?${query}`)))
}

beforeAll(async () => {
  await freshWorld()
  for (const [k, slug] of [['northbend', 'world-nike'], ['cs', 'world-computer-systems'], ['techpeple', 'world-techpeple']]) {
    co[k] = (await prisma.company.findUniqueOrThrow({ where: { slug } })).id
  }
  const sell = async (person: string, companyId: string) =>
    (await prisma.sellContract.findFirstOrThrow({ where: { person: { name: person }, companyId }, select: { id: true } })).id
  line.helenaCs = await sell('Helena Marsh', co.cs)
  line.helenaTp = await sell('Helena Marsh', co.techpeple)
  line.priyaCs = await sell('Priya Raman', co.cs)
  line.priyaTp = await sell('Priya Raman', co.techpeple)
  line.daniel = await sell('Daniel Osei', co.cs)
}, 600_000)

const postedFor = async (companyId: string, person: string) => {
  const rows = await prisma.orderPosting.groupBy({
    by: ['kind'],
    where: { companyId, person: { name: person }, source: 'TIMESHEET' },
    _sum: { amountCents: true },
  })
  return Object.fromEntries(rows.map((r) => [r.kind, r._sum.amountCents ?? 0]))
}
const signedHours = async (companyId: string, role: string, person: string) => {
  const rows = await prisma.workAssertion.findMany({
    where: { companyId, role, state: 'LIVE', timesheet: { person: { name: person } } },
    select: { hours: true },
  })
  return rows.reduce((n, r) => n + Number(r.hours), 0)
}

describe('the seeded world is booked rung by rung', () => {
  it('a freshly seeded world already matches what a rebuild would write, so rebuilding changes nothing', async () => {
    const first = await rebuildPostings()
    expect(first.checked).toBeGreaterThan(0)
    expect(first.rebuilt, JSON.stringify(first.leftAlone.slice(0, 3))).toBe(0)
  })

  it('Techpeple’s earned margin on Helena Marsh is on its own $118, never Computer Systems’ $145', async () => {
    const hours = await signedHours(co.cs, 'PASS_THROUGH', 'Helena Marsh')
    expect(hours).toBeGreaterThan(0)
    const books = await postedFor(co.techpeple, 'Helena Marsh')
    expect(books.REVENUE).toBe(Math.round(hours * 11_800))
    expect(books.PAY).toBe(-Math.round(hours * 9_000))

    const { status, body } = await ask(OWNER.techpeple, 'by=contract')
    expect(status).toBe(200)
    const row = body.data.rows.find((r: any) => r.contractId === line.helenaTp)
    expect(row.earned.revenueCents).toBe(Math.round(hours * 11_800))
    expect(row.agreed.billRateCents).toBe(11_800)
    expect(JSON.stringify(body.data)).not.toContain('14500')
  })

  it('Computer Systems’ profit lists Helena and Priya, whom it buys in, with their spread', async () => {
    const { body } = await ask(OWNER.cs, 'by=contract')
    const helena = body.data.rows.find((r: any) => r.contractId === line.helenaCs)
    const priya = body.data.rows.find((r: any) => r.contractId === line.priyaCs)
    expect(helena.person.name).toBe('Helena Marsh')
    expect(priya.person.name).toBe('Priya Raman')
    // $145 − $118 on $145, and $138 − $112 on $138.
    expect(helena.agreed.pct).toBe(18.6)
    expect(priya.agreed.pct).toBe(18.8)
    expect(helena.vendorName).toBe('Techpeple')
    const hours = await signedHours(co.northbend, 'CLIENT_APPROVAL', 'Helena Marsh')
    expect(helena.earned.revenueCents).toBe(Math.round(hours * 14_500))
    expect(helena.earned.costCents).toBe(Math.round((await signedHours(co.cs, 'PASS_THROUGH', 'Helena Marsh')) * 11_800))

    const books = await postedFor(co.cs, 'Helena Marsh')
    expect(books.REVENUE).toBe(Math.round(hours * 14_500))
    expect(books.PAY).toBe(-Math.round((await signedHours(co.cs, 'PASS_THROUGH', 'Helena Marsh')) * 11_800))
    expect(books.BURDEN ?? 0).toBe(0)
  })

  it('Daniel Osei’s cost on the books is his $84 pay and the burden on it, never his $115 bill rate', async () => {
    const hours = await signedHours(co.cs, 'EMPLOYER_ACCEPTANCE', 'Daniel Osei')
    expect(hours).toBeGreaterThan(0)
    const books = await postedFor(co.cs, 'Daniel Osei')
    expect(books.PAY).toBe(-Math.round(hours * 8_400))
    expect(books.BURDEN).toBe(-Math.round(Math.round(40 * 8_400) * 0.22) * (hours / 40))
    // Not $140.30 an hour: pay plus burden is $102.48.
    expect(-(books.PAY + books.BURDEN) / hours).toBeCloseTo(102.48 * 100, 0)
  })
})

describe('one margin, on every screen that shows one', () => {
  it('the profitability page, the reports page, the payroll margin column and the placement page agree to the cent', async () => {
    // Profitability, by contract.
    const { body: byContract } = await ask(OWNER.cs, 'by=contract')
    const daniel = byContract.data.rows.find((r: any) => r.contractId === line.daniel)

    // Reports reads `by=book` — the same agreed spread across the book.
    const { body: byBook } = await ask(OWNER.cs, 'by=book')
    expect(byBook.data.agreed.pct).toBe(byContract.data.agreed.pct)
    expect(byBook.data.earned).toEqual(byContract.data.earned)
    expect(byBook.data.billing).toEqual(byContract.data.billing)

    // Payroll, its spread column, read from the same service.
    as(OWNER.cs)
    const pay = await json(await payroll(req('GET', `/api/payroll?companyId=${co.cs}`)))
    expect(pay.status).toBe(200)
    const row = pay.body.data.payItems.find((p: any) => p.person.name === 'Daniel Osei')
    expect(pay.body.data.spreadLabel).toBe('Agreed spread')
    expect(row.agreed.pct).toBe(daniel.agreed.pct)
    expect(row.agreed.pct).toBe(27)

    // The placement page prices the same weeks through the same reader.
    as(OWNER.cs)
    const page = await json(await placement(req('GET', `/api/placements/${line.daniel}`), { params: Promise.resolve({ id: line.daniel }) } as any))
    expect(page.status).toBe(200)
    const money = page.body.data.money
    expect(Math.round(money.revenue * 100)).toBe(daniel.earned.revenueCents)
    expect(Math.round(money.cost * 100)).toBe(daniel.earned.costCents)

    // And the books hold what the screens show.
    const books = await postedFor(co.cs, 'Daniel Osei')
    expect(books.REVENUE).toBe(daniel.earned.revenueCents)
    expect(-(books.PAY + (books.PREMIUM ?? 0))).toBe(daniel.earned.costCents)
    expect(-books.BURDEN).toBe(daniel.earned.burdenCents)
  })

  it('every firm’s earned figures are the sum of the postings in its own books', async () => {
    for (const firm of [co.cs, co.techpeple]) {
      const rows = await placementBooks(firm)
      for (const r of rows) {
        const p = await prisma.orderPosting.groupBy({
          by: ['kind'],
          where: { companyId: firm, sellContractId: r.sellContractId, source: 'TIMESHEET' },
          _sum: { amountCents: true },
        })
        const sum = (k: string) => p.find((x) => x.kind === k)?._sum.amountCents ?? 0
        expect(sum('REVENUE'), `${r.person.name} revenue`).toBe(r.earned.revenueCents)
        if (r.earned.costCents != null) {
          expect(0 - (sum('PAY') + sum('PREMIUM')) + 0, `${r.person.name} cost`).toBe(r.earned.costCents)
        }
      }
    }
  })
})

describe('a rung reads how many hops lie above and below it, and no rate of theirs', () => {
  it('a rung reads how many hops lie above and below it, and no rate of theirs', async () => {
    const tp = (await ask(OWNER.techpeple, 'by=contract')).body.data.rows.find((r: any) => r.contractId === line.helenaTp)
    expect([tp.hopsAbove, tp.hopsBelow]).toEqual([1, 0])
    const cs = (await ask(OWNER.cs, 'by=contract')).body.data.rows.find((r: any) => r.contractId === line.helenaCs)
    expect([cs.hopsAbove, cs.hopsBelow]).toEqual([0, 1])
    // Computer Systems reads its own $118 cost and never Techpeple's $90 pay.
    expect(JSON.stringify(cs)).not.toContain('9000')
  })

  it('a firm’s books hold nothing at another firm’s rate: no Techpeple posting is priced at $145', async () => {
    const wrong = await prisma.orderPosting.count({
      where: { companyId: co.techpeple, kind: 'REVENUE', person: { name: 'Helena Marsh' }, says: { contains: '145' } },
    })
    expect(wrong).toBe(0)
  })
})

describe('signed in as each firm in a three-rung chain, another rung’s rate is refused', () => {
  const others = { northbend: ['helenaTp'], cs: [] as string[], techpeple: ['helenaCs'] }

  it('the client and the sub-vendor are each refused the bill on the rung they are not party to', async () => {
    const billOn = async (sellContractId: string) =>
      (await prisma.invoiceLine.findFirst({ where: { sellContractId }, select: { invoiceId: true } }))?.invoiceId ?? null
    const tpBill = await billOn(line.helenaTp) ?? await billOn(line.priyaTp)
    const csBill = await billOn(line.helenaCs) ?? await billOn(line.priyaCs)
    expect(tpBill && csBill, 'both rungs have a bill to ask for').toBeTruthy()

    as(OWNER.northbend)
    expect((await json(await invoice(req('GET', `/api/invoices/${tpBill}`), { params: Promise.resolve({ id: tpBill! }) }))).status).toBe(404)
    as(OWNER.techpeple)
    expect((await json(await invoice(req('GET', `/api/invoices/${csBill}`), { params: Promise.resolve({ id: csBill! }) }))).status).toBe(404)
  })

  it('each firm’s contract list carries no rate of a rung it is not party to', async () => {
    // Listed or not, the line carries no figure for a firm that is not party to it.
    const rateOf = (body: any, id: string) => {
      const r = (body?.data?.contracts ?? []).find((x: any) => x?.id === id)
      return r ? r.billRate ?? null : undefined
    }
    as(OWNER.northbend)
    const nb = await json(await contracts(req('GET', '/api/contracts?side=sell&limit=50')))
    expect(rateOf(nb.body, line.helenaTp) ?? null).toBeNull()
    as(OWNER.techpeple)
    const tp = await json(await contracts(req('GET', '/api/contracts?side=sell&limit=50')))
    expect(rateOf(tp.body, line.helenaCs) ?? null).toBeNull()
  })

  it('a firm’s profitability never lists another rung’s line, by id or otherwise', async () => {
    for (const [who, foreign] of [['techpeple', [line.helenaCs, line.priyaCs]], ['northbend', [line.helenaCs, line.helenaTp]]] as const) {
      const { status, body } = await ask(OWNER[who], 'by=contract')
      if (status !== 200) continue
      const ids = body.data.rows.map((r: any) => r.contractId)
      for (const id of foreign) expect(ids).not.toContain(id)
    }
    void others
  })

  it('the placement page withholds another rung’s money from the client and from the sub-vendor', async () => {
    as(OWNER.northbend)
    const nb = await json(await placement(req('GET', `/api/placements/${line.helenaTp}`), { params: Promise.resolve({ id: line.helenaTp }) } as any))
    if (nb.status === 200) expect(JSON.stringify(nb.body)).not.toContain('11800')
    else expect([403, 404]).toContain(nb.status)
    as(OWNER.techpeple)
    const tp = await json(await placement(req('GET', `/api/placements/${line.helenaCs}`), { params: Promise.resolve({ id: line.helenaCs }) } as any))
    if (tp.status === 200) expect(JSON.stringify(tp.body)).not.toContain('14500')
    else expect([403, 404]).toContain(tp.status)
  })
})

describe('the rebuild door', () => {
  it('a controller rebuilds only their own firm’s books, and a second run changes nothing', async () => {
    as(OWNER.techpeple)
    const r = await json(await rebuild(req('POST', '/api/profitability/rebuild')))
    expect(r.status).toBe(200)
    expect(r.body.data.rebuilt).toBe(0)
    expect(r.body.data.says).toMatch(/already matched/)
  })

  it('a wrong posting left by the old rule is moved to the firm whose rung it is, at that rung’s rate', async () => {
    // Put the old rule back on one week: the client's signature booked to
    // Techpeple at $145, which is what every chained week held until today.
    const sig = await prisma.workAssertion.findFirstOrThrow({
      where: { companyId: co.northbend, role: 'CLIENT_APPROVAL', state: 'LIVE', timesheet: { sellContractId: line.helenaTp } },
      select: { id: true, hours: true },
    })
    const right = await prisma.orderPosting.findFirstOrThrow({ where: { source: 'TIMESHEET', sourceId: sig.id, kind: 'REVENUE' } })
    const tpOrder = await prisma.orderPosting.findFirstOrThrow({ where: { companyId: co.techpeple, sellContractId: line.helenaTp }, select: { projectOrderId: true } })
    await prisma.orderPosting.update({
      where: { id: right.id },
      data: { companyId: co.techpeple, sellContractId: line.helenaTp, projectOrderId: tpOrder.projectOrderId },
    })

    // Techpeple rebuilding its own books takes the posting out of them,
    // and never writes into Computer Systems'.
    as(OWNER.techpeple)
    const own = await json(await rebuild(req('POST', '/api/profitability/rebuild')))
    expect(own.body.data.removed).toBe(1)
    expect(own.body.data.written).toBe(0)
    expect(await prisma.orderPosting.count({ where: { source: 'TIMESHEET', sourceId: sig.id, kind: 'REVENUE' } })).toBe(0)

    const all = await rebuildPostings()
    expect(all.rebuilt).toBe(1)
    const now = await prisma.orderPosting.findFirstOrThrow({ where: { source: 'TIMESHEET', sourceId: sig.id, kind: 'REVENUE' } })
    expect(now.companyId).toBe(co.cs)
    expect(now.sellContractId).toBe(line.helenaCs)
    expect(now.txAmountCents).toBe(Math.round(Number(sig.hours) * 14_500))
  })
})
