import { describe, it, expect } from 'vitest'
import { seatIsLive, mayGrantSeat, noSeatYet, seatTrail } from '@/lib/program-seat'
import { rolesFor } from '@/lib/company-defaults'

/**
 * A desk a client grants a program office that is not the client.
 *
 * The rule, decided 2026-09-14 and built when Etyme itself became a
 * program office provider on 2026-09-20: a firm that runs somebody's
 * program places nobody, so nothing ties it to that client the way a
 * placement ties a supplier. The client says so instead — and only the
 * client, only from the desk that owns the rules, never the firm about
 * itself.
 */

const NOW = new Date('2026-09-20T12:00:00Z')
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000)

const CLIENT = { id: 'client-1', kind: 'CLIENT', name: 'Cavanaugh Glassworks' }
const OFFICE = { id: 'office-1', kind: 'MSP', name: 'Aptiva Workforce' }
const PM = { id: 'role-1', companyId: 'client-1', name: 'Program Manager' }

const ask = (over: Partial<Parameters<typeof mayGrantSeat>[0]> = {}) =>
  mayGrantSeat({
    grantorCompany: CLIENT,
    grantorPermissions: ['governance.read', 'governance.write'],
    officeCompany: OFFICE,
    role: PM,
    reason: 'Aptiva runs our contingent program and we have no workforce office of our own.',
    alreadyHas: false,
    ...over,
  })

describe('a seat is live, or it is not, and there is no third answer', () => {
  it('a seat granted yesterday with no end date is live today', () => {
    expect(seatIsLive({ validFrom: day(-1), validTo: null, revokedAt: null }, NOW)).toBe(true)
  })

  it('a revoked seat reads nothing the next second — there is no grace period on a client taking back access to its own workforce', () => {
    const oneSecondAgo = new Date(NOW.getTime() - 1000)
    expect(seatIsLive({ validFrom: day(-30), validTo: null, revokedAt: oneSecondAgo }, NOW)).toBe(false)
  })

  it('a seat that has not started yet is not a seat somebody can sit in early', () => {
    expect(seatIsLive({ validFrom: day(7), validTo: null, revokedAt: null }, NOW)).toBe(false)
  })

  it('a seat with an end date stops on that date rather than being chased by a nightly job', () => {
    expect(seatIsLive({ validFrom: day(-30), validTo: day(-1), revokedAt: null }, NOW)).toBe(false)
    expect(seatIsLive({ validFrom: day(-30), validTo: day(1), revokedAt: null }, NOW)).toBe(true)
  })
})

describe('only a client grants a seat, and only from the desk that owns the rules', () => {
  it('a client owner or program manager may grant a program office a seat', () => {
    expect(ask().ok).toBe(true)
    expect(ask({ grantorPermissions: ['*'] }).ok).toBe(true)
  })

  it('a program office cannot grant itself a seat', () => {
    const v = ask({ officeCompany: CLIENT })
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.code).toBe('SELF_GRANT')
      expect(v.says).toContain('cannot grant itself a seat')
    }
  })

  it('a supplier cannot grant a seat in a program that is not its own', () => {
    const v = ask({ grantorCompany: { id: 'vendor-1', kind: 'VENDOR', name: 'Brightmoor Staffing' } })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.code).toBe('NOT_A_CLIENT')
  })

  it('a hiring manager, an AP clerk and a compliance officer are told who may grant a seat, in a sentence', () => {
    for (const roleName of ['Hiring Manager', 'AP Clerk', 'Compliance Officer', 'Procurement Lead', 'Viewer']) {
      const role = rolesFor('CLIENT').find((r) => r.name === roleName)!
      const v = ask({ grantorPermissions: role.permissions })
      expect(v.ok, `${roleName} granted a seat`).toBe(false)
      if (!v.ok) expect(v.says).toContain('Only an owner or the program manager may grant a seat')
    }
  })

  it('the two client desks that may grant a seat are exactly the owner and the program manager', () => {
    // Read off the shipped roles rather than asserted twice: the gate is
    // governance.write, and if a fourth client desk is ever given the
    // rules this test says so on the commit that does it.
    const may = rolesFor('CLIENT')
      .filter((r) => ask({ grantorPermissions: r.permissions }).ok)
      .map((r) => r.name)
    expect(may).toEqual(['Owner', 'Program Manager'])
  })

  it('a seat holds one of the client’s own roles, never the program office’s', () => {
    const v = ask({ role: { id: 'role-9', companyId: 'office-1', name: 'Program Manager' } })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.code).toBe('NOT_YOUR_ROLE')
  })

  it('a standing grant to read a whole workforce is refused until somebody says why', () => {
    const v = ask({ reason: 'ok' })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.code).toBe('REASON')
  })

  it('a firm already sitting in the program is not seated twice', () => {
    const v = ask({ alreadyHas: true })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.says).toContain('already holds a live seat')
  })

  it('every refusal is a sentence somebody can act on, never a code', () => {
    const refusals = [
      ask({ officeCompany: CLIENT }),
      ask({ grantorCompany: { id: 'v', kind: 'VENDOR', name: 'Brightmoor Staffing' } }),
      ask({ grantorPermissions: ['governance.read'] }),
      ask({ officeCompany: null }),
      ask({ role: null }),
      ask({ role: { id: 'r', companyId: 'office-1', name: 'Program Manager' } }),
      ask({ reason: '' }),
      ask({ alreadyHas: true }),
    ]
    for (const v of refusals) {
      expect(v.ok).toBe(false)
      if (!v.ok) {
        expect(v.says.split(' ').length, `"${v.says}" is not a sentence`).toBeGreaterThan(8)
        expect(v.says, `"${v.says}" leaks a machine code`).not.toMatch(/[A-Z]{3,}_[A-Z]/)
      }
    }
  })
})

describe('a program office with no seat is told what is missing, not shown an empty program', () => {
  it('names the firm, says a program office places nobody, and says who can grant the desk', () => {
    const says = noSeatYet('Kestrel MSP')
    expect(says).toContain('Kestrel MSP')
    expect(says).toMatch(/not tied to a client yet/)
    expect(says).toMatch(/seat the client grants/)
    expect(says).toMatch(/owner or the program manager/)
    expect(says).not.toMatch(/[A-Z]{3,}_[A-Z]/)
  })
})

describe('the trail names the seat, so a client can read back who looked and on whose authority', () => {
  it('says who read, at which desk, granted by whom, with the seat’s own id', () => {
    const trail = seatTrail(
      {
        id: 'seat-abc',
        clientCompany: { id: 'c', name: 'Cavanaugh Glassworks', slug: 'world-corning', kind: 'CLIENT' },
        officeCompany: { id: 'o', name: 'Aptiva Workforce' },
        role: { id: 'r', name: 'Program Manager', permissions: [] },
        orgUnitId: null,
        grantedAt: NOW,
        reason: 'why',
      },
      'Program read'
    )
    expect(trail).toBe(
      'Program read by Aptiva Workforce in the Program Manager seat Cavanaugh Glassworks granted it (seat seat-abc)'
    )
  })
})
