import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hasPermission } from '@/lib/permissions'

/**
 * Karthik Menon holds no assignments.write, and the contracts page offered
 * him "+ Record a placement", which POST /api/contracts refuses. A control
 * the route would refuse is a control that lies.
 */

const root = join(__dirname, '..', '..')
const page = readFileSync(join(root, 'src/app/dashboard/contracts/page.tsx'), 'utf8')
const route = readFileSync(join(root, 'src/app/api/contracts/route.ts'), 'utf8')
const empty = readFileSync(join(root, 'src/lib/money/contracts-empty.ts'), 'utf8')

describe('Record a placement is offered only to a seat the route will let record one', () => {
  it('a seat without assignments.write is not offered Record a placement', () => {
    // The route asks for assignments.write, and the page asks the same question the same way.
    expect(route).toMatch(/hasPermission\(caller\.permissions, 'assignments\.write'\)/)
    expect(page).toMatch(/const mayRecord = hasPermission\(permissions, 'assignments\.write'\)/)
    // The button, the ?new=1 door and the empty-state sentence all ask it;
    // the framing is null until the reader is known, so the button waits too.
    expect(page).toMatch(/\{framing\?\.create && mayRecord && \(/)
    expect(page).toMatch(/if \(mayRecord\) setShowCreate\(true\)/)
    // A refused read returns its sentence before the head is drawn, so no button on a refusal.
    expect(page.indexOf('if (refused) {')).toBeGreaterThan(-1)
    expect(page.indexOf('if (refused) {')).toBeLessThan(page.indexOf('{framing?.create && mayRecord && ('))
    // The empty-state sentence lives in lib/money/contracts-empty now, and the page hands it the same answer.
    expect(page).toMatch(/contractsEmpty\(\{[^}]*\bmayRecord\b[^}]*\}\)/)
    expect(empty).toMatch(/args\.mayRecord\s*\?\s*'submission, and you can record work you are already running with Record a placement\.'/)
    // And the question has the answer it should, for a worker and for an owner.
    expect(hasPermission(['timesheets.write', 'me.read'], 'assignments.write')).toBe(false)
    expect(hasPermission(['*'], 'assignments.write')).toBe(true)
  })
})
