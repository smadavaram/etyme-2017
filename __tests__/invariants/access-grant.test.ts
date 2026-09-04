/**
 * Who may do what here, and for how long.
 *
 * The assumption inverted: that access, once given, continues until
 * somebody remembers to take it away. Nobody remembers. That is why every
 * enterprise directory contains people who left, contractors from projects
 * that ended years ago, and one annual spreadsheet where a manager ticks
 * names they do not recognise.
 *
 * Here access ends by default, how long depends on what it can do, and
 * access nobody uses is treated as exposure rather than as access.
 */

import { describe, it, expect } from 'vitest'
import {
  sensitivityOf, defaultDurationDays, assessGrant, reviewAccess,
  type GrantRequest, type HeldAccess,
} from '@/lib/access-grant'

const NOW = new Date('2026-08-16T00:00:00Z')
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000)
const ahead = (d: number) => new Date(NOW.getTime() + d * 86_400_000)

function grant(over: Partial<GrantRequest> = {}): GrantRequest {
  return {
    roleName: 'Recruiter',
    permissions: ['requirements.read', 'submissions.create'],
    requestedDays: null,
    reason: 'Joining the Terumo delivery team',
    selfGranted: false,
    otherHoldersOfCritical: 2,
    ...over,
  }
}

const check = (d: ReturnType<typeof assessGrant>, code: string) =>
  d.checks.find(c => c.code === code)!

describe('How long access runs depends on what it can do', () => {

  it('anything that can manage access is critical', () => {
    expect(sensitivityOf(['*'])).toBe('CRITICAL')
    expect(sensitivityOf(['settings.manage'])).toBe('CRITICAL')
  })

  it('moving money is high', () => {
    expect(sensitivityOf(['invoices.approve'])).toBe('HIGH')
    expect(sensitivityOf(['rates.write'])).toBe('HIGH')
  })

  it('reading only is read-only', () => {
    expect(sensitivityOf(['requirements.read', 'invoices.read'])).toBe('READ_ONLY')
  })

  it('one write among reads makes it standard', () => {
    expect(sensitivityOf(['requirements.read', 'submissions.create'])).toBe('STANDARD')
  })

  it('the more it can do, the sooner it is reaffirmed', () => {
    expect(defaultDurationDays('CRITICAL')).toBeLessThan(defaultDurationDays('HIGH'))
    expect(defaultDurationDays('HIGH')).toBeLessThan(defaultDurationDays('STANDARD'))
    expect(defaultDurationDays('STANDARD')).toBeLessThan(defaultDurationDays('READ_ONLY'))
  })

  it('read-only runs a year, on purpose', () => {
    // Expiring everything in ninety days does not produce vigilance. It
    // produces a monthly ritual of clicking renew without reading.
    expect(defaultDurationDays('READ_ONLY')).toBe(365)
  })
})

describe('Granting access', () => {

  it('a normal grant is allowed and gets an end date', () => {
    const d = assessGrant(grant())
    expect(d.allowed).toBe(true)
    expect(d.expiresInDays).toBe(270)
  })

  it('a reason under ten characters is refused', () => {
    // The person renewing this in six months is usually not the person
    // granting it now, and "asked" tells them nothing.
    const d = assessGrant(grant({ reason: 'ok' }))
    expect(d.allowed).toBe(false)
    expect(check(d, 'REASON').reason).toContain('will not know otherwise')
  })

  it('asking for access with no end date gets one anyway, where it can change things', () => {
    const d = assessGrant(grant({ requestedDays: null, permissions: ['invoices.approve'] }))
    expect(d.expiresInDays).toBe(180)
    expect(check(d, 'DURATION').reason).toContain('renewing is one click')
  })

  it('but read-only access may genuinely have no end date', () => {
    const d = assessGrant(grant({ requestedDays: null, permissions: ['invoices.read'] }))
    expect(d.expiresInDays).toBeNull()
    expect(d.allowed).toBe(true)
  })

  it('an absurd duration is shortened rather than refused', () => {
    const d = assessGrant(grant({ requestedDays: 3650 }))
    expect(d.expiresInDays).toBe(540)
    expect(check(d, 'DURATION').reason).toContain('Shortened')
  })

  it('a reasonable duration is honoured as asked', () => {
    expect(assessGrant(grant({ requestedDays: 30 })).expiresInDays).toBe(30)
  })
})

