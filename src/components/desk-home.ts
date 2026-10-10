/**
 * Where a seat opens after signing in: its own desk's page.
 *
 * A colleague with a role lands on the page that role exists for — the
 * recruiter on job requests, the AP clerk on invoice receipts — rather
 * than on a dashboard with nothing on it for them. The page must be on
 * the seat's own menu, which names the permission each route asks for,
 * so a desk is never sent to a page that refuses it. Where the role has
 * no page of its own (Owner, Admin, a role the company wrote itself) the
 * console is the desk (lib/console-home).
 */

import { getNavForKind } from '@/lib/nav-table'
import { consoleHome, type CompanyKind } from '@/lib/console-home'
import { deskPageFor } from '@/lib/setup-steps'

export function deskHome(seat: {
  kind: CompanyKind | null
  isConsultant: boolean
  role: string | null
  permissions: readonly string[]
}): string {
  const home = consoleHome({ kind: seat.kind, isConsultant: seat.isConsultant, permissions: seat.permissions }).href
  if (seat.isConsultant || !seat.kind) return home
  const menu = getNavForKind(seat.kind, false, { permissions: seat.permissions })
    .flatMap((s) => s.items)
    .map((i) => i.href)
  return deskPageFor(seat.role, menu, home)
}
