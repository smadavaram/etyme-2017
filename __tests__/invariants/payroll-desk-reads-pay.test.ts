import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { rolesFor, GRANTED_SINCE } from '@/lib/company-defaults'
import { canReadPayRate, canReadMargin } from '@/lib/permissions'
import { CHOOSES_OVERTIME_METHOD } from '@/lib/overtime-method-choice'
import { CHOOSES_CUT_OVERTIME } from '@/lib/cut-overtime-choice'

/**
 * The desk that runs payroll reads the pay line it pays. Found by a
 * browser walk as Brightmoor: the AP & Payroll and Finance desks opened
 * Rosa Delgado's placement and were told "this desk does not read money"
 * about the line they pay every month. CLAUDE.md, "A supplier brings its
 * team in": AP & Payroll pays the consultant — accepts hours, runs
 * payroll — and Finance is the whole desk at a small firm.
 */

const role = (kind: 'VENDOR' | 'GSI', name: string) => {
  const r = rolesFor(kind).find((x) => x.name === name)
  if (!r) throw new Error(`${name} is not a ${kind} role`)
  return { permissions: r.permissions as string[] }
}

describe('who reads a pay line at a staffing firm', () => {
  for (const kind of ['VENDOR', 'GSI'] as const) {
    it(`the desk that runs payroll reads what each person is paid and may choose how their overtime is paid (${kind})`, () => {
      for (const desk of ['AP & Payroll', 'Finance']) {
        const r = role(kind, desk)
        expect(canReadPayRate(r)).toBe(true)
        expect(r.permissions).toContain(CHOOSES_OVERTIME_METHOD)
        expect(r.permissions).toContain(CHOOSES_CUT_OVERTIME)
      }
    })

    it(`the account manager, HR and the recruiter still do not read what anybody is paid (${kind})`, () => {
      for (const desk of ['Account Manager', 'HR', 'Recruiter']) {
        expect(canReadPayRate(role(kind, desk))).toBe(false)
      }
    })
  }

  it('reading pay does not hand the payroll desk the margin or the bill rate', () => {
    expect(canReadMargin(role('VENDOR', 'AP & Payroll'))).toBe(false)
  })

  it('a firm formed before the payroll desk could read pay is given it by name, with a reason, and nobody else is', () => {
    const grants = GRANTED_SINCE.filter((g) => g.permissions.includes('consultants.cost'))
    expect(grants.map((g) => g.role).sort()).toEqual(['AP & Payroll', 'Finance'])
    for (const g of grants) {
      expect(g.kinds).toEqual(['VENDOR', 'GSI'])
      expect(g.why.length).toBeGreaterThan(40)
    }
  })

  it('the placement page lets a desk change overtime by the permission, never by the name of the role', () => {
    const route = readFileSync('src/app/api/placements/[id]/route.ts', 'utf8')
    const page = readFileSync('src/app/dashboard/placements/[id]/page.tsx', 'utf8')
    for (const src of [route, page]) {
      expect(src).not.toMatch(/AP & Payroll|'Finance'/)
    }
  })
})
