import { describe, it, expect } from 'vitest'
import {
  CONTRACT_LABELS, PETITION_LINES, PROPOSED_ACCESS_FILE_WORKING_DAYS, PROPOSED_NOTICE_WORKING_DAYS, PROPOSED_PACK_LEAD_DAYS,
  accessFileReadyBy, accessFileWords, addWorkingDays, approvedLate, contractItemsFor, crossedWarning, daysFromTo, driftWords,
  judgeContractItem, noticeEndsOn, noticePeriodOver, noticeWords, packCompleteWords, packDue, packWords, placementWords, petitionComplete, petitionMissing,
  PROPOSED_NOTICE_LEAD_DAYS, noticeTiming, noticeTimingWords, petitionListFor, PETITION_LISTS, removedEarly, signatureWords, tenureWords, windowInside, type LineFacts,
} from '@/lib/agents/checklist-rules'

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const SAT_SUN = [0, 6]
const none = new Set<string>()

const line = (over: Partial<LineFacts> = {}): LineFacts => ({
  billRateCents: 12_500, billCurrency: 'USD', paymentTerms: 30, startDate: d('2026-12-01'), endDate: d('2027-05-31'), msa: null, order: null, sow: null, ...over,
})

describe('working days', () => {
  it('ten working days after a Monday is the Monday two weeks later', () => {
    expect(addWorkingDays(d('2026-11-23'), 10, SAT_SUN, none).toISOString().slice(0, 10)).toBe('2026-12-07')
  })
  it('a holiday on the firm’s calendar is not a working day, so the period runs a day longer', () => {
    expect(addWorkingDays(d('2026-11-23'), 10, SAT_SUN, new Set(['2026-11-26'])).toISOString().slice(0, 10)).toBe('2026-12-08')
  })
  it('one working day after a Friday is the Monday', () => {
    expect(addWorkingDays(d('2026-11-27'), 1, SAT_SUN, none).toISOString().slice(0, 10)).toBe('2026-11-30')
  })
  it('the firm’s own days off are honored, not a fixed weekend', () => {
    // A firm off on Friday and Saturday: one working day after a Thursday is the Sunday.
    expect(addWorkingDays(d('2026-11-26'), 1, [5, 6], none).toISOString().slice(0, 10)).toBe('2026-11-29')
  })
  it('the proposals are ten working days for a notice, one for the access file and five days for the pack', () => {
    expect([PROPOSED_NOTICE_WORKING_DAYS, PROPOSED_ACCESS_FILE_WORKING_DAYS, PROPOSED_PACK_LEAD_DAYS]).toEqual([10, 1, 5])
  })
  it('days between two days is signed and ignores the hour', () => {
    expect(daysFromTo(new Date('2026-11-23T18:30:00Z'), d('2026-11-30'))).toBe(7)
    expect(daysFromTo(d('2026-11-30'), d('2026-11-23'))).toBe(-7)
  })
})

