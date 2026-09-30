import { describe, it, expect } from 'vitest'
import {
  checkCutOvertimeChange,
  cutOvertimeFor,
  cutOvertimeRecord,
  cutOvertimeSays,
  CUT_OVERTIME_LABEL,
  PAYROLL_READS_CUT_OVERTIME,
} from '@/lib/cut-overtime-choice'
import { MIN_REASON } from '@/lib/overtime-method-choice'

/**
 * Overtime on a cut week. The founder, 2026-09-30: overtime only on the
 * accepted hours above the line by default (41 of 45 pays 40 + 1), and a
 * paying firm may keep the week's overtime instead (41 pays 36 + 5),
 * recorded with who chose it and why. This file is the door and the
 * reader; the arithmetic is money's.
 */

const payer = { mayReadCost: true, isPayer: true, personName: 'Priya Natarajan' }

describe('choosing how overtime is paid when fewer hours are accepted', () => {
  it("a firm's choice to keep a cut week's overtime is recorded with who chose it, when and why", () => {
    const v = checkCutOvertimeChange({ ...payer, rule: 'KEEP_WEEK_OVERTIME', reason: '  Agreed with Priya when she joined  ' })
    expect(v.ok).toBe(true)
    if (!v.ok) return
    const at = new Date('2026-09-30T15:00:00Z')
    expect(cutOvertimeRecord(v, 'person-ana', at)).toEqual({
      cutOvertime: 'KEEP_WEEK_OVERTIME',
      cutOvertimeById: 'person-ana',
      cutOvertimeAt: at,
      cutOvertimeReason: 'Agreed with Priya when she joined',
    })
  })

  it("keeping the week's overtime is refused without a reason", () => {
    for (const reason of [undefined, '', '   ', 'because']) {
      const v = checkCutOvertimeChange({ ...payer, rule: 'KEEP_WEEK_OVERTIME', reason })
      expect(v.ok).toBe(false)
      if (v.ok) continue
      expect(v.status).toBe(422)
      expect(v.field).toBe('reason')
      expect(v.says).toContain("Say why Priya Natarajan should keep the week's overtime when fewer hours are accepted.")
    }
    expect('because'.length).toBeLessThan(MIN_REASON)
  })

  it('going back to only the accepted hours over the line needs no reason', () => {
    expect(checkCutOvertimeChange({ ...payer, rule: 'ABOVE_THE_LINE', reason: undefined })).toEqual({
      ok: true, rule: 'ABOVE_THE_LINE', reason: null,
    })
  })

  it("a desk that cannot see what the worker is paid cannot change how a cut week's overtime is paid", () => {
    const v = checkCutOvertimeChange({ ...payer, mayReadCost: false, rule: 'KEEP_WEEK_OVERTIME', reason: 'Agreed with Priya at review' })
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.status).toBe(403)
    expect(v.code).toBe('FORBIDDEN')
  })

  it("only the firm that pays the worker can choose how a cut week's overtime is paid, and the refusal names the worker", () => {
    const v = checkCutOvertimeChange({ ...payer, isPayer: false, rule: 'KEEP_WEEK_OVERTIME', reason: 'We would like her paid more' })
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.status).toBe(403)
    expect(v.says).toBe('Only the firm that pays Priya Natarajan can choose how their overtime is paid when fewer hours are accepted.')
  })

  it('a choice that is neither of the two is refused, and the two are named', () => {
    const v = checkCutOvertimeChange({ ...payer, rule: 'DOUBLE_TIME', reason: 'Agreed with Priya at review' })
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.status).toBe(422)
    expect(v.says).toContain("overtime only on the accepted hours over 40, or keep the week's overtime")
  })

  it('the two choices read in plain words on the screen', () => {
    expect(CUT_OVERTIME_LABEL.ABOVE_THE_LINE).toBe('Only accepted hours over 40 (default, what the law requires)')
    expect(CUT_OVERTIME_LABEL.KEEP_WEEK_OVERTIME).toBe("Keep the week's overtime (ordinary hours cut first)")
  })
})

describe('what payroll reads off the line', () => {
  it('a line nobody touched is paid overtime only on the accepted hours over the line', () => {
    expect(cutOvertimeFor({ cutOvertime: 'ABOVE_THE_LINE' })).toMatchObject({ rule: 'ABOVE_THE_LINE', chosen: false })
    expect(cutOvertimeFor(null).rule).toBe('ABOVE_THE_LINE')
    expect(cutOvertimeFor({}).rule).toBe('ABOVE_THE_LINE')
  })

  it("keeps a cut week's overtime only where the line says who chose it and why", () => {
    expect(cutOvertimeFor({ cutOvertime: 'KEEP_WEEK_OVERTIME', cutOvertimeById: 'p1', cutOvertimeReason: 'Agreed at review' }))
      .toMatchObject({ rule: 'KEEP_WEEK_OVERTIME', chosen: true })
    const nobody = cutOvertimeFor({ cutOvertime: 'KEEP_WEEK_OVERTIME', cutOvertimeById: null, cutOvertimeReason: 'Agreed at review' })
    expect(nobody.rule).toBe('ABOVE_THE_LINE')
    expect(nobody.says).toContain('without saying who chose it and why, so it is not used')
    expect(cutOvertimeFor({ cutOvertime: 'KEEP_WEEK_OVERTIME', cutOvertimeById: 'p1', cutOvertimeReason: '  ' }).rule).toBe('ABOVE_THE_LINE')
  })
})

describe('the sentence on the pay line', () => {
  it('says the default in plain words and that at or under the line is straight time', () => {
    const s = cutOvertimeSays({ cutOvertime: 'ABOVE_THE_LINE' }, true)
    expect(s.says).toBe(
      'When fewer hours are accepted, overtime is paid only on the accepted hours over the line. ' +
      'At or under 40 accepted hours, every hour is paid at straight time.'
    )
    expect(s.chosenBy).toBeNull()
  })

  it('names who chose to keep the week’s overtime, and when', () => {
    const s = cutOvertimeSays({
      cutOvertime: 'KEEP_WEEK_OVERTIME', cutOvertimeById: 'p1', cutOvertimeAt: new Date('2026-09-30T15:00:00Z'),
      cutOvertimeReason: 'Agreed with Priya when she joined', cutOvertimeBy: { name: 'Ana Ruiz' },
    }, true)
    expect(s.says).toContain('the week keeps its overtime and the cut comes off ordinary hours first. Chosen by Ana Ruiz on September 30, 2026.')
    expect(s.reason).toBe('Agreed with Priya when she joined')
  })

  it('says plainly which rule payroll pays today while payroll does not read the setting', () => {
    expect(PAYROLL_READS_CUT_OVERTIME).toBe(false)
    const s = cutOvertimeSays({ cutOvertime: 'ABOVE_THE_LINE' })
    expect(s.payrollReadsIt).toBe(false)
    expect(s.says).toContain(
      'Payroll does not read this setting yet: today the week keeps its overtime and the cut comes off ordinary hours first.'
    )
    // A line already on the rule payroll uses is not told it differs.
    const kept = cutOvertimeSays({ cutOvertime: 'KEEP_WEEK_OVERTIME', cutOvertimeById: 'p1', cutOvertimeReason: 'Agreed at review' })
    expect(kept.says).not.toContain('Payroll does not read this setting yet')
  })
})
