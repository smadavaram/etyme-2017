import { describe, it, expect, beforeAll } from 'vitest'
import { resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { weekStart } from '@/lib/overtime'

/**
 * The seeded world's weeks, read back out of the database. A browser
 * walk on a Wednesday found weeks filed Saturday to Wednesday, and Omar
 * Haddad's August empty though he started on the 16th.
 */

const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay()
const iso = (d: Date) => d.toISOString().slice(0, 10)

describe('the weeks the seeded world files', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
  }, 900_000)

  it('every week the program and door seeds file runs inside one Monday-to-Friday week', async () => {
    const sheets = await prisma.timesheet.findMany({
      where: { sellContract: { OR: [{ person: { name: { in: ['Omar Haddad', 'Helena Marsh', 'Rosa Delgado', 'Karthik Menon', 'Colleen Byrne'] } } }] } },
      select: { periodStart: true, days: true, person: { select: { name: true } } },
    })
    expect(sheets.length).toBeGreaterThan(5)
    const wrong = sheets.filter((s) => {
      const days = Object.keys((s.days ?? {}) as Record<string, number>)
      return days.some((d) => weekday(d) === 0 || weekday(d) === 6) || new Set(days.map(weekStart)).size > 1
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

  it('a signed week is signed after the Friday it ends on', async () => {
    const sheets = await prisma.timesheet.findMany({
      where: { status: 'APPROVED', sellContract: { person: { name: 'Omar Haddad' } } },
      select: { periodEnd: true, clientApprovedAt: true, employerAcceptedAt: true },
    })
    for (const s of sheets) {
      expect(s.clientApprovedAt!.getTime()).toBeGreaterThan(s.periodEnd.getTime())
      expect(s.employerAcceptedAt!.getTime()).toBeGreaterThan(s.clientApprovedAt!.getTime())
    }
  })
})
