import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { joinedSaid, welcomeSaid, joinedNotices, whoHearsAJoin, ACCESS_PAGE, JOINED_EVENT } from '@/lib/notify/joined'
import { seatsFrom } from '@/lib/company-seats'
import { pageOf } from '@/lib/notify'
import { ASK_ETYME_HREF } from '@/lib/nav-table'
import { memberWelcome } from '@/lib/password-words'

/**
 * A colleague who signs in on a claimed domain gets a seat at once, and
 * the owner is told who joined and what to give them (founder,
 * 2026-10-07). The words, and who hears on which channel, read without a
 * database. Told once, and the real channel, are in
 * __integration__/somebody-joined.test.ts.
 */

const priya = { name: 'Priya Nair', email: 'priya@acme.example', companyName: 'Acme', roleName: 'Member' }

describe('when a colleague joins on the company domain', () => {
  it('when a colleague joins, every owner and admin is told who, from which address, that they have no role yet, and what to do', () => {
    const notices = joinedNotices({
      companyId: 'acme', joinerId: 'priya', joiner: priya, ownerIds: ['owner', 'admin'], teamsLinked: false,
    })
    const owners = notices.filter((n) => n.personId !== 'priya')
    expect(owners.map((n) => n.personId)).toEqual(['owner', 'admin'])
    for (const n of owners) {
      expect(n.body).toBe('Priya Nair (priya@acme.example) joined Acme with no role yet. Give them a role.')
      expect(n.title).toBe('Priya Nair joined Acme')
      expect(n.data).toMatchObject({ event: JOINED_EVENT, joinerId: 'priya', href: ACCESS_PAGE })
    }
  })

  it('the owners’ notice opens Users & permissions, in the app and from the email or Teams button', () => {
    const [n] = joinedNotices({ companyId: 'acme', joinerId: 'priya', joiner: priya, ownerIds: ['owner'], teamsLinked: false })
    expect(pageOf(n.type, n.entityId ?? null, n.data)).toBe('/dashboard/access')
  })

  it('a joiner the record gives no pronoun is spoken of as them, and one it does is spoken of by it', () => {
    expect(joinedSaid(priya).body.endsWith('Give them a role.')).toBe(true)
    expect(joinedSaid({ ...priya, pronoun: 'she' }).body.endsWith('Give her a role.')).toBe(true)
  })

  it('the joiner is told they are in and what happens next', () => {
    const notices = joinedNotices({ companyId: 'acme', joinerId: 'priya', joiner: priya, ownerIds: ['owner'], teamsLinked: true })
    const own = notices.filter((n) => n.personId === 'priya')
    expect(own).toHaveLength(1)
    expect(own[0].body).toBe('You are in Acme with no role yet. You can see your own work now. An Owner or Admin there gives you a role.')
    // In the app only: on a company channel "You are in" would be read by everybody.
    expect(own[0].channel ?? 'IN_APP').toBe('IN_APP')
  })

  it('a joiner at a company where nobody is an owner or admin is not told the owner heard', () => {
    const notices = joinedNotices({ companyId: 'acme', joinerId: 'priya', joiner: priya, ownerIds: [], teamsLinked: false })
    expect(notices).toHaveLength(1)
    expect(notices[0].body).not.toContain('has been told')
    expect(welcomeSaid({ companyName: 'Acme', roleName: 'Member', ownersTold: false }).body).toContain('Ask whoever set it up')
  })

  it('a Member who joins on the company domain reads the same welcome as one who signs up with a password', () => {
    expect(welcomeSaid({ companyName: 'Acme', roleName: 'Member', ownersTold: true }).body).toBe(memberWelcome('Acme'))
  })

  it('a colleague who joins with only the Member role is announced as having no role yet, never as Member', () => {
    expect(joinedSaid(priya).body).not.toContain('as Member')
    expect(joinedSaid({ ...priya, roleName: '' }).body).toBe('Priya Nair (priya@acme.example) joined Acme with no role yet. Give them a role.')
  })

  it('a colleague seated with a real role is announced by that role', () => {
    expect(joinedSaid({ ...priya, roleName: 'Recruiter' }).body).toBe('Priya Nair (priya@acme.example) joined Acme as Recruiter. Give them a role.')
  })

  it('a joiner at a company where nobody is an owner or admin is told she has no role yet, never that she is in as Member', () => {
    expect(welcomeSaid({ companyName: 'Acme', roleName: 'Member', ownersTold: false }).body)
      .toBe('You are in Acme with no role yet. Nobody here is an Owner or Admin yet. Ask whoever set it up to give you a role in Users & permissions.')
  })

  it('the welcome where the owners were told is read from the password sign-up’s own words, so the two cannot drift', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/notify/joined.ts'), 'utf8')
    expect(src).toContain("import { memberWelcome } from '@/lib/password-words'")
    expect(src).toMatch(/ownersTold\s*\?\s*memberWelcome\(input\.companyName\)/)
    expect(welcomeSaid({ companyName: 'Northwind Staffing', roleName: 'Member', ownersTold: true }).body).toBe(memberWelcome('Northwind Staffing'))
  })

  it('every sentence the owners and the joiner read is under twenty-five words', () => {
    const long = { ...priya, name: 'Alexandra Montgomery-Whitfield', companyName: 'Northwind Staffing Partners International' }
    const said = [
      joinedSaid(long).body,
      welcomeSaid({ companyName: long.companyName, roleName: 'Member', ownersTold: true }).body,
      welcomeSaid({ companyName: long.companyName, roleName: 'Member', ownersTold: false }).body,
    ]
    for (const body of said) for (const s of body.split(/(?<=\.)\s+/)) expect(s.split(/\s+/).length, s).toBeLessThan(25)
  })

  it('a joiner who holds an owner seat is never told about themselves', () => {
    const notices = joinedNotices({ companyId: 'acme', joinerId: 'priya', joiner: priya, ownerIds: ['priya', 'owner'], teamsLinked: false })
    expect(notices.filter((n) => n.personId === 'priya')).toHaveLength(1)
  })

  it('a company with a Teams link hears it once in the channel and every other owner in the app; without one, every owner by email', () => {
    const teams = joinedNotices({ companyId: 'acme', joinerId: 'priya', joiner: priya, ownerIds: ['a', 'b', 'c'], teamsLinked: true })
      .filter((n) => n.personId !== 'priya')
    expect(teams.map((n) => n.channel ?? 'IN_APP')).toEqual(['TEAMS', 'IN_APP', 'IN_APP'])
    const mail = joinedNotices({ companyId: 'acme', joinerId: 'priya', joiner: priya, ownerIds: ['a', 'b', 'c'], teamsLinked: false })
      .filter((n) => n.personId !== 'priya')
    expect(mail.map((n) => n.channel)).toEqual(['EMAIL', 'EMAIL', 'EMAIL'])
  })

  it('a link named on a notice that leads off the site is ignored, and the type’s own page is used', () => {
    expect(pageOf('SYSTEM', null, { href: 'https://evil.example/x' })).toBe(ASK_ETYME_HREF)
    expect(pageOf('SYSTEM', null, { href: '/dashboard//evil.example' })).toBe(ASK_ETYME_HREF)
    expect(pageOf('SUBMISSION', null)).toBe('/dashboard/submissions')
  })

  it('a notice written before the notifications page was deleted, naming it, opens Ask Etyme instead', () => {
    expect(pageOf('SYSTEM', null, { href: '/dashboard/notifications' })).toBe(ASK_ETYME_HREF)
    expect(pageOf('BENCH', null, { href: '/dashboard/notifications?type=BENCH' })).toBe(ASK_ETYME_HREF)
    expect(pageOf('BENCH', null, { href: '/dashboard/notifications-elsewhere' })).toBe('/dashboard/notifications-elsewhere')
  })

  describe('only a seat that can still sign in hears it', () => {
    const now = new Date()
    const dayAgo = new Date(now.getTime() - 86_400_000)
    const dayOn = new Date(now.getTime() + 86_400_000)
    /** A seat at Northwind Staffing as the one seat reader reads it from the database. */
    const row = (id: string, role: string, extra: { expiresAt?: Date | null; suspendedAt?: Date | null } = {}) => ({
      id: `c-${id}`, personId: id, type: 'EMPLOYEE', roleId: `r-${role}`, orgUnitId: null, grantedAt: dayAgo,
      invitedAt: null, lastUsedAt: dayAgo, suspendedAt: extra.suspendedAt ?? null, revokedAt: null, expiresAt: extra.expiresAt ?? null,
      role: { name: role, permissions: role === 'Member' ? [] : ['*'] },
      person: { name: id, primaryEmail: `${id}@northwind-staffing.example` },
    })
    const told = (rows: ReturnType<typeof row>[]) => whoHearsAJoin(seatsFrom(rows, 'Northwind Staffing', now), 'priya')

    it('an Admin whose seat is past its end date is not told that somebody joined', () => {
      expect(told([row('owner', 'Owner'), row('admin', 'Admin', { expiresAt: dayAgo }), row('priya', 'Member')])).toEqual(['owner'])
    })

    it('an Owner whose seat is past its end date is still told, because a date never ends an Owner’s seat', () => {
      expect(told([row('owner', 'Owner', { expiresAt: dayAgo }), row('admin', 'Admin'), row('priya', 'Member')])).toEqual(['owner', 'admin'])
    })

    it('an Admin whose end date is still ahead is told, and a paused one is not', () => {
      expect(told([row('owner', 'Owner', { suspendedAt: dayAgo }), row('admin', 'Admin', { expiresAt: dayOn }), row('priya', 'Member')])).toEqual(['admin'])
    })

    it('a colleague with another role is not told, and the joiner is never told about herself', () => {
      expect(told([row('owner', 'Owner'), row('recruiter', 'Recruiter'), row('priya', 'Admin')])).toEqual(['owner'])
    })

    it('the notice asks the one seat reader who is live, never a query of its own', () => {
      const src = readFileSync(join(process.cwd(), 'src/lib/notify/joined.ts'), 'utf8')
      expect(src).toMatch(/readCompanySeats\(companyId\)/)
      expect(src).toMatch(/ownerIds: whoHearsAJoin\(seats, personId\)/)
      expect(src).not.toMatch(/prisma\.context\.findMany/)
    })
  })
})