describe('the contracts checklist items', () => {
  it('a line with no agreement and no order has one item, the bill rate', () => {
    expect(contractItemsFor(line()).map((i) => i.label)).toEqual([CONTRACT_LABELS.RATE])
  })
  it('payment terms are listed only where the line sits under an agreement', () => {
    const items = contractItemsFor(line({ paymentTerms: 45, msa: { paymentTerms: 30 } }))
    expect(items.map((i) => i.label)).toEqual([CONTRACT_LABELS.RATE, CONTRACT_LABELS.TERMS])
    expect(items[1]).toMatchObject({ firstAgreed: 'Net 30', actual: 'Net 45' })
  })
  it('the order’s dates are listed only where the line bills under an order', () => {
    const items = contractItemsFor(line({ order: { number: 'PO-1', startDate: d('2026-12-01'), endDate: d('2027-03-31') } }))
    expect(items.map((i) => i.label)).toEqual([CONTRACT_LABELS.RATE, CONTRACT_LABELS.WINDOW])
  })
  it('a new bill rate item has no agreed value until a person records the signed paper', () => {
    const [rate] = contractItemsFor(line())
    expect(rate.firstAgreed).toBeNull()
    expect(rate.actual).toBe('$125.00 an hour')
  })
  it('a bill rate with no signed paper recorded reads as open, not drift', () => {
    expect(judgeContractItem(CONTRACT_LABELS.RATE, null, '$125.00 an hour')).toBe('OPEN')
  })
  it('once a person records the signed paper and the line matches, the bill rate reads as met', () => {
    expect(judgeContractItem(CONTRACT_LABELS.RATE, '$125.00 an hour', '$125.00 an hour')).toBe('MET')
  })
  it('the statement of work is listed only where the placement has a written one', () => {
    expect(contractItemsFor(line()).map((i) => i.label)).not.toContain(CONTRACT_LABELS.SOW)
    const items = contractItemsFor(line({ sow: { signedAt: null } }))
    expect(items.map((i) => i.label)).toEqual([CONTRACT_LABELS.RATE, CONTRACT_LABELS.SOW])
    expect(items[1]).toMatchObject({ firstAgreed: 'Signed', actual: 'Not signed' })
  })
  it('a signed statement of work reads as met and an unsigned one as drift', () => {
    const [, signed] = contractItemsFor(line({ sow: { signedAt: d('2026-11-01') } }))
    const [, unsigned] = contractItemsFor(line({ sow: { signedAt: null } }))
    expect(judgeContractItem(signed.label, signed.firstAgreed, signed.actual)).toBe('MET')
    expect(judgeContractItem(unsigned.label, unsigned.firstAgreed, unsigned.actual)).toBe('DRIFT')
  })
  it('the card for an unsigned statement of work says the agent signed nothing and changed nothing', () => {
    const w = driftWords({ person: 'Priya Nair', client: 'Northbend Athletic', label: CONTRACT_LABELS.SOW, agreed: 'Signed', actual: 'Not signed' })
    expect(w.question).toBe('The statement of work for Priya Nair at Northbend Athletic is written and not signed. Look at it?')
    expect(w.proof).toMatch(/changed nothing/)
    expect(w.proof).toMatch(/signing is a person’s/)
  })
  it('a rate that moved off the agreed value is a drift', () => {
    expect(judgeContractItem(CONTRACT_LABELS.RATE, '$125.00 an hour', '$130.00 an hour')).toBe('DRIFT')
  })
  it('an item with no actual value is a drift, never silently met', () => {
    expect(judgeContractItem(CONTRACT_LABELS.RATE, '$1.00 an hour', null)).toBe('DRIFT')
  })
  it('a line inside the order’s dates is met and one running past them is a drift', () => {
    const order = '2026-12-01..2027-03-31'
    expect(judgeContractItem(CONTRACT_LABELS.WINDOW, order, '2026-12-15..2027-03-01')).toBe('MET')
    expect(judgeContractItem(CONTRACT_LABELS.WINDOW, order, '2026-12-15..2027-04-30')).toBe('DRIFT')
    expect(judgeContractItem(CONTRACT_LABELS.WINDOW, order, '2026-11-15..2027-03-01')).toBe('DRIFT')
  })
  it('a line with no end date is not inside an order that has one, and is inside an order that has none', () => {
    expect(windowInside('2026-12-15..', '2026-12-01..2027-03-31')).toBe(false)
    expect(windowInside('2026-12-15..', '2026-12-01..')).toBe(true)
  })
  it('a drift card names both values, says nothing was changed and says a person’s signed paper is what moves the agreed value', () => {
    const w = driftWords({ person: 'Priya Nair', client: 'Northbend Athletic', label: CONTRACT_LABELS.RATE, agreed: '$125.00 an hour', actual: '$130.00 an hour' })
    expect(w.question).toBe('Bill rate for Priya Nair at Northbend Athletic reads $130.00 an hour on the line. The agreed value is $125.00 an hour. Look at it?')
    expect(w.proof).toMatch(/changed nothing/)
    expect(w.proof).toMatch(/only when a person records a signed paper/)
  })
  it('a window drift card says the dates in a person’s words', () => {
    const w = driftWords({ person: 'Priya Nair', client: 'Northbend Athletic', label: CONTRACT_LABELS.WINDOW, agreed: '2026-12-01..2027-03-31', actual: '2026-12-01..2027-04-30' })
    expect(w.question).toMatch(/run Dec 1, 2026 to Apr 30, 2027, outside the order’s Dec 1, 2026 to Mar 31, 2027/)
  })
})

