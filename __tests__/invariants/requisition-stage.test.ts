import { describe, it, expect } from 'vitest'
import { stageOf, mayEdit, STAGES } from '@/lib/requisition-stage'

/**
 * Where a requisition shows up, and whether it can still be changed.
 *
 * Cancel, archive and ask-for-changes were all built before anywhere
 * existed to put their results, so each one changed a column and left
 * the row sitting in the wrong bucket. These are the cases that were
 * silently wrong.
 */

const row = (o: Partial<Parameters<typeof stageOf>[0]>) => ({
  status: 'DRAFT',
  approvalState: 'DRAFT',
  archivedAt: null,
  ...o,
})

describe('where a requisition shows up', () => {
  it('a cancelled requisition is cancelled, not a draft', () => {
    expect(stageOf(row({ status: 'CANCELLED' }))).toBe('CANCELLED')
  })

  it('a cancelled requisition stays cancelled even though it was open to suppliers', () => {
    // status is the one column cancelling writes, so the row still reads
    // as approved and everything else it ever was.
    expect(stageOf(row({ status: 'CANCELLED', approvalState: 'APPROVED' }))).toBe('CANCELLED')
  })

  it('one handed back for changes is not a draft — somebody has already looked at it', () => {
    expect(stageOf(row({ approvalState: 'CHANGES_REQUESTED' }))).toBe('CHANGES')
  })

  it('one waiting on an approver says so even while it is open to suppliers', () => {
    expect(stageOf(row({ status: 'OPEN', approvalState: 'PENDING_APPROVAL' }))).toBe('AWAITING')
  })

  it('one that cleared without a human is open to suppliers, not awaiting anybody', () => {
    expect(stageOf(row({ status: 'OPEN', approvalState: 'AUTO_APPROVED' }))).toBe('OPEN')
  })

  it('a filled requisition reads as filled', () => {
    expect(stageOf(row({ status: 'FILLED', approvalState: 'APPROVED' }))).toBe('FILLED')
  })

  it('archiving does not change what happened to it', () => {
    const open = row({ status: 'OPEN', approvalState: 'APPROVED' })
    expect(stageOf({ ...open, archivedAt: new Date() })).toBe(stageOf(open))
  })

  it('every stage a row can reach has a tab to show it in', () => {
    const reachable = [
      row({ status: 'CANCELLED' }),
      row({ approvalState: 'PENDING_APPROVAL' }),
      row({ approvalState: 'CHANGES_REQUESTED' }),
      row({ status: 'OPEN', approvalState: 'AUTO_APPROVED' }),
      row({ status: 'FILLED' }),
      row({}),
    ].map(stageOf)
    const tabs = STAGES.map(([key]) => key)
    for (const s of reachable) expect(tabs).toContain(s)
  })
})

describe('whether it can still be changed', () => {
  it('a draft can be edited', () => {
    expect(mayEdit(row({ status: 'DRAFT' }))).toBe(true)
  })

  it('one an approver handed back can be edited — otherwise the request is a dead end', () => {
    expect(mayEdit(row({ status: 'OPEN', approvalState: 'CHANGES_REQUESTED' }))).toBe(true)
  })

  it('one open to suppliers cannot be edited underneath them', () => {
    expect(mayEdit(row({ status: 'OPEN', approvalState: 'APPROVED' }))).toBe(false)
  })

  it('a filled requisition cannot be edited', () => {
    expect(mayEdit(row({ status: 'FILLED', approvalState: 'APPROVED' }))).toBe(false)
  })

  it('a cancelled requisition cannot be edited back to life', () => {
    expect(mayEdit(row({ status: 'CANCELLED', approvalState: 'APPROVED' }))).toBe(false)
  })
})
