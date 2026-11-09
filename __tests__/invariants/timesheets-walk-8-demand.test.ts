import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rateCell, valueCell, timesheetCsv, TIMESHEET_CSV_HEADER } from '@/app/dashboard/timesheets/cells'
import { totalsRowOf, listTotals, approvedValueSays, paidValueSays } from '@/app/dashboard/timesheets/totals'
import { ACCEPT_FEWER_FIELDS, acceptFewerBody, checkAcceptedHours } from '@/app/api/timesheets/accept-fewer'
import { acceptedWorth } from '@/app/api/timesheets/accepted-worth'
import { editBody, type EditTyped } from '@/app/dashboard/requisitions/job-body'
import { writtenOn } from '@/app/api/requisitions/edit-write'
import { jobFacts } from '@/app/dashboard/requisitions/facts'
import { centerBilled, programBilled } from '@/app/api/program/billed-figures'

/**
 * Walk 8, 9 November 2026: the release gate stopped on the Timesheets
 * page, twice over money.
 *
 *   - Corvane's Vietnam week read "$750/hr · $30,000" where the record
 *     holds ₫75,000 an hour and the week is ₫3,000,000; a euro line read
 *     "$31/hr · $1,240". The page called money's formatter with no
 *     currency, so every rate went out as dollars on cents.
 *   - The list's "Export CSV" left the consultant, the client, the period,
 *     the rate and the value empty on all 49 rows and had no Currency
 *     column.
 *   - No screen could accept fewer hours than were filed; called directly
 *     the route took 38 of 40, the row went on reading 40.0 and $4,720,
 *     and the reply's billAmount priced the filed hours.
 *
 * And two smaller faults on the job request: the page did not show the
 * qualification it asks for, and saving Edit rewrote where the work is
 * and how it is done when nobody touched them.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const PAGE = 'src/app/dashboard/timesheets/page.tsx'

/** Sunday to Saturday, eight hours Monday to Friday. */
const WEEK = {
  periodStart: new Date('2026-11-01T00:00:00.000Z'),
  periodEnd: new Date('2026-11-07T00:00:00.000Z'),
  days: { '2026-11-02': 8, '2026-11-03': 8, '2026-11-04': 8, '2026-11-05': 8, '2026-11-06': 8 } as Record<string, number>,
}
/** Helena Marsh's week as it is filed: on Techpeple's line to Computer Systems, worked at Northbend. */
const HELENA_LINE = { companyId: 'techpeple', clientCompanyId: 'computer-systems', endClientCompanyId: 'northbend' }
const NO_LINE = { afterHours: null, multiplierBps: 15_000 }

describe('the Timesheets page says every amount in its line’s own money', () => {
  it('a Vietnam week on Timesheets reads in dong with no cents', () => {
    // ₫75,000 an hour, forty hours: the record's own figures, in minor units of a currency with none.
    expect(rateCell({ cents: 75_000, currency: 'VND' })).toBe('₫75,000')
    expect(valueCell(40 * 75_000, 'VND')).toBe('₫3,000,000')
    expect(rateCell({ cents: 75_000, currency: 'VND' })).not.toContain('$')
    expect(valueCell(40 * 75_000, 'VND')).not.toMatch(/\.\d\d$/)
  })

  it('a euro week reads in euros', () => {
    expect(rateCell({ cents: 3_100, currency: 'EUR' })).toBe('€31')
    expect(valueCell(40 * 3_100, 'EUR')).toBe('€1,240')
  })

  it('a dollar week still reads in dollars, and a row that names no currency is read as the line’s dollars', () => {
    expect(rateCell({ cents: 11_800, currency: 'USD' })).toBe('$118')
    expect(rateCell({ cents: 11_800, currency: null })).toBe('$118')
    expect(valueCell(38 * 11_800, 'USD')).toBe('$4,484')
  })

  it('no amount on the Timesheets page is printed without its currency', () => {
    const page = read(PAGE)
    // A call to money's formatter with one argument prints dollars on cents.
    expect(page).not.toMatch(/\b(compact|amount|rate)\(\s*[^,()]+\)/)
    expect(page).toContain('rateCell(row.rate)')
    expect(page).toContain('valueCell(cents, row.rate.currency)')
  })
})

