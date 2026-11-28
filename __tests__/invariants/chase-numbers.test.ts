import { describe, it, expect } from 'vitest'
import { readChaseNumbers, chaseNumbersFrom, planWith, numbersSource } from '@/lib/agents/chase-numbers'
import { PROPOSED_CHASE_PLAN, chaseQuestion, chaseProof } from '@/lib/notify/timesheet-chase-agent'
import { PROPOSED_MONEY_CHASE_PLAN } from '@/lib/money/money-owed-chase'

describe('the numbers a chase proposes with', () => {
  it('letters after the first run from 0 to 5 and working days apart from 1 to 15', () => {
    expect(readChaseNumbers('timesheet-chase', { retries: 0, daysApart: 1 }).ok).toBe(true)
    expect(readChaseNumbers('money-owed-chase', { retries: 5, daysApart: 15 }).ok).toBe(true)
    expect(readChaseNumbers('timesheet-chase', { retries: 6, daysApart: 2 }).ok).toBe(false)
    expect(readChaseNumbers('timesheet-chase', { retries: 2, daysApart: 16 }).ok).toBe(false)
    expect(readChaseNumbers('timesheet-chase', { retries: -1, daysApart: 2 }).ok).toBe(false)
  })

  it('only the two chase agents have numbers to set', () => {
    expect(readChaseNumbers('weekly-summary', { retries: 1, daysApart: 1 }).ok).toBe(false)
  })

  it('where the Owner set nothing the proposed plan is used unchanged', () => {
    expect(planWith(PROPOSED_CHASE_PLAN, null)).toBe(PROPOSED_CHASE_PLAN)
    expect(chaseNumbersFrom(null)).toBeNull()
    expect(chaseNumbersFrom({ retries: 99, daysApart: 2 })).toBeNull()
  })

  it('the Owner’s numbers replace the reminders and the spacing and nothing else in the plan', () => {
    const plan = planWith(PROPOSED_MONEY_CHASE_PLAN, { retries: 3, daysApart: 7 })
    expect(plan).toMatchObject({ retries: 3, daysApart: 7, closesWhen: PROPOSED_MONEY_CHASE_PLAN.closesWhen, messages: PROPOSED_MONEY_CHASE_PLAN.messages })
  })

  it('the timesheet card says the numbers in force and whose they are', () => {
    const plan = planWith(PROPOSED_CHASE_PLAN, { retries: 1, daysApart: 4 })
    expect(chaseQuestion('Priya Shah', 'Nov 9 to Nov 15', plan, true)).toMatch(/up to 1 reminder, 4 working days apart.*numbers the Owner set in Agent control/)
    expect(chaseProof(plan, true)).toContain(numbersSource(true))
    expect(chaseQuestion('Priya Shah', 'Nov 9 to Nov 15')).toContain(numbersSource(false))
  })
})
