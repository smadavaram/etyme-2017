/**
 * What Pause says, before the press and after it (walk fdc item 11,
 * 2026-11-14). A paused person cannot sign in to read a notice, so only an
 * email tells her. Where no email can leave this deployment (`mailLeaves`),
 * neither sentence says she was told: they say to tell her yourself.
 *
 * Pure, no server import: the route and the page both read it, and the
 * page learns whether email leaves from GET /api/access.
 */

import { NO_MAIL_HERE } from '@/lib/notify/mail-leaves'

/** The reply after Pause. */
export function pausedReply(name: string, mailLeaves: boolean): string {
  return mailLeaves
    ? `${name} is paused. They have been told why, and lifting it puts them back with the same role.`
    : `${name} is paused. ${NO_MAIL_HERE}, so tell them yourself. Lifting it puts them back with the same role.`
}

/** The help under the pause reason, before the press. */
export function pauseReasonHelp(mailLeaves: boolean): string {
  return mailLeaves
    ? 'They are told this, and somebody will ask later.'
    : `${NO_MAIL_HERE}, so tell them yourself. Somebody will ask later.`
}
