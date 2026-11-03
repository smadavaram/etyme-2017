import { describe, it, expect } from 'vitest'
import { othersSay, questionTitleFrom, type OtherWaiting } from '@/app/api/conversations/twin/ask'
import { TWIN_ACTS } from '@/lib/autonomy'

/**
 * Release walk three, 2026-11-03: Brightmoor's Owner read "… have two
 * questions to answer: Put a person on the firm’s own bench forward to a
 * job the firm was sent, at the rate the person saying yes enters. and
 * Put a person … enters..". The act kind's description is the role
 * contract's words for an act, never the name of one question.
 */
const other = (title: string, over: Partial<OtherWaiting> = {}): OtherWaiting => ({
  title, noun: 'question', desks: ['Recruiter', 'Resource Manager'], own: true, href: '/dashboard/twin',
  people: ['Marisa Delacroix', 'Tobias Ferrand'], ...over,
})

describe('what waits on somebody else is said by name, once', () => {
  it('a bench person to put forward is named by the person and the job, never by the act kind’s description', () => {
    expect(questionTitleFrom('bench.put_forward', { personName: 'Jonas Whitaker', jobTitle: 'HCM integration lead' })).toBe('Jonas Whitaker for HCM integration lead')
    expect(questionTitleFrom('bench.put_forward', {})).toBeNull()
    for (const [action, act] of Object.entries(TWIN_ACTS)) {
      expect(questionTitleFrom(action, {}), action).not.toBe(act.says)
    }
  })

  it('the Owner’s greeting names the two people Marisa is asked to put forward, with one full stop each', () => {
    const [line] = othersSay([other('Jonas Whitaker for HCM integration lead'), other('Delphine Delacroix for Cybersecurity analyst')])
    expect(line.says).toBe('Marisa Delacroix or Tobias Ferrand, recruiter or resource manager, have two questions to answer: Jonas Whitaker for HCM integration lead and Delphine Delacroix for Cybersecurity analyst. Etyme asked Marisa; they are not yours to answer.')
    expect(line.says).not.toContain('..')
    expect(line.says).not.toContain('. and')
  })

  it('a question that names nothing is counted and never described', () => {
    const [line] = othersSay([other(''), other('')])
    expect(line.says).toBe('Marisa Delacroix or Tobias Ferrand, recruiter or resource manager, have two questions to answer. Etyme asked Marisa; they are not yours to answer.')
    expect(line.links).toEqual([])
  })

  it('a title that ends in a full stop is said with one, and the same thing twice is named once', () => {
    const [line] = othersSay([other('Jonas Whitaker for HCM integration lead.'), other('Jonas Whitaker for HCM integration lead')])
    expect(line.says).toContain('two questions to answer: Jonas Whitaker for HCM integration lead. Etyme asked')
  })
})
