import { describe, it, expect } from 'vitest'
import {
  ruleChecks, evidenceCheck, evidencePrompt, MAX_ATTEMPTS, type Package,
} from '@/lib/checks'
// The engine lives in one place now. This file tests what a submission is
// checked for; loop.test.ts tests what the loop does with the answers.
import { decide, mayProceed, type Finding } from '@/lib/loop'

/**
 * A submission leaves this building and lands in front of a client. If the
 * rate is over their ceiling, the visa expires inside the contract, or the
 * CV never mentions the skill that was claimed, the client does not send
 * it back for correction — they stop calling.
 *
 * So the check happens before it leaves. Rules do almost all of it,
 * because rate against range and permit against date are arithmetic. One
 * question needs a model, and only one.
 */

const NOW = new Date('2026-08-21T00:00:00Z')

function pkg(over: Partial<Package> = {}): Package {
  return {
    personName: 'Anita Desai',
    rateCents: 13000,
    billMin: 12000,
    billMax: 14000,
    resumeId: 'cv-1',
    claimedSkills: ['SAP FICO'],
    documents: [{ kind: 'RIGHT_TO_WORK', expiresAt: new Date('2027-01-01') }],
    documentsRequired: ['RIGHT_TO_WORK'],
    availableFrom: new Date('2026-08-25'),
    startDate: new Date('2026-09-01'),
    workAuth: 'US_CITIZEN',
    workAuthRequired: null,
    consented: true,
    ...over,
  }
}

function find(fs: Finding[], code: string): Finding {
  return fs.find((f) => f.code === code)!
}

describe('the rate', () => {
  it('passes inside the range', () => {
    expect(find(ruleChecks(pkg(), NOW), 'RATE_IN_RANGE').verdict).toBe('PASS')
  })

  it('fails above the ceiling, and says what to do', () => {
    const f = find(ruleChecks(pkg({ rateCents: 16000 }), NOW), 'RATE_IN_RANGE')
    expect(f.verdict).toBe('FAIL')
    expect(f.reason).toBe(
      'Asking $160 on a role that tops out at $140. Drop the rate or say why it is worth more.'
    )
  })

  it('does not block a rate below the floor, because that is sometimes deliberate', () => {
    // A check that blocks a decision somebody made on purpose gets
    // overridden until nobody reads any of them.
    const f = find(ruleChecks(pkg({ rateCents: 9000 }), NOW), 'RATE_IN_RANGE')
    expect(f.verdict).toBe('PASS')
    expect(f.reason).toMatch(/Fine if that is deliberate/)
  })

  it('fails when there is no rate at all', () => {
    expect(find(ruleChecks(pkg({ rateCents: null }), NOW), 'RATE_IN_RANGE').verdict).toBe('FAIL')
  })
})

describe('the CV', () => {
  it('fails when nothing is attached, because the client reads the CV, not the row', () => {
    const f = find(ruleChecks(pkg({ resumeId: null }), NOW), 'CV_ATTACHED')
    expect(f.verdict).toBe('FAIL')
    expect(f.reason).toMatch(/reads the CV, not the row/)
  })
})

describe('the documents', () => {
  it('passes when everything required is present and in date', () => {
    expect(find(ruleChecks(pkg(), NOW), 'DOCS_PRESENT').verdict).toBe('PASS')
  })

  it('fails on a missing one and names it', () => {
    const f = find(ruleChecks(pkg({ documents: [] }), NOW), 'DOCS_PRESENT')
    expect(f.verdict).toBe('FAIL')
    expect(f.reason).toBe('Documents: missing RIGHT_TO_WORK.')
  })

  it('fails on one that has expired, which is a different problem from a missing one', () => {
    const f = find(
      ruleChecks(
        pkg({ documents: [{ kind: 'RIGHT_TO_WORK', expiresAt: new Date('2026-01-01') }] }),
        NOW
      ),
      'DOCS_PRESENT'
    )
    expect(f.verdict).toBe('FAIL')
    expect(f.reason).toBe('Documents: expired RIGHT_TO_WORK.')
  })

  it('says so plainly when the role asks for none', () => {
    const f = find(ruleChecks(pkg({ documentsRequired: [] }), NOW), 'DOCS_PRESENT')
    expect(f.reason).toBe('No documents required for this one.')
  })
})

describe('when they can start', () => {
  it('passes somebody free before the role starts', () => {
    expect(find(ruleChecks(pkg(), NOW), 'AVAILABLE_IN_WINDOW').verdict).toBe('PASS')
  })

  it('lets a fortnight late through, because start dates slip', () => {
    const f = find(
      ruleChecks(pkg({ availableFrom: new Date('2026-09-14') }), NOW),
      'AVAILABLE_IN_WINDOW'
    )
    expect(f.verdict).toBe('PASS')
    expect(f.reason).toMatch(/13 days late/)
  })

  it('fails three months late', () => {
    expect(
      find(ruleChecks(pkg({ availableFrom: new Date('2026-12-01') }), NOW), 'AVAILABLE_IN_WINDOW')
        .verdict
    ).toBe('FAIL')
  })
})

