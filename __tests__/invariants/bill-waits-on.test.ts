import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  waitsOnSays, noEngagementSays, runsProgramsSays, RAISE_A_BILL, RECORD_A_PLACEMENT_HREF,
  type BillWaitsInput, type WeekNotBillable,
} from '@/lib/money/nothing-to-bill'
import { receiptsEmpty, NO_RECEIPTS, OWN_EMPLOYEES_PAID_BY_PAYROLL } from '@/lib/money/receipts-empty'
import {
  FIRST_DAY_HREF, FIRST_DAY_LINK_WORDS, ASK_FOR_THE_FIRST_DAY, firstDayStep, firstDayRefusalSays,
  firstDayNotSetSays, firstDayNeededSays, calendarMonthWaitsSays, calendarMonthSays, WHERE_FIRST_DAY_IS_SET,
} from '@/lib/money/pay-periods'
import { DEFAULT_PAY_RHYTHM, FIRST_PERIOD_LABEL, type PayRhythm } from '@/lib/pay-dates'

/**
 * Area E of the 2026-11-14 fix list: jobs in the money chain that could
 * not complete. The Bills page and its dialog named two different
 * conditions, Payables said nothing about where a receipt comes from, and
 * the first-Sunday sentences named the box without a way to it.
 *
 * Every row here is built in the test on fixed dates; nothing reads the
 * seeded world or the clock.
 */

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const words = (t: string) => t.split(/(?<=\.)\s+/).map((s) => s.split(/\s+/).length)

const FIRM = 'Northwind Staffing'
const base: BillWaitsInput = {
  companyName: FIRM,
  billsPlacements: true,
  placed: [],
  engagements: [],
  mayRecord: true,
  whoRecords: null,
  mayAttach: true,
  whoAttaches: null,
}
const week = (over: Partial<WeekNotBillable> = {}): WeekNotBillable => ({
  personName: 'Priya Rao',
  periodStart: new Date('2026-09-20T00:00:00Z'),
  status: 'SUBMITTED',
  clientSigned: false,
  clientName: 'Harborline Tech',
  onOurBill: null,
  ...over,
})

