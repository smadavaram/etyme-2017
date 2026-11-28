import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  reviewAccess, assessDeskChange, figureWords, FINDING_WORDS,
  ENDED_HEADING, RENEW_LABEL, NO_END_DATE, KEPT_OPEN_COLUMN,
} from '@/lib/access-grant'
import { offersFor, peopleHeadline, readOnTheirDates } from '@/app/api/access/row-acts'
import { seatsFrom } from '@/lib/company-seats'
import { liveRoleNames } from '@/app/api/contracts/[id]/activate/gate'
import { ADMIN_PERMISSIONS } from '@/lib/company-defaults'

/**
 * Users & permissions reads each seat's end date (fix list layer 4,
 * 2026-11-15). A seat past its date stopped working at the caller check,
 * and the page still listed it under "with access" while the figure left
 * it out, read lowercase "ended", offered no Renew, and named it as
 * somebody to ask. The rule is read with a `now` passed in, so no test
 * here leans on the clock.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const now = new Date('2030-03-10T12:00:00Z')
const days = (n: number) => new Date(now.getTime() + n * 86_400_000)
const ADMIN = [...ADMIN_PERMISSIONS] as string[]

describe('a seat past its end date leaves "with access" for its own short list', () => {
  const page = read('src/app/dashboard/access/page.tsx')
  const route = read('src/app/api/access/route.ts')

  it('a seat past its end date is listed under access ended with the date, never under with access, and the figures agree', () => {
    expect(ENDED_HEADING).toBe('Access ended')
    // Both lists the figures count leave an ended seat out, and the one
    // list it is on is drawn under its own heading.
    expect(route).toContain("const withAccess = listed.filter(c => isOpen(c.id) && seatPlace(")
    expect(route).toContain("const waiting = listed.filter(c => isOpen(c.id) && seatPlace(")
    expect(route).toContain('const endedSeats = listed.filter(c => !isOpen(c.id))')
    expect(page).toContain('<h2 className="font-serif text-lg text-etyme-ink mb-3">{ENDED_HEADING}</h2>')
    // No row computes "ended" from the clock on the screen.
    expect(page).not.toContain('`ended ${formatDay(iso)}`')
    expect(NO_END_DATE).toBe('No end date')
  })

  it('the headline says how many people whose access ended are listed, so it and the list agree', () => {
    expect(peopleHeadline('4 people: 4 with access', 0, 2)).toBe('4 people: 4 with access. Also listed: 2 people whose access ended, not counted.')
    expect(peopleHeadline('4 people: 4 with access', 0, 1)).toBe('4 people: 4 with access. Also listed: 1 person whose access ended, not counted.')
    expect(peopleHeadline('4 people: 4 with access', 3, 1)).toBe('4 people: 4 with access. Also listed: 3 consultants on your books and 1 person whose access ended, none counted among your people.')
    expect(peopleHeadline('4 people: 4 with access', 0, 0)).toBe('4 people: 4 with access')
  })

  it('an access ended row wraps at phone width, its Renew dropping under the name, and nothing on it refuses to shrink', () => {
    const a = page.indexOf('const endedRow = (e: Ended) => (')
    const row = page.slice(a, page.indexOf('{granting === e.contextId && (', a))
    const classes = [...row.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)].map((m) => m[1] ?? m[2])
    const flex = classes.filter((c) => /(^|\s)flex(\s|$)/.test(c) && !c.includes('flex-col'))
    expect(flex.length).toBeGreaterThan(0)
    for (const c of flex) expect(c).toContain('flex-wrap')
    for (const c of classes) expect(c).not.toContain('shrink-0')
    expect(row).toContain('className="flex flex-wrap items-center gap-2 w-full sm:w-auto"')
  })

  it('the access ended list is not drawn while a figure filters the list, because no figure counts it', () => {
    expect(page).toContain('{!activeFigure && endedRows.length > 0 && (')
  })
})

describe('Renew on a seat whose access has ended', () => {
  const page = read('src/app/dashboard/access/page.tsx')
  const change = (o: Partial<Parameters<typeof assessDeskChange>[0]> = {}) => ({
    fromRole: 'Recruiter', toRole: 'Recruiter', actorIsOwner: false,
    fromCanGiveDesks: false, toCanGiveDesks: false, othersWhoCanGiveDesks: 1, personName: 'Lee Park', ...o,
  })

  it('a seat that may change roles is offered Renew on an ended seat, which opens Change role with the same role', () => {
    expect(RENEW_LABEL).toBe('Renew')
    // The same role, the reason it was last given, and the same route.
    expect(page).toContain("setForm(opening ? { roleId: e.roleId ?? '', endsOn: '', reason: e.reason ?? '' }")
    expect(page).toContain('{pickable.map(r => <option key={r.id} value={r.id}>{roleWords(r.name)}</option>)}')
    expect(page).toContain('onClick={() => grant(e.contextId)}')
    expect(page).toContain("{form.roleId && form.roleId === e.roleId ? 'Renew access' : 'Change role'}")
    // The grant route takes the same role on a seat whose date has come.
    expect(assessDeskChange(change({ renewing: true }))).toEqual({ allowed: true })
  })

  it('a seat still in date given the role it holds is refused as before', () => {
    expect(assessDeskChange(change())).toEqual({ allowed: false, says: 'Lee Park already works as Recruiter.' })
  })

  it('renewing never lets an Admin make somebody an Owner', () => {
    expect(assessDeskChange(change({ fromRole: 'Owner', toRole: 'Owner', renewing: true })).allowed).toBe(false)
  })

  it('a seat that may not renew reads who may, and never a greyed button', () => {
    expect(page).toContain('{e.renew ? (')
    expect(page).toContain('text-xs text-etyme-muted break-words">{e.whyNoRenew}</span>')
  })
})

describe('a seat kept open past its end date', () => {
  const page = read('src/app/dashboard/access/page.tsx')
  const held = { contextId: 'o', personName: 'Dana Reyes', roleName: 'Owner', permissions: ['*'], grantedAt: days(-90), expiresAt: days(-10), lastUsedAt: days(-1) }
  const kept = 'End date March 1, 2030 has passed. An Owner’s access never ends by date, so it stays open.'

  it('an Owner kept past its date reads why it stays open, never ended', () => {
    const [r] = reviewAccess([{ ...held, keptSays: kept }], now)
    expect(r.finding).toBe('EXPIRED')
    expect(r.detail).toBe(kept)
    expect(FINDING_WORDS.EXPIRED).toBe('past its end date')
    expect(`${FINDING_WORDS.EXPIRED} ${r.detail} ${r.suggestion}`).not.toMatch(/\bended\b/i)
    // The row draws the kept line and a column that never says "ended".
    expect(KEPT_OPEN_COLUMN).toBe('Kept open')
    expect(page).toContain('{p.keptPastEndDate ? KEPT_OPEN_COLUMN : until(p.dateLine)}')
    expect(page).toContain('{p.keptPastEndDate && p.dateLine && (')
  })

  it('Needs a decision counts a kept seat as past its end date, never as ended', () => {
    const one = figureWords('decision', 1, { noRole: 0, ended: 1, neverUsed: 0, notUsedLately: 0, endingSoon: 0 })!
    expect(one.says).toBe('1 to decide: 1 past its end date. Give a role, renew it or end it.')
    const two = figureWords('decision', 2, { noRole: 0, ended: 2, neverUsed: 0, notUsedLately: 0, endingSoon: 0 })!
    expect(two.says).toBe('2 to decide: 2 past their end date. Give a role, renew it or end it.')
  })
})

describe('who may pause, end or give roles is read on each seat’s end date', () => {
  const route = read('src/app/api/access/route.ts')
  const row = (id: string, over: Record<string, unknown> = {}) => ({
    contextId: id, personId: `p-${id}`, hasSignedIn: true, roleId: 'r-admin', rolePermissions: ADMIN,
    suspendedAt: null, revokedAt: null, isOwner: false, expiresAt: null as Date | null, ...over,
  })

  it('who may pause or end never names a seat whose access has ended', () => {
    // The sentence names only live seats in date (`liveSeats`).
    expect(route).toContain('seatedSays(PAUSE_OR_END_DOING, contexts\n      .filter(c => liveSeats.includes(c) && hasPermission(')
    expect(route).toMatch(/const liveSeats = contexts\.filter\(c => [^\n]*isOpen\(c\.id\)\)/)
  })

  it('a seat whose access has ended never counts as somebody else who can still manage access', () => {
    const kit = row('kit', { expiresAt: days(60) })
    const old = row('old', { expiresAt: days(-5) })
    const onDates = readOnTheirDates([kit, old], now)
    expect(onDates.find((r) => r.contextId === 'old')!.revokedAt).toEqual(days(-5))
    expect(onDates.find((r) => r.contextId === 'kit')!.revokedAt).toBeNull()
    // So the one seat still in date is offered neither Pause nor End.
    const offers = offersFor(onDates, { isOwner: false, personId: 'p-kit' }, true)
    expect(offers.get('kit')!.pause).toBe(false)
    expect(offers.get('kit')!.end).toBe(false)
    // Read on the dates, never written: the rows handed in are unchanged.
    expect(old.revokedAt).toBeNull()
  })

  it('the seat being acted on is read as it is, so its own state decides the act', () => {
    const old = row('old', { expiresAt: days(-5) })
    expect(readOnTheirDates([row('kit'), old], now, 'old').find((r) => r.contextId === 'old')!.revokedAt).toBeNull()
  })

  it('giving roles counts only the seats open on their end dates, on both counters', () => {
    expect(route).toContain('const onDates = await openSeatsHere(caller.company.id)')
    expect(route).toContain('.filter(r => seatByDate(dated(r), all, now).open)')
    expect(route).not.toContain("role: { permissions: { hasSome: ['*', 'settings.manage'] } }")
  })

  it('pausing and ending on a seat reads the other seats on their end dates', () => {
    const seatRoute = read('src/app/api/access/[contextId]/route.ts')
    expect(seatRoute.match(/await loadAll\(caller\.company\.id, contextId\)/g)?.length).toBe(3)
    expect(seatRoute).toContain('return readOnTheirDates(rows.map((r) => ({')
  })
})

describe('Compliance never names a seat whose access has ended as the one who activates', () => {
  type Row = Parameters<typeof seatsFrom>[0][number]
  const row = (id: string, roleName: string, expiresAt: Date | null): Row => ({
    id, personId: `p-${id}`, type: 'EMPLOYEE', roleId: `r-${roleName}`, orgUnitId: null,
    grantedAt: days(-90), invitedAt: null, lastUsedAt: null, suspendedAt: null, revokedAt: null, expiresAt,
    role: { name: roleName, permissions: roleName === 'Owner' ? ['*'] : roleName === 'Admin' ? ADMIN : ['assignments.write'] },
    person: { name: `Person ${id}`, primaryEmail: `${id}@northwind-staffing.example` },
  })

  it('the roles Compliance names are read from the live seats, and a seat past its end date is not one of them', () => {
    const seats = seatsFrom([row('a', 'Owner', null), row('b', 'Contract Manager', days(-2)), row('c', 'HR', days(30))], 'Northwind Staffing', now)
    expect(liveRoleNames(seats)).toEqual(['Owner', 'HR'])
    const route = read('src/app/api/compliance/route.ts')
    expect(route).toContain('liveRoleNames(await readCompanySeats(caller.company.id))')
  })
})
