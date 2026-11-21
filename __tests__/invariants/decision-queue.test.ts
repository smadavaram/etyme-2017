import { describe, it, expect } from 'vitest'
import {
  mayOpenDecision, maySetHomePage, readOpenAsk, openBody, readDecideAsk, decideBody, agentRows, ageWords,
  ownPageOf, recordViewHref, readHomeAsk, FIRM_AGENTS, VERDICT_BUTTONS, PROOF_TYPES,
} from '@/lib/decision-queue'
import { sidebarPropsFrom, deskOf } from '@/components/shell/sidebar-props'

/** Record 107, Flow A: the decision queue's rules, without a database. */

const typed = { question: 'Approve the renewal?', ownerPersonId: 'p1', openedOn: '2025-10-05', actingEntityId: 'e1', proof: 'The letter.', proofLinks: [] }

describe('who opens a decision and who sets the first screen', () => {
  it('the Owner or an Admin may open a decision, and nobody else', () => {
    expect(mayOpenDecision('Owner')).toBeNull()
    expect(mayOpenDecision('Admin')).toBeNull()
    expect(mayOpenDecision('Account Manager')).toMatch(/Owner or an Admin/)
    expect(mayOpenDecision(null)).toMatch(/Owner or an Admin/)
  })

  it('only the Owner sets the first screen after sign-in', () => {
    expect(maySetHomePage('Owner')).toBeNull()
    expect(maySetHomePage('Admin')).toMatch(/Only the firm’s Owner/)
  })

  it('the first screen is the usual one or the decision queue, and a firm with entities names the one it changes it for', () => {
    expect(readHomeAsk({ homePage: 'DECISIONS' }, false)).toEqual({ ok: true, homePage: 'DECISIONS', actingEntityId: null })
    expect(readHomeAsk({ homePage: 'USUAL' }, false)).toEqual({ ok: true, homePage: null, actingEntityId: null })
    expect(readHomeAsk({ homePage: 'TODAY' }, false).ok).toBe(false)
    expect(readHomeAsk({ homePage: 'DECISIONS' }, true).ok).toBe(false)
  })
})

describe('opening a decision', () => {
  it('a decision without a question, an owner, a day it opened or its proof is refused in a sentence naming what is missing', () => {
    for (const [field, says] of [['question', /question/], ['ownerPersonId', /who owes/], ['openedOn', /day the decision opened/], ['proof', /what shows it is owed/]] as const) {
      const r = readOpenAsk({ ...openBody(typed), [field]: '' }, false)
      expect(r.ok).toBe(false)
      if (!r.ok) { expect(r.field).toBe(field); expect(r.says).toMatch(says) }
    }
  })

  it('the entity is never defaulted: a firm with entities must choose one', () => {
    const r = readOpenAsk(openBody({ ...typed, actingEntityId: '' }), true)
    expect(r.ok).toBe(false)
    expect(readOpenAsk(openBody(typed), true).ok).toBe(true)
  })

  it('a proof link names one of the five kinds of record, and a decision is not one of them', () => {
    expect(PROOF_TYPES.map((p) => p.label)).toEqual(['A company', 'A contract', 'A person on your list', 'An invoice receipt', 'A bill'])
    expect(readOpenAsk(openBody({ ...typed, proofLinks: [{ recordType: 'Invoice', recordId: 'i1' }] }), false).ok).toBe(true)
    expect(readOpenAsk(openBody({ ...typed, proofLinks: [{ recordType: 'DecisionItem', recordId: 'd1' }] }), false).ok).toBe(false)
    expect(readOpenAsk({ ...openBody(typed), proofLinks: [{ recordType: 'Timesheet', recordId: 't1' }] }, false).ok).toBe(false)
  })
})

describe('the three acts', () => {
  it('an item offers exactly three buttons: Approve, Send back and Reject', () => {
    expect(VERDICT_BUTTONS.map((b) => b.label)).toEqual(['Approve', 'Send back', 'Reject'])
  })

  it('approve needs no reason; send back and reject each need one line', () => {
    expect(readDecideAsk(decideBody('APPROVE', '', ''), false).ok).toBe(true)
    const back = readDecideAsk(decideBody('SEND_BACK', '  ', ''), false)
    expect(back.ok === false && back.says).toBe('Say in one line why it is sent back.')
    const no = readDecideAsk(decideBody('REJECT', '', ''), false)
    expect(no.ok === false && no.says).toBe('Say in one line why it is rejected.')
    expect(readDecideAsk(decideBody('REJECT', 'Too costly.', ''), false).ok).toBe(true)
  })

  it('a decider at a firm with entities chooses which one she decides for', () => {
    expect(readDecideAsk(decideBody('APPROVE', '', ''), true).ok).toBe(false)
    expect(readDecideAsk(decideBody('APPROVE', '', 'e1'), true).ok).toBe(true)
  })

  it('an age reads in whole days, “412 days”', () => {
    expect(ageWords(412)).toBe('412 days')
    expect(ageWords(1)).toBe('1 day')
    expect(ageWords(0)).toBe('Today')
  })
})

describe('agent control', () => {
  it('the six agents each read not enabled, a count of actions as the meter, and a cap not set', () => {
    const rows = agentRows([{ agentKey: 'digest-scanner', count: 2 }, { agentKey: null, count: 9 }])
    expect(rows.map((r) => r.name)).toEqual(FIRM_AGENTS.map((a) => a.name))
    expect(rows).toHaveLength(6)
    expect(rows.every((r) => r.state === 'Not enabled' && r.cap === 'Not set')).toBe(true)
    expect(rows.find((r) => r.key === 'digest-scanner')).toMatchObject({ actionsToday: 2, meter: '2 actions' })
    expect(rows.find((r) => r.key === 'census-keeper')).toMatchObject({ actionsToday: 0, meter: '0 actions' })
  })
})

describe('the record view', () => {
  it('every kind of record links to its own existing page', () => {
    expect(ownPageOf('SellContract', 'c1').href).toBe('/dashboard/placements/c1')
    expect(ownPageOf('Person', 'p1').href).toBe('/dashboard/people/p1')
    expect(ownPageOf('Invoice', 'i1').href).toBe('/dashboard/invoices/i1')
    expect(ownPageOf('DecisionItem', 'd1').href).toBe('/dashboard/decisions/d1')
    expect(recordViewHref('Company', 'x1')).toBe('/dashboard/records/Company/x1')
  })
})

describe('the session carries the firm’s home setting to the menu', () => {
  const base = { loading: false, contextType: 'EMPLOYEE' as const, isWorker: false, permissions: ['*'] }
  it('a seat at a firm whose home is the decision queue carries it to the sidebar and the header', () => {
    const session = { ...base, company: { id: 'c', name: 'Queue Firm', slug: 'q', kind: 'VENDOR' as const, homePage: 'DECISIONS' as const } }
    expect(sidebarPropsFrom(session as any).homePage).toBe('DECISIONS')
    expect(deskOf(session as any).homePage).toBe('DECISIONS')
  })

  it('a seat in a client’s program does not carry its own firm’s home setting there', () => {
    const session = { ...base, company: { id: 'c', name: 'MSP', slug: 'm', kind: 'MSP' as const, homePage: 'DECISIONS' as const }, seat: { clientId: 'k', clientName: 'Client', roleName: null, permissions: ['*'] } }
    expect(sidebarPropsFrom(session as any).homePage).toBeNull()
    expect(deskOf(session as any).homePage).toBeNull()
  })
})
