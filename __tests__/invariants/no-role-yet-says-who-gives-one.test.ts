/**
 * Fix list, layer 4, people and access (2026-11-15): a person invited
 * with no role opened Ask Etyme and was never told who gives her one.
 * The sentence, its three branches, and where the greeting says it.
 * The database half (who is live, who invited her) is walked in
 * __integration__/no-role-yet-says-who-gives-one.test.ts.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { noRoleYetSays, holdsNoRole, whoGivesRoles, type GiverSeat } from '@/app/api/conversations/twin/no-role'
import { seatsFrom } from '@/lib/company-seats'
import { canGiveDesks } from '@/lib/access-grant'
import { nothingOfTheFirm } from '@/app/api/conversations/twin/hat'
import { workerToday, type WorkerFacts } from '@/app/api/conversations/twin/worker'

const ROUTE = readFileSync(join(process.cwd(), 'src/app/api/conversations/twin/route.ts'), 'utf8')
const LEAD = 'Nobody has given you a role here yet.'

const words = (s: string) => s.split(/\s+/).filter(Boolean).length
const sentences = (s: string) => s.split(/(?<=\.)\s+/)

/** A firm's own employee with nothing on the record yet. */
const EMPLOYEE: WorkerFacts = {
  seat: 'EMPLOYEE', seatAt: 'Harborline Tech', placements: [], toFile: [], returned: [], sent: [], ownCompanyBills: null, weeksWithNoRate: 0,
  papers: [], runningOut: [], interviews: [], stays: [], consent: { benches: [], asking: [], employers: [] }, unread: [], pageOn: null,
}

describe('a seat with no role is told who gives her one', () => {
  it('a person invited by a colleague who may still give roles is told to ask that colleague by name', () => {
    expect(noRoleYetSays({ inviter: 'Lee Park', roles: ['Owner', 'Admin'] }, 'Harborline Tech'))
      .toBe(`${LEAD} Ask Lee Park, who invited you, to give you one.`)
  })

  it('where the person who invited her may no longer give roles, she is told which roles here do', () => {
    expect(noRoleYetSays({ inviter: null, roles: ['Admin', 'Owner', 'Admin'] }, 'Harborline Tech'))
      .toBe(`${LEAD} Giving roles is for the Owner or an Admin here. Ask one of them.`)
  })

  it('where only the Owner may give roles, she is told to ask the Owner', () => {
    expect(noRoleYetSays({ inviter: null, roles: ['Owner'] }, 'Harborline Tech'))
      .toBe(`${LEAD} Giving roles is for the Owner here. Ask them.`)
  })

  it('where no live seat may give roles, she is told to ask an Owner or Admin of the firm', () => {
    expect(noRoleYetSays({ inviter: null, roles: [] }, 'Harborline Tech'))
      .toBe(`${LEAD} Ask an Owner or Admin of Harborline Tech to give you one.`)
  })

  it('every sentence it says is under twenty-five words', () => {
    for (const who of [
      { inviter: 'Alexandra Montgomery-Whitfield', roles: [] },
      { inviter: null, roles: ['Owner', 'Admin', 'HR'] },
      { inviter: null, roles: [] },
    ]) {
      for (const s of sentences(noRoleYetSays(who, 'Northwind Staffing Partners International'))) expect(words(s)).toBeLessThan(25)
    }
  })

  it('a seat with only the Member role, or no role at all, holds no role; any other role is a role', () => {
    expect(holdsNoRole(null)).toBe(true)
    expect(holdsNoRole('')).toBe(true)
    expect(holdsNoRole('Member')).toBe(true)
    expect(holdsNoRole('Validation Engineer')).toBe(false)
    expect(holdsNoRole('Admin')).toBe(false)
  })
})

