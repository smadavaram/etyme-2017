import { describe, it, expect } from 'vitest'
import { checkToRecord } from '@/lib/attestation'
import { editionAsPrinted, PUBLISHED_EDITIONS } from '@/lib/document-stages/editions'
import { PUBLISHED_EDITIONS as FROM_CLEARANCE } from '@/lib/contract-clearance'

/**
 * The founder's document walk, 2026-11-01: an I-9's edition is read the
 * way the issuer prints it. "Rev. 01/20/25" is the 01/20/25 edition;
 * "Rev. March 2024" is no edition USCIS ever printed on an I-9, and an
 * I-9 recorded on it must not read as current.
 */

const ON = new Date('2026-11-01T15:00:00Z')
const passport = { type: 'PASSPORT', issuer: 'U.S. Department of State', expiresAt: new Date('2030-04-30T00:00:00Z') }
const record = (formEdition: string) =>
  checkToRecord({ about: 'PERSON', type: 'I9_EVERIFY', subjectName: 'Ravi Kumar', recordedBy: 'Dana Whitfield', formEdition, evidence: [passport] }, ON)

describe('an I-9 edition, read the way the issuer prints it', () => {
  it('an I-9 on the current edition is recorded on that edition', () => {
    const v = record('01/20/25')
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.row.formEdition).toBe('01/20/25')
  })

  it('an edition typed with "Rev." or a four-digit year is the same edition, kept as the issuer prints it', () => {
    for (const typed of ['Rev. 01/20/25', 'Edition 1/20/2025', '01/20/2025']) {
      const v = record(typed)
      expect(v.ok, typed).toBe(true)
      if (v.ok) expect(v.row.formEdition, typed).toBe('01/20/25')
    }
  })

  it('an edition the issuer never printed is refused, in a sentence that names the editions it did print', () => {
    const v = record('Rev. March 2024')
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.code).toBe('NOT_AN_EDITION')
      expect(v.message).toContain('“Rev. March 2024” is not an edition of the I-9')
      expect(v.message).toContain('USCIS has printed 10/21/19, 08/01/23 and 01/20/25')
    }
  })

  it('a form the issuer list does not cover is taken as typed, so a W-9’s "Rev. March 2024" is not judged by the I-9’s list', () => {
    expect(editionAsPrinted('W9', 'Rev. March 2024')).toEqual({ ok: true, edition: 'Rev. March 2024' })
  })

  it('the start check and the door that records an I-9 read one list of editions', () => {
    expect(FROM_CLEARANCE).toBe(PUBLISHED_EDITIONS)
  })
})
