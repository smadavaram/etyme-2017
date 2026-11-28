import { describe, it, expect, beforeAll } from 'vitest'
import { req, json, prisma, resetDatabase } from './harness'
import { GET as watch } from '@/app/api/cron/watch/route'

/**
 * The nightly access watch reads a seat's end date by the one rule
 * (`seatByDate` in lib/account-lifecycle, 2026-11-15).
 *
 * The watch read each seat's role by its name alone, so it could tell an
 * Owner was kept open past the date but never the last seat that may
 * manage access: that needs the role's permissions, whether the seat is
 * paused, and whether its person ever signed in. A sole Admin past its
 * end date was told it had "lost access" while the caller check kept it
 * open. Now the cron route reads all three.
 *
 * Made-up firms on reserved domains.
 */

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000)

async function firm(name: string, slug: string, domain: string) {
  const c = await prisma.company.create({ data: { name, slug, kind: 'VENDOR', domain } })
  const role = async (n: string, permissions: string[]) => (await prisma.role.create({ data: { companyId: c.id, name: n, permissions } })).id
  return { id: c.id, role }
}

async function seat(companyId: string, roleId: string, name: string, email: string, expiresAt: Date | null) {
  const p = await prisma.person.create({ data: { name, primaryEmail: email } })
  await prisma.context.create({ data: { personId: p.id, companyId, roleId, type: 'EMPLOYEE', expiresAt, lastUsedAt: daysAgo(1) } })
}

/** Everything the watch told anybody at a company, title and body together. */
async function toldAt(companyId: string): Promise<string> {
  const rows = await prisma.notification.findMany({ where: { companyId }, select: { title: true, body: true } })
  return rows.map((r) => `${r.title}\n${r.body ?? ''}`).join('\n')
}

describe('the nightly access watch reads a seat’s end date by the one rule', () => {
  let northwind = ''
  let harborline = ''

  beforeAll(async () => {
    await resetDatabase()
    process.env.CRON_SECRET = 'integration-cron-secret'

    // The only seat at Northwind that may manage access, past its date,
    // beside a seat with no such permission, also past its date.
    const north = await firm('Northwind Staffing', 'watch-dated-northwind', 'northwind-staffing.example')
    northwind = north.id
    await seat(north.id, await north.role('Admin', ['team.manage', 'settings.manage']), 'Dana Ashby', 'dana@northwind-staffing.example', daysAgo(5))
    await seat(north.id, await north.role('Recruiter', ['submissions.read']), 'Wren Okafor', 'wren@northwind-staffing.example', daysAgo(5))

    // At Harborline an Owner holds access, so an Admin past its date is
    // not the last one and its access did end.
    const harbor = await firm('Harborline Tech', 'watch-dated-harborline', 'harborline-tech.example')
    harborline = harbor.id
    await seat(harbor.id, await harbor.role('Owner', ['*']), 'Lee Park', 'lee@harborline-tech.example', null)
    await seat(harbor.id, await harbor.role('Admin', ['team.manage', 'settings.manage']), 'Kim Ortiz', 'kim@harborline-tech.example', daysAgo(5))

    const res = await watch(req('GET', '/api/cron/watch', undefined, { authorization: `Bearer ${process.env.CRON_SECRET}` }) as never)
    expect((await json(res)).status).toBe(200)
  }, 600_000)

  it('the nightly watch never reports the last seat that may manage access as having lost access past its end date', async () => {
    const said = await toldAt(northwind)
    // The watch ran and told the firm about the other seat, so silence
    // about the Admin is the rule, not a watch that said nothing.
    expect(said).toContain('Wren Okafor lost access')
    expect(said).not.toContain('Dana Ashby lost access')
  })

  it('an Admin past its end date beside an Owner is still reported as having lost access', async () => {
    expect(await toldAt(harborline)).toContain('Kim Ortiz lost access')
  })
})
