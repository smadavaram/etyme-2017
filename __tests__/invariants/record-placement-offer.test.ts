import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hasPermission } from '@/lib/permissions'
import { clientOptions, NO_CLIENTS_SAYS, NO_CLIENTS_HREF } from '@/lib/money/client-options'

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

/**
 * Tapin's first morning (2026-10-19): the client list was read only off
 * the firm's own sell contracts, so its first contract offered nobody to
 * bill, even after it added its client from Companies.
 */
describe('Record a placement offers the clients on the firm’s register, before it has any contract', () => {
  it('a supplier’s first new contract offers the client it added from Companies, marked not on Etyme yet', () => {
    const register = [
      { id: 'harrow', name: 'Harrow Freight Lines', onEtyme: false },
      { id: 'northbend', name: 'Northbend Athletic', onEtyme: true },
    ]
    expect(clientOptions(register, [])).toEqual([
      { id: 'harrow', name: 'Harrow Freight Lines — not on Etyme yet' },
      { id: 'northbend', name: 'Northbend Athletic' },
    ])
    // A client also named on a contract is offered once, and keeps its words.
    const contracts = [
      { clientCompany: { id: 'harrow', name: 'Harrow Freight Lines' }, endClientCompany: { id: 'cavanaugh', name: 'Cavanaugh Glassworks' } },
    ]
    expect(clientOptions(register, contracts)).toEqual([
      { id: 'cavanaugh', name: 'Cavanaugh Glassworks' },
      { id: 'harrow', name: 'Harrow Freight Lines — not on Etyme yet' },
      { id: 'northbend', name: 'Northbend Athletic' },
    ])
    // The page reads the register beside its contracts, and hands both to the one function.
    expect(page).toContain("fetch('/api/clients')")
    expect(page).toContain('setClientCompanies(clientOptions(register, contracts))')
  })

  it('with no clients the form says to add one from Companies and that they need not be on Etyme', () => {
    expect(NO_CLIENTS_SAYS).toBe('No clients yet. Add one from Companies — they do not need to be on Etyme.')
    expect(NO_CLIENTS_HREF).toBe('/dashboard/companies')
    expect(page).toMatch(/\{!loadingOptions && clientCompanies\.length === 0 && \(/)
    expect(page).toContain('<Link href={NO_CLIENTS_HREF}')
    // The route's refusal says the same in words, and names no API path.
    expect(route).toContain("'We could not find that client. Add them from Companies first; they do not need to be on Etyme.'")
    expect(route).not.toContain('POST /api/clients with their name')
  })
})
