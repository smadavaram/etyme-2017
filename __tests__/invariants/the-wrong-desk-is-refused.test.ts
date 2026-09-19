import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rolesFor, type CompanyKind } from '@/lib/company-defaults'
import { hasPermission } from '@/lib/permissions'

/**
 * Which company is not which desk.
 *
 * `authenticated-is-not-authorised.test.ts` covers the first half of
 * this: a route that acts on a record must ask who is calling and not
 * merely whether anybody is. Four routes passed that bar and stopped one
 * question short — they established the caller's *company* and then
 * acted for any seat inside it.
 *
 * What that let somebody do:
 *
 *   - a supplier's HR partner, its compliance officer or its accounts
 *     receivable clerk could put a candidate in front of a client, in
 *     the firm's name, at a rate they chose
 *   - a client's Viewer — a role whose entire blurb is "Reads the
 *     program. Changes nothing." — could award a placement, which is
 *     the act that writes both contracts, starts tenure accruing and
 *     commits the budget
 *   - the AP clerk who pays for a requisition, and the approver who is
 *     meant to decide it, could raise one
 *
 * All three are segregation of duties, which Addendum E puts in the
 * BLOCK list rather than the warn-and-proceed list. None of them was a
 * missing permission: the role table has said who does these jobs since
 * it was written, and the routes did not read it.
 *
 * So the test is in two halves. The first computes the split out of the
 * role table itself, so it fails if a permission is quietly added to a
 * reading desk. The second reads the four routes and fails if one stops
 * asking, or starts refusing in a code instead of a sentence.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const SUBMIT = read('src/app/api/submissions/route.ts')
const AWARD = read('src/app/api/submissions/[id]/award/route.ts')
const REQUISITIONS = read('src/app/api/requisitions/route.ts')
const REQUIREMENTS = read('src/app/api/requirements/route.ts')

/** The permissions a named desk at a named kind of company actually holds. */
function desk(kind: CompanyKind, name: string): readonly string[] {
  const role = rolesFor(kind).find((r) => r.name === name)
  if (!role) throw new Error(`No ${name} at a ${kind}. The role table moved; this test should move with it.`)
  return role.permissions
}

// ── Half one: the split the role table already draws ─────────────────

describe('selling somebody is the recruiting desk’s job, and the role table says so', () => {
  const MAY = ['Recruiter', 'Resource Manager', 'Account Manager', 'Admin', 'Owner']
  const MAY_NOT = ['HR', 'Compliance Officer', 'Accounts Receivable', 'AP & Payroll', 'Contract Manager']

  for (const name of MAY) {
    it(`a supplier’s ${name} may put a candidate in front of a client`, () => {
      expect(hasPermission(desk('VENDOR', name), 'submissions.create')).toBe(true)
    })
  }

  for (const name of MAY_NOT) {
    it(`a supplier’s ${name} may not put a candidate in front of a client`, () => {
      expect(hasPermission(desk('VENDOR', name), 'submissions.create')).toBe(false)
    })
  }

  it('the desk that bills the client and the desk that pays the consultant can do neither', () => {
    expect(hasPermission(desk('VENDOR', 'Accounts Receivable'), 'submissions.create')).toBe(false)
    expect(hasPermission(desk('VENDOR', 'AP & Payroll'), 'submissions.create')).toBe(false)
  })
})

