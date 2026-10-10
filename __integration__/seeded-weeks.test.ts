import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, freshWorld } from './harness'
import { weekStart } from '@/lib/overtime'
import { weekDueFor } from '@/lib/days-off'
import { weekDeadlines } from '@/lib/seed-days'

/**
 * The seeded world's weeks, read back out of the database. A browser
 * walk on a Wednesday found weeks filed Saturday to Wednesday, and Omar
 * Haddad's August empty though he started on the 16th.
 */

const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay()
const iso = (d: Date) => d.toISOString().slice(0, 10)

describe('the weeks the seeded world files', () => {
  beforeAll(async () => {
    await freshWorld()
  }, 900_000)

  it('every week the program and door seeds file runs inside one Sunday-to-Saturday week', async () => {
    const sheets = await prisma.timesheet.findMany({
      where: { sellContract: { OR: [{ person: { name: { in: ['Omar Haddad', 'Helena Marsh', 'Rosa Delgado', 'Karthik Menon', 'Colleen Byrne'] } } }] } },
      select: { periodStart: true, periodEnd: true, days: true, person: { select: { name: true } } },
    })
    expect(sheets.length).toBeGreaterThan(5)
    const wrong = sheets.filter((s) => {
      const days = Object.keys((s.days ?? {}) as Record<string, number>)
      // The hours on the weekdays, every day of them in one week, and
      // the sheet itself inside that week: it opens on the Sunday (or the
      // contract's first day) and closes on the Saturday (or its last).
      const sunday = weekStart(iso(s.periodStart))
      return days.some((d) => weekday(d) === 0 || weekday(d) === 6) ||
        new Set(days.map(weekStart)).size > 1 ||
        weekStart(iso(s.periodEnd)) !== sunday ||
        days.some((d) => weekStart(d) !== sunday)
    })
    expect(wrong.map((s) => `${s.person.name} ${iso(s.periodStart)}`)).toEqual([])
  })

  it('Omar Haddad has a signed week for every week since he started, and the most recent waits for somebody to decide its overtime', async () => {
    const line = await prisma.sellContract.findFirstOrThrow({
      where: { person: { name: 'Omar Haddad' }, overtimeAfterHours: { not: null } },
      select: { id: true, startDate: true },
    })
    const sheets = await prisma.timesheet.findMany({
      where: { sellContractId: line.id },
      orderBy: { periodStart: 'asc' },
      select: { periodStart: true, periodEnd: true, status: true, totalHours: true },
    })
    // The first week filed holds the first weekday he worked: on or after
    // his start, and less than a week after it.
    const gap = (sheets[0].periodStart.getTime() - line.startDate.getTime()) / 86_400_000
    expect(gap).toBeGreaterThanOrEqual(0)
    expect(gap).toBeLessThan(7)
    // No week missing between then and the last.
    for (let i = 1; i < sheets.length; i++) {
      expect((sheets[i].periodStart.getTime() - sheets[i - 1].periodStart.getTime()) / 86_400_000)
        .toBeLessThanOrEqual(7)
    }
    const last = sheets[sheets.length - 1]
    expect(last.status).toBe('SUBMITTED')
    expect(Number(last.totalHours)).toBe(45)
    expect(sheets.slice(0, -1).every((s) => s.status === 'APPROVED')).toBe(true)
  })

  it('a signed week is signed after the Saturday it ends on, on or before the Wednesday its approval is due', async () => {
    const sheets = await prisma.timesheet.findMany({
      where: { status: 'APPROVED', sellContract: { person: { name: 'Omar Haddad' } } },
      select: { periodStart: true, periodEnd: true, clientApprovedAt: true, employerAcceptedAt: true },
    })
    expect(sheets.length).toBeGreaterThan(0)
    for (const s of sheets) {
      const saturday = new Date(`${weekStart(iso(s.periodStart))}T00:00:00Z`).getTime() + 6 * 86_400_000
      const { approveByOn } = weekDeadlines(s.periodStart)
      const endOfApproval = approveByOn.getTime() + 86_400_000
      expect(s.clientApprovedAt!.getTime()).toBeGreaterThan(saturday + 86_400_000 - 1)
      expect(s.employerAcceptedAt!.getTime()).toBeGreaterThan(s.clientApprovedAt!.getTime())
      expect(s.employerAcceptedAt!.getTime()).toBeLessThan(endOfApproval)
    }
  })

  it("a seeded week's hours are due the Monday after it ends and approved by the Wednesday, read from the company's week settings", async () => {
    const sheets = await prisma.timesheet.findMany({
      where: { status: 'APPROVED', sellContract: { person: { name: { in: ['Omar Haddad', 'Helena Marsh', 'Rosa Delgado', 'Colleen Byrne'] } } } },
      select: { periodStart: true, clientApprovedAt: true, employerAcceptedAt: true, sellContract: { select: { clientCompanyId: true } } },
    })
    expect(sheets.length).toBeGreaterThan(5)
    const off: string[] = []
    for (const s of sheets) {
      const due = await weekDueFor(s.sellContract.clientCompanyId)
      const { hoursDueOn, approveByOn } = weekDeadlines(s.periodStart, due)
      expect(hoursDueOn.getUTCDay()).toBe(1)
      expect(approveByOn.getUTCDay()).toBe(3)
      // The client signs on or after the day the hours are due, and every
      // signature is in by the end of the approval day.
      const signed = s.clientApprovedAt!.getTime()
      const last = s.employerAcceptedAt!.getTime()
      if (signed < hoursDueOn.getTime() || last >= approveByOn.getTime() + 86_400_000) {
        off.push(`${iso(s.periodStart)} signed ${s.clientApprovedAt!.toISOString()} accepted ${s.employerAcceptedAt!.toISOString()}`)
      }
    }
    expect(off).toEqual([])
  })
})
