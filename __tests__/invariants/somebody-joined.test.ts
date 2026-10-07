import { describe, it, expect } from 'vitest'
import { joinedSaid, welcomeSaid, joinedNotices, ACCESS_PAGE, JOINED_EVENT } from '@/lib/notify/joined'
import { pageOf } from '@/lib/notify'

/**
 * A colleague who signs in on a claimed domain gets a seat at once, and
 * the owner is told who joined and what to give them (founder,
 * 2026-10-07). The words, and who hears on which channel, read without a
 * database. Told once, and the real channel, are in
 * __integration__/somebody-joined.test.ts.
 */

const priya = { name: 'Priya Nair', email: 'priya@acme.example', companyName: 'Acme', roleName: 'Member' }

describe('when a colleague joins on the company domain', () => {
  it('when a colleague joins, every owner and admin is told who, from which address, as what, and what to do', () => {
    const notices = joinedNotices({
      companyId: 'acme', joinerId: 'priya', joiner: priya, ownerIds: ['owner', 'admin'], teamsLinked: false,
    })
    const owners = notices.filter((n) => n.personId !== 'priya')
    expect(owners.map((n) => n.personId)).toEqual(['owner', 'admin'])
    for (const n of owners) {
      expect(n.body).toBe('Priya Nair (priya@acme.example) joined Acme as Member. Give them a desk.')
      expect(n.title).toBe('Priya Nair joined Acme')
      expect(n.data).toMatchObject({ event: JOINED_EVENT, joinerId: 'priya', href: ACCESS_PAGE })
    }
  })

  it('the owners’ notice opens Users & permissions, in the app and from the email or Teams button', () => {
    const [n] = joinedNotices({ companyId: 'acme', joinerId: 'priya', joiner: priya, ownerIds: ['owner'], teamsLinked: false })
    expect(pageOf(n.type, n.entityId ?? null, n.data)).toBe('/dashboard/access')
  })

  it('a joiner the record gives no pronoun is spoken of as them, and one it does is spoken of by it', () => {
    expect(joinedSaid(priya).body.endsWith('Give them a desk.')).toBe(true)
    expect(joinedSaid({ ...priya, pronoun: 'she' }).body.endsWith('Give her a desk.')).toBe(true)
  })

  it('the joiner is told they are in and what happens next', () => {
    const notices = joinedNotices({ companyId: 'acme', joinerId: 'priya', joiner: priya, ownerIds: ['owner'], teamsLinked: true })
    const own = notices.filter((n) => n.personId === 'priya')
    expect(own).toHaveLength(1)
    expect(own[0].body).toBe('You are in at Acme as Member. Your owner has been told; you will see more once they give you a desk.')
    // In the app only: on a company channel "You are in" would be read by everybody.
    expect(own[0].channel ?? 'IN_APP').toBe('IN_APP')
  })

  it('a joiner at a company with nobody on the owner or admin desk is not told the owner heard', () => {
    const notices = joinedNotices({ companyId: 'acme', joinerId: 'priya', joiner: priya, ownerIds: [], teamsLinked: false })
    expect(notices).toHaveLength(1)
    expect(notices[0].body).not.toContain('has been told')
    expect(welcomeSaid({ companyName: 'Acme', roleName: 'Member', ownersTold: false }).body).toContain('ask whoever set it up')
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
    expect(pageOf('SYSTEM', null, { href: 'https://evil.example/x' })).toBe('/dashboard/notifications')
    expect(pageOf('SYSTEM', null, { href: '/dashboard//evil.example' })).toBe('/dashboard/notifications')
    expect(pageOf('SUBMISSION', null)).toBe('/dashboard/submissions')
  })
})
