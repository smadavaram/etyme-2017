import { describe, it, expect } from 'vitest'
import { contractClearance, joinClauses, oneStop } from '@/lib/contract-clearance'

/**
 * A paperwork verdict is the one line a compliance desk reads before it
 * starts somebody. On the browser walk, Rosa Delgado's placement read
 * "…until it is back in date.. The contract can start with a reason
 * recorded." — a finding that already ended in a full stop, joined into
 * a sentence that added another.
 */

const on = new Date('2026-09-10T12:00:00Z')
const inDays = (n: number) => new Date(on.getTime() + n * 86_400_000)
const clear = (type: string, expiresAt: Date | null = null) => ({ type, status: 'CLEAR', expiresAt })
const gl = (expiresAt: Date | null, verifiedAt: Date | null = on) => ({ type: 'INSURANCE_GL', status: 'CLEAR', expiresAt, verifiedAt })
const wc = (expiresAt: Date | null, verifiedAt: Date | null = on) => ({ type: 'INSURANCE_WC', status: 'CLEAR', expiresAt, verifiedAt })

const verdict = (
  personVerifications: { type: string; status: string; expiresAt: Date | null }[],
  supplierCertificates: ReturnType<typeof gl>[]
) =>
  contractClearance({
    personName: 'Rosa Delgado',
    personVerifications,
    supplierName: 'Brightmoor Staffing',
    supplierCertificates,
    clientName: 'Northbend Athletic',
    on,
    extraHeld: [{ key: 'NDA', expiresAt: null, accepted: true }],
  })

const twoInARow = /\.\s*\./

describe('a verdict never doubles its full stop', () => {
  it('a verdict built from several sentences never shows two periods in a row', () => {
    const cases = [
      verdict([clear('I9_EVERIFY')], []),
      verdict([clear('I9_EVERIFY')], [gl(inDays(-3)), wc(inDays(200))]),
      verdict([clear('I9_EVERIFY')], [gl(inDays(10), null), wc(inDays(200), null)]),
      verdict([], [gl(inDays(-3)), wc(inDays(-3))]),
      verdict([clear('I9_EVERIFY'), clear('BACKGROUND_CHECK', inDays(300))], [gl(inDays(200)), wc(inDays(200))]),
      verdict([clear('I9_EVERIFY'), clear('BACKGROUND_CHECK', inDays(-10))], []),
    ]
    for (const v of cases) {
      expect(v.says, v.says).not.toMatch(twoInARow)
      expect(v.says, v.says).not.toMatch(/\.\s*;|;\s*\./)
    }
  })

  it('a warning built from a clause and a finished sentence reads as whole sentences, each capitalized', () => {
    const said = joinClauses([
      'still waiting on the background check for Rosa Delgado',
      'Brightmoor Staffing: the certificate of insurance ran out on 3 March. Nobody can be submitted through Brightmoor Staffing until it is back in date.',
    ])
    expect(said).toBe(
      'Still waiting on the background check for Rosa Delgado. ' +
        'Brightmoor Staffing: the certificate of insurance ran out on 3 March. Nobody can be submitted through Brightmoor Staffing until it is back in date.'
    )
  })

  it('a warning built only from clauses stays one sentence, joined by semicolons, with one full stop', () => {
    expect(joinClauses(['still waiting on the NDA for Rosa Delgado', 'the W-9 is an old edition.'])).toBe(
      'Still waiting on the NDA for Rosa Delgado; the W-9 is an old edition.'
    )
  })

  it('a finding ending in a company’s own abbreviation does not gain a second stop', () => {
    expect(oneStop('Required by Acme Inc.. The contract can start with a reason recorded.')).toBe(
      'Required by Acme Inc. The contract can start with a reason recorded.'
    )
    expect(oneStop('until it is back in date.; still waiting')).toBe('until it is back in date. still waiting')
  })
})
