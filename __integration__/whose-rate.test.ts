import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'

import { GET as timesheets } from '@/app/api/timesheets/route'
import { GET as people } from '@/app/api/people/route'
import { GET as tenure } from '@/app/api/tenure/route'
import { GET as budget } from '@/app/api/program/budget/route'

/**
 * A client should see its own numbers, and only its own.
 *
 * Nike buys Helena Marsh from Computer Systems at $145/hr. Computer
 * Systems buys her from CloudEPA at $118/hr. Both sell contracts name
 * Nike as the end client — that is how the same person, bought through
 * a chain, aggregates into one tenure ledger, and it is also how
 * Nike's own timesheet list came to print $118 beside a role it pays
 * $145 for. Subtracting one from the other is Computer Systems' entire
 * margin on the placement, computable off its own customer's screen.
 *
 * Her hours hang off the bottom leg, where the employer is, so the
 * answer is not to hide the row — Nike signs those hours. The answer
 * is to price the row at the contract Nike actually pays.
 *
 * Four things passed 4,821 green tests, a clean typecheck and a clean
 * build. This walks all four against the seeded world, which is where
 * every one of them was visible in a single screen.
 */

const D = '@demo.etyme.local'
const NIKE_HIRING = `world-nike-hiring${D}`

const HELENA_SUB_RATE = 11800 // CloudEPA → Computer Systems
const HELENA_TOP_RATE = 14500 // Computer Systems → Nike

let helenaId = ''
let helenaEmail = ''

describe('a client sees the rate it pays, never the rate its supplier pays underneath', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
    const helena = await prisma.person.findFirstOrThrow({ where: { name: 'Helena Marsh' } })
    helenaId = helena.id
    helenaEmail = helena.primaryEmail
  }, 600_000)

  it('has a chain to read in the first place, or this test proves nothing', async () => {
    const rungs = await prisma.sellContract.findMany({
      where: { personId: helenaId },
      select: { billRate: true },
      orderBy: { billRate: 'asc' },
    })
    expect(rungs.map((r) => r.billRate)).toContain(HELENA_SUB_RATE)
    expect(rungs.map((r) => r.billRate)).toContain(HELENA_TOP_RATE)
  })

  it('files her hours against the leg her employer sells, which is why the leak was invisible', async () => {
    const sheets = await prisma.timesheet.findMany({
      where: { personId: helenaId },
      select: { sellContract: { select: { billRate: true } } },
    })
    expect(sheets.length).toBeGreaterThan(0)
    for (const s of sheets) expect(s.sellContract.billRate).toBe(HELENA_SUB_RATE)
  })

  it('shows the hiring manager $145 an hour and never $118', async () => {
    as(NIKE_HIRING)
    const { status, body } = await json(await timesheets(req('GET', '/api/timesheets?limit=50')))
    expect(status).toBe(200)

    const hers = body.data.timesheets.filter((t: any) => t.person.id === helenaId)
    expect(hers.length).toBeGreaterThan(0)
    for (const row of hers) {
      expect(row.rate.cents).toBe(HELENA_TOP_RATE)
      expect(row.rate.basis).toBe('BILL')
    }
  })

  it('never puts a supplier’s cost anywhere on the client’s whole list', async () => {
    as(NIKE_HIRING)
    const { body } = await json(await timesheets(req('GET', '/api/timesheets?limit=50')))
    const everyNumber = body.data.timesheets.flatMap((t: any) => [
      t.rate.cents,
      t.overtime?.rateCents ?? null,
    ])
    expect(everyNumber).not.toContain(HELENA_SUB_RATE)
  })

  it('names the firm Nike pays on the row, not the firm its prime pays', async () => {
    as(NIKE_HIRING)
    const { body } = await json(await timesheets(req('GET', '/api/timesheets?limit=50')))
    const row = body.data.timesheets.find((t: any) => t.person.id === helenaId)
    expect(row.sellContract.clientCompany.name).toBe('Nike')
  })
})

