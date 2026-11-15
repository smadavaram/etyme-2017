import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { seatByDate, pastEndDate, endedByDateSays, seatDateLine, type DatedSeat } from '@/lib/account-lifecycle'
import { whenThereIsNoSeat } from '@/lib/api-context'
import { deniedFor } from '@/lib/denied'
import { seatsFrom, peopleOf, countSeats } from '@/lib/company-seats'
import { formatDay } from '@/lib/format-date'
import { ADMIN_PERMISSIONS } from '@/lib/company-defaults'

/**
 * A seat's end date ends it (fix list layer 4, 2026-11-15). Users &
 * permissions gives a role "until <date> unless renewed", and nothing read
 * the date: a seat past it still signed in, acted, was counted and was
 * named as somebody to ask. The rule is read with a `now` passed in, so no
 * test here leans on the clock.
 */

const now = new Date('2030-03-10T12:00:00Z')
const days = (n: number) => new Date(now.getTime() + n * 86_400_000)
const OWNER = ['*']
const ADMIN = [...ADMIN_PERMISSIONS] as string[]
const RECRUITER = ['submissions.write', 'requirements.read']

function seat(o: Partial<DatedSeat> & { contextId: string }): DatedSeat {
  return {
    companyId: 'northwind', expiresAt: null, isOwner: false, rolePermissions: RECRUITER,
    revokedAt: null, suspendedAt: null, hasSignedIn: true, ...o,
  }
}

describe('a seat past its end date is ended, and nobody is locked out by a date', () => {
  it('a seat whose end date is tomorrow still works', () => {
    const s = seat({ contextId: 'a', expiresAt: days(1) })
    expect(seatByDate(s, [s], now)).toEqual({ open: true, kept: null })
    expect(pastEndDate(days(1), now)).toBe(false)
  })

  it('a seat whose end date is now, or yesterday, is ended', () => {
    for (const at of [now, days(-1)]) {
      const s = seat({ contextId: 'a', expiresAt: at })
      expect(seatByDate(s, [s], now)).toEqual({ open: false, endedOn: at })
    }
  })

  it('a seat with no end date never ends by date', () => {
    const s = seat({ contextId: 'a' })
    expect(seatByDate(s, [s], now).open).toBe(true)
  })

  it('an Owner’s seat is never ended by its date', () => {
    const owner = seat({ contextId: 'o', isOwner: true, rolePermissions: OWNER, expiresAt: days(-30) })
    const admin = seat({ contextId: 'a', rolePermissions: ADMIN, expiresAt: days(200) })
    expect(seatByDate(owner, [owner, admin], now)).toEqual({ open: true, kept: 'OWNER', endedOn: days(-30) })
  })

  it('the last seat that may manage access is never ended by its date', () => {
    const admin = seat({ contextId: 'a', rolePermissions: ADMIN, expiresAt: days(-2) })
    const recruiter = seat({ contextId: 'r', rolePermissions: RECRUITER })
    expect(seatByDate(admin, [admin, recruiter], now)).toEqual({ open: true, kept: 'LAST_MANAGER', endedOn: days(-2) })
  })

  it('a seat that may manage access is ended by its date once somebody else in date may manage access', () => {
    const admin = seat({ contextId: 'a', rolePermissions: ADMIN, expiresAt: days(-2) })
    const second = seat({ contextId: 'b', rolePermissions: ADMIN, expiresAt: days(90) })
    expect(seatByDate(admin, [admin, second], now)).toEqual({ open: false, endedOn: days(-2) })
  })

  it('an Owner past its own date still counts as somebody who may manage access', () => {
    const owner = seat({ contextId: 'o', isOwner: true, rolePermissions: OWNER, expiresAt: days(-5) })
    const admin = seat({ contextId: 'a', rolePermissions: ADMIN, expiresAt: days(-2) })
    expect(seatByDate(admin, [admin, owner], now).open).toBe(false)
  })

  it('nobody paused, ended, past date or never signed in rescues a manager’s seat from being kept', () => {
    const admin = seat({ contextId: 'a', rolePermissions: ADMIN, expiresAt: days(-2) })
    const others = [
      seat({ contextId: 'p', rolePermissions: ADMIN, suspendedAt: days(-1) }),
      seat({ contextId: 'x', rolePermissions: ADMIN, revokedAt: days(-1) }),
      seat({ contextId: 'd', rolePermissions: ADMIN, expiresAt: days(-9) }),
      seat({ contextId: 'i', rolePermissions: ADMIN, hasSignedIn: false }),
      seat({ contextId: 'e', rolePermissions: ADMIN, companyId: 'elsewhere' }),
    ]
    expect(seatByDate(admin, [admin, ...others], now).open).toBe(true)
  })

  it('a seat that may only invite and end access is kept while nobody else may, even where another may give roles', () => {
    const inviter = seat({ contextId: 'a', rolePermissions: ['team.manage'], expiresAt: days(-2) })
    const giver = seat({ contextId: 'b', rolePermissions: ['settings.manage'] })
    expect(seatByDate(inviter, [inviter, giver], now).open).toBe(true)
  })
})

