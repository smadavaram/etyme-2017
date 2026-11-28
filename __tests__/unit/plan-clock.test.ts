import { describe, it, expect } from 'vitest'
import { planLineFor, planCardFor, withPlanCard, hearsTheClock, PLAN_CLOCK, PLAN_HREF } from '@/app/api/conversations/twin/plan-clock'
import { queueCards, queueName, type QueueRead } from '@/app/api/conversations/twin/ask'
import type { TrialState } from '@/lib/money/pricing'

const trial = (day: number): TrialState => ({ state: 'TRIAL', day, daysLeft: 60 - day })
const words = (s: string) => s.trim().split(/\s+/).length

describe('the Owner hears the clock of the free 60 days', () => {
  it('the greeting says nothing before day 50', () => {
    expect(planLineFor(trial(1))).toBeNull()
    expect(planLineFor(trial(49))).toBeNull()
  })
  it('on day 50 the greeting counts ten days left and links to Settings', () => {
    const l = planLineFor(trial(50))!
    expect(l.says).toBe('Your free 60 days end in ten days. Choose a plan in Settings before then.')
    expect(l.links).toEqual([{ text: 'Settings', href: PLAN_HREF }])
  })
  it('on day 59 the greeting says the free days end tomorrow', () => {
    expect(planLineFor(trial(59))!.says).toContain('end tomorrow')
  })
  it('on day 60 the greeting says the free days end today', () => {
    expect(planLineFor(trial(60))!.says).toContain('end today')
  })
  it('a free user, an exempt tenant, a paid tenant and one never activated hear no count', () => {
    for (const s of [{ state: 'FREE_USER' }, { state: 'EXEMPT' }, { state: 'NO_CLOCK' }, { state: 'PAID', paidThrough: new Date() }] as TrialState[]) {
      expect(planLineFor(s)).toBeNull()
    }
  })
  it('the greeting line never says an email went or will go', () => {
    for (const d of [50, 55, 59, 60]) expect(planLineFor(trial(d))!.says).not.toMatch(/e-?mail|letter|Teams/i)
  })
})

describe('on day 61 the Owner gets one card saying the account is read-only', () => {
  const unpaid: TrialState = { state: 'UNPAID', day: 61 }
  it('there is no card on day 60 or before', () => {
    expect(planCardFor(trial(60), 'c1', true)).toBeNull()
  })
  it('on day 61 unpaid the card says the account is read-only and points at Settings', () => {
    const c = planCardFor(unpaid, 'c1', true)!
    expect(c.type).toBe(PLAN_CLOCK)
    expect(c.title).toBe('Your account is read-only')
    expect(c.subtitle).toBe('Choose a plan in Settings.')
    expect(c.actionUrl).toBe(PLAN_HREF)
  })
  it('with the read-only rule switched off there is no card, because nothing is read-only', () => {
    expect(planCardFor(unpaid, 'c1', false)).toBeNull()
  })
  it('the card holds twelve words at most, title and fact together', () => {
    const c = planCardFor(unpaid, 'c1', true)!
    expect(words(`${c.title}. ${c.subtitle}`)).toBeLessThanOrEqual(12)
  })
  it('the drawn card opens Settings with a button that says Choose a plan', () => {
    const q: QueueRead = withPlanCard({ total: 0, items: [] }, planCardFor(unpaid, 'c1', true))!
    const [card] = queueCards(q)
    expect(card.href).toBe(PLAN_HREF)
    expect(card.act).toBeNull()
    expect(card.open).toBe('Choose a plan')
    expect(queueName(q.items[0])).toBe('Your account is read-only')
  })
  it('the card is counted with the decisions and never added twice', () => {
    const card = planCardFor(unpaid, 'c1', true)
    const once = withPlanCard({ total: 2, items: [] }, card)!
    expect(once.total).toBe(3)
    expect(withPlanCard(once, card)!.total).toBe(3)
  })
  it('a queue that could not be read stays unread rather than becoming a count of one', () => {
    expect(withPlanCard(null, planCardFor(unpaid, 'c1', true))).toBeNull()
  })
})

describe('nobody but the Owner is nagged about the clock', () => {
  it('an Owner hears it', () => expect(hearsTheClock('Owner')).toBe(true))
  it('an Admin, an AP clerk, a recruiter and a seat with no role do not', () => {
    for (const r of ['Admin', 'AP & Payroll', 'Recruiter', null, undefined]) expect(hearsTheClock(r)).toBe(false)
  })
})
