/**
 * The handoffs station's own arithmetic (scripts/simulate/stages/conversation).
 *
 * The station reads, as each seat, what that seat was told and what Ask
 * Etyme says to it, and judges it. These are the rules it judges by, held
 * without a server, so a report that says "told twice" or "said without
 * what it is about" can be trusted.
 */
import { describe, it, expect } from 'vitest'
import {
  blocksOf, carries, countSaid, holdReasonOf, machineTalk, names, outboundBy, sinceLines, subjectOf, teamsToWorkers, textOf, toldTwice,
  SINCE, type NoticeRow,
} from '../../scripts/simulate/stages/conversation/handoffs-read'
import { SINCE_HEADING } from '@/app/api/conversations/twin/ask'
import { DIGEST_PREFIX } from '@/app/api/conversations/twin/notices'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function row(over: Partial<NoticeRow>): NoticeRow {
  return {
    id: Math.random().toString(36).slice(2), personId: 'p-renata', personName: 'Renata Kowal', type: 'TIMESHEET',
    title: 'Helena Marsh’s week is yours to accept', body: 'Week of Oct 11.', entityId: 't1', channel: 'IN_APP',
    deliveryState: 'SENT', party: 'supplier', createdAt: new Date(0), ...over,
  }
}

describe('The number a greeting leads with', () => {
  it('“Five things need you” is five, “Ten things need you” is ten, and “Nothing needs you today” is nought', () => {
    expect(countSaid('Five things need you: Ingrid Sørensen’s start; and 4 more. Open the list.')).toBe(5)
    expect(countSaid('Ten things need you: Ilya Iwu’s start, and 8 more. Open the list.')).toBe(10)
    expect(countSaid('One thing needs you: Rosa Delgado’s expense.')).toBe(1)
    expect(countSaid('12 things need you; open the list to see them.')).toBe(12)
    expect(countSaid('Nothing needs you today, and nothing Etyme asked is waiting on anybody.')).toBe(0)
  })

  it('a greeting that leads with no count is never given one, so a mismatch with the mark is never invented', () => {
    expect(countSaid('Northbend Athletic put one of your bills on hold. Checked just now.')).toBeNull()
    expect(countSaid('Etyme is asking you one thing; approve it below.')).toBeNull()
    expect(countSaid(undefined)).toBeNull()
  })
})

describe('“Since you last looked” says who and what', () => {
  it('the station reads the same heading the greeting writes', () => {
    expect(SINCE).toBe(SINCE_HEADING)
  })

  it('its lines stop at the party’s closing line', () => {
    const close = 'Ask me about our people, our bench, our weeks and our bills.'
    expect(sinceLines(['Two things need you.', SINCE, 'Brightmoor Staffing wrote to you about the Data engineer job.', close, 'Your data stays in your company.'], [close]))
      .toEqual(['Brightmoor Staffing wrote to you about the Data engineer job.'])
    expect(sinceLines(['Nothing needs you today.', close], [close])).toEqual([])
  })

  it('a count in brackets, a countdown, an enum name and “position(s)” are machine talk; a sentence a person says is not', () => {
    expect(machineTalk('Hours to approve (5 times)')).toBe('a count in brackets')
    expect(machineTalk('Hours to approve — in 3 days')).toBe('a countdown where a day belongs')
    expect(machineTalk('TECHNICAL_ROUND for Data engineer')).toBe('an enum name')
    expect(machineTalk('Data engineer — 1 position(s) in Tualatin')).toBe('"position(s)"')
    expect(machineTalk('QA test message — please ignore')).toBe('a test message')
    expect(machineTalk('Marcus Oyelaran has five weeks to approve by Wednesday.')).toBeNull()
  })

  it('what a notice is about is read from its body: the job a round is for, or the subject before the dash', () => {
    expect(subjectOf('Technical, round 1, for Data engineer. 3 times offered — confirm one.')).toBe('Data engineer')
    expect(subjectOf('Supply chain planning analyst — 1 position(s) in Tualatin.')).toBe('Supply chain planning analyst')
    expect(subjectOf('Your professional license runs out in 24 days.')).toBeNull()
  })

  it('a hold’s reason is read from the sentence the hold route writes', () => {
    expect(holdReasonOf('Northbend Athletic put bill INV-0042 on hold: The week of Mar 15 shows 44 hours. Nothing is paid on it until they lift the hold.'))
      .toBe('The week of Mar 15 shows 44 hours')
    expect(holdReasonOf('Northbend Athletic lifted the hold on bill INV-0042.')).toBeNull()
  })

  it('the twin’s Teams digest, which is the greeting’s own list, is the notice the greeting leaves out', () => {
    const digest = readFileSync(join(process.cwd(), 'src/lib/teams/digest.ts'), 'utf8')
    expect(digest).toContain(`\`${DIGEST_PREFIX}\${companyId}\``)
  })
})

