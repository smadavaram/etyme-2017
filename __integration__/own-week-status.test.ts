import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as timesheetsRoute } from '@/app/api/timesheets/route'
import { statusLine } from '@/app/dashboard/timesheets/status-words'

/**
 * The third walk, 2026-10-26: Colleen Byrne, a one-person firm, read her
 * own week of Oct 4–10 on Timesheets as "SUBMITTED · Nobody approves
 * their own hours." while the week's page said Harlow Health had signed
 * it and Ask Etyme said it waited on Halcyon Talent.
 */

const COLLEEN = 'colleen.byrne@seed.etyme.invalid'

describe('a one-person firm reads where its own week stands', () => {
  beforeAll(async () => {
    await freshWorld()
  }, 240_000)

  it('a one-person firm\u2019s own week signed at the top reads "Signed · waiting on" the next firm by name, never "Nobody approves their own hours"', async () => {
    const colleen = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: COLLEEN }, select: { id: true } })
    // The walk's week must be on the seed: submitted, signed at the top,
    // not yet accepted by the firm under the client.
    const waiting = await prisma.timesheet.findMany({
      where: { personId: colleen.id, status: 'SUBMITTED', clientApprovedAt: { not: null } },
      select: { id: true },
    })
    expect(waiting.length, 'a signed week of Colleen’s still waiting below the top').toBeGreaterThan(0)

    as(COLLEEN)
    const r = await json((await timesheetsRoute(req('GET', '/api/timesheets?limit=50')))!)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const rows: any[] = r.body.data.timesheets.filter((t: any) => waiting.some((w) => w.id === t.id))
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(statusLine(row)).toBe('Signed · waiting on Halcyon Talent')
      expect(row.signature.waitingOn).toBe('Halcyon Talent')
    }
  })

  it('a one-person firm is never told it is waiting on its own firm to accept its own week', async () => {
    as(COLLEEN)
    const r = await json((await timesheetsRoute(req('GET', '/api/timesheets?limit=50')))!)
    const byrne = await prisma.company.findFirstOrThrow({ where: { name: 'Byrne Critical Care LLC' }, select: { name: true } })
    for (const row of r.body.data.timesheets as any[]) expect(row.signature?.waitingOn ?? null).not.toBe(byrne.name)
  })

  it('a week this firm signed reads "Signed · waiting on" the firm below, and a week nobody signed reads its status', () => {
    expect(statusLine({ status: 'SUBMITTED', signature: { youSigned: true, waitingOn: 'Techpeple' } })).toBe('Signed · waiting on Techpeple')
    expect(statusLine({ status: 'SUBMITTED', signature: { youSigned: false, waitingOn: null } })).toBe('Submitted')
    expect(statusLine({ status: 'APPROVED', signature: { youSigned: true, waitingOn: null } })).toBe('Approved')
  })
})
