/**
 * Onboarding happens five times, and its checklist is derived, never
 * stored. A stored checklist and the database drift apart within a
 * month; a derived one is wrong for exactly one commit.
 */

import { describe, it, expect } from 'vitest'
import {
  clientChecklist, supplierChecklist, consultantChecklist, assignmentChecklist,
} from '@/lib/party-onboarding'

const client = (over = {}) => clientChecklist({
  name: 'Terumo', onRegister: true, contacts: 1, msaSigned: true,
  costCenters: 2, holidayCalendar: true, approvalRules: true, ...over,
})

describe('A checklist is derived from real state, never a list of ticked boxes', () => {

  it('a fully set up client says so in one line', () => {
    expect(client().ready).toBe(true)
    expect(client().says).toBe('Terumo is fully set up.')
  })

  it('one gap names the next thing to do, not just a count', () => {
    const c = client({ holidayCalendar: false })
    expect(c.ready).toBe(false)
    expect(c.says).toBe('Terumo: one thing left — holiday calendar.')
  })

  it('every item says why it matters and where to fix it', () => {
    for (const item of client({ contacts: 0 }).items) {
      expect(item.why.length, item.key).toBeGreaterThan(20)
      expect(item.href, item.key).toMatch(/^\/dashboard\//)
    }
  })

  it('the calendar item knows about February', () => {
    expect(client().items.find((i) => i.key === 'calendar')!.why).toContain('February')
  })
})

describe('A supplier with nothing on file is missing, never unknown-therefore-fine', () => {

  it('null insurance is MISSING — the 2017 expiry bug does not come back by the side door', () => {
    const s = supplierChecklist({
      name: 'Acme', onRegister: true, contacts: 1, msaSigned: true,
      insuranceCurrent: null, w9OnFile: true, remitToOnFile: true,
    })
    expect(s.items.find((i) => i.key === 'insurance')!.state).toBe('MISSING')
  })

  it('a payment run cannot reach a supplier with no account on file, and the item says so', () => {
    const s = supplierChecklist({
      name: 'Acme', onRegister: true, contacts: 1, msaSigned: true,
      insuranceCurrent: true, w9OnFile: true, remitToOnFile: false,
    })
    expect(s.items.find((i) => i.key === 'remit')!.why).toContain('payment run')
  })
})

describe('A consultant is onboarded when their consent and their pay are settled', () => {

  it('the listing item is about consent, in those words', () => {
    const c = consultantChecklist({
      name: 'Priya', profileComplete: true, listingGranted: false,
      buyContract: true, payModelSet: true, packetsComplete: true,
    })
    expect(c.items.find((i) => i.key === 'listing')!.why).toContain('Their consent, not your record')
  })

  it('no packet asked for yet is not a gap, and does not count against them', () => {
    const c = consultantChecklist({
      name: 'Priya', profileComplete: true, listingGranted: true,
      buyContract: true, payModelSet: true, packetsComplete: null,
    })
    expect(c.of).toBe(4)
    expect(c.ready).toBe(true)
  })
})

describe('An assignment stands on one fact: somebody confirmed the start', () => {

  it('billing before a confirmed start is billing on a guess, and the item says so', () => {
    const a = assignmentChecklist({
      label: 'Priya at Terumo', contractActive: true, cleared: true,
      startConfirmed: false, firstTimesheetIn: false,
    })
    expect(a.items.find((i) => i.key === 'start')!.why).toContain('every invoice stands on')
    expect(a.ready).toBe(false)
  })

  it('the first timesheet is a habit set in week one or chased forever', () => {
    const a = assignmentChecklist({
      label: 'Priya at Terumo', contractActive: true, cleared: true,
      startConfirmed: true, firstTimesheetIn: false,
    })
    expect(a.says).toContain('first timesheet in')
  })
})
