import { pickColumns } from '@/lib/money/receipt-file'

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
