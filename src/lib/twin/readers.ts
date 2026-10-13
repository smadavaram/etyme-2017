/**
 * Who may open the twin's ledger at all, as one list a route and a menu
 * both read. No database here, so the nav table and the sidebar test may
 * import it.
 *
 * Three desks, and what each reads once it is in (`feedWhere` in
 * lib/twin/ledger decides the rows, at the query):
 *
 *   governance.read   the program owner and the oversight desks — every
 *                     entry of their own company's twin
 *   settings.manage   whoever sets the twin up — the same
 *   invoices.read     the paying desk at the client, which reads the
 *                     program's entries without what the rules found;
 *                     and a supplier's billing desk, which reads only the
 *                     entries about its own invoice receipts
 *
 * A hiring manager or a viewer holds none of the three and is refused in
 * a sentence: the twin's ledger is about money and the time limit, and
 * neither desk acts on either.
 */
import { hasAnyPermission, type Permission } from '@/lib/permissions'

export const TWIN_FEED_READERS: readonly Permission[] = ['governance.read', 'settings.manage', 'invoices.read']

/** Desks that read every entry of their own company's twin, with what the rules found. */
export const OWNER_DESKS: readonly Permission[] = ['governance.read', 'settings.manage']

/**
 * Who may change what the twin may do, or the numbers it runs on: the
 * desk that holds the company's settings, and the program manager's desk
 * (governance.write), because the twin acts on the program manager's
 * authority (founder, 2026-10-13). Every change is still a new version
 * with its reason, in the twin's feed.
 */
export const TWIN_EDITORS: readonly Permission[] = ['settings.manage', 'governance.write']

/** Whether a seat may change the role contract or the rule set. */
export function mayEditTwin(permissions: readonly string[] | null | undefined): boolean {
  return Array.isArray(permissions) && hasAnyPermission(permissions, TWIN_EDITORS)
}
