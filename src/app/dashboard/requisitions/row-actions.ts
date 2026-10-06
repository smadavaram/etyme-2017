/**
 * Which buttons a job request's row offers this reader.
 *
 * A button the route refuses is a button that lies. The row offered
 * Edit, Cancel and Archive on the row's status alone, and
 * `PATCH /api/requisitions/[id]` refuses all three to anybody without
 * `requirements.write`, and to anybody who is not the manager it is for,
 * whoever raised it, or the program office (`governance.write`). An
 * outside review of the live demo found an approver offered Edit and
 * refused on the press (2026-10-05). So the row asks the route's own two
 * questions before the status ones.
 *
 * The permissions are the desk's, read through the seat
 * (`deskOf` in components/shell/sidebar-props): a program
 * office seated at a client's desk acts with the client's role, never
 * its own firm's.
 *
 * Pure, so it can be tested without a page.
 */
import { hasPermission } from '@/lib/permissions'
import { mayEdit, type RequisitionRow } from '@/lib/requisition-stage'

export interface RowForActions extends RequisitionRow {
  status: string
  raisedBy: { id: string } | null
  owner?: { id: string } | null
}

export interface RowActions {
  edit: boolean
  cancel: boolean
  archive: boolean
}

/** Whether this reader may change this job request at all — the route's gate. */
export function mayChange(
  r: { raisedBy: { id: string } | null; owner?: { id: string } | null },
  reader: { permissions: readonly string[] | null | undefined; personId: string | null }
): boolean {
  const permissions = reader.permissions ?? []
  if (!hasPermission(permissions, 'requirements.write')) return false
  if (hasPermission(permissions, 'governance.write')) return true
  if (!reader.personId) return false
  return r.raisedBy?.id === reader.personId || r.owner?.id === reader.personId
}

/** Whether this reader may raise a job request — what POST /api/requisitions asks. */
export function mayRaise(permissions: readonly string[] | null | undefined): boolean {
  return hasPermission(permissions ?? [], 'requirements.write')
}

export function rowActions(
  r: RowForActions,
  reader: { permissions: readonly string[] | null | undefined; personId: string | null },
  /** A desk is deciding it right now. */
  pending: boolean
): RowActions {
  if (!mayChange(r, reader)) return { edit: false, cancel: false, archive: false }
  return {
    edit: mayEdit(r),
    // A closed one is already stopped, and the route refuses it.
    cancel: !pending && r.status !== 'CANCELLED' && r.status !== 'FILLED' && r.status !== 'CLOSED',
    // An open one is still taking submissions, and the route refuses to put it away.
    archive: !pending && r.status !== 'CANCELLED' && r.status !== 'OPEN',
  }
}