describe('the Bills page and its dialog name the one step a bill waits on', () => {
  it('a supplier with nobody placed reads that nobody is placed yet, with a link to Record a placement', () => {
    const w = waitsOnSays(base)
    expect(w.canBill).toBe(false)
    expect(w.says).toBe('Nobody is placed yet, so there is nothing to bill. A bill is made from the weeks a client approved.')
    expect(w.link).toEqual({ href: RECORD_A_PLACEMENT_HREF, label: 'Record a placement' })
    expect(RECORD_A_PLACEMENT_HREF).toBe('/dashboard/contracts?new=1')
  })

  it('an accounts receivable seat that may not record a placement is told who does, with no link', () => {
    const who = 'Recording a placement is for the Owner or an Admin here. Ask one of them.'
    const w = waitsOnSays({ ...base, mayRecord: false, whoRecords: who })
    expect(w.link).toBeNull()
    expect(w.says).toBe(`Nobody is placed yet, so there is nothing to bill. A bill is made from the weeks a client approved. ${who}`)
  })

  it('a placement that has not started is named, and no week can be filed on it yet', () => {
    const w = waitsOnSays({ ...base, placed: [{ personName: 'Priya Rao', started: false }] })
    expect(w.says).toBe('Priya Rao’s placement has not started yet, so no week can be filed or billed. A placement starts from Contracts.')
    expect(w.link).toEqual({ href: '/dashboard/contracts', label: 'Open Contracts' })
  })

  it('a supplier whose placed person has filed nothing is told she has not filed, and that only the person who worked files hours', () => {
    const w = waitsOnSays({ ...base, engagements: [{ people: ['Priya Rao'], noHours: { weeks: [], waitingWeek: null } }] })
    expect(w.canBill).toBe(false)
    expect(w.says).toBe(
      'Priya Rao has not filed a week yet, so there is nothing to bill. Only the person who worked files hours, from their own page.'
    )
    expect(w.link).toBeNull()
  })

  it('a filed week waiting for a client off Etyme names the client and links to the week, where its approval is attached', () => {
    const w = waitsOnSays({
      ...base,
      engagements: [{ people: ['Priya Rao'], noHours: { weeks: [week()], waitingWeek: { id: 'wk-1', clientOnEtyme: false } } }],
    })
    expect(w.says).toBe('Nothing can be billed until the client signs the week. Priya Rao’s week of Sep 20 is waiting for Harborline Tech to sign it.')
    expect(w.link).toEqual({ href: '/dashboard/weeks/wk-1', label: 'Attach the client’s approval' })
  })

  it('a seat that may not attach the approval is told who does, and is shown no link', () => {
    const who = 'Attaching the client’s approval is for AP & Payroll here. Ask them.'
    const w = waitsOnSays({
      ...base, mayAttach: false, whoAttaches: who,
      engagements: [{ people: ['Priya Rao'], noHours: { weeks: [week()], waitingWeek: { id: 'wk-1', clientOnEtyme: false } } }],
    })
    expect(w.link).toBeNull()
    expect(w.says!.endsWith(who)).toBe(true)
  })

  it('a client on Etyme signs in Etyme, so its week is named and no attach link is drawn', () => {
    const w = waitsOnSays({
      ...base,
      engagements: [{ people: ['Priya Rao'], noHours: { weeks: [week()], waitingWeek: { id: 'wk-1', clientOnEtyme: true } } }],
    })
    expect(w.says).toContain('is waiting for Harborline Tech to sign it.')
    expect(w.link).toBeNull()
  })

  it('a week at a client off Etyme with nobody there who approves hours recorded says to add that person under Contacts first, then attach, and links to Contacts', () => {
    const w = waitsOnSays({
      ...base, mayAddContact: true,
      engagements: [{ people: ['Priya Rao'], noHours: { weeks: [week()], waitingWeek: { id: 'wk-1', clientOnEtyme: false, noApproverAt: 'Harborline Tech' } } }],
    })
    expect(w.says).toBe(
      'Nothing can be billed until the client signs the week. Priya Rao’s week of Sep 20 is waiting for Harborline Tech to sign it. ' +
        'Harborline Tech is not on Etyme, and nobody there who approves hours is recorded yet. ' +
        'Add the person at Harborline Tech who approves hours, under Contacts. Then attach the client’s approval on the week.'
    )
    expect(w.link).toEqual({ href: '/dashboard/contacts', label: 'Open Contacts' })
  })

  it('a seat that may not open Contacts reads the same two steps and is shown no link to a week that would refuse it', () => {
    const w = waitsOnSays({
      ...base, mayAddContact: false,
      engagements: [{ people: ['Priya Rao'], noHours: { weeks: [week()], waitingWeek: { id: 'wk-1', clientOnEtyme: false, noApproverAt: 'Harborline Tech' } } }],
    })
    expect(w.says).toContain('Add the person at Harborline Tech who approves hours, under Contacts.')
    expect(w.link).toBeNull()
  })

  it('a placement that is paused is named, with where it is resumed, and never read as no engagement', () => {
    const w = waitsOnSays({ ...base, placed: [{ personName: 'Priya Rao', started: true, paused: true }] })
    expect(w.says).toBe('Priya Rao’s placement is paused, so no week can be filed or billed. A paused placement is resumed from Contracts.')
    expect(w.link).toEqual({ href: '/dashboard/contracts', label: 'Open Contracts' })
  })

  it('an MSP is told it is the supplier on no placement and that Etyme raises no bill for its own fee', () => {
    const w = waitsOnSays({ ...base, billsPlacements: false, runsPrograms: true })
    expect(w.says).toBe(runsProgramsSays(FIRM))
    expect(w.says).toBe('Northwind Staffing is not the supplier on any placement, so it has nothing to bill. Etyme does not raise a bill for an MSP’s own fee.')
    expect(w.says).not.toContain('no engagement')
    expect(w.link).toBeNull()
  })

  it('every week already on a bill is said by its bill number', () => {
    const w = waitsOnSays({
      ...base,
      engagements: [{ people: ['Priya Rao'], noHours: { weeks: [week({ clientSigned: true, status: 'APPROVED', onOurBill: 'NW-0007' })], waitingWeek: null } }],
    })
    expect(w.says).toBe('Nothing is left to bill. Priya Rao’s week of Sep 20 is already on bill NW-0007.')
  })

  it('anything the generator could bill draws the button and says nothing', () => {
    const w = waitsOnSays({ ...base, engagements: [{ people: ['Priya Rao'], noHours: null }, { people: ['Omar Haddad'], noHours: { weeks: [], waitingWeek: null } }] })
    expect(w).toEqual({ canBill: true, says: null, link: null })
  })

  it('a client keeps the dialog’s own words, that it has no engagement it can bill', () => {
    const w = waitsOnSays({ ...base, billsPlacements: false })
    expect(w.says).toBe(noEngagementSays(FIRM))
    expect(w.says).toContain('no engagement it can bill')
    expect(w.link).toBeNull()
  })

  it('every sentence the Bills page can say stays under twenty-five words', () => {
    const all = [
      waitsOnSays(base).says!,
      waitsOnSays({ ...base, placed: [{ personName: 'Priya Rao', started: false }] }).says!,
      waitsOnSays({ ...base, engagements: [{ people: ['Priya Rao'], noHours: { weeks: [], waitingWeek: null } }] }).says!,
      waitsOnSays({ ...base, placed: [{ personName: 'Priya Rao', started: true, paused: true }] }).says!,
      waitsOnSays({ ...base, billsPlacements: false, runsPrograms: true }).says!,
      waitsOnSays({ ...base, engagements: [{ people: ['Priya Rao'], noHours: { weeks: [week()], waitingWeek: { id: 'wk-1', clientOnEtyme: false, noApproverAt: 'Harborline Tech' } } }] }).says!,
    ]
    for (const s of all) for (const n of words(s)) expect(n).toBeLessThanOrEqual(25)
  })

  it('the Bills page shows the route’s sentence in its empty list and in the button’s place, so the page and the dialog cannot disagree', () => {
    const page = src('src/app/dashboard/invoices/page.tsx')
    expect(page).toContain("fetch('/api/invoices/generate')")
    expect(page).toContain('billWaits?.says ??')
    expect(page).toContain('framing?.create && billWaits?.canBill && (')
    expect(page).toContain("body.data?.canBill === false ? [] : body.data?.engagements ?? []")
    expect(page).not.toContain('Press Generate')
  })

  it('the act that makes a bill is called Raise a bill on the dialog’s title and its button, from one constant', () => {
    expect(RAISE_A_BILL).toBe('Raise a bill')
    const page = src('src/app/dashboard/invoices/page.tsx')
    expect(page).toContain('<h2 className="text-lg font-semibold">{RAISE_A_BILL}</h2>')
    expect(page).toContain("{submitting ? 'Raising…' : RAISE_A_BILL}")
    expect(page).not.toMatch(/'Generate bill'|Generating…|Generates a bill/)
  })
})

