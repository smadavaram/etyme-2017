import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'

import { POST as convert } from '@/app/api/submissions/[id]/convert/route'

/**
 * The company's own calendar reaches a placement made by converting a
 * submission, and not only one made by an award.
 *
 * ── What this walk is about ──────────────────────────────────────────
 *
 * A company sets which way its dates move when they land on a weekend
 * or a holiday — before it, after it, or leave them where they fall.
 * `writeCyclesFor` reads that answer off the company holding the
 * contract, so a placement created through the award path is generated
 * on the day the company asked for.
 *
 * `POST /api/submissions/:id/convert` carried its own copy of the
 * generation lines and called the generator directly, so it was
 * generated on the shipped default and silently ignored the setting.
 * Two identical placements at one firm, two different pay days, and
 * nothing on any screen saying why one differed from the next.
 *
 * ── Two firms, differing only in what they asked for ─────────────────
 *
 *   Halverson Foods     the client. Publishes the seat, takes the people.
 *   Brightmoor Staffing bills before the weekend and pays after it.
 *   Kesterly Group      never touched the setting, so it is on the
 *                       shipped default: bill after, pay before.
 *
 * Both firms close on Friday 6 February 2026 — a pay day on the default
 * pack — so a direction is visible in a real date rather than in a
 * constant. 1 March 2026 is a Sunday, which is what makes the invoice
 * date move without any holiday at all.
 *
 * Every date below is a real day: 27 February 2026 is a Friday, the
 * 28th a Saturday, 1 March a Sunday, 2 March a Monday. 5 February is a
 * Thursday, the 6th a Friday, the 9th the Monday after.
 */

const CLIENT = 'program@halverson.test'
const BRIGHTMOOR = 'owner@brightmoor.test'
const KESTERLY = 'owner@kesterly.test'

const START = '2026-02-01'
const END = '2026-04-30'
const CLOSED = new Date('2026-02-06T00:00:00.000Z')

const co = { client: '', brightmoor: '', kesterly: '' }
const who = { pm: '', brightmoor: '', kesterly: '', ravi: '', dana: '' }
const submissionOf = { brightmoor: '', kesterly: '' }
const contractOf: Record<string, { sell: string; buy: string | null }> = {}

async function company(
  name: string,
  slug: string,
  kind: any,
  email: string,
  shift: Record<string, any> = {}
) {
  const c = await prisma.company.create({
    data: { name, slug, kind, currency: 'USD', defaultPaymentTerms: 45, ...shift },
  })
  const role = await prisma.role.create({
    data: { companyId: c.id, name: 'Owner', permissions: ['*'], isDefault: true },
  })
  const p = await prisma.person.create({ data: { name, primaryEmail: email } })
  await prisma.context.create({
    data: {
      personId: p.id, companyId: c.id, roleId: role.id, type: 'EMPLOYEE',
      grantReason: 'converted placement calendar walk',
    },
  })
  return { companyId: c.id, personId: p.id, roleId: role.id }
}

/** The days a contract's cycles of one kind fall on, as YYYY-MM-DD. */
async function days(where: object, kind: string): Promise<string[]> {
  const rows = await prisma.cycle.findMany({ where: { ...where, kind }, orderBy: { dueOn: 'asc' } })
  return rows.map((c) => c.dueOn.toISOString().slice(0, 10))
}

beforeAll(async () => {
  await resetDatabase()

  const client = await company('Halverson Foods', 'halverson-foods', 'CLIENT', CLIENT)
  co.client = client.companyId
  who.pm = client.personId

  // The one that asked for something other than the default.
  const brightmoor = await company(
    'Brightmoor Staffing', 'brightmoor-staffing', 'VENDOR', BRIGHTMOOR,
    { templatePack: 'US_IT', cycleShiftBill: 'BEFORE', cycleShiftPay: 'AFTER' }
  )
  co.brightmoor = brightmoor.companyId
  who.brightmoor = brightmoor.personId

  // The control: never touched the setting.
  const kesterly = await company(
    'Kesterly Group', 'kesterly-group', 'VENDOR', KESTERLY,
    { templatePack: 'US_IT' }
  )
  co.kesterly = kesterly.companyId
  who.kesterly = kesterly.personId

  for (const companyId of [co.brightmoor, co.kesterly]) {
    await prisma.holiday.create({
      data: { companyId, date: CLOSED, name: 'Founders’ day', isRecurring: false },
    })
  }

  const ravi = await prisma.person.create({ data: { name: 'Ravi Menon', primaryEmail: 'ravi@person.test' } })
  const dana = await prisma.person.create({ data: { name: 'Dana Whitfield', primaryEmail: 'dana@person.test' } })
  who.ravi = ravi.id
  who.dana = dana.id

  const requirement = await prisma.requirement.create({
    data: {
      companyId: co.client, title: 'Quality systems analyst — Tualatin',
      skills: ['Quality systems'], location: 'Tualatin, Oregon',
      status: 'OPEN', approvalState: 'APPROVED', headcount: 2,
      billMin: 7_000, billMax: 11_000, months: 3,
      startDate: new Date(START), raisedById: who.pm, ownerId: who.pm,
    },
  })

  const placed = async (fromCompanyId: string, personId: string) =>
    (await prisma.submission.create({
      data: {
        requirementId: requirement.id, personId, fromCompanyId, toCompanyId: co.client,
        kind: 'NETWORK', rate: 9_000, status: 'PLACED',
      },
    })).id

  submissionOf.brightmoor = await placed(co.brightmoor, who.ravi)
  submissionOf.kesterly = await placed(co.kesterly, who.dana)
}, 240_000)