describe('the list’s export carries every column and the currency', () => {
  const vietnam = {
    person: { name: 'Trần Quang Huy' },
    sellContract: { clientCompany: { name: 'Corvane Packaging' }, engagement: { title: 'Line operator' } },
    periodStart: '2026-11-01T00:00:00.000Z', periodEnd: '2026-11-07T00:00:00.000Z',
    totalHours: 40, status: 'APPROVED',
    rate: { cents: 75_000, currency: 'VND' },
    signature: null,
    overtime: { billableCents: 3_000_000 },
  }
  const euro = {
    ...vietnam,
    person: { name: 'Elise Claes' },
    sellContract: { clientCompany: { name: 'Corvane Packaging' }, engagement: null },
    rate: { cents: 3_100, currency: 'EUR' },
    overtime: { billableCents: 124_000 },
  }
  const cut = {
    ...vietnam,
    person: { name: 'Helena Marsh' },
    sellContract: { clientCompany: { name: 'Northbend Athletic' }, engagement: null },
    rate: { cents: 11_800, currency: 'USD' },
    accepted: { hours: 38, filed: 40, says: 'You accepted 38 of the 40 hours filed.' },
    overtime: { billableCents: 38 * 11_800 },
  }

  it('the list’s export carries every column and the currency', () => {
    const csv = timesheetCsv([vietnam, euro, cut], 'Bill rate')
    const [head, ...rows] = csv.split('\n').map((l) => l.split(',').map((v) => JSON.parse(v)))
    expect(head).toEqual([...TIMESHEET_CSV_HEADER.slice(0, 7), 'Bill rate', ...TIMESHEET_CSV_HEADER.slice(8)])
    expect(head).toEqual(['Consultant', 'Client', 'Engagement', 'Period Start', 'Period End', 'Hours', 'Hours filed', 'Bill rate', 'Value', 'Currency', 'Status'])
    expect(rows[0]).toEqual(['Trần Quang Huy', 'Corvane Packaging', 'Line operator', '2026-11-01', '2026-11-07', '40.0', '40.0', '75000', '3000000', 'VND', 'Approved'])
    expect(rows[1]).toEqual(['Elise Claes', 'Corvane Packaging', '', '2026-11-01', '2026-11-07', '40.0', '40.0', '31.00', '1240.00', 'EUR', 'Approved'])
    expect(rows[2]).toEqual(['Helena Marsh', 'Northbend Athletic', '', '2026-11-01', '2026-11-07', '38.0', '40.0', '118.00', '4484.00', 'USD', 'Approved'])
  })

  it('a rate withheld from the reader exports as blank money with no currency, never as nought', () => {
    const csv = timesheetCsv([{ ...vietnam, rate: { cents: null, currency: null, withheld: true }, overtime: { billableCents: null } }], 'Bill rate')
    const row = csv.split('\n')[1].split(',').map((v) => JSON.parse(v))
    expect(row.slice(7, 10)).toEqual(['', '', ''])
  })

  it('the page’s Export CSV and Export selected both write the one export, and the shared export that left cells empty is not drawn', () => {
    const page = read(PAGE)
    expect(page.match(/timesheetCsv\(/g)?.length).toBe(2)
    expect(page).toContain('Export CSV')
    expect(page).not.toMatch(/exportName="timesheets"/)
    expect(page).toContain('name="timesheets"')
  })
})

describe('a firm accepts fewer hours than were filed, from the screen, with a reason', () => {
  it('a firm accepts fewer hours than were filed from the Timesheets row with a reason', () => {
    const body = acceptFewerBody({ hours: '38', reason: 'Two hours were a Friday training session we do not pay for.' })
    expect(body).toEqual({ acceptedHours: '38', note: 'Two hours were a Friday training session we do not pay for.' })
    const v = checkAcceptedHours(40, body, 'Helena Marsh')
    expect(v.ok).toBe(true)
    expect(v.ok && v.hours).toBe(38)
  })

  it('every refusal for accepting fewer hours names a field the form draws', () => {
    const fields = Object.values(ACCEPT_FEWER_FIELDS)
    expect(fields).toEqual(['acceptedHours', 'note'])
    const refusals = [
      checkAcceptedHours(40, acceptFewerBody({ hours: '38', reason: '' }), 'Helena Marsh'),
      checkAcceptedHours(40, acceptFewerBody({ hours: '41', reason: 'She says she stayed late.' }), 'Helena Marsh'),
      checkAcceptedHours(40, acceptFewerBody({ hours: 'thirty-eight', reason: 'Two hours off.' }), 'Helena Marsh'),
      checkAcceptedHours(40, acceptFewerBody({ hours: '', reason: 'Two hours off.' }), 'Helena Marsh'),
      checkAcceptedHours(40, acceptFewerBody({ hours: '-2', reason: 'Two hours off.' }), 'Helena Marsh'),
    ]
    for (const r of refusals) {
      expect(r.ok).toBe(false)
      if (!r.ok) expect(fields).toContain(r.field)
    }
    // The form draws a field under each name, and says the route's sentence under it.
    const form = read('src/app/dashboard/timesheets/accept-fewer.tsx')
    expect(form).toContain('ACCEPT_FEWER_FIELDS.hours')
    expect(form).toContain('ACCEPT_FEWER_FIELDS.reason')
    expect(form).toContain('acceptFewerBody(')
    expect(form).toContain('body.error?.field')
  })

  it('a missing reason is refused under the reason, in the sentence that says why it matters', () => {
    const v = checkAcceptedHours(40, acceptFewerBody({ hours: '38', reason: '' }), 'Helena Marsh')
    expect(v).toMatchObject({ ok: false, code: 'NEEDS_REASON', field: 'note' })
    expect(!v.ok && v.message).toMatch(/^Accepting 38 against 40 submitted\. Say why/)
  })

  it('accepting more hours than were filed is refused, because only the worker files hours', () => {
    const v = checkAcceptedHours(40, acceptFewerBody({ hours: '41', reason: 'She says she stayed late.' }), 'Helena Marsh')
    expect(v).toEqual({
      ok: false, code: 'MORE_THAN_FILED', field: 'acceptedHours',
      message: 'Helena Marsh filed 40 hours for this week, so you can accept up to 40. Only Helena Marsh files hours: to add any, send the week back.',
    })
  })

  it('accepting every hour filed needs no reason, and the press stays the one it always was', () => {
    expect(checkAcceptedHours(40, {}, 'Helena Marsh')).toMatchObject({ ok: true, hours: null })
    expect(checkAcceptedHours(40, acceptFewerBody({ hours: '40', reason: '' }), 'Helena Marsh')).toMatchObject({ ok: true, hours: null })
  })

  it('the row offers Accept fewer hours wherever it offers the tick, and the approve route reads the same check', () => {
    const page = read(PAGE)
    expect(page).toContain('<AcceptFewer')
    expect(page).toContain('fewerButton(row.act)')
    const route = read('src/app/api/timesheets/[id]/approve/route.ts')
    expect(route).toContain('checkAcceptedHours(hours, body, timesheet.person.name)')
    expect(route).not.toContain('acceptWith(')
  })

  it('the overtime question opened on top of a cut week carries the hours accepted with it', () => {
    const page = read(PAGE)
    expect(page).toContain('acceptedHours={deciding.acceptedHours ?? null}')
    expect(read('src/app/dashboard/timesheets/decide-overtime.tsx')).toContain('acceptedHours')
  })
})

describe('a week is valued on what its payer accepted, by money’s one rule', () => {
  const week = (assertions: { companyId: string; role: string; hours: number }[], days = WEEK.days) => ({
    ...WEEK, days, leaveDays: {}, totalHours: Object.values(days).reduce((a, b) => a + b, 0),
    personName: 'Helena Marsh', hoursContract: HELENA_LINE, assertions,
  })

  it('the row reads the accepted hours and their value after a partial acceptance', () => {
    const v = acceptedWorth({
      week: week([{ companyId: 'computer-systems', role: 'PASS_THROUGH', hours: 38 }]),
      payer: { id: 'computer-systems', name: 'Computer Systems Inc' },
      rateCents: 11_800, policy: NO_LINE, decisions: [],
    })
    expect(v).toMatchObject({ hours: 38, filed: 40, differs: true, cents: 448_400 })
  })

  it('the acceptance reply prices the accepted hours', () => {
    const route = read('src/app/api/timesheets/[id]/approve/route.ts')
    expect(route).toContain('acceptedWorth({')
    expect(route).toMatch(/billAmountOf\(priced\.cents, worthCurrency\)/)
    expect(route).not.toMatch(/const value = valueOf\(finalSplit/)
  })

  it('a cut week loses its overtime first, the way the bill does', () => {
    // Nine hours a day, five days: 45 filed on a 40-hour line, the overtime at time and a half.
    const nine = { '2026-11-02': 9, '2026-11-03': 9, '2026-11-04': 9, '2026-11-05': 9, '2026-11-06': 9 }
    const v = acceptedWorth({
      week: week([{ companyId: 'northbend', role: 'CLIENT_APPROVAL', hours: 42 }], nine),
      payer: { id: 'northbend', name: 'Northbend Athletic' },
      rateCents: 10_000,
      policy: { afterHours: 40, multiplierBps: 15_000 },
      decisions: [{ weekOf: '2026-11-01', treatment: 'PREMIUM', appliedBps: 15_000, overtimeHours: 5 }],
    })
    expect(v.hours).toBe(42)
    expect(v.cents).toBe(40 * 10_000 + 2 * 15_000)
  })

  it('a week the payer has not accepted is valued as filed', () => {
    const v = acceptedWorth({
      week: week([{ companyId: 'northbend', role: 'CLIENT_APPROVAL', hours: 40 }]),
      payer: { id: 'computer-systems', name: 'Computer Systems Inc' },
      rateCents: 11_800, policy: NO_LINE, decisions: [],
    })
    expect(v).toMatchObject({ hours: 40, differs: false, cents: 40 * 11_800 })
  })

  it('a rate withheld from the reader values nothing, and the hours accepted are still said', () => {
    const v = acceptedWorth({
      week: week([{ companyId: 'computer-systems', role: 'PASS_THROUGH', hours: 38 }]),
      payer: { id: 'computer-systems', name: 'Computer Systems Inc' },
      rateCents: null, policy: NO_LINE, decisions: [],
    })
    expect(v).toMatchObject({ hours: 38, differs: true, cents: null })
  })

  it('the tiles add up the hours each row reads, so a cut week counts what was accepted', () => {
    const row = totalsRowOf({
      periodStart: '2026-11-01', totalHours: 40, status: 'SUBMITTED', flag: null,
      rate: { cents: 11_800, currency: 'USD' }, overtime: { billableCents: 448_400 },
      accepted: { hours: 38 },
    })
    expect(row.totalHours).toBe(38)
    expect(row.valueCents).toBe(448_400)
  })

  it('the list route values each row through the same reading, on the line the reader is shown', () => {
    const route = read('src/app/api/timesheets/route.ts')
    expect(route).toContain('acceptedWorth({')
    expect(route).toContain('accepted: worth.differs')
  })
})

describe('the job request’s Edit form and page', () => {
  const opened: EditTyped = {
    title: 'Line operator', skills: 'Forklift, Lean', location: 'Dayton', headcount: '2',
    billMin: '30', billMax: '40', months: '6', hoursPerWeek: '40', neededBy: '2026-12-01',
    description: 'Second shift.', justification: 'Holiday volume.', panel: ['Marcus Hollins'],
    workMode: 'HYBRID', sponsorship: 'YES', sponsorshipPolicy: '', requiredQualification: 'Forklift license',
  }

  it('saving the job’s Edit form writes only the fields changed', () => {
    expect(editBody(opened, { ...opened, title: 'Line operator, second shift' }, { otherBasis: null }))
      .toEqual({ action: 'edit', title: 'Line operator, second shift' })
  })

  it('a place and a way of working nobody touched are never sent, so a site’s name is not written over the job’s own words', () => {
    const body = editBody(opened, { ...opened, months: '9' }, { otherBasis: null })
    expect(body).toEqual({ action: 'edit', months: 9 })
    expect(body).not.toHaveProperty('location')
    expect(body).not.toHaveProperty('workMode')
    expect(body).not.toHaveProperty('sponsorship')
  })

  it('a field the person changed is sent in the shape the route reads', () => {
    expect(editBody(opened, { ...opened, workMode: 'REMOTE', billMax: '42.50', panel: ['Marcus Hollins', 'Dana Whitfield'] }, { otherBasis: null }))
      .toEqual({ action: 'edit', workMode: 'REMOTE', billMax: 4_250, interviewers: ['Marcus Hollins', 'Dana Whitfield'] })
    expect(editBody(opened, { ...opened, sponsorship: 'NO', sponsorshipPolicy: 'We do not sponsor work visas for this role' }, { otherBasis: null }))
      .toEqual({ action: 'edit', sponsorship: 'NO', sponsorshipPolicy: 'We do not sponsor work visas for this role' })
    expect(editBody(opened, { ...opened, requiredQualification: '' }, { otherBasis: null }))
      .toEqual({ action: 'edit', requiredQualification: null })
  })

  it('the route writes only the fields that changed, and the work columns only where the way of working changed', () => {
    const after = { title: 'Line operator', location: 'Dayton', workMode: 'ONSITE', sponsorship: 'YES' }
    const columns = { workMode: 'ONSITE' as const }
    expect(writtenOn(after, [], columns)).toEqual({})
    expect(writtenOn(after, [{ field: 'title', from: 'Old', to: 'Line operator' }], columns)).toEqual({ title: 'Line operator' })
    expect(writtenOn(after, [{ field: 'workMode', from: 'HYBRID', to: 'ONSITE' }], columns)).toEqual({ workMode: 'ONSITE' })
  })

  it('the Edit form posts editBody and the route writes writtenOn', () => {
    expect(read('src/app/dashboard/requisitions/chain.tsx')).toContain('editBody(opened, typed')
    expect(read('src/app/api/requisitions/[id]/route.ts')).toContain('writtenOn(after, changes, workEdit.columns)')
  })

  it('the job page shows the qualification it asks for', () => {
    const facts = jobFacts({ headcount: 1, requiredQualification: 'BSN' })
    expect(facts).toContainEqual({ label: 'Qualification it asks for', value: 'BSN' })
    expect(jobFacts({ headcount: 1 })).toContainEqual({ label: 'Qualification it asks for', value: 'None asked' })
    // The page's own read carries it, and the way the work is done, so the page and its Edit form open on the record.
    const route = read('src/app/api/requisitions/[id]/route.ts')
    expect(route).toContain('requiredQualification: req.requiredQualification')
    expect(route).toContain('workMode: req.workMode')
  })
})

describe('a firm that bills some weeks and pays for others reads both figures, each labelled', () => {
  const week = (cents: number, buys: boolean) => totalsRowOf({
    periodStart: '2026-11-01', totalHours: 40, status: 'APPROVED', flag: null,
    rate: { cents, currency: 'USD', buys }, overtime: { billableCents: 40 * cents },
  })

  it('the weeks a firm pays for are valued in their own tile and never added into what it bills', () => {
    const t = listTotals([week(14_500, false), week(14_500, false), week(11_800, true)], { onServer: 3, payBasis: false })
    expect(approvedValueSays(t)).toBe('$11,600')
    expect(paidValueSays(t)).toBe('$4,720')
    expect(t.paidSays).toBe('what you pay for 1 week you buy; never added into the billable figure')
    expect(read(PAGE)).toContain('<Stat label="What you pay" value={paidValueSays(totals)')
  })

  it('a list with nothing it pays for draws no second tile', () => {
    const t = listTotals([week(14_500, false)], { onServer: 1, payBasis: false })
    expect(t.paidValue).toBeNull()
    expect(t.paidSays).toBeNull()
  })
})

describe('Billed sits beside Spent on the budget and the program, by money’s one definition', () => {
  const billed = new Map([
    ['a', { billedHours: 40, billedMinor: 400_000, draftedHours: 8, draftedMinor: 80_000, currencies: ['USD'] }],
    ['v', { billedHours: 40, billedMinor: 3_000_000, draftedHours: 0, draftedMinor: 0, currencies: ['VND'] }],
  ])
  const line = (id: string, currency: string, notBilled: number, hours: number) => ({
    sellContractId: id, personId: 'p', personName: 'P', currency,
    signed: { hours: 80, weeks: 2 }, billed: { hours: 40, amountMinor: 0 }, drafted: { hours: 0, amountMinor: 0, bills: [] },
    notBilled: { hours, amountMinor: notBilled, overLineHours: 0, onDraftHours: 0, weeks: [], aging: [] }, says: null,
  })
  const signed = new Map([['a', line('a', 'USD', 400_000, 40)], ['v', line('v', 'VND', 3_000_000, 40)]])

  it('a cost center’s Billed counts bills sent only, never a draft, shared out by the line’s share', () => {
    const c = centerBilled([{ id: 'a', shareBps: 5_000 }], 'USD', billed, signed as any)
    expect(c.billedCents).toBe(200_000)
    expect(c.signedNotBilledCents).toBe(200_000)
  })

  it('a line in another currency than the budget is left out of both figures and named, never converted', () => {
    const c = centerBilled([{ id: 'a', shareBps: 10_000 }, { id: 'v', shareBps: 10_000 }], 'USD', billed, signed as any)
    expect(c.billedCents).toBe(400_000)
    expect(c.otherCurrencies).toEqual(['VND'])
  })

  it('the program’s Billed is said per currency, never added across them', () => {
    expect(programBilled(signed as any).map((b) => b.currency).sort()).toEqual(['USD', 'VND'])
  })

  it('a job’s pay range and stated budget print in the job’s own currency', () => {
    const facts = jobFacts({ headcount: 1, currency: 'VND', billMin: 60_000, billMax: 75_000, budgetCents: 3_000_000 })
    expect(facts).toContainEqual({ label: 'Pay range', value: '₫60,000–₫75,000 an hour' })
    expect(facts).toContainEqual({ label: 'Budget stated', value: '₫3,000,000' })
    expect(jobFacts({ headcount: 1, billMax: 11_000 })).toContainEqual({ label: 'Pay range', value: 'up to $110 an hour' })
  })
})
