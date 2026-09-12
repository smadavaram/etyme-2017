/**
 * Etyme attests that a check happened. It never declares a person fit.
 *
 * A consultant working through six suppliers hands the same passport to
 * six firms and each keeps a copy. The fix is not to move documents
 * around more efficiently — it is to move a fact about a check instead,
 * and leave the document with the person.
 *
 * The line these tests defend: a fact about an event may be shared. A
 * judgement about a person may not, because a judgement transfers no
 * legal duty, makes us the liability sink, makes us a screening agency,
 * and puts us in competition with the suppliers we depend on.
 */

import { describe, it, expect } from 'vitest'
import {
  standingOf, mayRelyOn, whatToShare, exposureOf, overallVerdict,
  type Attestation, type CheckKind,
} from '@/lib/attestation'

const AT = new Date('2026-06-15T00:00:00Z')
const daysAgo = (n: number) => new Date(AT.getTime() - n * 86_400_000)

const att = (over: Partial<Attestation> & { kind: CheckKind }): Attestation => ({
  verifier: 'AGENCY',
  verifiedBy: 'Sterling',
  verifiedAt: daysAgo(30),
  ...over,
})

describe('An attestation is a sentence with a name and a date in it, never a tick', () => {

  it('names who checked it and when', () => {
    const s = standingOf(att({ kind: 'EDUCATION_VERIFICATION', verifiedBy: 'WES', verifiedAt: daysAgo(400) }), AT)
    expect(s.says).toBe('Education verified by WES on 2025-05-11.')
  })

  it('carries the expiry of the thing it was against', () => {
    const s = standingOf(att({
      kind: 'RIGHT_TO_WORK', verifiedBy: 'Acme Staffing',
      verifiedAt: daysAgo(10), subjectExpiresAt: new Date('2028-08-04T00:00:00Z'),
    }), AT)
    expect(s.says).toBe('Right to work verified by Acme Staffing on 2026-06-05, valid to 2028-08-04.')
  })

  it('says plainly when the document behind it has lapsed', () => {
    const s = standingOf(att({
      kind: 'RIGHT_TO_WORK', verifiedBy: 'Acme Staffing',
      verifiedAt: daysAgo(400), subjectExpiresAt: daysAgo(20),
    }), AT)
    expect(s.current).toBe(false)
    expect(s.says).toContain('The document it was against expired on')
  })

  it('refuses to produce an overall verdict at all', () => {
    // Exported so anybody reaching for one finds this rather than adding
    // a boolean somewhere quiet.
    expect(() => overallVerdict()).toThrow(/does not declare a person fit or unfit/)
  })
})

describe('Nobody may treat our attestation as their own statutory check', () => {

  it('says no on right to work, however fresh it is', () => {
    const s = standingOf(att({ kind: 'RIGHT_TO_WORK', verifiedAt: daysAgo(1) }), AT)
    const r = mayRelyOn('RIGHT_TO_WORK', s)
    expect(r.mayRely).toBe(false)
    expect(r.mustRedo).toBe(true)
    expect(r.says).toContain('You still have to run your own')
  })

  it('says no on the I-9, and says why there is no version that works', () => {
    const s = standingOf(att({ kind: 'I9_EVERIFY', verifiedAt: daysAgo(1) }), AT)
    expect(mayRelyOn('I9_EVERIFY', s).says).toContain(
      'no version of this that a third party can do for you'
    )
  })

  it('explains what the attestation IS worth, so it does not read as pointless', () => {
    const s = standingOf(att({ kind: 'RIGHT_TO_WORK', verifiedAt: daysAgo(1) }), AT)
    expect(mayRelyOn('RIGHT_TO_WORK', s).says).toContain('saves asking for the document twice')
  })
})