describe('a placement converted from a submission is generated on the company’s own calendar', () => {

  it('converts both placements, one at a firm with its own calendar answer and one at a firm on the default', async () => {
    for (const [firm, seat] of [['brightmoor', BRIGHTMOOR], ['kesterly', KESTERLY]] as const) {
      as(seat)
      const id = submissionOf[firm]
      const r = await json(await convert(
        req('POST', `/api/submissions/${id}/convert`, {
          billRate: 9_000, payRate: 6_500, startDate: START, endDate: END,
        }),
        { params: Promise.resolve({ id }) }
      ))
      expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
      expect(r.status).toBe(201)
      expect(r.body.data.sellCyclesCreated).toBeGreaterThan(0)
      contractOf[firm] = {
        sell: r.body.data.sellContract.id,
        buy: r.body.data.buyContract?.id ?? null,
      }
    }
  })

  it('a firm that bills before the weekend has the Sunday invoice date generated on the Friday before it', async () => {
    const dates = await days({ sellContractId: contractOf.brightmoor.sell }, 'INVOICE_GENERATE')
    expect(dates).toContain('2026-02-27')
    expect(dates).not.toContain('2026-03-02')
  })

  it('a firm that never touched the setting still has it generated on the Monday after, as it always was', async () => {
    const dates = await days({ sellContractId: contractOf.kesterly.sell }, 'INVOICE_GENERATE')
    expect(dates).toContain('2026-03-02')
    expect(dates).not.toContain('2026-02-27')
  })

  it('a firm that asked to pay after the weekend has a pay day on a day it is closed generated on the Monday', async () => {
    const dates = await days({ buyContractId: contractOf.brightmoor.buy! }, 'SALARY_PAY')
    expect(dates).toContain('2026-02-09')
    expect(dates).not.toContain('2026-02-06')
  })

  it('a firm on the default pays that day before it closes, which is what US payroll does', async () => {
    const dates = await days({ buyContractId: contractOf.kesterly.buy! }, 'SALARY_PAY')
    expect(dates).toContain('2026-02-05')
    expect(dates).not.toContain('2026-02-06')
  })

  it('nobody is paid on a day their employer is shut, whichever answer the firm gave', async () => {
    for (const firm of ['brightmoor', 'kesterly'] as const) {
      const dates = await days({ buyContractId: contractOf[firm].buy! }, 'SALARY_PAY')
      expect(dates.length).toBeGreaterThan(0)
      expect(dates).not.toContain('2026-02-06')
    }
  })

  it('the pay dates a conversion writes land on the buy contract, where payroll reads them', async () => {
    for (const firm of ['brightmoor', 'kesterly'] as const) {
      expect(await prisma.cycle.count({
        where: { sellContractId: contractOf[firm].sell, kind: { startsWith: 'SALARY' } },
      })).toBe(0)
      expect(await prisma.cycle.count({
        where: { buyContractId: contractOf[firm].buy!, kind: 'SALARY_PAY' },
      })).toBeGreaterThan(0)
    }
  })

  it('two firms given the same dates and the same placement differ only where they asked to differ', async () => {
    // Hours are nobody's argument here: neither firm changed that
    // setting, so the timesheet dates are identical and the money dates
    // are not. A difference everywhere would mean something other than
    // the policy was moving.
    const hours = await Promise.all(
      (['brightmoor', 'kesterly'] as const).map((f) =>
        days({ sellContractId: contractOf[f].sell }, 'TIMESHEET_SUBMIT')
      )
    )
    expect(hours[0]).toEqual(hours[1])
    expect(hours[0].length).toBeGreaterThan(0)
  })
})
