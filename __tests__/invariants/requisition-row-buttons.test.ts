import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { rowActions, mayRaise, mayChange } from '@/app/dashboard/requisitions/row-actions'
import { deskOf } from '@/components/shell/sidebar-props'

/**
 * The job request list offers a button only where the route will take
 * the press (outside review of the live demo, 2026-10-05).
 */

const OPEN = { status: 'OPEN', approvalState: 'APPROVED', archivedAt: null, raisedBy: { id: 'raiser' }, owner: { id: 'manager' } }
const DRAFT = { ...OPEN, status: 'DRAFT', approvalState: 'DRAFT' }
const FILLED = { ...OPEN, status: 'FILLED' }

const manager = { permissions: ['requirements.read', 'requirements.write'], personId: 'manager' }
const otherManager = { permissions: ['requirements.read', 'requirements.write'], personId: 'somebody-else' }
const office = { permissions: ['requirements.write', 'governance.write'], personId: 'office' }
const approver = { permissions: ['requirements.read', 'requisitions.approve'], personId: 'manager' }

describe('Edit, Cancel and Archive on a job request’s row', () => {
  it('a desk without requirements.write is offered no Edit, Cancel or Archive, because the route refuses all three', () => {
    expect(rowActions(OPEN, approver, false)).toEqual({ edit: false, cancel: false, archive: false })
    expect(rowActions(FILLED, approver, false)).toEqual({ edit: false, cancel: false, archive: false })
  })

  it('the manager it is for, and whoever raised it, may edit and cancel their own job request', () => {
    expect(rowActions(OPEN, manager, false)).toEqual({ edit: true, cancel: true, archive: false })
    expect(rowActions(OPEN, { ...manager, personId: 'raiser' }, false).edit).toBe(true)
  })

  it('another team’s hiring manager is not offered a change to a job request that is not theirs', () => {
    expect(mayChange(OPEN, otherManager)).toBe(false)
    expect(rowActions(OPEN, otherManager, false)).toEqual({ edit: false, cancel: false, archive: false })
  })

  it('the program office may change any job request in its program', () => {
    expect(rowActions(DRAFT, office, false)).toEqual({ edit: true, cancel: true, archive: true })
  })

  it('a published job request cannot be archived, and a filled one cannot be cancelled', () => {
    expect(rowActions(OPEN, office, false).archive).toBe(false)
    expect(rowActions(FILLED, office, false).cancel).toBe(false)
  })

  it('a row a desk is deciding offers no Cancel or Archive to the editor', () => {
    const r = rowActions(DRAFT, office, true)
    expect(r.cancel).toBe(false)
    expect(r.archive).toBe(false)
  })

  it('Raise one is offered only to a desk holding requirements.write', () => {
    expect(mayRaise(['requirements.write'])).toBe(true)
    expect(mayRaise(['requirements.read'])).toBe(false)
    expect(mayRaise(null)).toBe(false)
  })

  it('a program office seated at a client’s desk is judged by the client’s role, never by its own firm’s', () => {
    // Maren MSP holds requirements.write as a firm; the seat at the client
    // is the compliance desk, which does not.
    const session = {
      company: { kind: 'MSP' } as any, contextType: 'EMPLOYEE' as any, isWorker: false,
      permissions: ['requirements.write', 'governance.write'],
      seat: { clientName: 'Talvern Medical', permissions: ['requirements.read', 'compliance.read'] } as any,
    }
    const { permissions } = deskOf(session)
    expect(mayRaise(permissions)).toBe(false)
    expect(rowActions(OPEN, { permissions, personId: 'manager' }, false).edit).toBe(false)
  })

  it('the list page asks the seat for its permissions and the row-actions rule for its buttons', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/dashboard/requisitions/page.tsx'), 'utf8')
    expect(page).toContain('deskOfSession(session)')
    // Through raiseVerdict, which asks mayRaise once the session has answered.
    expect(page).toContain('raiseVerdict(session, permissions)')
    expect(page).toContain('rowActions(r, { permissions, personId: me?.id ?? null }')
    expect(page).not.toContain("hasPermission(permissions, 'requirements.write')")
  })
})
