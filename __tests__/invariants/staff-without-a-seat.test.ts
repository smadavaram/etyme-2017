/**
 * Etyme staff are staff by address, and not everybody has a seat.
 *
 * `getCallerContext` refused any person with no active `Context` before
 * a staff check could run, with "No active context. You must belong to a
 * company." Staff are identified by address by design — no customer role
 * can grant it — so the design said one thing and the code said another,
 * and it was reported four times: from the breach register, from the
 * census review that has to be done by a named person at Etyme, and
 * twice as a wrong sentence read by a consultant who belongs to no
 * company and never should.
 *
 * The danger in fixing it is the obvious one, so it is the first thing
 * tested here: being staff must grant nothing inside anybody's company.
 */

import { describe, it, expect } from 'vitest'
import {
  isStaffAddress,
  staffCaller,
  whenThereIsNoSeat,
  realPersonId,
} from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'

const STAFF = ['ops@etyme.com', 'Founder@Etyme.com']

const person = {
  id: 'person-ops',
  name: 'Dana Whitlock',
  primaryEmail: 'ops@etyme.com',
  timezone: null,
}

describe('who is staff, and how we know', () => {

  it('a staff member with no seat anywhere is still staff, read off their address', () => {
    const verdict = whenThereIsNoSeat({
      email: 'ops@etyme.com',
      isStaff: isStaffAddress('ops@etyme.com', STAFF),
      paused: null,
      ended: null,
    })
    expect(verdict.staff).toBe(true)
  })

  it('an address is matched however it was typed, because a mailbox is not case sensitive', () => {
    expect(isStaffAddress('founder@etyme.com', STAFF)).toBe(true)
    expect(isStaffAddress('  ops@etyme.com ', STAFF)).toBe(true)
  })

  it('with no staff list set on this deployment, nobody is staff', () => {
    expect(isStaffAddress('ops@etyme.com', [])).toBe(false)
  })

  it('a customer address is not staff, whatever seat or permission they hold', () => {
    expect(isStaffAddress('priya@veritan.example', STAFF)).toBe(false)
  })
})

describe('being staff grants no permission inside any company', () => {

  const caller = staffCaller(person)

  it('a staff member with no seat belongs to no company, so nothing scopes to them', () => {
    expect(caller.company).toBeNull()
    expect(caller.context.companyId).toBeNull()
  })

  it('a staff member holds no permission at all, so every ordinary route refuses them', () => {
    expect(caller.permissions).toEqual([])
    for (const p of ['margin.read', 'timesheets.approve', 'privacy.manage', 'settings.manage'] as const) {
      expect(hasPermission(caller.permissions, p), p).toBe(false)
    }
  })

  it('a staff member is marked staff, and that is the only door it opens', () => {
    expect(caller.staff).toBe(true)
    expect(caller.isService).toBeUndefined()
  })

  it('a staff member is a real person, so anything they open is signed with their own name', () => {
    expect(realPersonId(caller)).toBe('person-ops')
    expect(caller.person.name).toBe('Dana Whitlock')
  })

  it('the seat-shaped id a staff caller carries is never a row, and says so', () => {
    expect(caller.context.id).toBe('staff:person-ops')
    expect(caller.context.type).toBe('STAFF')
    expect(caller.context.roleId).toBeNull()
  })
})

describe('a stranger with no seat is told the truth about why', () => {

  it('a stranger with no seat is refused, and is not told to join a company they have no business in', () => {
    const verdict = whenThereIsNoSeat({
      email: 'marisol@gmail.example',
      isStaff: false,
      paused: null,
      ended: null,
    })
    expect(verdict.staff).toBe(false)
    if (verdict.staff) return
    expect(verdict.status).toBe(403)
    expect(verdict.says).not.toContain('must belong to a company')
    expect(verdict.says).toContain('do not need to belong to a company')
    expect(verdict.says).toContain('marisol@gmail.example')
  })

  it('a person whose seat was taken away reads that it was taken away, and who can put it back', () => {
    const verdict = whenThereIsNoSeat({
      email: 'ex@veritan.example',
      isStaff: false,
      paused: null,
      ended: { companyName: 'Veritan Talent' },
    })
    expect(verdict.staff).toBe(false)
    if (verdict.staff) return
    expect(verdict.code).toBe('ACCESS_ENDED')
    expect(verdict.says).toContain('Veritan Talent')
    expect(verdict.says).not.toContain('must belong to a company')
  })

  it('a paused seat still reads as paused, with the reason somebody there wrote', () => {
    const verdict = whenThereIsNoSeat({
      email: 'priya@veritan.example',
      isStaff: false,
      paused: { companyName: 'Veritan Talent', reason: 'on leave until October' },
      ended: null,
    })
    expect(verdict.staff).toBe(false)
    if (verdict.staff) return
    expect(verdict.code).toBe('SUSPENDED')
    expect(verdict.says).toContain('on leave until October')
  })

  it('no refusal on this path is a code where a sentence belongs', () => {
    for (const verdict of [
      whenThereIsNoSeat({ email: 'a@b.example', isStaff: false, paused: null, ended: null }),
      whenThereIsNoSeat({ email: 'a@b.example', isStaff: false, paused: null, ended: { companyName: null } }),
      whenThereIsNoSeat({ email: 'a@b.example', isStaff: false, paused: { companyName: null, reason: null }, ended: null }),
    ]) {
      if (verdict.staff) continue
      expect(verdict.says).not.toMatch(/[A-Z]{3,}_[A-Z]{3,}/)
      expect(verdict.says.length).toBeGreaterThan(40)
      expect(verdict.says.trim().endsWith('.')).toBe(true)
    }
  })

  it('a company cannot take away what it never granted: a paused seat does not unmake staff', () => {
    // The rare person who is both Etyme staff and a suspended employee of
    // a customer. They keep the staff door and gain nothing at that
    // company, because the staff caller carries neither.
    const verdict = whenThereIsNoSeat({
      email: 'ops@etyme.com',
      isStaff: true,
      paused: { companyName: 'Veritan Talent', reason: 'under review' },
      ended: null,
    })
    expect(verdict.staff).toBe(true)
    expect(staffCaller(person).company).toBeNull()
  })
})

describe('a consultant who belongs to no company was never the problem', () => {

  it('a consultant holding their own seat with no company is not on this path at all', () => {
    // CONSULTANT contexts carry companyId: null and are found by the
    // ordinary lookup, so they never reach whenThereIsNoSeat. The bug was
    // only ever about somebody with no Context row at all, or one that had
    // been revoked — which is what the two sentences above now cover.
    const verdict = whenThereIsNoSeat({
      email: 'marisol@gmail.example',
      isStaff: false,
      paused: null,
      ended: null,
    })
    if (verdict.staff) throw new Error('a consultant is not staff')
    expect(verdict.says).toContain('consultant')
  })
})