describe('the same person bought through a chain is one row and one rate on the client’s list', () => {
  it('gives Helena one week per week, not one per rung', async () => {
    as(NIKE_HIRING)
    const { body } = await json(await timesheets(req('GET', '/api/timesheets?limit=50')))
    const hers = body.data.timesheets.filter((t: any) => t.person.id === helenaId)
    const periods = hers.map((t: any) => t.periodStart)
    expect(new Set(periods).size).toBe(periods.length)
  })

  it('carries one rate per row, and it is the same rate on every one of them', async () => {
    as(NIKE_HIRING)
    const { body } = await json(await timesheets(req('GET', '/api/timesheets?limit=50')))
    const hers = body.data.timesheets.filter((t: any) => t.person.id === helenaId)
    expect(new Set(hers.map((t: any) => t.rate.cents)).size).toBe(1)
  })
})

describe('what a client has approved is valued at the rate that client is billed', () => {
  it('values her approved weeks at $145 an hour', async () => {
    as(NIKE_HIRING)
    const { body } = await json(await timesheets(req('GET', '/api/timesheets?status=APPROVED&limit=50')))
    const hers = body.data.timesheets.filter((t: any) => t.person.id === helenaId)
    expect(hers.length).toBeGreaterThan(0)
    for (const row of hers) {
      expect(row.overtime.billableCents).toBe(row.totalHours * HELENA_TOP_RATE)
    }
  })

  it('understated the client by the prime’s margin when it read the leg underneath', async () => {
    as(NIKE_HIRING)
    const { body } = await json(await timesheets(req('GET', '/api/timesheets?status=APPROVED&limit=50')))
    const hers = body.data.timesheets.filter((t: any) => t.person.id === helenaId)
    const hours = hers.reduce((n: number, t: any) => n + t.totalHours, 0)
    const shown = hers.reduce((n: number, t: any) => n + t.overtime.billableCents, 0)
    expect(shown - hours * HELENA_SUB_RATE).toBe(hours * (HELENA_TOP_RATE - HELENA_SUB_RATE))
  })
})

describe('a consultant sees what they are paid and never what they are billed at', () => {
  it('opens the page their session can reach and finds their own pay on it', async () => {
    as(helenaEmail)
    const { status, body } = await json(await timesheets(req('GET', '/api/timesheets?limit=50')))
    expect(status).toBe(200)
    expect(body.data.timesheets.length).toBeGreaterThan(0)

    // Her own pay, from the agreement that pays her — $90 an hour
    // against the $125-to-$145 her agency charges for her.
    const line = await prisma.buyContractCandidate.findFirstOrThrow({
      where: { personId: helenaId, state: 'ACTIVE' },
      select: { payRate: true },
    })
    expect(line.payRate).toBeGreaterThan(0)

    for (const row of body.data.timesheets) {
      expect(row.rate.basis).toBe('PAY')
      expect(row.rate.cents).toBe(line.payRate)
      expect(row.rate.cents).not.toBe(HELENA_SUB_RATE)
      expect(row.rate.cents).not.toBe(HELENA_TOP_RATE)
    }
  })

  it('shows them only their own weeks, never the agency’s book', async () => {
    as(helenaEmail)
    const { body } = await json(await timesheets(req('GET', '/api/timesheets?limit=50')))
    for (const row of body.data.timesheets) expect(row.person.id).toBe(helenaId)
  })

  it('values their week at their own rate, so the markup never appears as a total either', async () => {
    as(helenaEmail)
    const { body } = await json(await timesheets(req('GET', '/api/timesheets?limit=50')))
    for (const row of body.data.timesheets) {
      if (row.rate.cents == null) {
        expect(row.overtime.billableCents).toBeNull()
        expect(row.rate.says).toBeTruthy()
      } else {
        expect(row.overtime.billableCents).toBeLessThanOrEqual(row.totalHours * row.rate.cents)
      }
    }
  })
})

