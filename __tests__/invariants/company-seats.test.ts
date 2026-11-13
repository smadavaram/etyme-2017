import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  seatsFrom, peopleOf, countSeats, countsByRole, countWords, roleHeldWords, peopleWords, personNameFor, teammatesOf, isSharedSignIn,
} from '@/lib/company-seats'
import { roleCanDo } from '@/lib/company-roles'
import { PERMISSIONS } from '@/lib/permissions'
import { planBootstrap } from '@/lib/staff-bootstrap'

/**
 * One reader of a company's seats, and what a role can do, counted one way
 * (founder, 2026-11-12: five screens gave five counts of Tapin's people,
 * three people invited read as "Admin, 3 persons", and the Owner, the Admin,
 * Member and Give access read 34, 33, 0 and 35).
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const day = new Date('2026-11-01T00:00:00Z')

type Row = Parameters<typeof seatsFrom>[0][number]
function row(o: Partial<Row> & { id: string }): Row {
  return {
    personId: `p-${o.id}`, type: 'EMPLOYEE', roleId: 'r-admin', orgUnitId: null, grantedAt: day,
    invitedAt: null, lastUsedAt: day, suspendedAt: null, revokedAt: null,
    role: { name: 'Admin' },
    person: { name: `Person ${o.id}`, primaryEmail: `${o.id}@tapin.example`, credentials: [{ id: 'c' }] },
    ...o,
  }
}
const invited = (id: string, extra: Partial<Row> = {}) =>
  row({ id, invitedAt: day, lastUsedAt: null, person: { name: `Person ${id}`, primaryEmail: `${id}@gmail.com`, credentials: [] }, ...extra })

describe('one reader counts a company’s people the same way on every screen', () => {
  it('a person invited who never signed in is counted as invited, never as having access', () => {
    const seats = seatsFrom([invited('a')], 'Tapin')
    expect(seats[0].state).toBe('INVITED')
    expect(countSeats(seats)).toEqual({ withAccess: 0, invited: 1, waitingForRole: 0, paused: 0 })
  })

  it('a paused seat is counted as paused, and never as with access', () => {
    const seats = seatsFrom([row({ id: 'a', suspendedAt: day })], 'Tapin')
    expect(countSeats(seats)).toEqual({ withAccess: 0, invited: 0, waitingForRole: 0, paused: 1 })
  })

  it('a person who signed in and holds no role is counted as waiting for a role, never as with access, so the headline agrees with the "Waiting for access" list', async () => {
    const { seatPlace } = await import('@/lib/access-grant')
    const seats = seatsFrom([row({ id: 'a' }), row({ id: 'b', role: null, roleId: null })], 'Tapin')
    expect(seats.map((s) => s.state)).toEqual(['WITH_ACCESS', 'WAITING_FOR_ROLE'])
    expect(countSeats(seats)).toEqual({ withAccess: 1, invited: 0, waitingForRole: 1, paused: 0 })
    expect(peopleWords(countSeats(seats))).toBe('2 people: 1 with access · 1 waiting for a role')
    // The list's own rule says the same of each seat.
    expect(seatPlace({ roleName: null, signedIn: true })).toBe('WAITING')
    expect(seats.filter((s) => s.state === 'WITH_ACCESS').length)
      .toBe(seats.filter((s) => seatPlace({ roleName: s.roleName, signedIn: true }) === 'WITH_ACCESS').length)
    // Settings → Roles puts the same seat under no role, never under a role's count.
    expect(countsByRole(seats).get(null)).toEqual({ withAccess: 0, invited: 0, waitingForRole: 1, paused: 0 })
  })

  it('an ended seat is not counted at all', () => {
    expect(seatsFrom([row({ id: 'a', revokedAt: day })], 'Tapin')).toEqual([])
  })

  it('a consultant seat is never counted among a company’s people', () => {
    const seats = seatsFrom([row({ id: 'a' }), row({ id: 'b', type: 'CONSULTANT', role: null, roleId: null })], 'Tapin')
    expect(seats).toHaveLength(2)
    expect(peopleOf(seats).map((s) => s.contextId)).toEqual(['a'])
  })

  it('the shared sample seat of the home page is never counted among a company’s people', () => {
    const sample = row({ id: 's', person: { name: 'Shared sample', primaryEmail: 'world-nike-sample@demo.etyme.local', credentials: [{ id: 'c' }] } })
    expect(peopleOf(seatsFrom([row({ id: 'a' }), sample], 'Northbend Athletic'))).toHaveLength(1)
  })

  it('a person is never given the company’s name: a seat named after the company reads as the name part of its address', () => {
    const seats = seatsFrom([row({ id: 'a', person: { name: 'Tapin', primaryEmail: 'sharath.m@etyme.com', credentials: [{ id: 'c' }] } })], 'Tapin')
    expect(seats[0].name).toBe('Sharath M')
    expect(personNameFor('TAPIN ', 'oliver@etyme.com', 'Tapin')).toBe('Oliver')
    expect(personNameFor('', 'hr.admin@etyme.com', 'Tapin')).toBe('Hr Admin')
    expect(personNameFor('Oliver Reyes', 'oliver@etyme.com', 'Tapin')).toBe('Oliver Reyes')
  })

  it('the staff tool never names a seat with the company’s name', () => {
    const plan = planBootstrap(
      { name: 'Tapin', kind: 'VENDOR', domain: 'etyme.com', address: 'tapin', seats: [{ email: 'sharath@etyme.com', role: 'Owner', name: 'Tapin' }] } as never,
      { company: null, people: {}, takenAddresses: new Set() } as never,
    )
    expect(plan.ok).toBe(true)
    if (plan.ok) expect(plan.seats[0].name).toBe('Sharath')
  })

  it('timesheets at the company’s own address is a shared sign-in, shown by its address and never as a person called Timesheets', () => {
    expect(isSharedSignIn('timesheets@etyme.com')).toBe(true)
    expect(isSharedSignIn('Support@Tapin.example')).toBe(true)
    const [s] = seatsFrom([row({ id: 'a', role: { name: 'AP & Payroll' }, person: { name: 'Timesheets', primaryEmail: 'timesheets@etyme.com', credentials: [] } })], 'Tapin')
    expect(s.shared).toBe(true)
    expect(s.name).toBe('timesheets@etyme.com')
    expect(personNameFor('Hradmin', 'hradmin@etyme.com', 'Tapin')).toBe('hradmin@etyme.com')
    expect(personNameFor('', 'payroll@etyme.com', 'Tapin')).toBe('payroll@etyme.com')
    expect(personNameFor('Tapin', 'support@etyme.com', 'Tapin')).toBe('support@etyme.com')
  })

  it('oliver at the company is Oliver and never a shared sign-in, even where his name matches his address', () => {
    expect(isSharedSignIn('oliver@etyme.com')).toBe(false)
    const [s] = seatsFrom([row({ id: 'a', person: { name: 'Oliver', primaryEmail: 'oliver@etyme.com', credentials: [{ id: 'c' }] } })], 'Tapin')
    expect(s.shared).toBe(false)
    expect(s.name).toBe('Oliver')
  })

  it('a partner on a personal mail address is never a shared sign-in, whatever comes before the @', () => {
    expect(isSharedSignIn('admin@gmail.com')).toBe(false)
    expect(isSharedSignIn('hr@yahoo.com')).toBe(false)
    expect(isSharedSignIn('sidhu871@gmail.com')).toBe(false)
    expect(personNameFor('', 'admin@gmail.com', 'Tapin')).toBe('Admin')
  })

  it('a name somebody typed for a shared sign-in stays the name shown', () => {
    expect(personNameFor('Accounts team', 'accounts@etyme.com', 'Tapin')).toBe('Accounts team')
  })

  it('a shared sign-in is still listed and counted exactly as before: invited, waiting, with access or paused', () => {
    const shared = (id: string, o: Partial<Row> = {}) => row({ id, person: { name: '', primaryEmail: `${id}@tapin.example`, credentials: [] }, invitedAt: day, lastUsedAt: null, ...o })
    const seats = seatsFrom([row({ id: 'owner' }), shared('timesheets'), shared('support', { suspendedAt: day })], 'Tapin')
    expect(seats.filter((s) => s.shared)).toHaveLength(2)
    expect(peopleOf(seats)).toHaveLength(3)
    expect(countSeats(peopleOf(seats))).toEqual({ withAccess: 1, invited: 1, waitingForRole: 0, paused: 1 })
  })

  it('the staff tool stores a shared sign-in with no name typed as its address, and still never names a seat with the company’s name', () => {
    const plan = planBootstrap(
      { name: 'Tapin', kind: 'VENDOR', domain: 'etyme.com', address: 'tapin', seats: [
        { email: 'sharath@etyme.com', role: 'Owner', name: 'Tapin' },
        { email: 'timesheets@etyme.com', role: 'AP & Payroll' },
        { email: 'oliver@etyme.com', role: 'Account Manager' },
      ] } as never,
      { company: null, people: {}, takenAddresses: new Set() } as never,
    )
    expect(plan.ok).toBe(true)
    if (plan.ok) expect(plan.seats.map((s) => s.name)).toEqual(['Sharath', 'timesheets@etyme.com', 'Oliver'])
  })

  it('Team structure names a seat with the one reader’s words, so a shared sign-in reads as its address there too', () => {
    expect(read('src/lib/team-structure/read.ts')).toContain('person: { name: c.name, email: c.email }')
  })

  it('the setup checklist counts teammates beside the person who set the company up, invited ones included, and a one-person firm reads nought, never minus one', () => {
    expect(teammatesOf([])).toBe(0)
    expect(teammatesOf(seatsFrom([row({ id: 'owner' })], 'Solo LLC'))).toBe(0)
    expect(teammatesOf(seatsFrom([row({ id: 'owner' }), invited('b'), row({ id: 'c', type: 'CONSULTANT' })], 'Tapin'))).toBe(1)
  })

  it('the company’s people are said with what was counted: “6 people: 3 with access · 3 invited”', () => {
    const seats = seatsFrom([row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' }), invited('d'), invited('e'), invited('f')], 'Tapin')
    expect(peopleWords(countSeats(peopleOf(seats)))).toBe('6 people: 3 with access · 3 invited')
    expect(peopleWords({ withAccess: 1, invited: 0, waitingForRole: 0, paused: 0 })).toBe('1 person: 1 with access')
    expect(peopleWords({ withAccess: 0, invited: 0, waitingForRole: 0, paused: 0 })).toBe('Nobody here yet.')
  })

  it('Settings, Team structure, the setup checklist and Give access all read the one reader, and the Owners reader is left as it was for the last-Owner guard', () => {
    for (const f of [
      'src/app/api/settings/route.ts',
      'src/lib/team-structure/read.ts',
      'src/lib/setup-checklist-state.ts',
      'src/lib/setup-state.ts',
      'src/app/api/settings/setup/read.ts',
      'src/app/api/settings/grants/route.ts',
    ]) expect(read(f), f).toContain('readCompanySeats(')
    expect(read('src/lib/owner-asks.ts')).not.toContain('company-seats')
  })

  it('the reader is keyed on one company, so a person with seats at two companies is counted at each and never in the other’s list', () => {
    expect(read('src/lib/company-seats.ts')).toContain('where: { companyId, revokedAt: null }')
  })

  it('Team structure counts only seats, so the company’s own box is drawn once and never counted among its people', () => {
    const src = read('src/lib/team-structure/read.ts')
    expect(src).toContain('peopleSays: peopleWords(countSeats(seats))')
    expect(src).toContain('peopleOf(all)')
  })
})

describe('a role says who holds it: with access, invited and paused, and never “persons”', () => {
  it('the Admin role with three people invited who never signed in reads “0 with access · 3 invited”, not “3 people”', () => {
    const seats = seatsFrom([invited('a'), invited('b'), invited('c')], 'Tapin')
    expect(roleHeldWords(countsByRole(seats).get('r-admin'))).toBe('0 with access · 3 invited')
  })

  it('a role reads its people with access first, then invited and paused only where they are not nought', () => {
    expect(countWords({ withAccess: 2, invited: 0, waitingForRole: 0, paused: 0 })).toBe('2 with access')
    expect(countWords({ withAccess: 2, invited: 1, waitingForRole: 0, paused: 1 })).toBe('2 with access · 1 invited · 1 paused')
    expect(countWords({ withAccess: 2, invited: 0, waitingForRole: 0, paused: 3 })).toBe('2 with access · 3 paused')
  })

  it('a role nobody holds reads “nobody holds this yet”, and only when all three are nought', () => {
    expect(roleHeldWords(undefined)).toBe('nobody holds this yet')
    expect(roleHeldWords({ withAccess: 0, invited: 0, waitingForRole: 0, paused: 1 })).toBe('0 with access · 1 paused')
  })

  it('the Roles list never uses the word persons, and a refusal to delete a role says people', () => {
    expect(read('src/app/dashboard/settings/page.tsx')).not.toMatch(/persons|person\$\{|person\(s\)/)
    expect(read('src/app/api/settings/roles/route.ts')).not.toContain('person(s)')
  })

  it('a role with only invited or paused people is not deletable as if nobody held it: the guard counts every seat that holds it', () => {
    const src = read('src/app/api/settings/roles/route.ts')
    expect(src).toContain('_count: { select: { contexts: true } }')
    expect(src).toContain('if (existing._count.contexts > 0)')
    // And Settings keeps the full count beside the words.
    expect(read('src/app/api/settings/route.ts')).toContain('heldBy: heldBy.get(r.id) ?? 0')
  })

  it('who can see the outside market counts only people with access', () => {
    expect(read('src/app/api/settings/route.ts')).toContain('heldBy: (byRole.get(r.id) ?? none).withAccess')
  })
})

describe('what a role can do is counted against the whole catalog, for display only', () => {
  const N = PERMISSIONS.length

  it('a role holding everything reads “Everything (N)”, where N is the length of the catalog', () => {
    const owner = roleCanDo({ permissions: ['*'] })
    expect(owner).toMatchObject({ everything: true, count: N, of: N, words: `Everything (${N})` })
  })

  it('a role holding a stored copy of every permission reads the same as one holding the whole catalog', () => {
    expect(roleCanDo({ permissions: [...PERMISSIONS] }).words).toBe(`Everything (${N})`)
  })

  it('Member reads “none yet”', () => {
    expect(roleCanDo({ permissions: [] }).words).toBe('none yet')
  })

  it('any other role reads “M of N”, and a name no longer in the catalog is not counted', () => {
    const r = roleCanDo({ permissions: [PERMISSIONS[0], PERMISSIONS[1], 'no.longer.a.permission'] })
    expect(r.words).toBe(`2 of ${N}`)
    expect(r.list).toEqual([PERMISSIONS[0], PERMISSIONS[1]])
  })

  it('the Admin that holds all but one reads “N−1 of N”, the permissions it can actually use', () => {
    expect(roleCanDo({ permissions: PERMISSIONS.filter((p) => p !== 'pnl.read') }).words).toBe(`${N - 1} of ${N}`)
  })

  it('counting a role never changes what it may do: the stored list is read, never written', () => {
    const stored = ['assignments.read']
    roleCanDo({ permissions: stored })
    expect(stored).toEqual(['assignments.read'])
    expect(read('src/lib/company-roles.ts').match(/export function roleCanDo[\s\S]*?\n}\n/)![0]).not.toMatch(/prisma|update/)
  })

  it('the Roles list and the Give access list name the same number of permissions, and the right to give access is said apart', () => {
    const src = read('src/app/api/settings/grants/route.ts')
    expect(src).toContain('const permissions = options.filter((o) => o.key !== GRANT_RIGHT)')
    expect(src).toContain('catalogCount: PERMISSIONS.length')
    expect(src).toContain('ownerRight,')
    expect(read('src/components/settings/give-access.tsx')).toContain('Only an Owner gives this')
    expect(read('src/app/dashboard/settings/page.tsx')).toContain('`Permissions: ${r.canDo.words}`')
  })

  it('a company just added prints each role’s permissions against the catalog, so the Owner’s role reads everything and never one', () => {
    const src = read('src/app/api/companies/route.ts')
    expect(src).toContain('permissionCount: roleCanDo(r).count,')
    expect(src).toContain('permissions: roleCanDo(r).words,')
    expect(src).not.toContain('permissionCount: r.permissions.length')
  })
})
