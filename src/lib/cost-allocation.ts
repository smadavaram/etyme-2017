/**
 * Splitting a contract's cost across the client's cost centres.
 *
 * CLAUDE.md names invoice arithmetic as something to approach with care:
 * "A wrong rate calculation that looks plausible is worse than a delay."
 *
 * Two rules make this safe:
 *
 *   1. Shares are basis points (integers, 0–10000) and must total exactly
 *      10000. Percentages with decimals invite float drift; thirds become
 *      3333 / 3333 / 3334 and still total exactly.
 *
 *   2. Money is split by LARGEST REMAINDER, never by rounding each share
 *      independently. Rounding each share separately loses or gains cents,
 *      so the allocated lines stop summing to the invoice total — and an AP
 *      team that finds a one-cent gap rejects the whole file.
 */

/** Basis points in a whole. 10000 bp = 100%. */
export const FULL_ALLOCATION_BPS = 10_000

export interface AllocationShare {
  costCenterId: string
  shareBps: number
}

export interface AllocatedAmount extends AllocationShare {
  /** Amount in the smallest currency unit (cents). Sums to the input exactly. */
  amountCents: number
}

export interface AllocationValidation {
  valid: boolean
  totalBps: number
  errors: string[]
}

/**
 * Are these shares a legal allocation? Enforced before write, because a
 * contract whose shares total 99% silently under-bills a budget.
 */
export function validateAllocation(shares: AllocationShare[]): AllocationValidation {
  const errors: string[] = []

  if (shares.length === 0) {
    return { valid: false, totalBps: 0, errors: ['At least one cost centre is required'] }
  }

  for (const s of shares) {
    if (!Number.isInteger(s.shareBps)) {
      errors.push(`Share for ${s.costCenterId} must be a whole number of basis points`)
    }
    if (s.shareBps <= 0) {
      errors.push(`Share for ${s.costCenterId} must be greater than zero`)
    }
    if (s.shareBps > FULL_ALLOCATION_BPS) {
      errors.push(`Share for ${s.costCenterId} cannot exceed 100%`)
    }
  }

  const seen = new Set<string>()
  for (const s of shares) {
    if (seen.has(s.costCenterId)) {
      errors.push(`Cost centre ${s.costCenterId} appears more than once`)
    }
    seen.add(s.costCenterId)
  }

  const totalBps = shares.reduce((sum, s) => sum + s.shareBps, 0)
  if (totalBps !== FULL_ALLOCATION_BPS) {
    errors.push(
      `Shares total ${(totalBps / 100).toFixed(2)}%, must total exactly 100%`
    )
  }

  return { valid: errors.length === 0, totalBps, errors }
}

/**
 * Split an amount across shares so the parts sum back to the whole exactly.
 *
 * Largest remainder: floor every share, then hand the leftover cents out
 * one at a time to whoever was rounded down hardest. Ties break on the
 * larger share, then on cost centre id, so the same input always produces
 * the same output — an export re-run must not shuffle cents between
 * budgets.
 */
export function allocateAmount(
  amountCents: number,
  shares: AllocationShare[]
): AllocatedAmount[] {
  if (shares.length === 0) return []

  // A single share takes everything — no rounding to do.
  if (shares.length === 1) {
    return [{ ...shares[0], amountCents }]
  }

  const negative = amountCents < 0
  const magnitude = Math.abs(amountCents)

  const exact = shares.map((s) => ({
    share: s,
    exact: (magnitude * s.shareBps) / FULL_ALLOCATION_BPS,
  }))

  const floored = exact.map((e) => ({
    ...e,
    floor: Math.floor(e.exact),
    remainder: e.exact - Math.floor(e.exact),
  }))

  const distributed = floored.reduce((sum, f) => sum + f.floor, 0)
  let leftover = magnitude - distributed

  const order = [...floored].sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder
    if (b.share.shareBps !== a.share.shareBps) return b.share.shareBps - a.share.shareBps
    return a.share.costCenterId.localeCompare(b.share.costCenterId)
  })

  const bonus = new Map<string, number>()
  for (const row of order) {
    if (leftover <= 0) break
    bonus.set(row.share.costCenterId, 1)
    leftover--
  }

  return floored.map((f) => {
    const cents = f.floor + (bonus.get(f.share.costCenterId) ?? 0)
    return {
      costCenterId: f.share.costCenterId,
      shareBps: f.share.shareBps,
      amountCents: negative ? -cents : cents,
    }
  })
}

/**
 * The allocation to use when a contract has none: everything to one cost
 * centre. Keeps the export total correct rather than dropping the line.
 */
export function singleAllocation(costCenterId: string): AllocationShare[] {
  return [{ costCenterId, shareBps: FULL_ALLOCATION_BPS }]
}

/** Human-readable share, e.g. 3333 → "33.33%". */
export function formatShare(shareBps: number): string {
  const pct = shareBps / 100
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(2)}%`
}
