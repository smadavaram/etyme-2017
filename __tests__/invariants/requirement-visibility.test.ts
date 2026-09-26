import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { requirementForReader, isPaused, type RequirementRow } from '@/app/api/requirements/visible'
import { stageWordFor, stageReason } from '@/app/dashboard/requirements/words'
import { stageOf, closedBecause } from '@/lib/requisition-stage'

/**
 * What a supplier is told about a client's role, and what it is not.
 *
 * `GET /api/requirements` is one list read by two kinds of reader: the
 * company that raised the role, and every supplier it was sent to. The
 * route loaded the whole row and sent four fewer fields than it had, so
 * nothing downstream could compute where a role had got to — and a
 * supplier went on working a role that had been withdrawn.
 *
 * Adding the fields is the easy half. The half worth testing is which
 * reader gets which: whether a role is still live is the supplier's own
 * business, and whose desk has signed is the client's.
 */

const ROOT = process.cwd()
const DETAIL = readFileSync(
  join(ROOT, 'src/app/dashboard/requirements/[id]/page.tsx'),
  'utf8'
)

const CLIENT = 'client-northbend'
const SUPPLIER = 'supplier-veritan'

const row = (o: Partial<RequirementRow> = {}): RequirementRow => ({
  id: 'req-1',
  title: 'Validation engineer',
  skills: ['GMP'],
  location: 'Tualatin, OR',
  billMin: 8000,
  billMax: 11000,
  months: 6,
  startDate: null,
  status: 'OPEN',
  approvalState: 'APPROVED',
  archivedAt: null,
  headcount: 1,
  cancelReason: null,
  source: 'MANUAL',
  marginClass: 'EXPERTISE',
  rateVisible: false,
  endClientVisible: false,
  companyId: CLIENT,
  company: { id: CLIENT, name: 'Northbend Athletic' },
  endClientCompany: null,
  _count: { submissions: 2, matches: 4, invitations: 3 },
  createdAt: new Date('2026-09-01T00:00:00Z'),
  ...o,
})

/** The row as a supplier receives it, ready for `stageOf`. */
const asSupplierSees = (o: Partial<RequirementRow> = {}) =>
  requirementForReader(row(o), SUPPLIER)

const asClientSees = (o: Partial<RequirementRow> = {}) =>
  requirementForReader(row(o), CLIENT)

describe('what the roles list tells a supplier', () => {

  it('a supplier reads whether a role is still live, because a role called off last week is work nobody should be doing', () => {
    const cancelled = asSupplierSees({ status: 'CANCELLED', cancelReason: 'the project was pulled' })
    expect(cancelled.status).toBe('CANCELLED')
    expect(stageOf(cancelled)).toBe('CANCELLED')

    const putAway = asSupplierSees({ archivedAt: new Date('2026-09-15T00:00:00Z') })
    expect(putAway.archivedAt).toBe('2026-09-15T00:00:00.000Z')
    expect(stageOf(putAway)).toBe('ARCHIVED')
  })

  it('a supplier reads why a role stopped, in the words the client wrote', () => {
    const r = asSupplierSees({ status: 'CANCELLED', cancelReason: 'the headcount was cut' })
    expect(r.cancelReason).toBe('the headcount was cut')
    expect(stageReason(r)).toBe('the headcount was cut')
  })

  it('a supplier never reads whether the client’s own approvers have signed', () => {
    for (const state of ['DRAFT', 'PENDING_APPROVAL', 'CHANGES_REQUESTED', 'APPROVED', 'AUTO_APPROVED', 'REJECTED']) {
      expect(asSupplierSees({ approvalState: state }).approvalState).toBe('')
    }
  })

  it('the company that raised the role reads its own approval state, because it is the desk that has to act on it', () => {
    expect(asClientSees({ approvalState: 'PENDING_APPROVAL' }).approvalState).toBe('PENDING_APPROVAL')
    expect(asClientSees({ approvalState: 'CHANGES_REQUESTED' }).approvalState).toBe('CHANGES_REQUESTED')
  })

  it('the seat count travels with the role, so a settled row can say "all 3 seats filled" rather than "archived"', () => {
    const r = asSupplierSees({ status: 'FILLED', headcount: 3, archivedAt: new Date() })
    expect(r.headcount).toBe(3)
    expect(closedBecause(r)).toBe('all 3 seats filled')
  })

  it('the buyer’s rate band still goes nowhere but the buyer', () => {
    expect(asSupplierSees().billMin).toBeUndefined()
    expect(asSupplierSees().billMax).toBeUndefined()
    expect(asClientSees().billMin).toBe(8000)
    // And the end client stays the buyer's, unless the buyer opened it.
    expect(asSupplierSees({ endClientCompany: { id: 'x', name: 'Talvern Medical' } }).endClientCompany).toBeNull()
    expect(
      asSupplierSees({ endClientVisible: true, endClientCompany: { id: 'x', name: 'Talvern Medical' } })
        .endClientCompany?.name
    ).toBe('Talvern Medical')
  })
})

/**
 * The empty approval state is the load-bearing part of the decision
 * above: it has to be inert, not merely absent. `stageOf` matches
 * `approvalState` against three named strings, and if an empty one could
 * fall into any of them a supplier's live role would read as put away —
 * which is the same bug facing the other way, and worse, because it
 * hides work that is real.
 */
