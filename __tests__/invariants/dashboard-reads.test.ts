import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dashboardReads, NOT_YOURS } from '@/lib/dashboard-reads'
import { rolesFor } from '@/lib/company-defaults'

/**
 * The dashboard asks only for what the seat may read.
 *
 * Found by a tester on 2026-09-30: every client desk's dashboard visit
 * sent `GET /api/automation?limit=5` and got a 403, the AP clerk and an
 * integrator's engineer got a 403 from `GET /api/bench`, and nothing on
 * the screen said anything was missing.
 */

const PAGE = readFileSync(join(process.cwd(), 'src/app/dashboard/page.tsx'), 'utf8')
const role = (kind: Parameters<typeof rolesFor>[0], name: string) => rolesFor(kind).find((r) => r.name === name)!.permissions

describe('the dashboard calls no route the seat cannot read', () => {
  it('an integrator’s engineer holding two read permissions is not asked for the bench or the automation log', () => {
    expect(dashboardReads(['assignments.read', 'timesheets.read'])).toEqual({ bench: false, automation: false })
  })

  it('a supplier’s AP & Payroll desk, which reads no consultants, does not ask for the bench', () => {
    expect(dashboardReads(role('VENDOR', 'AP & Payroll')).bench).toBe(false)
  })

  it('the owner of a firm reads both panels', () => {
    expect(dashboardReads(['*'])).toEqual({ bench: true, automation: true })
  })

  it('a recruiter who reads consultants is asked for the bench, as the menu offers it', () => {
    expect(dashboardReads(role('VENDOR', 'Recruiter')).bench).toBe(true)
  })

  it('before the seat is known nothing is asked for', () => {
    expect(dashboardReads(null)).toEqual({ bench: false, automation: false })
  })

  it('the page fetches the bench and the automation log only behind the seat’s answer', () => {
    expect(PAGE).toMatch(/reads\.bench\s*\?\s*fetch\('\/api\/bench'\)/)
    expect(PAGE).toMatch(/reads\.automation\s*\?\s*fetch\('\/api\/automation\?limit=5'\)/)
  })

  it('a reader sent on to a console of their own is sent before anything is fetched', () => {
    expect(PAGE).toMatch(/if \(sendingOn\) return\s*\n\s*fetchDashboard\(\)/)
  })

  it('a bench the seat may not read says so in words, never "No consultants on bench"', () => {
    expect(NOT_YOURS.bench).toMatch(/^Not yours to see/)
    expect(PAGE).toContain('NOT_YOURS.bench')
    expect(PAGE).toMatch(/d\.reads\.bench && d\.bench\.length === 0/)
  })
})
