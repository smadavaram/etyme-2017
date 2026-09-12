import { describe, it, expect } from 'vitest'
import { noticesFor, type NoticeContext } from '@/lib/interview-notices'

/**
 * Who hears about a round, and who does not.
 *
 * Three diaries; until this existed none of them heard from the other
 * two. The rules are read here as sentences so the next person to add
 * an event can see who it reaches before they ship it.
 */

const ctx: NoticeContext = {
  interviewId: 'iv1',
  submissionId: 'sub1',
  round: 2,
  stage: 'Technical',
  role: 'Workday integrator',
  consultant: { id: 'p-priya', name: 'Priya Raman' },
  client: { id: 'c-nike', name: 'Nike' },
  vendor: { id: 'c-cloudepa', name: 'CloudEPA' },
  requesterId: 'p-dana',
  vendorStaffIds: ['p-bench', 'p-recruiter'],
  slotCount: 3,
  when: new Date('2026-09-15T10:00:00Z'),
  reason: null,
  noShowBy: null,
  timezone: 'UTC',
}

const to = (event: Parameters<typeof noticesFor>[0], c: NoticeContext = ctx) =>
  noticesFor(event, c).map((n) => n.personId).sort()

describe('when a client proposes a round', () => {
  it('the supplier\'s people hear in the app, and the candidate by email', () => {
    const notices = noticesFor('PROPOSED', ctx)
    expect(to('PROPOSED')).toEqual(['p-bench', 'p-priya', 'p-recruiter'])
    const candidate = notices.find((n) => n.personId === 'p-priya')!
    expect(candidate.channel).toBe('EMAIL')
    expect(notices.filter((n) => n.personId !== 'p-priya').every((n) => (n.channel ?? 'IN_APP') === 'IN_APP')).toBe(true)
  })

  it('says which client, which round, what for, and how many times were offered', () => {
    const [vendor] = noticesFor('PROPOSED', ctx)
    expect(vendor.title).toBe('Nike wants to interview Priya Raman')
    expect(vendor.body).toContain('Technical, round 2, for Workday integrator')
    expect(vendor.body).toContain('3 times offered')
  })

  it('does not tell the client — they asked', () => {
    expect(to('PROPOSED')).not.toContain('p-dana')
  })
})

describe('when the supplier confirms', () => {
  it('the person who asked hears, with the time that stuck', () => {
    const notices = noticesFor('CONFIRMED', ctx)
    expect(to('CONFIRMED')).toEqual(['p-dana'])
    expect(notices[0].title).toBe('CloudEPA confirmed Priya Raman')
    expect(notices[0].body).toMatch(/Tue,? 15 Sept?,? 10:00/)
  })
})

describe('when the candidate answers for themselves', () => {
  it('both the client who asked and the supplier hear a yes', () => {
    expect(to('ANSWERED_YES')).toEqual(['p-bench', 'p-dana', 'p-recruiter'])
  })

  it('a no carries their words and tells the client what to do next', () => {
    const notices = noticesFor('ANSWERED_NO', { ...ctx, reason: 'I start a new contract that week.' })
    const client = notices.find((n) => n.personId === 'p-dana')!
    expect(client.body).toContain('They said: I start a new contract that week.')
    expect(client.body).toContain('Offer other times')
  })

  it('never tells the candidate about their own answer', () => {
    expect(to('ANSWERED_YES')).not.toContain('p-priya')
    expect(to('ANSWERED_NO')).not.toContain('p-priya')
  })
})

describe('when the client decides', () => {
  it('through to the next round: the supplier and the candidate hear, with the next number', () => {
    const notices = noticesFor('ADVANCED', ctx)
    expect(to('ADVANCED')).toEqual(['p-bench', 'p-priya', 'p-recruiter'])
    expect(notices.find((n) => n.personId === 'p-bench')!.title).toContain('round 3')
  })

  it('an offer: the supplier hears; the award follows from the submission', () => {
    expect(to('OFFERED')).toEqual(['p-bench', 'p-recruiter'])
  })

  it('not going forward: the supplier hears the outcome and is asked to tell the candidate', () => {
    const notices = noticesFor('REJECTED', ctx)
    expect(to('REJECTED')).toEqual(['p-bench', 'p-recruiter'])
    expect(notices[0].body).toContain('Please let Priya know')
  })

  it('the client\'s notes never leave the client — no notice carries feedback', () => {
    // The context has no feedback field at all, by design: nothing here
    // can put the interviewer's notes in front of the supplier.
    expect('feedback' in ctx).toBe(false)
    for (const event of ['ADVANCED', 'OFFERED', 'REJECTED'] as const) {
      for (const n of noticesFor(event, ctx)) expect(n.body).not.toMatch(/feedback|notes/i)
    }
  })

  it('a rejection does not reach the candidate from us — that is the supplier\'s call to make', () => {
    expect(to('REJECTED')).not.toContain('p-priya')
  })
})

describe('when nobody turns up', () => {
  it('the side that did turn up is told who did not', () => {
    const notices = noticesFor('NO_SHOW', { ...ctx, noShowBy: 'CONSULTANT' })
    expect(to('NO_SHOW', { ...ctx, noShowBy: 'CONSULTANT' })).toEqual(['p-bench', 'p-dana', 'p-recruiter'])
    expect(notices[0].body).toContain('Priya Raman did not turn up')
  })

  it('a client that did not turn up is not told about itself', () => {
    expect(to('NO_SHOW', { ...ctx, noShowBy: 'CLIENT' })).toEqual(['p-bench', 'p-recruiter'])
  })
})

describe('whoever hears, hears once', () => {
  it('a requester who is also on the supplier\'s staff gets one row', () => {
    const shared = { ...ctx, vendorStaffIds: ['p-dana', 'p-bench'] }
    expect(to('ANSWERED_YES', shared)).toEqual(['p-bench', 'p-dana'])
  })

  it('every notice is an INTERVIEW pointing at the round', () => {
    for (const n of noticesFor('PROPOSED', ctx)) {
      expect(n.type).toBe('INTERVIEW')
      expect(n.entityId).toBe('iv1')
      expect(n.data).toMatchObject({ interviewId: 'iv1', submissionId: 'sub1', round: 2, event: 'PROPOSED' })
    }
  })
})