describe('the permit', () => {
  it('excludes nobody when the role does not name one', () => {
    expect(find(ruleChecks(pkg(), NOW), 'WORK_AUTH').verdict).toBe('PASS')
  })

  it('fails a mismatch', () => {
    const f = find(
      ruleChecks(pkg({ workAuthRequired: 'US_CITIZEN', workAuth: 'H1B' }), NOW),
      'WORK_AUTH'
    )
    expect(f.verdict).toBe('FAIL')
    expect(f.reason).toBe('Role needs US_CITIZEN; they are H1B.')
  })

  it('fails when the role names one and we have recorded nothing', () => {
    // Sending somebody without knowing is how a placement collapses in
    // week two. Ask first.
    const f = find(
      ruleChecks(pkg({ workAuthRequired: 'US_CITIZEN', workAuth: null }), NOW),
      'WORK_AUTH'
    )
    expect(f.verdict).toBe('FAIL')
    expect(f.reason).toMatch(/Ask before sending/)
  })
})

describe('did they say yes', () => {
  it('passes when the person agreed to this submission', () => {
    expect(find(ruleChecks(pkg(), NOW), 'CONSENT').verdict).toBe('PASS')
  })

  it('fails when nobody asked them', () => {
    // Consultants get submitted blind constantly and it burns them, and
    // when two vendors submit the same person the client rejects both.
    const f = find(ruleChecks(pkg({ consented: false }), NOW), 'CONSENT')
    expect(f.verdict).toBe('FAIL')
    expect(f.reason).toMatch(/being submitted blind is what makes consultants stop answering/)
  })
})

describe('the loop', () => {
  const ok: Finding = { code: 'RATE_IN_RANGE', checker: 'RULE', verdict: 'PASS', reason: 'fine' }
  const bad: Finding = { code: 'CV_ATTACHED', checker: 'RULE', verdict: 'FAIL', reason: 'no CV' }

  it('is ready when nothing failed', () => {
    const v = decide([ok, ok], 1)
    expect(v.state).toBe('READY')
    // Wording is the harness's now, not this surface's. The two copies
    // of decide() had already drifted apart on exactly this sentence,
    // which is what a shared engine is for. The domain phrase lives in
    // mayProceed, which the route surfaces as maySend.
    expect(v.summary).toBe('All 2 checks passed.')
  })

  it('asks for fixes and says how many', () => {
    const v = decide([ok, bad], 1)
    expect(v.state).toBe('NEEDS_FIX')
    expect(v.toFix).toHaveLength(1)
    expect(v.summary).toBe('1 to fix.')
    expect(v.mayRetry).toBe(true)
  })

  it('stops after three tries and asks for a person', () => {
    // The fourth attempt costs the same as the first and has never once
    // worked.
    const v = decide([bad], MAX_ATTEMPTS)
    expect(v.mayRetry).toBe(false)
    expect(v.summary).toBe('1 still wrong after 3 tries. Somebody needs to look at this one.')
  })

  it('moves one step per call', () => {
    // There is no CHECKING any more. A run is one synchronous call, so
    // nothing ever rested there, and a state the code cannot produce is
    // one somebody will eventually build a screen for.
    expect(decide([ok], 1).state).toBe('READY')
    expect(decide([bad], 1).state).toBe('NEEDS_FIX')
  })
})

describe('the send button', () => {
  const bad: Finding = { code: 'CV_ATTACHED', checker: 'RULE', verdict: 'FAIL', reason: 'No CV.' }

  it('works when everything passed', () => {
    expect(mayProceed(decide([], 1), false).ok).toBe(true)
  })

  it('is disabled while anything is red, and says what', () => {
    const v = mayProceed(decide([bad], 1), false)
    expect(v.ok).toBe(false)
    expect(v.reason).toBe('No CV.')
  })

  it('can be overridden, and says the override was recorded', () => {
    // A gate nobody can pass gets worked around outside the product,
    // which is worse than a gate with a log.
    const v = mayProceed(decide([bad], 1), true)
    expect(v.ok).toBe(true)
    expect(v.reason).toMatch(/Recorded against whoever pressed it/)
  })
})

describe('the one question worth paying a model for', () => {
  const CV = 'Senior consultant. Six years on SAP FICO across three S/4HANA rollouts.'

  it('asks for a quote, not an opinion', () => {
    const p = evidencePrompt(['SAP FICO'], CV)
    expect(p).toMatch(/verbatim/)
    expect(p).toMatch(/Do not paraphrase/)
    expect(p).toMatch(/Related is not the same as evidenced/)
  })

  it('passes when every claim has a line behind it', () => {
    const f = evidenceCheck(
      ['SAP FICO'],
      [{ skill: 'SAP FICO', found: true, quote: 'Six years on SAP FICO' }],
      CV
    )
    expect(f.verdict).toBe('PASS')
    expect(f.evidence).toMatch(/Six years on SAP FICO/)
  })

  it('fails a claim the CV never makes, and says which', () => {
    const f = evidenceCheck(
      ['SAP FICO', 'Kubernetes'],
      [
        { skill: 'SAP FICO', found: true, quote: 'Six years on SAP FICO' },
        { skill: 'Kubernetes', found: false, quote: null },
      ],
      CV
    )
    expect(f.verdict).toBe('FAIL')
    expect(f.reason).toMatch(/^Kubernetes is claimed but not in the CV/)
  })

  it('throws out a quote that is not actually in the CV', () => {
    // A fabricated quote is the single worst thing this check could pass.
    const f = evidenceCheck(
      ['Kubernetes'],
      [{ skill: 'Kubernetes', found: true, quote: 'Led Kubernetes migration at scale' }],
      CV
    )
    expect(f.verdict).toBe('FAIL')
    expect(f.reason).toMatch(/could not be found in the CV and was discounted/)
  })

  it('is always labelled as a machine judgement, never as a fact', () => {
    const f = evidenceCheck(['SAP FICO'], [{ skill: 'SAP FICO', found: true, quote: 'SAP FICO' }], CV)
    expect(f.checker).toBe('MODEL')
  })
})
