/**
 * The nightly scan tells the desk that can act, in that desk's words.
 *
 * Three bugs sat on six lines of `cron/due-cycles`, and all three had the
 * same shape: the job knew a date was coming and told the wrong person,
 * or nobody, in the engine's own vocabulary. Two were written down in
 * `docs/the-operating-model.md` and left; the third — every buy-side
 * cycle silently skipped, so pay day had never once been surfaced — was
 * found by reading the query.
 *
 * These sentences are the acceptance criteria. The last one in the first
 * block is the one that matters for next time: it fails if a seventh
 * cycle kind is added with no desk behind it, which is exactly how the
 * first bug happened.
 */

import { describe, it, expect } from 'vitest'
import {
  DESKS,
  bodyFor,
  companiesHearing,
  desksFor,
  titleFor,
  whoHears,
  type Legs,
  type SeatReader,
} from '@/lib/due-cycle-desks'
import { MONEY_KINDS, RESERVED_KINDS, labelOf } from '@/lib/cycle-kinds'
import { PERMISSIONS } from '@/lib/permissions'

// Helena Marsh, supplied by Veritan Talent to Northbend Athletic, paid
// through a sub-vendor on the buy leg.
const SELL = {
  id: 'sell-1',
  companyId: 'veritan',
  clientCompanyId: 'northbend',
  personId: 'helena',
  personName: 'Helena Marsh',
  clientName: 'Northbend Athletic',
  approverPersonId: null,
}

const BUY = {
  id: 'buy-1',
  companyId: 'veritan',
  companyName: 'Veritan Talent',
  vendorCompanyId: null as string | null,
  vendorName: null as string | null,
  personNames: ['Helena Marsh'],
}

function legs(over: Partial<Legs> = {}): Legs {
  return { sell: { ...SELL }, buy: { ...BUY }, ...over }
}

/** Seats, without a database: who holds what, and who owns the place. */
function seats(
  holders: Record<string, string[]>,
  owners: Record<string, string[]> = {}
): SeatReader {
  return {
    holders: async (companyId, permission) => holders[`${companyId}:${permission}`] ?? [],
    owners: async (companyId) => owners[companyId] ?? [],
  }
}

const AR_DESK = seats({
  'veritan:invoices.issue': ['ada-in-ar'],
  'veritan:payroll.run': ['pat-in-payroll'],
  'veritan:payments.record': ['ap-clerk'],
  'veritan:timesheets.approve': ['veritan-manager'],
  'northbend:timesheets.approve': ['client-manager'],
})

