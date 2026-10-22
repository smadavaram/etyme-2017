import { hasPermission, type Permission } from '@/lib/permissions'

/**
 * What an order asks for on paper, as the order and contracts pages show it.
 *
 * Found by the screen walk of 2026-10-22: the set an order requires —
 * the DocumentRequirement rows on its WorkOrder, read through
 * `lib/document-requirements` — had its own page and no way to it. A
 * client could not see what its own purchase order demanded of a
 * supplier. The order and contracts pages now show the set read-only,
 * and offer the change only to a desk that may make it.
 *
 * The set is regulatory's. This file decides nothing about it: it says
 * who is offered the door to change it, and in which words a row reads.
 * Browser-safe: it imports only the permission check.
 */

/**
 * The desks that may change what an order asks for — the same two the
 * document-set route lets through (`MAY_CHANGE` in
 * app/api/documents/requirements/route.ts). A test reads that route and
 * fails if the two lists part, so a link offered here is never one the
 * route refuses.
 */
export const CHANGES_A_PAPER_SET = ['governance.write', 'privacy.manage'] as const satisfies readonly Permission[]

/**
 * Whether this reader is offered the change.
 *
 * The buyer's own desk, holding either permission; or a program office
 * in a seat the buyer granted, where the role it was given holds one.
 * A supplier never is, whatever it holds at home: a firm supplying
 * against an order does not change what that order asks of it.
 */
export function mayChangePaperSet(input: {
  viewerCompanyId: string | null
  buyerCompanyId: string
  permissions: readonly string[]
  seat?: { clientId: string; permissions: readonly string[] } | null
}): boolean {
  const holds = (perms: readonly string[]) => CHANGES_A_PAPER_SET.some((p) => hasPermission(perms, p))
  if (input.viewerCompanyId && input.viewerCompanyId === input.buyerCompanyId) return holds(input.permissions)
  if (input.seat && input.seat.clientId === input.buyerCompanyId) return holds(input.seat.permissions)
  return false
}

export type PaperSetTarget =
  | { workOrderId: string }
  | { sellContractId: string }
  | { buyContractId: string }

/** The query that names one set: an order's own, or one line's. */
export function paperSetQuery(target: PaperSetTarget): string {
  const [k, v] = Object.entries(target)[0] as [string, string]
  return `${k}=${encodeURIComponent(v)}`
}

/** The document-set page, where the set is changed. */
export function paperSetHref(target: PaperSetTarget): string {
  return `/dashboard/documents/requirements?${paperSetQuery(target)}`
}

/** One row's standing in a word, the same words the document-set page uses. */
export function paperStanding(item: {
  waived: boolean
  waiverRefused: boolean
  blocks: boolean
  required: boolean
}): 'Waiver refused' | 'Waived' | 'Stops work' | 'Required' | 'Optional' {
  if (item.waiverRefused) return 'Waiver refused'
  if (item.waived) return 'Waived'
  if (item.blocks) return 'Stops work'
  if (item.required) return 'Required'
  return 'Optional'
}

/**
 * The line over the list.
 *
 * An order's own set is only the rows its buyer wrote; every line under
 * it still carries the floor for its own kind of work (a W2, a
 * corp-to-corp worker, a sub-vendor). So an order that wrote nothing is
 * never said to require nothing.
 */
export function paperSetSays(input: { count: number; onOrder: boolean }): string {
  const n = input.count
  const docs = `${n} document${n === 1 ? '' : 's'}`
  if (input.onOrder) {
    return n === 0
      ? 'This order asks for nothing of its own. Every line on it still carries the floor for its kind of work.'
      : `This order asks for ${docs} of its own.`
  }
  return n === 0 ? 'This line asks for no documents.' : `This line asks for ${docs}.`
}
