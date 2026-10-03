/**
 * Whether a seat reads its firm's contract lines, or only the ones that
 * name its holder.
 *
 * Karthik Menon, a delivery engineer at Teleworld, opened Contracts and
 * read his employer's lines — every colleague's placement, client and
 * bill rate. A seat that does none of the work contracts are read for
 * (placing people, reading job requests, bills, consultants, governance
 * or payroll) is somebody the contracts are about, not somebody who
 * administers them: it reads the lines that name it and no other.
 *
 * Pure: no database.
 */

import { hasPermission } from '@/lib/permissions'

/** Any one of these is a desk that administers contracts. */
export const READS_THE_FIRMS_LINES = [
  'assignments.write', 'requirements.read', 'invoices.read',
  'consultants.read', 'governance.read', 'payroll.read',
] as const

export function ownLinesOnly(permissions: readonly string[]): boolean {
  return !READS_THE_FIRMS_LINES.some((p) => hasPermission(permissions as string[], p))
}