describe('The desk that acts is the desk that hears', () => {
  it('the desk that can raise the invoice is the desk that is told, not the contractor', async () => {
    const told = await whoHears('INVOICE_GENERATE', legs(), AR_DESK)
    expect(told.map((t) => t.personId)).toEqual(['ada-in-ar'])
    expect(told.map((t) => t.personId)).not.toContain('helena')
  })

  it('pay day reaches the payroll desk, where before it reached nobody at all', async () => {
    const told = await whoHears('SALARY_PAY', legs({ sell: null }), AR_DESK)
    expect(told.map((t) => t.personId)).toEqual(['pat-in-payroll'])
  })

  it('the supplier’s invoice reaches accounts payable, never the person it is about', async () => {
    const told = await whoHears('VENDOR_BILL_GENERATE', legs(), AR_DESK)
    expect(told.map((t) => t.personId)).toEqual(['ap-clerk'])
  })

  it('the worker files her own hours, and nobody else is asked to', async () => {
    const told = await whoHears('TIMESHEET_SUBMIT', legs(), AR_DESK)
    expect(told.map((t) => t.personId)).toEqual(['helena'])
  })

  it('both signatures on a week are asked for: the client that receives the work and the employer that pays for it', async () => {
    const told = await whoHears('TIMESHEET_APPROVE', legs(), AR_DESK)
    expect(told.map((t) => t.personId).sort()).toEqual(['client-manager', 'veritan-manager'])
  })

  it('a person named to sign one contract’s hours is told, even without the company-wide permission', async () => {
    const told = await whoHears(
      'TIMESHEET_APPROVE',
      legs({ sell: { ...SELL, approverPersonId: 'team-lead' } }),
      seats({ 'veritan:timesheets.approve': ['veritan-manager'] })
    )
    expect(told.map((t) => t.personId)).toContain('team-lead')
  })

  it('one person holding two desks is told once, not twice', async () => {
    const told = await whoHears(
      'TIMESHEET_APPROVE',
      legs(),
      seats({
        'veritan:timesheets.approve': ['one-person-firm'],
        'northbend:timesheets.approve': ['one-person-firm'],
      })
    )
    expect(told.map((t) => t.personId)).toEqual(['one-person-firm'])
  })

  it('a new cycle kind cannot ship with no desk behind it', () => {
    const orphans = MONEY_KINDS.filter((kind) => desksFor(kind).length === 0)
    expect(
      orphans,
      `these kinds would fall back to telling the consultant again — map them in ` +
        `src/lib/due-cycle-desks.ts:\n  ${orphans.join('\n  ')}`
    ).toEqual([])
  })

  it('every desk names a permission the app actually checks, so the person told is the person let through', () => {
    const bad: string[] = []
    for (const [kind, desks] of Object.entries(DESKS)) {
      for (const desk of desks) {
        if (desk.at === 'WORKER') {
          if (desk.needs !== null) bad.push(`${kind}: the worker needs no permission to file her own hours`)
          continue
        }
        if (!desk.needs) bad.push(`${kind}: a desk with no permission is a desk nobody can be found for`)
        else if (!(PERMISSIONS as readonly string[]).includes(desk.needs)) {
          bad.push(`${kind}: ${desk.needs} is not a permission this app has`)
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('every desk says why it is the one, so the automation log reads as a sentence', () => {
    for (const desks of Object.values(DESKS)) {
      for (const desk of desks) {
        expect(desk.because.length).toBeGreaterThan(10)
        expect(desk.because).toMatch(/\.$/)
      }
    }
  })
})

describe('A cycle on a buy contract is not silently skipped', () => {
  it('a cycle on a buy contract is not silently skipped', () => {
    expect(companiesHearing('SALARY_CALCULATE', legs({ sell: null }))).toEqual(['veritan'])
    expect(companiesHearing('SALARY_PAY', legs({ sell: null }))).toEqual(['veritan'])
    expect(companiesHearing('VENDOR_BILL_GENERATE', legs({ sell: null }))).toEqual(['veritan'])
  })

  it('all three buy-side kinds reach somebody, which none of them did before', async () => {
    for (const kind of ['SALARY_CALCULATE', 'SALARY_PAY', 'VENDOR_BILL_GENERATE']) {
      const told = await whoHears(kind, legs({ sell: null }), AR_DESK)
      expect(told.length, `${kind} reached nobody`).toBeGreaterThan(0)
    }
  })

  it('a sell cycle on a contract with no buy leg still reaches its desk', async () => {
    const told = await whoHears('INVOICE_GENERATE', legs({ buy: null }), AR_DESK)
    expect(told.map((t) => t.personId)).toEqual(['ada-in-ar'])
  })

  it('a cycle with neither leg tells nobody rather than throwing', async () => {
    expect(await whoHears('SALARY_PAY', { sell: null, buy: null }, AR_DESK)).toEqual([])
  })
})

describe('A desk nobody has named falls back; it never refuses', () => {
  it('where a client has nobody in the seat, the owner hears it rather than nobody', async () => {
    const told = await whoHears(
      'TIMESHEET_APPROVE',
      legs(),
      seats({ 'veritan:timesheets.approve': ['veritan-manager'] }, { northbend: ['northbend-owner'] })
    )
    expect(told.map((t) => t.personId).sort()).toEqual(['northbend-owner', 'veritan-manager'])
  })

  it('an owner standing in is recorded as standing in, never as the desk itself', async () => {
    const told = await whoHears('INVOICE_GENERATE', legs(), seats({}, { veritan: ['owner'] }))
    expect(told[0].viaOwner).toBe(true)
  })

  it('a desk that is filled is not recorded as a fallback', async () => {
    const told = await whoHears('INVOICE_GENERATE', legs(), AR_DESK)
    expect(told[0].viaOwner).toBe(false)
  })

  it('a company with no seats and no owner tells nobody, rather than inventing a recipient', async () => {
    expect(await whoHears('INVOICE_GENERATE', legs(), seats({}))).toEqual([])
  })
})

describe('In the trade’s words, never the engine’s', () => {
  it('a person is told “Pay day”, never “SALARY_CALCULATE”', () => {
    expect(titleFor('SALARY_PAY', 3)).toBe('Pay day — in 3 days')
    expect(titleFor('SALARY_CALCULATE', 7)).toBe('Pay to calculate — in 7 days')
    expect(titleFor('SALARY_CALCULATE', 7)).not.toContain('SALARY_CALCULATE')
  })

  it('no title this job can write carries an enum, for any kind it can be handed', () => {
    const shouting = /[A-Z]{3,}_[A-Z]/
    for (const kind of [...MONEY_KINDS, ...RESERVED_KINDS]) {
      for (const days of [1, 3, 7]) {
        expect(titleFor(kind, days), `${kind} still reads as the enum`).not.toMatch(shouting)
      }
    }
  })

  it('tomorrow is called tomorrow, because that is what a person would say', () => {
    expect(titleFor('TIMESHEET_SUBMIT', 1)).toBe('Hours due — tomorrow')
    expect(titleFor('TIMESHEET_SUBMIT', 0)).toBe('Hours due — today')
  })

  it('accounts payable is told to record the supplier’s invoice, never to raise a vendor bill', () => {
    expect(labelOf('VENDOR_BILL_GENERATE')).toBe('Supplier invoice to record')
    expect(titleFor('VENDOR_BILL_GENERATE', 3).toLowerCase()).not.toContain('vendor bill')
  })

  it('a row written by an older engine still reads as a sentence and tells nobody', () => {
    expect(titleFor('INVOICE_DUE', 3)).toBe('Invoice due — in 3 days')
    expect(desksFor('INVOICE_DUE')).toEqual([])
    expect(desksFor('VENDOR_BILL_DUE')).toEqual([])
    expect(companiesHearing('INVOICE_DUE', legs())).toEqual([])
  })

  it('a kind nothing has ever heard of renders rather than crashes', () => {
    expect(titleFor('SOME_OLD_KIND', 3)).toBe('some old kind — in 3 days')
    expect(desksFor('SOME_OLD_KIND')).toEqual([])
  })
})

describe('The notice says who it is about and where', () => {
  const when = new Date('2026-04-17T00:00:00Z')

  it('a sell-side notice names the person and the client that pays', () => {
    expect(bodyFor('INVOICE_GENERATE', legs(), when)).toBe(
      'Helena Marsh at Northbend Athletic — 4/17/2026'
    )
  })

  it('a pay-day notice names the person and says it is our own payroll', () => {
    expect(bodyFor('SALARY_PAY', legs(), when)).toBe(
      'Helena Marsh on Veritan Talent’s own payroll — 4/17/2026'
    )
  })

  it('a notice for money going to a sub-vendor names the sub-vendor', () => {
    const body = bodyFor(
      'VENDOR_BILL_GENERATE',
      legs({ buy: { ...BUY, vendorCompanyId: 'brightmoor', vendorName: 'Brightmoor Staffing' } }),
      when
    )
    expect(body).toBe('Helena Marsh through Brightmoor Staffing — 4/17/2026')
  })
})
