import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * A client asking to meet somebody.
 *
 * Founder report, from a client seat: Submissions opened, candidates
 * were listed, and there was no way to invite any of them to an
 * interview. The model has carried numbered rounds since it existed and
 * `__integration__/full-spine.test.ts` walks three of them through the
 * real route — nothing on a screen called it. A route with no door is
 * the same as no route.
 *
 * The decision of what a client is offered on a row is one function in
 * the page, `nextMove`. It is read out of the file here and actually
 * run, because a regex over JSX would pass on a page that renders the
 * button on a rejected candidate. The page's body is plain JavaScript
 * for exactly that reason.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const PAGE = read('src/app/dashboard/submissions/page.tsx')
const LIST_ROUTE = read('src/app/api/submissions/route.ts')
const ROUNDS_ROUTE = read('src/app/api/submissions/[id]/interviews/route.ts')
const STATUS_ROUTE = read('src/app/api/submissions/[id]/status/route.ts')

/** The source between two markers, so a JSX block can be read whole. */
function between(source: string, from: string, to: string): string {
  const start = source.indexOf(from)
  expect(start, `${from} not found`).toBeGreaterThan(-1)
  const end = source.indexOf(to, start)
  expect(end, `${to} not found after ${from}`).toBeGreaterThan(-1)
  return source.slice(start, end + to.length)
}

/** The source of one brace-balanced declaration, starting at `from`. */
function block(source: string, from: string): string {
  const start = source.indexOf(from)
  expect(start, `${from} not found`).toBeGreaterThan(-1)
  let depth = 0
  let i = source.indexOf('{', start)
  const open = i
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}') {
      depth--
      if (depth === 0) break
    }
  }
  return source.slice(start, i + 1)
}

/** The row's next move, lifted out of the page and made runnable. */
const nextMove: (row: any, isClient: boolean) => { kind: string; round?: number; words?: string } = (() => {
  const closed = PAGE.slice(
    PAGE.indexOf('const CLOSED ='),
    PAGE.indexOf('\n', PAGE.indexOf('const CLOSED ='))
  )
  const waiting = block(PAGE, 'const WAITING_ON').replace(': Record<string, string>', '')
  const fn = block(PAGE, 'function nextMove(').replace(
    'function nextMove(row: Submission, isClient: boolean): Move',
    'function nextMove(row, isClient)'
  )
  expect(fn, 'nextMove still carries a type annotation').not.toMatch(/:\s*(Submission|Move)\b/)
  // eslint-disable-next-line no-new-func
  return new Function(`${closed}\n${waiting}\n${fn}\nreturn nextMove`)() as any
})()

const row = (status: string, interviews: any[] = []) => ({
  id: 's1',
  status,
  interviews,
  person: { id: 'p1', name: 'Mei-Lin Chao' },
})

const CLIENT = true
const SUPPLIER = false

