/**
 * The line's commission panel: its fields and the body it posts, pure, so
 * a test can prove the panel offers every field the route refuses without
 * (CLAUDE.md, 2026-11-02: every question a route asks, its screen has a
 * field for). The route is POST /api/contracts/:id/commissions; its writer
 * is `setCommission` in lib/money/commission-write.
 */

import { IS_SHARE, type CommissionBasis } from '@/lib/money/commission-rows'

/** Each is a field the writer may refuse on, and a field the panel draws. */
export const PANEL_FIELDS = ['earnedById', 'kind', 'basis', 'rateBps', 'amountCents', 'capCents', 'fromDate', 'toDate', 'accrueOn', 'reason'] as const
export type PanelField = (typeof PANEL_FIELDS)[number]

export interface CommissionValues {
  id: string | null
  earnedById: string
  kind: string
  basis: string
  /** A percentage as typed: "10" is 10%. */
  percent: string
  /** An amount as typed, in whole currency: "2.50". */
  amount: string
  /** A cap as typed, in whole currency, or empty for none. */
  cap: string
  fromDate: string
  toDate: string
  accrueOn: string
  reason: string
}

/** The fields drawn for a basis: a share asks a percentage, a fixed figure an amount. */
export function fieldsDrawn(basis: string): PanelField[] {
  const share = IS_SHARE[basis as CommissionBasis] ?? true
  return PANEL_FIELDS.filter((f) => (f === 'rateBps' ? share : f === 'amountCents' ? !share : true))
}

const toMinor = (s: string): number | null => {
  const t = s.replace(/[,$\s]/g, '')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? Math.round(n * 100) : NaN
}

/** What the panel posts. A share goes as basis points, an amount as cents; the other is never sent. */
export function commissionBody(v: CommissionValues): Record<string, unknown> {
  const share = IS_SHARE[v.basis as CommissionBasis] ?? true
  const pct = v.percent.trim() ? Number(v.percent.replace('%', '').trim()) : null
  return {
    id: v.id,
    earnedById: v.earnedById || null,
    kind: v.kind || null,
    basis: v.basis || null,
    rateBps: share && pct != null ? (Number.isFinite(pct) ? Math.round(pct * 100) : NaN) : null,
    amountCents: share ? null : toMinor(v.amount),
    capCents: toMinor(v.cap),
    fromDate: v.fromDate || null,
    toDate: v.toDate || null,
    accrueOn: v.accrueOn || 'ACCEPTED',
    reason: v.reason.trim() || null,
  }
}
