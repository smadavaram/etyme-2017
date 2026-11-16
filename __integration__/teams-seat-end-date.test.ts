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

/**
 * A manager invited here who has never come in here, though her account
 * signs in somewhere else on Etyme (a sign-in method used yesterday).
 * Where `cameInHere`, this firm's access log holds a row of hers.
 */
async function invitedManager(companyId: string, roleId: string, name: string, email: string, cameInHere: boolean) {
  const p = await prisma.person.create({ data: { name, primaryEmail: email } })
  await prisma.credential.create({ data: { personId: p.id, provider: 'EMAIL', providerId: email, email, lastUsedAt: dayAgo() } })
  await prisma.context.create({ data: { personId: p.id, companyId, roleId, type: 'EMPLOYEE', invitedAt: dayAgo(), lastUsedAt: null } })
  if (cameInHere) {
    await prisma.accessLog.create({ data: { subjectId: p.id, actorPersonId: p.id, actorCompanyId: companyId, action: 'INVITE_ACCEPTED' } })
  }
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

    // Two firms, each with an Admin past her date and a second Admin
    // invited. At the first the second Admin signs in elsewhere and never
    // here; at the second she has come in here.
    const cove = await firm('Cove Lane Staffing', 'teams-dated-cove', 'cove-lane.example')
    await seat(cove.id, cove.admin, 'Mara Quinn', 'mara@cove-lane.example', dayAgo())
    await invitedManager(cove.id, cove.admin, 'Theo Brandt', 'theo@cove-lane.example', false)
    const pier = await firm('Pier Street Talent', 'teams-dated-pier', 'pier-street.example')
    await seat(pier.id, pier.admin, 'Iris Vale', 'iris@pier-street.example', dayAgo())
    await invitedManager(pier.id, pier.admin, 'Omar Nash', 'omar@pier-street.example', true)
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

  it('a manager who signed in elsewhere on Etyme and never here does not end another manager’s seat in Teams, as on the web', async () => {
    const b = await bindTeamsIdentity({ userPrincipalName: 'mara@cove-lane.example' })
    expect(b.ok).toBe(true)
  })

  it('a manager who has come in here does end another manager’s seat past its date in Teams', async () => {
    const b = await bindTeamsIdentity({ userPrincipalName: 'iris@pier-street.example' })
    expect(b).toMatchObject({ ok: false, code: 'NO_SEAT' })
  })
})
