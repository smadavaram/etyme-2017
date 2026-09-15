/**
 * Our books against theirs, with every break named. A reconciliation
 * ending in a bare difference gets redone next month from zero.
 */

import { describe, it, expect } from 'vitest'
import { reconcile, type OurLine, type TheirLine } from '@/lib/reconciliation'

const ours = (rows: Partial<OurLine>[]): OurLine[] =>
  rows.map((r, i) => ({ id: `o${i}`, amountCents: 0, on: '2026-08-15', ...r }))
const theirs = (rows: Partial<TheirLine>[]): TheirLine[] =>
  rows.map((r) => ({ amountCents: 0, on: '2026-08-15', ...r }))

describe('Matching is by reference, then exact amount on the same day, never fuzzier', () => {

  it('a clean month reconciles to the cent and says so', () => {
    const r = reconcile(
      ours([{ amountCents: 380_000, ref: 'INV-1' }]),
      theirs([{ amountCents: 380_000, ref: 'INV-1' }])
    )
    expect(r.differenceCents).toBe(0)
    expect(r.breaks).toEqual([])
    expect(r.says).toContain('Reconciled to the cent')
  })

  it('a near-amount near-date pair is two honest breaks, never one hidden match', () => {
    const r = reconcile(
      ours([{ amountCents: 380_000, on: '2026-08-15' }]),
      theirs([{ amountCents: 379_500, on: '2026-08-16' }])
    )
    expect(r.breaks).toHaveLength(2)
    expect(r.breaks.map((b) => b.kind).sort()).toEqual(['OURS_ONLY', 'THEIRS_ONLY'])
  })

  it('the same reference at different amounts is one phone call, not two mysteries', () => {
    const r = reconcile(
      ours([{ amountCents: 380_000, ref: 'INV-9' }]),
      theirs([{ amountCents: 360_000, ref: 'INV-9' }])
    )
    expect(r.breaks).toHaveLength(1)
    expect(r.breaks[0].kind).toBe('AMOUNT_DIFFERS')
    expect(r.breaks[0].says).toContain('a phone call, not a journal entry')
  })

  it('what only we have reads as timing; what only they have reads as find-out-which', () => {
    const r = reconcile(
      ours([{ amountCents: 100_000, ref: 'A' }]),
      theirs([{ amountCents: 55_000, ref: 'B' }])
    )
    expect(r.breaks.find((b) => b.kind === 'OURS_ONLY')!.says).toContain('sent and not yet landed')
    expect(r.breaks.find((b) => b.kind === 'THEIRS_ONLY')!.says).toContain('find out which')
  })
})

describe('The difference is only ever the sum of the named breaks', () => {

  it('a fully explained difference may be signed off, and says by how many breaks', () => {
    const r = reconcile(
      ours([{ amountCents: 380_000, ref: 'INV-1' }, { amountCents: 50_000, ref: 'INV-2' }]),
      theirs([{ amountCents: 380_000, ref: 'INV-1' }])
    )
    expect(r.differenceCents).toBe(50_000)
    expect(r.explained).toBe(true)
    expect(r.says).toContain('fully explained by 1 named break')
  })

  it('matched money is counted, so the work already done is visible', () => {
    const r = reconcile(
      ours([{ amountCents: 380_000, ref: 'INV-1' }, { amountCents: 50_000 }]),
      theirs([{ amountCents: 380_000, ref: 'INV-1' }])
    )
    expect(r.matchedCents).toBe(380_000)
  })
})
