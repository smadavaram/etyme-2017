import { describe, it, expect } from 'vitest'
import { rolesFor } from '@/lib/company-defaults'

/**
 * A Team Lead role, so a delivery manager has somebody narrower than
 * themselves to hand a project to.
 *
 * The other half of this — naming that person as a specific contract's
 * timesheet approver — needs a SellContract.approverPersonId column, and
 * was rolled back when it turned out the production database had not
 * been migrated for it. The role stays; the wiring comes back with the
 * migration.
 */

describe('a Team Lead role exists to name that grant on the access screen', () => {
  const gsiRoles = rolesFor('GSI')

  it('is one of the roles a GSI gets by default', () => {
    expect(gsiRoles.map((r) => r.name)).toContain('Team Lead')
  })

  it('carries no company-wide timesheets.approve — the whole point of the role', () => {
    const teamLead = gsiRoles.find((r) => r.name === 'Team Lead')!
    expect(teamLead.permissions).not.toContain('timesheets.approve')
  })

  it('can still see the work it will be asked to approve', () => {
    const teamLead = gsiRoles.find((r) => r.name === 'Team Lead')!
    expect(teamLead.permissions).toContain('timesheets.read')
  })

  it('is not the only GSI role missing blanket approval — Delivery Manager has none either', () => {
    // Confirms the gap this whole feature closes: before approverPersonId,
    // no default GSI role except Owner/Admin could approve a timesheet
    // at all.
    const deliveryManager = gsiRoles.find((r) => r.name === 'Delivery Manager')!
    expect(deliveryManager.permissions).not.toContain('timesheets.approve')
  })
})
