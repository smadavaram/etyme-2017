import { describe, it, expect } from 'vitest'
import {
  AGREEMENT_STATUSES,
  EXPIRY_MILESTONES,
  STATUS_SAYS,
  addMonths,
  byCalendar,
  calendarStatus,
  daysUntilExpiry,
  executedOn,
  isRenewalKind,
  maySign,
  mayAmend,
  mayEnd,
  milestoneNow,
  milestoneSays,
  renewedExpiry,
  signingSays,
  termSays,
  termsOn,
  whatChanged,
  LAPSE_DESK,
  WORK_STARTED_STATES,
  lapseLetter,
  lapseNotices,
  saidKeyFor,
  type Term,
} from '@/lib/agreement-term'
import { WORK_STARTED_STATES as VERDICT_WORK_STARTED } from '@/app/api/program/agreements/verdict'
import { rolesFor } from '@/lib/company-defaults'
import { hasPermission } from '@/lib/permissions'

/**
 * A master agreement is the answer to "are we allowed to trade at all",
 * and until now it carried one date somebody typed. These are the rules
 * that give it a term, a standing and a signature with a person behind it.
 */

const NOW = new Date('2026-09-16T12:00:00.000Z')

function term(over: Partial<Term> = {}): Term {
  return {
    status: 'ACTIVE',
    effectiveDate: new Date('2025-01-01T00:00:00.000Z'),
    expiresAt: new Date('2027-01-01T00:00:00.000Z'),
    renewalKind: 'FIXED',
    renewalMonths: null,
    noticeDays: null,
    ...over,
  }
}

// ── The term ──────────────────────────────────────────────────────────

describe('An agreement has a term, and a term that nobody recorded says so', () => {

  it('an agreement with no end date recorded says nothing is on file, rather than looking like it runs forever', () => {
    const says = termSays(term({ expiresAt: null, renewalKind: 'FIXED' }), NOW)
    expect(says).toContain('No term on file')
    expect(says).toContain('Record the dates')
    expect(daysUntilExpiry(null, NOW)).toBeNull()
  })

  it('an agreement that runs out in the future says the date and how many days are left', () => {
    const says = termSays(term({ expiresAt: new Date('2026-10-16T12:00:00.000Z') }), NOW)
    expect(says).toContain('October 16, 2026')
    expect(says).toContain('30 days')
  })

  it('an agreement whose end date has passed reads as run out, and says how long ago', () => {
    const t = term({ expiresAt: new Date('2026-08-17T12:00:00.000Z') })
    expect(calendarStatus(t, NOW)).toBe('EXPIRED')
    expect(termSays(t, NOW)).toContain('30 days ago')
  })

  it('an agreement inside three months of its end date reads as running out, not as run out', () => {
    expect(calendarStatus(term({ expiresAt: new Date('2026-11-01T12:00:00.000Z') }), NOW)).toBe('EXPIRING')
    expect(calendarStatus(term({ expiresAt: new Date('2027-06-01T12:00:00.000Z') }), NOW)).toBe('ACTIVE')
  })

  it('an agreement that rolls on with no end date never runs out, and says how much notice either side owes', () => {
    const t = term({ renewalKind: 'EVERGREEN', expiresAt: null, noticeDays: 30 })
    expect(calendarStatus(t, NOW)).toBeNull()
    expect(termSays(t, NOW)).toContain('Rolls on with no end date')
    expect(termSays(t, NOW)).toContain('30 days notice')
  })

  it('an agreement that rolls on and says nothing about notice admits that nothing on file says it', () => {
    const says = termSays(term({ renewalKind: 'EVERGREEN', expiresAt: null }), NOW)
    expect(says).toContain('Nothing on file says how much notice')
  })

  it('an agreement that renews itself is never called lapsed on the day it reaches its date', () => {
    const t = term({
      renewalKind: 'AUTO_RENEW',
      renewalMonths: 12,
      expiresAt: new Date('2026-09-01T00:00:00.000Z'),
    })
    expect(calendarStatus(t, NOW)).toBeNull()
    expect(milestoneNow(t, NOW)).toBeNull()
  })

  it('an agreement that renews itself moves its end date on by the months it was written for', () => {
    const next = renewedExpiry(
      term({ renewalKind: 'AUTO_RENEW', renewalMonths: 12, expiresAt: new Date('2026-09-01T00:00:00.000Z') }),
      NOW
    )
    expect(next?.toISOString()).toBe('2027-09-01T00:00:00.000Z')
  })

  it('an agreement that renewed itself four terms ago while nobody was looking catches all the way up, not one term', () => {
    const next = renewedExpiry(
      term({ renewalKind: 'AUTO_RENEW', renewalMonths: 12, expiresAt: new Date('2022-09-01T00:00:00.000Z') }),
      NOW
    )
    expect(next?.toISOString()).toBe('2027-09-01T00:00:00.000Z')
  })

  it('an agreement renewing from the thirty-first of a month lands on the last day of a short one, never on the first of the next', () => {
    expect(addMonths(new Date('2026-01-31T00:00:00.000Z'), 1).toISOString()).toBe('2026-02-28T00:00:00.000Z')
    expect(addMonths(new Date('2028-01-31T00:00:00.000Z'), 1).toISOString()).toBe('2028-02-29T00:00:00.000Z')
  })

  it('an agreement somebody ended stays ended even after the date it would have expired', () => {
    const t = term({ status: 'TERMINATED', expiresAt: new Date('2020-01-01T00:00:00.000Z') })
    expect(byCalendar(t, NOW)).toBeNull()
    expect(termSays(t, NOW, new Date('2026-03-03T00:00:00.000Z'))).toContain('Ended on March 3, 2026')
  })

  it('the calendar only ever moves an agreement further along, so a draft is never promoted to live and a lapsed one never flips back', () => {
    // A placeholder with a far-off date stays a placeholder.
    expect(byCalendar(term({ status: 'DRAFT' }), NOW)).toBeNull()
    // A lapsed agreement whose date was later corrected is not quietly revived.
    expect(byCalendar(term({ status: 'EXPIRED' }), NOW)).toBeNull()
    // And one running out does move.
    expect(byCalendar(term({ expiresAt: new Date('2026-11-01T12:00:00.000Z') }), NOW)).toBe('EXPIRING')
  })

  it('every standing an agreement can be in explains itself in a sentence', () => {
    for (const status of AGREEMENT_STATUSES) {
      expect(STATUS_SAYS[status].length).toBeGreaterThan(30)
      expect(STATUS_SAYS[status]).not.toContain(status)
    }
  })
})

