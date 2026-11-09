import { describe, it, expect } from 'vitest'
import {
  NARROWED_AT_THE_QUERY, GRANTABLE_TO_A_TEAM, grantedPermissions, effectivePermissions, scopeFrom, checkGrant, type GrantRow,
} from '@/lib/permission-grants/rules'
import { hasPermission } from '@/lib/permissions'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const CO = 'brightmoor'
const seat = { companyId: CO, roleId: 'role-recruiter', contextId: 'ctx-dana' }
const RECRUITER = ['consultants.read', 'requirements.read', 'assignments.read']
const units = [
  { id: 'ohio', parentId: null }, { id: 'dayton', parentId: 'ohio' }, { id: 'belfast', parentId: null },
]
const grant = (g: Partial<GrantRow>): GrantRow => ({
  companyId: CO, permission: 'submissions.read', roleId: null, contextId: 'ctx-dana', scope: 'UNIT', orgUnitId: 'dayton', revokedAt: null, ...g,
})
const JOBS_AND_SUBMISSIONS = ['requirements.read', 'requirements.write', 'submissions.read', 'submissions.create']

describe('A team grant of jobs or submissions is kept at its reach and opens only a route that narrows by it (2026-11-08)', () => {
  it('jobs and submissions may be given to a team, while only margin and profit and loss enter the yes-or-no answer at a team’s reach', () => {
    for (const p of JOBS_AND_SUBMISSIONS) {
      expect(GRANTABLE_TO_A_TEAM.has(p), p).toBe(true)
      expect(NARROWED_AT_THE_QUERY.has(p), p).toBe(false)
    }
    for (const p of ['margin.read', 'pnl.read']) {
      expect(GRANTABLE_TO_A_TEAM.has(p)).toBe(true)
      expect(NARROWED_AT_THE_QUERY.has(p)).toBe(true)
    }
    expect(GRANTABLE_TO_A_TEAM.has('payroll.read')).toBe(false)
  })

  it('a team grant of submissions.read is accepted for storing, and hasPermission still says no, so no route that has not narrowed opens to it', () => {
    const verdict = checkGrant({
      companyName: 'Brightmoor Staffing',
      granter: { isOwner: true, hasGrantRight: false, permissions: ['*'], scope: { has: true, scope: 'COMPANY', unitIds: [] } },
      permission: 'submissions.read', roleId: null, contextId: 'ctx-dana',
      holder: { kind: 'PERSON', name: 'Dana Ruiz' }, holderSets: [{ name: 'Dana Ruiz', roleName: 'Recruiter', permissions: RECRUITER }],
      alreadyHeld: false, scope: 'UNIT', orgUnitId: 'dayton', unitAtCompany: true, reason: 'She runs the Dayton desk.',
    })
    expect(verdict).toEqual({ ok: true })
    const g = [grant({})]
    expect(grantedPermissions(RECRUITER, seat, g)).toEqual([])
    expect(hasPermission(effectivePermissions(RECRUITER, seat, g), 'submissions.read')).toBe(false)
  })

  it('a recruiter granted submissions on the Dayton team is read at the Dayton team and the teams under it, never another team’s', () => {
    const s = scopeFrom({ rolePermissions: RECRUITER, seat, grants: [grant({})], units }, 'submissions.read')
    expect(s).toEqual({ has: true, scope: 'UNIT', unitIds: ['dayton'] })
    expect(s.unitIds).not.toContain('belfast')
    expect(s.unitIds).not.toContain('ohio')
  })

  it('the role’s own permission still reads the whole firm’s jobs, whatever a grant says', () => {
    const s = scopeFrom({ rolePermissions: RECRUITER, seat, grants: [grant({ permission: 'requirements.read' })], units }, 'requirements.read')
    expect(s).toEqual({ has: true, scope: 'COMPANY', unitIds: [] })
  })

  it('a company-wide grant of submissions still opens the door as the role would', () => {
    const g = [grant({ scope: 'COMPANY', orgUnitId: null })]
    expect(grantedPermissions(RECRUITER, seat, g)).toEqual(['submissions.read'])
  })

  it('margin for the Dayton team is unchanged: it enters the yes-or-no answer and reads at the team', () => {
    const g = [grant({ permission: 'margin.read' })]
    expect(grantedPermissions(RECRUITER, seat, g)).toEqual(['margin.read'])
    expect(scopeFrom({ rolePermissions: RECRUITER, seat, grants: g, units }, 'margin.read')).toEqual({ has: true, scope: 'UNIT', unitIds: ['dayton'] })
  })

  it('payroll still cannot be given to a team: a narrower grant is refused in a sentence rather than stored', () => {
    const verdict = checkGrant({
      companyName: 'Brightmoor Staffing',
      granter: { isOwner: true, hasGrantRight: false, permissions: ['*'], scope: { has: true, scope: 'COMPANY', unitIds: [] } },
      permission: 'timesheets.approve', roleId: null, contextId: 'ctx-dana',
      holder: { kind: 'PERSON', name: 'Dana Ruiz' }, holderSets: [{ name: 'Dana Ruiz', roleName: 'Recruiter', permissions: RECRUITER }],
      alreadyHeld: false, scope: 'UNIT', orgUnitId: 'dayton', unitAtCompany: true, reason: 'Dayton weeks.',
    })
    expect(verdict).toMatchObject({ ok: false, field: 'scope' })
  })

  it('Give access offers a team and somebody\u2019s own work for jobs and submissions now that their routes narrow, and the whole company only for what no reader narrows', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/settings/grants/route.ts'), 'utf8')
    expect(route).toContain("scopes: key !== GRANT_RIGHT && GRANTABLE_TO_A_TEAM.has(key) ? GRANT_SCOPES : ['COMPANY']")
    expect(route).not.toContain('NARROWED_AT_THE_QUERY.has(key)')
  })
})
