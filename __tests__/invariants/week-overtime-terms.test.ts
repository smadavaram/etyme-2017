import { describe, it, expect } from 'vitest'
import { weekOvertimeTerms, overtimeOnSignedWeek } from '@/lib/money/week-overtime-terms'

/**
 * The second screen walk, 2026-11-03: a 44-hour week signed with the
 * overtime at a premium billed $4,508 (40 × $98 + 4 × $147) and posted at
 * the client's signature as $4,312 (44 × $98). One reading of the week's
 * terms, now, for the bill and the posting.
 */

// Sun Oct 11 – Sat Oct 17, 2026: Mon–Thu 9 h, Fri 8 h = 44.
const sheet = {
  periodStart: new Date('2026-10-11T00:00:00Z'), periodEnd: new Date('2026-10-17T00:00:00Z'),
  days: { '2026-10-12': 9, '2026-10-13': 9, '2026-10-14': 9, '2026-10-15': 9, '2026-10-16': 8 },
  leaveDays: {}, totalHours: 44,
}
const line = { id: 'line', overtimeAfterHours: 40, overtimeMultiplierBps: 15_000 }
const row = (treatment: string, appliedBps: number, accrualBps?: number) => ({
  sellContractId: 'line', weekOf: new Date('2026-10-11T00:00:00Z'), treatment, appliedBps, overtimeHours: 4, accrualBps: accrualBps ?? null,
})

describe('one pricing for a signed week, read by the bill and the posting at signature', () => {
  it('a 44-hour week with four hours at time and a half on a $98 line adds $196 to its straight time, so the posting is the bill’s $4,508', () => {
    const terms = weekOvertimeTerms({ rows: [row('PREMIUM', 15_000)], line, requirement: null, top: null, belowTop: false, personName: 'Lucía Fernández' })
    expect(terms.unreadable).toBeNull()
    const ot = overtimeOnSignedWeek({ sheet, rateCents: 9_800, terms, accepted: null })
    expect(ot.addsCents).toBe(19_600)
    expect(44 * 9_800 + ot.addsCents).toBe(450_800)
    expect(ot.overtimeHours).toBe(4)
    expect(ot.multiplierBps).toBe(15_000)
  })

  it('a week decided at straight time adds nothing, and a week with no decision adds nothing', () => {
    const flat = weekOvertimeTerms({ rows: [row('SAME_RATE', 10_000)], line, requirement: null, top: null, belowTop: false, personName: 'Lucía Fernández' })
    expect(overtimeOnSignedWeek({ sheet, rateCents: 9_800, terms: flat, accepted: null }).addsCents).toBe(0)
    const none = weekOvertimeTerms({ rows: [], line, requirement: null, top: null, belowTop: false, personName: 'Lucía Fernández' })
    expect(overtimeOnSignedWeek({ sheet, rateCents: 9_800, terms: none, accepted: null }).addsCents).toBe(0)
  })

  it('a line with no rate adds nothing rather than a premium on nothing', () => {
    const terms = weekOvertimeTerms({ rows: [row('PREMIUM', 15_000)], line, requirement: null, top: null, belowTop: false, personName: 'Lucía Fernández' })
    expect(overtimeOnSignedWeek({ sheet, rateCents: 0, terms, accepted: null })).toEqual({ addsCents: 0, overtimeHours: 0, bankedHours: 0, multiplierBps: null })
  })
})
