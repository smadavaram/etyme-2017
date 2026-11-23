import { describe, it, expect } from 'vitest'
import {
  PROPOSED_INTERVIEW_PLAN, PROPOSED_QUIET_DAYS, chaseQuestion, movedByClient, quietLongEnough,
} from '@/lib/agents/interview-chase'
import { planRefusal } from '@/lib/agents/tasks'

const SAT_SUN = [0, 6]

describe('the interview chase', () => {
  it('the proposed plan has no send step and is a valid task plan', () => {
    expect(PROPOSED_INTERVIEW_PLAN).toEqual({ messages: [], retries: 0, daysApart: 0, closesWhen: 'the client moves the submission', sendsNothing: true })
    expect(planRefusal(PROPOSED_INTERVIEW_PLAN)).toBeNull()
    expect(PROPOSED_QUIET_DAYS).toBe(3)
  })
  it('the interview chase never writes to a client contact: the card says a person follows up', () => {
    const q = chaseQuestion('Priya Shah', 'Java lead', 'Corvane Packaging', 'Hugo Hiring')
    expect(q).toContain('Corvane Packaging has not moved Priya Shah for Java lead in 3 working days')
    expect(q).toContain('A person follows up with Hugo Hiring about Priya Shah; the agent does not write to the client.')
  })
  it('a submission is quiet long enough after three working days and not before', () => {
    const sentOn = new Date('2026-11-16T10:00:00Z') // Monday
    expect(quietLongEnough(sentOn, new Date('2026-11-18T10:00:00Z'), SAT_SUN)).toBe(false) // two working days
    expect(quietLongEnough(sentOn, new Date('2026-11-19T10:00:00Z'), SAT_SUN)).toBe(true)
  })
  it('a weekend does not count as quiet days', () => {
    const sentOn = new Date('2026-11-20T10:00:00Z') // Friday
    expect(quietLongEnough(sentOn, new Date('2026-11-23T10:00:00Z'), SAT_SUN)).toBe(false) // Monday: one working day
    expect(quietLongEnough(sentOn, new Date('2026-11-25T10:00:00Z'), SAT_SUN)).toBe(true)
  })
  it('the client has moved a submission that is past submitted, turned down or has an interview', () => {
    expect(movedByClient({ status: 'SUBMITTED', rejectedAt: null, interviews: 0 })).toBe(false)
    expect(movedByClient({ status: 'SHORTLISTED', rejectedAt: null, interviews: 0 })).toBe(true)
    expect(movedByClient({ status: 'SUBMITTED', rejectedAt: new Date(), interviews: 0 })).toBe(true)
    expect(movedByClient({ status: 'SUBMITTED', rejectedAt: null, interviews: 1 })).toBe(true)
  })
})