describe('a client can ask to meet somebody from the list they are reading', () => {
  it('a client sees an Interview button on a candidate with no rounds yet', () => {
    expect(nextMove(row('SUBMITTED'), CLIENT)).toEqual({ kind: 'propose', round: 1 })
    expect(nextMove(row('SHORTLISTED'), CLIENT)).toEqual({ kind: 'propose', round: 1 })
  })

  it('labels the first one in the word the trade uses, and later ones by number', () => {
    expect(PAGE).toContain("{move.round === 1 ? 'Interview' : `Round ${move.round}`}")
  })

  it('after a round goes through, the next round is offered by number', () => {
    const after = nextMove(
      row('INTERVIEW', [{ round: 1, state: 'DONE', outcome: 'ADVANCE' }]),
      CLIENT
    )
    expect(after).toEqual({ kind: 'propose', round: 2 })

    const afterTwo = nextMove(
      row('INTERVIEW', [
        { round: 1, state: 'DONE', outcome: 'ADVANCE' },
        { round: 2, state: 'DONE', outcome: 'ADVANCE' },
      ]),
      CLIENT
    )
    expect(afterTwo).toEqual({ kind: 'propose', round: 3 })
  })

  it('reads the latest round by its number, not by where it sits in the list', () => {
    const jumbled = nextMove(
      row('INTERVIEW', [
        { round: 2, state: 'PROPOSED', outcome: null },
        { round: 1, state: 'DONE', outcome: 'ADVANCE' },
      ]),
      CLIENT
    )
    expect(jumbled).toEqual({ kind: 'waiting', round: 2, words: 'waiting on the supplier' })
  })

  it('a round still ahead says who it is waiting on, and is not a button', () => {
    expect(nextMove(row('INTERVIEW', [{ round: 1, state: 'PROPOSED', outcome: null }]), CLIENT))
      .toEqual({ kind: 'waiting', round: 1, words: 'waiting on the supplier' })
    expect(nextMove(row('INTERVIEW', [{ round: 1, state: 'CONFIRMED', outcome: null }]), CLIENT))
      .toEqual({ kind: 'waiting', round: 1, words: 'booked' })
  })

  it('says it in the trade’s own words and never in a state name', () => {
    const cell = between(PAGE, 'const move = nextMove(row, mayInterview)', '})()}')
    expect(cell).toContain('Round {move.round} · {move.words}')
    expect(cell).not.toContain('PROPOSED')
    expect(cell).not.toContain('CONFIRMED')
    // The words themselves, where they are written down.
    expect(PAGE).toContain("PROPOSED: 'waiting on the supplier'")
    expect(PAGE).toContain("CONFIRMED: 'booked'")
  })

  it('sends the client to that person’s rounds rather than opening a second form', () => {
    const cell = between(PAGE, 'const move = nextMove(row, mayInterview)', '})()}')
    expect(cell).toContain('/dashboard/interviews?submission=${row.id}')
  })

  it('offers nothing new once an offer is out or the answer was no', () => {
    expect(nextMove(row('OFFERED', [{ round: 3, state: 'DONE', outcome: 'OFFER' }]), CLIENT))
      .toEqual({ kind: 'none' })
    expect(nextMove(row('INTERVIEW', [{ round: 1, state: 'DONE', outcome: 'REJECT' }]), CLIENT))
      .toEqual({ kind: 'none' })
  })

  it('offers nothing at all to a candidate no longer in the running', () => {
    for (const status of ['PLACED', 'REJECTED', 'WITHDRAWN', 'NOT_SELECTED']) {
      expect(nextMove(row(status), CLIENT), status).toEqual({ kind: 'none' })
    }
  })

  it('does not let a round that was called off hold up the next one', () => {
    expect(nextMove(row('INTERVIEW', [{ round: 1, state: 'CANCELLED', outcome: null }]), CLIENT))
      .toEqual({ kind: 'propose', round: 2 })
    expect(nextMove(row('INTERVIEW', [{ round: 1, state: 'NO_SHOW', outcome: null }]), CLIENT))
      .toEqual({ kind: 'propose', round: 2 })
  })
})

describe('a supplier’s own screen is untouched by any of this', () => {
  it('a supplier’s view of its own submissions gained no interview button', () => {
    expect(nextMove(row('SUBMITTED'), SUPPLIER)).toEqual({ kind: 'none' })
    expect(nextMove(row('INTERVIEW', [{ round: 1, state: 'DONE', outcome: 'ADVANCE' }]), SUPPLIER))
      .toEqual({ kind: 'none' })
  })

  it('reaches the decision through the seat check the page already uses, narrowed to whoever is hiring', () => {
    expect(PAGE).toContain("const isClient = company?.kind === 'CLIENT'")
    expect(PAGE).toContain('nextMove(row, mayInterview)')
  })

  it('leaves the supplier’s own action on a received candidate exactly where it was', () => {
    expect(PAGE).toContain('Send on →')
    expect(PAGE).toContain("direction === 'received' &&")
  })
})

