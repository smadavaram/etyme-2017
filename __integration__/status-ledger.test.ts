import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { day } from '@/lib/seed-days'

import { POST as raiseRequisition } from '@/app/api/requisitions/route'
import { POST as distribute } from '@/app/api/requisitions/[id]/distribute/route'
import { POST as decline } from '@/app/api/invitations/[id]/decline/route'
import { POST as submitCandidates } from '@/app/api/submissions/route'
import { POST as award } from '@/app/api/submissions/[id]/award/route'
import { POST as activate } from '@/app/api/contracts/[id]/activate/route'
import { POST as fileTimesheet } from '@/app/api/timesheets/route'
import { POST as sendTimesheet } from '@/app/api/timesheets/[id]/submit/route'
import { POST as approveTimesheet } from '@/app/api/timesheets/[id]/approve/route'
import { POST as fileExpense } from '@/app/api/expenses/route'
import { POST as expenseAction } from '@/app/api/expenses/actions/route'
import { POST as generateInvoice } from '@/app/api/invoices/generate/route'
import { POST as submitInvoice } from '@/app/api/invoices/[id]/submit/route'
import { POST as pay } from '@/app/api/invoices/[id]/payments/route'
import { GET as endContracts } from '@/app/api/cron/end-contracts/route'
import { GET as placement } from '@/app/api/placements/[id]/route'

/**
 * Every table moves.
 *
 * "We need all tables to keep moving their respective statuses across
 * the app." One placement, walked from the requisition to the paid
 * invoice and the last day, and after each station every table that
 * touches it is read back — the requirement, the invitations, the
 * submissions, both contracts, the cycles, the timesheet, the invoice,
 * the payment. A status that should have moved and did not fails here
 * by name.
 *
 * Three of these movements were missing until this file was written:
 * the hours, invoice and bill cycles never completed; a contract never
 * ended; a supplier could not decline.
 */

const D = '@demo.etyme.local'
const NIKE = { programme: `world-nike-programme${D}`, hiring: `world-nike-hiring${D}`, ap: `world-nike-ap${D}` }
const PINNACLE = `world-pinnacle${D}`
const BRIGHTMOOR = `world-brightmoor${D}`
const WORKER = 'tariq.al.amin@seed.etyme.invalid'

const call = async (fn: (r: any, ctx: any) => Promise<Response>, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve({ id }) }))

const co: Record<string, string> = {}
const it_: Record<string, any> = {}

/** The cycles on a contract, by kind, and whether each is done. */
async function cycles(where: { sellContractId?: string; buyContractId?: string }) {
  const rows = await prisma.cycle.findMany({ where, orderBy: { dueOn: 'asc' }, select: { kind: true, dueOn: true, completedAt: true } })
  const byKind: Record<string, { total: number; done: number }> = {}
  for (const r of rows) {
    byKind[r.kind] ??= { total: 0, done: 0 }
    byKind[r.kind].total++
    if (r.completedAt) byKind[r.kind].done++
  }
  return byKind
}

