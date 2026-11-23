import { describe, it, expect } from 'vitest'
import {
  PROPOSED_INTERVIEW_PLAN, PROPOSED_QUIET_DAYS, chaseQuestion, interviewChaseLetter, movedByClient, quietLongEnough,
} from '@/lib/agents/interview-chase'
import { planRefusal } from '@/lib/agents/tasks'

const SAT_SUN = [0, 6]

describe('the interview chase', () => {
  it('the proposed plan is one letter and one reminder, three working days apart, and is a valid task plan', () => {
    expect(PROPOSED_INTERVIEW_PLAN).toEqual({ messages: [{ template: 'interview-chase', label: 'Interview follow-up' }], retries: 1, daysApart: 3, closesWhen: 'the client moves the submission' })
    expect(planRefusal(PROPOSED_INTERVIEW_PLAN)).toBeNull()
    expect(PROPOSED_QUIET_DAYS).toBe(3)
  })
  it('the card names the person, the job and the client and says the numbers are proposals', () => {
    const q = chaseQuestion('Priya Shah', 'Java lead', 'Corvane Packaging')
    expect(q).toContain('Corvane Packaging has not moved Priya Shah for Java lead in 3 working days')
    expect(q).toContain('one letter, then 1 reminder 3 working days apart')
    expect(q).toContain('proposals the Owner may change')
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
  it('the letter asks where the person stands, names the job, and carries no rate', () => {
    const l = interviewChaseLetter({ contactName: 'Hugo Hiring', firmName: 'Pinnacle', candidate: 'Priya Shah', job: 'Java lead', submittedOn: new Date('2026-11-10T00:00:00Z'), link: '', attempt: 1 })
    expect(l.subject).toBe('Where does Priya Shah stand for Java lead?')
    expect(l.text).toContain('Hi Hugo,')
    expect(l.text).toContain('Pinnacle put Priya Shah forward for Java lead')
    expect(l.text).not.toMatch(/\$|rate/i)
  })
  it('the reminder says it is a reminder', () => {
    const l = interviewChaseLetter({ contactName: 'Hugo', firmName: 'P', candidate: 'A B', job: 'J', submittedOn: new Date(), link: 'https://x.example/dashboard/submissions', attempt: 2 })
    expect(l.subject).toMatch(/^Reminder:/)
    expect(l.text).toContain('This is a reminder.')
    expect(l.text).toContain('https://x.example/dashboard/submissions')
  })
})
