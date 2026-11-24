import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  cardFor, askIsDue, askCard, readyCard, rateWords, namedForCards, RATE_NOT_ON_RECORD,
} from '@/lib/agents/consent-ask'

const job = { id: 'job1', title: 'Java lead' }
const day = 86_400_000
const now = new Date('2026-11-24T12:00:00Z')

describe('consent before a submission: which card a ranked person gets', () => {
  it('a named person from a supplier the client trades with gets an ask card and nothing else', () => {
    expect(cardFor({ kind: 'ASK' }, 'Bea Bench')).toBe('ASK')
  })
  it('a firm that is not a supplier never gets an ask card, only the existing ask to add this firm', () => {
    expect(cardFor({ kind: 'ASK_TO_ADD' }, 'Bea Bench')).toBeNull()
  })
  it('a person whose name the firm has not been given gets no card at all', () => {
    expect(cardFor({ kind: 'ASK' }, null)).toBeNull()
    expect(cardFor({ kind: 'SUBMIT' }, null)).toBeNull()
  })
  it('a person the firm may put forward gets a ready-to-put-forward card', () => {
    expect(cardFor({ kind: 'SUBMIT' }, 'Bea Bench')).toBe('READY')
  })
  it('a person nobody may ask or put forward gets no card', () => {
    expect(cardFor({ kind: 'NONE' }, 'Bea Bench')).toBeNull()
  })
  it('no more than five people on one job get a card in one run', () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({ personId: `p${i}` }))
    expect(namedForCards(rows).map((r) => r.personId)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4'])
  })
})

describe('consent before a submission: the ask is made once', () => {
  it('a person never asked is due an ask card', () => {
    expect(askIsDue(null, now)).toBe(true)
  })
  it('a person asked in the last three days gets no ask card', () => {
    expect(askIsDue(new Date(now.getTime() - 2 * day), now)).toBe(false)
  })
  it('a person asked more than three days ago may be asked about again', () => {
    expect(askIsDue(new Date(now.getTime() - 4 * day), now)).toBe(true)
  })
})

describe('consent before a submission: the words on the cards', () => {
  it('the ask card says a yes sends nothing and that a person presses Ask on the job page', () => {
    const c = askCard({ person: 'Bea Bench', firm: 'Acme Staff', job })
    expect(c.question).toBe('Ask Acme Staff about Bea Bench for Java lead?')
    expect(c.proof).toContain('A yes here sends nothing')
    expect(c.proof).toContain('/dashboard/requirements/job1')
    expect(c.proof).toContain('presses Ask')
  })
  it('the card shows the listing’s rate word for word and says the rate is not on record where there is none', () => {
    expect(rateWords(8000, 9500)).toBe('The listing says 80.00 to 95.00 an hour.')
    expect(rateWords(8000, 8000)).toBe('The listing says 80.00 an hour.')
    expect(rateWords(null, null)).toBe(RATE_NOT_ON_RECORD)
    expect(RATE_NOT_ON_RECORD).toBe('The rate is not on record. You type it.')
    const none = readyCard({ person: 'Bea Bench', job, employee: false, rateMin: null, rateMax: null })
    expect(none.proof).toContain(RATE_NOT_ON_RECORD)
    expect(none.proof).not.toMatch(/\d+\.\d\d/)
  })
  it('a person with a live granted listing gets a card that says consent is on record and a person puts them forward', () => {
    const c = readyCard({ person: 'Bea Bench', job, employee: false, rateMin: 8000, rateMax: 9500 })
    expect(c.question).toBe('Bea Bench can be put forward for Java lead')
    expect(c.proof).toContain('granted a bench listing')
    expect(c.proof).toContain('A yes here submits nobody')
    expect(c.proof).toContain('/dashboard/requirements/job1')
  })
  it('the firm’s own employee is ready with no listing, because the employment is the consent', () => {
    const c = readyCard({ person: 'Eli Employee', job, employee: true, rateMin: null, rateMax: null })
    expect(c.proof).toContain('your own employee')
    expect(c.proof).toContain('employment is the consent')
    expect(c.proof).not.toContain('granted a bench listing')
  })
  it('the card never says the submission kind', () => {
    const all = [
      askCard({ person: 'A', firm: 'F', job }),
      readyCard({ person: 'A', job, employee: false, rateMin: 1, rateMax: 2 }),
      readyCard({ person: 'A', job, employee: true, rateMin: null, rateMax: null }),
    ].map((c) => `${c.question} ${c.proof}`).join(' ')
    expect(all).not.toMatch(/INTERNAL|OWN_BENCH|FROM_SUPPLIER|\bkind\b/i)
  })
})

describe('consent before a submission: the agent decides about nobody', () => {
  const ranker = readFileSync('src/lib/agents/match-ranker.ts', 'utf8')
  const lib = readFileSync('src/lib/agents/consent-ask.ts', 'utf8')
  it('the agent never calls the submissions route or the ask route and writes no submission, message or listing', () => {
    for (const src of [ranker, lib]) {
      expect(src).not.toMatch(/api\/submissions|matches\/ask\/route|submission\.(create|update)|message\.create|benchListing\.(create|update)|mail-door|proposeTask/)
    }
  })
  it('the cards are opened once through the one open-once helper, never as an agent task', () => {
    expect(ranker).toContain('openOnce(')
    expect(ranker).not.toMatch(/agentTask\.create/)
  })
  it('the ask card reads the same rule the ask route reads, never a copy of it', () => {
    expect(ranker).toContain('actionFor(')
    expect(ranker).toContain('lastAsk(')
  })
})
