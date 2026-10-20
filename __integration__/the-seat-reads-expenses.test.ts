import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as expenses, POST as fileExpense } from '@/app/api/expenses/route'
import { POST as decideExpenses } from '@/app/api/expenses/actions/route'
import { RATE_CHANGE_PERSON } from '@/lib/seed-rate-change'

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
    await freshWorld()
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

  it('shows it no supplier\'s internal cost: only what is billable to the client, or what the client\'s own agreement leaves out, said in a sentence', async () => {
    // A supplier's own costs stay with the supplier, the same rule that
    // keeps pay rates and margin off a client's screen — and a seat is
    // the client's book, not a wider one. Since 2026-10-19 billable is
    // the agreement's word where it said, and a kind the client's own
    // agreement leaves out is shown with that agreement's sentence.
    as(OFFICE)
    const { body } = await json(await expenses(req('GET', '/api/expenses?limit=100')))
    for (const e of body.data.expenses) {
      if (e.billable) continue
      expect(e.chain?.notBillableSays ?? '').toMatch(/^The agreement between Cavanaugh Glassworks and /)
    }
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

describe('a worker files their own expense; nobody else files it for them', () => {
  // Rosa Delgado is Brightmoor's own W2 on Northbend Athletic's site, and
  // signs in as herself. Until 2026-10-20 she could not file the flight she
  // paid for: the route asked for a seat that reads invoices.
  const the = { rosa: '', line: '', brightmoor: '', expense: '' }
  const flight = (over: Record<string, unknown> = {}) => ({
    sellContractId: the.line, personId: the.rosa, category: 'TRAVEL', billable: true,
    description: 'Flight to the client site', periodStart: '2026-09-06', periodEnd: '2026-09-12',
    items: [{ description: 'Return flight', quantity: 1, unitPrice: 412.6, expenseType: 'AIRFARE' }],
    ...over,
  })

  beforeAll(async () => {
    const rosa = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: RATE_CHANGE_PERSON.email }, select: { id: true } })
    const brightmoor = await prisma.company.findFirstOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
    const line = await prisma.sellContract.findFirstOrThrow({ where: { personId: rosa.id, companyId: brightmoor.id }, select: { id: true } })
    Object.assign(the, { rosa: rosa.id, line: line.id, brightmoor: brightmoor.id })
  })

  it('a worker files their own expense; nobody else files it for them', async () => {
    as(RATE_CHANGE_PERSON.email)
    const r = await json(await fileExpense(req('POST', '/api/expenses', flight())))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.message).toMatch(/^Filed\. Brightmoor Staffing approves it before it is paid back to you\. /)
    const e = await prisma.expense.findUniqueOrThrow({ where: { id: r.body.data.expense.id } })
    // Filed by the person who spent it is the submission; the employer's book holds it.
    // Her own `billable: true` is not read: the agreement with Northbend is silent, so it is not billable yet.
    expect(e).toMatchObject({ status: 'SUBMITTED', personId: the.rosa, companyId: the.brightmoor, sellContractId: the.line, billable: false })
    expect(Number(e.total)).toBeCloseTo(412.6, 2)
    the.expense = e.id

    // Not in somebody else's name, through her own door.
    const other = await prisma.person.findFirstOrThrow({ where: { name: 'Omar Haddad' }, select: { id: true } })
    const forOmar = await json(await fileExpense(req('POST', '/api/expenses', flight({ personId: other.id }))))
    expect(forOmar.status).toBe(403)
    expect(forOmar.body.error.message).toBe('You file your own expenses. Anybody else files theirs from their own page, and nobody files one for them.')
  })

  it('another worker cannot file an expense on her placement', async () => {
    const other = await prisma.context.findFirstOrThrow({
      where: { type: 'CONSULTANT', revokedAt: null, personId: { not: the.rosa } },
      select: { personId: true },
    })
    as((await prisma.person.findUniqueOrThrow({ where: { id: other.personId }, select: { primaryEmail: true } })).primaryEmail)
    const r = await json(await fileExpense(req('POST', '/api/expenses', flight({ personId: undefined }))))
    expect(r.status, JSON.stringify(r.body)).toBe(403)
    expect(r.body.error.message).toMatch(/^This placement is not yours/)
  })

  it('a firm raising an expense on a placement does so in the name of the person on it, and no other', async () => {
    as(`world-brightmoor${D}`)
    const other = await prisma.person.findFirstOrThrow({ where: { name: 'Omar Haddad' }, select: { id: true } })
    const r = await json(await fileExpense(req('POST', '/api/expenses', flight({ personId: other.id }))))
    expect(r.status, JSON.stringify(r.body)).toBe(422)
    expect(r.body.error.code).toBe('NOT_THIS_PERSON')
  })

  it('a firm raising an expense without saying whether it is billable gets the agreement’s answer, and a silent agreement is not billable', async () => {
    as(`world-brightmoor${D}`)
    const r = await json(await fileExpense(req('POST', '/api/expenses', flight({ billable: undefined }))))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.billable.decidedBy).toBe('NOT_DECIDED')
    expect(r.body.data.billable.says).toMatch(/so Brightmoor Staffing decides whether Northbend Athletic is billed for it\./)
    expect((await prisma.expense.findUniqueOrThrow({ where: { id: r.body.data.expense.id } })).billable).toBe(false)
  })

  it('a firm that says its expense is billable is taken at its word, as the employer’s own record', async () => {
    as(`world-brightmoor${D}`)
    const r = await json(await fileExpense(req('POST', '/api/expenses', flight())))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.billable.decidedBy).toBe('FIRM')
    expect((await prisma.expense.findUniqueOrThrow({ where: { id: r.body.data.expense.id } })).billable).toBe(true)
  })

  it('her employer approves the expense she filed, the way it always has', async () => {
    as(`world-brightmoor${D}`)
    const r = await json(await decideExpenses(req('POST', '/api/expenses/actions', { action: 'approve', expenseIds: [the.expense] })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect((await prisma.expense.findUniqueOrThrow({ where: { id: the.expense } })).status).toBe('APPROVED')
  })
})
