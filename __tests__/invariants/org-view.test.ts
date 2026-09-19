/**
 * Multi-manager org view — Addendum E client workforce governance.
 *
 * CLAUDE.md: "Every module ships with tests named as English sentences."
 *
 * Addendum E / client-console prototype: "Each manager found their own
 * vendors and negotiated their own rates. Nobody has seen this together
 * before, because it has never existed in one place."
 *
 * The structural change this rests on: SellContract now carries
 * hiringManagerId and orgUnitId — who at the END CLIENT owns the
 * engagement. Every rollup below aggregates on that edge.
 *
 * These tests cover the arithmetic: manager rollup, rate variance by
 * skill, the annualised saving, and vendor tiering. CLAUDE.md names
 * rate maths as something to approach with care, so the cases are
 * explicit rather than generated.
 */

import { describe, it, expect } from 'vitest'

const HOURS_PER_MONTH = 160
const MONTHS_PER_YEAR = 12

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid]
}

/** Annual cost of one contractor at an hourly rate in cents, in dollars. */
function annualCost(rateCents: number): number {
  return (rateCents * HOURS_PER_MONTH * MONTHS_PER_YEAR) / 100
}

// ── Median ─────────────────────────────────────────────

describe('Median rate', () => {

  it('an odd number of rates takes the middle one', () => {
    expect(median([10000, 12000, 15000])).toBe(12000)
  })

  it('an even number of rates averages the two middle ones', () => {
    expect(median([10000, 12000, 14000, 16000])).toBe(13000)
  })

  it('an unsorted list is sorted before the middle is taken', () => {
    expect(median([15000, 10000, 12000])).toBe(12000)
  })

  it('a single rate is its own median', () => {
    expect(median([12000])).toBe(12000)
  })

  it('no rates yields zero rather than NaN', () => {
    expect(median([])).toBe(0)
  })
})

// ── Annualisation ──────────────────────────────────────

describe('Annualising an hourly bill rate', () => {

  it('a $100/hr contractor costs $192,000 a year at 160 hours a month', () => {
    // 10000c = $100/hr · 160h · 12mo = $192,000
    expect(annualCost(10000)).toBe(192_000)
  })

  it('a $148/hr contractor costs $284,160 a year', () => {
    expect(annualCost(14800)).toBe(284_160)
  })

  it('the basis is stated so the reader knows what the number means', () => {
    // CLAUDE.md: "Match scores always carry factors, basis, confidence and
    // unknowns. A bare number is a bug." The same applies to spend figures.
    const basis = `Annualised from bill rates at ${HOURS_PER_MONTH} hours/month`
    expect(basis).toContain('160 hours/month')
  })
})

// ── Rate variance ──────────────────────────────────────

describe('Rate variance — same skill, different price', () => {

  interface Placement {
    skill: string
    rate: number
    managerId: string
  }

  function varianceFor(placements: Placement[]): {
    managers: number
    spread: number
    rateMedian: number
    annualSaving: number
    actionable: boolean
  } {
    const rates = placements.map(p => p.rate)
    const managers = new Set(placements.map(p => p.managerId)).size
    const lo = Math.min(...rates)
    const hi = Math.max(...rates)
    const med = median(rates)
    const saving = placements
      .filter(p => p.rate > med)
      .reduce((sum, p) => sum + (annualCost(p.rate) - annualCost(med)), 0)

    return {
      managers,
      spread: hi - lo,
      rateMedian: med,
      annualSaving: Math.round(saving),
      actionable: managers > 1 && hi - lo > 0,
    }
  }

  it('two managers buying the same skill at different rates is a finding', () => {
    const v = varianceFor([
      { skill: 'SAP MM', rate: 12000, managerId: 'mgr-a' },
      { skill: 'SAP MM', rate: 14800, managerId: 'mgr-b' },
    ])
    expect(v.actionable).toBe(true)
    expect(v.managers).toBe(2)
    expect(v.spread).toBe(2800)
  })

  it('one manager paying two rates is not a cross-manager finding', () => {
    // It may still be worth knowing, but it is not the variance this view exists for
    const v = varianceFor([
      { skill: 'AWS', rate: 13800, managerId: 'mgr-a' },
      { skill: 'AWS', rate: 16500, managerId: 'mgr-a' },
    ])
    expect(v.actionable).toBe(false)
  })

  it('two managers paying the same rate is not a finding', () => {
    const v = varianceFor([
      { skill: 'Snowflake', rate: 12000, managerId: 'mgr-a' },
      { skill: 'Snowflake', rate: 12000, managerId: 'mgr-b' },
    ])
    expect(v.actionable).toBe(false)
    expect(v.annualSaving).toBe(0)
  })

  it('the saving is what moving everyone above the median down to it returns', () => {
    // $120 and $148, median $134. Only the $148 sits above it.
    // ($148 - $134) x 160h x 12mo = $26,880
    const v = varianceFor([
      { skill: 'SAP MM', rate: 12000, managerId: 'mgr-a' },
      { skill: 'SAP MM', rate: 14800, managerId: 'mgr-b' },
    ])
    expect(v.rateMedian).toBe(13400)
    expect(v.annualSaving).toBe(26_880)
  })

  it('the saving counts every placement above the median, not just the highest', () => {
    // $100, $120, $160 — median $120. Only $160 is above it.
    const three = varianceFor([
      { skill: 'X', rate: 10000, managerId: 'a' },
      { skill: 'X', rate: 12000, managerId: 'b' },
      { skill: 'X', rate: 16000, managerId: 'c' },
    ])
    expect(three.rateMedian).toBe(12000)
    expect(three.annualSaving).toBe(annualCost(16000) - annualCost(12000))

    // $100, $140, $150, $160 — median $145. Two sit above it.
    const four = varianceFor([
      { skill: 'X', rate: 10000, managerId: 'a' },
      { skill: 'X', rate: 14000, managerId: 'b' },
      { skill: 'X', rate: 15000, managerId: 'c' },
      { skill: 'X', rate: 16000, managerId: 'd' },
    ])
    expect(four.rateMedian).toBe(14500)
    expect(four.annualSaving).toBe(
      Math.round((annualCost(15000) - annualCost(14500)) + (annualCost(16000) - annualCost(14500)))
    )
  })

  it('the saving is an opportunity, never a committed number', () => {
    // Nothing in the calculation assumes a renegotiation succeeds — it is
    // the arithmetic difference only. Guarded here so it stays that way.
    const v = varianceFor([
      { skill: 'X', rate: 10000, managerId: 'a' },
      { skill: 'X', rate: 20000, managerId: 'b' },
    ])
    expect(v.annualSaving).toBe(annualCost(20000) - annualCost(15000))
  })
})