describe('the immigration checklist', () => {
  it('a petition has four papers and each is its own line', () => {
    expect(PETITION_LINES.map((l) => l.label)).toEqual(['Labor condition application', 'Petition form', 'Representation form', 'Approval notice copy'])
  })
  it('the three papers that need a signature route to a signatory and the approval copy does not', () => {
    expect(PETITION_LINES.filter((l) => l.signature).map((l) => l.label)).toEqual(['Labor condition application', 'Petition form', 'Representation form'])
  })
  it('a petition is complete only when every line is met', () => {
    expect(petitionComplete(['MET', 'MET', 'MET', 'MET'])).toBe(true)
    expect(petitionComplete(['MET', 'MET', 'MET', 'OPEN'])).toBe(false)
  })
  it('a waiver does not complete a petition, because a paper the law asks for is not waived', () => {
    expect(petitionComplete(['MET', 'MET', 'MET', 'WAIVED_WITH_REASON'])).toBe(false)
  })
  it('a petition with no lines is not complete', () => {
    expect(petitionComplete([])).toBe(false)
  })
  it('the missing papers are named by their labels', () => {
    expect(petitionMissing([{ label: 'Petition form', state: 'MET' }, { label: 'Representation form', state: 'OPEN' }])).toEqual(['Representation form'])
  })
  it('an H-1B petition keeps today’s four papers, so nothing changes for the specialty-occupation walk', () => {
    const l = petitionListFor('H-1B')
    expect(l.key).toBe('H1B')
    expect(l.lines).toBe(PETITION_LINES)
  })
  it('SPECIALTY_OCCUPATION, H1B and h-1b all read as the one H-1B list, and H-1B1 does not', () => {
    for (const k of ['SPECIALTY_OCCUPATION', 'H1B', 'h-1b', 'H-1B transfer']) expect(petitionListFor(k).key).toBe('H1B')
    expect(petitionListFor('H-1B1').key).toBe('GENERAL')
  })
  it('a TN petition gets no labor condition application line', () => {
    const l = petitionListFor('TN')
    expect(l.lines.map((x) => x.label)).toEqual(['Petition form', 'Representation form', 'Approval notice copy'])
  })
  it('a petition of a kind nobody has listed gets the general papers and is never refused', () => {
    for (const k of ['L-1', 'O-1', '', '   ', 'something new']) {
      const l = petitionListFor(k)
      expect(l.key).toBe('GENERAL')
      expect(l.lines.length).toBeGreaterThan(0)
    }
  })
  it('no petition type’s list is called confirmed until regulatory records a source for it', () => {
    for (const l of Object.values(PETITION_LISTS)) {
      expect(l.confirmed).toBe(false)
      expect(l.unconfirmedBecause).toMatch(/Regulatory has not confirmed/)
    }
  })
  it('a list marked confirmed without a source fails the build', () => {
    for (const l of Object.values(PETITION_LISTS)) {
      if (l.confirmed) { expect(l.source).toBeTruthy(); expect(l.checkedOn).toBeTruthy() }
    }
  })
  it('the signature card says Etyme signs nothing and files nothing', () => {
    const w = signatureWords({ person: 'Priya Nair', label: 'Petition form' })
    expect(w.question).toBe('The petition form for Priya Nair’s petition needs your signature. Is it signed?')
    expect(w.proof).toMatch(/files nothing and signs nothing/)
  })
})

