import { describe, it, expect } from 'vitest'
import { buildProposal, readyToSend, EMPTY_FORM, type ProposalForm } from '@/lib/interview-proposal'

/**
 * A proposed round, from what somebody typed to what the route wants.
 * The form on Submissions and the one on Interviews both go through
 * here, so this is where "what is a proposal" is decided.
 */

const now = new Date('2026-09-14T09:00:00')
const form = (patch: Partial<ProposalForm>): ProposalForm => ({ ...EMPTY_FORM, ...patch })

describe('asking for a round', () => {
  it('turns each offered time into a slot as long as the interview', () => {
    const { body, problems } = buildProposal(
      form({ durationMins: 45, times: [{ date: '2026-09-15', time: '10:00' }, { date: '2026-09-16', time: '14:30' }] }),
      now
    )
    expect(problems).toEqual([])
    expect(body.slots).toHaveLength(2)
    const [a] = body.slots
    expect(new Date(a.end).getTime() - new Date(a.start).getTime()).toBe(45 * 60_000)
  })

  it('offers the times in order, whatever order they were typed', () => {
    const { body } = buildProposal(
      form({ times: [{ date: '2026-09-16', time: '09:00' }, { date: '2026-09-15', time: '09:00' }] }),
      now
    )
    expect(new Date(body.slots[0].start) < new Date(body.slots[1].start)).toBe(true)
  })

  it('will not send a proposal with no time on it', () => {
    const { problems } = buildProposal(form({ times: [{ date: '', time: '' }] }), now)
    expect(problems[0]).toBe('Offer at least one time. Nobody can confirm an interview with no time on it.')
    expect(readyToSend(problems)).toBe(false)
  })

  it('will not send a proposal whose every time has passed', () => {
    const { problems } = buildProposal(form({ times: [{ date: '2026-09-13', time: '10:00' }] }), now)
    expect(problems[0]).toBe('Every time you offered has already passed.')
    expect(readyToSend(problems)).toBe(false)
  })

  it('drops a passed time, says so, and still sends the others', () => {
    const { body, problems } = buildProposal(
      form({ times: [{ date: '2026-09-13', time: '10:00' }, { date: '2026-09-15', time: '10:00' }] }),
      now
    )
    expect(body.slots).toHaveLength(1)
    expect(problems).toEqual(['One of those times has already passed — it will not be offered.'])
    expect(readyToSend(problems)).toBe(true)
  })

  it('ignores a half-typed time rather than sending nonsense', () => {
    const { body } = buildProposal(
      form({ times: [{ date: '2026-09-15', time: '' }, { date: '2026-09-15', time: '10:00' }] }),
      now
    )
    expect(body.slots).toHaveLength(1)
  })

  it('offers the same time once, however many times it was typed', () => {
    const { body } = buildProposal(
      form({ times: [{ date: '2026-09-15', time: '10:00' }, { date: '2026-09-15', time: '10:00' }] }),
      now
    )
    expect(body.slots).toHaveLength(1)
  })

  it('keeps the stage in the client\'s own word, and says Technical when they said nothing', () => {
    const named = buildProposal(form({ stage: '  Culture fit ', times: [{ date: '2026-09-15', time: '10:00' }] }), now)
    expect(named.body.stage).toBe('Culture fit')
    const blank = buildProposal(form({ stage: '', times: [{ date: '2026-09-15', time: '10:00' }] }), now)
    expect(blank.body.stage).toBe('Technical')
  })

  it('refuses a round shorter than fifteen minutes or longer than four hours', () => {
    for (const durationMins of [10, 300]) {
      const { problems } = buildProposal(form({ durationMins, times: [{ date: '2026-09-15', time: '10:00' }] }), now)
      expect(problems).toContain('Between fifteen minutes and four hours.')
      expect(readyToSend(problems)).toBe(false)
    }
  })

  it('names each interviewer once, trimmed, and nobody blank', () => {
    const { body } = buildProposal(
      form({ interviewers: [' Anita Shah ', 'Anita Shah', '', 'Marcus Oyelaran'], times: [{ date: '2026-09-15', time: '10:00' }] }),
      now
    )
    expect(body.interviewers).toEqual(['Anita Shah', 'Marcus Oyelaran'])
  })

  it('sends no location rather than an empty one', () => {
    const { body } = buildProposal(form({ location: '   ', times: [{ date: '2026-09-15', time: '10:00' }] }), now)
    expect(body.location).toBeNull()
  })
})
