import { describe, it, expect } from 'vitest'
import {
  mayInvite, stateAfterAnswer, says, stepsOf, linkIsOpen, STATE_WORD, INVITE_STATES,
  type InviteState, type Answer,
} from '@/lib/contractor-invite'
import { inviteLetter } from '@/lib/contractor-link'

/**
 * Asking somebody you already know onto your network.
 *
 * The rules, without a database. What this file is really guarding is
 * the one thing the feature must never become: a way for a client to
 * engage a contractor directly. Every path through it ends with a
 * supplier holding the paper, and the tests below say so in the three
 * shapes an answer can take.
 */

const answer = (over: Partial<Answer> = {}): Answer => ({
  interested: true, represents: 'NOBODY', firmName: null, firmCompanyId: null,
  note: null, at: '2026-09-14T00:00:00.000Z', ...over,
})

describe('who may be asked', () => {
  const base = { email: 'lucia@example.com', name: 'Lucía Fernández', blockedReason: null, alreadyOnRegister: false, openInviteState: null }

  it('somebody the team knows, who no supplier has put forward, can be asked', () => {
    expect(mayInvite(base).ok).toBe(true)
  })

  it('a person this client barred does not come back through a side door, and is refused with the reason they were barred for', () => {
    const v = mayInvite({ ...base, blockedReason: 'Walked off a Terumo site with no notice.' })
    expect(v.ok).toBe(false)
    expect(v.ok === false && v.code).toBe('BLOCKED')
    expect(v.ok === false && v.message).toContain('Walked off a Terumo site')
    expect(v.ok === false && v.message).toContain('Lift the block first')
  })

  it('somebody already on the register is sent to "Ask for them" instead, by name, rather than asked twice', () => {
    const v = mayInvite({ ...base, alreadyOnRegister: true })
    expect(v.ok === false && v.code).toBe('ALREADY_HERE')
    expect(v.ok === false && v.message).toContain('Ask for them')
  })

  it('asking the same person twice is the same ask, and says where the first one got to', () => {
    const v = mayInvite({ ...base, openInviteState: 'NEEDS_SUPPLIER' })
    expect(v.ok === false && v.code).toBe('ALREADY_ASKED')
    expect(v.ok === false && v.message).toContain('Pending')
  })

  it('somebody who said no, or an ask that was withdrawn, can be asked again later', () => {
    for (const state of ['DECLINED', 'WITHDRAWN'] as InviteState[]) {
      expect(mayInvite({ ...base, openInviteState: state }).ok, state).toBe(true)
    }
  })

  it('an address that is not an address is caught before anybody is emailed', () => {
    expect(mayInvite({ ...base, email: 'lucia at example' }).ok).toBe(false)
  })
})

describe('where an answer takes it', () => {
  it('a firm the client has already approved carries it straight through', () => {
    expect(stateAfterAnswer({ interested: true, represents: 'ON_BENCH' })).toBe('REPRESENTED')
  })

  it('a firm the client does not have is not a shortcut into its supplier register — it waits for the client', () => {
    expect(stateAfterAnswer({ interested: true, represents: 'OTHER_FIRM' })).toBe('NEEDS_SUPPLIER')
  })

  it('nobody representing them waits for the client too, because the client may not engage them itself', () => {
    expect(stateAfterAnswer({ interested: true, represents: 'NOBODY' })).toBe('NEEDS_SUPPLIER')
  })

  it('somebody who is not looking ends it, and nothing chases them', () => {
    expect(stateAfterAnswer({ interested: false, represents: null })).toBe('DECLINED')
  })
})

