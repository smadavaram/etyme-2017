import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

import { checkStatedTerms, hopZero, startOf, perHour, payRateIsNotTheBuyers, noDatesBefore, listingTerms, noneDueBeforeAward } from '@/lib/award/hire-terms'
import { placementStatus, PLACEMENT_WORDS } from '@/lib/award/placement-status'
import { tellSelected, awardHandoff } from '@/lib/papering'
import { tellPlaced, buySide } from '@/lib/award'
import { generateCycles } from '@/lib/cycle-generator'
import { submissionKindWord } from '@/app/dashboard/submissions/words'

/**
 * Hire terms and the award, from the outside chain audit of 2026-10-05,
 * section 6. Marisol Quintero granted Brightmoor a bench listing; the
 * award wrote "Brightmoor employs Marisol directly", W2, at $0, and she
 * was never asked. The placement started a week before the award, and
 * two screens disagreed about whether she was on site.
 */

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const NOW = new Date('2026-10-05T15:00:00Z')

describe('the person’s own terms — hop 0', () => {
  const base = { personName: 'Marisol Quintero', firmName: 'Brightmoor Staffing', ownCompany: null }

  it('a firm states W2 at $90 and it is written as employment at $90, paid by the firm', () => {
    const v = checkStatedTerms({ ...base, engagementType: 'W2', payRateCents: 9_000 })
    expect(v).toMatchObject({ ok: true, contractType: 'W2', vendorCompanyId: null, payRateCents: 9_000 })
    expect(v.ok && v.says).toBe('Brightmoor Staffing employs Marisol Quintero at $90/hr.')
  })

  it('an empty rate is refused in a sentence: a missing rate, not a free placement', () => {
    const v = checkStatedTerms({ ...base, engagementType: 'W2', payRateCents: 0 })
    expect(v.ok).toBe(false)
    expect(!v.ok && v.says).toMatch(/a missing rate, not a free placement/)
  })

  it('terms with no way of engaging the person are refused, and the refusal names the three choices', () => {
    const v = checkStatedTerms({ ...base, engagementType: null, payRateCents: 9_000 })
    expect(!v.ok && v.says).toMatch(/as an employee, as an independent contractor, or through their own company/)
  })

  it('an independent contractor is a 1099 line the firm pays directly', () => {
    const v = checkStatedTerms({ ...base, engagementType: 'IND_1099', payRateCents: 8_000 })
    expect(v).toMatchObject({ ok: true, contractType: 'IND_1099', vendorCompanyId: null })
  })

  it('through their own company is a corp-to-corp line to that company, and refused where they have none on record', () => {
    expect(checkStatedTerms({ ...base, engagementType: 'OWN_COMPANY', payRateCents: 9_500 }).ok).toBe(false)
    const v = checkStatedTerms({
      ...base, engagementType: 'OWN_COMPANY', payRateCents: 9_500,
      ownCompany: { id: 'quintero-llc', name: 'Quintero Controls LLC' },
    })
    expect(v).toMatchObject({ ok: true, contractType: 'C2C', vendorCompanyId: 'quintero-llc' })
  })

  it('employed by another firm is refused with the road that works: the employer puts them forward itself', () => {
    const v = checkStatedTerms({ ...base, engagementType: 'OTHER_EMPLOYER', payRateCents: 9_000 })
    expect(v.ok).toBe(false)
    expect(!v.ok && v.code).toBe('THROUGH_THE_EMPLOYER')
    expect(!v.ok && v.says).toMatch(/Ask the employer to put Marisol Quintero forward/)
  })

  const facts = { personName: 'Marisol Quintero', firmName: 'Brightmoor Staffing', employedByFirm: false }

  it('no pay line at all reads as terms pending, and it is the firm’s move', () => {
    const h = hopZero({ ...facts, line: null, paper: null })
    expect([h.onRecord, h.waitingOn]).toEqual([false, 'FIRM'])
  })

  it('a $0 pay line is a missing rate, never terms on record', () => {
    const h = hopZero({ ...facts, line: { payRateCents: 0 }, paper: null })
    expect(h.onRecord).toBe(false)
    expect(h.says).toMatch(/missing rate, not a free placement/)
  })

  it('the firm has offered and the person has not said yes: still pending, and it is her move', () => {
    const h = hopZero({ ...facts, line: { payRateCents: 9_000 }, paper: { firmSignedAt: NOW, personSignedAt: null } })
    expect([h.onRecord, h.waitingOn]).toEqual([false, 'PERSON'])
  })

  it('the person confirms W2 at $90, and only then are the terms on record', () => {
    const h = hopZero({ ...facts, line: { payRateCents: 9_000 }, paper: { firmSignedAt: NOW, personSignedAt: NOW } })
    expect(h.onRecord).toBe(true)
  })

  it('an employee is told, not asked: the firm’s word is enough where it employs them', () => {
    const h = hopZero({ ...facts, employedByFirm: true, line: { payRateCents: 9_000 }, paper: { firmSignedAt: NOW, personSignedAt: null } })
    expect(h.onRecord).toBe(true)
  })

  it('a chain that has not reached the person yet is pending below, not on record', () => {
    const h = hopZero({ ...facts, line: null, paper: null, stoppedAbove: 'Computer Systems Inc' })
    expect([h.onRecord, h.waitingOn]).toEqual([false, 'BELOW'])
  })

  it('a pay rate is printed per hour and a zero is never printed as a price', () => {
    expect(perHour(9_000)).toBe('$90/hr')
    expect(perHour(9_050)).toBe('$90.50/hr')
    expect(perHour(0)).toBeNull()
  })

  it('the buyer is told in a sentence that what the seller pays below it is not the buyer’s to set at the award', () => {
    expect(payRateIsNotTheBuyers({ sellerName: 'Techpeple', personName: 'Priya Raghunathan' }))
      .toMatch(/^What Techpeple pays for Priya Raghunathan is agreed between Techpeple and whoever it pays/)
  })
})

