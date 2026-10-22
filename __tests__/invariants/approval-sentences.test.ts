/**
 * What an approver is told the moment they sign.
 *
 * The route answered "Approved. 1 further approval(s) required." — a
 * printf with the plural left to the reader. The person who just signed
 * a $1.3m requisition wants one fact from that line: is anything still
 * holding it up. A bracketed plural says the system did not bother to
 * work out which of the two cases they are in.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { approvalsToGo, countInWords, upperFirst, positionsSays, jobSentNotice, jobSentThreadLine, toldPerFirm, jobApart, jobsSentNotice, jobNumber } from '@/app/api/requisitions/words'

const APPROVE_ROUTE = readFileSync(
  join(process.cwd(), 'src/app/api/requisitions/[id]/approve/route.ts'), 'utf8'
)
const code = APPROVE_ROUTE.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')

describe('An approver is told what is left of the chain, in English', () => {

  it('one approval still to go reads "One more approval to go."', () => {
    expect(approvalsToGo(1)).toBe('One more approval to go.')
  })

  it('two approvals still to go are counted in words, not in digits', () => {
    expect(approvalsToGo(2)).toBe('Two more approvals to go.')
  })

  it('a chain with nothing left says the role is open to the suppliers', () => {
    expect(approvalsToGo(0)).toBe('Nothing further is needed — it is open to your suppliers.')
  })

  it('a count past twelve is printed as a figure, the way a newspaper would', () => {
    expect(approvalsToGo(17)).toBe('17 more approvals to go.')
    expect(countInWords(12)).toBe('twelve')
    expect(countInWords(13)).toBe('13')
  })

  it('a sentence starts with a capital letter, wherever the count came from', () => {
    expect(upperFirst(countInWords(3))).toBe('Three')
    expect(approvalsToGo(3).startsWith('Three')).toBe(true)
  })

  it('a negative or missing count is treated as nothing left rather than printed', () => {
    expect(approvalsToGo(-1)).toBe('Nothing further is needed — it is open to your suppliers.')
    expect(approvalsToGo(NaN)).toBe('Nothing further is needed — it is open to your suppliers.')
  })

  it('no screen or letter says "approval(s)" any more', () => {
    expect(code).not.toContain('approval(s)')
  })

  it('both the answer to the approver and the letter to whoever raised it use the one sentence', () => {
    expect(code.match(/approvalsToGo\(result\.remaining\)/g) ?? []).toHaveLength(2)
  })
})

describe('a job sent to a supplier is told by name, and opens a thread with it (simulation, 2026-10-20)', () => {
  const facts = { clientName: 'Northbend Athletic', title: 'Cybersecurity analyst', headcount: 1, location: 'Tualatin, OR', closesAt: new Date('2026-11-03T12:00:00Z') }

  it('a count of positions is said as a person says it: “1 position”, “4 positions”, never “position(s)”', () => {
    expect(positionsSays(1)).toBe('1 position')
    expect(positionsSays(4)).toBe('4 positions')
    expect(positionsSays(null)).toBe('1 position')
  })

  it('the notice names the job and who sent it in the title, never “New requirement from …”', () => {
    const said = jobSentNotice(facts)
    expect(said.title).toBe('Northbend Athletic sent you the Cybersecurity analyst job')
    expect(said.body).toBe(
      'Cybersecurity analyst: 1 position in Tualatin, OR. Answers close Nov 3, 2026. ' +
        'Put somebody forward from the job, or write to Northbend Athletic on its thread.'
    )
    expect(said.body).not.toMatch(/\(s\)|requirement|\$/)
  })

  it('the thread opens with what was sent and the sender’s own note to that supplier, and never a rate band', () => {
    expect(jobSentThreadLine({ ...facts, headcount: 4, note: 'Night shift.' }))
      .toBe('Northbend Athletic sent you the Cybersecurity analyst job: 4 positions in Tualatin, OR. Answers close Nov 3, 2026. Night shift.')
  })

  it('every supplier a job is sent to has its own people told, however many people the first supplier has', () => {
    const seats = [
      ...Array.from({ length: 12 }, (_, i) => ({ personId: `b${i}`, companyId: 'brightmoor' })),
      { personId: 'sunil', companyId: 'teleworld' },
    ]
    const told = toldPerFirm(seats, 10)
    expect(told.filter((s) => s.companyId === 'brightmoor')).toHaveLength(10)
    expect(told.map((s) => s.personId)).toContain('sunil')
  })

  it('the send route opens the thread the client-writes-to-supplier flow opens, and an Owner holding every permission hears', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/requisitions/[id]/distribute/route.ts'), 'utf8')
    expect(route).toMatch(/prisma\.conversation\s*\.create\(/)
    expect(route).toContain("topic: 'REQUIREMENT', topicId: id")
    expect(route).toContain("hasSome: ['requirements.read', '*']")
    expect(route).not.toContain('New requirement from')
    expect(route).not.toContain('position(s)')
    expect(route).not.toContain('vendor(s)')
  })

  it('the send route still refuses a supplier Procurement did not clear, whatever the sourcing step cleared by rule', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/requisitions/[id]/distribute/route.ts'), 'utf8')
    expect(route).toMatch(/const notCleared = vendorIds\.filter\(v => !cleared\.includes\(v\)\)/)
    expect(route).toContain("code: 'NOT_CLEARED'")
  })
})

describe('jobs of one title are told apart, and a batch is one notice (handoffs on the generated world, 2026-10-22)', () => {
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`)
  const base = { clientName: 'Northbend Athletic', title: 'Java developer', headcount: 1, location: 'Tualatin', closesAt: new Date('2026-11-03T12:00:00Z') }

  it('a job whose title no other job of the client has is named by its title alone', () => {
    expect(jobApart({ id: 'a', location: 'Tualatin', startDate: day('2026-11-03') }, [])).toBe('')
    expect(jobSentNotice({ ...base, apart: '' }).title).toBe('Northbend Athletic sent you the Java developer job')
  })

  it('two jobs of one title in different places are told apart by the place', () => {
    const apart = jobApart({ id: 'a', location: 'Tualatin', startDate: day('2026-11-03') }, [{ id: 'b', location: 'Dallas, TX', startDate: day('2026-11-03') }])
    expect(apart).toBe(' in Tualatin')
    expect(jobSentNotice({ ...base, apart }).title).toBe('Northbend Athletic sent you the Java developer job in Tualatin')
  })

  it('two jobs of one title in one place are told apart by the day each starts: “in Tualatin, starting Nov 3”', () => {
    const others = [{ id: 'b', location: 'Tualatin', startDate: day('2026-12-01') }, { id: 'c', location: 'Dallas, TX', startDate: day('2026-11-03') }]
    const apart = jobApart({ id: 'a', location: 'Tualatin', startDate: day('2026-11-03') }, others)
    expect(apart).toBe(' in Tualatin, starting Nov 3')
    expect(jobSentNotice({ ...base, apart }).title).toBe('Northbend Athletic sent you the Java developer job in Tualatin, starting Nov 3')
    // With no other place to tell it from, the start alone.
    expect(jobApart({ id: 'a', location: 'Tualatin', startDate: day('2026-11-03') }, [others[0]])).toBe(' starting Nov 3')
  })

  it('only where the place and the start are both the same does the title carry the job number', () => {
    const job = { id: 'czabc123def456', location: 'Tualatin', startDate: day('2026-11-03') }
    const apart = jobApart(job, [{ id: 'czother9xyz789', location: 'Tualatin', startDate: day('2026-11-03') }])
    expect(apart).toBe(` (job ${jobNumber(job.id)})`)
    expect(jobNumber(job.id)).toBe('DEF456')
    const said = jobSentNotice({ ...base, apart })
    expect(said.title).toBe('Northbend Athletic sent you the Java developer job (job DEF456)')
    expect(said.body.startsWith('Java developer (job DEF456): 1 position in Tualatin.')).toBe(true)
  })

  it('jobs one client sends in the same minute reach a person as one notice that names each: “sent you 3 jobs: …”', () => {
    const said = jobsSentNotice([
      { ...base, apart: ' in Tualatin' },
      { ...base, title: 'Data engineer', location: 'Dallas, TX', apart: '' },
      { ...base, title: 'Scrum master', headcount: 2, apart: '' },
    ])
    expect(said.title).toBe('Northbend Athletic sent you three jobs: Java developer in Tualatin, Data engineer and Scrum master')
    expect(said.body.split('\n')).toEqual([
      'Java developer: 1 position in Tualatin. Answers close Nov 3, 2026.',
      'Data engineer: 1 position in Dallas, TX. Answers close Nov 3, 2026.',
      'Scrum master: 2 positions in Tualatin. Answers close Nov 3, 2026.',
      'Put somebody forward from the job, or write to Northbend Athletic on its thread.',
    ])
    // One job reads as one job, and a long batch names three and counts the rest.
    expect(jobsSentNotice([base]).title).toBe('Northbend Athletic sent you the Java developer job')
    const five = jobsSentNotice(['A', 'B', 'C', 'D', 'E'].map((t) => ({ ...base, title: `${t} analyst`, apart: '' })))
    expect(five.title).toBe('Northbend Athletic sent you five jobs: A analyst, B analyst, C analyst and 2 more')
  })

  it('the send route asks for the client’s other jobs of the title and folds a send into an unread notice from the same minute', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/requisitions/[id]/distribute/route.ts'), 'utf8')
    expect(route).toContain('apart: jobApart({ id, location: requisition.location, startDate: requisition.startDate }, sameTitle)')
    expect(route).toContain("createdAt: { gte: new Date(Date.now() - JOB_BATCH_MS) }")
    expect(route).toContain("data: { path: ['kind'], equals: 'JOB_SENT' }")
    expect(route).toContain('requirementIds: jobs.map((j) => j.requirementId)')
  })
})