describe('what the client reads on the row', () => {
  const of = (state: InviteState, over: Partial<{ answer: Answer | null; supplierName: string | null }> = {}) =>
    says({ state, name: 'Lucía Fernández', answer: over.answer ?? null, supplierName: over.supplierName ?? null })

  it('every state says what is happening in a sentence, never a state name', () => {
    for (const state of INVITE_STATES) {
      const line = of(state)
      expect(line.now, state).toMatch(/[a-z]{3,}\s+[a-z]{2,}/i)
      expect(line.now, state).not.toContain('_')
    }
  })

  it('only the two waiting on the client tell the client to do something', () => {
    const waiting = INVITE_STATES.filter((s) => of(s).next !== null)
    expect(waiting).toEqual(['NEEDS_SUPPLIER'])
  })

  it('a firm the client does not have is named, with both ways out of it', () => {
    const line = of('NEEDS_SUPPLIER', { answer: answer({ represents: 'OTHER_FIRM', firmName: 'Harbor Staffing' }) })
    expect(line.now).toContain('Harbor Staffing')
    expect(line.next).toContain('Recommend Harbor Staffing')
    expect(line.next).toContain('pick one of your own firms')
  })

  it('nobody representing them says the client contracts through suppliers, rather than leaving them to guess', () => {
    const line = of('NEEDS_SUPPLIER', { answer: answer({ represents: 'NOBODY' }) })
    expect(line.next).toContain('not directly')
  })

  it('the chip is the trade’s word for the step, never the stored state', () => {
    expect(STATE_WORD.NEEDS_SUPPLIER).toBe('Needs a supplier')
    expect(STATE_WORD.REPRESENTED).toBe('With their supplier')
    for (const state of INVITE_STATES) expect(STATE_WORD[state]).not.toContain('_')
  })
})

describe('the row’s four steps', () => {
  it('an ask nobody has answered is on the first step, with the rest still to come', () => {
    expect(stepsOf('ASKED').map((s) => s.status)).toEqual(['now', 'next', 'next', 'next'])
  })

  it('an answer that needs the client moves one step and stops there', () => {
    expect(stepsOf('NEEDS_SUPPLIER').map((s) => s.status)).toEqual(['done', 'now', 'next', 'next'])
  })

  it('a firm holding them is three steps in', () => {
    expect(stepsOf('REPRESENTED').map((s) => s.status)).toEqual(['done', 'done', 'now', 'next'])
  })

  it('somebody who said no shows where it stopped, not a half-finished chain', () => {
    const steps = stepsOf('DECLINED')
    expect(steps[1].label).toBe('Not interested')
    expect(steps.slice(2).every((s) => s.status === 'off')).toBe(true)
  })
})

describe('the link the person opens', () => {
  it('works while the ask is open and stops the moment they have answered', () => {
    expect(linkIsOpen('ASKED')).toBe(true)
    for (const state of INVITE_STATES.filter((s) => s !== 'ASKED')) {
      expect(linkIsOpen(state), state).toBe(false)
    }
  })

  it('the letter says who wants them, why, and that the client is not the employer — before it asks anything', () => {
    const letter = inviteLetter({
      name: 'Lucía Fernández', clientName: 'Nike', inviterName: 'Dana Roy',
      reason: 'Finished twelve months on our planning team and we would take her back.',
      token: 'abc',
    })
    expect(letter.subject).toContain('Nike')
    expect(letter.body).toContain('Dana Roy')
    expect(letter.body).toContain('planning team')
    expect(letter.body).toMatch(/rather than directly/)
    expect(letter.body).toContain('/welcome/abc')
    expect(letter.body).toMatch(/not looking/)
  })

  it('opens on their first name, because a letter to a stranger that opens "Hello," reads as a mailshot', () => {
    expect(inviteLetter({ name: 'Lucía Fernández', clientName: 'Nike', inviterName: 'D', reason: 'r', token: 't' }).body)
      .toMatch(/^Lucía,/)
  })
})

describe('the Pending list says what it holds', () => {
  it('Pending on Contractors is about people; Pending on Suppliers is about firms — the same word, two lists', async () => {
    const { emptyWord } = await import('@/components/network-view')
    expect(emptyWord('PENDING', null, 'people')).toContain('Ask somebody you already know')
    expect(emptyWord('PENDING', null, 'firms')).toContain('Recommend a supplier')
  })

  it('an empty Pending list on Contractors never shows the suppliers sentence', async () => {
    const { emptyWord } = await import('@/components/network-view')
    expect(emptyWord('PENDING', null, 'people')).not.toContain('desk has said yes')
  })
})
