import { pickColumns } from '@/lib/money/receipt-file'
import type { CallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { payerSeats } from '@/lib/money/bank-check-read'
import { bankCheckers, BANK_CHECK_PERMISSION, type PayerSeat } from '@/lib/money/bank-check'

/**
 * Small readers for the client's own codes, for the invoice-lines file.
 *
 * Layer 9, slice 2. Each reads what the client set and says nothing it
 * has not been told: no code is guessed, no number is made up.
 *
 * Pure. No database.
 */

export type CostObjectKind = 'INTERNAL_ORDER' | 'PROJECT_CODE' | 'WBS_ELEMENT' | 'MATERIAL_CODE'
export type CostObjectType = 'COST_CENTER' | CostObjectKind

const KINDS: readonly string[] = ['INTERNAL_ORDER', 'PROJECT_CODE', 'WBS_ELEMENT', 'MATERIAL_CODE']

/**
 * The type the file prints for a cost object. A cost center is its own
 * type; any other code carries its kind. A kind nobody knows reads as an
 * internal order, which is what every row was before kinds existed.
 */
export function costObjectTypeOf(input: { internalOrder: { kind: string | null } | null }): CostObjectType {
  if (!input.internalOrder) return 'COST_CENTER'
  const k = input.internalOrder.kind
  return k && KINDS.includes(k) ? (k as CostObjectKind) : 'INTERNAL_ORDER'
}

/**
 * The company code and the profit center for one line. The profit center
 * is the cost center's own; where it has none the cell is empty, never
 * the company's.
 */
export function codingBlock(
  coding: { companyCode: string | null } | null,
  costCenter: { profitCenter: string | null } | null,
): { companyCode: string; profitCenter: string } {
  return { companyCode: coding?.companyCode?.trim() ?? '', profitCenter: costCenter?.profitCenter?.trim() ?? '' }
}

/**
 * The number the payer's own books give a supplier, from the payer's own
 * register row. Another firm's row is never read; a supplier with no
 * number reads null and its cell stays empty.
 */
export function vendorNumberFor(
  rows: readonly { companyId: string; otherCompanyId: string; relationship: string; vendorNumber: string | null }[],
  payerId: string,
  supplierId: string,
): string | null {
  for (const r of rows) {
    if (r.companyId !== payerId || r.otherCompanyId !== supplierId) continue
    const n = r.vendorNumber?.trim()
    if (n) return n
  }
  return null
}

/**
 * The PO line number. An order's lines are its contract lines (a person
 * and a rate each); the client's own numbering is not kept, so the stand-in
 * is the line's place in the order, counted 10, 20, 30 from the oldest.
 * Null where the line is not one of the order's.
 */
export function poLineNumber(
  orderLines: readonly { id: string; createdAt: Date }[],
  lineId: string | null,
): string | null {
  if (!lineId) return null
  const sorted = [...orderLines].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
  const i = sorted.findIndex((l) => l.id === lineId)
  return i < 0 ? null : String((i + 1) * 10)
}

/**
 * The columns the client saved, or every column where it saved none or
 * kept one that no longer exists (a sentence is never thrown at a file
 * that was asked for with nothing).
 */
export function savedColumns(saved: readonly string[] | null | undefined): string[] {
  const picked = pickColumns(saved ?? [])
  if (picked.ok) return picked.ids
  const all = pickColumns([])
  return all.ok ? all.ids : []
}

// ── Who maintains the client's own codes ─────────────────────────────────

/**
 * Maintaining a client's own accounting codes is a money act (records 87
 * and 89): Finance and the Owner hold it, and where the company has no
 * Finance seat the AP clerk does, because a role nobody has named falls
 * back and never refuses. An Admin is IT and people, so an Admin never
 * holds it by the fallback, only where the Owner grants `codes.manage`.
 * `bankCheckers` already says who that is for the bank check; this reuses
 * it and writes no second rule.
 */
export type MayMaintainCodes = { may: true } | { may: false; says: string }

const ADMIN = 'Admin'
const OWNER = 'Owner'

/** Pure: the verdict, given the seat's permissions and the paying firm's live seats. */
export function judgeMayMaintainCodes(
  who: { personId: string | null; permissions: readonly string[] },
  seats: readonly PayerSeat[],
): MayMaintainCodes {
  if (hasPermission(who.permissions, 'codes.manage')) return { may: true }
  const mine = who.personId ? seats.find((s) => s.personId === who.personId) : undefined
  // The Owner always may, whatever the role row was written before the permission existed.
  if (mine?.roleName === OWNER) return { may: true }
  const nonAdmin = seats.filter((s) => s.roleName !== ADMIN)
  const checkers = bankCheckers(nonAdmin)
  if (who.personId && checkers.people.some((p) => p.personId === who.personId)) return { may: true }

  const who2: string[] = []
  if (checkers.by === 'FINANCE') who2.push('Finance team')
  else if (nonAdmin.some((s) => s.roleName !== OWNER && s.permissions.includes(BANK_CHECK_PERMISSION) && !s.permissions.includes('*'))) who2.push('AP clerk')
  if (seats.some((s) => s.roleName === OWNER)) who2.push('Owner')
  const says = who2.length === 0
    ? 'Nobody at your company sets these yet. Give a seat the Finance or AP Clerk role first.'
    : who2.length === 1
      ? `Your ${who2[0]} sets these.`
      : `Your ${who2[0]} or the ${who2[1]} sets these.`
  return { may: false, says }
}

/**
 * Whether this caller may set the paying company's codes. `payerId` is the
 * company that pays; it defaults to the caller's own.
 */
export async function mayMaintainCodes(caller: CallerContext, payerId: string | null = caller.company?.id ?? null): Promise<MayMaintainCodes> {
  if (!payerId) return { may: false, says: 'These codes belong to the company that pays.' }
  const seats = await payerSeats(payerId)
  return judgeMayMaintainCodes({ personId: caller.isService ? null : caller.person.id, permissions: caller.permissions }, seats)
}
