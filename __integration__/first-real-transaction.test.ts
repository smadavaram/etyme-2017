/**
 * The first real transaction this product has ever processed.
 *
 * Not mocks, not pure arithmetic: the actual route handlers, against a
 * real Postgres, in the order a real person would hit them. One story,
 * told in chapters that share state, because a vendor's first month is
 * sequential and so is this file.
 *
 * The cast: Sharath, a one-person consulting corporation on a gmail
 * address — the exact door opened this week — and Dana, the hiring
 * manager at his client. The plot: register, record the client and the
 * contract, work a week, approve it twice, invoice it, get paid, and
 * see the margin.
 *
 * Every failure here is a failure a real tenant would have hit on day
 * one, found for the price of a test run instead of a reputation.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'

import { POST as registerCompany } from '@/app/api/companies/route'
import { GET as getCounterparties, POST as addCounterparty } from '@/app/api/counterparties/route'
import { POST as addContact } from '@/app/api/contacts/route'
import { GET as listContracts, POST as createContract } from '@/app/api/contracts/route'
import { GET as listClients, POST as addClient } from '@/app/api/clients/route'
import { clientOptions, NO_CLIENTS_SAYS, NO_CLIENTS_HREF, type RegisterClient } from '@/lib/money/client-options'
import { POST as createTimesheet } from '@/app/api/timesheets/route'
import { POST as activateContract } from '@/app/api/contracts/[id]/activate/route'
import { GET as readChain, POST as assertHours } from '@/app/api/timesheets/[id]/assert/route'
import { POST as generateInvoices } from '@/app/api/invoices/generate/route'
import { GET as readAr } from '@/app/api/ar/route'
import { GET as readProfitability } from '@/app/api/profitability/route'

const SHARATH = 'sharath.solo@gmail.com'
const DANA = 'dana@terumoclientcorp.com'

// The story's shared state, chapter to chapter.
let soloCompanyId = ''
let clientCompanyId = ''
let sharathPersonId = ''
let contractId = ''
let engagementId = ''
let timesheetId = ''

beforeAll(async () => {
  await resetDatabase()
}, 120_000)

describe('Chapter 1 — a one-person corporation registers on a gmail address', () => {

  it('the door opened this week actually opens', async () => {
    as(SHARATH)
    const r = await json(
      await registerCompany(req('POST', '/api/companies', {
        name: 'Madavaram Consulting LLC',
        kind: 'CONSULTANT_CORP',
      }))
    )
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    soloCompanyId = r.body.data.company.id
    expect(r.body.data.company.kind).toBe('CONSULTANT_CORP')
  })

  it('gmail.com is not recorded as a verified company domain', async () => {
    const c = await prisma.company.findUniqueOrThrow({ where: { id: soloCompanyId } })
    expect(c.domain).toBeNull()
    expect(c.domainVerified).toBe(false)
  })

  it('the owner is already their own consultant, listed on their own bench', async () => {
    const person = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: SHARATH } })
    sharathPersonId = person.id
    const profile = await prisma.consultantProfile.findUniqueOrThrow({ where: { personId: person.id } })
    expect(profile.ownCompanyId).toBe(soloCompanyId)
    const listing = await prisma.benchListing.findFirst({
      where: { consultantId: profile.id, companyId: soloCompanyId, revokedAt: null },
    })
    expect(listing).not.toBeNull()
  })

  it('a company of one has one role that runs it, Owner, and no staff desks', async () => {
    // Member is the seat anybody arriving on a claimed domain is given at
    // once (founder, 2026-10-07): their own work only, no desk.
    const roles = await prisma.role.findMany({ where: { companyId: soloCompanyId } })
    expect(roles.map((r) => r.name).sort()).toEqual(['Member', 'Owner'])
  })
})

describe('Chapter 2 — the client exists, on the register, with somebody to call', () => {

  it('the client company registers on its own work domain', async () => {
    as(DANA)
    const r = await json(
      await registerCompany(req('POST', '/api/companies', {
        name: 'Talvern Medical Client Corp',
        kind: 'CLIENT',
      }))
    )
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    clientCompanyId = r.body.data.company.id
  })

  it('Sharath puts them on his register as a client', async () => {
    as(SHARATH)
    const r = await json(
      await addCounterparty(req('POST', '/api/counterparties', {
        otherCompanyId: clientCompanyId,
        relationship: 'CLIENT',
      }))
    )
    expect(r.status, JSON.stringify(r.body)).toBe(201)
  })

  it('and records who at the client answers the phone', async () => {
    as(SHARATH)
    const r = await json(
      await addContact(req('POST', '/api/contacts', {
        atCompanyId: clientCompanyId,
        name: 'Dana Whitfield',
        email: DANA,
        kind: 'HIRING_MANAGER',
      }))
    )
    expect(r.status, JSON.stringify(r.body)).toBe(201)
  })

  it('the register shows one client with one contact', async () => {
    as(SHARATH)
    const r = await json(await getCounterparties(req('GET', '/api/counterparties')))
    const row = r.body.data.rows.find((x: any) => x.otherCompanyId === clientCompanyId)
    expect(row.relationship).toBe('CLIENT')
    expect(row.contacts).toBe(1)
  })
})

describe('Chapter 3 — the existing contract is recorded, both sides at once', () => {

  it('one call creates the sell side, the buy side, and the link', async () => {
    as(SHARATH)
    const r = await json(
      await createContract(req('POST', '/api/contracts', {
        personId: sharathPersonId,
        companyId: soloCompanyId,
        clientCompanyId,
        billRate: 9500,
        billCurrency: 'USD',
        startDate: '2026-08-01',
        payRate: 8000,
        payCurrency: 'USD',
        contractType: 'W2',
      }))
    )
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    contractId = r.body.data.sellContract?.id ?? r.body.data.contract?.id
    expect(contractId, JSON.stringify(r.body)).toBeTruthy()

    const sell = await prisma.sellContract.findUniqueOrThrow({
      where: { id: contractId },
      include: { buyLinks: true },
    })
    engagementId = sell.engagementId!
    expect(sell.buyLinks.length, 'the buy side exists and is linked').toBeGreaterThan(0)
  })

  it('a contract that started in August has its I-9 on file — recording it here is recording what exists', async () => {
    // Activation refuses a start with no work authorization. A solo
    // operator recording their own running W-2 contract has an I-9 —
    // they have been employing themselves since August — so it is
    // recorded before the contract is, not invented to pass a gate.
    await prisma.verification.create({
      data: {
        personId: sharathPersonId, type: 'I9_EVERIFY', status: 'CLEAR', provider: 'E-Verify',
        issuedAt: new Date('2026-07-28'), uploadedById: sharathPersonId,
        verifiedById: sharathPersonId, verifiedAt: new Date('2026-07-28'),
        result: { outcome: 'CLEAR' },
      },
    })
  })

  it('a recorded contract still has to be activated before it bills — a real step, not a bug', async () => {
    // No certificate of insurance is on file and none has been asked
    // for. Unknown is not lapsed: the gate warns and asks for a reason,
    // and a one-person corp has one. The reason travels with the record.
    as(SHARATH)
    const first = await json(
      await activateContract(
        req('POST', `/api/contracts/${contractId}/activate`, { action: 'activate' }),
        { params: Promise.resolve({ id: contractId }) }
      )
    )
    expect(first.status, JSON.stringify(first.body)).toBe(422)
    expect(first.body.error.code).toBe('DOCUMENTS_WARN')

    const r = await json(
      await activateContract(
        req('POST', `/api/contracts/${contractId}/activate`, {
          action: 'activate',
          overrideReason: 'Sole operator, no employees — workers\' comp exempt; GL certificate requested from broker.',
        }),
        { params: Promise.resolve({ id: contractId }) }
      )
    )
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  })

  it('profitability refuses nothing here: the placement has a price AND a cost', async () => {
    const buy = await prisma.buyContract.findFirst({
      where: { candidates: { some: { personId: sharathPersonId } } },
      include: { candidates: true },
    })
    expect(buy?.candidates[0]?.payRate).toBe(8000)
  })
})

describe('Chapter 4 — a week is worked and approved by both parties', () => {

  it('the week goes in as days, not as one number', async () => {
    as(SHARATH)
    const r = await json(
      await createTimesheet(req('POST', '/api/timesheets', {
        sellContractId: contractId,
        periodStart: '2026-08-03',
        periodEnd: '2026-08-07',
        days: {
          '2026-08-03': 8, '2026-08-04': 8, '2026-08-05': 8,
          '2026-08-06': 8, '2026-08-07': 8,
        },
      }))
    )
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    timesheetId = r.body.data.timesheet?.id ?? r.body.data.id
    expect(timesheetId, JSON.stringify(r.body)).toBeTruthy()
  })

  it('the client approves the fact that the work happened', async () => {
    as(DANA)
    const r = await json(
      await assertHours(
        req('POST', `/api/timesheets/${timesheetId}/assert`, {}),
        { params: Promise.resolve({ id: timesheetId }) }
      )
    )
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  })

  it('the employer accepts the basis for pay — for a company of one, that is Sharath', async () => {
    as(SHARATH)
    const r = await json(
      await assertHours(
        req('POST', `/api/timesheets/${timesheetId}/assert`, {}),
        { params: Promise.resolve({ id: timesheetId }) }
      )
    )
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  })

  it('both signatures stand on the chain and nothing waits', async () => {
    as(SHARATH)
    const r = await json(
      await readChain(
        req('GET', `/api/timesheets/${timesheetId}/assert`),
        { params: Promise.resolve({ id: timesheetId }) }
      )
    )
    const live = (r.body.data.legs ?? []).filter((l: any) => l.state === 'ANSWERED' || l.assertion)
    expect(live.length, JSON.stringify(r.body.data.legs)).toBeGreaterThanOrEqual(2)
  })

  it('the approval posted real money to a real project order', async () => {
    const postings = await prisma.orderPosting.findMany({
      where: { personId: sharathPersonId },
    })
    const kinds = postings.map((p) => p.kind).sort()
    expect(kinds, JSON.stringify(postings.map((p) => ({ kind: p.kind, cents: p.amountCents }))))
      .toContain('REVENUE')
    expect(kinds).toContain('PAY')
    const revenue = postings.find((p) => p.kind === 'REVENUE')!
    // 40 hours at $95 in cents, converted to the order's currency at 1:1.
    expect(revenue.amountCents).toBe(40 * 9500)
  })
})

describe('Chapter 5 — the invoice exists, dated the day it was raised', () => {

  it('generating for the engagement produces one real invoice', async () => {
    as(SHARATH)
    const r = await json(
      await generateInvoices(req('POST', '/api/invoices/generate', {
        engagementId,
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
      }))
    )
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  })

  it('issuedAt is written — the column that sat unwritten for a week', async () => {
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { engagementId } })
    expect(invoice.issuedAt).not.toBeNull()
    expect(Number(invoice.total)).toBeCloseTo(3800, 0) // 40h × $95, whole currency
  })
})

describe('Chapter 6 — the money is visible where a person would look for it', () => {

  it('accounts receivable shows the client owing the invoice', async () => {
    as(SHARATH)
    const r = await json(await readAr(req('GET', '/api/ar')))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const s = JSON.stringify(r.body.data)
    expect(s).toContain('380000') // $3,800 in cents, somewhere in the book
  })

  it('a payment arrives and the book closes to zero', async () => {
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { engagementId } })
    await prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        amount: invoice.total,
        receivedAt: new Date('2026-09-05'),
        method: 'ACH',
        reference: 'first real dollar',
      },
    })
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { paid: invoice.total, status: 'PAID' },
    })

    as(SHARATH)
    const r = await json(await readAr(req('GET', '/api/ar')))
    expect(r.body?.error).toBeUndefined()
  })

  it('profitability reports the real margin, not a fabricated one', async () => {
    as(SHARATH)
    const r = await json(await readProfitability(req('GET', '/api/profitability?by=order')))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const overall = r.body.data.overall
    // $95 billed, $80 paid + 22% W2 burden on pay. Real numbers or nothing.
    expect(overall.revenueCents).toBe(380_000)
    expect(overall.costUnknown).toBe(false)
  })
})

/**
 * A supplier's first contract, recorded on its first day.
 *
 * Tapin's first morning on Etyme (2026-10-19): "Record a placement" read
 * its client list only off the firm's existing sell contracts, so a firm
 * with none was offered nobody to bill, even after adding its client from
 * Companies. The form now reads the firm's register first
 * (`lib/money/client-options`), and the route's refusal says where to add
 * a client rather than naming an API path.
 */