describe('what the client is told when a round is asked for', () => {
  it('shows the sentence the route wrote, in the notice the page already has', () => {
    const wiring = between(PAGE, '<ProposeInterviewDialog', '/>')
    expect(wiring).toContain('onDone={(says) => {')
    expect(wiring).toContain('setSaid(says)')
    expect(wiring).toContain('setPropose(null)')
    expect(wiring).toContain('fetchSubmissions()')
  })

  it('uses the shared form rather than a second one of its own', () => {
    expect(PAGE).toContain("import { ProposeInterviewDialog } from '@/components/propose-interview'")
    // No hand-rolled post to the rounds route from this page.
    expect(PAGE).not.toMatch(/fetch\(`\/api\/submissions\/\$\{[^}]+\}\/interviews`/)
  })
})

describe('the row can only say where somebody is if the list carries it', () => {
  it('the submissions list carries each round’s number, state and outcome', () => {
    const query = block(LIST_ROUTE, 'prisma.submission.findMany')
    expect(query).toContain('interviews: {')
    expect(query).toContain('select: { id: true, round: true, state: true, outcome: true, scheduledAt: true }')
    expect(query).toContain("orderBy: { round: 'asc' }")
    expect(LIST_ROUTE).toContain('interviews: s.interviews.map((i) => ({')
  })

  it('carries nothing an interviewer wrote, because both sides read this list', () => {
    const shaped = LIST_ROUTE.slice(
      LIST_ROUTE.indexOf('interviews: s.interviews.map'),
      LIST_ROUTE.indexOf('pagination:')
    )
    expect(shaped).not.toContain('feedback')
    expect(shaped).not.toContain('interviewers')
    expect(shaped).not.toContain('location')
  })

  it('leaves every other field on a submission exactly as it was', () => {
    for (const field of ['kind:', 'rate:', 'status:', 'submittedAt:', 'forwardedAt:', 'forwardedVia:', 'forwardedToEmail:']) {
      expect(LIST_ROUTE, field).toContain(field)
    }
  })
})

describe('the route refuses what the screen would not offer', () => {
  it('a second round cannot be proposed while the first is still ahead', () => {
    expect(ROUNDS_ROUTE).toContain("code: 'ROUND_STILL_OPEN'")
    expect(ROUNDS_ROUTE).toContain(
      'is still ahead of you. Record how it went before proposing the next.'
    )
    // Before the round exists, not after it has been booked.
    expect(ROUNDS_ROUTE.indexOf("'ROUND_STILL_OPEN'"))
      .toBeLessThan(ROUNDS_ROUTE.indexOf('prisma.interview.create'))
  })

  it('counts a round as ahead of you only while somebody could still attend it', () => {
    expect(ROUNDS_ROUTE).toContain(
      "(i) => !i.outcome && (i.state === 'PROPOSED' || i.state === 'CONFIRMED')"
    )
  })

  it('refuses a round on somebody no longer in the running, by name', () => {
    expect(ROUNDS_ROUTE).toContain("code: 'SUBMISSION_CLOSED'")
    expect(ROUNDS_ROUTE).toContain('${submission.person.name} is no longer in the running here.')
    expect(ROUNDS_ROUTE.indexOf("'SUBMISSION_CLOSED'"))
      .toBeLessThan(ROUNDS_ROUTE.indexOf('prisma.interview.create'))
    expect(ROUNDS_ROUTE).toContain(
      "const CLOSED = ['PLACED', 'REJECTED', 'WITHDRAWN', 'NOT_SELECTED']"
    )
  })

  it('a round proposed moves the submission to interviewing', () => {
    const after = ROUNDS_ROUTE.slice(ROUNDS_ROUTE.indexOf('prisma.interview.create'))
    expect(after).toContain("if (submission.status === 'SUBMITTED' || submission.status === 'SHORTLISTED')")
    expect(after).toContain("data: { status: 'INTERVIEW' }")
  })

  it('does not drag a candidate backwards from an offer already made', () => {
    const after = ROUNDS_ROUTE.slice(ROUNDS_ROUTE.indexOf('prisma.interview.create'))
    const move = after.slice(after.indexOf("if (submission.status === 'SUBMITTED'"))
    expect(move).not.toContain("'OFFERED'")
  })

  it('tells the supplier and the consultant through the one notice everybody uses', () => {
    expect(ROUNDS_ROUTE).toContain("import { tell } from '@/lib/interview-notices'")
    expect(ROUNDS_ROUTE).toContain("void tell('PROPOSED', created.id)")
    // No second notification hand-written here.
    expect(ROUNDS_ROUTE).not.toContain('notify({')
  })

  it('still lets only the side that received the submission ask for a round', () => {
    expect(ROUNDS_ROUTE).toContain('where: { id, toCompanyId: companyId }')
  })
})

describe('a candidate who is interviewing can still be decided', () => {
  it('a submission that reached interview or offer can be placed, rejected or withdrawn', () => {
    const table = block(STATUS_ROUTE, 'const transitions')
    expect(table).toContain("INTERVIEW: ['PLACED', 'REJECTED', 'WITHDRAWN']")
    expect(table).toContain("OFFERED: ['PLACED', 'REJECTED', 'WITHDRAWN']")
  })

  it('still refuses to move anybody on from a decision already taken', () => {
    const table = block(STATUS_ROUTE, 'const transitions')
    expect(table).not.toContain('PLACED:')
    expect(table).not.toContain('REJECTED:')
    expect(table).not.toContain('WITHDRAWN:')
  })

  it('still refuses a rejection with no reason code behind it', () => {
    expect(STATUS_ROUTE).toContain("code: 'NEEDS_REASON'")
  })
})
