import { describe, it, expect } from 'vitest'
import { owedSentence, sayCheckType, twoPopulations } from '@/app/dashboard/compliance/says'

/**
 * Three things a supplier's own compliance desk said on the walk, and
 * none of them was true in the way it read.
 *
 * Every owed row began a sentence and then started a second one in the
 * middle of it, lowercase. The stat cards counted checks and the banner
 * under them counted documents a line requires, with nothing saying
 * they were different populations — so a compliance officer read "clear
 * rate 100%" over "5 documents are still owed, 2 stop work" and went
 * home. And a federal form appeared on the person's row as "I9
 * Everify", which is a government form with its capitals knocked off.
 */

describe('an owed document reads as one sentence', () => {
  const row = {
    aboutName: null,
    owedByName: 'Brightmoor Staffing',
    toName: 'Nordway Retail',
    asked: 'required by Nordway Retail’s order PO-2026-2JSBR',
  }

  it('says whose it is to produce and which order asked for it, without starting a second sentence lowercase', () => {
    expect(owedSentence(row)).toBe(
      'Brightmoor Staffing’s to produce — required by Nordway Retail’s order PO-2026-2JSBR, ' +
        'on the line billing Nordway Retail.'
    )
    expect(owedSentence(row)).not.toContain('. required')
  })

  it('names the person where the document is about a person rather than a firm', () => {
    expect(owedSentence({ ...row, aboutName: 'Aisha Bello' })).toContain('Aisha Bello’s to produce —')
  })

  it('starts with a capital where nobody is named to produce it', () => {
    expect(owedSentence({ ...row, owedByName: null, aboutName: null })).toBe(
      'Required by Nordway Retail’s order PO-2026-2JSBR, on the line billing Nordway Retail.'
    )
  })

  it('does not lowercase a document name that is spelled with capitals', () => {
    // "I-9 and E-Verify is required on every line" must not become
    // "i-9 and E-Verify".
    const said = owedSentence({ ...row, asked: 'I-9 and E-Verify, required on every line' })
    expect(said).toContain('I-9 and E-Verify')
  })

  it('leaves out the customer where the line names none, rather than trailing a dangling clause', () => {
    expect(owedSentence({ ...row, toName: null })).toBe(
      'Brightmoor Staffing’s to produce — required by Nordway Retail’s order PO-2026-2JSBR.'
    )
  })
})

describe('the page says what each of its numbers counted', () => {
  it('never puts a clear rate over owed documents without saying the two count different things', () => {
    const said = twoPopulations(5, 2, 12, 100)
    expect(said).toContain('5 documents are still owed')
    expect(said).toContain('2 of them stop work')
    expect(said).toContain('12 checks have been recorded')
    expect(said).toContain('100% of them clear')
    expect(said).toContain('The two count different things')
  })

  it('says there is no clear rate to read where nothing has been checked at all', () => {
    const said = twoPopulations(3, 1, 0, null)
    expect(said).toContain('3 documents are still owed')
    expect(said).toContain('no clear rate to read')
    expect(said).not.toContain('%')
  })

  it('says plainly that nothing is outstanding rather than showing a bare zero', () => {
    expect(twoPopulations(0, 0, 12, 100)).toContain('Nothing is outstanding on the lines this firm is paid on')
  })

  it('counts one document in the singular, because a desk reads it as a sentence', () => {
    const said = twoPopulations(1, 1, 1, 100)
    expect(said).toContain('1 document is still owed')
    expect(said).toContain('1 of them stops work')
    expect(said).toContain('1 check has been recorded')
  })
})

describe('a check is named the way the form is named', () => {
  it('reads I-9 and E-Verify, never I9 Everify', () => {
    expect(sayCheckType('I9_EVERIFY')).toBe('I-9 and E-Verify')
  })

  it('keeps the capitals on every shipped form a government or a bank issues', () => {
    expect(sayCheckType('W9')).toBe('W-9')
    expect(sayCheckType('GOOD_STANDING')).toBe('Certificate of good standing')
  })

  it('falls back to the plain words with a capital where nobody has defined the type', () => {
    // A client's own invention, before anybody writes it into a
    // dictionary. Its key back in capitals with underscores is what a
    // hiring manager is asked to act on, which is worse than plain
    // words.
    expect(sayCheckType('FURNACE_SAFETY_INDUCTION')).toBe('Furnace safety induction')
  })
})