describe('hiring is the hiring desk’s job, and awarding is the last act of hiring', () => {
  const MAY = ['Hiring Manager', 'Program Manager', 'Owner']
  const MAY_NOT = ['Viewer', 'Approver', 'HR Partner', 'Procurement Lead', 'AP Clerk', 'Compliance Officer']

  for (const name of MAY) {
    it(`a client’s ${name} may open a role and award it`, () => {
      expect(hasPermission(desk('CLIENT', name), 'requirements.write')).toBe(true)
    })
  }

  for (const name of MAY_NOT) {
    it(`a client’s ${name} may neither open a role nor award it`, () => {
      expect(hasPermission(desk('CLIENT', name), 'requirements.write')).toBe(false)
    })
  }

  it('a Viewer reads the program and holds nothing that changes it', () => {
    const viewer = desk('CLIENT', 'Viewer')
    expect(viewer.every((p) => p.endsWith('.read'))).toBe(true)
  })

  it('the desk that opens a role is not the desk that chooses which suppliers see it', () => {
    // Procurement releases; the hiring manager does not. That is the
    // control that stops work being routed to a friend, and it only
    // works if it holds in both directions.
    expect(hasPermission(desk('CLIENT', 'Procurement Lead'), 'requirements.write')).toBe(false)
    expect(hasPermission(desk('CLIENT', 'Hiring Manager'), 'requirements.distribute')).toBe(false)
  })

  it('an MSP running somebody else’s program splits the same way', () => {
    expect(hasPermission(desk('MSP', 'Program Manager'), 'requirements.write')).toBe(true)
    expect(hasPermission(desk('MSP', 'Coordinator'), 'requirements.write')).toBe(true)
    expect(hasPermission(desk('MSP', 'AP Clerk'), 'requirements.write')).toBe(false)
    expect(hasPermission(desk('MSP', 'Supplier Manager'), 'requirements.write')).toBe(false)
  })
})

// ── Half two: the routes read it ─────────────────────────────────────

const GATED: Array<[what: string, source: string, permission: string]> = [
  ['putting a candidate in front of a client', SUBMIT, 'submissions.create'],
  ['awarding a position', AWARD, 'requirements.write'],
  ['raising a requisition', REQUISITIONS, 'requirements.write'],
  ['opening a role', REQUIREMENTS, 'requirements.write'],
]

describe('a route that acts asks which desk is calling, not only which company', () => {
  for (const [what, source, permission] of GATED) {
    it(`${what} asks for ${permission} before it does anything`, () => {
      expect(source).toContain(`hasPermission(caller.permissions, '${permission}')`)
    })

    it(`${what} refuses the wrong desk outright rather than warning and proceeding`, () => {
      expect(source).toMatch(new RegExp(`!hasPermission\\(caller\\.permissions, '${permission}'\\)`))
      expect(source).toContain('status: 403')
    })
  }

  it('submitting a candidate and sending one onward ask for the same permission', () => {
    // They are one act seen from two rungs of a chain. A firm that may
    // do one may do the other, or the narrower route becomes the way
    // round the wider one.
    const forwarding = read('src/lib/forwarding.ts')
    expect(forwarding).toContain("'submissions.create'")
    expect(SUBMIT).toContain("'submissions.create'")
  })

  it('the two routes that open a role refuse the same people', () => {
    expect(REQUISITIONS).toContain("hasPermission(caller.permissions, 'requirements.write')")
    expect(REQUIREMENTS).toContain("hasPermission(caller.permissions, 'requirements.write')")
  })
})

describe('the refusal says what the desk is and who to ask, never a code', () => {
  it('a supplier’s wrong desk is told which desk submits', () => {
    expect(SUBMIT).toContain('a recruiter, a resource manager or the')
    expect(SUBMIT).toContain('account manager. Ask one of them to submit this candidate.')
  })

  it('a client’s wrong desk is told that awarding belongs to whoever is hiring', () => {
    expect(AWARD).toContain('Awarding a position is for whoever is hiring at')
    expect(AWARD).toContain('a hiring or program manager.')
  })

  it('a client’s wrong desk is told that raising a requisition belongs to whoever is hiring', () => {
    expect(REQUISITIONS).toContain('Raising a requisition is for whoever is hiring at')
    expect(REQUIREMENTS).toContain('Opening a role is for whoever is hiring at')
  })

  it('no refusal on these four routes hands somebody a permission string to read', () => {
    // The code field is for the machine. The message is the product, and
    // "needs submissions.create" is not a sentence anybody acts on.
    for (const [what, source] of GATED.map(([w, s]) => [w, s] as const)) {
      const messages = [...source.matchAll(/message:\s*\n?\s*((?:`[^`]*`|'[^']*')(?:\s*\+\s*(?:`[^`]*`|'[^']*'))*)/g)]
        .map((m) => m[1])
        .join(' ')
      expect(messages, what).not.toMatch(/submissions\.create|requirements\.write|requirements\.read/)
    }
  })
})