describe('the onboarding pack', () => {
  it('a card is due from five days before the start up to the day itself', () => {
    expect([packDue(5), packDue(1), packDue(0)]).toEqual([true, true, true])
  })
  it('no card is due six days out, after the start, or for a start nobody dated', () => {
    expect([packDue(6), packDue(-1), packDue(null)]).toEqual([false, false, false])
  })
  it('the card names the papers that are missing and the day the person starts', () => {
    const w = packWords({ person: 'Priya Nair', client: 'Northbend Athletic', startDate: d('2026-11-30'), days: 3, missing: ['I-9', 'Background check'] })
    expect(w.question).toBe('Priya Nair starts at Northbend Athletic in 3 days, and 2 papers are still missing: I-9; Background check. Get them on file before day one.')
    expect(w.question).not.toMatch(/Chase them/)
    expect(w.proof).toMatch(/Start day Nov 30, 2026/)
  })
  it('a start tomorrow and a start today are said as such', () => {
    expect(packWords({ person: 'A', client: 'B', startDate: d('2026-11-24'), days: 1, missing: ['I-9'] }).question).toMatch(/starts at B tomorrow, and one paper is still missing/)
    expect(packWords({ person: 'A', client: 'B', startDate: d('2026-11-23'), days: 0, missing: ['I-9'] }).question).toMatch(/starts at B today/)
  })
})

describe('the onboarding pack when every paper is on file', () => {
  const w = packCompleteWords({ person: 'Priya Nair', client: 'Northbend Athletic', startDate: d('2026-11-30'), days: 3, papers: ['I-9', 'Right to work'] })
  it('a placement starting within five days with every paper on file names each paper and asks HR to confirm it is ready', () => {
    expect(w.question).toBe('All 2 papers for Priya Nair are on file, and they start at Northbend Athletic in 3 days. Confirm ready?')
    expect(w.proof).toContain('On file: I-9; Right to work.')
  })
  it('one paper on file is said in the singular', () => {
    expect(packCompleteWords({ person: 'A', client: 'B', startDate: d('2026-11-24'), days: 1, papers: ['I-9'] }).question).toBe('The one paper for A is on file, and they start at B tomorrow. Confirm ready?')
  })
  it('HR’s yes is said to be advisory: Activate still decides the start, and the agent started nobody', () => {
    expect(w.proof).toMatch(/Activate still decides the start/)
    expect(w.proof).toMatch(/The agent sent nothing and started nobody/)
  })
})

describe('the placement record card', () => {
  const base = { person: 'Priya Nair', customer: 'Northbend Athletic', endClient: null, billRateCents: 12_500, currency: 'USD', startDate: d('2026-12-01'), endDate: d('2027-05-31') as Date | null, suppliers: [] as string[] }
  it('the card asks to confirm the placement record and names the customer, the bill rate, the start and end days', () => {
    const w = placementWords(base)
    expect(w.question).toBe('Confirm the placement record for Priya Nair at Northbend Athletic?')
    expect(w.proof).toContain('Customer: Northbend Athletic.')
    expect(w.proof).toContain('Bill rate: $125.00 an hour.')
    expect(w.proof).toContain('Starts Dec 1, 2026 and ends May 31, 2027.')
  })
  it('a line with no end day says it has none', () => {
    expect(placementWords({ ...base, endDate: null }).proof).toContain('Starts Dec 1, 2026 and has no end day.')
  })
  it('the worksite is named only where it differs from the customer, and otherwise the card says the customer’s own site', () => {
    expect(placementWords(base).proof).toContain('Worksite: the customer’s own site.')
    expect(placementWords({ ...base, endClient: 'Lakeview Plant' }).proof).toContain('Worksite: Lakeview Plant.')
  })
  it('the suppliers on the firm’s own chain are named, and a line with none says the person is the firm’s own', () => {
    expect(placementWords({ ...base, suppliers: ['Acme Staff', 'Bolt Bench'] }).proof).toContain('Suppliers on this firm’s own chain: Acme Staff; Bolt Bench.')
    expect(placementWords(base).proof).toContain('No supplier below this firm on this line.')
  })
  it('the card says the agent changed nothing and signed nothing, and shows no buy rate', () => {
    const w = placementWords({ ...base, suppliers: ['Acme Staff'] })
    expect(w.proof).toMatch(/The agent changed nothing and signed nothing/)
    expect(w.proof).not.toMatch(/pay rate|buy rate|\$\d+\.\d\d an hour.*\$\d+\.\d\d an hour/i)
  })
})