describe('only a live seat that may give roles is ever named', () => {
  const now = new Date()
  const dayAgo = new Date(now.getTime() - 86_400_000)
  const dayOn = new Date(now.getTime() + 86_400_000)
  const ana = { contextId: 'c-ana', personId: 'p-ana', invitedById: 'p-lee' }
  const lee = (over: Partial<GiverSeat> = {}): GiverSeat => ({
    contextId: 'c-lee', personId: 'p-lee', name: 'Lee Park', roleName: 'Admin', state: 'WITH_ACCESS', mayGive: true, ...over,
  })
  const dana: GiverSeat = { contextId: 'c-dana', personId: 'p-dana', name: 'Dana Reyes', roleName: 'Owner', state: 'WITH_ACCESS', mayGive: true }

  /**
   * A seat row at Harborline Tech as the one seat reader reads it from the
   * database. The reader's own pure half (`seatsFrom`) decides which seats
   * are live on their end date, and its answer is what whoGivesRoles reads.
   */
  const ALL = ['*']
  const row = (id: string, name: string, role: string, permissions: string[], expiresAt: Date | null = null) => ({
    id: `c-${id}`, personId: `p-${id}`, type: 'EMPLOYEE', roleId: `r-${role}`, orgUnitId: null, grantedAt: dayAgo,
    invitedAt: null, lastUsedAt: dayAgo, suspendedAt: null, revokedAt: null, expiresAt,
    role: { name: role, permissions },
    person: { name, primaryEmail: `${id}@harborline-tech.example` },
  })
  const asTheReaderSays = (rows: ReturnType<typeof row>[]): GiverSeat[] =>
    seatsFrom(rows, 'Harborline Tech', now).map((s) => ({ ...s, mayGive: canGiveDesks(rows.find((r) => r.id === s.contextId)!.role.permissions) }))

  it('an inviter whose seat is live and may give roles is named', () => {
    expect(whoGivesRoles([lee(), dana], ana)).toEqual({ inviter: 'Lee Park', roles: ['Admin', 'Owner'] })
  })

  it('an inviter whose seat has ended is never named, and she is told which roles give roles', () => {
    const seats = asTheReaderSays([row('lee', 'Lee Park', 'Admin', ALL, dayAgo), row('dana', 'Dana Reyes', 'Owner', ALL), row('ana', 'Ana Silva', 'Member', [])])
    const who = whoGivesRoles(seats, ana)
    expect(who).toEqual({ inviter: null, roles: ['Owner'] })
    const said = noRoleYetSays(who, 'Harborline Tech')
    expect(said).toBe(`${LEAD} Giving roles is for the Owner here. Ask them.`)
    expect(said).not.toContain('Lee Park')
  })

  it('an Owner kept open past the end date is still named as one who gives roles', () => {
    const seats = asTheReaderSays([row('dana', 'Dana Reyes', 'Owner', ALL, dayAgo), row('ana', 'Ana Silva', 'Member', [])])
    expect(whoGivesRoles(seats, { ...ana, invitedById: 'p-dana' })).toEqual({ inviter: 'Dana Reyes', roles: ['Owner'] })
    expect(whoGivesRoles(seats, ana)).toEqual({ inviter: null, roles: ['Owner'] })
    expect(noRoleYetSays(whoGivesRoles(seats, ana), 'Harborline Tech')).toBe(`${LEAD} Giving roles is for the Owner here. Ask them.`)
  })

  it('a seat that ends at this moment or earlier has ended; one that ends tomorrow has not', () => {
    const dana_ = row('dana', 'Dana Reyes', 'Owner', ALL)
    expect(whoGivesRoles(asTheReaderSays([row('lee', 'Lee Park', 'Admin', ALL, now), dana_]), ana).inviter).toBeNull()
    expect(whoGivesRoles(asTheReaderSays([row('lee', 'Lee Park', 'Admin', ALL, dayAgo), dana_]), ana).inviter).toBeNull()
    expect(whoGivesRoles(asTheReaderSays([row('lee', 'Lee Park', 'Admin', ALL, dayOn), dana_]), ana).inviter).toBe('Lee Park')
    expect(whoGivesRoles(asTheReaderSays([row('lee', 'Lee Park', 'Admin', ALL, null), dana_]), ana).inviter).toBe('Lee Park')
  })

  it('an inviter who never signed in, or is paused, is never named', () => {
    expect(whoGivesRoles([lee({ state: 'INVITED' }), dana], ana).inviter).toBeNull()
    expect(whoGivesRoles([lee({ state: 'PAUSED' }), dana], ana).inviter).toBeNull()
  })

  it('an inviter whose role may no longer give roles is never named, and her role is not offered', () => {
    expect(whoGivesRoles([lee({ mayGive: false, roleName: 'Recruiter' }), dana], ana)).toEqual({ inviter: null, roles: ['Owner'] })
  })

  it('a seat whose end date has passed is never counted among the roles that give roles, unless it is an Owner’s', () => {
    const seats = asTheReaderSays([
      row('lee', 'Lee Park', 'Admin', ALL, dayAgo), row('kim', 'Kim Ortiz', 'Admin', ALL, dayAgo),
      row('dana', 'Dana Reyes', 'Owner', ALL, dayAgo), row('ana', 'Ana Silva', 'Member', []),
    ])
    expect(whoGivesRoles(seats, ana)).toEqual({ inviter: null, roles: ['Owner'] })
  })

  it('a person is never told to ask herself', () => {
    expect(whoGivesRoles([lee({ contextId: 'c-ana', personId: 'p-ana' })], { ...ana, invitedById: 'p-ana' })).toEqual({ inviter: null, roles: [] })
  })
})

