import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rolesFor } from '@/lib/company-defaults'
import { hasPermission } from '@/lib/permissions'
import { desksThatHold, complianceRefusal } from '@/lib/walls'

/**
 * A firm's own compliance page is every colleague's visa, I-9 and
 * background result in one place. Until 2026-09-30 its route asked for
 * no permission, so any seat at the firm opened it — on the seeded world
 * including Karthik Menon, a Teleworld delivery engineer holding
 * `assignments.read` and `timesheets.read`. It now asks for the key the
 * desks that read the firm's own rules hold, and a program office's seat
 * was already asked for: `governance.read`.
 */

const ROUTE = readFileSync(join(__dirname, '../../src/app/api/compliance/route.ts'), 'utf8')
const GET_BODY = ROUTE.slice(ROUTE.indexOf('export async function GET'))

const KARTHIK = ['assignments.read', 'timesheets.read']

describe('who opens a firm\'s own compliance page', () => {
  it('a delivery engineer cannot read his colleagues\' work papers', () => {
    expect(hasPermission(KARTHIK, 'governance.read')).toBe(false)
    expect(GET_BODY).toContain("hasPermission(caller.permissions, 'governance.read')")
  })

  it('the compliance officer and HR still open compliance, at every kind of firm that has them', () => {
    for (const kind of ['VENDOR', 'GSI', 'MSP', 'CLIENT'] as const) {
      const roles = rolesFor(kind)
      const officer = roles.find((r) => r.name === 'Compliance Officer')
      expect(officer, `${kind} has no compliance officer`).toBeDefined()
      expect(hasPermission(officer!.permissions, 'governance.read'), `${kind} compliance officer`).toBe(true)
      // A program office ships no HR desk of its own; every other kind does.
      const hr = roles.find((r) => r.name === 'HR' || r.name === 'HR Partner')
      if (kind !== 'MSP') expect(hr, `${kind} has no HR desk`).toBeDefined()
      if (hr) expect(hasPermission(hr.permissions, 'governance.read'), `${kind} ${hr.name}`).toBe(true)
    }
  })

  it('the owner of every kind of firm still opens compliance, a one-person corporation included', () => {
    for (const kind of ['VENDOR', 'GSI', 'MSP', 'CLIENT', 'CONSULTANT_CORP'] as const) {
      const owner = rolesFor(kind).find((r) => r.isOwner)!
      expect(hasPermission(owner.permissions, 'governance.read'), `${kind} owner`).toBe(true)
    }
  })

  it('a client\'s program manager, approver and procurement lead still open it, and its AP clerk and hiring manager do not', () => {
    const roles = rolesFor('CLIENT')
    const opens = (name: string) => hasPermission(roles.find((r) => r.name === name)!.permissions, 'governance.read')
    for (const name of ['Program Manager', 'Approver', 'Procurement Lead']) expect(opens(name), name).toBe(true)
    for (const name of ['AP Clerk', 'Hiring Manager', 'Viewer']) expect(opens(name), name).toBe(false)
  })

  it('a firm\'s own seats and a program office in a client\'s seat are asked for the same permission', () => {
    expect(GET_BODY).toContain("seatMayRead(seat, 'governance.read', 'the compliance page')")
  })
})

describe('what somebody refused the compliance page is told', () => {
  const teleworld = rolesFor('GSI').map((r) => ({ name: r.name, permissions: r.permissions }))

  it('a delivery engineer is told who to ask, by the desk names his own firm uses', () => {
    const says = complianceRefusal('Teleworld Solutions', desksThatHold(teleworld, 'governance.read'))
    expect(says).toBe(
      'The compliance page at Teleworld Solutions shows other people\'s visas, I-9s and background results, ' +
        'and your desk does not read them. Ask the Compliance Officer, HR, Admin or Owner desk at ' +
        'Teleworld Solutions if you need something from it.'
    )
  })

  it('the desk named for the job comes first and the owner last', () => {
    const desks = desksThatHold(
      [
        { name: 'Owner', permissions: ['*'] },
        { name: 'People', permissions: ['governance.read'] },
        { name: 'Compliance', permissions: ['governance.read'] },
        { name: 'Engineer', permissions: ['assignments.read'] },
      ],
      'governance.read'
    )
    expect(desks).toEqual(['Compliance', 'People', 'Owner'])
  })

  it('a firm where no desk reads it is told to ask whoever manages seats, never given an empty name', () => {
    const says = complianceRefusal('Wrenfield Technical', [])
    expect(says).toContain('Ask whoever manages seats at Wrenfield Technical')
    expect(says).not.toMatch(/Ask the {2}|the desk at/)
  })

  it('the refusal never shows a permission key or a code', () => {
    const says = complianceRefusal('Teleworld Solutions', desksThatHold(teleworld, 'governance.read'))
    expect(says).not.toMatch(/governance\.read|FORBIDDEN|[a-z]+\.[a-z]+/)
  })

  it('every refusal of the compliance page writes an access-log row against each person it would have shown', () => {
    const refused = GET_BODY.slice(GET_BODY.indexOf('const refusedRead'), GET_BODY.indexOf('if (seat) {'))
    expect(refused).toContain('logBulkAccess(')
    expect(refused).toContain('allowed: false')
    expect(refused).toContain("select: { personId: true }")
  })
})
