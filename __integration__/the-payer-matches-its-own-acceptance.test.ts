import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'

import { POST as approve } from '@/app/api/timesheets/[id]/approve/route'
import { POST as recordBill, GET as exceptions } from '@/app/api/ap/bills/route'

/**
 * A supplier's invoice is matched against what the firm paying it
 * accepted, on the seeded chain.
 *
 * Helena Marsh works at Northbend Athletic, sold by Computer Systems,
 * employed by CloudEPA. Her week is filed once, on CloudEPA's contract.
 * When CloudEPA invoices Computer Systems, the receipt is Computer
 * Systems' own PASS_THROUGH acceptance — the founder's rule that no rung
 * pays on a week it has not accepted. Before this, the match read only
 * EMPLOYER_ACCEPTANCE, and only on a contract linked to Computer Systems'
 * buy contract, which carries no hours: the invoice matched nothing
 * whoever had signed, and the one signature it looked for was
 * CloudEPA's own.
 */

const D = '@demo.etyme.local'
const NIKE = `world-nike-hiring${D}`
const CS = `world-computer-systems${D}`
const CLOUDEPA = `world-cloudepa${D}`

const sign = async (id: string, body: unknown = {}) =>
  json(await approve(req('POST', `/api/timesheets/${id}/approve`, body), { params: Promise.resolve({ id }) }))

const s: Record<string, any> = {}

const invoice = async (number: string, hours: number) =>
  json(
    await recordBill(
      req('POST', '/api/ap/bills', {
        vendorCompanyId: s.cloudepa,
        number,
        buyContractId: s.buy,
        periodStart: s.from,
        periodEnd: s.to,
        hours,
        rateCents: s.rate,
        total: (hours * s.rate) / 100,
        currency: 'USD',
        dueAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      })
    )
  )

describe('a supplier’s invoice is matched against the paying firm’s own acceptance, down the seeded chain', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
    const helena = await prisma.person.findFirstOrThrow({ where: { name: 'Helena Marsh' } })
    const week = await prisma.timesheet.findFirstOrThrow({
      where: { personId: helena.id, status: 'SUBMITTED', clientApprovedAt: null },
      orderBy: { periodStart: 'desc' },
    })
    const cs = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-computer-systems' } })
    const cloudepa = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-cloudepa' } })
    const buy = await prisma.buyContract.findFirstOrThrow({
      where: { companyId: cs.id, vendorCompanyId: cloudepa.id, candidates: { some: { personId: helena.id } } },
      include: { candidates: true },
    })
    Object.assign(s, {
      week: week.id,
      hours: Number(week.totalHours),
      cloudepa: cloudepa.id,
      cs: cs.id,
      buy: buy.id,
      rate: buy.candidates[0].payRate,
      from: week.periodStart.toISOString(),
      to: week.periodEnd.toISOString(),
    })
    // The invoice covers this one week and no other of Helena's.
    expect(
      await prisma.timesheet.count({
        where: { personId: helena.id, periodStart: { lte: week.periodEnd }, periodEnd: { gte: week.periodStart } },
      })
    ).toBe(1)
    expect(s.hours).toBe(40)
  }, 240_000)

  it('an invoice from CloudEPA to Computer Systems cannot be recorded while nobody has signed the week, and the refusal names the week and who must accept it', async () => {
    as(CS)
    const r = await invoice('CE-HM-0', 40)
    expect(r.status).toBe(422)
    // Rule 3 of 2026-09-28: a week the payer has not accepted blocks the
    // invoice, in a sentence, before the match is even asked.
    expect(r.body.error.code).toBe('WEEK_NOT_ACCEPTED')
    expect(r.body.error.message).toMatch(/^Computer Systems[^.]* has not accepted Helena Marsh\u2019s week of [A-Z][a-z]+ \d+\. Accept it first, then record this invoice\.$/)
  })

  it('Northbend’s signature is not Computer Systems’ acceptance: the invoice still cannot be matched once the client has signed', async () => {
    as(NIKE)
    const signed = await sign(s.week)
    expect(signed.body?.error, JSON.stringify(signed.body)).toBeUndefined()

    as(CS)
    const r = await invoice('CE-HM-1', 40)
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('WEEK_NOT_ACCEPTED')
    expect(await prisma.vendorBill.count({ where: { companyId: s.cs, vendorCompanyId: s.cloudepa, number: { startsWith: 'CE-HM' } } })).toBe(0)
  })

  it('Computer Systems accepts thirty-eight of Helena’s forty hours, with its reason, as its own pass-through acceptance', async () => {
    as(CS)
    const r = await sign(s.week, { acceptedHours: 38, note: 'Two hours were a Friday training session Northbend does not pay us for.' })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const mine = await prisma.workAssertion.findFirstOrThrow({ where: { timesheetId: s.week, companyId: s.cs, state: 'LIVE' } })
    expect(mine.role).toBe('PASS_THROUGH')
    expect(Number(mine.hours)).toBe(38)
  })

  it('CloudEPA’s invoice for the thirty-eight hours Computer Systems accepted matches, before CloudEPA has accepted anything itself', async () => {
    const cloudepaSigned = await prisma.workAssertion.count({ where: { timesheetId: s.week, companyId: s.cloudepa } })
    expect(cloudepaSigned).toBe(0)

    as(CS)
    const r = await invoice('CE-HM-2', 38)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.bill.status).toBe('RECEIVED')
    expect(r.body.data.match.checks.filter((c: any) => c.outcome === 'FAIL')).toEqual([])
    expect(r.body.data.match.checks.find((c: any) => c.code === 'RECEIPT').reason).toMatch(/^38h accepted for pay across 1 record/)
  })

  it('an invoice for all forty hours is held as disputed, because Computer Systems accepted thirty-eight', async () => {
    as(CS)
    const r = await invoice('CE-HM-3', 40)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.bill.status).toBe('DISPUTED')
    expect(r.body.data.match.checks.find((c: any) => c.code === 'QUANTITY').reason).toMatch(/^Invoiced 40h, we accepted 38h\./)
  })

  it('once CloudEPA has accepted too, the exception queue re-matches CloudEPA’s invoices on Computer Systems’ own acceptance and finds a receipt behind each', async () => {
    as(CLOUDEPA)
    const r = await sign(s.week)
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect((await prisma.workAssertion.findFirstOrThrow({ where: { timesheetId: s.week, companyId: s.cloudepa, state: 'LIVE' } })).role).toBe('EMPLOYER_ACCEPTANCE')

    as(CS)
    const q = await json(await exceptions(req('GET', '/api/ap/bills')))
    expect(q.status, JSON.stringify(q.body)).toBe(200)
    const unreceipted = q.body.data.exceptions
      .filter((e: any) => String(e.reference).startsWith('CE-HM'))
      .filter((e: any) => e.checks.some((c: any) => c.code === 'RECEIPT' && c.outcome === 'FAIL'))
    expect(unreceipted).toEqual([])
  })
})
