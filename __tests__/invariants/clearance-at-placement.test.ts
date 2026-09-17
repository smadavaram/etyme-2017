import { describe, it, expect } from 'vitest'
import { contractClearance, startPreview, hrNotice, owedBy, whenWords } from '@/lib/contract-clearance'

/**
 * The papers are asked for when somebody is placed.
 *
 * `contractClearance` was called from one place — inside the activate
 * route, at the moment somebody pressed the button — so the first time
 * anybody asked whether a person's paperwork was in order was the moment
 * they tried to start them, and the answer came back as a refusal to
 * whoever pressed the button rather than as work to HR.
 *
 * These are the sentences that keep the two readings identical. A
 * preview that disagrees with the refusal it previews is worse than no
 * preview at all, so the rule under test is that `says` and `fix` are
 * the clearance's own strings, passed through and never rewritten.
 */

const on = new Date('2026-09-10T12:00:00Z')
const inDays = (n: number) => new Date(on.getTime() + n * 86_400_000)

const clear = (type: string, expiresAt: Date | null = null) => ({ type, status: 'CLEAR', expiresAt })
const gl = (expiresAt: Date) => ({ type: 'INSURANCE_GL', status: 'CLEAR', expiresAt, verifiedAt: on })
const wc = (expiresAt: Date) => ({ type: 'INSURANCE_WC', status: 'CLEAR', expiresAt, verifiedAt: on })
const insured = [gl(inDays(200)), wc(inDays(200))]
const signedNda = [{ key: 'NDA', expiresAt: null, accepted: true }]

const preview = (
  personVerifications: { type: string; status: string; expiresAt: Date | null }[],
  extra: Partial<Parameters<typeof startPreview>[0]> = {}
) =>
  startPreview({
    personName: 'Priya Raman',
    personVerifications,
    supplierName: 'CloudEPA',
    supplierCertificates: insured,
    clientName: 'Northbend Athletic',
    on,
    extraHeld: signedNda,
    startDate: inDays(9),
    ...extra,
  })

describe('asking for the papers when somebody is placed', () => {
  it('the papers are asked for when somebody is placed, not when somebody tries to start them', () => {
    // Nine days before the first day, with nothing on file, the desk is
    // already told exactly what activation will refuse on.
    const p = preview([])
    expect(p.daysUntilStart).toBe(9)
    expect(p.outcome).toBe('BLOCK')
    expect(p.askOfPerson.map((a) => a.key)).toContain('I9_EVERIFY')
    expect(p.outstanding).toMatch(/Still needed:/)
  })

  it('the preview HR reads and the refusal activation gives are the same sentences', () => {
    const rows = [clear('BACKGROUND_CHECK', inDays(300))]
    const refusal = contractClearance({
      personName: 'Priya Raman',
      personVerifications: rows,
      supplierName: 'CloudEPA',
      supplierCertificates: insured,
      clientName: 'Northbend Athletic',
      on,
      extraHeld: signedNda,
    })
    const p = preview(rows)
    expect(p.says).toBe(refusal.says)
    expect(p.fix).toBe(refusal.fix)
    expect(p.outcome).toBe(refusal.outcome)
  })

  it('a document already on file is not asked for a second time', () => {
    const p = preview([clear('I9_EVERIFY'), clear('BACKGROUND_CHECK', inDays(300))])
    expect(p.askOfPerson.map((a) => a.key)).not.toContain('I9_EVERIFY')
    expect(p.askOfPerson.map((a) => a.key)).not.toContain('BACKGROUND_CHECK')
  })

  it('a placement with everything on file asks nobody for anything', () => {
    const p = preview([clear('I9_EVERIFY'), clear('BACKGROUND_CHECK', inDays(300))])
    expect(p.outcome).toBe('PASS')
    expect(p.askOfPerson).toEqual([])
    expect(p.outstanding).toBeNull()
  })

  it('the worker is asked for their own papers, and the firm keeps the ones it owes', () => {
    // CLAUDE.md: who owes it decides who is chased. The I-9 is the
    // worker's to complete; the non-disclosure agreement is the firm's
    // to write, and nobody emails a firm a link to ask itself.
    const p = preview([], { extraHeld: [] })
    expect(p.askOfPerson.map((a) => a.key)).toContain('I9_EVERIFY')
    expect(p.askOfFirm.map((a) => a.key)).toContain('NDA')
    expect(p.askOfPerson.map((a) => a.key)).not.toContain('NDA')
  })

  it('what stops a start is marked apart from what only warns, and both are named', () => {
    const p = preview([])
    const weights = Object.fromEntries(p.askOfPerson.map((a) => [a.key, a.weight]))
    expect(weights.I9_EVERIFY).toBe('BLOCK')
    expect(weights.BACKGROUND_CHECK).toBe('WARN')
  })

  it('a licensed role is asked for the license, and an unlicensed one never is', () => {
    const nurse = preview([clear('I9_EVERIFY')], { role: 'Registered Nurse — ICU' })
    expect(nurse.askOfPerson.map((a) => a.key)).toContain('PROFESSIONAL_LICENSE')
    const engineer = preview([clear('I9_EVERIFY')], { role: 'Validation Engineer' })
    expect(engineer.askOfPerson.map((a) => a.key)).not.toContain('PROFESSIONAL_LICENSE')
  })

  it('the firm’s own lapsed cover is named to HR even though it is not the worker’s to fix', () => {
    const p = preview([clear('I9_EVERIFY'), clear('BACKGROUND_CHECK', inDays(300))], {
      supplierCertificates: [gl(inDays(-3)), wc(inDays(200))],
    })
    expect(p.outcome).toBe('BLOCK')
    expect(p.askOfPerson).toEqual([])
    expect(p.coverOutstanding.map((c) => c.key)).toContain('INSURANCE_GL')
    expect(p.outstanding).toMatch(/general liability/i)
  })

  it('a start date nobody has set yet is counted as no days rather than as today', () => {
    const p = preview([], { startDate: null })
    expect(p.daysUntilStart).toBeNull()
    expect(p.headline).not.toMatch(/in \d+ days/)
  })

  it('the row says how long there is before the first day, in words somebody says out loud', () => {
    expect(whenWords(9)).toBe('in 9 days')
    expect(whenWords(1)).toBe('tomorrow')
    expect(whenWords(0)).toBe('today')
    expect(whenWords(-1)).toBe('yesterday')
    expect(whenWords(-4)).toBe('4 days ago')
    expect(whenWords(null)).toBe('')
  })
})

