import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as myWork, POST as fileWeek } from '@/app/api/me/work/route'
import { POST as fileExpense } from '@/app/api/expenses/route'
import { POST as demo } from '@/app/api/demo/route'
import { expenseBody } from '@/app/dashboard/my-work/own-expense'

/**
 * From the worker's own page, on the seeded world: her expense, and the
 * week she can no longer file.
 *
 * Money opened `POST /api/expenses` to a worker filing their own
 * (2026-10-20); Your work now has the form, and this walks it with the
 * body the form builds (`expenseBody`), as Helena Marsh, the seat the
 * demo's "helena-marsh" door opens.
 *
 * And the worker's own route said "your hours go on the contract with the
 * firm that employs you" to somebody filing on exactly that contract once
 * it had ended. It now says what the timesheets door says: the day it
 * ended, and who adds a week still owed.
 */

const HELENA = 'helena.marsh@seed.etyme.invalid'
const COLLEEN = 'colleen.byrne@seed.etyme.invalid'
const today = new Date().toISOString().slice(0, 10)
const it_: Record<string, any> = {}

async function page(email: string) {
  as(email)
  const r = await json(await myWork(req('GET', '/api/me/work')))
  expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  return r.body.data
}

function body(contractId: string) {
  const v = expenseBody({
    contractId, date: today, kind: 'TRAVEL', amount: '412.50',
    note: 'Flight to the client site', receiptUrl: 'https://drive.example/receipt-412', today,
  })
  if (!v.ok) throw new Error(v.says)
  return v.body
}

describe('a worker files their own expense from Your work', () => {
  beforeAll(async () => {
    await freshWorld()
  }, 600_000)

  it('the demo’s Helena Marsh door seats Helena herself', async () => {
    const r = await json(await demo(req('POST', '/api/demo', { person: 'helena-marsh' })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.personName).toBe('Helena Marsh')
    it_.contextType = r.body.data.contextType
  })

  it('Helena files an expense on her placement with Techpeple, and it waits on Techpeple’s approval', async () => {
    const d = await page(HELENA)
    it_.helena = d
    const on = d.filing[0]
    expect(on.payer).toBe('Techpeple')
    as(HELENA)
    const r = await json(await fileExpense(req('POST', '/api/expenses', body(on.contractId))))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.status).toBe(201)
    expect(r.body.data.message).toBe('Filed. Techpeple approves it before it is paid back to you.')
    it_.expenseId = r.body.data.expense.id
  })

  it('the expense she filed is hers, on her employer’s line, for the amount she typed, with her receipt link', async () => {
    const e = await prisma.expense.findUniqueOrThrow({
      where: { id: it_.expenseId },
      select: { personId: true, sellContractId: true, status: true, total: true, category: true, receiptUrl: true, company: { select: { name: true } } },
    })
    expect(e.personId).toBe(it_.helena.person.id)
    expect(e.sellContractId).toBe(it_.helena.filing[0].contractId)
    expect(e.company.name).toBe('Techpeple')
    expect(e.status).toBe('SUBMITTED')
    expect(Number(e.total)).toBe(412.5)
    expect(e.category).toBe('TRAVEL')
    expect(e.receiptUrl).toBe('https://drive.example/receipt-412')
  })

  it('an expense on the rung Computer Systems sells to Northbend is refused with the sentence the form shows', async () => {
    const top = await prisma.sellContract.findFirstOrThrow({
      where: { personId: it_.helena.person.id, company: { slug: 'world-computer-systems' } },
      select: { id: true },
    })
    as(HELENA)
    const r = await json(await fileExpense(req('POST', '/api/expenses', body(top.id))))
    expect(r.status).toBe(422)
    expect(r.body.error.message).toMatch(/^File it on your placement with Techpeple, which approves it\./)
  })

  it('a week filed on her own placement after it ended is told the day it ended and who adds a week still owed', async () => {
    const d = await page(COLLEEN)
    const own = d.filing[0]
    const week = own.weeks[0] ?? { periodStart: own.startDate, days: [own.startDate] }
    const ended = new Date(Date.now() - 40 * 86_400_000)
    ended.setUTCHours(0, 0, 0, 0)
    await prisma.sellContract.update({ where: { id: own.contractId }, data: { state: 'ENDED', endDate: ended } })
    const said = ended.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

    as(COLLEEN)
    const r = await json(await fileWeek(req('POST', '/api/me/work', {
      contractId: own.contractId, periodStart: week.periodStart, hours: { [week.days[0]]: 12 },
    })))
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('NOT_TAKING_HOURS')
    expect(r.body.error.message).toBe(
      `This placement ended on ${said}, and its last weeks could be filed for 14 days after that. ` +
        'Ask the firm that employs you to add any week still owed.'
    )
  })
})
