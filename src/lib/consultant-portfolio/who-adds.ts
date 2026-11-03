/**
 * Who may add a consultant, read off the route's own gate (the second
 * screen walk, 2026-11-03: Add consultant was drawn for a delivery
 * manager whose route refuses it).
 *
 * `POST /api/consultants` asks for `consultants.write` and nothing else,
 * so the button, the `?new=1` link and the refusal all read this one
 * permission from here. A button is drawn only where its route will take
 * it, and a seat that cannot add is told who can, by role, in the
 * company's own words (`askTheDesk`, read off the shipped role set).
 *
 * Pure: no database, safe in the browser.
 */

import { askTheDesk, hasPermission, type Permission } from '@/lib/permissions'

/** The one permission `POST /api/consultants` asks for. */
export const ADDS_CONSULTANTS: Permission = 'consultants.write'

/** Whether this seat's Add consultant would be taken by the route. */
export function mayAddConsultant(permissions: readonly string[]): boolean {
  return hasPermission(permissions, ADDS_CONSULTANTS)
}

/**
 * The sentence a seat that cannot add reads, naming the roles that can.
 * "Adding a consultant is done by Recruiter, Resource Manager or HR at
 * Teleworld, among other roles there. Ask one of them, or ask whoever
 * manages roles there to add it to your role."
 */
export function whoAddsSays(o: { kind: string | null | undefined; companyName: string | null | undefined }): string {
  return askTheDesk({ doing: 'Adding a consultant', needs: ADDS_CONSULTANTS, kind: o.kind, companyName: o.companyName })
}
