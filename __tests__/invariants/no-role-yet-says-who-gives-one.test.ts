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
import { noRoleYetSays, holdsNoRole } from '@/app/api/conversations/twin/no-role'
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

describe('where the greeting says it', () => {
  it('in the firm’s hat, the line about the firm is followed by who gives her a role', () => {
    const noRole = noRoleYetSays({ inviter: 'Lee Park', roles: [] }, 'Harborline Tech')
    expect(nothingOfTheFirm('Harborline Tech', false, noRole))
      .toBe(`Nothing of Harborline Tech’s is addressed to you; your own work is under You, in the account menu. ${noRole}`)
    expect(nothingOfTheFirm('Harborline Tech', true, noRole)).toBe(`Your own work is under You, in the account menu. ${noRole}`)
  })

  it('a seat with a role reads the firm hat’s line exactly as before', () => {
    expect(nothingOfTheFirm('Teleworld Solutions')).toBe('Nothing of Teleworld Solutions’ is addressed to you; your own work is under You, in the account menu.')
    expect(nothingOfTheFirm('Teleworld Solutions', false, null)).toBe(nothingOfTheFirm('Teleworld Solutions'))
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
