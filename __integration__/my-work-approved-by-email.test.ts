import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as myWork } from '@/app/api/me/work/route'

/**
 * The worker's own page says who approved her week, when the client
 * approved it by email, and links each week she sent to its own page.
 *
 * The founder, 2026-09-30 (CLAUDE.md, "A client may approve by email, and
 * the proof travels down the chain"). The seeded world carries one such
 * week: Helena Marsh's oldest signed week at Northbend Athletic, approved
 * by Marcus Oyelaran by email, with his reply attached by CloudEPA's desk
 * (lib/seed-week-approval).
 */

const HELENA = 'helena.marsh@seed.etyme.invalid'
const it_: Record<string, any> = {}

async function page() {
  as(HELENA)
  const r = await json(await myWork(req('GET', '/api/me/work')))
  expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  return r.body.data
}

describe('the worker reads who approved her week by email, on her own page', () => {
  beforeAll(async () => {
    await freshWorld()
    const helena = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: HELENA } })
    it_.helena = helena.id
    const seeded = await prisma.weekApproval.findFirstOrThrow({
      where: { how: 'EVIDENCE', timesheet: { personId: helena.id } },
      select: { timesheetId: true },
    })
    it_.seededWeek = seeded.timesheetId
  }, 600_000)

  it('Helena Marsh’s seeded week reads “Approved by email: Marcus Oyelaran” with evidence attached, on her own page', async () => {
    const d = await page()
    const week = d.timesheets.find((t: any) => t.id === it_.seededWeek)
    expect(week, `the seeded week ${it_.seededWeek} among ${d.timesheets.map((t: any) => t.id).join(', ')}`).toBeTruthy()
    // The page draws her eight newest weeks; the seeded one is among them.
    expect(d.timesheets.findIndex((t: any) => t.id === it_.seededWeek)).toBeLessThan(8)
    expect(week.approvedBy).toMatch(/^Approved by email: Marcus Oyelaran, [A-Z][a-z]{2} \d{1,2}(, \d{4})? — evidence attached$/)
  })

  it('the seeded week links to its own page to see the approval and its evidence', async () => {
    const d = await page()
    const week = d.timesheets.find((t: any) => t.id === it_.seededWeek)
    expect(week.door).toEqual({ href: `/dashboard/weeks/${it_.seededWeek}`, says: 'See the approval and its evidence' })
  })

  it('a week the client signed in Etyme carries no approval-by-email sentence', async () => {
    const d = await page()
    const others = d.timesheets.filter((t: any) => t.id !== it_.seededWeek && t.status === 'APPROVED')
    expect(others.length).toBeGreaterThan(0)
    for (const t of others) expect(t.approvedBy).toBeNull()
  })

  it('every week she sent links to its own page, and a week waiting for the client offers to ask for approval by email', async () => {
    const d = await page()
    for (const t of d.timesheets) {
      if (t.status === 'OPEN') expect(t.door).toBeNull()
      else expect(t.door.href).toBe(`/dashboard/weeks/${t.id}`)
    }
    const waiting = await prisma.timesheet.findMany({
      where: { personId: it_.helena, status: 'SUBMITTED', clientApprovedAt: null },
      select: { id: true },
    })
    for (const w of waiting) {
      const shown = d.timesheets.find((t: any) => t.id === w.id)
      if (shown) expect(shown.door.says).toBe('Ask the client to approve by email')
    }
  })

  it('her list of weeks names no rate of any rung', async () => {
    const d = await page()
    for (const t of d.timesheets) {
      expect(Object.keys(t).filter((k) => /rate|cents/i.test(k))).toEqual([])
      expect(JSON.stringify(t)).not.toMatch(/\$/)
    }
  })
})
