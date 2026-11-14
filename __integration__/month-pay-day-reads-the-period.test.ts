import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, prisma, freshWorld } from './harness'

import { GET as payroll } from '@/app/api/payroll/route'

/**
 * The month's pay file names the pay day that pays that month, read off
 * the pay day's own row.
 *
 * On the seeded world, Omar Haddad's W-2 line at Brightmoor Staffing
 * started on Wednesday Sep 30, 2026. Its first pay cycle is the one-day
 * period Sep 30 to Sep 30, paid Oct 9; its second is October, paid Nov 9.
 * The walk of 2026-11-14 read October's file as "2026-10-09; 2026-11-09",
 * because the pay day's period was guessed from the days since the line
 * started (one of September, nine of October) and not read off the row.
 */

const BRIGHTMOOR = 'world-brightmoor@demo.etyme.local'
const iso = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : null)

let buyId = ''

async function payDayIn(period: string): Promise<string | null> {
  as(BRIGHTMOOR)
  const res = await payroll(req('GET', `/api/payroll?period=${period}&format=csv`))
  expect(res.status).toBe(200)
  const [head, ...lines] = (await res.text()).trim().split('\n')
  const cols = head.split(',')
  const at = cols.indexOf('Pay day')
  expect(at).toBeGreaterThan(-1)
  const mine = lines.filter((l) => l.startsWith('Omar Haddad,'))
  expect(mine).toHaveLength(1)
  // Quoted cells hold commas; the cells before "Pay day" are plain.
  return mine[0].split(',')[at] || null
}

describe('the month pay file names the pay day its own row says pays that month', () => {
  beforeAll(async () => {
    await freshWorld()
    const line = await prisma.buyContract.findFirstOrThrow({
      where: {
        company: { name: 'Brightmoor Staffing' }, contractType: 'W2',
        candidates: { some: { person: { name: 'Omar Haddad' } } },
        buyCycles: { some: { kind: 'SALARY_PAY', periodEnd: { not: null } } },
      },
      orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
      select: { id: true, startDate: true },
    })
    buyId = line.id
  }, 900_000)

  it('the seeded line started on Sep 30 and its own rows say Oct 9 pays Sep 30 to Sep 30 and Nov 9 pays October', async () => {
    const line = await prisma.buyContract.findUniqueOrThrow({ where: { id: buyId }, select: { startDate: true } })
    expect(iso(line.startDate)).toBe('2026-09-30')
    const pays = await prisma.cycle.findMany({
      where: { buyContractId: buyId, kind: 'SALARY_PAY', dueOn: { lt: new Date('2026-11-30T00:00:00Z') } },
      orderBy: { dueOn: 'asc' },
      select: { dueOn: true, periodStart: true, periodEnd: true },
    })
    expect(pays.map((c) => [iso(c.dueOn), iso(c.periodStart), iso(c.periodEnd)])).toEqual([
      ['2026-10-09', '2026-09-30', '2026-09-30'],
      ['2026-11-09', '2026-10-01', '2026-10-31'],
    ])
  })

  it("October's pay file names only Nov 9 for a line that started on Sep 30", async () => {
    expect(await payDayIn('2026-10')).toBe('2026-11-09')
  })

  it("September's pay file names Oct 9 for the same line", async () => {
    expect(await payDayIn('2026-09')).toBe('2026-10-09')
  })
})