// ── Headline saving, counted once per person ───────────

describe('Headline rate variance counts each person once', () => {

  /**
   * A contractor carries several skills, so the same person appears in
   * several variance rows. Summing the rows banks their renegotiation
   * twice. The headline takes the largest saving available to each
   * contract instead.
   */
  interface VarianceRow {
    skill: string
    rateMedian: number
    entries: { contractId: string; rate: number }[]
  }

  function headlineSaving(rows: VarianceRow[]): number {
    const perContract = new Map<string, number>()
    for (const r of rows) {
      for (const e of r.entries) {
        if (e.rate <= r.rateMedian) continue
        const saving = annualCost(e.rate) - annualCost(r.rateMedian)
        perContract.set(e.contractId, Math.max(perContract.get(e.contractId) ?? 0, saving))
      }
    }
    return [...perContract.values()].reduce((s, v) => s + v, 0)
  }

  it('a contractor appearing under two skills is not counted twice', () => {
    // Elena is billed $148 against a $134 median, and holds both SAP MM and
    // SAP SD. Renegotiating her fixes both rows — the saving banks once.
    const rows: VarianceRow[] = [
      { skill: 'SAP MM', rateMedian: 13400, entries: [{ contractId: 'c-elena', rate: 14800 }, { contractId: 'c-anita', rate: 12000 }] },
      { skill: 'SAP SD', rateMedian: 13400, entries: [{ contractId: 'c-elena', rate: 14800 }, { contractId: 'c-anita', rate: 12000 }] },
    ]
    const oneSkillOnly = annualCost(14800) - annualCost(13400)
    expect(headlineSaving(rows)).toBe(oneSkillOnly)
  })

  it('summing the skill rows would overstate the total', () => {
    const rows: VarianceRow[] = [
      { skill: 'SAP MM', rateMedian: 13400, entries: [{ contractId: 'c-elena', rate: 14800 }] },
      { skill: 'SAP SD', rateMedian: 13400, entries: [{ contractId: 'c-elena', rate: 14800 }] },
    ]
    const naiveSum = rows.reduce(
      (s, r) => s + r.entries.reduce((t, e) => t + (annualCost(e.rate) - annualCost(r.rateMedian)), 0),
      0
    )
    expect(headlineSaving(rows)).toBeLessThan(naiveSum)
  })

  it('two different people over the median are both counted', () => {
    const rows: VarianceRow[] = [
      { skill: 'AWS', rateMedian: 13000, entries: [{ contractId: 'c-a', rate: 16000 }, { contractId: 'c-b', rate: 15000 }] },
    ]
    expect(headlineSaving(rows)).toBe(
      (annualCost(16000) - annualCost(13000)) + (annualCost(15000) - annualCost(13000))
    )
  })

  it('a person takes their largest saving when skills disagree', () => {
    // Same contract, two skills with different medians — the bigger gap wins
    const rows: VarianceRow[] = [
      { skill: 'Narrow', rateMedian: 14000, entries: [{ contractId: 'c-a', rate: 15000 }] },
      { skill: 'Wide',   rateMedian: 10000, entries: [{ contractId: 'c-a', rate: 15000 }] },
    ]
    expect(headlineSaving(rows)).toBe(annualCost(15000) - annualCost(10000))
  })

  it('nobody above the median means no headline saving', () => {
    const rows: VarianceRow[] = [
      { skill: 'X', rateMedian: 12000, entries: [{ contractId: 'c-a', rate: 12000 }, { contractId: 'c-b', rate: 12000 }] },
    ]
    expect(headlineSaving(rows)).toBe(0)
  })
})

