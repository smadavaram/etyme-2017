import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as ap } from '@/app/api/ap/route'
import { GET as profitability } from '@/app/api/profitability/route'
import { mayReadCut } from '@/lib/money/profit-cut'

/**
 * A client's Reports, read as the client on the seeded world.
 *
 * CLAUDE.md held a client's Reports back until its cash flow read the
 * client's own book: what it owes its suppliers, paid and due, and the
 * forecast of what it will owe, and no margin, ever. This reads the one
 * route the tab reads, as Northbend Athletic's AP clerk, and proves that
 * nothing a supplier keeps to itself reaches the answer: no bill the
 * client never received, no payroll, no money in, no margin, no pay rate,
 * and no line on a rung below the supplier Northbend pays.
 */

const D = '@demo.etyme.local'
const NIKE_AP = `world-nike-ap${D}`
const NIKE_OWNER = `world-nike${D}`

let body: any
let northbend: { id: string }

beforeAll(async () => {
  await freshWorld()
  northbend = await prisma.company.findFirstOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })
  as(NIKE_AP)
  const res = await json(await ap(req('GET', '/api/ap?view=cash-flow&period=90d&grain=month')))
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  body = res.body.data
})

describe('a client’s Reports reads its own book and no margin', () => {
  it('a client’s cash flow is what it owes its suppliers, paid and due, and nothing else', () => {
    expect(body.figures).toEqual(['receiptsDue', 'receiptsPaid'])
    for (const c of body.currencies) {
      expect(c.owedToUs).toBeNull()
      expect(Object.keys(c.totals.figures).sort()).toEqual(['receiptsDue', 'receiptsPaid'])
    }
  })

  it('a client’s forecast is what it will owe, with no money expected in and no payroll', () => {
    expect(body.forecast.side).toBe('CLIENT')
    for (const f of body.forecast.figures) expect(['receiptsDue', 'subVendors']).toContain(f)
    for (const c of body.forecast.currencies) {
      expect(c.totals.expectedIn).toBeNull()
      for (const r of c.rows) expect(r.expectedIn).toBeNull()
    }
  })

  it('the forecast reads only the lines billed to this client, so no rung below the supplier it pays is in it', async () => {
    // The lines whose people the forecast may name: billed to Northbend.
    const ours = await prisma.sellContract.findMany({
      where: { clientCompanyId: northbend.id, state: 'IN_PROGRESS' },
      select: { person: { select: { name: true } } },
    })
    const theirs = await prisma.sellContract.findMany({
      where: { state: 'IN_PROGRESS', NOT: { clientCompanyId: northbend.id }, endClientCompanyId: northbend.id },
      select: { company: { select: { name: true } }, clientCompany: { select: { name: true } } },
    })
    expect(ours.length).toBeGreaterThan(0)
    // The seeded world holds a chain at Northbend, so this is not read over nothing.
    expect(theirs.length).toBeGreaterThan(0)
    // A firm that bills only another supplier on Northbend's work, and never
    // Northbend itself, is a rung below and is never named to Northbend.
    const billsNorthbend = new Set((await prisma.sellContract.findMany({
      where: { clientCompanyId: northbend.id }, select: { company: { select: { name: true } } },
    })).map((l) => l.company.name))
    const text = JSON.stringify(body)
    for (const t of theirs) {
      if (!billsNorthbend.has(t.company.name)) expect(text).not.toContain(t.company.name)
    }
  })

  it('no margin, pay rate, payroll or money in reaches a client’s answer from any tab, the forecast included', () => {
    const text = JSON.stringify(body)
    expect(text).not.toMatch(/margin/i)
    expect(text).not.toMatch(/payRate|"pay rate"|grossPay|payroll(Due|Paid)?"\s*:/i)
    expect(text).not.toMatch(/"(billed|received|billsDue|toBill|running)"\s*:/)
  })
})

describe('a client never reads the profit page', () => {
  const VIEWS = ['book', 'order', 'contract', 'candidate', 'customer', 'cut']

  it('a client’s Owner is refused the profit page in a sentence, and never told there are no placements', async () => {
    as(NIKE_OWNER)
    const before = await prisma.accessLog.count({ where: { subjectCompanyId: northbend.id, allowed: false } })
    for (const by of VIEWS) {
      const res = await json(await profitability(req('GET', `/api/profitability?by=${by}`)))
      expect(res.status, by).toBe(403)
      expect(res.body.error.message).toBe(mayReadCut({ kind: 'CLIENT' }))
      expect(JSON.stringify(res.body)).not.toMatch(/No placements/i)
      expect(res.body.data).toBeUndefined()
    }
    const after = await prisma.accessLog.count({ where: { subjectCompanyId: northbend.id, allowed: false } })
    expect(after - before).toBe(VIEWS.length)
  })

  it('a client’s AP clerk is not told the Owner reads it', async () => {
    as(NIKE_AP)
    const res = await json(await profitability(req('GET', '/api/profitability?by=order')))
    expect(res.status).toBe(403)
    expect(res.body.error.message).toBe(mayReadCut({ kind: 'CLIENT' }))
    expect(res.body.error.message).not.toMatch(/Owner/)
  })
})
