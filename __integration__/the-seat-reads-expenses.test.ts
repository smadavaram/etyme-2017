import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'

import { GET as expenses } from '@/app/api/expenses/route'

/**
 * The expense book follows the seat, the way every other money page does.
 *
 * Invoices, purchase orders, accounts payable and contracts have all
 * read the client's book from the seat a client granted a program
 * office since `lib/money/seated-books` shipped. Expenses resolved no
 * seat at all — so an office sitting at Cavanaugh Glassworks' desk read
 * Aptiva Workforce's own, empty, expense book on a page whose every
 * neighbour was showing Cavanaugh's, and nothing on the screen said
 * which of the two it was.
 *
 * Reads follow the seat. Writing does not, and that is deliberate:
 * `POST /api/expenses` still scopes the placement to the caller's own
 * company, and the picker on the screen asks for that same book by
 * name, so a control and its route agree even while the rows beside
 * them are somebody else's.
 */

const D = '@demo.etyme.local'
const OFFICE = `world-aptiva${D}`

const id = { aptiva: '', cavanaugh: '' }

describe('a program office at a client\'s desk reads the client\'s expenses', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
    id.aptiva = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-aptiva' } })).id
    id.cavanaugh = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-corning' } })).id

    // One billable expense on a placement at Cavanaugh's site, raised by
    // the supplier that holds the line. This is what the client's own
    // desk sees, and so what its seat must see.
    const line = await prisma.sellContract.findFirstOrThrow({
      where: { endClientCompanyId: id.cavanaugh, state: 'IN_PROGRESS' },
      select: { id: true, companyId: true, personId: true },
    })
    await prisma.expense.create({
      data: {
        companyId: line.companyId,
        sellContractId: line.id,
        personId: line.personId,
        category: 'TRAVEL',
        billable: true,
        description: 'Site visit, Elmira',
        periodStart: new Date('2026-08-01T00:00:00Z'),
        periodEnd: new Date('2026-08-07T00:00:00Z'),
        items: [{ description: 'Mileage', quantity: 1, unitPrice: 18_400 }],
        total: 184,
        status: 'APPROVED',
      },
    })
  }, 600_000)

  it('has a seat to read from, or this test proves nothing', async () => {
    const seat = await prisma.programSeat.findFirst({
      where: { clientCompanyId: id.cavanaugh, officeCompanyId: id.aptiva, revokedAt: null },
    })
    expect(seat, 'the seeded world grants Aptiva no seat at Cavanaugh').not.toBeNull()
  })

  it('answers the office with the client\'s book and says so', async () => {
    as(OFFICE)
    const { status, body } = await json(await expenses(req('GET', '/api/expenses?limit=100')))
    expect(status).toBe(200)
    expect(body.data.reading).not.toBeNull()
    expect(body.data.reading.inASeat).toBe(true)
    expect(body.data.reading.company).toBe('Cavanaugh Glassworks')
  })

  it('shows the office the expense raised against work at the client\'s site', async () => {
    as(OFFICE)
    const { body } = await json(await expenses(req('GET', '/api/expenses?limit=100')))
    expect(body.data.expenses.length).toBeGreaterThan(0)
  })

  it('shows it no supplier\'s internal cost, only what is billable to the client', async () => {
    // A supplier's own costs stay with the supplier, the same rule that
    // keeps pay rates and margin off a client's screen — and a seat is
    // the client's desk, not a wider one.
    as(OFFICE)
    const { body } = await json(await expenses(req('GET', '/api/expenses?limit=100')))
    for (const e of body.data.expenses) expect(e.billable).toBe(true)
  })

  it('gives the office its own book back when it asks for it, and drops the clause', async () => {
    as(OFFICE)
    const { status, body } = await json(await expenses(req('GET', '/api/expenses?limit=100&books=own')))
    expect(status).toBe(200)
    expect(body.data.reading.inASeat).toBe(false)
    expect(body.data.reading.company).toBe('Aptiva Workforce')
  })

  it('leaves a supplier reading exactly its own book, as it always did', async () => {
    as(`world-computer-systems${D}`)
    const { status, body } = await json(await expenses(req('GET', '/api/expenses?limit=100')))
    expect(status).toBe(200)
    expect(body.data.reading.inASeat).toBe(false)
    expect(body.data.reading.company).toBe('Computer Systems Inc')
  })

  it('logs the office\'s read against the seat it was granted', async () => {
    // Every read in a seat is the client's to audit. That is the whole
    // bargain the seat is granted on.
    as(OFFICE)
    await json(await expenses(req('GET', '/api/expenses?limit=100')))
    const logged = await prisma.accessLog.findFirst({
      where: { actorCompanyId: id.aptiva, reason: { contains: 'Expense book read' } },
    })
    expect(logged, 'a read in somebody else\'s book left no trail').not.toBeNull()
  })
})