describe('where the greeting says it', () => {
  it('in the firm’s hat, the line about the firm is followed by who gives her a role', () => {
    const noRole = noRoleYetSays({ inviter: 'Lee Park', roles: [] }, 'Harborline Tech')
    expect(nothingOfTheFirm('Harborline Tech', false, noRole))
      .toBe(`Nothing of Harborline Tech’s is addressed to you; your own work is under You, in the account menu. ${noRole}`)
    expect(nothingOfTheFirm('Harborline Tech', true, noRole)).toBe(`Your own work is under You, in the account menu. ${noRole}`)
  })

  it('a seat with a role reads the firm hat’s line exactly as before', () => {
    expect(nothingOfTheFirm('Tellisford Solutions')).toBe('Nothing of Tellisford Solutions’ is addressed to you; your own work is under You, in the account menu.')
    expect(nothingOfTheFirm('Tellisford Solutions', false, null)).toBe(nothingOfTheFirm('Tellisford Solutions'))
  })

  it('a firm’s own employee with no role and no work reads who gives her a role under the headline', () => {
    const noRole = noRoleYetSays({ inviter: 'Lee Park', roles: [] }, 'Harborline Tech')
    const greeted = workerToday(EMPLOYEE, { greeting: true, noRole })
    expect(greeted.more.map((l) => l.says)).toEqual([noRole])
  })

  it('without the line, the employee’s greeting is what it was', () => {
    const before = workerToday(EMPLOYEE, { greeting: true })
    expect(workerToday(EMPLOYEE, { greeting: true, noRole: null })).toEqual(before)
    expect(before.more.map((l) => l.says).join(' ')).not.toContain(LEAD)
  })

  it('a consultant on a firm’s bench is never told about a role at a firm', () => {
    const consultant: WorkerFacts = { ...EMPLOYEE, seat: 'CONSULTANT', seatAt: null, pageOn: true }
    const greeted = workerToday(consultant, { greeting: true, noRole: `${LEAD} Ask Lee Park, who invited you, to give you one.` })
    expect(greeted.more.map((l) => l.says).join(' ')).not.toContain(LEAD)
  })

  it('the greeting, the firm hat and every question typed in it all ask the one reader', () => {
    expect(ROUTE).toMatch(/nothingOfTheFirm\(caller\.company!\.name, since\.length > 0, noRole\)/)
    expect(ROUTE).toMatch(/nothingOfTheFirm\(caller\.company!\.name, false, await noRoleLineFor\(caller\)/)
    expect(ROUTE).toMatch(/own \? null : noRoleLineFor\(caller\)/)
  })
})
