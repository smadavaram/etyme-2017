import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rolesFor } from '@/lib/company-defaults'

/**
 * "As a delivery I will have team leads assigned to manage and approve
 * timesheets for the project." Two pieces: naming who (this route), and
 * the role that grant shows up under on the access screen instead of
 * looking like a person with no rights at all (company-defaults.ts).
 */

const ROUTE = readFileSync(
  join(__dirname, '../../src/app/api/contracts/[id]/approver/route.ts'),
  'utf8'
)

describe('naming a contract\'s timesheet approver', () => {
  it('is the employer\'s call, never the client\'s', () => {
    expect(ROUTE).toContain('caller.company?.id !== contract.companyId')
  })

  it('refuses to name the contract\'s own person as their own approver', () => {
    expect(ROUTE).toContain('approverPersonId === contract.personId')
  })

  it('refuses to name somebody who is not actually at the company', () => {
    expect(ROUTE).toContain('NOT_A_MEMBER')
    expect(ROUTE).toContain('companyId: contract.companyId')
  })

  it('clearing puts approval back to whoever holds it company-wide, rather than leaving nobody able to approve', () => {
    expect(ROUTE).toContain('approverPersonId: null')
  })

  it('logs both assigning and clearing, same as every other change of who may do what', () => {
    expect(ROUTE).toContain("action: 'CONTRACT_APPROVER_ASSIGNED'")
    expect(ROUTE).toContain("action: 'CONTRACT_APPROVER_CLEARED'")
  })
})

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
