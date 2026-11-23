import { describe, it, expect } from 'vitest'
import { workingDaysBetween, nextLetter, chaseQuestion, PROPOSED_CHASE, PROPOSED_CHASE_PLAN } from '@/lib/notify/timesheet-chase-agent'
import { timesheetChaseLetter, weekWords } from '@/lib/notify/timesheet-chase-letter'

const OFF = [0, 6]
const d = (s: string) => new Date(`${s}T12:00:00Z`)

describe('the timesheet chase, as arithmetic', () => {
  it('the proposed defaults are one letter, two retries, two working days apart', () => {
    expect(PROPOSED_CHASE).toEqual({ letters: 1, retries: 2, workingDaysApart: 2 })
    expect(PROPOSED_CHASE_PLAN.closesWhen).toBe('the week is filed')
  })
  it('working days skip the firm’s days off: Friday to Monday is one', () => {
    expect(workingDaysBetween(d('2026-11-20'), d('2026-11-23'), OFF)).toBe(1)
    expect(workingDaysBetween(d('2026-11-20'), d('2026-11-24'), OFF)).toBe(2)
  })
  it('the first letter goes at once', () => {
    expect(nextLetter(PROPOSED_CHASE_PLAN, 0, null, d('2026-11-23'), OFF)).toEqual({ act: 'SEND', attempt: 1 })
  })
  it('a retry waits until its working days have passed, then goes', () => {
    expect(nextLetter(PROPOSED_CHASE_PLAN, 1, d('2026-11-20'), d('2026-11-23'), OFF).act).toBe('WAIT')
    expect(nextLetter(PROPOSED_CHASE_PLAN, 1, d('2026-11-20'), d('2026-11-24'), OFF)).toEqual({ act: 'SEND', attempt: 2 })
  })
  it('after the last letter and its wait, the task ends and nothing more is sent', () => {
    expect(nextLetter(PROPOSED_CHASE_PLAN, 3, d('2026-11-16'), d('2026-11-23'), OFF)).toEqual({ act: 'END' })
  })
  it('the card question names the worker and the week and says the numbers are proposals', () => {
    const q = chaseQuestion('Priya Shah', 'Nov 9 to Nov 15')
    expect(q).toMatch(/Priya Shah has not filed the week of Nov 9 to Nov 15/)
    expect(q).toMatch(/proposals the Owner may change/)
  })
  it('the letter names the firm and the week, gives one link and carries no figure', () => {
    const l = timesheetChaseLetter({ workerName: 'Priya Shah', firmName: 'Northbend', periodStart: d('2026-11-09'), periodEnd: d('2026-11-15'), dueOn: d('2026-11-17'), link: 'https://x.example/dashboard/my-work', attempt: 1 })
    expect(l.subject).toBe(`Your timesheet for ${weekWords(d('2026-11-09'), d('2026-11-15'))}`)
    expect(l.text).toMatch(/Northbend has not received your timesheet for Nov 9 to Nov 15/)
    expect(l.text.match(/https?:\/\//g)).toHaveLength(1)
    expect(l.text).not.toMatch(/\$|\d+ hours/)
  })
  it('a reminder says it is one', () => {
    const l = timesheetChaseLetter({ workerName: 'Priya', firmName: 'N', periodStart: d('2026-11-09'), periodEnd: d('2026-11-15'), dueOn: d('2026-11-17'), link: '', attempt: 2 })
    expect(l.subject).toMatch(/^Reminder:/)
    expect(l.text).toMatch(/Open Etyme and go to Your work/)
  })
})
