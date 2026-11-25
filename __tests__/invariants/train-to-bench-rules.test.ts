import { describe, it, expect } from 'vitest'
import {
  askMethod, certificationStanding, cohortFull, cohortNext, cohortOpen, mayAskOntoBench, mayAssess,
  mayCertify, mayCompleteCohort, mayRecordAnswer, nextAttempt, sameCourse,
} from '@/lib/training'

/** Record 120, train to bench: the rules, one sentence per refusal, no database. */

describe('a cohort holds only as many people as its capacity', () => {
  it('a cohort with two seats takes the second person and refuses the third, naming the capacity', () => {
    expect(cohortFull({ capacity: 2, enrolled: 1, name: 'Spring' })).toEqual({ ok: true })
    const full = cohortFull({ capacity: 2, enrolled: 2, name: 'Spring' })
    expect(full).toEqual({ ok: false, message: 'Spring holds 2 people and is full.' })
  })
  it('a cohort with one seat says "1 person" and not "1 people"', () => {
    expect(cohortFull({ capacity: 1, enrolled: 1, name: 'Pilot' })).toMatchObject({ ok: false, message: 'Pilot holds 1 person and is full.' })
  })
  it('a cohort with no capacity set has no limit', () => {
    expect(cohortFull({ capacity: null, enrolled: 500, name: 'Open' })).toEqual({ ok: true })
  })
  it('a cohort that is finished or cancelled takes nobody new', () => {
    expect(cohortOpen('PLANNED', 'A')).toEqual({ ok: true })
    expect(cohortOpen('RUNNING', 'A')).toEqual({ ok: true })
    expect(cohortOpen('COMPLETE', 'A')).toMatchObject({ ok: false, message: 'A is finished and takes nobody new.' })
    expect(cohortOpen('CANCELLED', 'A')).toMatchObject({ ok: false })
  })
})

describe('an enrollment and its cohort share one course', () => {
  it('a trainee on one course cannot be put in a cohort for another', () => {
    expect(sameCourse({ enrollmentCourseId: 'c1', cohortCourseId: 'c1', courseTitle: 'T', cohortName: 'K' })).toEqual({ ok: true })
    expect(sameCourse({ enrollmentCourseId: 'c1', cohortCourseId: 'c2', courseTitle: 'Welding basics', cohortName: 'Autumn' }))
      .toEqual({ ok: false, message: 'Autumn teaches a different course than Welding basics. Pick a cohort for this course.' })
  })
})

describe('a cohort moves planned, running, finished, and never backwards', () => {
  it('a planned cohort starts, a running one finishes, and either may be cancelled', () => {
    expect(cohortNext('PLANNED', 'start', 'K')).toEqual({ ok: true, state: 'RUNNING' })
    expect(cohortNext('RUNNING', 'complete', 'K')).toEqual({ ok: true, state: 'COMPLETE' })
    expect(cohortNext('PLANNED', 'cancel', 'K')).toEqual({ ok: true, state: 'CANCELLED' })
    expect(cohortNext('RUNNING', 'cancel', 'K')).toEqual({ ok: true, state: 'CANCELLED' })
  })
  it('a planned cohort cannot be finished, and a finished or cancelled one cannot move', () => {
    expect(cohortNext('PLANNED', 'complete', 'K')).toMatchObject({ ok: false, message: 'K is planned; it cannot be finished from there.' })
    expect(cohortNext('COMPLETE', 'start', 'K')).toMatchObject({ ok: false })
    expect(cohortNext('CANCELLED', 'start', 'K')).toMatchObject({ ok: false, message: 'K was cancelled. Start a new cohort instead.' })
  })
  it('a cohort cannot be finished while a trainee has no result, and the sentence names those trainees', () => {
    const v = mayCompleteCohort({ name: 'Spring', trainees: [
      { name: 'Ada', status: 'COMPLETED', assessments: 2 },
      { name: 'Bram', status: 'IN_PROGRESS', assessments: 0 },
      { name: 'Cleo', status: 'IN_PROGRESS', assessments: 0 },
    ] })
    expect(v).toEqual({ ok: false, message: 'Spring cannot be finished: Bram, Cleo have no result yet.' })
  })
  it('somebody who dropped out does not hold the cohort open', () => {
    expect(mayCompleteCohort({ name: 'S', trainees: [{ name: 'Ada', status: 'COMPLETED', assessments: 1 }, { name: 'Dev', status: 'DROPPED', assessments: 0 }] })).toEqual({ ok: true })
  })
  it('one trainee with no result is named as "has", not "have"', () => {
    expect(mayCompleteCohort({ name: 'S', trainees: [{ name: 'Bram', status: 'ENROLLED', assessments: 0 }] })).toMatchObject({ message: 'S cannot be finished: Bram has no result yet.' })
  })
})

