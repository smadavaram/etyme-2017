import { describe, it, expect } from 'vitest'
import {
  PROPOSED_SUBMISSION_CHASE, PROPOSED_SUBMISSION_CHASE_PLAN, chaseProposal, submissionChaseLetter, submissionChaseQuestion,
} from '@/lib/agents/submission-chase-rules'
import { planWords, planRefusal } from '@/lib/agents/tasks'

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const base = { state: 'AWAITING' as const, waitedDays: 4, hasSentLetter: true, everHadTask: false }
const letter = (attempt = 1) => submissionChaseLetter({ firmName: 'Win Firm', contactName: null, person: 'Priya Nair', job: 'Data Engineer', sentOn: d('2026-11-16'), attempt })

describe('the submission chase, its rules', () => {
  it('a submission waiting more than three days with a letter that left and no earlier task is proposed', () => {
    expect(chaseProposal(base)).toEqual({ propose: true })
  })
  it('a submission put forward three days ago or less is not chased', () => {
    expect(chaseProposal({ ...base, waitedDays: 3 }).propose).toBe(false)
  })
  it('a submission is never proposed for a chase twice, whatever became of the first task', () => {
    expect(chaseProposal({ ...base, everHadTask: true }).propose).toBe(false)
  })
  it('a submission held by a dual authorization is not chased', () => {
    expect(chaseProposal({ ...base, state: 'BLOCKED' }).propose).toBe(false)
  })
  it('a submission whose letter bounced is not chased, because its own card already asks a person', () => {
    expect(chaseProposal({ ...base, state: 'FAILED_DELIVERY' }).propose).toBe(false)
  })
  it('a confirmed submission and a draft are not chased', () => {
    expect(chaseProposal({ ...base, state: 'CONFIRMED' }).propose).toBe(false)
    expect(chaseProposal({ ...base, state: 'NOT_SENT' }).propose).toBe(false)
  })
  it('a submission with no letter on the mail ledger is not chased, because nobody knows where to write', () => {
    expect(chaseProposal({ ...base, hasSentLetter: false }).propose).toBe(false)
  })
})

describe('the submission chase, its numbers and its plan', () => {
  it('the numbers are one letter, one reminder, three working days apart, and are labelled as a proposal', () => {
    expect(PROPOSED_SUBMISSION_CHASE).toEqual({ firstAfterDays: 3, letters: 1, retries: 1, workingDaysApart: 3 })
    expect(submissionChaseQuestion({ person: 'Priya Nair', job: 'Data Engineer', sentOn: d('2026-11-16') })).toMatch(/Proposed numbers, awaiting the Owner/)
  })
  it('the plan is a valid task plan that closes when a confirmation is recorded', () => {
    expect(planRefusal(PROPOSED_SUBMISSION_CHASE_PLAN)).toBeNull()
    expect(planWords(PROPOSED_SUBMISSION_CHASE_PLAN)).toMatch(/closes the task when a confirmation is recorded/)
  })
  it('the card names the person, the job and the day put forward and quotes the one ask', () => {
    const q = submissionChaseQuestion({ person: 'Priya Nair', job: 'Data Engineer', sentOn: d('2026-11-16') })
    expect(q).toMatch(/Priya Nair/); expect(q).toMatch(/Data Engineer/); expect(q).toMatch(/Nov 16, 2026/)
    expect(q).toMatch(/confirm you have it/)
  })
})

describe('the submission chase, its letter', () => {
  it('the letter names the person, the job and the day put forward, and asks for one thing', () => {
    const l = letter()
    expect(l.text).toMatch(/Priya Nair/); expect(l.text).toMatch(/Data Engineer/); expect(l.text).toMatch(/Nov 16, 2026/)
    expect(l.text).toMatch(/confirm you have it, or tell us it is not wanted/)
    expect(l.text.match(/\?/g) ?? []).toHaveLength(0)
  })
  it('the letter carries no rate, no link, no phone number and no email address', () => {
    for (const l of [letter(1), letter(2)]) {
      expect(l.text + l.subject).not.toMatch(/https?:|www\.|@|\$|\brate\b|\d{3}[-. ]\d{3,4}/i)
    }
  })
  it('the reminder opens with "This is a reminder." and the first letter does not', () => {
    expect(letter(2).text).toMatch(/This is a reminder\./)
    expect(letter(1).text).not.toMatch(/reminder/i)
  })
  it('the letter threatens nothing and promises no date', () => {
    expect(letter(2).text).not.toMatch(/withdraw|cancel|otherwise|deadline|by (monday|friday)|will be removed/i)
  })
})
