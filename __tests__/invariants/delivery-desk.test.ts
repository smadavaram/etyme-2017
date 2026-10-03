import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deliveryDeskSays } from '@/app/api/submissions/kind'

const DOOR = readFileSync(join(process.cwd(), 'src/app/api/submissions/route.ts'), 'utf8')

describe('a delivery manager puts forward only the firm’s own people', () => {
  it('the refusal names the person, the firm and the recruiting desk that can submit them', () => {
    expect(deliveryDeskSays('Tamsin Okoro', 'Teleworld Solutions')).toBe(
      'Tamsin Okoro is not employed by Teleworld Solutions, so a delivery manager cannot put them forward. ' +
      'Somebody the firm does not employ needs their own consent and a bench listing — ask a recruiter, a resource manager or the account manager to submit them.'
    )
  })

  it('the submission door lets the delivery desk in and refuses it per person wherever the firm is not the employer', () => {
    expect(DOOR).toContain("hasPermission(caller.permissions, 'assignments.write')")
    expect(DOOR).toContain('if (deliveryDeskOnly && !employedByUs) {')
    expect(DOOR.indexOf('if (deliveryDeskOnly && !employedByUs) {')).toBeGreaterThan(DOOR.indexOf('const employedByUs = employment !== null'))
  })
})
