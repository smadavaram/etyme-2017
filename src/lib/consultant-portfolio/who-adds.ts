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

import { askTheDesk, desksHolding, hasPermission, type Permission } from '@/lib/permissions'

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

/**
 * The sentence a seat reads on Bench where it may not ask somebody onto
 * the bench, send an invitation again or copy its link. Those doors ask
 * for the same one permission as Add consultant (`POST /api/bench/listings`
 * and its nudge door), so Resend, Copy link, Ask to renew and Add to
 * bench are drawn only where `mayAddConsultant` holds, and this names who
 * may elsewhere (fix list, layer five, b).
 *
 * The firm's name sits in a short sentence of its own, so a long name
 * never carries a sentence past twenty-five words (the reader of
 * a626b0b18, item 3): "Asking somebody onto the bench or sending their
 * invitation again is done by Recruiter, Resource Manager or HR, among
 * other roles. Ask one of them at Northwind Staffing. Whoever manages
 * roles can also add it to your role."
 */
export function whoAsksOntoBenchSays(o: { kind: string | null | undefined; companyName: string | null | undefined }): string {
  const roles = desksHolding(ADDS_CONSULTANTS, o.kind)
  const where = o.companyName?.trim() ? o.companyName.trim().replace(/\.$/, '') : 'your company'
  if (roles.length === 0) {
    return `No role at ${where} asks somebody onto the bench yet. Ask whoever manages roles there.`
  }
  const shown = roles.slice(0, NAMED_AT_MOST)
  const named = shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(', ')} or ${shown[shown.length - 1]}`
  const among = roles.length > NAMED_AT_MOST ? ', among other roles' : ''
  const ask = shown.length === 1 ? 'Ask them' : 'Ask one of them'
  return (
    `Asking somebody onto the bench or sending their invitation again is done by ${named}${among}. ` +
    `${ask} at ${where}. Whoever manages roles can also add it to your role.`
  )
}

/** How many roles the sentence names before "among other roles", as `askTheDesk` names them. */
const NAMED_AT_MOST = 3
