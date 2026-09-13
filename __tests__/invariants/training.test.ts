import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { applyMove, coursesForGap, statusWord, MOVES } from '@/lib/training'

/**
 * Training that starts, finishes or stops.
 *
 * The page showed the skill gap and nothing could be done about it
 * from there. Course and Enrollment existed; no route enrolled anybody.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const mei = { personName: 'Mei-Lin Chao', courseTitle: 'Workday Studio' }

describe('an enrollment moves forward and never back', () => {
  it('enrolled can start, finish or drop; in progress can finish or drop; finished and dropped are done', () => {
    expect(MOVES.ENROLLED).toEqual(['start', 'complete', 'drop'])
    expect(MOVES.IN_PROGRESS).toEqual(['complete', 'drop'])
    expect(MOVES.COMPLETED).toEqual([])
    expect(MOVES.DROPPED).toEqual([])
  })
  it('finishing says so in a sentence, with the score when there is one, and promises it on their page', () => {
    expect(applyMove('IN_PROGRESS', 'complete', { ...mei, score: 92 })).toEqual({ ok: true, status: 'COMPLETED', says: 'Mei-Lin Chao finished Workday Studio with 92. It is on their page now.' })
  })
  it('dropping needs a reason', () => {
    expect(applyMove('ENROLLED', 'drop', mei)).toMatchObject({ ok: false, code: 'REASON_REQUIRED' })
    expect(applyMove('ENROLLED', 'drop', { ...mei, reason: 'Placed before it began.' })).toMatchObject({ ok: true, status: 'DROPPED', says: 'Mei-Lin Chao dropped Workday Studio: Placed before it began.' })
  })
  it('a finished course cannot be started again, and a dropped one is re-enrolled rather than resumed', () => {
    expect(applyMove('COMPLETED', 'start', mei)).toMatchObject({ ok: false, message: 'Mei-Lin Chao finished Workday Studio. There is nothing more to record.' })
    expect(applyMove('DROPPED', 'start', mei)).toMatchObject({ ok: false, message: 'Mei-Lin Chao dropped Workday Studio. Enroll them again to start over.' })
  })
  it('statuses are words', () => {
    expect(['ENROLLED', 'IN_PROGRESS', 'COMPLETED', 'DROPPED'].map(statusWord)).toEqual(['Enrolled', 'In progress', 'Finished', 'Dropped'])
  })
})

describe('the gap points at a course', () => {
  it('a skill in deficit lists the courses that teach it, by name', () => {
    const out = coursesForGap(
      [{ skill: 'Kinaxis', gap: 3 }, { skill: 'Power BI', gap: 0 }],
      [{ id: 'c1', title: 'Kinaxis RapidResponse fundamentals', category: 'TECH' }, { id: 'c2', title: 'SAP CO', category: 'TECH' }]
    )
    expect(out).toEqual([{ skill: 'Kinaxis', gap: 3, courses: [{ id: 'c1', title: 'Kinaxis RapidResponse fundamentals' }] }])
  })
})

describe('the screens and the routes', () => {
  it('the training page adds courses, enrolls from the bench, and records each move', () => {
    const page = read('src/app/dashboard/training/page.tsx')
    expect(page).toContain("post('/api/training', newCourse)")
    expect(page).toContain("post('/api/training/enrollments', enroll)")
    expect(page).toContain('post(`/api/training/enrollments/${ask.id}`')
  })
  it('the person enrolled is told, by email if they are a candidate', () => {
    expect(read('src/app/api/training/enrollments/route.ts')).toContain("channel: staffSeat ? 'IN_APP' : 'EMAIL'")
  })
  it('a finished course reaches the portfolio', () => {
    expect(read('src/lib/portfolio-data.ts')).toContain('completedTraining')
  })
})
