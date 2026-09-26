import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'

import { GET as myPipeline } from '@/app/api/me/pipeline/route'
import { GET as myWork } from '@/app/api/me/work/route'
import { GET as myRate } from '@/app/api/me/submissions/[id]/rate/route'

/**
 * Karthik Menon opens his own screens, and no sell-side price is on them.
 *
 * He is Teleworld Solutions' own W2, placed at an aerospace client and
 * billed four weeks. `Submission.rate` on his row is what Teleworld
 * charges for him; `BuyContractCandidate.payRate` at the bottom of the
 * chain is what Teleworld pays him. Two routes he opens as himself were
 * reading the first and calling it the second.
 *
 * Asserted as relationships rather than as pinned figures, deliberately:
 * a seeded number can be changed and the test would still have to fail.
 */

const KARTHIK = 'karthik.menon@seed.etyme.invalid'

async function person() {
  const p = await prisma.person.findFirst({ where: { name: { contains: 'Karthik' } } })
  if (!p) throw new Error('the seeded world has no Karthik Menon')
  return p
}

/** Every number anywhere in a response body, however deeply nested. */
function numbersIn(value: unknown, out: number[] = []): number[] {
  if (typeof value === 'number') out.push(value)
  else if (Array.isArray(value)) for (const v of value) numbersIn(v, out)
  else if (value && typeof value === 'object') for (const v of Object.values(value)) numbersIn(v, out)
  return out
}

describe('a consultant is never shown what the firm above them charges for their time', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
  }, 300_000)

  it('the seeded world really does bill Karthik Menon out for more than it pays him', async () => {
    // Without this the three tests below could pass on a world where the
    // two numbers happen to be equal, and prove nothing at all.
    const me = await person()
    const subs = await prisma.submission.findMany({ where: { personId: me.id }, select: { rate: true } })
    const pays = await prisma.buyContractCandidate.findMany({
      where: { personId: me.id },
      select: { payRate: true, buyContract: { select: { supplierSellContractId: true } } },
    })
    const ownPay = pays.filter((p) => p.buyContract.supplierSellContractId === null).map((p) => p.payRate)

    expect(subs.length).toBeGreaterThan(0)
    expect(ownPay.length).toBeGreaterThan(0)
    expect(Math.max(...subs.map((s) => s.rate))).toBeGreaterThan(Math.max(...ownPay))
  })

  it('his pipeline tells him where he was put forward and carries no rate at all', async () => {
    const me = await person()
    const billed = (await prisma.submission.findMany({ where: { personId: me.id }, select: { rate: true } }))
      .map((s) => s.rate)

    as(KARTHIK)
    const res = await json(await myPipeline(req('GET', '/api/me/pipeline')))

    expect(res.status).toBe(200)
    expect(res.body.data.submissions.length).toBeGreaterThan(0)
    for (const row of res.body.data.submissions) {
      expect(row).not.toHaveProperty('rateCents')
    }
    // Belt and braces: not under any other name either.
    const shown = numbersIn(res.body.data.submissions)
    for (const cents of billed) expect(shown).not.toContain(cents)
  })

  it('his own work page shows what he is paid and never what he is billed at', async () => {
    const me = await person()
    const billed = (await prisma.sellContract.findMany({ where: { personId: me.id }, select: { billRate: true } }))
      .map((c) => c.billRate)
    const paid = (await prisma.buyContractCandidate.findMany({
      where: { personId: me.id },
      select: { payRate: true, buyContract: { select: { supplierSellContractId: true } } },
    }))
      .filter((p) => p.buyContract.supplierSellContractId === null)
      .map((p) => p.payRate)

    as(KARTHIK)
    const res = await json(await myWork(req('GET', '/api/me/work')))

    expect(res.status).toBe(200)
    const rates = res.body.data.placements.map((p: any) => p.payRate).filter((r: any) => r !== null)
    expect(rates.length).toBeGreaterThan(0)
    for (const r of rates) {
      expect(paid).toContain(r)
      expect(billed).not.toContain(r)
    }
  })

  it('his rate conversation opens from what was said to him, which so far is nothing', async () => {
    const me = await person()
    const sub = await prisma.submission.findFirst({ where: { personId: me.id }, select: { id: true, rate: true } })
    expect(sub).not.toBeNull()

    as(KARTHIK)
    const res = await json(
      await myRate(req('GET', `/api/me/submissions/${sub!.id}/rate`), { params: Promise.resolve({ id: sub!.id }) })
    )

    expect(res.status).toBe(200)
    // Not "they offered you $136/hr", which is what the bill rate read as
    // when it was seeded into the timeline as the vendor's opening move.
    expect(res.body.data.liveCents).toBeNull()
    expect(res.body.data.stage).toBe('NOT_STARTED')
    expect(res.body.data.says).toBe('No rate has been proposed yet.')
    // And he can still make the first move himself.
    expect(res.body.data.mayCounter).toBe(true)
  })
})