describe('the first day', () => {
  it('a start date before the award is refused unless the awarder says the work is already under way', () => {
    const v = startOf({ typed: new Date('2026-09-28'), neededBy: null, now: NOW, underWay: false, reason: null })
    expect(v.ok).toBe(false)
    expect(!v.ok && v.says).toBe(
      'A start date of Sep 28, 2026 is before today. Pick today or later, or tick "the work is already under way" and say why.'
    )
  })

  it('work already under way needs a reason, and the reason travels with the placement', () => {
    expect(startOf({ typed: new Date('2026-09-28'), neededBy: null, now: NOW, underWay: true, reason: '  ' }).ok).toBe(false)
    const v = startOf({ typed: new Date('2026-09-28'), neededBy: null, now: NOW, underWay: true, reason: 'Started on a handshake while the PO cleared.' })
    expect(v.ok && v.underWay).toEqual({ reason: 'Started on a handshake while the PO cleared.' })
  })

  it('today is not before the award', () => {
    expect(startOf({ typed: new Date('2026-10-05'), neededBy: null, now: NOW, underWay: false, reason: null }).ok).toBe(true)
  })

  it('with no date typed, a needed-by day already gone becomes today, never a day in the past', () => {
    const v = startOf({ typed: null, neededBy: new Date('2026-09-01'), now: NOW, underWay: false, reason: null })
    expect(v.ok && v.start.toISOString().slice(0, 10)).toBe('2026-10-05')
  })

  it('a placement whose work began before the award writes no reminder for a period that ended before today', () => {
    // NOW is the award; the floor is the day before it, so a week ending
    // yesterday is skipped and a week ending today is written.
    expect(noDatesBefore(NOW).toISOString().slice(0, 10)).toBe('2026-10-04')
  })

  it('with no date typed, a needed-by day still ahead is kept', () => {
    const v = startOf({ typed: null, neededBy: new Date('2026-10-19'), now: NOW, underWay: false, reason: null })
    expect(v.ok && v.start.toISOString().slice(0, 10)).toBe('2026-10-19')
  })
})

