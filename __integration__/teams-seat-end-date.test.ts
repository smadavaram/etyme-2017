import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, resetDatabase } from './harness'
import { bindTeamsIdentity } from '@/lib/teams/binding'

/**
 * A seat's end date in Teams (2026-11-15). Users & permissions gives a
 * role "until <date> unless renewed", and the web now ends a seat past
 * that date through one rule (`seatByDate` in lib/account-lifecycle).
 * The Teams bot read the date on its own and ended every seat past it,
 * an Owner's too. Now it reads the same rule: an Owner's seat, and the
 * last one that may manage access, are never ended by a date in Teams.
 *
 * Made-up firms on reserved domains; each person writes to the bot from
 * an account on her firm's own domain.
 */

const dayAgo = () => new Date(Date.now() - 86_400_000)
const dayOn = () => new Date(Date.now() + 86_400_000)

async function firm(name: string, slug: string, domain: string) {
  const c = await prisma.company.create({ data: { name, slug, kind: 'VENDOR', domain } })
  const role = async (n: string, permissions: string[]) => (await prisma.role.create({ data: { companyId: c.id, name: n, permissions } })).id
  return { id: c.id, owner: await role('Owner', ['*']), admin: await role('Admin', ['*']), recruiter: await role('Recruiter', ['submissions.read']) }
}

async function seat(companyId: string, roleId: string, name: string, email: string, expiresAt: Date | null) {
  const p = await prisma.person.create({ data: { name, primaryEmail: email } })
  await prisma.context.create({ data: { personId: p.id, companyId, roleId, type: 'EMPLOYEE', expiresAt, lastUsedAt: dayAgo() } })
}

describe('the Teams bot reads a seat’s end date by the one rule', () => {
  beforeAll(async () => {
    await resetDatabase()
    const harbor = await firm('Harborline Tech', 'teams-dated-harborline', 'harborline-tech.example')
    await seat(harbor.id, harbor.owner, 'Dana Reyes', 'dana@harborline-tech.example', dayAgo())
    await seat(harbor.id, harbor.admin, 'Lee Park', 'lee@harborline-tech.example', dayAgo())
    await seat(harbor.id, harbor.recruiter, 'Kim Ortiz', 'kim@harborline-tech.example', dayOn())
    await seat(harbor.id, harbor.recruiter, 'Ravi Shah', 'ravi@harborline-tech.example', dayAgo())

    const north = await firm('Northwind Staffing', 'teams-dated-northwind', 'northwind-staffing.example')
    await seat(north.id, north.admin, 'Ana Silva', 'ana@northwind-staffing.example', dayAgo())
  }, 600_000)

  it('an Owner whose seat is past its end date is still answered in Teams, because a date never ends an Owner’s seat', async () => {
    const b = await bindTeamsIdentity({ userPrincipalName: 'dana@harborline-tech.example' })
    expect(b.ok).toBe(true)
    if (b.ok) expect(b.bound.roleName).toBe('Owner')
  })

  it('an Admin past the end date is refused in Teams while an Owner can still manage access', async () => {
    const b = await bindTeamsIdentity({ userPrincipalName: 'lee@harborline-tech.example' })
    expect(b).toMatchObject({ ok: false, code: 'NO_SEAT' })
  })

  it('a seat whose end date is still ahead is answered, and one past it is refused', async () => {
    expect((await bindTeamsIdentity({ userPrincipalName: 'kim@harborline-tech.example' })).ok).toBe(true)
    expect(await bindTeamsIdentity({ userPrincipalName: 'ravi@harborline-tech.example' })).toMatchObject({ ok: false, code: 'NO_SEAT' })
  })

  it('the last seat at a firm that may manage access stays open in Teams past its end date', async () => {
    const b = await bindTeamsIdentity({ userPrincipalName: 'ana@northwind-staffing.example' })
    expect(b.ok).toBe(true)
  })
})