// ── Signing ───────────────────────────────────────────────────────────

describe('A signature is a person with a title, not a date somebody typed', () => {

  const good = {
    party: 'VENDOR',
    signerName: 'Dana Roth',
    signerTitle: 'VP, Delivery',
    signedAt: new Date('2026-09-01T00:00:00.000Z'),
    method: 'WET_INK',
  }

  it('an agreement is not signed until both sides have signed it', () => {
    expect(executedOn([{ party: 'VENDOR', signedAt: new Date('2026-03-01') }])).toBeNull()
    expect(signingSays([{ party: 'VENDOR', signedAt: new Date('2026-03-01') }])).toContain(
      'waiting on the client'
    )
    expect(signingSays([])).toBe('Nobody has signed it.')
  })

  it('an agreement signed in March and counter-signed in May was executed in May, never in March', () => {
    const when = executedOn([
      { party: 'VENDOR', signedAt: new Date('2026-03-01T00:00:00.000Z') },
      { party: 'CLIENT', signedAt: new Date('2026-05-01T00:00:00.000Z') },
    ])
    expect(when?.toISOString()).toBe('2026-05-01T00:00:00.000Z')
    expect(signingSays([
      { party: 'VENDOR', signedAt: new Date('2026-03-01') },
      { party: 'CLIENT', signedAt: new Date('2026-05-01') },
    ])).toBe('Signed by both sides.')
  })

  it('the same side cannot sign the same agreement twice, and is told to amend instead', () => {
    const verdict = maySign(good, [{ party: 'VENDOR', signedAt: new Date('2026-01-01') }], 'ACTIVE', NOW)
    expect(verdict.ok).toBe(false)
    expect(verdict.says).toContain('has already signed')
    expect(verdict.says).toContain('amendment')
  })

  it('a signature dated next month is refused, and the refusal says to use the date on the executed copy', () => {
    const verdict = maySign({ ...good, signedAt: new Date('2026-12-01') }, [], 'ACTIVE', NOW)
    expect(verdict.ok).toBe(false)
    expect(verdict.says).toContain('in the future')
  })

  it('a signature with nobody named behind it is refused, because it proves nothing', () => {
    const verdict = maySign({ ...good, signerName: '   ' }, [], 'ACTIVE', NOW)
    expect(verdict.ok).toBe(false)
    expect(verdict.says).toContain('Name the person who signed')
  })

  it('a signature with no title is refused, because whether the signer had authority is the first thing anybody asks', () => {
    const verdict = maySign({ ...good, signerTitle: '' }, [], 'ACTIVE', NOW)
    expect(verdict.ok).toBe(false)
    expect(verdict.says).toContain('authority')
  })

  it('a signature cannot be added to an agreement that was torn up, and the refusal says to record the new one', () => {
    const verdict = maySign(good, [], 'TERMINATED', NOW)
    expect(verdict.ok).toBe(false)
    expect(verdict.says).toContain('Record the new agreement')
  })

  it('a signature has to say which side signed', () => {
    expect(maySign({ ...good, party: 'BOTH' }, [], 'ACTIVE', NOW).ok).toBe(false)
    expect(maySign(good, [], 'ACTIVE', NOW).ok).toBe(true)
  })

  it('no refusal about a signature is ever a bare code — every one is a sentence saying what to do', () => {
    const refusals = [
      maySign(good, [], 'TERMINATED', NOW),
      maySign({ ...good, party: 'X' }, [], 'ACTIVE', NOW),
      maySign({ ...good, signerName: '' }, [], 'ACTIVE', NOW),
      maySign({ ...good, signerTitle: '' }, [], 'ACTIVE', NOW),
      maySign({ ...good, signedAt: null }, [], 'ACTIVE', NOW),
      maySign({ ...good, method: 'TELEPATHY' }, [], 'ACTIVE', NOW),
      mayEnd('TERMINATED', 'because'),
      mayEnd('ACTIVE', ''),
      mayAmend('TERMINATED'),
    ]
    for (const r of refusals) {
      expect(r.ok).toBe(false)
      expect(r.says).not.toMatch(/^[A-Z_]+$/)
      expect(r.says.split(' ').length).toBeGreaterThan(5)
    }
  })
})