describe('the ledger: one placement, every table, every station', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
    for (const slug of ['world-nike', 'world-pinnacle', 'world-brightmoor']) {
      co[slug] = (await prisma.company.findUniqueOrThrow({ where: { slug }, select: { id: true } })).id
    }
    // Somebody on Pinnacle's bench, who can sign in and file their own hours.
    const tariq = await prisma.person.create({ data: { name: 'Tariq Al-Amin', primaryEmail: WORKER } })
    it_.worker = tariq.id
    const profile = await prisma.consultantProfile.create({
      data: { personId: tariq.id, skills: ['Power BI', 'Workforce planning'], location: 'Portland, OR', visibility: 'VERIFIED', workAuth: 'USC' },
    })
    await prisma.benchListing.create({
      data: { consultantId: profile.id, companyId: co['world-pinnacle'], tier: 'RETAINED', state: 'GRANTED', invitedAt: day(-30), respondedAt: day(-29), grantedAt: day(-29) },
    })
    await prisma.context.create({
      data: { personId: tariq.id, companyId: co['world-pinnacle'], type: 'CONSULTANT', side: 'SELL', grantReason: 'On the bench' },
    })
  }, 240_000)

  it('a requirement is raised inside plan and is OPEN and auto-approved at once', async () => {
    const cc = await prisma.costCenter.findFirstOrThrow({ where: { companyId: co['world-nike'], code: { startsWith: 'APPS-' } } })
    as(NIKE.hiring)
    const r = await json(await raiseRequisition(req('POST', '/api/requisitions', {
      title: 'Workforce analytics lead', skills: ['Power BI', 'Workforce planning'],
      location: 'Beaverton, OR', billMin: 3200, billMax: 4000, months: 6, headcount: 1, hoursPerWeek: 40,
      costCenterId: cc.id, neededBy: day(7).toISOString(),
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.requisition = r.body.data.requisition.id
    const row = await prisma.requirement.findUniqueOrThrow({ where: { id: it_.requisition } })
    expect([row.status, row.approvalState]).toEqual(['OPEN', 'AUTO_APPROVED'])
  })

  it('sent to two suppliers: both invitations are SENT', async () => {
    as(NIKE.programme)
    const r = await call(distribute, 'POST', `/api/requisitions/${it_.requisition}/distribute`, it_.requisition, {
      vendors: [
        { companyId: co['world-pinnacle'], payMin: 3200, payMax: 3800 },
        { companyId: co['world-brightmoor'], payMin: 3200, payMax: 3800 },
      ],
    })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const inv = await prisma.requirementInvitation.findMany({ where: { requirementId: it_.requisition } })
    expect(inv.map((i) => i.status)).toEqual(['SENT', 'SENT'])
  })

  it('Brightmoor declines: its invitation is DECLINED, and whoever is hiring is told why', async () => {
    const mine = await prisma.requirementInvitation.findFirstOrThrow({ where: { requirementId: it_.requisition, toCompanyId: co['world-brightmoor'] } })
    as(BRIGHTMOOR)
    const r = await call(decline, 'POST', `/api/invitations/${mine.id}/decline`, mine.id, { reason: 'Nobody free with Power BI this quarter.' })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect((await prisma.requirementInvitation.findUniqueOrThrow({ where: { id: mine.id } })).status).toBe('DECLINED')
    const told = await prisma.notification.findFirst({ where: { entityId: it_.requisition, title: { contains: 'declined' } } })
    expect(told?.body).toBe('Nobody free with Power BI this quarter.')
  })

  it('Pinnacle submits: its invitation is ACCEPTED and the submission is SUBMITTED', async () => {
    as(PINNACLE)
    const r = await json(await submitCandidates(req('POST', '/api/submissions', {
      requirementId: it_.requisition, personIds: [it_.worker], rate: 3800, fromCompanyId: co['world-pinnacle'],
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.submission = (await prisma.submission.findFirstOrThrow({ where: { requirementId: it_.requisition, personId: it_.worker } })).id
    expect((await prisma.submission.findUniqueOrThrow({ where: { id: it_.submission } })).status).toBe('SUBMITTED')
    const inv = await prisma.requirementInvitation.findFirstOrThrow({ where: { requirementId: it_.requisition, toCompanyId: co['world-pinnacle'] } })
    expect(inv.status).toBe('ACCEPTED')
  })

  it('the award: submission PLACED, requirement FILLED and archived, both contracts DRAFT, cycles written and none done', async () => {
    as(NIKE.hiring)
    const r = await call(award, 'POST', `/api/submissions/${it_.submission}/award`, it_.submission, {
      rate: 3800, startDate: day(-14).toISOString().slice(0, 10), endDate: day(180).toISOString().slice(0, 10),
    })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.contract = r.body.data.contractId

    expect((await prisma.submission.findUniqueOrThrow({ where: { id: it_.submission } })).status).toBe('PLACED')
    const req_ = await prisma.requirement.findUniqueOrThrow({ where: { id: it_.requisition } })
    expect(req_.status).toBe('FILLED')
    expect(req_.archivedAt).not.toBeNull()

    const sell = await prisma.sellContract.findUniqueOrThrow({ where: { id: it_.contract }, include: { buyLinks: true } })
    it_.buy = sell.buyLinks[0].buyContractId
    it_.engagement = sell.engagementId
    expect(sell.state).toBe('DRAFT')
    expect((await prisma.buyContract.findUniqueOrThrow({ where: { id: it_.buy } })).state).toBe('DRAFT')

    const sellCycles = await cycles({ sellContractId: it_.contract })
    // No invoice-due cycle: when an invoice falls due is the invoice's
    // own fact, counted from the day the client received it, and a date
    // guessed on the 28th months ahead could only disagree with it.
    expect(Object.keys(sellCycles).sort()).toEqual(['INVOICE_GENERATE', 'TIMESHEET_APPROVE', 'TIMESHEET_SUBMIT'])
    expect(Object.values(sellCycles).every((c) => c.done === 0)).toBe(true)
  })

  it('activation with the paperwork on file: both contracts IN_PROGRESS', async () => {
    // The I-9 the gate demands, so this story is about statuses rather than paperwork.
    const seat = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: PINNACLE } })
    await prisma.verification.create({
      data: {
        personId: it_.worker, type: 'I9_EVERIFY', status: 'CLEAR', provider: 'E-Verify', issuedAt: day(-1),
        uploadedById: seat.id, verifiedById: seat.id, verifiedAt: day(-1), result: { outcome: 'CLEAR' },
      },
    })
    as(PINNACLE)
    const r = await call(activate, 'POST', `/api/contracts/${it_.contract}/activate`, it_.contract, {
      action: 'activate', overrideReason: 'Background check ordered; Northbend Athletic waived it for the first fortnight in writing.',
    })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect((await prisma.sellContract.findUniqueOrThrow({ where: { id: it_.contract } })).state).toBe('IN_PROGRESS')
    expect((await prisma.buyContract.findUniqueOrThrow({ where: { id: it_.buy } })).state).toBe('IN_PROGRESS')
  })

  it('a week filed and sent: timesheet OPEN then SUBMITTED, and the hours-due cycle is done', async () => {
    as(WORKER)
    const WEEK = { periodStart: day(-7).toISOString().slice(0, 10), periodEnd: day(-3).toISOString().slice(0, 10) }
    const days: Record<string, number> = {}
    for (let i = 0; i < 5; i++) days[day(-7 + i).toISOString().slice(0, 10)] = 8
    const r = await json(await fileTimesheet(req('POST', '/api/timesheets', { sellContractId: it_.contract, ...WEEK, days })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.timesheet = r.body.data.timesheet.id
    expect((await prisma.timesheet.findUniqueOrThrow({ where: { id: it_.timesheet } })).status).toBe('OPEN')

    const s = await call(sendTimesheet, 'POST', `/api/timesheets/${it_.timesheet}/submit`, it_.timesheet, {})
    expect(s.body?.error, JSON.stringify(s.body)).toBeUndefined()
    expect((await prisma.timesheet.findUniqueOrThrow({ where: { id: it_.timesheet } })).status).toBe('SUBMITTED')
    expect((await cycles({ sellContractId: it_.contract })).TIMESHEET_SUBMIT.done).toBe(1)
  })

  it('both signatures: timesheet APPROVED, and the hours-to-approve cycle is done', async () => {
    as(NIKE.hiring)
    const c = await call(approveTimesheet, 'POST', `/api/timesheets/${it_.timesheet}/approve`, it_.timesheet, {})
    expect(c.body?.error, JSON.stringify(c.body)).toBeUndefined()
    expect((await prisma.timesheet.findUniqueOrThrow({ where: { id: it_.timesheet } })).status).toBe('SUBMITTED')
    expect((await cycles({ sellContractId: it_.contract })).TIMESHEET_APPROVE.done).toBe(0)

    as(PINNACLE)
    const e = await call(approveTimesheet, 'POST', `/api/timesheets/${it_.timesheet}/approve`, it_.timesheet, { as: 'EMPLOYER' })
    expect(e.body?.error, JSON.stringify(e.body)).toBeUndefined()
    expect((await prisma.timesheet.findUniqueOrThrow({ where: { id: it_.timesheet } })).status).toBe('APPROVED')
    expect((await cycles({ sellContractId: it_.contract })).TIMESHEET_APPROVE.done).toBe(1)
  })

  it('a flight Tariq paid for: expense DRAFT, SUBMITTED, APPROVED', async () => {
    as(PINNACLE)
    const r = await json(await fileExpense(req('POST', '/api/expenses', {
      sellContractId: it_.contract, personId: it_.worker, category: 'TRAVEL', billable: true,
      description: 'Flight PDX–DEN for the kickoff',
      periodStart: day(-7).toISOString().slice(0, 10), periodEnd: day(-3).toISOString().slice(0, 10),
      items: [{ description: 'Return flight', quantity: 1, unitPrice: 412.5, expenseType: 'AIRFARE' }],
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.expense = r.body.data.expense.id
    expect((await prisma.expense.findUniqueOrThrow({ where: { id: it_.expense } })).status).toBe('DRAFT')

    for (const action of ['submit', 'approve']) {
      const a = await json(await expenseAction(req('POST', '/api/expenses/actions', { action, expenseIds: [it_.expense] })))
      expect(a.body?.error, JSON.stringify(a.body)).toBeUndefined()
    }
    expect((await prisma.expense.findUniqueOrThrow({ where: { id: it_.expense } })).status).toBe('APPROVED')
  })

  it('the invoice: ISSUED on raising with the expense on it as INVOICED, SUBMITTED on sending, and the invoice-to-raise cycle is done', async () => {
    as(PINNACLE)
    const r = await json(await generateInvoice(req('POST', '/api/invoices/generate', { engagementId: it_.engagement })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.invoice = r.body.data.invoice.id
    // 40 hours at $38, and the $412.50 flight.
    expect(r.body.data.invoice.total).toBe(1932.5)
    const exp = await prisma.expense.findUniqueOrThrow({ where: { id: it_.expense } })
    expect([exp.status, exp.invoiceId]).toEqual(['INVOICED', it_.invoice])
    expect(await prisma.invoiceLine.count({ where: { invoiceId: it_.invoice, expenseId: it_.expense } })).toBe(1)
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: it_.invoice } })).status).toBe('ISSUED')
    expect((await cycles({ sellContractId: it_.contract })).INVOICE_GENERATE.done).toBe(1)

    const s = await call(submitInvoice, 'POST', `/api/invoices/${it_.invoice}/submit`, it_.invoice, {})
    expect(s.body?.error, JSON.stringify(s.body)).toBeUndefined()
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: it_.invoice } })).status).toBe('SUBMITTED')
  })

  it('the payment: invoice PAID with its expense, and a payment row saying who paid whom', async () => {
    as(NIKE.ap)
    const r = await call(pay, 'POST', `/api/invoices/${it_.invoice}/payments`, it_.invoice, { amount: 1932.5, method: 'ACH', reference: 'NIKE-AP-1001' })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: it_.invoice } })).status).toBe('PAID')
    // The flight is paid with the invoice it rode on.
    expect((await prisma.expense.findUniqueOrThrow({ where: { id: it_.expense } })).status).toBe('PAID')
    const p = await prisma.payment.findFirstOrThrow({ where: { invoiceId: it_.invoice } })
    expect([p.payerCompanyId, p.receivedByCompanyId]).toEqual([co['world-nike'], co['world-pinnacle']])
    // Nothing closes an invoice-due cycle, because nothing opens one.
    // The invoice's own status is what says it was paid.
    expect((await cycles({ sellContractId: it_.contract })).INVOICE_DUE).toBeUndefined()
  })

  it('the placement timeline now reads hours, bill done for that week and nothing overdue', async () => {
    as(NIKE.hiring)
    const r = await call(placement, 'GET', `/api/placements/${it_.contract}`, it_.contract)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const t = r.body.data.timeline
    const doneKinds = [...t.hours, ...t.bill].filter((d: any) => d.done).map((d: any) => d.kind)
    expect(doneKinds).toEqual(expect.arrayContaining(['TIMESHEET_SUBMIT', 'TIMESHEET_APPROVE', 'INVOICE_GENERATE']))
    // The week before, which nobody filed, is still owed — a later week
    // does not quietly complete it.
    expect(t.hours.filter((d: any) => d.kind === 'TIMESHEET_SUBMIT' && d.overdue).length).toBeGreaterThanOrEqual(1)
  })

  it('the last day passes: the daily job ends both contracts, and says so in the vendor’s log', async () => {
    // Time passes. The contract's last day was yesterday.
    await prisma.sellContract.update({ where: { id: it_.contract }, data: { endDate: day(-1) } })
    await prisma.buyContract.update({ where: { id: it_.buy }, data: { endDate: day(-1) } })

    process.env.CRON_SECRET = 'ledger-test'
    const r = await json(await endContracts(req('GET', '/api/cron/end-contracts', undefined, { authorization: 'Bearer ledger-test' })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.sell).toBeGreaterThanOrEqual(1)

    expect((await prisma.sellContract.findUniqueOrThrow({ where: { id: it_.contract } })).state).toBe('ENDED')
    expect((await prisma.buyContract.findUniqueOrThrow({ where: { id: it_.buy } })).state).toBe('ENDED')
    const log = await prisma.automationLog.findFirst({ where: { companyId: co['world-pinnacle'], action: 'CONTRACTS_ENDED' }, orderBy: { at: 'desc' } })
    expect(log?.summary).toContain('Tariq')
    expect(log?.summary).toContain('at Northbend Athletic')
  })

  it('a contract still inside its term is left alone', async () => {
    const live = await prisma.sellContract.findFirst({ where: { state: 'IN_PROGRESS', endDate: { gt: new Date() } } })
    expect(live, 'the seed should hold a running contract').not.toBeNull()
    process.env.CRON_SECRET = 'ledger-test'
    await endContracts(req('GET', '/api/cron/end-contracts', undefined, { authorization: 'Bearer ledger-test' }))
    expect((await prisma.sellContract.findUniqueOrThrow({ where: { id: live!.id } })).state).toBe('IN_PROGRESS')
  })
})