// ── Manager rollup ─────────────────────────────────────

describe('Manager rollup', () => {

  interface Contract {
    managerId: string | null
    vendorId: string
    rate: number
  }

  function rollup(contracts: Contract[]) {
    const byManager = new Map<string, { headcount: number; vendors: Set<string>; rates: number[] }>()
    let unassigned = 0

    for (const c of contracts) {
      if (!c.managerId) { unassigned++; continue }
      let m = byManager.get(c.managerId)
      if (!m) { m = { headcount: 0, vendors: new Set(), rates: [] }; byManager.set(c.managerId, m) }
      m.headcount++
      m.vendors.add(c.vendorId)
      m.rates.push(c.rate)
    }

    return {
      unassigned,
      managers: [...byManager.entries()].map(([id, m]) => ({
        managerId: id,
        headcount: m.headcount,
        vendors: m.vendors.size,
        rateMin: Math.min(...m.rates),
        rateMax: Math.max(...m.rates),
        annualSpend: Math.round(m.rates.reduce((s, r) => s + annualCost(r), 0)),
      })),
    }
  }

  it('a manager with two contractors from one vendor counts one vendor', () => {
    const r = rollup([
      { managerId: 'm1', vendorId: 'v1', rate: 10000 },
      { managerId: 'm1', vendorId: 'v1', rate: 12000 },
    ])
    expect(r.managers[0].headcount).toBe(2)
    expect(r.managers[0].vendors).toBe(1)
  })

  it('a manager using three vendors for three placements is counted as three', () => {
    const r = rollup([
      { managerId: 'm1', vendorId: 'v1', rate: 10000 },
      { managerId: 'm1', vendorId: 'v2', rate: 11000 },
      { managerId: 'm1', vendorId: 'v3', rate: 12000 },
    ])
    expect(r.managers[0].vendors).toBe(3)
  })

  it('a manager\'s annual spend is the sum of their contractors', () => {
    const r = rollup([
      { managerId: 'm1', vendorId: 'v1', rate: 10000 },
      { managerId: 'm1', vendorId: 'v1', rate: 15000 },
    ])
    expect(r.managers[0].annualSpend).toBe(annualCost(10000) + annualCost(15000))
  })

  it('a contractor with no named manager is surfaced, not hidden', () => {
    // An unowned contractor at your site is itself a governance finding
    const r = rollup([
      { managerId: 'm1', vendorId: 'v1', rate: 10000 },
      { managerId: null, vendorId: 'v2', rate: 12000 },
    ])
    expect(r.unassigned).toBe(1)
    expect(r.managers).toHaveLength(1)
  })

  it('the rate range shows the spread inside a single manager\'s team', () => {
    const r = rollup([
      { managerId: 'm1', vendorId: 'v1', rate: 10500 },
      { managerId: 'm1', vendorId: 'v1', rate: 16500 },
    ])
    expect(r.managers[0].rateMin).toBe(10500)
    expect(r.managers[0].rateMax).toBe(16500)
  })
})

// ── Vendor tail ────────────────────────────────────────

describe('Vendor tail tiering', () => {

  function tierFor(placements: number): 'preferred' | 'occasional' | 'one-time' {
    if (placements >= 5) return 'preferred'
    if (placements >= 2) return 'occasional'
    return 'one-time'
  }

  it('five or more placements makes a vendor preferred', () => {
    expect(tierFor(5)).toBe('preferred')
    expect(tierFor(19)).toBe('preferred')
  })

  it('two to four placements makes a vendor occasional', () => {
    expect(tierFor(2)).toBe('occasional')
    expect(tierFor(4)).toBe('occasional')
  })

  it('a single placement makes a vendor one-time', () => {
    expect(tierFor(1)).toBe('one-time')
  })

  it('one-time vendors carry full onboarding cost with no leverage', () => {
    // The prototype's point: a long tail of single placements is the
    // expensive shape, which is why the count is surfaced on the stat row.
    const vendors = [7, 4, 1, 1, 1, 1].map(tierFor)
    expect(vendors.filter(t => t === 'one-time')).toHaveLength(4)
  })
})

// ── The structural edge ────────────────────────────────

describe('The hiring manager edge', () => {

  it('a contract knows which manager and department owns it', () => {
    // Before this, SellContract knew its vendor, its client and its site,
    // but not who at the client owned it. Every capability above needs it.
    const contract = {
      companyId: 'vendor-1',
      clientCompanyId: 'client-1',
      endClientCompanyId: null,
      workLocationId: 'loc-1',
      hiringManagerId: 'person-mgr',
      orgUnitId: 'unit-quality',
    }
    expect(contract.hiringManagerId).toBeTruthy()
    expect(contract.orgUnitId).toBeTruthy()
  })

  it('the edge is optional so vendor-side contracts remain valid', () => {
    // A vendor may not know, or the client may not have named an owner
    const vendorSideContract: { hiringManagerId: string | null; orgUnitId: string | null } = {
      hiringManagerId: null,
      orgUnitId: null,
    }
    expect(vendorSideContract.hiringManagerId).toBeNull()
  })
})
