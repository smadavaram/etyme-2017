import { describe, it, expect } from 'vitest'
import { stageOf, mayEdit, closedBecause, STAGES } from '@/lib/requisition-stage'

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

  it('a filled requisition is put away — filled is a placement\'s word, read in Submissions', () => {
    expect(stageOf(row({ status: 'FILLED', approvalState: 'APPROVED' }))).toBe('ARCHIVED')
  })

  it('a settled row says why it closed: the seats filled, or cancelled with the reason', () => {
    expect(closedBecause({ ...row({ status: 'FILLED' }), headcount: 2 })).toBe('all 2 seats filled')
    expect(closedBecause({ ...row({ status: 'FILLED' }), headcount: 1 })).toBe('the seat filled')
    expect(closedBecause({ ...row({ status: 'CANCELLED' }), cancelReason: 'the project was pulled' }))
      .toBe('cancelled — the project was pulled')
    expect(closedBecause(row({ status: 'OPEN', approvalState: 'APPROVED' }))).toBeNull()
  })

  it('archiving puts a row away without overwriting what happened to it', () => {
    const cancelled = { ...row({ status: 'CANCELLED' }), cancelReason: 'budget cut', archivedAt: new Date() }
    expect(stageOf(cancelled)).toBe('ARCHIVED')
    expect(closedBecause(cancelled)).toBe('cancelled — budget cut')
  })

  it('open to suppliers is called Published, and Archived has a tab of its own', () => {
    const labels = Object.fromEntries(STAGES)
    expect(labels.OPEN).toBe('Published')
    expect(labels.ARCHIVED).toBe('Archived')
    expect(labels).not.toHaveProperty('FILLED')
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

  it('a published requirement can still be changed — words freely with suppliers told, money back through approval', () => {
    expect(mayEdit(row({ status: 'OPEN', approvalState: 'APPROVED' }))).toBe(true)
  })

  it('one still waiting on a desk can be changed too', () => {
    expect(mayEdit(row({ status: 'OPEN', approvalState: 'PENDING_APPROVAL' }))).toBe(true)
  })

  it('a filled requisition cannot be edited', () => {
    expect(mayEdit(row({ status: 'FILLED', approvalState: 'APPROVED' }))).toBe(false)
  })

  it('a cancelled requisition cannot be edited back to life', () => {
    expect(mayEdit(row({ status: 'CANCELLED', approvalState: 'APPROVED' }))).toBe(false)
  })
})

describe('a role that is over does not read as one nobody has written', () => {
  /**
   * `CLOSED` is a status the product writes and `stageOf` did not name,
   * so it fell through to the draft branch: a settled role read "Draft"
   * on the supplier's list and on the client's. Found by walking, on
   * 2026-09-22, which is how this class of bug is always found.
   */

  it('a closed role reads as Archived, not as a draft nobody has written', () => {
    expect(stageOf(row({ status: 'CLOSED', approvalState: 'APPROVED' }))).toBe('ARCHIVED')
  })

  it('a closed role says on its own row that it was closed rather than withdrawn', () => {
    // "Closed" and "cancelled" are one word to a reader, and only one of
    // them means somebody pulled it.
    expect(closedBecause(row({ status: 'CLOSED' }))).toBe('closed without being filled')
  })

  it('a cancelled role reads as Cancelled, and says who withdrew it', () => {
    const r = row({ status: 'CANCELLED', cancelReason: 'the project was pulled' })
    expect(stageOf(r)).toBe('CANCELLED')
    expect(closedBecause(r)).toContain('the project was pulled')
  })

  it('a role turned down at approval says it was turned down at approval', () => {
    const r = row({ status: 'DRAFT', approvalState: 'REJECTED' })
    expect(stageOf(r)).toBe('ARCHIVED')
    expect(closedBecause(r)).toBe('turned down at approval')
  })

  it('a role handed back for changes is not turned down, and is still the manager’s to fix', () => {
    const r = row({ status: 'OPEN', approvalState: 'CHANGES_REQUESTED' })
    expect(stageOf(r)).toBe('CHANGES')
    expect(mayEdit(r)).toBe(true)
  })

  it('a closed role cannot be edited', () => {
    expect(mayEdit(row({ status: 'CLOSED', approvalState: 'APPROVED' }))).toBe(false)
  })

  it('a role turned down at approval cannot be edited either', () => {
    expect(mayEdit(row({ status: 'DRAFT', approvalState: 'REJECTED' }))).toBe(false)
  })

  it('a status nobody has placed reads as finished, never as a draft', () => {
    // The safe direction: a stale role offered for editing invites
    // somebody to work on something that is over, and a live one that
    // looks settled is corrected by its own status the moment anybody
    // opens it.
    expect(stageOf(row({ status: 'ON_HOLD_PENDING_BUDGET' }))).toBe('ARCHIVED')
    expect(mayEdit(row({ status: 'ON_HOLD_PENDING_BUDGET' }))).toBe(false)
  })

  it('every status the schema lists lands in a tab somebody can find it in', () => {
    const tabs = STAGES.map(([key]) => key)
    for (const status of ['DRAFT', 'OPEN', 'FILLED', 'CLOSED', 'CANCELLED']) {
      expect(tabs, status).toContain(stageOf(row({ status })))
    }
  })
})