describe('A check about the past may be reused. A check about a day may not', () => {

  it('a degree verified by the awarding body is the clearest reuse there is', () => {
    const s = standingOf(att({ kind: 'EDUCATION_VERIFICATION', verifiedBy: 'WES', verifiedAt: daysAgo(900) }), AT)
    const r = mayRelyOn('EDUCATION_VERIFICATION', s)
    expect(r.mayRely).toBe(true)
    expect(r.says).toContain('without asking again')
  })

  it('a public registry entry may be relied on because anybody could check it themselves', () => {
    const s = standingOf(att({ kind: 'CERTIFICATION', verifiedBy: 'AWS', verifiedAt: daysAgo(200) }), AT)
    expect(mayRelyOn('CERTIFICATION', s).mayRely).toBe(true)
  })

  it('a background check describes a day, and that day has passed', () => {
    const s = standingOf(att({ kind: 'BACKGROUND_CHECK', verifiedAt: daysAgo(30) }), AT)
    const r = mayRelyOn('BACKGROUND_CHECK', s)
    expect(r.mayRely).toBe(false)
    expect(r.says).toContain('background, not as a check you have run')
  })

  it('a client asking for a fresh drug screen is not being difficult', () => {
    const s = standingOf(att({ kind: 'DRUG_SCREENING', verifiedAt: daysAgo(10) }), AT)
    expect(mayRelyOn('DRUG_SCREENING', s).says).toContain('describes a day')
  })

  it('a stale reusable check stops being relied on rather than quietly ageing', () => {
    const s = standingOf(att({ kind: 'EMPLOYMENT_VERIFICATION', verifiedAt: daysAgo(900) }), AT)
    expect(s.current).toBe(false)
    expect(mayRelyOn('EMPLOYMENT_VERIFICATION', s).mayRely).toBe(false)
  })
})

describe('Before an award, no document moves anywhere', () => {

  const held: CheckKind[] = ['RIGHT_TO_WORK', 'EDUCATION_VERIFICATION', 'BACKGROUND_CHECK']

  it('a supplier sees that checks happened and holds nothing', () => {
    const s = whatToShare('SUPPLIER', 'BEFORE_AWARD', held)
    expect(s.documents).toHaveLength(0)
    expect(s.attestations).toEqual(held)
  })

  it('a client sees the same and holds nothing', () => {
    expect(whatToShare('CLIENT', 'BEFORE_AWARD', held).documents).toHaveLength(0)
  })

  it('says why, in terms a supplier who wants the passport will accept', () => {
    expect(whatToShare('SUPPLIER', 'BEFORE_AWARD', held).says).toContain(
      'six chances to lose it'
    )
  })
})

describe('After an award, only the employer gets papers — and still does its own check', () => {

  const held: CheckKind[] = ['RIGHT_TO_WORK', 'EDUCATION_VERIFICATION', 'BACKGROUND_CHECK']

  it('the employer gets what it needs to run its own statutory check', () => {
    const s = whatToShare('SUPPLIER', 'AFTER_AWARD', held)
    expect(s.documents).toContain('RIGHT_TO_WORK')
  })

  it('and is told that seeing somebody else’s check does not replace theirs', () => {
    expect(whatToShare('SUPPLIER', 'AFTER_AWARD', held).says).toContain(
      'it does not save you the check'
    )
  })

  it('a point-in-time result is not passed on even to the employer', () => {
    // Somebody else's background report was furnished for one purpose.
    // Handing it onward is a regulated act in its own right.
    expect(whatToShare('SUPPLIER', 'AFTER_AWARD', held).documents).not.toContain('BACKGROUND_CHECK')
  })

  it('a client never gets identity documents, at any point', () => {
    // They are not the employer. Holding the papers gives them exposure,
    // no benefit, and one more way to look like a joint employer.
    const s = whatToShare('CLIENT', 'AFTER_AWARD', held)
    expect(s.documents).toHaveLength(0)
    expect(s.says).toContain('not the employer')
  })
})

describe('How many firms hold a copy is a number nobody has ever been asked for', () => {

  it('counts the copies and the firms separately', () => {
    const e = exposureOf(
      [
        { firm: 'Acme', since: new Date('2023-01-01T00:00:00Z') },
        { firm: 'Acme', since: new Date('2024-01-01T00:00:00Z') },
        { firm: 'Globex', since: new Date('2025-01-01T00:00:00Z') },
      ],
      AT
    )
    expect(e.copies).toBe(3)
    expect(e.firms).toBe(2)
  })

  it('names the age of the oldest, because that is the exposure', () => {
    const e = exposureOf([{ firm: 'Acme', since: new Date('2022-06-15T00:00:00Z') }], AT)
    expect(e.says).toBe(
      '1 copy of their identity documents sits with 1 firm, the oldest for 4 years. ' +
      'None of them can see the others.'
    )
  })

  it('says so plainly when nobody holds anything', () => {
    expect(exposureOf([], AT).says).toBe('Nobody outside holds a copy of their documents.')
  })
})
