import { describe, it, expect } from 'vitest'
import { urgencyOf, valueOf, confidenceOf, scoreOf, inOrder, medianAmount, daysToDue, OPEN_LIMIT_DAYS, type Scorable } from '@/lib/notify/one-card/score'
import { dueCount, lateCount, onTimePct, agentLoadPct, touchSeconds, barWords } from '@/lib/notify/one-card/score-bar'
import { MAX_CARD_WORDS, cardWordCount, fitCard, readsAsSentence, tagOf, hoursFigure, moneyFigure } from '@/lib/notify/one-card/wording'

const NOW = new Date('2026-11-26T15:00:00Z')
const card = (o: Partial<Scorable> = {}): Scorable => ({ key: 'a', dueOn: null, openedOn: null, amount: null, confidence: null, ...o })

describe('The queue is ordered by urgency times value times confidence', () => {
  it('a card past its due date has an urgency of 2', () => {
    expect(urgencyOf(card({ dueOn: '2026-11-24' }), NOW)).toBe(2)
  })
  it('a card due today or tomorrow has an urgency of 1', () => {
    expect(urgencyOf(card({ dueOn: '2026-11-26' }), NOW)).toBe(1)
    expect(urgencyOf(card({ dueOn: '2026-11-27' }), NOW)).toBe(1)
  })
  it('a card due in four days has an urgency of one quarter', () => {
    expect(urgencyOf(card({ dueOn: '2026-11-30' }), NOW)).toBe(0.25)
  })
  it('a row with no due date takes its urgency from the days it has been open', () => {
    const fresh = urgencyOf(card({ openedOn: '2026-11-26' }), NOW)
    const old = urgencyOf(card({ openedOn: '2026-11-20' }), NOW)
    const overdue = urgencyOf(card({ openedOn: '2026-11-10' }), NOW)
    expect(fresh).toBeLessThan(old)
    expect(old).toBe(1)
    expect(overdue).toBe(2)
    expect(daysToDue(card({ openedOn: '2026-11-26' }), NOW)).toBe(OPEN_LIMIT_DAYS)
  })
  it('a row with neither a due date nor an opening day reads an urgency of 1, not a guess', () => {
    expect(urgencyOf(card(), NOW)).toBe(1)
  })
  it('value is the money at stake over the role median', () => {
    expect(valueOf(card({ amount: 6400 }), 3200)).toBe(2)
  })
  it('value reads 1 until the money or the median is known', () => {
    expect(valueOf(card({ amount: null }), 3200)).toBe(1)
    expect(valueOf(card({ amount: 6400 }), null)).toBe(1)
    expect(valueOf(card({ amount: 0 }), 3200)).toBe(1)
  })
  it('the median is taken only over the cards that state an amount', () => {
    expect(medianAmount([null, 100, 300, null, 200])).toBe(200)
    expect(medianAmount([null, null])).toBeNull()
    expect(medianAmount([100, 300])).toBe(200)
  })
  it('confidence reads 1 until a skill checker has graded it', () => {
    expect(confidenceOf(card({ confidence: null }))).toBe(1)
    expect(confidenceOf(card({ confidence: 0.9 }))).toBe(0.9)
    expect(confidenceOf(card({ confidence: 1.7 }))).toBe(1)
  })
  it('the score is urgency times value times confidence', () => {
    expect(scoreOf(card({ dueOn: '2026-11-20', amount: 400, confidence: 0.5 }), 200, NOW)).toBe(2 * 2 * 0.5)
  })
  it('the card in focus is the highest score', () => {
    const q = [card({ key: 'quiet', dueOn: '2026-12-10' }), card({ key: 'late', dueOn: '2026-11-20' }), card({ key: 'today', dueOn: '2026-11-26' })]
    expect(inOrder(q, NOW).map((c) => c.key)).toEqual(['late', 'today', 'quiet'])
  })
  it('a tie goes to the card open longest, then to its key, so the order never flickers', () => {
    const q = [card({ key: 'b', openedOn: '2026-11-25' }), card({ key: 'a', openedOn: '2026-11-25' }), card({ key: 'c', openedOn: '2026-11-20' })]
    expect(inOrder(q, NOW).map((c) => c.key)).toEqual(['c', 'a', 'b'])
  })
})