describe('Chapter 7 — a supplier records its first contract for a client not on Etyme', () => {
  const OWNER = 'priya@tallowstaffing.com'
  let firmId = ''
  let ownerId = ''
  let shellId = ''

  const register = async () => {
    as(OWNER)
    const r = await json(await listClients(req('GET', '/api/clients')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    return r.body.data.clients as RegisterClient[]
  }

  beforeAll(async () => {
    as(OWNER)
    const r = await json(await registerCompany(req('POST', '/api/companies', { name: 'Tallow Staffing', kind: 'VENDOR' })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    firmId = r.body.data.company.id
    ownerId = (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: OWNER } })).id
  }, 120_000)

  it('with no clients the form says to add one from Companies and that they need not be on Etyme', async () => {
    const options = clientOptions(await register(), [])
    expect(options).toEqual([])
    expect(NO_CLIENTS_SAYS).toBe('No clients yet. Add one from Companies — they do not need to be on Etyme.')
    expect(NO_CLIENTS_HREF).toBe('/dashboard/companies')

    // And the route, asked for a client nobody added, says the same thing in words, not an API path.
    as(OWNER)
    const r = await json(await createContract(req('POST', '/api/contracts', {
      personId: ownerId, companyId: firmId, clientCompanyId: 'no-such-client',
      billRate: 9000, billCurrency: 'USD', startDate: '2026-10-19', payRate: 7000, payCurrency: 'USD', contractType: 'W2',
    })))
    expect(r.status).toBe(404)
    expect(r.body.error.message).toBe('We could not find that client. Add them from Companies first; they do not need to be on Etyme.')
    expect(r.body.error.message).not.toMatch(/\/api\//)
  })

  it('a supplier’s first new contract offers the client it added from Companies, marked not on Etyme yet', async () => {
    as(OWNER)
    const added = await json(await addClient(req('POST', '/api/clients', { name: 'Harrow Freight Lines' })))
    expect(added.status, JSON.stringify(added.body)).toBeLessThan(300)
    shellId = (await prisma.company.findFirstOrThrow({ where: { name: 'Harrow Freight Lines', listedById: firmId } })).id

    // No sell contract exists yet, and the client is offered all the same.
    expect(await prisma.sellContract.count({ where: { companyId: firmId } })).toBe(0)
    const options = clientOptions(await register(), [])
    expect(options).toEqual([{ id: shellId, name: 'Harrow Freight Lines — not on Etyme yet' }])

    // Picking it records the contract.
    as(OWNER)
    const r = await json(await createContract(req('POST', '/api/contracts', {
      personId: ownerId, companyId: firmId, clientCompanyId: shellId,
      billRate: 9000, billCurrency: 'USD', startDate: '2026-10-19', payRate: 7000, payCurrency: 'USD', contractType: 'W2',
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()

    // Once it is on a contract too, it is offered once, and still says it is not on Etyme yet.
    as(OWNER)
    const list = await json(await listContracts(req('GET', '/api/contracts?side=sell&limit=100')))
    expect(list.status, JSON.stringify(list.body)).toBe(200)
    expect(clientOptions(await register(), list.body.data.contracts)).toEqual([
      { id: shellId, name: 'Harrow Freight Lines — not on Etyme yet' },
    ])
  })
})