describe('an empty list of invoice receipts says where one comes from', () => {
  it('a supplier with W-2 people reads where a receipt comes from and how a receipt is paid, then that its employees are paid by payroll, and is linked to Payroll', () => {
    const e = receiptsEmpty({ kind: 'VENDOR', employs: true, mayOpenPayroll: true })
    expect(e.message).toBe(NO_RECEIPTS)
    expect(e.detail).toBe(
      'An invoice receipt is a supplier’s invoice for a person you buy from another firm. It is typed in here when it arrives. ' +
        'Each invoice receipt is paid from its own page once it matches the order and the hours accepted. ' +
        'Your own employees are paid by payroll, not from here.'
    )
    expect(e.link).toEqual({ href: '/dashboard/payroll', label: 'Open Payroll' })
  })

  it('the order match is said only of an invoice receipt, never of an employee, because a W-2 line has no order', () => {
    const e = receiptsEmpty({ kind: 'VENDOR', employs: true, mayOpenPayroll: true })
    expect(e.detail).not.toContain('Each one')
    const payroll = e.detail.indexOf(OWN_EMPLOYEES_PAID_BY_PAYROLL)
    expect(payroll).toBeGreaterThan(e.detail.indexOf('matches the order'))
    expect(e.detail.endsWith(OWN_EMPLOYEES_PAID_BY_PAYROLL)).toBe(true)
  })

  it('a seat that may not open Payroll reads the same sentence with no link', () => {
    expect(receiptsEmpty({ kind: 'VENDOR', employs: true, mayOpenPayroll: false }).link).toBeNull()
  })

  it('an MSP and a one-person firm are never told about payroll, which they do not run here', () => {
    for (const kind of ['MSP', 'CONSULTANT_CORP']) {
      const e = receiptsEmpty({ kind, employs: true, mayOpenPayroll: true })
      expect(e.detail).not.toContain(OWN_EMPLOYEES_PAID_BY_PAYROLL)
      expect(e.link).toBeNull()
    }
  })

  it('a client reads that its suppliers send them', () => {
    expect(receiptsEmpty({ kind: 'CLIENT', employs: false, mayOpenPayroll: false }).detail).toMatch(/^Your suppliers send their invoices/)
  })

  it('a supplier reads the receipt sentence, never the bill sentence, on the payables side of the Bills page', () => {
    const page = src('src/app/dashboard/invoices/page.tsx')
    expect(page).toContain("emptyDetail={side === 'PAYABLE' || isClient")
    expect(page).toContain('receiptsEmpty({ kind: company.kind')
  })

  it('Payables draws the route’s empty sentence and its Payroll link', () => {
    const panel = src('src/app/dashboard/ap/receipts.tsx')
    expect(panel).toContain('emptyAction={data.empty?.link ?? undefined}')
    expect(src('src/app/api/ap/receipts/route.ts')).toContain('receiptsEmpty({')
  })
})

