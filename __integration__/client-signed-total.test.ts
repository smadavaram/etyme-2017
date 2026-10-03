import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as listTimesheets } from '@/app/api/timesheets/route'
import { POST as signWeek } from '@/app/api/timesheets/[id]/approve/route'
import { listTotals, totalsRowOf } from '@/app/dashboard/timesheets/totals'

/**
 * Money's report on the client walk: Northbend Athletic signed two weeks
 * and its "Approved value" did not move. In a chain the week the client
 * signs stays SUBMITTED until the supplier below accepts it, and the tile
 * counted only APPROVED rows. A week the reader signed is work the reader
 * has said yes to, and it counts.
 */

const HIRING = 'world-nike-hiring@demo.etyme.local'
const withId = (id: string) => ({ params: Promise.resolve({ id }) })
const s: Record<string, any> = {}

/** The tile, computed exactly as the page computes it. */
async function tile() {
  as(HIRING)
  const r = await json(await listTimesheets(req('GET', '/api/timesheets?limit=200')))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  const rows = r.body.data.timesheets
  return { rows, totals: listTotals(rows.map(totalsRowOf), { onServer: rows.length, payBasis: false }) }
}

describe('a week the client signs counts in the client’s signed total at once', () => {
  beforeAll(async () => {
    await freshWorld()
    const week = await prisma.timesheet.findFirstOrThrow({
      where: { status: 'SUBMITTED', clientApprovedAt: null, totalHours: 44, person: { name: 'Lucía Fernández' } },
      select: { id: true },
    })
    s.week = week.id
  }, 240_000)

  it('signing Lucía Fernández’s 44-hour week adds $4,312 to Northbend’s signed total', async () => {
    const before = await tile()

    // A flagged week is signed with a reason, and its four extra hours
    // are decided — here, at the usual rate.
    as(HIRING)
    const ask = await json(await signWeek(req('POST', `/api/timesheets/${s.week}/approve`, { note: 'Release weekend, agreed with Marcus' }), withId(s.week)))
    expect(ask.body?.error?.code).toBe('OVERTIME_UNDECIDED')
    as(HIRING)
    const signed = await json(await signWeek(
      req('POST', `/api/timesheets/${s.week}/approve`, {
        note: 'Release weekend, agreed with Marcus',
        overtime: [{ weekOf: ask.body.error.weeks[0].weekOf, treatment: 'SAME_RATE' }],
      }),
      withId(s.week)
    ))
    expect(signed.status, JSON.stringify(signed.body)).toBe(200)

    const after = await tile()
    const row = after.rows.find((t: any) => t.id === s.week)
    // Still waiting on the supplier below — and counted all the same.
    expect(row.status).toBe('SUBMITTED')
    expect(row.signature.youSigned).toBe(true)
    expect(after.totals.approvedValueCents - before.totals.approvedValueCents).toBe(431_200)
  })

  it('the tile says the weeks it counts include the ones signed by you', async () => {
    const { totals } = await tile()
    expect(totals.approvedSays).toMatch(/signed by you/)
  })
})
