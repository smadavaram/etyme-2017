import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as tenure } from '@/app/api/tenure/route'
import { evaluateGovernance } from '@/lib/governance'
import { plainDate } from '@/lib/plain-date'

/**
 * The time limit gives one answer at every door — the ledger, the award,
 * the extension — on the seeded world (Addendum E).
 *
 * Found by etyme-demand building the check at submission: the award
 * refused for ever anybody once past the limit, so a person the ledger
 * and the submission door called eligible after a served break was
 * still refused at award; and the break was counted from the latest
 * ENDED contract even while another rung's contract was live, which
 * would block somebody mid-placement in a chain.
 *
 *   Northbend Athletic  an eighteen-month limit and a ninety-day break, both BLOCK.
 *   Kwame Mensah        740 days on site, left fifty days ago: inside the break.
 */

const OFFICER = 'world-nike-compliance@demo.etyme.local'
const DAY = 86_400_000

let northbend = ''
let kwame = ''
let kwameLeft: Date
let breakDays = 0

async function ledgerRow(name: string) {
  as(OFFICER)
  const r = await json(await tenure(req('GET', '/api/tenure')))
  expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  return r.body.data.people.find((p: any) => p.name === name)
}

const atStart = (personId: string, now?: Date) =>
  evaluateGovernance({
    personId, endClientCompanyId: northbend, triggerPoint: 'CONTRACT_START',
    subjectType: 'PERSON', subjectId: personId, now,
  })

const rule = (g: Awaited<ReturnType<typeof atStart>>, type: string) => g.evaluations.find((e) => e.ruleType === type)!

beforeAll(async () => {
  await freshWorld()
  const client = await prisma.company.findFirstOrThrow({ where: { name: 'Northbend Athletic' }, select: { id: true } })
  northbend = client.id
  const person = await prisma.person.findFirstOrThrow({ where: { name: 'Kwame Mensah' }, select: { id: true } })
  kwame = person.id
  const last = await prisma.sellContract.findFirstOrThrow({
    where: { personId: kwame, state: 'ENDED' }, orderBy: { endDate: 'desc' }, select: { endDate: true },
  })
  kwameLeft = last.endDate!
  const brk = await prisma.governanceRule.findFirstOrThrow({
    where: { policy: { companyId: northbend }, ruleType: 'BREAK_IN_SERVICE' }, select: { parameters: true },
  })
  breakDays = (brk.parameters as any).breakDays
}, 120_000)

afterEach(() => {
  vi.useRealTimers()
})

describe('Kwame Mensah, inside his break, reads the same at the ledger and at the award', () => {
  it('the award refuses him on both the time limit and the break, with the day the ledger shows', async () => {
    const row = await ledgerRow('Kwame Mensah')
    expect(row.status).toBe('IN_BREAK')
    const eligible = new Date(kwameLeft.getTime() + breakDays * DAY).toISOString().slice(0, 10)
    expect(row.eligibleDate).toBe(eligible)

    const g = await atStart(kwame)
    expect(g.canProceed).toBe(false)
    expect(rule(g, 'TENURE_CAP').outcome).toBe('BLOCK')
    expect(rule(g, 'BREAK_IN_SERVICE').outcome).toBe('BLOCK')
    expect(rule(g, 'BREAK_IN_SERVICE').reason).toContain(plainDate(eligible))
    expect(rule(g, 'TENURE_CAP').reason).toContain(plainDate(eligible))
  })
})

describe('the day after Kwame’s break ends, every door lets him back', () => {
  it('the ledger reads him eligible, with every day still on the record and the count against the limit started again', async () => {
    const after = new Date(kwameLeft.getTime() + (breakDays + 1) * DAY)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(after)
    const row = await ledgerRow('Kwame Mensah')
    expect(row.status).toBe('ELIGIBLE')
    expect(row.eligibleDate).toBeNull()
    expect(row.cumulativeDays).toBe(740)
    expect(row.countedDays).toBe(0)
    expect(row.againstLimit.percent).toBe(0)
  })

  it('the award passes the time limit and the break, where it used to refuse him for ever', async () => {
    const after = new Date(kwameLeft.getTime() + (breakDays + 1) * DAY)
    const g = await atStart(kwame, after)
    expect(rule(g, 'TENURE_CAP').outcome).toBe('PASS')
    expect(rule(g, 'TENURE_CAP').reason).toMatch(/counts again from nought/)
    expect(rule(g, 'BREAK_IN_SERVICE').outcome).toBe('PASS')
  })
})

describe('a break starts only when no line at the client is live', () => {
  it('somebody whose prime’s line ended ten days ago while the sub-vendor’s line runs on is not in a break at extension', async () => {
    const vendors = await prisma.company.findMany({ where: { kind: { in: ['VENDOR', 'GSI'] } }, select: { id: true }, take: 2 })
    const p = await prisma.person.create({ data: { name: 'Teodora Lindqvist', primaryEmail: 'teodora@lindqvist.example' } })
    const now = Date.now()
    await prisma.sellContract.create({
      data: { companyId: vendors[0].id, clientCompanyId: northbend, personId: p.id, billRate: 10_000,
        startDate: new Date(now - 200 * DAY), endDate: new Date(now - 10 * DAY), state: 'ENDED' },
    })
    await prisma.sellContract.create({
      data: { companyId: vendors[1].id, clientCompanyId: northbend, personId: p.id, billRate: 10_000,
        startDate: new Date(now - 200 * DAY), endDate: new Date(now + 100 * DAY), state: 'IN_PROGRESS' },
    })
    const g = await evaluateGovernance({
      personId: p.id, endClientCompanyId: northbend, triggerPoint: 'EXTENSION',
      subjectType: 'PERSON', subjectId: p.id,
    })
    expect(rule(g, 'BREAK_IN_SERVICE').outcome).toBe('PASS')
    expect(rule(g, 'BREAK_IN_SERVICE').reason).toMatch(/no break is running/)

    const row = await ledgerRow('Teodora Lindqvist')
    expect(row.status).toBe('OK')
  })
})