// ── Ending one ────────────────────────────────────────────────────────

describe('An agreement can be ended, and ending one is recorded', () => {

  it('ending an agreement without saying why is refused', () => {
    const verdict = mayEnd('ACTIVE', '')
    expect(verdict.ok).toBe(false)
    expect(verdict.says).toContain('Say why')
  })

  it('an agreement already ended cannot be ended a second time', () => {
    expect(mayEnd('TERMINATED', 'Client moved to a new master').ok).toBe(false)
  })

  it('the terms of an agreement that was ended can no longer be changed, so a closed engagement cannot be rebilled', () => {
    const verdict = mayAmend('TERMINATED')
    expect(verdict.ok).toBe(false)
    expect(verdict.says).toContain('Record a new agreement')
    expect(mayAmend('ACTIVE').ok).toBe(true)
    expect(mayAmend('EXPIRED').ok).toBe(true)
  })
})

// ── The amendment trail ───────────────────────────────────────────────

describe('What the terms were on a day is a question with an answer', () => {

  const versions = [
    { version: 1, changedAt: new Date('2026-01-01T00:00:00.000Z'), paymentTerms: 30 },
    { version: 2, changedAt: new Date('2026-03-01T00:00:00.000Z'), paymentTerms: 45 },
    { version: 3, changedAt: new Date('2026-07-01T00:00:00.000Z'), paymentTerms: 60 },
  ]

  it('the terms in force on a given day are the ones the last amendment before that day left behind', () => {
    expect(termsOn(versions, new Date('2026-03-03T00:00:00.000Z'))?.paymentTerms).toBe(45)
    expect(termsOn(versions, new Date('2026-02-28T00:00:00.000Z'))?.paymentTerms).toBe(30)
    expect(termsOn(versions, new Date('2026-09-16T00:00:00.000Z'))?.paymentTerms).toBe(60)
  })

  it('the terms on the very day an amendment was made are the amended ones, not the old ones', () => {
    expect(termsOn(versions, new Date('2026-03-01T00:00:00.000Z'))?.paymentTerms).toBe(45)
  })

  it('asking what the terms were before the agreement existed returns nothing rather than today’s terms', () => {
    expect(termsOn(versions, new Date('2025-06-01T00:00:00.000Z'))).toBeNull()
    expect(termsOn([], new Date('2026-06-01T00:00:00.000Z'))).toBeNull()
  })
})