describe('an attempt is never overwritten and a score is 0 to 100', () => {
  it('the first attempt at a skill is attempt one', () => {
    expect(nextAttempt([], 'Python', 60)).toEqual({ ok: true, skill: 'Python', score: 60, attempt: 1 })
  })
  it('a retake is the next attempt, however the skill is capitalized, and keeps the first spelling', () => {
    expect(nextAttempt([{ skill: 'Python', attempt: 1 }], 'python', 82)).toEqual({ ok: true, skill: 'Python', score: 82, attempt: 2 })
  })
  it('a second skill starts again at attempt one', () => {
    expect(nextAttempt([{ skill: 'Python', attempt: 2 }], 'SQL', 90)).toMatchObject({ attempt: 1 })
  })
  it('a score of 0 and a score of 100 are accepted', () => {
    expect(nextAttempt([], 'A', 0)).toMatchObject({ ok: true, score: 0 })
    expect(nextAttempt([], 'A', 100)).toMatchObject({ ok: true, score: 100 })
  })
  it('a score below 0, above 100, with a fraction, or not a number is refused in one sentence', () => {
    for (const bad of [-1, 101, 82.5, 'eighty', null, undefined, '']) {
      expect(nextAttempt([], 'A', bad), String(bad)).toEqual({ ok: false, message: 'A score is a whole number from 0 to 100.' })
    }
  })
  it('an assessment with no skill is refused', () => {
    expect(nextAttempt([], '   ', 50)).toEqual({ ok: false, message: 'Say which skill was assessed.' })
  })
})

describe('who may assess and who may certify', () => {
  const base = { enrollmentStatus: 'COMPLETED', personName: 'Ada', callerPersonId: 'trainer', callerRole: 'Owner', trainerPersonId: 'trainer', assessorPersonIds: ['trainer'] }
  it('the cohort’s trainer may certify a trainee who finished her course', () => {
    expect(mayCertify(base)).toEqual({ ok: true })
  })
  it('the person who assessed her may certify her even where the cohort has another trainer', () => {
    expect(mayCertify({ ...base, callerPersonId: 'assessor', trainerPersonId: 'someone', assessorPersonIds: ['assessor'] })).toEqual({ ok: true })
  })
  it('a certification needs a finished course', () => {
    expect(mayCertify({ ...base, enrollmentStatus: 'IN_PROGRESS' })).toEqual({ ok: false, message: 'Ada has not finished the course. Finish it first, then certify.' })
  })
  it('a recruiter never certifies, even when named as the trainer', () => {
    expect(mayCertify({ ...base, callerRole: 'Recruiter' })).toMatchObject({ ok: false })
  })
  it('somebody who neither assessed her nor trains the cohort cannot certify her', () => {
    expect(mayCertify({ ...base, callerPersonId: 'stranger', callerRole: 'Admin' })).toEqual({ ok: false, message: 'Only the person who assessed Ada, or the cohort’s trainer, may certify her.' })
  })
  it('only the cohort’s trainer assesses where the cohort has one, and never a recruiter', () => {
    expect(mayAssess({ callerPersonId: 't', callerRole: 'Owner', trainerPersonId: 't' })).toEqual({ ok: true })
    expect(mayAssess({ callerPersonId: 'x', callerRole: 'Owner', trainerPersonId: 't' })).toMatchObject({ ok: false })
    expect(mayAssess({ callerPersonId: 'x', callerRole: 'Recruiter', trainerPersonId: null })).toMatchObject({ ok: false })
    expect(mayAssess({ callerPersonId: 'x', callerRole: 'HR', trainerPersonId: null })).toEqual({ ok: true })
  })
})

describe('a certification’s standing is worked out on read from its expiry date', () => {
  const now = new Date('2026-12-01T10:00:00Z')
  it('a certification with no expiry date does not lapse', () => {
    expect(certificationStanding(null, now)).toBe('CURRENT')
  })
  it('a certification expiring in a year is current', () => {
    expect(certificationStanding(new Date('2027-12-01T00:00:00Z'), now)).toBe('CURRENT')
  })
  it('a certification expiring within 30 days is expiring', () => {
    expect(certificationStanding(new Date('2026-12-31T00:00:00Z'), now)).toBe('EXPIRING')
    expect(certificationStanding(new Date('2027-01-01T00:00:00Z'), now)).toBe('CURRENT')
  })
  it('a certification is valid through the whole of its last day and expired the day after', () => {
    expect(certificationStanding(new Date('2026-12-01T00:00:00Z'), now)).toBe('EXPIRING')
    expect(certificationStanding(new Date('2026-11-30T00:00:00Z'), now)).toBe('EXPIRED')
  })
})

describe('the ask onto the bench follows her own course, not the cohort', () => {
  it('she may be asked once her own enrollment is complete, though the cohort is still running', () => {
    expect(mayAskOntoBench({ enrollmentStatus: 'COMPLETED', personName: 'Ada' })).toEqual({ ok: true })
  })
  it('she may not be asked while her own course is in progress', () => {
    expect(mayAskOntoBench({ enrollmentStatus: 'IN_PROGRESS', personName: 'Ada' })).toEqual({ ok: false, message: 'Ada has not finished the course yet. Ask her onto the bench once she has.' })
  })
  it('a firm’s own employee is told and anybody else is asked, by her own page if she has an account and by email if she has not', () => {
    expect(askMethod({ employed: true, hasOwnAccount: true })).toBe('EMPLOYEE_TOLD')
    expect(askMethod({ employed: false, hasOwnAccount: true })).toBe('OWN_PAGE')
    expect(askMethod({ employed: false, hasOwnAccount: false })).toBe('EMAIL_LINK')
  })
  it('her answer is written once and a second write is refused', () => {
    expect(mayRecordAnswer({ answer: null })).toEqual({ ok: true })
    expect(mayRecordAnswer({ answer: 'YES' })).toEqual({ ok: false, message: 'She has already answered this ask. An answer is written once.' })
    expect(mayRecordAnswer({ answer: 'NO' })).toMatchObject({ ok: false })
  })
})
