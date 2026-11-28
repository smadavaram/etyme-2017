import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { bandHint, RATE_HELP, CURRENCY_SAYS } from '@/app/dashboard/submissions/rate-words'

/** The submit form, in the words a recruiter uses (outside review, 2026-10-05). */

const PAGE = readFileSync(join(process.cwd(), 'src/app/dashboard/submissions/page.tsx'), 'utf8')
const modal = PAGE.slice(PAGE.indexOf('function SubmitToRequirementModal'), PAGE.indexOf('// ── Place (the award)'))

describe('the submit form', () => {
  it('the person being put forward is labelled Consultant, not Who', () => {
    // The label is the shared Field's, which ties it to the select.
    expect(modal).toContain('label="Consultant *"')
    expect(modal).not.toContain('>Who *</label>')
    expect(modal).not.toContain('label="Who *"')
  })

  it('the rate is labelled Rate with the unit per hour, and no dollar sign sits beside the currency', () => {
    expect(modal).toContain('label="Rate *"')
    expect(modal).toContain('per hour')
    expect(modal).not.toContain('$/hr')
  })

  it('the rate field has no number in it that reads as a default', () => {
    expect(modal).not.toContain('placeholder="125"')
    expect(modal).not.toContain('placeholder="90"')
    expect(RATE_HELP).toContain('no default')
  })

  it('where the client gave this firm a band, the band is the hint under the rate', () => {
    expect(bandHint({ payMin: 9000, payMax: 11000 })).toBe('Your band on this job: $90 to $110 per hour.')
    expect(bandHint({ payMin: null, payMax: 11050 })).toBe('Your band on this job: up to $110.50 per hour.')
    expect(bandHint({ payMin: null, payMax: null })).toBeNull()
    expect(bandHint(undefined)).toBeNull()
  })

  it('the form offers no currency choice the record would throw away, and says which currency is recorded', () => {
    expect(modal).not.toContain('<option value="CAD">')
    expect(modal).not.toContain('rateCurrency')
    expect(CURRENCY_SAYS).toContain('US dollars')
  })

  it('the form has a Cancel button beside Submit', () => {
    expect(modal).toMatch(/onClick=\{onClose\} className="btn-secondary[^"]*">\s*Cancel/)
  })

  it('a warning about the client’s time limit asks for a reason on the form and sends it with the same press', () => {
    expect(modal).toContain("firstResult?.status === 'needs_reason'")
    expect(modal).toContain('Reason to go ahead *')
    expect(modal).toContain('reason: form.reason.trim()')
  })

  it('a work authorization warning is shown before the form closes, not swallowed', () => {
    expect(modal).toContain('firstResult?.workAuthWarning')
  })
})
