import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { editionReadFrom, editionToRecord } from '@/lib/document-stages/editions'
import { I9_SHOWN, acceptWaitsOn, examineBody, examineNeedsOf, shownById, typedDay } from '@/lib/document-stages/examine-form'
import { recordI9Body } from '@/app/dashboard/compliance/record-bodies'
import { checkInputFrom, checkToRecord } from '@/lib/attestation'
import { textOfUpload } from '@/lib/setup-fill'

/**
 * The I-9 dialog, after the founder's tester on production, 2026-11-03:
 * it filled and accepted edition 01/20/25 for a paper printed "Rev. March
 * 2024", a passport card was not on the list, the expiry was typed in
 * three segments, and Accept sat disabled with nothing saying why.
 */

const ON = new Date('2026-11-03T12:00:00Z')
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

/** The smallest PDF a text layer can be read from: one line of shown text. */
function pdfSaying(line: string): Buffer {
  return Buffer.from(`%PDF-1.4\n1 0 obj << /Length 44 >>\nstream\nBT /F1 9 Tf (${line}) Tj ET\nendstream\nendobj\n%%EOF`, 'latin1')
}

describe('the I-9 dialog never fills the edition for HR', () => {
  it('the I-9 dialog never fills the edition for HR; it reads it from the paper or leaves it to be typed', () => {
    const fromPaper = editionReadFrom(textOfUpload(pdfSaying('Form I-9 Edition 01/20/25 Page 1 of 4'), 'application/pdf', 'i9.pdf'))
    expect(fromPaper).toEqual({ edition: '01/20/25', quote: 'Form I-9 Edition 01/20/25 Page 1 of 4' })
    expect(editionReadFrom('A scanned page has no words')).toBeNull()
    expect(editionReadFrom('')).toBeNull()
    // Neither screen types an edition in for HR.
    expect(read('src/app/dashboard/compliance/record-check.tsx')).not.toContain("useState('01/20/25')")
    expect(read('src/app/dashboard/documents/examine.tsx')).not.toContain("'01/20/25'")
    expect(read('src/app/dashboard/compliance/record-check.tsx')).toContain("const [edition, setEdition] = useState('')")
  })

  it('an edition the paper prints that the issuer never printed on an I-9 is read as printed and refused in its sentence', () => {
    const r = editionReadFrom('Form W-9 (Rev. March 2024) Request for Taxpayer Identification Number')
    expect(r?.edition).toBe('Rev. March 2024')
    const recorded = editionToRecord('I9_EVERIFY', r!.edition, ON)
    expect(recorded.ok).toBe(false)
    if (!recorded.ok) expect(recorded.message).toMatch(/is not an edition of the I-9/)
  })

  it('the edition is read through the file’s own door, so the read is in the trail like any other', () => {
    const route = read('src/app/api/documents/[id]/file/route.ts')
    expect(route).toContain("searchParams.get('read') === 'edition'")
    expect(route.indexOf("searchParams.get('read') === 'edition'")).toBeGreaterThan(route.indexOf('await recordAccess('))
  })
})

describe('the documents an I-9 is completed from', () => {
  it('a passport card is a document the I-9 dialog offers', () => {
    const card = I9_SHOWN.find((d) => d.id === 'US_PASSPORT_CARD')
    expect(card).toMatchObject({ key: 'PASSPORT', list: 'A', issuer: 'U.S. Department of State' })
    const body = recordI9Body('line-1', { edition: '01/20/25', doc: 'US_PASSPORT_CARD', docNumber: 'C03004786', docIssuer: card!.issuer, docExpires: '04/30/2031' })
    expect((body.evidence as { type: string; expiresAt: string }[])[0]).toMatchObject({ type: 'PASSPORT', expiresAt: '2031-04-30' })
    const input = checkInputFrom(body, { about: 'PERSON', type: 'I9_EVERIFY', subjectName: 'Rajesh Iyer', recordedBy: 'Petra Kalnins' })
    expect(input.ok).toBe(true)
    if (input.ok) expect(checkToRecord(input.input, ON).ok).toBe(true)
  })

  it('every document on the list is kept as a record the I-9 can stand on, each told apart on the screen', () => {
    expect(new Set(I9_SHOWN.map((d) => d.id)).size).toBe(I9_SHOWN.length)
    for (const d of I9_SHOWN) expect(['PASSPORT', 'GREEN_CARD', 'VISA', 'DRIVERS_LICENSE', 'RIGHT_TO_WORK', 'WORK_PERMIT']).toContain(d.key)
    expect(I9_SHOWN.some((d) => d.list === 'B') && I9_SHOWN.some((d) => d.list === 'C')).toBe(true)
    // A screen that posted the record's key before the list had ids is still read.
    expect(shownById('GREEN_CARD').key).toBe('GREEN_CARD')
  })
})

describe('typing a day', () => {
  it('an expiry is typed into one box as printed, and read as the record reads it', () => {
    expect(typedDay('04/30/2031')).toBe('2031-04-30')
    expect(typedDay('4/30/31')).toBe('2031-04-30')
    expect(typedDay('2031-04-30')).toBe('2031-04-30')
    expect(typedDay('02/30/2031')).toBeNull()
    expect(typedDay('soon')).toBeNull()
    const needs = examineNeedsOf('I9_EVERIFY', false)
    const body = examineBody(needs, { edition: '01/20/25', shownType: 'PASSPORT', shownNumber: 'X1', shownIssuer: 'U.S. Department of State', shownExpiresAt: '04/30/2031' })
    expect((body.evidence as { expiresAt: string }[])[0].expiresAt).toBe('2031-04-30')
    for (const f of ['examine.tsx']) expect(read(`src/app/dashboard/documents/${f}`)).not.toContain('type="date"')
  })
})

describe('a button that cannot be pressed says why', () => {
  it('a disabled Accept says which field is missing', () => {
    const needs = examineNeedsOf('I9_EVERIFY', false)
    expect(acceptWaitsOn(needs, { shownType: 'PASSPORT', shownIssuer: 'U.S. Department of State' })?.says).toBe('Fill in the edition printed on the form to accept.')
    expect(acceptWaitsOn(needs, { edition: '01/20/25', shownType: 'PASSPORT', shownIssuer: 'U.S. Department of State' })?.says).toBe('Fill in the number on the document shown to accept.')
    expect(acceptWaitsOn(needs, { edition: '01/20/25', shownType: 'PASSPORT', shownNumber: 'X1', shownIssuer: 'U.S. Department of State', shownExpiresAt: '30th' })?.says)
      .toBe('Type the day the document shown runs out as a date, like 04/30/2030.')
    expect(acceptWaitsOn(needs, { edition: '01/20/25', shownType: 'PASSPORT', shownNumber: 'X1', shownIssuer: 'U.S. Department of State', shownExpiresAt: '04/30/2031' })).toBeNull()
    expect(read('src/app/dashboard/documents/examine.tsx')).toContain('disabled={busy || !!waits}')
    expect(read('src/app/dashboard/compliance/record-check.tsx')).toContain('disabled={busy || !!waits}')
  })
})