describe('every sentence blocked on the first Sunday ends in a way to the box', () => {
  const biweekly = (over: Partial<PayRhythm> = {}): PayRhythm => ({ ...DEFAULT_PAY_RHYTHM, payPeriod: 'BIWEEKLY', payFirstPeriodStart: null, ...over })

  it('the box has one address, the Cycles tab of Settings at the first-pay-day field', () => {
    expect(FIRST_DAY_HREF).toBe('/dashboard/settings?tab=cycles#first-pay-day')
  })

  it('a seat that may open Settings gets a link quoting the box by the label Settings prints', () => {
    expect(firstDayStep(true)).toEqual({ link: { href: FIRST_DAY_HREF, label: `Set "${FIRST_PERIOD_LABEL}" in Settings` }, ask: null })
    expect(FIRST_DAY_LINK_WORDS).toBe('Set "The Sunday your pay periods are counted from" in Settings')
  })

  it('any other seat is told to ask the Owner or an Admin, and gets no link', () => {
    expect(firstDayStep(false)).toEqual({ link: null, ask: 'Ask the Owner or an Admin to set it.' })
    expect(ASK_FOR_THE_FIRST_DAY).toBe('Ask the Owner or an Admin to set it.')
  })

  it('the placement refusal says the Sunday is not set, and names who to ask only where there is no link', () => {
    expect(firstDayRefusalSays(firstDayStep(true))).toBe(
      "A W-2 line's pay days count from the Sunday your pay periods start on, and that Sunday is not set yet."
    )
    expect(firstDayRefusalSays(firstDayStep(false))).toBe(
      "A W-2 line's pay days count from the Sunday your pay periods start on, and that Sunday is not set yet. Ask the Owner or an Admin to set it."
    )
  })

  it('the refusal Settings reads is unchanged, and still names where the Owner sets it', () => {
    expect(firstDayNeededSays({ payroll: true, chosen: biweekly() })).toBe(
      `${firstDayRefusalSays(firstDayStep(true))} ${WHERE_FIRST_DAY_IS_SET}`
    )
    expect(calendarMonthSays('Northwind Staffing', biweekly())).toBe(`${calendarMonthWaitsSays('Northwind Staffing', biweekly())} ${WHERE_FIRST_DAY_IS_SET}`)
  })

  it('the Payroll page’s month sentence stops before the box, where the link follows it', () => {
    expect(calendarMonthWaitsSays('Northwind Staffing', biweekly())).toBe(
      'Northwind Staffing pays every other week, but this page lists pay by calendar month until the Sunday its pay periods count from is set.'
    )
    expect(calendarMonthWaitsSays('Northwind Staffing', { ...biweekly(), payPeriod: 'MONTHLY' })).toBeNull()
  })

  it('a firm that never saved its payroll is told after a W-2 placement that her pay days will not show yet, and is refused nothing', () => {
    expect(firstDayNotSetSays({ payroll: true, chosen: null, reads: biweekly(), personName: 'Priya Rao' })).toBe(
      "The Sunday your pay periods are counted from is not set. Priya Rao's pay days will not show until it is."
    )
    expect(firstDayNeededSays({ payroll: true, chosen: null })).toBeNull()
  })

  it('nothing is said after a placement where the Sunday is set, the firm pays by the month, the firm saved its choice, or the line is not payroll', () => {
    expect(firstDayNotSetSays({ payroll: true, chosen: null, reads: biweekly({ payFirstPeriodStart: '2026-10-11' }), personName: 'Priya Rao' })).toBeNull()
    expect(firstDayNotSetSays({ payroll: true, chosen: null, reads: { ...biweekly(), payPeriod: 'MONTHLY' }, personName: 'Priya Rao' })).toBeNull()
    expect(firstDayNotSetSays({ payroll: true, chosen: biweekly(), reads: biweekly(), personName: 'Priya Rao' })).toBeNull()
    expect(firstDayNotSetSays({ payroll: false, chosen: null, reads: biweekly(), personName: 'Priya Rao' })).toBeNull()
  })

  it('the placement dialog opens the box in a new tab, so the form is not lost', () => {
    const page = src('src/app/dashboard/contracts/page.tsx')
    expect(page).toMatch(/<a href=\{errorLink\.href\} target="_blank" rel="noopener noreferrer"/)
    expect(src('src/app/api/contracts/route.ts')).toContain('link: firstDay.link')
  })
})
