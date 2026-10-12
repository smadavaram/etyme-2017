import { describe, it, expect, afterEach, vi } from 'vitest'
import { prisma } from '@/lib/db'
import {
  tenureWarningsFor,
  tenureWarnings,
  tenureActionTier,
  TENURE_TWIN_ACTIONS,
  DEFAULT_TENURE_RULES,
  type TenureLine,
} from '@/lib/twin/rules/tenure'
import { TENURE_DEMO, DAYS_TO_LIMIT, NORTHBEND_LIMIT_MONTHS } from '@/lib/twin/seed-tenure-demo'
import { PROGRAMMES } from '@/lib/seed-programmes'
import { anchorSeed, forgetSeedAnchor, day } from '@/lib/seed-days'
import { daysFor } from '@/lib/tenure-days'

const D = 86_400_000
const NOW = new Date('2026-10-12T00:00:00Z')
const ago = (n: number) => new Date(NOW.getTime() - n * D)
const ahead = (n: number) => new Date(NOW.getTime() + n * D)

/** One person, one live line with no end, `k` days from a `cap`-month limit today. */
function kDaysOut(k: number, cap: number, id = `p${k}`): TenureLine {
  return {
    personId: id, personName: `Person ${k}`, supplierName: 'Pinnacle Resourcing',
    startDate: ago(daysFor(cap) - 1 - k), endDate: null, live: true,
  }
}

afterEach(() => forgetSeedAnchor())

