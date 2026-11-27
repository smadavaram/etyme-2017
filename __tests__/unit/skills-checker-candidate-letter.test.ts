import { describe, it, expect } from 'vitest'
import { candidateLetterProblems, type CandidateLetterFacts } from '@/lib/skills/checkers/chase-letter'

const sent = new Date('2026-11-20T15:00:00Z')
const fine: CandidateLetterFacts = {
  sentAt: sent, yesAt: new Date('2026-11-01T10:00:00Z'), revokedAt: null, kept: true,
  personEmail: 'Asha@Example.invalid', letterEmail: 'asha@example.invalid', to: ['asha@example.invalid'],
  postal: '12 Mill Road, Leeds, LS1 4AB, GB', stopLink: true, timesSent: 1,
}

describe('the check on a candidate’s update letter', () => {
  it('a letter to a candidate whose yes stood, sent once to her own address with the firm’s postal address and a stop link, has nothing wrong', () => {
    expect(candidateLetterProblems(fine)).toEqual([])
  })
  it('a letter to somebody who had never said yes to updates is wrong', () => {
    expect(candidateLetterProblems({ ...fine, yesAt: null })).toEqual(['she had not said yes to updates when it was sent'])
  })
  it('a yes given only after the letter left does not cover the letter', () => {
    expect(candidateLetterProblems({ ...fine, yesAt: new Date('2026-11-21T00:00:00Z') })).toEqual(['she had not said yes to updates when it was sent'])
  })
  it('a letter sent after she took her yes back is wrong', () => {
    const out = candidateLetterProblems({ ...fine, revokedAt: new Date('2026-11-10T00:00:00Z') })
    expect(out).toEqual(['she had taken her yes to updates back when it was sent'])
  })
  it('her taking the yes back after the letter left does not make the letter wrong', () => {
    expect(candidateLetterProblems({ ...fine, revokedAt: new Date('2026-11-25T00:00:00Z') })).toEqual([])
  })
  it('a letter from a firm that no longer keeps her is wrong', () => {
    expect(candidateLetterProblems({ ...fine, kept: false })).toEqual(['the firm does not keep her any more'])
  })
  it('a letter to an address that is not on her own record, or to two addresses, is wrong', () => {
    expect(candidateLetterProblems({ ...fine, personEmail: 'new@example.invalid' })).toHaveLength(1)
    expect(candidateLetterProblems({ ...fine, to: ['asha@example.invalid', 'boss@example.invalid'] })).toHaveLength(1)
  })
  it('a letter from a firm with no postal address on record is wrong, because it could not say who sends it and where', () => {
    expect(candidateLetterProblems({ ...fine, postal: null })[0]).toMatch(/no postal address/)
  })
  it('a letter that had no link to stop updates is wrong', () => {
    expect(candidateLetterProblems({ ...fine, stopLink: false })[0]).toMatch(/ends updates/)
  })
  it('the same letter leaving twice is wrong, because an update letter goes once', () => {
    expect(candidateLetterProblems({ ...fine, timesSent: 2 })[0]).toMatch(/more than once/)
  })
  it('the letter to a candidate is never asked for the company contact’s “interested” or opt-out rules, which are the selling letter’s', () => {
    // The facts a candidate's letter is read against hold no contact, no interest and no company opt-out at all.
    expect(Object.keys(fine).sort()).toEqual(['kept', 'letterEmail', 'personEmail', 'postal', 'revokedAt', 'sentAt', 'stopLink', 'timesSent', 'to', 'yesAt'])
  })
})
