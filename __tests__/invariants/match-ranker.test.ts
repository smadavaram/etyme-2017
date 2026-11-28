import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { cardDue, cardProof, cardQuestion, topFactors } from '@/lib/agents/match-ranker'

describe('the match ranker’s card', () => {
  it('the card says how many people match the job in the trade’s words', () => {
    expect(cardQuestion(3, 'Java lead')).toBe('3 people match Java lead')
    expect(cardQuestion(1, 'Java lead')).toBe('1 person matches Java lead')
  })
  it('the strongest factors of a match are named heaviest first, at most three', () => {
    const factors = [
      { label: 'Skills', value: 90, weight: 50 }, { label: 'Rate', value: 100, weight: 10 },
      { label: 'Place', value: 40, weight: 20 }, { label: 'Availability', value: 100, weight: 30 },
    ]
    expect(topFactors({ factors })).toEqual(['Skills', 'Availability', 'Place'])
  })
  it('the proof says rules only when the model did not run, and says nobody was submitted', () => {
    const proof = cardProof({ requirementId: 'r1', title: 'Java lead', scoredBy: 'RULES', basis: 'Looked at 4 people.', total: 1, rows: [{ name: 'Bea Bench', score: 82, confidence: 'HIGH', unknowns: null, topFactors: ['Skills'] }] })
    expect(proof).toContain('Scored by rules only. The model did not run.')
    expect(proof).toContain('1. Bea Bench: 82 of 100, high confidence. Strongest: Skills.')
    expect(proof).toContain('Nobody has been submitted. Consent comes first')
    expect(proof).toContain('/dashboard/requirements/r1')
  })
  it('the proof says the model ran, masked, only when it did', () => {
    const proof = cardProof({ requirementId: 'r1', title: 'x', scoredBy: 'MODEL', basis: 'b', total: 0, rows: [] })
    expect(proof).toContain('Scored by the model, masked, after the rules.')
  })
  it('a person the firm may only ask to add is never named on the card, and what is not known is said', () => {
    const proof = cardProof({ requirementId: 'r1', title: 'x', scoredBy: 'RULES', basis: 'b', total: 1, rows: [{ name: null, score: 60, confidence: 'LOW', unknowns: 'rate floor', topFactors: [] }] })
    expect(proof).toContain('A person the firm may ask to add: 60 of 100, low confidence. Not known: rate floor')
  })
  it('only five people are named and the rest are counted as on the job’s page', () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({ name: `P${i}`, score: 50, confidence: 'LOW', unknowns: null, topFactors: [] }))
    const proof = cardProof({ requirementId: 'r1', title: 'x', scoredBy: 'RULES', basis: 'b', total: 7, rows })
    expect(proof).toContain('5. P4')
    expect(proof).not.toContain('6. P5')
    expect(proof).toContain('2 more are on the job’s page.')
  })
  it('a card is opened when none exists, not while one is open, and not again for a count already decided', () => {
    expect(cardDue(null, 'q')).toBe(true)
    expect(cardDue({ state: 'OPEN', question: 'older' }, 'q')).toBe(false)
    expect(cardDue({ state: 'APPROVED', question: 'q' }, 'q')).toBe(false)
    expect(cardDue({ state: 'REJECTED', question: '2 people match x' }, '3 people match x')).toBe(true)
  })
  it('the ranker submits nobody and sends nothing: it imports no submission writer and no mail door', () => {
    const src = readFileSync('src/lib/agents/match-ranker.ts', 'utf8')
    expect(src).not.toMatch(/submission\.(create|update)|mail-door|sendMail|benchListing\.(create|update)/)
    expect(src).toContain('runMatchEngine')
  })
})
