import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BUILT_IN } from '@/lib/document-type'
import { mayExamine } from '@/lib/document-request'
import { RECORDABLE_ABOUT_A_FIRM, checkInputFrom, checkToRecord, examinedFromAPacket } from '@/lib/attestation'
import { examineBody, examineFields, examineNeedsOf, type ExamineValues } from '@/lib/document-stages/examine-form'
import { examinationBody } from '@/app/api/packets/examination'
import { recordI9Body, recordVerdictBody } from '@/app/dashboard/compliance/record-bodies'

/**
 * Every question a route asks, its screen has a field for.
 *
 * The founder's walker, 2026-11-01: the I-9 on Document requests offered
 * the day it runs out and the edition, Accept was refused with "Say which
 * document Rajesh Iyer showed, and when it runs out", and no field on any
 * screen could answer it, so the start stayed held and no week or bill
 * followed. A test of the rule alone passed, and a test of the screen
 * alone passed; what broke was the join. So this fills in every field
 * each screen draws, posts exactly what that screen posts, and runs the
 * route's own rules on it: a refusal that names a missing field the
 * screen never offered fails here.
 */

const ON = new Date('2026-11-02T12:00:00Z')

/** A plausible answer for every field a dialog can draw. */
const TYPED = (key: string): ExamineValues => ({
  validFrom: '2026-10-15',
  expiresAt: '2027-10-15',
  edition: key === 'I9_EVERIFY' ? '01/20/25' : 'Rev. March 2024',
  issuer: 'Oregon State Board of Nursing',
  licenseNumber: 'RN-448812',
  shownType: 'PASSPORT',
  shownNumber: 'X1234567',
  shownIssuer: 'U.S. Department of State',
  shownExpiresAt: '2030-04-30',
})

/** Only what the dialog draws is typed; everything else stays empty, as on the screen. */
function typedOnScreen(key: string, aboutAFirm: boolean) {
  const needs = examineNeedsOf(key, aboutAFirm)
  const all = TYPED(key)
  const v: ExamineValues = {}
  for (const f of examineFields(needs)) v[f] = all[f]
  return { needs, body: examineBody(needs, v) }
}

const date = (x: unknown) => (typeof x === 'string' && x ? new Date(x) : null)

describe('every question a route asks, its screen has a field for', () => {
  for (const t of BUILT_IN) {
    for (const aboutAFirm of [false, true]) {
      const who = aboutAFirm ? 'a firm' : 'a person'
      it(`accepting the ${t.label} about ${who} with every field the dialog draws filled in is not refused for a field the dialog did not draw`, () => {
        const { body } = typedOnScreen(t.key, aboutAFirm)

        // The paper's own examination (lib/document-request).
        const seen = mayExamine(
          {
            status: 'UPLOADED', templateName: t.label, needsSignature: t.signedBy !== 'NOBODY', issuerName: 'Brightmoor Staffing',
            senderName: aboutAFirm ? 'Tapin' : 'Ravi Kumar',
            type: { key: t.key, label: t.label, validityShape: t.validityShape, signedBy: t.signedBy, reissued: t.reissued },
          },
          { staffOfIssuer: true, isSender: false, examinerName: 'Petra Kalnins' },
          { verdict: 'ACCEPT', validFrom: date(body.validFrom), expiresAt: date(body.expiresAt), edition: (body.edition as string) ?? null },
          ON
        )
        expect(seen.ok, `${t.key}: ${!seen.ok ? `${seen.field}: ${seen.message}` : ''}`).toBe(true)

        // What the review records from it: a person's paper the record reads,
        // or a supplier's certificate onto its standing.
        const records = aboutAFirm ? (RECORDABLE_ABOUT_A_FIRM as readonly string[]).includes(t.key) : examinedFromAPacket(t.key)
        if (!records) return
        const read = checkInputFrom(examinationBody(body), {
          about: aboutAFirm ? 'FIRM' : 'PERSON', type: t.key, subjectName: aboutAFirm ? 'Tapin' : 'Ravi Kumar', recordedBy: 'Petra Kalnins',
        })
        expect(read.ok, `${t.key}: ${!read.ok ? read.message : ''}`).toBe(true)
        if (!read.ok) return
        const recorded = checkToRecord(read.input, ON)
        expect(recorded.ok, `${t.key}: ${!recorded.ok ? `${recorded.field}: ${recorded.message}` : ''}`).toBe(true)
      })
    }
  }

  it('the I-9 dialog asks for the document shown, its number, who issued it and the day it runs out, and no end of the form’s own', () => {
    const needs = examineNeedsOf('I9_EVERIFY', false)
    expect(examineFields(needs)).toEqual(['edition', 'shownType', 'shownNumber', 'shownIssuer', 'shownExpiresAt'])
  })

  it('a license accepted from a request carries its number and its board, filled from what the worker sent', () => {
    const needs = examineNeedsOf('PROFESSIONAL_LICENSE', false)
    expect(examineFields(needs)).toEqual(['expiresAt', 'licenseNumber', 'issuer'])
  })

  it('the I-9 recorded on the Compliance page, with every field filled in, is recorded', () => {
    const body = recordI9Body('line-1', { edition: '01/20/25', doc: 'PASSPORT', docNumber: 'X1234567', docIssuer: 'U.S. Department of State', docExpires: '2030-04-30' })
    const read = checkInputFrom(body, { about: 'PERSON', type: 'I9_EVERIFY', subjectName: 'Ravi Kumar', recordedBy: 'Petra Kalnins' })
    expect(read.ok).toBe(true)
    if (read.ok) expect(checkToRecord(read.input, ON).ok).toBe(true)
  })

  it('a screening company’s report recorded on the Compliance page, answered or only ordered, is recorded', () => {
    for (const outcome of ['CLEAR', 'ORDERED']) {
      const body = recordVerdictBody('line-1', { type: 'BACKGROUND_CHECK', provider: 'Sterling', reference: '4471', renderedOn: '2026-11-01', outcome, providerSays: 'Clear. No records found.' })
      const read = checkInputFrom(body, { about: 'PERSON', type: 'BACKGROUND_CHECK', subjectName: 'Ravi Kumar', recordedBy: 'Petra Kalnins' })
      expect(read.ok).toBe(true)
      if (read.ok) {
        const v = checkToRecord(read.input, ON)
        expect(v.ok, `${outcome}: ${!v.ok ? v.message : ''}`).toBe(true)
      }
    }
  })
})