describe('A name in a greeting', () => {
  it('is found whatever its case, and an empty name is never found', () => {
    expect(names('Two things need you: helena marsh’s week.', 'Helena Marsh')).toBe(true)
    expect(names('Two things need you.', '')).toBe(false)
  })

  it('a title that names the week by its dates carries “the week of” it is about, without saying “the week of”', () => {
    expect(carries('Anjali Mehta’s week of Aug 23–29 is yours to accept', 'the week of Aug 23–29')).toBe(true)
    expect(carries('Tomasz Nowak’s week of Jul 26 - Aug 1 is yours to accept', 'the week of Jul 26 – Aug 1')).toBe(true)
    expect(carries('Week Aug 23–29 approved', 'the week of Aug 23–29')).toBe(true)
    // A title with no dates in it still does not carry the week.
    expect(carries('Timesheet approved', 'the week of Aug 23–29')).toBe(false)
    expect(carries('Anjali Mehta’s week is yours to accept', 'the week of Aug 23–29')).toBe(false)
    expect(carries('Data engineer was sent to you', 'Data engineer')).toBe(true)
    expect(carries('Anything at all', '')).toBe(false)
  })

  it('sits in one piece with its due day, so “whose week, and by when” is asked of the piece that names her', () => {
    const answer = {
      says: 'Two things need you: Helena Marsh’s week; Rosa Delgado’s expense. Open the list.',
      queue: [{ title: 'Helena Marsh’s week', fact: 'Due by Wednesday.', href: '/dashboard/weeks/t1' }],
      more: [{ says: 'Marcus Oyelaran has five weeks to approve by Wednesday.', links: [{ text: 'Marcus Oyelaran', href: '/x' }] }],
    }
    expect(blocksOf(answer)).toContain('Helena Marsh’s week\nDue by Wednesday.')
    // Addresses are not words anybody reads.
    expect(textOf(answer)).not.toContain('/dashboard/weeks/t1')
  })
})

describe('Who was told what, how many times', () => {
  it('the same notice twice, word for word, is told twice', () => {
    const [t] = toldTwice([row({}), row({})])
    expect(t).toMatchObject({ personName: 'Renata Kowal', times: 2, alike: false })
  })

  it('different news under one title is counted apart, because the list reads the same line again', () => {
    const got = toldTwice([row({ body: 'Week of Oct 4.', entityId: 't1' }), row({ body: 'Week of Oct 11.', entityId: 't2' })])
    expect(got).toEqual([{ personName: 'Renata Kowal', party: 'supplier', title: 'Helena Marsh’s week is yours to accept', body: 'Week of Oct 4.', times: 2, alike: true }])
  })

  it('one notice to each of two people is nobody told twice', () => {
    expect(toldTwice([row({}), row({ personId: 'p-desmond', personName: 'Desmond Achebe' })])).toEqual([])
  })

  it('outbound messages are grouped by channel, kind and the party that received them, counting each person once', () => {
    const got = outboundBy([row({ channel: 'EMAIL' }), row({ channel: 'EMAIL' }), row({ channel: 'EMAIL', personId: 'p-2' }), row({ channel: 'TEAMS', type: 'SYSTEM' })])
    expect(got[0]).toEqual({ channel: 'EMAIL', type: 'TIMESHEET', party: 'supplier', messages: 3, people: 2 })
    expect(got[1]).toEqual({ channel: 'TEAMS', type: 'SYSTEM', party: 'supplier', messages: 1, people: 1 })
  })

  it('a Teams message to a worker is flagged, because a candidate is reachable by email only', () => {
    const w = row({ channel: 'TEAMS', party: 'worker', personName: 'Helena Marsh' })
    expect(teamsToWorkers([w, row({ channel: 'EMAIL', party: 'worker' }), row({ channel: 'TEAMS' })])).toEqual([w])
  })
})
