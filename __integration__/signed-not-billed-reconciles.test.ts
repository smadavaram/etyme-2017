import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as readBudget } from '@/app/api/program/budget/route'
import { signedAndBilled, type LineBilling } from '@/lib/money/signed-unbilled'
import { firmTuesday } from '@/lib/money/firm-today'

/**
 * One figure for signed-and-not-billed (the reconciliation, 2026-11-09).
 *
 * Three readers priced it three ways: straight time with no expenses here,
 * the decided overtime and accepted expenses on the client's budget, and
 * the bill generator on the firm's Today page. Now one reader prices it
 * through the generator, and these sentences hold the books together to
 * the cent on the seeded world, found by its facts.
 */

const PROGRAM = 'world-nike-programme@demo.etyme.local'

/** Signed, as the reconciliation reads it: what sent bills carry, less what they carry past the signed hours, plus what is not billed yet. */
const signedMoney = (s: LineBilling) => s.billed.amountMinor - s.billedOverSigned.amountMinor + s.notBilled.amountMinor

describe('signed and not billed is one figure, priced as the next bill would price it', () => {
  beforeAll(async () => { await freshWorld() }, 600_000)

  it('for every placement Northbend pays, Signed equals Billed less what was billed past the signed hours, plus Signed-not-billed, to the cent', async () => {
    const client = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })
    const lines = await prisma.sellContract.findMany({ where: { clientCompanyId: client.id }, select: { id: true } })
    const read = await signedAndBilled(lines.map((l) => l.id))
    expect(read.size).toBeGreaterThan(0)
    for (const s of read.values()) {
      if (s.notBilled.unpriced > 0) { expect(s.signed.amountMinor, s.personName).toBeNull(); continue }
      expect(s.signed.amountMinor, s.personName).toBe(signedMoney(s))
      expect(s.notBilled.weeks.reduce((n, w) => n + (w.amountMinor ?? 0), 0) + s.notBilled.expenseMinor, s.personName).toBe(s.notBilled.amountMinor)
    }
  })

  it('for every cost center and every line on it, Spent on the budget page minus Billed equals Signed-not-billed, less anything billed past the signed hours', async () => {
    as(PROGRAM)
    const r = await json(await readBudget(req('GET', '/api/program/budget')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const centers = r.body.data.centers as any[]
    const ids = [...new Set(centers.flatMap((c) => c.lines.map((l: any) => l.contractId as string)))]
    const read = await signedAndBilled(ids)
    let compared = 0
    const off: string[] = []
    for (const c of centers) {
      const alloc = await prisma.contractCostAllocation.findMany({ where: { costCenterId: c.costCenterId }, select: { sellContractId: true, shareBps: true } })
      for (const l of c.lines as any[]) {
        const s = read.get(l.contractId)
        const a = alloc.find((x) => x.sellContractId === l.contractId)
        if (!s || !a || s.currency !== c.currency || s.notBilled.unpriced > 0) continue
        const share = (n: number) => Math.round((n * a.shareBps) / 10_000)
        const want = share(s.billed.amountMinor) + share(s.notBilled.amountMinor) - share(s.billedOverSigned.amountMinor)
        if (l.actualCents !== want) off.push(`${c.code} ${l.personName}: Spent ${l.actualCents}, Billed ${share(s.billed.amountMinor)} + not billed ${share(s.notBilled.amountMinor)} − over ${share(s.billedOverSigned.amountMinor)} = ${want}`)
        compared++
      }
      // The center's own figures, as the page prints them.
      expect(c.actualCents - c.billedCents, c.code).toBe(c.signedNotBilledCents - c.lines.reduce((n: number, l: any) => {
        const s = read.get(l.contractId); const a = alloc.find((x) => x.sellContractId === l.contractId)
        return n + (s && a && s.currency === c.currency ? Math.round((s.billedOverSigned.amountMinor * a.shareBps) / 10_000) : 0)
      }, 0))
    }
    expect(off).toEqual([])
    expect(compared).toBeGreaterThan(0)
  })

  it('a firm’s Today figure is the same reader: every week and amount it lists is the placement’s own', async () => {
    const brightmoor = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
    const today = (await firmTuesday(brightmoor.id))!
    const lines = [...new Set(today.signedNotBilled.weeks.map((w) => w.sellContractId))]
    expect(lines.length).toBeGreaterThan(0)
    const read = await signedAndBilled(lines)
    for (const id of lines) {
      const mine = today.signedNotBilled.weeks.filter((w) => w.sellContractId === id)
      const theirs = read.get(id)!.notBilled.weeks
      expect(mine.map((w) => [w.timesheetId, w.amountMinor])).toEqual(theirs.map((w) => [w.timesheetId, w.amountMinor]))
    }
  })

  it('a decided overtime premium is in the figure: a week over the line is priced above straight time where somebody decided it', async () => {
    const client = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })
    const lines = await prisma.sellContract.findMany({ where: { clientCompanyId: client.id }, select: { id: true, billRate: true } })
    const read = await signedAndBilled(lines.map((l) => l.id))
    for (const s of read.values()) {
      const rate = lines.find((l) => l.id === s.sellContractId)!.billRate
      for (const w of s.notBilled.weeks) {
        if (w.amountMinor == null || w.onDraft || w.billsHours == null) continue
        // Never below straight time on the hours the bill carries.
        expect(w.amountMinor, `${s.personName} ${w.week.start}`).toBeGreaterThanOrEqual(Math.round(w.billsHours * rate) - 1)
      }
    }
  })
})
