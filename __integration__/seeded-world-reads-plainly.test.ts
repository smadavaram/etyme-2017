import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, freshWorld } from './harness'
import { costCenterCode } from '@/lib/seed-coding'
import { calendarWeeks, karthikWindow } from '@/lib/seed-doors'
import { seedToday } from '@/lib/seed-days'
import { rolesFor } from '@/lib/company-defaults'

/**
 * What testers found on the seeded world on 2026-09-30, each as the
 * sentence the world now satisfies.
 */

beforeAll(async () => {
  await freshWorld()
}, 600_000)

describe('the seeded world reads plainly to somebody walking it for the first time', () => {
  it('no budget at any seeded client carries a retired company’s name, and Northbend Athletic’s read APPS-NORTHBEND-4100', async () => {
    const codes = (await prisma.costCenter.findMany({
      where: { company: { slug: { startsWith: 'world-' } } },
      select: { code: true },
    })).map((c) => c.code)
    expect(codes.length).toBeGreaterThan(10)
    expect(codes.filter((c) => /NIKE|CORN(?!ER)|TERU/.test(c))).toEqual([])
    expect(codes).toContain(costCenterCode('APPS', 'Northbend Athletic'))
  })

  it('CloudEPA, a bench firm, seats a recruiter and a resource manager besides its owner, each on the role’s own permissions', async () => {
    const seats = await prisma.context.findMany({
      where: { company: { slug: 'world-cloudepa' }, revokedAt: null, type: 'EMPLOYEE' },
      select: { role: { select: { name: true, permissions: true } } },
    })
    const roles = seats.map((s) => s.role?.name)
    expect(roles).toEqual(expect.arrayContaining(['Owner', 'Recruiter', 'Resource Manager']))
    for (const name of ['Recruiter', 'Resource Manager']) {
      const held = seats.find((s) => s.role?.name === name)!.role!.permissions
      expect([...held].sort(), name).toEqual([...rolesFor('VENDOR').find((r) => r.name === name)!.permissions].sort())
    }
  })

  it('Karthik Menon’s every week of his three months is signed by both sides, as his door now says', async () => {
    const karthik = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: 'karthik.menon@seed.etyme.invalid' } })
    const { start, end } = karthikWindow(seedToday())
    const sheets = await prisma.timesheet.findMany({
      where: { personId: karthik.id, sellContract: { company: { slug: 'world-teleworld' } } },
      select: { status: true },
    })
    expect(sheets.length).toBe(calendarWeeks(start, end).length)
    expect(sheets.length).toBeGreaterThan(4)
    expect(sheets.every((s) => s.status === 'APPROVED')).toBe(true)
  })

  it('at Northbend Athletic the owner, the approver and the program manager are three plainly different names', async () => {
    const names = (await prisma.context.findMany({
      where: { company: { slug: 'world-nike' }, revokedAt: null, type: 'EMPLOYEE' },
      select: { person: { select: { name: true } } },
    })).map((c) => c.person.name)
    expect(names).toEqual(expect.arrayContaining(['Camille Ostrander', 'Dana Whitfield', 'Lorena Kellerman']))
    expect(names).not.toContain('Dana Whitlock')
    expect(names).not.toContain('Camille Whitford')
  })
})
