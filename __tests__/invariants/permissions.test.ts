import { describe, it, expect } from 'vitest'

/**
 * Permission invariants — from BUILD.md §2.
 *
 * "Cannot be retrofitted. Every read path filters by context
 * from the first commit, or you audit every query later."
 *
 * One flat list. Roles are bundles. Field-level rules are the
 * ones a screen will quietly get wrong.
 */

import {
  PERMISSIONS,
  DEFAULT_ROLES,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  canReadPayRate,
  canReadBillRate,
  canReadCostAggregates,
  canReadMargin,
  filterAssignmentFields,
} from '@/lib/permissions'

describe('Permissions (BUILD.md §2)', () => {
  describe('The flat permission list', () => {
    it('has exactly 27 permissions', () => {
      expect(PERMISSIONS).toHaveLength(27)
    })

    it('every permission follows the resource.action pattern', () => {
      for (const p of PERMISSIONS) {
        expect(p).toMatch(/^[a-z]+\.[a-z]+$/)
      }
    })

    it('no duplicate permissions exist', () => {
      const unique = new Set(PERMISSIONS)
      expect(unique.size).toBe(PERMISSIONS.length)
    })
  })

  describe('The seven default roles', () => {
    it('exactly seven roles ship on company formation', () => {
      expect(DEFAULT_ROLES).toHaveLength(7)
    })

    it('includes Owner, Admin, Recruiter, Accountant, PM, RMG, Compliance Officer', () => {
      const names = DEFAULT_ROLES.map((r) => r.name)
      expect(names).toContain('Owner')
      expect(names).toContain('Admin')
      expect(names).toContain('Recruiter')
      expect(names).toContain('Accountant')
      expect(names).toContain('Project Manager')
      expect(names).toContain('Resource Manager')
      expect(names).toContain('Compliance Officer')
    })

    it('the Owner has all 24 permissions', () => {
      const owner = DEFAULT_ROLES.find((r) => r.name === 'Owner')!
      expect(owner.permissions.length).toBe(PERMISSIONS.length)
    })

    it('a recruiter cannot see costs — the blind spot that stops salary back-calculation', () => {
      const recruiter = DEFAULT_ROLES.find((r) => r.name === 'Recruiter')!
      expect(recruiter.permissions).not.toContain('consultants.cost')
      expect(recruiter.permissions).not.toContain('margin.read')
      expect(recruiter.permissions).not.toContain('pnl.read')
    })

    it('a recruiter can read and write consultants, read requirements, create submissions', () => {
      const recruiter = DEFAULT_ROLES.find((r) => r.name === 'Recruiter')!
      expect(recruiter.permissions).toContain('consultants.read')
      expect(recruiter.permissions).toContain('consultants.write')
      expect(recruiter.permissions).toContain('requirements.read')
      expect(recruiter.permissions).toContain('submissions.create')
    })

    it('an accountant can approve timesheets and issue invoices but not manage vendors', () => {
      const accountant = DEFAULT_ROLES.find((r) => r.name === 'Accountant')!
      expect(accountant.permissions).toContain('timesheets.approve')
      expect(accountant.permissions).toContain('invoices.issue')
      expect(accountant.permissions).toContain('payments.record')
      expect(accountant.permissions).not.toContain('vendors.manage')
    })

    it('an accountant can read, run, and approve payroll', () => {
      const accountant = DEFAULT_ROLES.find((r) => r.name === 'Accountant')!
      expect(accountant.permissions).toContain('payroll.read')
      expect(accountant.permissions).toContain('payroll.run')
      expect(accountant.permissions).toContain('payroll.approve')
    })

    it('a compliance officer can read but never write', () => {
      const co = DEFAULT_ROLES.find((r) => r.name === 'Compliance Officer')!
      for (const p of co.permissions) {
        expect(p).toMatch(/\.read$/)
      }
    })

    it('every role permission is from the canonical list', () => {
      const valid = new Set<string>(PERMISSIONS)
      for (const role of DEFAULT_ROLES) {
        for (const p of role.permissions) {
          expect(valid.has(p)).toBe(true)
        }
      }
    })
  })

  describe('Permission checker', () => {
    it('a wildcard (*) grants any permission', () => {
      expect(hasPermission(['*'], 'consultants.cost')).toBe(true)
      expect(hasPermission(['*'], 'pnl.read')).toBe(true)
    })

    it('a specific permission grants only that permission', () => {
      expect(hasPermission(['consultants.read'], 'consultants.read')).toBe(true)
      expect(hasPermission(['consultants.read'], 'consultants.write')).toBe(false)
    })

    it('hasAnyPermission passes when at least one matches', () => {
      expect(hasAnyPermission(['consultants.read'], ['consultants.read', 'margin.read'])).toBe(true)
      expect(hasAnyPermission(['team.manage'], ['consultants.read', 'margin.read'])).toBe(false)
    })

    it('hasAllPermissions passes only when every required permission is present', () => {
      expect(
        hasAllPermissions(['consultants.read', 'consultants.write'], ['consultants.read', 'consultants.write'])
      ).toBe(true)
      expect(hasAllPermissions(['consultants.read'], ['consultants.read', 'consultants.write'])).toBe(false)
    })
  })

  describe('Field-level access (the rules a screen will quietly get wrong)', () => {
    it('the person themselves can always see their own payRate', () => {
      expect(canReadPayRate({ permissions: [], isSubject: true })).toBe(true)
    })

    it('a recruiter without consultants.cost cannot see payRate', () => {
      const recruiter = DEFAULT_ROLES.find((r) => r.name === 'Recruiter')!
      expect(canReadPayRate({ permissions: [...recruiter.permissions] })).toBe(false)
    })

    it('an owner can see payRate via consultants.cost', () => {
      expect(canReadPayRate({ permissions: ['consultants.cost'] })).toBe(true)
    })

    it('the client on an MSA can see billRate', () => {
      expect(canReadBillRate({ permissions: [], isClientOnMsa: true })).toBe(true)
    })

    it('a recruiter cannot see billRate or margin', () => {
      const recruiter = DEFAULT_ROLES.find((r) => r.name === 'Recruiter')!
      expect(canReadBillRate({ permissions: [...recruiter.permissions] })).toBe(false)
      expect(canReadMargin({ permissions: [...recruiter.permissions] })).toBe(false)
    })

    it('bench burn requires consultants.cost', () => {
      expect(canReadCostAggregates({ permissions: ['consultants.cost'] })).toBe(true)
      expect(canReadCostAggregates({ permissions: ['consultants.read'] })).toBe(false)
    })

    it('filterAssignmentFields strips payRate from a recruiter view', () => {
      const assignment = { id: '1', payRate: 85, billRate: 120, margin: 35, title: 'Dev' }
      const recruiter = DEFAULT_ROLES.find((r) => r.name === 'Recruiter')!
      const filtered = filterAssignmentFields(assignment, { permissions: [...recruiter.permissions] })
      expect(filtered.payRate).toBeUndefined()
      expect(filtered.billRate).toBeUndefined()
      expect(filtered.title).toBe('Dev') // non-sensitive fields pass through
    })

    it('filterAssignmentFields keeps payRate for the person themselves', () => {
      const assignment = { id: '1', payRate: 85, title: 'Dev' }
      const filtered = filterAssignmentFields(assignment, { permissions: [], isSubject: true })
      expect(filtered.payRate).toBe(85)
    })
  })
})