describe('the tenure watch', () => {
  it('a limit 90 days away crosses the 90-day warning only', () => {
    expect(crossedWarning(90, [90, 60, 30])).toBe(90)
    expect(crossedWarning(91, [90, 60, 30])).toBeNull()
  })
  it('a limit 45 days away has crossed 90 and 60, and the card is the narrowest, 60', () => {
    expect(crossedWarning(45, [90, 60, 30])).toBe(60)
  })
  it('a limit today has crossed all three and the card is the 30-day one', () => {
    expect(crossedWarning(0, [90, 60, 30])).toBe(30)
  })
  it('the warning days are the firm’s own list, in any order', () => {
    expect(crossedWarning(20, [14, 45])).toBe(45)
    expect(crossedWarning(10, [45, 14])).toBe(14)
  })
  it('the card says the days left, the limit and that the extension is a person’s decision', () => {
    const w = tenureWords({ person: 'Lucía Fernández', client: 'Northbend Athletic', capMonths: 18, limitDay: d('2027-01-15'), daysLeft: 53 })
    expect(w.question).toBe('Lucía Fernández reaches the 18-month time limit at Northbend Athletic on Jan 15, 2027, in 53 days. Review the placement now?')
    expect(w.proof).toMatch(/a person’s decision/)
    expect(w.proof).toMatch(/changed nothing/)
  })
  it('a person already past the limit is said as past and still on site', () => {
    expect(tenureWords({ person: 'A', client: 'B', capMonths: 18, limitDay: d('2026-11-01'), daysLeft: -22 }).question).toMatch(/passed the 18-month time limit at B on Nov 1, 2026 and is still on site/)
  })
  it('one day left reads as a day, not days', () => {
    expect(tenureWords({ person: 'A', client: 'B', capMonths: 12, limitDay: d('2026-11-24'), daysLeft: 1 }).question).toMatch(/in 1 day\./)
  })
})

describe('the notice posting log', () => {
  it('a notice posted on a Monday has its period end ten working days later', () => {
    expect(noticeEndsOn(d('2026-11-23'), SAT_SUN, none).toISOString().slice(0, 10)).toBe('2026-12-07')
  })
  it('the period is not over the day before it ends and is over on the day', () => {
    const ends = d('2026-12-07')
    expect(noticePeriodOver(ends, d('2026-12-04'))).toBe(false)
    expect(noticePeriodOver(ends, d('2026-12-07'))).toBe(true)
    expect(noticePeriodOver(ends, d('2026-12-20'))).toBe(true)
  })
  it('a notice taken down before its period ended is early and one taken down on the day is not', () => {
    expect(removedEarly(d('2026-12-04'), d('2026-12-07'))).toBe(true)
    expect(removedEarly(d('2026-12-07'), d('2026-12-07'))).toBe(false)
  })
  it('the card asks a person to take the notice down and says the agent removed nothing', () => {
    const w = noticeWords({ kind: 'Labor condition', site: 'Lakewood HQ', postedOn: d('2026-11-23'), endsOn: d('2026-12-07') })
    expect(w.question).toBe('The Labor condition notice posted at Lakewood HQ on Nov 23, 2026 has been up its required time. Take it down and record the removal?')
    expect(w.proof).toMatch(/removed nothing and published nothing/)
  })
})

