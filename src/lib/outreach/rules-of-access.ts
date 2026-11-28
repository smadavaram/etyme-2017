import { hasPermission } from '@/lib/permissions'

/**
 * Who may write outreach (record 117): a firm that sells, by a seat that
 * reads its suppliers and customers. A client only buys, so it sends none,
 * whatever its seat holds (walk V, 2026-11-25). Pure.
 */
export function outreachNotYours(caller: { permissions: unknown; company: { kind?: string | null } | null }): string | null {
  if (caller.company?.kind === 'CLIENT') return 'A client buys and does not sell, so it sends no outreach.'
  if (!hasPermission(caller.permissions as any, 'vendors.read')) return 'Outreach is written by the people who see the firm’s suppliers and customers. Your seat does not.'
  return null
}