describe('nobody is shown a button the server will refuse them', () => {
  it('offers the consultant no signature on their own week', async () => {
    as(helenaEmail)
    const { body } = await json(await timesheets(req('GET', '/api/timesheets?limit=50')))
    for (const row of body.data.timesheets) {
      expect(row.mayApprove).toBe(false)
      expect(row.mayApproveWhyNot).toBe('Nobody approves their own hours.')
    }
  })

  it('offers the hiring manager the signature, because the buyer says the work happened', async () => {
    as(NIKE_HIRING)
    const { body } = await json(await timesheets(req('GET', '/api/timesheets?status=SUBMITTED&limit=50')))
    expect(body.data.timesheets.length).toBeGreaterThan(0)
    for (const row of body.data.timesheets) expect(row.mayApprove).toBe(true)
  })
})

describe('tenure counts days actually served, never the length of the contract', () => {
  it('reads the same months on the contractors page as on the tenure page', async () => {
    as(NIKE_HIRING)
    const register = await json(await people(req('GET', '/api/people')))
    const ledger = await json(await tenure(req('GET', '/api/tenure')))
    expect(register.status).toBe(200)
    expect(ledger.status).toBe(200)

    const byPerson = new Map<string, number>(
      ledger.body.data.people.map((p: any) => [p.personId, p.cumulativeMonths])
    )
    const rows = register.body.data.people.filter((r: any) => byPerson.has(r.personId))
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect({ who: row.name, months: row.monthsHere })
        .toEqual({ who: row.name, months: byPerson.get(row.personId) })
    }
  })

  it('does not say Helena is past a cap she is halfway to', async () => {
    as(NIKE_HIRING)
    const { body } = await json(await people(req('GET', '/api/people')))
    const her = body.data.people.find((r: any) => r.personId === helenaId)
    // Two hundred days in on an eighteen-month cap. The register said
    // twenty-four months and printed "past your cap" in clay.
    expect(her.monthsHere).toBeLessThan(12)
    expect(her.headroomMonths).toBeGreaterThan(0)
    expect(her.says).not.toMatch(/past your cap/)
  })

  it('says the day somebody starts, for somebody who has not started yet', async () => {
    as(NIKE_HIRING)
    const { body } = await json(await people(req('GET', '/api/people')))
    const ingrid = body.data.people.find((r: any) => r.name?.includes('Ingrid'))
    expect(ingrid).toBeDefined()
    // The register said "12 months here, 6 left" and then "On site
    // here. Nothing needs you." about somebody whose first day has not
    // come. The tenure page next door said "has not started".
    expect(ingrid.monthsHere).toBe(0)
    expect(ingrid.says).toMatch(/^Starts /)
  })
})

describe('what a client has spent is counted at the desk that signed for it', () => {
  it('charges a week filed on a supplier\u2019s own leg to the cost center that owns the role', async () => {
    as(NIKE_HIRING)
    const budgets = await json(await budget(req('GET', '/api/program/budget')))
    expect(budgets.status).toBe(200)

    const sheets = await json(await timesheets(req('GET', '/api/timesheets?status=APPROVED&limit=50')))
    const signed = sheets.body.data.timesheets.reduce(
      (n: number, t: any) => n + (t.overtime.billableCents ?? 0), 0
    )

    // Helena's weeks hang off CloudEPA's leg, which no cost center is
    // allocated, so the budget missed every one of them: $18k against
    // the $35,800 the client had signed for.
    expect(signed).toBeGreaterThan(0)
    expect(budgets.body.data.summary.actualCents).toBe(signed)
  })
})

describe('a person bought through two legs of one chain has served one set of days, not two', () => {
  it('counts Helena’s chain once, the way lib/chain-top counts it on the dashboard', async () => {
    as(NIKE_HIRING)
    const { body } = await json(await people(req('GET', '/api/people')))
    const her = body.data.people.find((r: any) => r.personId === helenaId)

    const rungs = await prisma.sellContract.findMany({
      where: { personId: helenaId, state: { in: ['IN_PROGRESS', 'ENDED', 'PAUSED'] } },
      select: { startDate: true },
    })
    expect(rungs.length).toBeGreaterThan(1)

    const oneLeg = Math.round(
      (Date.now() - rungs[0].startDate.getTime()) / 86_400_000 / 30.44
    )
    expect(her.monthsHere).toBeLessThanOrEqual(oneLeg + 1)
  })
})
