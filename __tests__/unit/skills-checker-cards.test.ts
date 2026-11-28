import { describe, it, expect } from 'vitest'
import { judgeCards, type FoundCard } from '@/lib/skills/checkers/cards'

const card = (state: string, owner: string): FoundCard => ({ state, ownerPersonId: owner, createdAt: new Date('2026-11-23T12:00:00Z') })

describe('the card checkers’ judgement of the cards found for one link', () => {
  it('no card on the record for the link is a failure, said in a sentence', () => {
    expect(judgeCards([], 'p1', 'the drift in “Payment terms”', 'x')).toMatchObject({ verdict: 'FAIL', reason: 'No card is on the record for the drift in “Payment terms”.' })
  })
  it('two open cards for one link fail, naming how many', () => {
    expect(judgeCards([card('OPEN', 'p1'), card('OPEN', 'p1')], 'p1', 'it', 'x')).toMatchObject({ verdict: 'FAIL', reason: '2 cards are open for it, and there should be one.' })
  })
  it('one open card owed by the seat the owner reader names passes with one unit', () => {
    expect(judgeCards([card('OPEN', 'p1')], 'p1', 'it', 'x')).toMatchObject({ verdict: 'PASS', unitsFound: 1 })
  })
  it('a card owed by another seat than the owner reader names fails', () => {
    expect(judgeCards([card('OPEN', 'p2')], 'p1', 'it', 'x')).toMatchObject({ verdict: 'FAIL' })
  })
  it('a card already decided counts as asked and answered, and still passes', () => {
    expect(judgeCards([card('APPROVED', 'p1')], 'p1', 'it', 'x')).toMatchObject({ verdict: 'PASS', reason: expect.stringContaining('decided') })
  })
  it('where nobody holds a seat to name, the card found is not judged on its owner', () => {
    expect(judgeCards([card('OPEN', 'p2')], null, 'it', 'x')).toMatchObject({ verdict: 'PASS' })
  })
})
