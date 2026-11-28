import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, resetDatabase } from './harness'
import { accessUseHere } from '@/lib/watch/access-use'
import { watchAccess } from '@/lib/watch'

/**
 * The nightly access watch reads whether a seat was used from its own
 * firm's access log (2026-11-16), never from `Context.lastUsedAt` alone,
 * which no code writes: read alone, every seat granted a month ago was
 * reported as "has never used their access", people who sign in daily
 * included.
 *
 * Made-up firms on reserved domains. Every seat here has an empty use
 * date, as every seat on the live tenant does.
 */

// One moment for the whole file, so a day count does not round up on the seconds the setup took.
const NOW = new Date()
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)

describe('the nightly access watch reads use from this firm’s own record', () => {
  let rows: { contextId: string; personName: string }[] = []
  let said = new Map<string, string[]>()

  beforeAll(async () => {
    await resetDatabase()
    const north = await prisma.company.create({ data: { name: 'Northwind Staffing', slug: 'watch-use-northwind', kind: 'VENDOR', domain: 'northwind-staffing.example' } })
    const harbor = await prisma.company.create({ data: { name: 'Harborline Tech', slug: 'watch-use-harborline', kind: 'CLIENT', domain: 'harborline-tech.example' } })
    const recruiter = await prisma.role.create({ data: { companyId: north.id, name: 'Recruiter', permissions: ['submissions.read'] } })

    const seat = async (name: string, email: string) => {
      const p = await prisma.person.create({ data: { name, primaryEmail: email } })
      const c = await prisma.context.create({
        data: { personId: p.id, companyId: north.id, roleId: recruiter.id, type: 'EMPLOYEE', invitedAt: daysAgo(60), grantedAt: daysAgo(60), lastUsedAt: null },
      })
      rows.push({ contextId: c.id, personName: name })
      return p.id
    }
    const act = (personId: string, companyId: string, at: Date, extra: Record<string, unknown> = {}) =>
      prisma.accessLog.create({ data: { subjectId: personId, actorPersonId: personId, actorCompanyId: companyId, action: 'PROFILE_VIEW', at, ...extra } })

    // Signed in here on her invitation yesterday, and has worked here since.
    const daily = await seat('Mina Torres', 'mina@northwind-staffing.example')
    await act(daily, north.id, daysAgo(2), { action: 'INVITE_ACCEPTED' })
    await act(daily, north.id, daysAgo(1))
    // Signs in at another firm, never here.
    const elsewhere = await seat('Jonah Reed', 'jonah@northwind-staffing.example')
    await act(elsewhere, harbor.id, daysAgo(1))
    // Only a twin acted on her seat, and a sign-in here was refused.
    const twinOnly = await seat('Priya Nandan', 'priya@northwind-staffing.example')
    await act(twinOnly, north.id, daysAgo(1), { actorKind: 'TWIN' })
    await act(twinOnly, north.id, daysAgo(1), { action: 'LOGIN_REFUSED_SSO_ONLY', allowed: false })
    // Came in here once, four months ago.
    const dormant = await seat('Ellis Grant', 'ellis@northwind-staffing.example')
    await act(dormant, north.id, daysAgo(120))

    const seats = await prisma.context.findMany({
      where: { companyId: north.id },
      select: { id: true, companyId: true, personId: true, invitedAt: true, lastUsedAt: true, grantedAt: true, expiresAt: true, person: { select: { name: true } } },
    })
    const used = await accessUseHere(seats.map((c) => ({ contextId: c.id, companyId: c.companyId!, personId: c.personId, invitedAt: c.invitedAt, lastUsedAt: c.lastUsedAt })))
    const findings = watchAccess(seats.map((c) => ({
      contextId: c.id, companyId: c.companyId!, personName: c.person.name, roleName: 'Recruiter',
      expiresAt: c.expiresAt, lastUsedAt: c.lastUsedAt, grantedAt: c.grantedAt, usedHere: used.get(c.id),
    })), NOW)
    said = new Map()
    for (const f of findings) said.set(f.subjectId, [...(said.get(f.subjectId) ?? []), f.headline])
  }, 600_000)

  const headlines = (name: string) => said.get(rows.find((r) => r.personName === name)!.contextId) ?? []

  it('the nightly watch never says somebody has never used their access when she has signed in here', () => {
    expect(headlines('Mina Torres')).toEqual([])
  })

  it('somebody who signs in at another firm and never here is told as never having used her access here', () => {
    expect(headlines('Jonah Reed')).toEqual(['Jonah Reed has never used their access'])
  })

  it('a twin acting on her seat, or a sign-in this firm refused, is not her using the seat', () => {
    expect(headlines('Priya Nandan')).toEqual(['Priya Nandan has never used their access'])
  })

  it('a seat last used here four months ago is reported as not used in that many days', () => {
    expect(headlines('Ellis Grant')).toEqual(['Ellis Grant has not used their access in 120 days'])
  })
})