describe('an empty approval state is inert, never a verdict', () => {

  it('an empty approval state leaves a supplier’s live role open, never archived', () => {
    const r = asSupplierSees({ status: 'OPEN', approvalState: 'APPROVED' })
    expect(r.approvalState).toBe('')
    expect(stageOf(r)).toBe('OPEN')
    expect(stageWordFor(r)).toBe('Published')
  })

  it('an empty approval state still shows a supplier a cancelled role as cancelled', () => {
    const r = asSupplierSees({ status: 'CANCELLED', approvalState: 'APPROVED' })
    expect(stageOf(r)).toBe('CANCELLED')
    expect(stageWordFor(r)).toBe('Cancelled')
  })

  it('an empty approval state still shows a supplier a closed role as put away', () => {
    const r = asSupplierSees({ status: 'CLOSED', approvalState: 'APPROVED' })
    expect(stageOf(r)).toBe('ARCHIVED')
    expect(stageWordFor(r)).toBe('Closed')
  })

  it('a role a client turned down is never in a supplier’s list to be misread, and reads open if it somehow is', () => {
    // REJECTED is the one approval state that promotes a row to
    // ARCHIVED. A supplier is given '' instead, so a rejected role
    // cannot be mistaken for a rejected *submission* on their list —
    // and distribution refuses to send an unapproved role in the first
    // place, so this is a belt on a brace.
    const r = asSupplierSees({ status: 'OPEN', approvalState: 'REJECTED' })
    expect(stageOf(r)).toBe('OPEN')
    expect(stageOf(asClientSees({ status: 'OPEN', approvalState: 'REJECTED' }))).toBe('ARCHIVED')
  })
})

/**
 * Paused is the answer to the one real argument for showing a supplier
 * the approval state: it tells a recruiter not to submit yet. The
 * submissions door already refuses a re-approving role in that word, so
 * the list is saying the same thing an afternoon earlier — without
 * naming a desk, a person or an order.
 */
describe('a published role being re-approved', () => {

  it('a published role sent back for re-approval reads as paused to a supplier, without naming the desk it waits on', () => {
    const r = asSupplierSees({ status: 'OPEN', approvalState: 'PENDING_APPROVAL' })
    expect(r.paused).toBe(true)
    expect(r.approvalState).toBe('')
    expect(stageWordFor(r)).toBe('Paused')
  })

  it('a role nobody is re-approving is not paused', () => {
    expect(asSupplierSees({ status: 'OPEN', approvalState: 'APPROVED' }).paused).toBe(false)
    expect(asSupplierSees({ status: 'OPEN', approvalState: 'AUTO_APPROVED' }).paused).toBe(false)
    // A draft waiting on its first approval was never published, so it
    // is not paused — it has not started.
    expect(isPaused({ status: 'DRAFT', approvalState: 'PENDING_APPROVAL' })).toBe(false)
  })

  it('the company that raised it reads the desk, not the supplier’s word', () => {
    expect(stageWordFor(asClientSees({ status: 'OPEN', approvalState: 'PENDING_APPROVAL' })))
      .toBe('Awaiting approval')
    expect(stageWordFor(asClientSees({ status: 'DRAFT', approvalState: 'CHANGES_REQUESTED' })))
      .toBe('Needs changes')
  })
})

/**
 * The two lists. A closed role must not read one word on the client's
 * list and a different one on the supplier's — which was the worry that
 * started this, and turns out not to be true of the rows themselves.
 */
describe('one word about one row, on both ends of the deal', () => {

  it('a role put away while it was still open reads "Closed" to a supplier, not "Published"', () => {
    // Archiving writes a date and deliberately never overwrites the
    // status, so this row still says OPEN. It read "Published" to every
    // supplier looking at it until the list route sent `archivedAt`.
    const r = asSupplierSees({ status: 'OPEN', archivedAt: new Date('2026-09-16T00:00:00Z') })
    expect(r.status).toBe('OPEN')
    expect(stageWordFor(r)).toBe('Closed')
  })

  it('a closed role reads "Closed" on the supplier’s list and "closed without being filled" on the client’s — one word about one row', () => {
    const r = asSupplierSees({ status: 'CLOSED' })
    expect(stageWordFor(r)).toBe('Closed')
    // The client's own chip is `closedBecause`, not the tab it sits
    // under. "Archived" is the name of a drawer; both rows say closed.
    expect(closedBecause(asClientSees({ status: 'CLOSED' }))).toBe('closed without being filled')
    expect(closedBecause(asClientSees({ status: 'CLOSED' }))).toContain('closed')
  })

  it('a filled role reads "Filled" on both lists, because filling one is the good ending', () => {
    const r = asSupplierSees({ status: 'FILLED', headcount: 1, archivedAt: new Date() })
    expect(stageWordFor(r)).toBe('Filled')
    expect(closedBecause(asClientSees({ status: 'FILLED', headcount: 1 }))).toBe('the seat filled')
  })

  it('a cancelled role carries its reason onto the supplier’s row', () => {
    const r = asSupplierSees({ status: 'CANCELLED', cancelReason: 'budget cut' })
    expect(stageWordFor(r)).toBe('Cancelled')
    expect(stageReason(r)).toBe('budget cut')
    // And nothing else does: a filled row's reason is already its chip,
    // and printing it twice on one row is the duplicate the founder has
    // reported three times.
    expect(stageReason(asSupplierSees({ status: 'FILLED' }))).toBeNull()
    expect(stageReason(asSupplierSees({ status: 'OPEN' }))).toBeNull()
  })

  it('a role the client has put away offers nobody a button it will refuse', () => {
    // Matching against a dead role and sending it to more suppliers were
    // both gated on the status column, which archiving never touches.
    expect(DETAIL).toContain("(requirement.status === 'OPEN' || requirement.status === 'DRAFT') && mayEdit(requirement)")
    expect(DETAIL).toContain("requirement.status === 'OPEN' && mayEdit(requirement)")
  })
})