describe('the job twin’s time-limit rule', () => {
  it('a person 60 days from the time limit is a 60-day warning that cites the days, the suppliers and the date', () => {
    const lines: TenureLine[] = [
      { personId: 't', personName: 'Tobias Lindqvist', supplierName: 'Brightmoor Staffing',
        startDate: ago(487), endDate: ago(201), live: false },
      { personId: 't', personName: 'Tobias Lindqvist', supplierName: 'Pinnacle Resourcing',
        startDate: ago(200), endDate: ahead(165), live: true },
    ]
    const [w, ...rest] = tenureWarningsFor(lines, { capMonths: 18, breakDays: 90, warnAtDays: [90, 60, 30] }, NOW)
    expect(rest).toHaveLength(0)
    expect(w.tier).toBe('WARN_60')
    expect(w.daysToLimit).toBe(60)
    expect(w.daysOnSite).toBe(487)
    expect(w.suppliers).toEqual(['Brightmoor Staffing', 'Pinnacle Resourcing'])
    expect(w.limitOn.toISOString().slice(0, 10)).toBe('2026-12-11')
    expect(w.ruleCited).toBe('On site 487 days across two suppliers; the 18-month time limit falls on 2026-12-11, in 60 days.')
    expect(w.rationale).toContain('Brightmoor Staffing, Pinnacle Resourcing')
    expect(w.rationale).toContain('every supplier')
    expect(`${w.ruleCited} ${w.rationale}`).not.toMatch(/\bcap\b/i)
  })

  it('warnings fire at 90, 60 and 30 days and breach at the limit, from the company’s own numbers', () => {
    const tierAt = (k: number, cap = 18, warnAtDays: readonly number[] = DEFAULT_TENURE_RULES.warnAtDays) =>
      tenureWarningsFor([kDaysOut(k, cap)], { capMonths: cap, breakDays: 90, warnAtDays }, NOW)[0]?.tier ?? null

    expect(DEFAULT_TENURE_RULES.warnAtDays).toEqual([90, 60, 30])
    expect(tierAt(91)).toBeNull()
    expect(tierAt(90)).toBe('WARN_90')
    expect(tierAt(61)).toBe('WARN_90')
    expect(tierAt(60)).toBe('WARN_60')
    expect(tierAt(31)).toBe('WARN_60')
    expect(tierAt(30)).toBe('WARN_30')
    expect(tierAt(1)).toBe('WARN_30')
    expect(tierAt(0)).toBe('BREACH')
    expect(tierAt(-40)).toBe('BREACH')

    // A company with a 12-month limit warning at 120 and 45 days.
    expect(tierAt(121, 12, [120, 45])).toBeNull()
    expect(tierAt(100, 12, [120, 45])).toBe('WARN_120')
    expect(tierAt(45, 12, [120, 45])).toBe('WARN_45')
    expect(tierAt(0, 12, [120, 45])).toBe('BREACH')

    // A company that set no time limit is warned about nothing.
    expect(tenureWarningsFor([kDaysOut(0, 18)], { capMonths: null, breakDays: 90, warnAtDays: [90, 60, 30] }, NOW)).toEqual([])

    // A breach says the limit fell, and that a person decides — never that the twin ends anything.
    const b = tenureWarningsFor([kDaysOut(-40, 18)], { capMonths: 18, breakDays: 90, warnAtDays: [90, 60, 30] }, NOW)[0]
    expect(b.ruleCited).toMatch(/time limit fell on \d{4}-\d{2}-\d{2}, 40 days ago\.$/)
    expect(b.rationale).toContain('A person decides')

    // Somebody whose contract ends before the limit is not warned about paper nobody signed.
    const endsFirst = { ...kDaysOut(60, 18, 'early'), endDate: ahead(20) }
    expect(tenureWarningsFor([endsFirst], { capMonths: 18, breakDays: 90, warnAtDays: [90, 60, 30] }, NOW)).toEqual([])

    // A served break resets the count: away 120 days against a 90-day break, then back.
    const back: TenureLine[] = [
      { ...kDaysOut(10, 18, 'back'), startDate: ago(900), endDate: ago(300), live: false },
      { ...kDaysOut(10, 18, 'back'), startDate: ago(180), endDate: null, live: true },
    ]
    expect(tenureWarningsFor(back, { capMonths: 18, breakDays: 90, warnAtDays: [90, 60, 30] }, NOW)).toEqual([])
  })

  it('the twin may record a warning and tell the program owner alone, must ask before telling a supplier, and never ends or extends a placement', () => {
    expect(tenureActionTier('tenure.warning.record')).toBe('ACTS_ALONE')
    expect(tenureActionTier('tenure.warning.notify_program_owner')).toBe('ACTS_ALONE')
    expect(tenureActionTier('tenure.warning.notify_supplier')).toBe('NEEDS_APPROVAL')
    expect(tenureActionTier('placement.end')).toBe('NEVER')
    expect(tenureActionTier('placement.extend')).toBe('NEVER')
    expect(tenureActionTier('alumni.ask_back')).toBe('NEVER')
    // Anything this rule does not name is closed.
    expect(tenureActionTier('placement.shorten')).toBe('NEVER')
    for (const a of TENURE_TWIN_ACTIONS) expect(a.why.length).toBeGreaterThan(20)
  })

  it('the Northbend demo holds exactly one person 60 days from the limit', () => {
    const nb = PROGRAMMES.find((p) => p.client === 'nike')!
    expect(NORTHBEND_LIMIT_MONTHS).toBe(nb.governance.tenureCapMonths)
    const names: Record<string, string> = { brightmoor: 'Brightmoor Staffing', pinnacle: 'Pinnacle Resourcing', 'computer-systems': 'Computer Systems' }

    // Any birthday, a leap year's among them: the dates are counted from it.
    for (const born of ['2026-10-12', '2027-03-01', '2028-02-29', '2026-12-31']) {
      const birthday = new Date(`${born}T00:00:00Z`)
      anchorSeed(birthday)
      const lines: TenureLine[] = []
      // The program's own placements, every rung, as the ledger reads them (a draft is not on site).
      for (const pl of nb.placements) {
        if (pl.state === 'DRAFT') continue
        for (let i = 1; i < pl.via.length; i++) {
          lines.push({
            personId: pl.person, personName: pl.person, supplierName: i === 1 ? names[pl.via[1]] ?? pl.via[1] : null,
            startDate: day(-pl.startedDaysAgo), endDate: day(pl.endsInDays), live: pl.state !== 'ENDED',
          })
        }
      }
      for (const l of TENURE_DEMO.lines) {
        lines.push({
          personId: TENURE_DEMO.person, personName: TENURE_DEMO.person, supplierName: names[l.via],
          startDate: day(-l.startedDaysAgo), endDate: day(l.endsInDays), live: l.state !== 'ENDED',
        })
      }
      const warnings = tenureWarningsFor(
        lines,
        { capMonths: nb.governance.tenureCapMonths, breakDays: nb.governance.breakDays, warnAtDays: [90, 60, 30] },
        birthday,
      )
      const at60 = warnings.filter((w) => w.daysToLimit === DAYS_TO_LIMIT)
      expect(at60.map((w) => w.personName)).toEqual([TENURE_DEMO.person])
      expect(at60[0].tier).toBe('WARN_60')
      expect(at60[0].suppliers).toEqual(['Brightmoor Staffing', 'Pinnacle Resourcing'])
    }
  })

  it('the twin’s reads of the tenure ledger are logged under the program owner and the twin’s kind, never as a bare person', async () => {
    // The record, in memory: one Northbend line, no company rule set, no governance rule.
    const db = prisma as unknown as Record<string, unknown>
    const saved = { ...db }
    const createMany = vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length }))
    Object.assign(db, {
      governanceRule: { findMany: vi.fn(async () => []) },
      ruleSet: { findFirst: vi.fn(async () => null) },
      sellContract: { findMany: vi.fn(async () => [
        { id: 'line-1', personId: 'tobias', companyId: 'pinnacle', clientCompanyId: 'northbend', startDate: ago(487), endDate: null, state: 'IN_PROGRESS',
          person: { name: 'Tobias Lindqvist' }, company: { name: 'Pinnacle Resourcing' } },
      ]) },
      masterAgreement: { findMany: vi.fn(async () => []) },
      accessLog: { create: vi.fn(), createMany },
    })
    try {
      await tenureWarnings('northbend', undefined, { now: NOW, actor: { personId: 'dana-owner', companyId: 'northbend' } })
    } finally {
      for (const k of Object.keys(db)) if (!(k in saved)) delete db[k]
      Object.assign(db, saved)
    }

    expect(createMany).toHaveBeenCalledTimes(1)
    const rows = createMany.mock.calls[0][0].data as Record<string, unknown>[]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      subjectId: 'tobias', actorPersonId: 'dana-owner', actorCompanyId: 'northbend',
      actorKind: 'TWIN', actorTwinKind: 'PROGRAM_MANAGER', action: 'TENURE_VIEW', allowed: true,
    })
  })
})