describe('The score bar reads Due, Late and On time from the record', () => {
  const cards = [card({ dueOn: '2026-11-26' }), card({ dueOn: '2026-11-26' }), card({ dueOn: '2026-11-20' }), card({ dueOn: '2026-12-05' })]
  it('Due counts the cards owed today', () => { expect(dueCount(cards, NOW)).toBe(2) })
  it('Late counts the cards past due', () => { expect(lateCount(cards, NOW)).toBe(1) })
  it('a row with no due date is never counted Due or Late on the score bar', () => {
    const undated = [card({ dueOn: null, openedOn: '2026-11-19' }), card({ dueOn: null, openedOn: '2026-11-01' })]
    expect(dueCount(undated, NOW)).toBe(0)
    expect(lateCount(undated, NOW)).toBe(0)
  })
  it('On time is done on time over done, as a whole percent', () => {
    expect(onTimePct([
      { dueOn: '2026-11-26', doneAt: '2026-11-26T09:00:00Z' },
      { dueOn: '2026-11-25', doneAt: '2026-11-26T09:00:00Z' },
      { dueOn: '2026-11-27', doneAt: '2026-11-26T09:00:00Z' },
    ])).toBe(67)
  })
  it('On time reads a dash where nothing done had a due date, never 100', () => {
    expect(onTimePct([{ dueOn: null, doneAt: '2026-11-26T09:00:00Z' }])).toBeNull()
    expect(onTimePct([])).toBeNull()
    expect(barWords(null, '%')).toBe('–')
    expect(barWords(94, '%')).toBe('94%')
  })
  it('On time is counted only over the done cards that had a due date', () => {
    expect(onTimePct([{ dueOn: null, doneAt: '2026-11-26T09:00:00Z' }, { dueOn: '2026-11-26', doneAt: '2026-11-26T09:00:00Z' }])).toBe(100)
  })
  it('Agent load is agent cards over all cards, and a dash where there are no cards', () => {
    expect(agentLoadPct(3, 12)).toBe(25)
    expect(agentLoadPct(0, 0)).toBeNull()
  })
  it('Touch time is the median seconds from open to Yes, and a dash where nobody has said yes', () => {
    expect(touchSeconds([4, 30, 8])).toBe(8)
    expect(touchSeconds([])).toBeNull()
  })
})

describe('A card is twelve words or fewer and holds no sentence', () => {
  it('a card made of an act, a name, a figure and a tag is counted word by word', () => {
    expect(cardWordCount({ act: 'Pay invoice', name: 'Tecwyn Partners', figure: '$18,400', tag: 'Due today' })).toBe(7)
  })
  it('a long name is cut so the whole card is twelve words or fewer', () => {
    const fit = fitCard({ act: 'Approve timesheet', name: 'A very long question about renewing the supplier agreement for another full year please', figure: '40 h', tag: 'Late 2 d' })
    expect(cardWordCount(fit)).toBeLessThanOrEqual(MAX_CARD_WORDS)
    expect(fit.act).toBe('Approve timesheet')
    expect(fit.figure).toBe('40 h')
  })
  it('a name that ends a sentence loses its full stop', () => {
    expect(fitCard({ act: 'Open', name: 'Helena Marsh.', figure: null, tag: null }).name).toBe('Helena Marsh')
    expect(readsAsSentence('Helena Marsh')).toBe(false)
    expect(readsAsSentence('Pay the bill. Then wait.')).toBe(true)
  })
  it('the tag says Late with the days, Due today, or the days open where there is no due date', () => {
    expect(tagOf({ dueOn: '2026-11-24', openedOn: null }, NOW)).toBe('Late 2 d')
    expect(tagOf({ dueOn: '2026-11-26', openedOn: null }, NOW)).toBe('Due today')
    expect(tagOf({ dueOn: null, openedOn: '2026-11-22' }, NOW)).toBe('Open 4 d')
    expect(tagOf({ dueOn: null, openedOn: null }, NOW)).toBeNull()
  })
  it('the figure is hours or the dollar amount the row itself states, and nothing the row does not say', () => {
    expect(hoursFigure('40 hours · Brightmoor · Nov 15–21')).toBe('40 h')
    expect(hoursFigure('Brightmoor · 40 hours')).toBeNull()
    expect(moneyFigure('Tecwyn · $7,600.00 outstanding · 3 days overdue')).toBe('$7,600.00')
    expect(moneyFigure('Tecwyn · 3 days overdue')).toBeNull()
  })
  it('an amount keeps its own currency sign and a rate is never read as an amount owed', () => {
    expect(moneyFigure('Invoice GTN-MX-2026-0410 · MX$36,000.00 · due in 49 days')).toBe('MX$36,000.00')
    expect(moneyFigure('Invoice LR-NI · £2,880.00 · due in 49 days')).toBe('£2,880.00')
    expect(moneyFigure('HCM lead · from Pinnacle · $128/hr · submitted 6 days ago')).toBeNull()
  })
})
