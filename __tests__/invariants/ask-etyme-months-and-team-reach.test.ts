import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { readWorkerAsk, asksMonths, monthsSays, respondWorker, type WorkerFacts } from '@/app/api/conversations/twin/worker'
import { scopeLine } from '@/app/api/conversations/twin/access'
import { outsideReachSays } from '@/app/api/requisitions/grant-reach'

/**
 * Two follow-ups of 2026-11-09. A worker asking how long she has been at a
 * client is answered from the reading her greeting says, with the day the
 * limit falls on her contracts as booked (graded against the Tenure page in
 * __integration__/ask-etyme-against-the-record.test.ts). And a seat that
 * reads jobs or submissions by a team grant is told so in the routes' own
 * terms (demand, 37c14618b).
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const HELENA_AT_NORTHBEND = { site: 'Northbend Athletic', months: 6, capMonths: 18, past: false, limitOn: null }

describe('a worker asking how long she has been at a client is answered, never “I cannot answer that yet”', () => {
  it('“How long have I been at Northbend?”, “months here” and “how long until my time limit” are each read as her months', () => {
    for (const q of ['How long have I been at Northbend?', 'How many months have I been here?', 'Months here?', 'How long until my time limit?', 'When do I reach the limit?']) {
      expect(readWorkerAsk(q), q).toBe('MONTHS')
    }
    expect(asksMonths('when do i get paid')).toBe(false)
  })

  it('her months are said in whole months against the client’s limit, with the day it falls on her contracts as booked', () => {
    expect(monthsSays([{ ...HELENA_AT_NORTHBEND, months: 16, limitOn: '2027-01-08' }]))
      .toBe('You are sixteen months into Northbend Athletic’s eighteen-month time limit. You reach it on Jan 8, 2027, on your contracts as booked. Checked just now.')
  })

  it('where her contracts end before the limit, she is told so rather than given a day that is not on the record', () => {
    expect(monthsSays([HELENA_AT_NORTHBEND]))
      .toBe('You are six months into Northbend Athletic’s eighteen-month time limit. Your contracts as booked end before you reach it. Checked just now.')
  })

  it('past the limit she is told she has reached it, and with no limit set she is told no client sets one', () => {
    expect(monthsSays([{ ...HELENA_AT_NORTHBEND, months: 19, past: true, limitOn: '2026-10-01' }]))
      .toBe('You have reached Northbend Athletic’s eighteen-month time limit. Checked just now.')
    expect(monthsSays([])).toBe('No client you are on site with sets a time limit. Checked just now.')
  })

  it('the answer reads the facts her greeting reads, and says so where they could not be read', async () => {
    const facts = { limits: [HELENA_AT_NORTHBEND], unread: [] } as unknown as WorkerFacts
    const a = await respondWorker('How long have I been at Northbend?', { facts: async () => facts })
    expect(a.says).toMatch(/^You are six months into Northbend Athletic’s eighteen-month time limit\./)
    expect(a.says).not.toContain('I cannot answer that yet')
    const none = await respondWorker('Months here?', { facts: async () => ({ unread: [] } as unknown as WorkerFacts) })
    expect(none.says).toBe('Your months against the time limit could not be read just now. Open Your work to see them.')
  })

  it('the day is read the way the Tenure page reads it, from the contracts the limit still counts', () => {
    const src = read('src/app/api/conversations/twin/worker-read.ts')
    expect(src).toContain('bookedLimitDay(booked')
    expect(src).toContain('linesCounted(served, standing)')
  })
})

describe('a team grant of jobs or submissions is said truly, and another team’s job is refused naming the reach', () => {
  it('a team grant of submissions reads “You read submissions for the Dayton team”', () => {
    expect(scopeLine('submissions.read', 'UNIT', ['Dayton'])).toBe('You read submissions for the Dayton team; ask the Owner for the firm’s.')
    expect(scopeLine('requirements.read', 'UNIT', ['Dayton'])).toBe('You read jobs for the Dayton team; ask the Owner for the firm’s.')
    expect(scopeLine('submissions.read', 'PERSON')).toBe('You read submissions for your own work; ask the Owner for the firm’s.')
    expect(scopeLine('submissions.read', 'COMPANY')).toBeNull()
  })

  it('the reach is said only where the routes narrow: a seat whose own role holds the desk, or that sits in another company’s program, reads the firm’s', () => {
    const src = read('src/app/api/conversations/twin/read.ts')
    const fn = src.slice(src.indexOf('const jobsReach = async'), src.indexOf('return {', src.indexOf('const jobsReach = async')))
    expect(fn).toContain("if (seat || !caller.company) return null")
    expect(fn).toContain("['*', 'submissions.read', 'submissions.create']")
    expect(fn).toContain("reachFor(caller, what === 'submissions' ? 'submissions.read' : 'requirements.read')")
  })

  it('“Who applied for” another team’s job is refused in the submissions route’s own sentence, naming the reach', () => {
    const src = read('src/app/api/conversations/twin/read.ts')
    expect(src).toContain("outsideReachSays('submissions', reach, reach.teamNames, company.name)")
    expect(outsideReachSays('submissions', { has: true, scope: 'UNIT', unitIds: ['u1'] }, ['Dayton'], 'Brightmoor Staffing'))
      .toBe('You read submissions for the Dayton team, and this one is outside it. Ask the Owner of Brightmoor Staffing for the firm’s.')
  })

  it('who applied, read for one team, ends on that reach', () => {
    const ask = read('src/app/api/conversations/twin/ask.ts')
    expect(ask).toContain("says: withReach(appliedSays(got.job, got.rows, got.total), reach)")
    expect(ask).toContain("const reach = await reachOf(read, 'submissions.read')")
  })
})