describe('the public access file', () => {
  it('a file for a petition filed on a Friday is due the Monday', () => {
    expect(accessFileReadyBy(d('2026-11-27'), SAT_SUN, none).toISOString().slice(0, 10)).toBe('2026-11-30')
  })
  it('a file for a petition filed on a Monday is due the Tuesday', () => {
    expect(accessFileReadyBy(d('2026-11-23'), SAT_SUN, none).toISOString().slice(0, 10)).toBe('2026-11-24')
  })
  it('an approval on the due day is on time and one the day after is late', () => {
    expect(approvedLate(d('2026-11-24'), d('2026-11-24'))).toBe(false)
    expect(approvedLate(d('2026-11-25'), d('2026-11-24'))).toBe(true)
  })
  it('the card says the due day, and says so differently once it has passed', () => {
    expect(accessFileWords({ person: 'Priya Nair', readyBy: d('2026-11-24'), today: d('2026-11-23') }).question).toBe('The public access file for Priya Nair’s petition is due Nov 24, 2026. Is it ready to approve?')
    expect(accessFileWords({ person: 'Priya Nair', readyBy: d('2026-11-24'), today: d('2026-11-25') }).question).toMatch(/was due Nov 24, 2026 and is not approved/)
  })
  it('the card says the agent approves and publishes nothing', () => {
    expect(accessFileWords({ person: 'A', readyBy: d('2026-11-24'), today: d('2026-11-23') }).proof).toMatch(/publishes nothing/)
  })
})

describe('the notice timing check (proposed, measured from the filing day a person entered)', () => {
  it('the proposed lead is thirty days', () => {
    expect(PROPOSED_NOTICE_LEAD_DAYS).toBe(30)
  })
  it('a notice posted ten days before the filing day is judged on time under the proposed rule', () => {
    expect(noticeTiming(d('2026-11-10'), d('2026-11-20'), PROPOSED_NOTICE_LEAD_DAYS)).toBe('ON_TIME')
  })
  it('a notice posted on the filing day itself is not late', () => {
    expect(noticeTiming(d('2026-11-20'), d('2026-11-20'), PROPOSED_NOTICE_LEAD_DAYS)).toBe('ON_TIME')
  })
  it('a notice posted after the filing day is judged late', () => {
    expect(noticeTiming(d('2026-11-21'), d('2026-11-20'), PROPOSED_NOTICE_LEAD_DAYS)).toBe('LATE')
  })
  it('a notice posted more than the proposed thirty days before the filing day is judged too early, and exactly thirty is not', () => {
    expect(noticeTiming(d('2026-10-20'), d('2026-11-20'), PROPOSED_NOTICE_LEAD_DAYS)).toBe('TOO_EARLY')
    expect(noticeTiming(d('2026-10-21'), d('2026-11-20'), PROPOSED_NOTICE_LEAD_DAYS)).toBe('ON_TIME')
  })
  it('a notice with no filing day entered has no timing verdict at all', () => {
    expect(noticeTiming(d('2026-11-21'), null, PROPOSED_NOTICE_LEAD_DAYS)).toBeNull()
  })
  it('the card says the rule is a proposal and that the agent posted, removed and changed nothing, and never accuses', () => {
    const late = noticeTimingWords({ kind: 'Labor condition', site: 'Lakewood HQ', postedOn: d('2026-11-21'), measuredFromOn: d('2026-11-20'), timing: 'LATE' })
    expect(late.question).toBe('The Labor condition notice posted at Lakewood HQ on Nov 21, 2026 is dated after the filing day it is measured against, Nov 20, 2026. Check the days on the record?')
    const early = noticeTimingWords({ kind: 'Labor condition', site: 'Lakewood HQ', postedOn: d('2026-10-01'), measuredFromOn: d('2026-11-20'), timing: 'TOO_EARLY' })
    expect(early.question).toMatch(/more than 30 days before the filing day it is measured against, Nov 20, 2026/)
    for (const c of [late, early]) {
      expect(c.proof).toMatch(/proposed rule, not confirmed by regulatory/i)
      expect(c.proof).toMatch(/posted, removed and changed nothing/)
      expect(c.question + c.proof).not.toMatch(/fraud|violat|\bdesk\b/i)
    }
  })
})
