import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { seatsToOffer, usableNow, datedSeat, type SeatOnOffer } from '@/app/api/me/seats-on-offer'

/**
 * The account menu offers only the seats the one caller check would let
 * act now (2026-11-15). Dates are counted from the moment the file runs.
 */

const DAY = 86_400_000
const now = new Date()
const from = (n: number) => new Date(now.getTime() + n * DAY)

function seat(id: string, over: Partial<SeatOnOffer> = {}): SeatOnOffer {
  return {
    id, companyId: 'northwind', expiresAt: null, revokedAt: null, suspendedAt: null,
    invitedAt: null, lastUsedAt: from(-5),
    role: { name: 'Recruiter', permissions: ['submissions.write'] },
    ...over,
  }
}

const otherAdmin = datedSeat(seat('other-admin', { role: { name: 'Admin', permissions: ['team.manage', 'settings.manage'] } }), true)

describe('the account menu offers only seats that work now', () => {
  it('the account menu never offers a seat whose access has ended or is paused', () => {
    const seats = [
      seat('ended', { expiresAt: from(-1) }),
      seat('paused', { suspendedAt: from(-2) }),
      seat('removed', { revokedAt: from(-3) }),
      seat('in-date', { expiresAt: from(30), companyId: 'harborline' }),
    ]
    const { offered } = seatsToOffer(seats, [otherAdmin], null, now)
    expect(offered.map((s) => s.id)).toEqual(['in-date'])
  })

  it('an Owner kept open past the end date is still offered', () => {
    const owner = seat('owner', { expiresAt: from(-10), role: { name: 'Owner', permissions: ['*'] } })
    expect(usableNow(owner, [otherAdmin], now)).toBe(true)
    expect(seatsToOffer([owner], [otherAdmin], null, now).offered.map((s) => s.id)).toEqual(['owner'])
  })

  it('the last seat that may manage access is still offered past its end date', () => {
    const lone = seat('lone', { expiresAt: from(-2), role: { name: 'Admin', permissions: ['team.manage', 'settings.manage'] } })
    expect(usableNow(lone, [datedSeat(lone, true)], now)).toBe(true)
  })

  it('a seat whose end date is tomorrow is still offered', () => {
    expect(usableNow(seat('soon', { expiresAt: from(1) }), [], now)).toBe(true)
  })

  it('a seat asked for that has ended is not the one in use: the newest seat that works is, as on every route', () => {
    const seats = [seat('ended-newest', { expiresAt: from(-1) }), seat('works', { companyId: 'harborline' })]
    const { active } = seatsToOffer(seats, [otherAdmin], 'ended-newest', now)
    expect(active?.id).toBe('works')
  })

  it('a seat asked for that works is the one in use', () => {
    const seats = [seat('newest'), seat('chosen', { companyId: 'harborline' })]
    expect(seatsToOffer(seats, [], 'chosen', now).active?.id).toBe('chosen')
  })

  it('a person whose only seat has ended is offered no firm seat and none is in use', () => {
    const { offered, active } = seatsToOffer([seat('ended', { expiresAt: from(-1) })], [otherAdmin], null, now)
    expect(offered).toEqual([])
    expect(active).toBeNull()
  })

  it('where no firm seat works, the account menu opens her own pages by the caller check’s own rule', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/me/route.ts'), 'utf8')
    expect(src).toMatch(/ownSeatFor\(/)
    expect(src).toMatch(/openOwnSeat\(/)
  })
})

describe('the account menu reads signed in at this firm, as the caller check does', () => {
  const pastDateAdmin = seat('past-admin', { expiresAt: from(-1), role: { name: 'Admin', permissions: ['team.manage', 'settings.manage'] } })
  const invited = (id: string) => seat(id, { invitedAt: from(-4), lastUsedAt: null, role: { name: 'Admin', permissions: ['team.manage', 'settings.manage'] } })

  it('the account menu offers exactly the seats the caller check lets act, reading signed in at this firm, never a sign-in elsewhere', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/me/seats-on-offer.ts'), 'utf8')
    expect(src).toMatch(/import \{ seatHasSignedIn \} from '@\/lib\/access-grant'/)
    expect(src).toMatch(/import \{ signedInHere \} from '@\/lib\/access-log'/)
    expect(src).not.toMatch(/\bhasSignedIn\(/)
    expect(src).not.toMatch(/credentials/)
  })

  it('a manager invited here who has never come in here does not end another manager’s seat on the menu', () => {
    expect(usableNow(pastDateAdmin, [datedSeat(invited('never-here'), false)], now)).toBe(true)
  })

  it('a manager invited here who has come in here does end another manager’s seat past its date on the menu', () => {
    expect(usableNow(pastDateAdmin, [datedSeat(invited('came-in'), true)], now)).toBe(false)
  })

  it('a seat nobody invited, or one already used here, counts as signed in without asking the log', () => {
    expect(datedSeat(seat('made-by-sign-in', { invitedAt: null, lastUsedAt: null }), false).hasSignedIn).toBe(true)
    expect(datedSeat(seat('used-here', { invitedAt: from(-9), lastUsedAt: from(-2) }), false).hasSignedIn).toBe(true)
  })
})
