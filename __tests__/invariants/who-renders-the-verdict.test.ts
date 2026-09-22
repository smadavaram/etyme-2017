/**
 * Who renders the verdict on a check, and who the report is sent to.
 *
 * The founder, 2026-09-22:
 *
 *   "Ultimately background check companies are the ones that confirm
 *   background pass or fail — the risk is passed there to background
 *   check companies; our job would be to collect all info and pass it
 *   to them to verify in today's market."
 *
 * Two things were wrong before this. A background check was carried as
 * a document the worker supplies — the same shape as a passport — so
 * her own paperwork page chased her for a report the provider posted to
 * somebody else and offered her a button to upload it. And a recorded
 * check with nobody's name on it read as "on file", identical to one a
 * screening company actually rendered, because `provider` and
 * `referenceId` have existed since the table did and nothing writes
 * them.
 */

import { describe, it, expect } from 'vitest'
import {
  whoRendersCheck,
  checkKindOf,
  orderedNotCollected,
  orderedBySays,
  readVerdict,
  standingOf,
  mayRelyOn,
  overallVerdict,
} from '@/lib/attestation'

const MARCH = new Date('2026-03-12T00:00:00Z')
const TODAY = new Date('2026-09-22T00:00:00Z')

describe('who renders the verdict on a check', () => {
  it('a background check is rendered by the screening company that ran it, and the worker never holds the report', () => {
    const who = whoRendersCheck('BACKGROUND_CHECK')
    expect(who.renders).toBe('PROVIDER')
    expect(who.subjectHoldsIt).toBe(false)
    expect(who.subjectOwes).toBe('CONSENT_AND_IDENTIFIERS')
  })

  it('a worker is asked for her consent to a check and never for the report, because the report is sent to the firm that ordered it', () => {
    expect(orderedBySays('BACKGROUND_CHECK', 'Veritan Talent')).toContain('Veritan Talent orders this from a screening company')
    expect(orderedBySays('BACKGROUND_CHECK', 'Veritan Talent')).toContain('your consent')
  })

  it('a drug screening is rendered by the laboratory, so what the worker owes is her consent and her attendance', () => {
    expect(whoRendersCheck('DRUG_SCREENING').renders).toBe('PROVIDER')
    expect(orderedNotCollected('DRUG_SCREENING')).toBe(true)
  })

  it('a passport is the worker’s own and stays hers to send, because no screening company renders a verdict on it', () => {
    expect(checkKindOf('PASSPORT')).toBe('IDENTITY')
    expect(whoRendersCheck('IDENTITY').subjectHoldsIt).toBe(true)
    expect(orderedNotCollected('PASSPORT')).toBe(false)
    expect(orderedBySays('PASSPORT', 'Veritan Talent')).toBeNull()
  })

  it('a state license is the worker’s own even though a board issued it, so the chase still asks her', () => {
    expect(whoRendersCheck('CERTIFICATION').renders).toBe('AUTHORITY')
    expect(whoRendersCheck('CERTIFICATION').subjectHoldsIt).toBe(true)
    expect(orderedNotCollected('PROFESSIONAL_LICENSE')).toBe(false)
  })

  it('a document type nobody here has heard of is not guessed at, and stays the worker’s to send', () => {
    expect(checkKindOf('FURNACE_SAFETY_INDUCTION')).toBeNull()
    expect(orderedNotCollected('FURNACE_SAFETY_INDUCTION')).toBe(false)
  })

  it('names no firm it cannot name, and says “the firm placing you” rather than inventing one', () => {
    expect(orderedBySays('BACKGROUND_CHECK', null)).toContain('The firm placing you')
  })
})

describe('telling a provider’s report from somebody here ticking a box', () => {
  it('a check that names the screening company, the day and the reference reads back as that company’s report', () => {
    const v = readVerdict({ key: 'BACKGROUND_CHECK', status: 'CLEAR', provider: 'Sterling', reference: '4471', on: MARCH })
    expect(v.rendered).toBe(true)
    expect(v.renderedBy).toBe('Sterling')
    expect(v.says).toBe('Sterling reported clear on 2026-03-12, reference 4471.')
  })

  it('a check with nobody named on it reads as this firm’s own note and never as a verdict somebody rendered', () => {
    const v = readVerdict({ key: 'BACKGROUND_CHECK', status: 'CLEAR', provider: null, on: MARCH, recordedBy: 'Dana Whitfield' })
    expect(v.rendered).toBe(false)
    expect(v.renderedBy).toBeNull()
    expect(v.says).toContain('recorded here by Dana Whitfield on 2026-03-12')
    expect(v.says).toContain('No screening company is named on it')
  })

  it('a check with a provider but no reference still names the provider, because a name is most of what a reader needs', () => {
    const v = readVerdict({ key: 'DRUG_SCREENING', status: 'CLEAR', provider: 'Quest', on: MARCH })
    expect(v.rendered).toBe(true)
    expect(v.says).toBe('Quest reported clear on 2026-03-12.')
  })

  it('a check still running says it is with the provider and holds nothing', () => {
    const v = readVerdict({ key: 'BACKGROUND_CHECK', status: 'PENDING', provider: 'Sterling', on: MARCH })
    expect(v.running).toBe(true)
    expect(v.rendered).toBe(false)
    expect(v.says).toContain('is with Sterling and has not come back')
  })

  it('a check that was opened with nobody named on it says there is nobody to chase for it', () => {
    const v = readVerdict({ key: 'BACKGROUND_CHECK', status: 'IN_PROGRESS', provider: null })
    expect(v.says).toContain('nobody to chase for it')
  })

  it('a check that came back not clear is reported in the provider’s name too, because a refusal needs an author most of all', () => {
    const v = readVerdict({ key: 'BACKGROUND_CHECK', status: 'FAILED', provider: 'HireRight', reference: '99012', on: MARCH })
    expect(v.says).toBe('HireRight reported not clear on 2026-03-12, reference 99012.')
  })
})

describe('what the record still refuses to say', () => {
  it('a background check may be read as background and never relied on as a check this firm has run', () => {
    const standing = standingOf(
      { kind: 'BACKGROUND_CHECK', verifier: 'AGENCY', verifiedBy: 'Sterling', verifiedAt: MARCH },
      TODAY
    )
    const reliance = mayRelyOn('BACKGROUND_CHECK', standing)
    expect(reliance.mayRely).toBe(false)
    expect(reliance.mustRedo).toBe(true)
    expect(reliance.says).toContain('Take it as background, not as a check you have run')
  })

  it('Etyme still declares nobody fit or unfit, whoever rendered the parts', () => {
    expect(() => overallVerdict()).toThrow(/does not declare a person fit or unfit/)
  })
})
