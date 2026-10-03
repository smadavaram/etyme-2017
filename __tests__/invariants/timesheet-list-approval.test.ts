import { describe, it, expect } from 'vitest'
import {
  letterToApprover, sentFromOf, whoAskedSentence, approvalWordsReadLog, linkExpiresAt,
} from '@/app/api/timesheets/approval-by-email'

/**
 * The timesheet list and the letter to the client's approver, after
 * approve-by-email (CLAUDE.md, "A client may approve by email, and the
 * proof travels down the chain"; "A sub-vendor's name is the prime's to
 * keep").
 *
 * Helena Marsh works at Northbend Athletic. Northbend pays Computer
 * Systems Inc; Computer Systems buys her from CloudEPA, which employs her.
 * Northbend's approver may be told Computer Systems and nobody below it.
 */

const NOW = new Date('2026-09-30T12:00:00Z')
const base = {
  approverName: 'Dana Whitfield', personName: 'Helena Marsh', clientName: 'Northbend Athletic',
  period: 'Sep 20 – Sep 26', hours: 40, url: 'https://etyme.example/answer/week/abc',
  expiresAt: linkExpiresAt(NOW), now: NOW,
}

describe('who asked for the letter to the client’s approver', () => {
  it('a link the worker sent names her and the supplier the client pays', () => {
    const l = letterToApprover({ ...base, senderName: 'Helena Marsh', senderFirm: 'Computer Systems Inc' })
    expect(l.body).toContain('Helena Marsh at Computer Systems Inc asked us to send you the week to approve.')
  })

  it('a link sent by a timesheet desk below the client’s supplier names neither that desk nor its firm, and says to ask the supplier the client pays', () => {
    const l = letterToApprover({ ...base, senderName: 'x', senderFirm: 'y', sentFrom: { kind: 'BELOW', askFirm: 'Computer Systems Inc' } })
    expect(l.body).toContain(
      'Helena Marsh’s supplier asked us to send you the week to approve. If anything in it looks wrong, ask Computer Systems Inc.'
    )
    expect(l.body).not.toContain('CloudEPA')
    expect(l.body).not.toContain('timesheet desk')
    expect(l.body).not.toContain('side of this placement')
  })

  it('the letter reads a desk below plainly from the names the week’s door hands over today', () => {
    expect(sentFromOf('The timesheet desk', 'Computer Systems Inc’s side of this placement'))
      .toEqual({ kind: 'BELOW', askFirm: 'Computer Systems Inc' })
    const l = letterToApprover({ ...base, senderName: 'The timesheet desk', senderFirm: 'Computer Systems Inc’s side of this placement' })
    expect(l.body).not.toContain('The timesheet desk at')
    expect(l.body).toContain('If anything in it looks wrong, ask Computer Systems Inc.')
  })

  it('a person who happens to be named like a desk at a firm the client pays is still named', () => {
    expect(sentFromOf('The timesheet desk', 'Computer Systems Inc'))
      .toEqual({ kind: 'NAMED', name: 'The timesheet desk', firm: 'Computer Systems Inc' })
  })

  it('the letter from a desk below carries the hours and never a rate', () => {
    const l = letterToApprover({ ...base, senderName: 'x', senderFirm: 'y', sentFrom: { kind: 'BELOW', askFirm: 'Computer Systems Inc' } })
    expect(l.body).toContain('Helena Marsh worked 40 hours for Northbend Athletic')
    expect(l.body).not.toMatch(/\$|rate/i)
  })

  it('the sentence that says who asked is one sentence for each case', () => {
    expect(whoAskedSentence({ kind: 'NAMED', name: 'Priya Raman', firm: 'Computer Systems Inc' }, 'Helena Marsh'))
      .toBe('Priya Raman at Computer Systems Inc asked us to send you the week to approve.')
  })
})

describe('reading who approved a week on a list', () => {
  const reader = { personId: 'marcus', companyId: 'northbend' }
  const week = { personId: 'helena' }

  it('a reader shown the approval sentence leaves an access log row naming the worker as the subject', () => {
    expect(approvalWordsReadLog(reader, week, true)).toEqual({
      subjectId: 'helena', actorPersonId: 'marcus', actorCompanyId: 'northbend',
      action: 'WEEK_APPROVAL_WORDS_VIEW', allowed: true, reason: null,
    })
  })

  it('a reader not shown it is logged as refused, with the reason in a sentence', () => {
    const row = approvalWordsReadLog(reader, week, false)
    expect(row.allowed).toBe(false)
    expect(row.reason).toBe('This approval was not attached to a contract your company is on.')
  })
})