describe('An amendment says which terms moved, in the words a contract manager would use', () => {

  it('names the terms that moved and never a column name', () => {
    const changed = whatChanged(
      { paymentTerms: 30, minMarginPct: 20, capacity: null },
      { paymentTerms: 45, minMarginPct: 25 }
    )
    expect(changed).toEqual(['payment days', 'the margin floor'])
    for (const word of changed) expect(word).not.toMatch(/[a-z][A-Z]/)
  })

  it('an amendment that changes nothing is not an amendment', () => {
    expect(whatChanged({ paymentTerms: 30 }, { paymentTerms: 30 })).toEqual([])
  })

  it('re-saving a date that nobody touched does not record an amendment to it', () => {
    const same = new Date('2027-01-01T00:00:00.000Z')
    const again = new Date('2027-01-01T00:00:00.000Z')
    expect(whatChanged({ expiresAt: same }, { expiresAt: again })).toEqual([])
    expect(whatChanged({ expiresAt: same }, { expiresAt: new Date('2028-01-01') })).toEqual([
      'the day it runs out',
    ])
  })

  it('setting a term that had nothing on file counts as a change, and clearing one does too', () => {
    expect(whatChanged({ expiresAt: null }, { expiresAt: new Date('2027-01-01') })).toEqual([
      'the day it runs out',
    ])
    expect(whatChanged({ capacity: 10 }, { capacity: null })).toEqual(['how many people it allows'])
  })
})

// ── Who is told ───────────────────────────────────────────────────────

describe('Somebody is told before the agreement above their placements runs out', () => {

  it('warns at ninety, sixty and thirty days, and once on the day it has run out', () => {
    expect(EXPIRY_MILESTONES).toEqual([90, 60, 30, 0])
    expect(milestoneNow(term({ expiresAt: new Date('2026-12-14T12:00:00.000Z') }), NOW)).toBe(90)
    expect(milestoneNow(term({ expiresAt: new Date('2026-10-30T12:00:00.000Z') }), NOW)).toBe(60)
    expect(milestoneNow(term({ expiresAt: new Date('2026-10-10T12:00:00.000Z') }), NOW)).toBe(30)
    expect(milestoneNow(term({ expiresAt: new Date('2026-09-01T12:00:00.000Z') }), NOW)).toBe(0)
  })

  it('says only the tightest warning it is inside, so a forty-five day agreement is not warned about at ninety days', () => {
    expect(milestoneNow(term({ expiresAt: new Date('2026-10-31T12:00:00.000Z') }), NOW)).toBe(60)
  })

  it('says nothing at all about an agreement that is nowhere near its end, or one nobody gave a term', () => {
    expect(milestoneNow(term({ expiresAt: new Date('2028-01-01') }), NOW)).toBeNull()
    expect(milestoneNow(term({ expiresAt: null }), NOW)).toBeNull()
    expect(milestoneNow(term({ renewalKind: 'EVERGREEN' }), NOW)).toBeNull()
    expect(milestoneNow(term({ status: 'TERMINATED', expiresAt: new Date('2026-09-01') }), NOW)).toBeNull()
  })

  it('what the reader is told names the client, the date and what to do about it', () => {
    const soon = milestoneSays('Northbend Athletic', term({ expiresAt: new Date('2026-10-10T12:00:00.000Z') }), NOW)
    expect(soon?.title).toContain('Northbend Athletic')
    expect(soon?.title).toContain('24 days')
    expect(soon?.body).toContain('Start the renewal')

    const gone = milestoneSays('Northbend Athletic', term({ expiresAt: new Date('2026-09-01T12:00:00.000Z') }), NOW)
    expect(gone?.title).toContain('has run out')
    expect(gone?.body).toContain('lapsed paper')
  })

  it('only the three ways an agreement can renew are accepted, so a typo cannot become a renewal rule', () => {
    expect(isRenewalKind('FIXED')).toBe(true)
    expect(isRenewalKind('EVERGREEN')).toBe(true)
    expect(isRenewalKind('AUTO_RENEW')).toBe(true)
    expect(isRenewalKind('PERPETUAL')).toBe(false)
  })
})


// ── Both signers hear ─────────────────────────────────────────────────

