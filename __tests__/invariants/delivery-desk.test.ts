import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deliveryDeskSays } from '@/app/api/submissions/kind'
import { rolesFor } from '@/lib/company-defaults'
import { hasPermission } from '@/lib/permissions'

const DOOR = readFileSync(join(process.cwd(), 'src/app/api/submissions/route.ts'), 'utf8')

describe('a delivery manager puts forward only the firm’s own people', () => {
  it('the refusal names the person, the firm and the recruiting desk that can submit them', () => {
    expect(deliveryDeskSays('Tamsin Okoro', 'Teleworld Solutions')).toBe(
      'Tamsin Okoro is not employed by Teleworld Solutions, so a delivery manager cannot put them forward. ' +
      'Somebody the firm does not employ needs their own consent and a bench listing — ask a recruiter, a resource manager or the account manager to submit them.'
    )
  })

  it('the submission door lets the delivery desk in and refuses it per person wherever the firm is not the employer', () => {
    expect(DOOR).toContain("hasPermission(deskPermissions, 'assignments.write')")
    expect(DOOR).toContain('if (deliveryDeskOnly && !employedByUs) {')
    expect(DOOR.indexOf('if (deliveryDeskOnly && !employedByUs) {')).toBeGreaterThan(DOOR.indexOf('const employedByUs = employment !== null'))
  })

  // Simulation, 2026-10-20: the match route asks for the recruiting team's
  // submit permission, and the delivery manager does not hold it. Granting
  // it would end the carve-out above — the submit door would then read a
  // delivery manager as the recruiting team, and let them put forward
  // people the firm does not employ. So the role stays as it is, and the
  // match route is the one to let the delivery manager in on their own
  // people (demand's route).
  it('a delivery manager does not hold the recruiting team’s submit permission, so it can only ever put forward the firm’s own people', () => {
    for (const kind of ['GSI'] as const) {
      const dm = rolesFor(kind).find((r) => r.name === 'Delivery Manager')!
      expect(dm, kind).toBeDefined()
      expect(hasPermission(dm.permissions, 'submissions.create'), kind).toBe(false)
      expect(hasPermission(dm.permissions, 'assignments.write'), kind).toBe(true)
    }
  })
})
