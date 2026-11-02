import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { startWarningVerdict, warningsSay, type StartWarning } from '@/lib/money/start-warnings'
import { reasonAsked } from '@/lib/award/reason-asked'

/**
 * A start's warnings are asked once, together, and a reason answers only
 * what the person was shown.
 *
 * The second Tapin walk (2026-10-31), handed over by etyme-demand: Activate
 * asked for a reason on a paperwork warning and drew no box; and the route
 * asked the paperwork's warning and the client rule's one press at a time,
 * both answered in `overrideReason`, so a reason typed for the paperwork
 * silently carried the start past a client rule nobody had seen.
 */

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const PAPERS: StartWarning = {
  code: 'DOCUMENTS_WARN',
  says: 'Ravi Kumar has no background check on file.',
  detail: { fix: 'Order the check.', chasing: [], cover: 'PASS' },
}
const RULE: StartWarning = {
  code: 'GOVERNANCE_WARN',
  says: 'The bill rate is above the band Northbend Athletic set.',
  detail: { evaluations: [{ ruleId: 'r1', outcome: 'WARN', reason: 'Above the band' }] },
}

describe('the route asks every warning in one refusal', () => {
  it('a start with a paperwork warning and a client rule’s warning is refused once, naming both', () => {
    const v = startWarningVerdict([PAPERS, RULE], { reason: null })
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.error.warnings.map((w) => w.code)).toEqual(['DOCUMENTS_WARN', 'GOVERNANCE_WARN'])
    expect(v.error.message).toBe(
      '2 warnings to answer before this start. Paperwork: Ravi Kumar has no background check on file. ' +
        'The client’s rule: The bill rate is above the band Northbend Athletic set. ' +
        'One reason answers all of them, and it is recorded beside each.'
    )
    expect(v.error.evaluations).toEqual(RULE.detail!.evaluations)
    expect(v.error.fix).toBe('Order the check.')
  })

  it('one warning alone is said in its own words and under its own code, as before', () => {
    const v = startWarningVerdict([PAPERS], { reason: '' })
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.error.code).toBe('DOCUMENTS_WARN')
    expect(v.error.message).toBe(PAPERS.says)
    expect(warningsSay([RULE])).toBe(RULE.says)
  })

  it('the refusal is a question demand’s reader recognizes, answered in overrideReason', () => {
    const v = startWarningVerdict([PAPERS, RULE], { reason: null })
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(reasonAsked(v.error)).toEqual({ says: v.error.message, field: 'overrideReason' })
  })

  it('a start with no warning goes ahead with nothing answered', () => {
    expect(startWarningVerdict([], { reason: null })).toEqual({ ok: true, answered: [] })
  })
})

describe('a reason answers only what the person was shown', () => {
  it('a reason given after reading both warnings answers both', () => {
    const v = startWarningVerdict([PAPERS, RULE], { reason: 'Check ordered, result due Friday.', answering: ['DOCUMENTS_WARN', 'GOVERNANCE_WARN'] })
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.answered.map((w) => w.code)).toEqual(['DOCUMENTS_WARN', 'GOVERNANCE_WARN'])
  })

  it('a reason typed for the paperwork never answers a client rule the person has not seen: that rule is asked again, alone', () => {
    const v = startWarningVerdict([PAPERS, RULE], { reason: 'Check ordered, result due Friday.', answering: ['DOCUMENTS_WARN'] })
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.error.code).toBe('GOVERNANCE_WARN')
    expect(v.error.warnings).toEqual([{ code: 'GOVERNANCE_WARN', says: RULE.says }])
    expect(v.error.message).toBe(RULE.says)
  })

  it('a blank reason answers nothing', () => {
    expect(startWarningVerdict([RULE], { reason: '   ', answering: ['GOVERNANCE_WARN'] }).ok).toBe(false)
  })
})

describe('the activate route and the Activate button keep to it', () => {
  it('the route works out the paperwork’s and the client rule’s warnings before it asks either', () => {
    const src = read('src/app/api/contracts/[id]/activate/route.ts')
    const papers = src.indexOf("code: 'DOCUMENTS_WARN'")
    const rule = src.indexOf("warnings.push({ code: 'GOVERNANCE_WARN'")
    const asked = src.indexOf('const verdict = startWarningVerdict(warnings')
    expect(papers).toBeGreaterThan(0)
    expect(rule).toBeGreaterThan(papers)
    expect(asked).toBeGreaterThan(rule)
    // No early refusal on one warning alone.
    expect(src).not.toMatch(/outcome === 'WARN' && !body\.overrideReason/)
  })

  it('the paperwork’s reason is recorded only where the paperwork warned and the reason answered it', () => {
    expect(read('src/app/api/contracts/[id]/activate/route.ts'))
      .toMatch(/documentsOverride: action === 'activate' && answeredPapers \? overrideReason : null/)
  })

  it('Activate draws a reason box for every warning the route asks, the paperwork’s included, and sends back which it showed', () => {
    const src = read('src/app/dashboard/contracts/page.tsx')
    expect(src).toMatch(/const q = reasonAsked\(body\.error\)\n\s*if \(q && q\.field === 'overrideReason'\)/)
    expect(src).not.toMatch(/body\.error\?\.code === 'GOVERNANCE_WARN' && body\.error\?\.overridable/)
    // The body is built where the field-contract test fills it in (`activateBody`).
    expect(src).toMatch(/activateBody\(\{ action, reason: overrideReasonText, answering \}\)/)
    expect(read('src/app/dashboard/contracts/activate-body.ts')).toMatch(/if \(t\.reason && t\.answering\?\.length\) payload\.answering = \[\.\.\.t\.answering\]/)
    expect(src).not.toMatch(/>Governance warning</)
  })
})