describe('an agreement running out is told to the two firms that signed it', () => {
  const running = term({ expiresAt: new Date('2026-10-10T12:00:00.000Z') })
  const lapsed = term({ expiresAt: new Date('2026-09-01T12:00:00.000Z') })

  /**
   * A reader the notices can be handed to, in place of Prisma. Only three
   * tables are read, and each answer is stated in the test rather than
   * seeded, so a sentence here fails for one reason.
   */
  const reader = (over: {
    seats?: Record<string, { personId: string; permissions: string[] }[]>
    lines?: { personId: string; state: string }[]
  } = {}) => ({
    company: {
      findMany: async () => [
        { id: 'brightmoor', name: 'Brightmoor Staffing' },
        { id: 'northbend', name: 'Northbend Athletic' },
        { id: 'wrenfield', name: 'Wrenfield Technical' },
      ],
    },
    context: {
      findMany: async (args: any) =>
        (over.seats?.[args.where.companyId] ?? []).map((s) => ({
          personId: s.personId,
          role: { permissions: s.permissions },
        })),
    },
    sellContract: { findMany: async () => over.lines ?? [] },
  })

  const deal = { id: 'msa1', vendorId: 'brightmoor', clientId: 'northbend', ...running }
  const bothDesks = {
    brightmoor: [{ personId: 'contract-manager', permissions: ['rates.write'] }],
    northbend: [
      { personId: 'program-manager', permissions: ['governance.write'] },
      { personId: 'ap-clerk', permissions: ['payments.record', 'invoices.read'] },
    ],
  }

  it('an agreement running out is told to both firms that signed it, each in its own words', async () => {
    const out = await lapseNotices(reader({ seats: bothDesks, lines: [{ personId: 'p1', state: 'IN_PROGRESS' }] }) as any, deal, NOW)
    expect(out.map((n) => n.personId).sort()).toEqual(['contract-manager', 'program-manager'])

    const supplier = out.find((n) => n.data.side === 'VENDOR')!
    expect(supplier.companyId).toBe('brightmoor')
    expect(supplier.title).toBe('Your agreement with Northbend Athletic runs out in 24 days')
    expect(supplier.body).toContain('Start the renewal now')

    const client = out.find((n) => n.data.side === 'CLIENT')!
    expect(client.companyId).toBe('northbend')
    expect(client.title).toBe('Your agreement with Brightmoor Staffing runs out in 24 days')
    expect(client.body).toContain('Ask Brightmoor Staffing for the renewal')
  })

  it('a client is told how many people are on its sites under the agreement that is running out', async () => {
    const lines = [
      { personId: 'helena', state: 'IN_PROGRESS' },
      { personId: 'aisha', state: 'PAUSED' },
      { personId: 'helena', state: 'IN_PROGRESS' },
      { personId: 'gone', state: 'ENDED' },
    ]
    const out = await lapseNotices(reader({ seats: bothDesks, lines }) as any, deal, NOW)
    const client = out.find((n) => n.data.side === 'CLIENT')!
    expect(client.body).toContain('2 people are on your sites under it')
    expect(client.data.peopleOnSite).toBe(2)
    // The supplier's letter is a commercial one and carries no head count.
    expect(out.find((n) => n.data.side === 'VENDOR')!.body).not.toContain('on your sites')
  })

  it('one person on one contract reads as a person, not as 1 people', async () => {
    const out = await lapseNotices(reader({ seats: bothDesks, lines: [{ personId: 'helena', state: 'IN_PROGRESS' }] }) as any, deal, NOW)
    expect(out.find((n) => n.data.side === 'CLIENT')!.body).toContain('1 person is on your sites under it')
  })

  it('where nothing links anybody to the agreement the client is told no count at all, rather than told nobody is there', async () => {
    const out = await lapseNotices(reader({ seats: bothDesks, lines: [] }) as any, deal, NOW)
    const client = out.find((n) => n.data.side === 'CLIENT')!
    expect(client.data.peopleOnSite).toBeNull()
    expect(client.body).not.toContain('on your sites')
    expect(client.body).not.toContain('nobody')

    // And where contracts are linked and none is live, nobody is the answer.
    const none = await lapseNotices(reader({ seats: bothDesks, lines: [{ personId: 'x', state: 'ENDED' }] }) as any, deal, NOW)
    expect(none.find((n) => n.data.side === 'CLIENT')!.body).toContain('nobody is on your sites under it today')
  })

  it('a sub-vendor\u2019s agreement with its prime is told to those two firms and never to the client', async () => {
    // Wrenfield sells to Brightmoor, who sells to Northbend. The paper
    // between the two suppliers is theirs, and the client is not on it.
    const chain = { id: 'msa2', vendorId: 'wrenfield', clientId: 'brightmoor', ...running }
    const out = await lapseNotices(
      reader({
        seats: {
          wrenfield: [{ personId: 'wrenfield-owner', permissions: ['*'] }],
          brightmoor: [{ personId: 'brightmoor-compliance', permissions: ['privacy.manage'] }],
          northbend: [{ personId: 'program-manager', permissions: ['governance.write'] }],
        },
        lines: [{ personId: 'p', state: 'IN_PROGRESS' }],
      }) as any,
      chain,
      NOW
    )
    expect(out.map((n) => n.companyId).sort()).toEqual(['brightmoor', 'wrenfield'])
    expect(out.map((n) => n.personId)).not.toContain('program-manager')
    for (const n of out) expect(JSON.stringify(n)).not.toContain('Northbend')
  })

  it('the desk that hears at each firm is read from what it may do, never from what its role is called', () => {
    expect(LAPSE_DESK.VENDOR).toEqual(['rates.write', 'settings.manage'])
    expect(LAPSE_DESK.CLIENT).toEqual(['governance.write', 'privacy.manage'])

    const clientRoles = rolesFor('CLIENT')
    const hears = (name: string) =>
      LAPSE_DESK.CLIENT.some((p) => hasPermission(clientRoles.find((r) => r.name === name)!.permissions, p))
    expect(hears('Program Manager')).toBe(true)
    expect(hears('Compliance Officer')).toBe(true)
    expect(hears('Owner')).toBe(true)
    // Not the desks that cannot renew a thing.
    expect(hears('AP Clerk')).toBe(false)
    expect(hears('Hiring Manager')).toBe(false)
    expect(hears('Viewer')).toBe(false)
  })

  it('an owner whose role is the wildcard hears, because a permission is asked for rather than matched as a string', async () => {
    const out = await lapseNotices(
      reader({ seats: { brightmoor: [{ personId: 'founder', permissions: ['*'] }], northbend: [{ personId: 'pm', permissions: ['*'] }] } }) as any,
      deal,
      NOW
    )
    expect(out.map((n) => n.personId).sort()).toEqual(['founder', 'pm'])
  })

  it('an agreement that has already run out tells both sides it has, not that it is about to', async () => {
    const out = await lapseNotices(
      reader({ seats: bothDesks, lines: [{ personId: 'helena', state: 'IN_PROGRESS' }] }) as any,
      { id: 'msa3', vendorId: 'brightmoor', clientId: 'northbend', ...lapsed },
      NOW
    )
    expect(out).toHaveLength(2)
    for (const n of out) {
      expect(n.title).toContain('has run out')
      expect(n.data.milestone).toBe(0)
      expect(n.body).toContain('lapsed paper')
    }
    expect(out.find((n) => n.data.side === 'CLIENT')!.body).toContain('1 person is on your sites under it')
  })

  it('a side already told this milestone is not told again, and the supplier\u2019s key is the one the watch has always written', async () => {
    expect(saidKeyFor('msa1', 30, 'VENDOR')).toBe('msa1:30')
    expect(saidKeyFor('msa1', 30, 'CLIENT')).toBe('msa1:30:CLIENT')
    const told = new Set(['msa1:30'])
    const out = await lapseNotices(reader({ seats: bothDesks }) as any, { id: 'msa1', vendorId: 'brightmoor', clientId: 'northbend', ...term({ expiresAt: new Date('2026-10-10T12:00:00.000Z') }) }, NOW, told)
    expect(out.every((n) => n.data.side === 'CLIENT')).toBe(true)
  })

  it('an agreement nowhere near its end tells nobody anything', async () => {
    const out = await lapseNotices(
      reader({ seats: bothDesks }) as any,
      { id: 'msa4', vendorId: 'brightmoor', clientId: 'northbend', ...term({ expiresAt: new Date('2028-01-01') }) },
      NOW
    )
    expect(out).toEqual([])
  })

  it('a firm with nobody on a desk that could renew it is not mailed somebody who would only forward it', async () => {
    const out = await lapseNotices(
      reader({ seats: { brightmoor: [{ personId: 'recruiter', permissions: ['submissions.create'] }], northbend: [{ personId: 'pm', permissions: ['governance.write'] }] } }) as any,
      deal,
      NOW
    )
    expect(out.map((n) => n.personId)).toEqual(['pm'])
  })

  it('who counts as on site is the same two states the rest of the agreement screen counts', () => {
    expect([...WORK_STARTED_STATES]).toEqual([...VERDICT_WORK_STARTED])
  })

  it('the supplier\u2019s letter and the milestone line are the same words, so the two sides cannot drift', () => {
    expect(milestoneSays('Northbend Athletic', running, NOW)).toEqual(
      lapseLetter({ side: 'VENDOR', counterpartyName: 'Northbend Athletic', term: running, now: NOW })
    )
  })
})