describe('one placement, one word', () => {
  const on = (state: string, start: string, terms = true, end: string | null = null) =>
    placementStatus({ state, startDate: new Date(start), endDate: end ? new Date(end) : null, termsOnRecord: terms }, NOW).word

  it('awarded with no terms on record reads "Awarded, terms pending", even with a start date already passed', () => {
    expect(on('DRAFT', '2026-09-28', false)).toBe('Awarded, terms pending')
  })

  it('terms agreed and nobody has cleared the start reads "Papers pending", never "On site"', () => {
    expect(on('DRAFT', '2026-09-28', true)).toBe('Papers pending')
    expect(on('PENDING_VERIFICATION', '2026-10-12', true)).toBe('Papers pending')
  })

  it('cleared and not yet begun reads "Ready to start"', () => {
    expect(on('VERIFIED', '2026-10-12', true)).toBe('Ready to start')
    expect(on('IN_PROGRESS', '2026-10-12', true)).toBe('Ready to start')
  })

  it('started reads "On site", and finished or called off reads "Ended"', () => {
    expect(on('IN_PROGRESS', '2026-09-01', true)).toBe('On site')
    expect(on('ENDED', '2026-01-01', true)).toBe('Ended')
    expect(on('CANCELLED', '2026-10-12', false)).toBe('Ended')
    expect(on('IN_PROGRESS', '2026-01-01', true, '2026-09-30')).toBe('Ended')
  })

  it('there are exactly five words', () => {
    expect(Object.values(PLACEMENT_WORDS)).toEqual(['Awarded, terms pending', 'Papers pending', 'Ready to start', 'On site', 'Ended'])
  })

  it('the contractor register and the program page both read the one function', () => {
    expect(src('src/app/api/people/route.ts')).toMatch(/placementStatus\(/)
    expect(src('src/app/api/program/route.ts')).toMatch(/placementStatus\(/)
    expect(src('src/app/api/submissions/[id]/award/route.ts')).toMatch(/placementStatus\(/)
  })
})

describe('the award travels down the chain', () => {
  it('each firm below is told its candidate was selected for the job as it knows it, by the firm it sold to, at its own rate', () => {
    const t = tellSelected({ personName: 'Ana Ruiz', roleTitle: 'Supply planning analyst', buyerName: 'Techpeple', rateCents: 11_500, currency: 'USD' })
    expect(t.title).toBe('Selected — Ana Ruiz for Supply planning analyst')
    expect(t.body).toBe(
      'Techpeple has a client decision: Ana Ruiz was selected for Supply planning analyst, at the $115/hr you asked. ' +
      'Techpeple places them with you next, and your contract desk is asked to paper it then.'
    )
  })

  it('the contract desk of a firm that pays the person is asked to state the terms first, not to paper a $0 line', () => {
    const h = awardHandoff(
      { personName: 'Marisol Quintero', clientName: 'Northbend Athletic', roleTitle: 'Controls engineer', rateCents: 14_000, currency: 'USD', startDate: null, termsHref: '/dashboard/submissions/s1/terms' },
      [{ personId: 'p1', personName: 'Ava', roleName: 'Contract Manager', permissions: ['assignments.write'] }]
    )
    expect(h.toPaper?.body).toMatch(/First say how your firm engages Marisol Quintero and what you pay them/)
    expect(h.toPaper?.body).toMatch(/nobody starts until both of you have/)
  })

  it('the person placed is told nothing starts until they agree their own terms, and is never told a rate', () => {
    const t = tellPlaced({ siteName: 'Northbend Athletic', supplierName: 'Brightmoor Staffing', roleTitle: 'Controls engineer', termsHref: '/x' })
    expect(t.body).toMatch(/Nothing starts until you and Brightmoor Staffing agree how you are engaged and what you are paid/)
    expect(t.body).not.toMatch(/\$/)
  })
})

describe('how they came is read off the chain', () => {
  it('a person a firm holds on its own bench reads "From our bench" to that firm, never "through a partner firm"', () => {
    expect(submissionKindWord('NETWORK', 'sent', { chained: false, through: null })).toBe('From our bench')
    expect(submissionKindWord('NETWORK', 'received', { chained: false, through: null })).toBe('From the supplier’s bench')
  })

  it('a person forwarded up a chain reads through the named supplier to the firm that bought from it, and unnamed to the client', () => {
    expect(submissionKindWord('NETWORK', 'sent', { chained: true, through: 'Techpeple' })).toBe('Through Techpeple')
    expect(submissionKindWord('NETWORK', 'received', { chained: true, through: null })).toBe('Through the supplier’s own supplier')
  })

  it('an employee reads as an employee whichever way the chain runs', () => {
    expect(submissionKindWord('INTERNAL', 'sent', { chained: false, through: null })).toBe('Our own employee')
  })
})

describe('the award route', () => {
  const route = src('src/app/api/submissions/[id]/award/route.ts')

  it('refuses a pay rate typed by the buyer rather than writing it as the seller’s cost', () => {
    expect(route).toMatch(/PAY_RATE_NOT_YOURS/)
    expect(route).not.toMatch(/agreedRateCents/)
  })

  it('keeps whether anybody was interviewed on the award’s own record, without refusing either way', () => {
    expect(route).toMatch(/placedWithoutInterview: roundsHeld === 0/)
  })
})

describe('terms carried on a bench listing', () => {
  const STATED = new Date('2026-10-01T10:00:00Z')
  const AGREED = new Date('2026-10-02T09:00:00Z')
  const base = {
    engagementType: 'W2', payRateCents: 9_500, statedAt: STATED, statedById: 'desk-1', agreedAt: AGREED,
    personName: 'Marisol Quintero', firmName: 'Brightmoor Staffing', ownCompany: null,
  }

  it('a listing whose terms the person agreed makes the award ready at once, written from the listing', () => {
    const l = listingTerms(base)
    expect(l.state).toBe('AGREED')
    if (l.state !== 'AGREED') return
    expect(l.terms).toMatchObject({ contractType: 'W2', vendorCompanyId: null, payRateCents: 9_500 })
    expect(l.says).toBe('Brightmoor Staffing employs Marisol Quintero at $95/hr. Marisol Quintero agreed these terms on Brightmoor Staffing’s bench listing.')

    const buy = buySide({
      awardedCompanyId: 'brightmoor', suppliedByCompanyId: null, suppliedRateCents: null,
      employedByAwardedFirm: false, currentPayCents: null,
      agreedOnListing: { contractType: l.terms.contractType, vendorCompanyId: null, payRateCents: 9_500, says: l.says },
    })
    expect(buy).toMatchObject({ write: true, contractType: 'W2', payRateCents: 9_500, hopZero: true, fromListing: true })
  })

  it('terms a firm stated after the person said yes are not agreed until she agrees them', () => {
    const l = listingTerms({ ...base, statedAt: new Date('2026-10-03T00:00:00Z') })
    expect(l).toEqual({
      state: 'PERSON',
      says: 'Brightmoor Staffing changed the terms on its bench listing after Marisol Quintero agreed them. Marisol Quintero has not agreed the new terms yet.',
    })
    const v = hopZero({ personName: 'Marisol Quintero', firmName: 'Brightmoor Staffing', line: null, paper: null, employedByFirm: false, listing: l })
    expect(v).toMatchObject({ onRecord: false, pending: 'PERSON', waitingOn: 'PERSON' })
  })

  it('terms stated on a listing and never agreed are the person’s move, and the award writes no pay line', () => {
    const l = listingTerms({ ...base, agreedAt: null })
    expect(l).toEqual({ state: 'PERSON', says: 'Marisol Quintero has not agreed the terms Brightmoor Staffing stated on its bench listing yet.' })
    const buy = buySide({ awardedCompanyId: 'brightmoor', suppliedByCompanyId: null, suppliedRateCents: null, agreedOnListing: null })
    expect(buy.write).toBe(false)
  })

  it('a listing with no terms on it changes nothing: the firm still states them after the award', () => {
    expect(listingTerms({ ...base, engagementType: null, payRateCents: null, statedAt: null, agreedAt: null })).toEqual({ state: 'NONE' })
    const v = hopZero({ personName: 'Marisol Quintero', firmName: 'Brightmoor Staffing', line: null, paper: null, employedByFirm: false, listing: { state: 'NONE' } })
    expect(v.says).toBe('Brightmoor Staffing has not said how it engages Marisol Quintero or what it pays them.')
  })

  it('a rate of nought on a listing is refused in the terms page’s own words, never written as a pay line', () => {
    const l = listingTerms({ ...base, payRateCents: 0 })
    expect(l.state).toBe('FIRM')
    if (l.state === 'FIRM') expect(l.says).toMatch(/An empty rate is a missing rate, not a free placement\./)
  })

  it('terms on a listing with no record of when they were stated are the firm’s to state again', () => {
    const l = listingTerms({ ...base, statedAt: null })
    expect(l.state).toBe('FIRM')
  })

  it('terms agreed on a listing after the award still need the pay line written; a listing never stands in for it', () => {
    const l = listingTerms(base)
    const v = hopZero({ personName: 'Marisol Quintero', firmName: 'Brightmoor Staffing', line: null, paper: null, employedByFirm: false, listing: l })
    expect(v).toMatchObject({ onRecord: false, pending: 'NO_LINE', waitingOn: 'FIRM' })
  })

  it('through her own company, the listing’s terms pay that company and raise no purchase order to her', () => {
    const l = listingTerms({ ...base, engagementType: 'OWN_COMPANY', ownCompany: { id: 'mq-llc', name: 'Quintero Controls LLC' } })
    expect(l.state).toBe('AGREED')
    if (l.state === 'AGREED') expect(l.terms).toMatchObject({ contractType: 'C2C', vendorCompanyId: 'mq-llc' })
    const route = src('src/app/api/submissions/[id]/award/route.ts')
    expect(route).toMatch(/const buyCeiling = buy\.write && buy\.vendorCompanyId && !buy\.hopZero/)
  })
})

describe('the reminders an award for work already under way writes', () => {
  // Work began Friday 4 September; the award is Sunday 4 October at 3pm.
  // The week ending Friday 2 October is approved Monday 5 October.
  const day = (s: string) => new Date(`${s}T00:00:00.000Z`)
  const APPROVE = [{ kind: 'TIMESHEET_APPROVE' as const, frequency: 'WEEKLY' as const, dayOfWeek: 5, offsetDays: 3 }]
  const awarded = new Date('2026-10-04T15:00:00Z')
  const dues = () =>
    generateCycles(day('2026-09-04'), day('2026-10-30'), APPROVE as any, [], new Map(), { noneDueBefore: noneDueBeforeAward(awarded) })
      .map((c) => c.dueOn.toISOString().slice(0, 10))

  it('the floor is the award’s own day at midnight UTC, not the day before', () => {
    expect(noneDueBeforeAward(awarded).toISOString()).toBe('2026-10-04T00:00:00.000Z')
  })

  it('the week that ended just before an under-way award still gets its approval reminder, due the day after', () => {
    expect(dues()[0]).toBe('2026-10-05')
  })

  it('no reminder is written that falls due before the award day', () => {
    expect(dues().every((d) => d >= '2026-10-04')).toBe(true)
  })

  it('the award and the terms page both bound their dates by the due day, from the award', () => {
    expect(src('src/app/api/submissions/[id]/award/route.ts')).toMatch(/noneDueBefore: noneDueBeforeAward\(awardedAt\)/)
    const terms = src('src/app/api/submissions/[id]/terms/route.ts')
    expect(terms).toMatch(/noneDueBefore: noneDueBeforeAward\(sell\.createdAt\)/)
    expect(terms).not.toMatch(/onlyPeriodsAfter/)
  })
})
