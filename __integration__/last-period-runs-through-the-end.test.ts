import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { POST as extend } from '@/app/api/contracts/[id]/extend/route'
import { completeCycle } from '@/lib/cycle-complete'

/**
 * The founder, 2026-11-09: the last regular period runs through the
 * contract's end date. On the seeded world: a placement's cycles carry the
 * days they cover; the period that holds the end date ends on it; an
 * extension moves that period's last day out and never writes the period
 * twice; and a cycle written before the columns is still placed from its
 * series.
 */

const D = '@demo.etyme.local'
const SUPPLIER = `world-techpeple${D}`
const s: Record<string, any> = {}
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)
const lineCycles = () =>
  prisma.cycle.findMany({
    where: { OR: [{ sellContractId: s.sell }, { buyContractId: s.buy }] },
    select: { id: true, kind: true, dueOn: true, periodStart: true, periodEnd: true, completedAt: true, sellContractId: true, buyContractId: true },
    orderBy: { dueOn: 'asc' },
  })

describe('the last regular period runs through the contract’s end date, on the seeded world', () => {
  beforeAll(async () => {
    await freshWorld()
    const co = await prisma.company.findFirstOrThrow({ where: { slug: 'world-techpeple' } })
    const line = await prisma.sellContract.findFirstOrThrow({
      where: { companyId: co.id, state: 'IN_PROGRESS', endDate: { not: null }, sellCycles: { some: { periodEnd: { not: null } } } },
      include: { buyLinks: true },
    })
    s.sell = line.id
    s.buy = line.buyLinks[0]?.buyContractId ?? null
    s.end = line.endDate!
  }, 600_000)

  it('every cycle the seed wrote carries the days it covers, and none covers a day past the end', async () => {
    const rows = await lineCycles()
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.periodStart, r.kind).not.toBeNull()
      expect(r.periodEnd, r.kind).not.toBeNull()
      expect(day(r.periodEnd)! <= day(s.end)!, r.kind).toBe(true)
    }
  })

  it('for each kind, the last period ends on the contract’s own end date', async () => {
    const rows = await lineCycles()
    const kinds = [...new Set(rows.map((r) => `${r.sellContractId ? 's' : 'b'}:${r.kind}`))]
    for (const k of kinds) {
      const of = rows.filter((r) => `${r.sellContractId ? 's' : 'b'}:${r.kind}` === k)
      const last = of.reduce((m, r) => (day(r.periodEnd)! > day(m.periodEnd)! ? r : m))
      expect(day(last.periodEnd), k).toBe(day(s.end))
    }
  })

  it('an extension moves the last period’s end, never leaving a short cycle behind, and writes no period twice', async () => {
    const before = await lineCycles()
    const target = day(new Date(s.end.getTime() + 45 * 86_400_000))!
    as(SUPPLIER)
    let r = await json(await extend(req('POST', `/api/contracts/${s.sell}/extend`, { newEndDate: target, note: 'Phase two.' }), { params: Promise.resolve({ id: s.sell }) }))
    if (r.status === 422 && r.body.error.code === 'PAPERS_NEED_A_REASON') {
      r = await json(await extend(req('POST', `/api/contracts/${s.sell}/extend`, { newEndDate: target, note: 'Phase two.', reason: 'Renewal is bound.' }), { params: Promise.resolve({ id: s.sell }) }))
    }
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const after = await lineCycles()
    // Only one cycle per line, kind and period start.
    const keys = after.map((c) => `${c.sellContractId ?? c.buyContractId}|${c.kind}|${day(c.periodStart)}`)
    expect(keys.length).toBe(new Set(keys).size)
    // The rows that ended on the old end date now run on, and kept their dates.
    for (const old of before.filter((c) => day(c.periodEnd) === day(s.end))) {
      const now = after.find((c) => c.id === old.id)!
      expect(day(now.dueOn), old.kind).toBe(day(old.dueOn))
      expect(day(now.periodEnd)! >= day(old.periodEnd)!, old.kind).toBe(true)
    }
    // And the new last periods end on the new end date.
    const lastByKind = new Map<string, string>()
    for (const c of after) {
      const k = `${c.sellContractId ? 's' : 'b'}:${c.kind}`
      if (!lastByKind.has(k) || day(c.periodEnd)! > lastByKind.get(k)!) lastByKind.set(k, day(c.periodEnd)!)
    }
    for (const [k, end] of lastByKind) expect(end, k).toBe(target)
  })

  it('a cycle written before the columns is still placed from its series', async () => {
    const rows = await lineCycles()
    const hours = rows.filter((r) => r.kind === 'TIMESHEET_SUBMIT' && r.completedAt === null && r.sellContractId)
    expect(hours.length).toBeGreaterThan(0)
    // As an older row reads: no period on any row of the kind.
    await prisma.cycle.updateMany({ where: { sellContractId: s.sell, kind: 'TIMESHEET_SUBMIT' }, data: { periodStart: null, periodEnd: null } })
    const target = hours[0]
    // The week ending the Saturday before its date.
    const saturday = new Date(target.dueOn.getTime() - 2 * 86_400_000)
    const closed = await completeCycle(prisma, { sellContractId: s.sell, kind: 'TIMESHEET_SUBMIT', periodEnd: saturday })
    expect(closed).toBe(target.id)
  })
})