describe('what a seat past its end date reads, and what its row says', () => {
  it('a seat past its end date cannot act, and is told in one sentence that its access ended and who renews it', () => {
    const v = whenThereIsNoSeat({
      email: 'dana@northwind-staffing.example', isStaff: false, paused: null,
      expired: { companyName: 'Northwind Staffing', endedOn: days(-3) }, ended: null,
    })
    expect(v).toEqual({
      staff: false, status: 403, code: 'ACCESS_EXPIRED',
      says: `Your access at Northwind Staffing ended on ${formatDay(days(-3))}. An Owner or Admin there can renew it.`,
    })
  })

  it('the screen for a seat past its end date offers only signing in as somebody else, and links to nothing she cannot open', () => {
    const d = deniedFor({ code: 'ACCESS_EXPIRED', message: endedByDateSays('Northwind Staffing', days(-3)) })
    expect(d.heading).toBe('Your access ended')
    expect(d.says).toBe(`Your access at Northwind Staffing ended on ${formatDay(days(-3))}. An Owner or Admin there can renew it.`)
    expect(d.doors.every((door) => !door.href.startsWith('/dashboard'))).toBe(true)
  })

  it('a paused seat still reads the pause first, and a removed seat its removal, when no seat passed its date', () => {
    const removed = whenThereIsNoSeat({ email: 'x@northwind-staffing.example', isStaff: false, paused: null, ended: { companyName: 'Northwind Staffing' } })
    expect(removed.staff === false && removed.code).toBe('ACCESS_ENDED')
    const paused = whenThereIsNoSeat({
      email: 'x@northwind-staffing.example', isStaff: false, paused: { companyName: 'Northwind Staffing', reason: null },
      expired: { companyName: 'Northwind Staffing', endedOn: days(-3) }, ended: null,
    })
    expect(paused.staff === false && paused.code).toBe('SUSPENDED')
  })

  it('a seat kept past its date says so on its row, and why', () => {
    expect(seatDateLine({ open: true, kept: 'OWNER', endedOn: days(-3) }, days(-3)))
      .toBe(`End date ${formatDay(days(-3))} has passed. An Owner’s access never ends by date, so it stays open.`)
    expect(seatDateLine({ open: true, kept: 'LAST_MANAGER', endedOn: days(-3) }, days(-3)))
      .toBe(`End date ${formatDay(days(-3))} has passed. It stays open, because nobody else here can manage access.`)
    expect(seatDateLine({ open: false, endedOn: days(-3) }, days(-3))).toBe(`Ended on ${formatDay(days(-3))}`)
    expect(seatDateLine({ open: true, kept: null }, days(4))).toBe(`Ends on ${formatDay(days(4))}`)
    expect(seatDateLine({ open: true, kept: null }, null)).toBeNull()
  })
})

describe('the one seat reader ends a seat past its date', () => {
  type Row = Parameters<typeof seatsFrom>[0][number]
  const day = days(-100)
  const row = (o: Partial<Row> & { id: string }): Row => ({
    personId: `p-${o.id}`, type: 'EMPLOYEE', roleId: 'r-recruiter', orgUnitId: null, grantedAt: day,
    invitedAt: null, lastUsedAt: day, suspendedAt: null, revokedAt: null, expiresAt: null,
    role: { name: 'Recruiter', permissions: RECRUITER },
    person: { name: `Person ${o.id}`, primaryEmail: `${o.id}@northwind-staffing.example`, credentials: [{ id: 'c' }] },
    ...o,
  })

  it('a seat past its end date is not counted as live and is never named as somebody to ask', () => {
    const seats = seatsFrom([
      row({ id: 'owner', roleId: 'r-owner', role: { name: 'Owner', permissions: OWNER } }),
      row({ id: 'gone', roleId: 'r-admin', role: { name: 'Admin', permissions: ADMIN }, expiresAt: days(-1) }),
      row({ id: 'here', expiresAt: days(1) }),
    ], 'Northwind Staffing', now)
    expect(seats.map((s) => s.contextId).sort()).toEqual(['here', 'owner'])
    expect(countSeats(peopleOf(seats)).withAccess).toBe(2)
    expect(seats.some((s) => s.roleName === 'Admin')).toBe(false)
  })

  it('the Owner and the last seat that may manage access stay in the list past their dates, marked as kept', () => {
    const seats = seatsFrom([
      row({ id: 'owner', roleId: 'r-owner', role: { name: 'Owner', permissions: OWNER }, expiresAt: days(-4), suspendedAt: days(-1) }),
      row({ id: 'admin', roleId: 'r-admin', role: { name: 'Admin', permissions: ADMIN }, expiresAt: days(-2) }),
    ], 'Northwind Staffing', now)
    expect(seats.map((s) => [s.contextId, s.keptPastEndDate])).toEqual([['owner', 'OWNER'], ['admin', 'LAST_MANAGER']])
  })

  it('the reader reads the end date and the role’s permissions from the database', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/company-seats.ts'), 'utf8')
    expect(src).toContain('expiresAt: true')
    expect(src).toContain("role: { select: { name: true, permissions: true } }")
  })
})

describe('the caller check reads the end date wherever it picks the seat', () => {
  const src = readFileSync(join(process.cwd(), 'src/lib/api-context.ts'), 'utf8')
  it('the header’s seat, the chosen seat and the default seat are all picked through the one end-date reader', () => {
    expect(src).toContain('? await pick({ id: contextId })')
    expect(src).toContain('(chosen ? await pick({ id: chosen }) : null) ?? await pick({})')
    expect(src).toContain('const v = await seatOpenByDate(r, now)')
  })
})