describe('Nobody gives themselves the keys', () => {

  it('granting yourself full access is refused', () => {
    const d = assessGrant(grant({ permissions: ['*'], selfGranted: true, roleName: 'Owner' }))
    expect(d.allowed).toBe(false)
    expect(check(d, 'SELF_GRANT').reason).toContain('Ask somebody else')
  })

  it('granting yourself something ordinary proceeds, but conspicuously', () => {
    // A small firm where one person does everything is a real situation.
    // Refusing it moves the work off the platform.
    const d = assessGrant(grant({ selfGranted: true }))
    expect(d.allowed).toBe(true)
    expect(check(d, 'SELF_GRANT').outcome).toBe('WARN')
    expect(check(d, 'SELF_GRANT').reason).toContain('access review')
  })
})

describe('Expiry must never lock a company out of itself', () => {

  it('the only account that can manage access is warned about', () => {
    const d = assessGrant(grant({
      permissions: ['*'], roleName: 'Owner', otherHoldersOfCritical: 0, requestedDays: 90,
    }))
    expect(check(d, 'LAST_ADMIN').outcome).toBe('WARN')
    expect(check(d, 'LAST_ADMIN').reason).toContain('Add a second')
  })

  it('with a second admin present there is nothing to warn about', () => {
    const d = assessGrant(grant({ permissions: ['*'], otherHoldersOfCritical: 3, requestedDays: 90 }))
    expect(check(d, 'LAST_ADMIN').outcome).toBe('PASS')
  })
})

describe('Access nobody uses is exposure, not access', () => {

  function held(over: Partial<HeldAccess> = {}): HeldAccess {
    return {
      contextId: 'ctx1', personName: 'Dana Whitfield', roleName: 'Procurement',
      permissions: ['invoices.approve'],
      grantedAt: ago(30), expiresAt: ahead(200), lastUsedAt: ago(3),
      ...over,
    }
  }

  it('access in active use is not raised at all', () => {
    // A review that lists everybody is a review nobody reads.
    expect(reviewAccess([held()], NOW)).toHaveLength(0)
  })

  it('held two months and never used is dormant', () => {
    const r = reviewAccess([held({ grantedAt: ago(70), lastUsedAt: null })], NOW)
    expect(r[0].finding).toBe('DORMANT')
    expect(r[0].suggestion).toContain('Nothing breaks')
  })

  it('granted last week and not yet used is not dormant', () => {
    // People take a while to start.
    expect(reviewAccess([held({ grantedAt: ago(6), lastUsedAt: null })], NOW)).toHaveLength(0)
  })

  it('used once, months ago, is idle rather than dormant', () => {
    const r = reviewAccess([held({ lastUsedAt: ago(150) })], NOW)
    expect(r[0].finding).toBe('IDLE')
    expect(r[0].suggestion).toContain('still need it')
  })

  it('already past its date is reported first', () => {
    const r = reviewAccess([held({ expiresAt: ago(5) })], NOW)
    expect(r[0].finding).toBe('EXPIRED')
  })

  it('an expired grant nobody ever used says to leave it closed', () => {
    const r = reviewAccess([held({ expiresAt: ago(5), lastUsedAt: null })], NOW)
    expect(r[0].suggestion).toContain('Leave it closed')
  })

  it('ending soon and in active use says renew it', () => {
    // Somebody mid-task should not be cut off.
    const r = reviewAccess([held({ expiresAt: ahead(7), lastUsedAt: ago(1) })], NOW)
    expect(r[0].finding).toBe('EXPIRING')
    expect(r[0].suggestion).toContain('renew')
  })

  it('ending soon and never used says let it lapse', () => {
    const r = reviewAccess([held({ grantedAt: ago(20), expiresAt: ahead(7), lastUsedAt: null })], NOW)
    expect(r[0].suggestion).toContain('lapse')
  })

  it('the worst findings come first', () => {
    const r = reviewAccess([
      held({ contextId: 'a', expiresAt: ahead(5), lastUsedAt: ago(1) }),
      held({ contextId: 'b', grantedAt: ago(90), lastUsedAt: null }),
      held({ contextId: 'c', expiresAt: ago(2) }),
    ], NOW)
    expect(r.map(x => x.finding)).toEqual(['EXPIRED', 'DORMANT', 'EXPIRING'])
  })
})
