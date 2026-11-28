import { FULL_ALLOCATION_BPS } from '@/lib/cost-allocation'

/**
 * Correcting a contract's cost coding in place (Layer 9).
 *
 * The award writes the coding once. A line held for a missing or rejected
 * code is fixed by changing it here, and the change moves `updatedAt`,
 * which is what `fixedAt` in `receipt-file-read` reads. So a save that
 * changes nothing is refused: it would release a held line with nothing
 * fixed.
 *
 * Pure: no database. The route loads the rows and the payer's own ids.
 */

export interface AllocationRow {
  id: string
  costCenterId: string
  internalOrderId: string | null
  glAccount: string | null
  shareBps: number
}

export interface AllocationChange {
  allocationId: string
  costCenterId?: string
  /** null clears the order. */
  internalOrderId?: string | null
  /** An empty string or null clears the override. */
  glAccount?: string | null
  /** A percent of the contract, 0 to 100. */
  sharePct?: number
}

export type AllocationPlan =
  | { ok: true; changes: Partial<Pick<AllocationRow, 'costCenterId' | 'internalOrderId' | 'glAccount' | 'shareBps'>>; fields: string[] }
  | { ok: false; says: string }

const FIELD_WORDS: Record<string, string> = {
  costCenterId: 'cost center', internalOrderId: 'order', glAccount: 'GL account', shareBps: 'share',
}

export function planAllocationEdit(rows: readonly AllocationRow[], c: AllocationChange): AllocationPlan {
  const row = rows.find((r) => r.id === c.allocationId)
  if (!row) return { ok: false, says: 'That coding line is not on this contract.' }

  const next: AllocationRow = { ...row }
  if (c.costCenterId !== undefined) {
    if (typeof c.costCenterId !== 'string' || !c.costCenterId) return { ok: false, says: 'Choose a cost center.' }
    next.costCenterId = c.costCenterId
  }
  if (c.internalOrderId !== undefined) next.internalOrderId = c.internalOrderId || null
  if (c.glAccount !== undefined) {
    const gl = typeof c.glAccount === 'string' ? c.glAccount.trim() : ''
    if (gl.length > 40) return { ok: false, says: 'A GL account is at most 40 characters.' }
    next.glAccount = gl || null
  }
  if (c.sharePct !== undefined) {
    const p = c.sharePct
    if (typeof p !== 'number' || !Number.isFinite(p) || p <= 0 || p > 100) {
      return { ok: false, says: 'A share is a percent above 0 and up to 100.' }
    }
    next.shareBps = Math.round(p * 100)
  }

  const fields = (Object.keys(FIELD_WORDS) as (keyof typeof FIELD_WORDS)[]).filter(
    (k) => (next as any)[k] !== (row as any)[k],
  )
  if (fields.length === 0) return { ok: false, says: 'Nothing is different from what is saved, so nothing was changed.' }

  const after = rows.map((r) => (r.id === row.id ? next : r))
  if (after.filter((r) => r.costCenterId === next.costCenterId).length > 1) {
    return { ok: false, says: 'Another line of this contract already uses that cost center.' }
  }
  const total = after.reduce((s, r) => s + r.shareBps, 0)
  if (total !== FULL_ALLOCATION_BPS) {
    return {
      ok: false,
      says: `The shares on a contract add up to 100%. This change would make them ${(total / 100).toFixed(2)}%.`,
    }
  }

  const changes: Record<string, unknown> = {}
  for (const k of fields) changes[k] = (next as any)[k]
  return { ok: true, changes, fields: fields.map((k) => FIELD_WORDS[k]) }
}

export const HELD_LINES_GO_NEXT =
  'Saved. Lines held for this coding go in your next file.'