describe('what HR is told', () => {
  it('HR is told a placement needs clearing, and the notice says what is outstanding', () => {
    const p = preview([])
    const notice = hrNotice(p, {
      personName: 'Priya Raman',
      roleTitle: 'Validation Engineer',
      askedOfPerson: ['I-9 and E-Verify', 'Background check'],
    })
    expect(notice).not.toBeNull()
    expect(notice!.title).toContain('Priya Raman')
    expect(notice!.title).toContain('Northbend Athletic')
    expect(notice!.title).toContain('in 9 days')
    expect(notice!.body).toContain(p.says)
    expect(notice!.body).toContain('I-9 and E-Verify')
    expect(notice!.body).toContain('Validation Engineer')
  })

  it('the notice says what to do about it, never a code', () => {
    const notice = hrNotice(preview([]), { personName: 'Priya Raman' })
    expect(notice!.body).toMatch(/on file, then activate|Chase /)
    expect(notice!.body).not.toMatch(/DOCUMENTS_BLOCK|DOCUMENTS_WARN|[A-Z]{4,}_[A-Z]{4,}/)
  })

  it('the notice tells HR which papers are the firm’s own to produce', () => {
    // The I-9 is in, the background check is not, and the agreement the
    // firm writes is not either. HR hears about the placement because of
    // the background check, and the notice separates the two.
    const p = preview([clear('I9_EVERIFY')], { extraHeld: [] })
    const notice = hrNotice(p, { personName: 'Priya Raman' })
    expect(notice!.body).toMatch(/ours to produce/)
    expect(notice!.body).toMatch(/Non-disclosure agreement/i)
  })

  it('an agreement this system has nowhere to record does not warn on every placement for ever', () => {
    // Nothing here has ever recorded a signed non-disclosure agreement,
    // so counting its absence as a warning would fire on a hundred
    // percent of placements — which is a click, not a warning, and it
    // would bury the two that matter. It is listed as the firm's to
    // produce and it does not move the verdict, which is the same line
    // contract-clearance already draws above HOLDABLE.
    const p = preview([clear('I9_EVERIFY'), clear('BACKGROUND_CHECK', inDays(300))], { extraHeld: [] })
    expect(p.outcome).toBe('PASS')
    expect(p.askOfFirm.map((a) => a.key)).toContain('NDA')
    expect(hrNotice(p, { personName: 'Priya Raman' })).toBeNull()
  })

  it('a placement whose paperwork is already in order writes HR no notice at all', () => {
    const p = preview([clear('I9_EVERIFY'), clear('BACKGROUND_CHECK', inDays(300))])
    expect(hrNotice(p, { personName: 'Priya Raman' })).toBeNull()
  })
})

describe('who owes a document', () => {
  it('a regulator issues a license to the person, so the person is the one asked', () => {
    expect(owedBy('PROFESSIONAL_LICENSE')).toBe('PERSON')
    expect(owedBy('I9_EVERIFY')).toBe('PERSON')
    expect(owedBy('PASSPORT')).toBe('PERSON')
  })

  it('a firm produces its own insurance and its own agreements, so the firm is the one asked', () => {
    expect(owedBy('INSURANCE_GL')).toBe('FIRM')
    expect(owedBy('NDA')).toBe('FIRM')
  })

  it('a type nobody has defined is asked of the person, because a document with no owner is theirs to hand over', () => {
    expect(owedBy('SOMETHING_A_CLIENT_INVENTED_ON_TUESDAY')).toBe('PERSON')
  })
})