describe('every field a rule can ask for is answered by a field on a screen, or named here as not', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
  const attestation = read('src/lib/attestation.ts')
  const record = attestation.slice(attestation.indexOf('export function checkToRecord('), attestation.indexOf('\nfunction possessiveOf'))
  const requestLib = read('src/lib/document-request.ts')
  const examine = requestLib.slice(requestLib.indexOf('export function mayExamine('), requestLib.indexOf('\n}\n', requestLib.indexOf('export function mayExamine(')))
  const asked = new Set([
    ...[...record.matchAll(/,\s*'(\w+)'\s*\)/g)].map((m) => m[1]),
    ...[...examine.matchAll(/field: '(\w+)'/g)].map((m) => m[1]),
  ])

  /** Which screen field answers each question, by the name the body carries. */
  const ANSWERED_BY: Record<string, string> = {
    expiresAt: 'the day it runs out (examine dialog; Record the I-9 for the document behind it)',
    validFrom: 'the day it starts (examine dialog)',
    edition: 'the edition (examine dialog)',
    formEdition: 'the edition (Record the I-9; the examine dialog’s edition, read as formEdition by the route)',
    evidence: 'the document shown, its number, who issued it and the day it runs out (examine dialog and Record the I-9)',
    issuer: 'who issued it (examine dialog, for a license or a firm’s certificate)',
    licenseNumber: 'the license number (examine dialog)',
    reason: 'why it goes back (examine dialog)',
    provider: 'the screening company (Record a screening company’s report)',
    reference: 'their reference (Record a screening company’s report)',
    renderedOn: 'the day they reported (Record a screening company’s report)',
    outcome: 'their answer (Record a screening company’s report)',
    providerSays: 'their words (Record a screening company’s report)',
  }
  /** Asked by a rule, set by the screen itself rather than typed: no field is owed. */
  const SET_BY_THE_SCREEN: Record<string, string> = {
    verdict: 'Accept it or Send it back, the two buttons',
    type: 'which check, fixed by the form that was opened or the paper being examined',
  }

  it('every field the record and the examination can refuse for is answered by a field on a screen or set by the screen', () => {
    const unanswered = [...asked].filter((f) => !(f in ANSWERED_BY) && !(f in SET_BY_THE_SCREEN))
    expect(unanswered, `asked by a rule and offered by no screen: ${unanswered.join(', ')}`).toEqual([])
  })

  it('the dialog and the Compliance page post the names those answers stand for', () => {
    const form = read('src/lib/document-stages/examine-form.ts')
    for (const k of ['validFrom', 'expiresAt', 'edition', 'issuer', 'licenseNumber']) expect(form).toContain(`'${k}'`)
    expect(form).toContain('evidence: [{')
    const bodies = read('src/app/dashboard/compliance/record-bodies.ts')
    for (const k of ['formEdition', 'evidence', 'provider', 'reference', 'renderedOn', 'outcome', 'providerSays']) expect(bodies).toContain(k)
    expect(read('src/app/dashboard/documents/examine.tsx')).toContain('examineBody(needs, v)')
    expect(read('src/app/dashboard/compliance/record-check.tsx')).toContain('recordI9Body(')
  })
})
