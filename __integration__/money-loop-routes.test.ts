/**
 * Flow B of record 107, through the real routes as real seats: the
 * consultants page (B2), a placement and its month (B3), a past month
 * loaded as closed (B4), a live month and its dispute (B5), the payroll
 * summary (B6), and the dispute on the decision queue (B1). Builds its own
 * two small firms on reserved domains, so nothing depends on which seeded
 * row is first. The live month is the month holding today, the past one
 * is the month before it and the one not begun is the month after, so the
 * file holds on every day it runs.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, resetDatabase, as, req, json } from './harness'
import * as loop from '@/app/api/money-loop/route'
import * as placement from '@/app/api/money-loop/placements/[id]/route'
import * as period from '@/app/api/money-loop/periods/[month]/route'
import * as chains from '@/app/api/money-loop/chains/[id]/route'
import * as queue from '@/app/api/decision-items/route'
import * as item from '@/app/api/decision-items/[id]/route'
import * as oneList from '@/app/api/decisions/route'
import * as agents from '@/app/api/decision-items/agents/route'
import * as records from '@/app/api/records/[type]/[id]/route'
import {
  advanceBody, loadBody, openMonthBody, resolveBody, CANNOT_READ_LOOP, CANNOT_RUN_LOOP, BENCH_SEAT_REFUSED_LOOP, CANNOT_READ_MONTH_RECORD,
  monthBeside, monthKeyOf, readMonth,
} from '@/lib/money-loop'
import { decideBody } from '@/lib/decision-queue'
import { DECIDER_READS_PAYROLL, PAYROLL_DECISION_NOT_YOURS } from '@/lib/decision-items'
import { formatDay } from '@/lib/format-date'

const tag = `ml${Date.now()}`
const w: Record<string, any> = {}
const mail = (n: string) => `${n.toLowerCase().replace(/\s/g, '.')}.${tag}@example.invalid`
const id = (v: string) => ({ params: Promise.resolve({ id: v }) })
const mo = (v: string) => ({ params: Promise.resolve({ month: v }) })
const post = (url: string, body: unknown) => req('POST', url, body)
// These firms have no site, so their own day is the UTC day.
const TODAY = new Date().toISOString().slice(0, 10)
const LIVE = readMonth(monthKeyOf(new Date(`${TODAY}T00:00:00Z`)))!
const PAST = readMonth(monthBeside(LIVE.key, -1))!
const NEXT = readMonth(monthBeside(LIVE.key, 1))!
const DEC = LIVE.key
const rec = (type: string, v: string) => ({ params: Promise.resolve({ type, id: v }) })

beforeAll(async () => {
  await resetDatabase()
  w.firm = await prisma.company.create({ data: { name: `Loop Firm ${tag}`, slug: `loop-firm-${tag}`, kind: 'VENDOR' } })
  w.other = await prisma.company.create({ data: { name: `Other Firm ${tag}`, slug: `other-firm-${tag}`, kind: 'VENDOR' } })
  w.client = await prisma.company.create({ data: { name: `Loop Client ${tag}`, slug: `loop-client-${tag}`, kind: 'CLIENT' } })
  w.entity = await prisma.legalEntity.create({ data: { companyId: w.firm.id, name: 'Loop Firm LLC', country: 'US', currency: 'USD' } })
  const role = (companyId: string, name: string, permissions: string[]) => prisma.role.create({ data: { companyId, name, permissions } })
  const person = (n: string) => prisma.person.create({ data: { name: n, primaryEmail: mail(n) } })
  const seat = async (n: string, r: { id: string } | null, companyId: string, type = 'EMPLOYEE') => {
    const p = await person(n)
    await prisma.context.create({ data: { personId: p.id, companyId, type, roleId: r?.id ?? null } as any })
    return p
  }
  w.owner = await seat('Dana Owner', await role(w.firm.id, 'Owner', ['*']), w.firm.id)
  w.clerk = await seat('Ravi Payroll', await role(w.firm.id, 'AP & Payroll', ['timesheets.read', 'timesheets.approve', 'payroll.read', 'payroll.run', 'payroll.approve', 'consultants.cost', 'invoices.read', 'payments.record']), w.firm.id)
  w.reader = await seat('Uma Reader', await role(w.firm.id, 'Payroll Reader', ['payroll.read']), w.firm.id)
  w.am = await seat('Ivo Accounts', await role(w.firm.id, 'Account Manager', ['requirements.write', 'submissions.create', 'consultants.read', 'rates.read', 'assignments.read']), w.firm.id)
  w.hr = await seat('Hana People', await role(w.firm.id, 'HR', ['consultants.read', 'assignments.read', 'governance.read']), w.firm.id)
  w.compliance = await seat('Cora Compliance', await role(w.firm.id, 'Compliance Officer', ['consultants.read', 'governance.read']), w.firm.id)
  w.admin = await seat('Adi Admin', await role(w.firm.id, 'Admin', ['team.manage', 'settings.manage']), w.firm.id)
  w.recruiter = await seat('Rob Recruiter', await role(w.firm.id, 'Recruiter', ['consultants.read', 'submissions.create']), w.firm.id)
  w.bench = await seat('Bea Bench', null, w.firm.id, 'CONSULTANT')
  w.stranger = await seat('Mo Stranger', await role(w.other.id, 'Owner', ['*']), w.other.id)
  const line = async (n: string, companyId: string, extra: Record<string, unknown> = {}) => {
    const p = await person(n)
    return prisma.sellContract.create({ data: { companyId, clientCompanyId: w.client.id, personId: p.id, billRate: 10000, startDate: new Date('2026-09-01'), state: 'IN_PROGRESS', ...extra } as any })
  }
  w.ana = await line('Ana Consultant', w.firm.id)
  w.ben = await line('Ben Consultant', w.firm.id, { billCurrency: 'INR' })
  w.cy = await line('Cy Consultant', w.firm.id)
  w.draft = await line('Dee Draft', w.firm.id, { state: 'DRAFT' })
  w.theirs = await line('Eli Elsewhere', w.other.id)
  w.ended = await line('Fay Finished', w.firm.id, { state: 'ENDED', endDate: new Date('2026-09-30') })
})

const list = async (month = DEC) => json(await loop.GET(req('GET', `/api/money-loop?month=${month}`)))
const months = async (month = DEC) => json(await period.GET(req('GET', `/api/money-loop/periods/${month}`), mo(month)))
const move = async (chainId: string, to: string, typed: Record<string, string> = {}) =>
  json(await chains.POST(post(`/api/money-loop/chains/${chainId}`, advanceBody(to, { currency: 'USD', actingEntityId: w.entity.id, disputeOwnerPersonId: w.owner.id, ...typed })), id(chainId)))
const refusalsBy = (personId: string) => prisma.accessLog.count({ where: { actorPersonId: personId, allowed: false } })
const onPlacement = async (lineId: string, month = DEC) => json(await placement.GET(req('GET', `/api/money-loop/placements/${lineId}?month=${month}`), id(lineId)))
const ledgerOf = async () => json(await agents.GET(req('GET', '/api/decision-items/agents')))
const recordView = async (type: string, v: string) => json(await records.GET(req('GET', `/api/records/${type}/${v}`), rec(type, v)))
const loadTyped = (over: Record<string, string> = {}) => loadBody({
  sellContractId: w.cy.id, source: 'the payroll sheet', asOf: TODAY, timesheetAmount: '100', invoicedAmount: '100', paidAmount: '100', currency: 'USD', actingEntityId: w.entity.id, ...over,
})
const loadInto = async (month: string, body: unknown) => json(await period.POST(post(`/api/money-loop/periods/${month}`, body), mo(month)))

describe('the money loop, through its routes', () => {
  it('a month nobody has opened says what it waits on, and offers opening it only to a seat that runs payroll', async () => {
    as(w.clerk.primaryEmail)
    const clerk = await list()
    expect(clerk.status).toBe(200)
    expect(clerk.body.data.emptySays).toBe(`3 consultants are on a running contract in ${LIVE.words}, and the month is not started yet. Start it to put each one at “Timesheet owed”.`)
    expect([clerk.body.data.mayRun, clerk.body.data.mayStart]).toEqual([true, true])
    as(w.reader.primaryEmail)
    const reader = await list()
    expect([reader.body.data.mayRun, reader.body.data.mayStart]).toEqual([false, false])
    expect(reader.body.data.emptySays).toMatch(/A seat that runs payroll starts it\.$/)
  })

  it('a month that has not begun cannot be started: the page says so and offers no form, and the route refuses', async () => {
    as(w.clerk.primaryEmail)
    const next = await list(NEXT.key)
    expect(next.body.data.mayStart).toBe(false)
    expect(next.body.data.emptySays).toBe(`${NEXT.words} has not begun. It can be started from ${formatDay(NEXT.start)}.`)
    const res = await json(await loop.POST(post('/api/money-loop', openMonthBody({ month: NEXT.key, actingEntityId: w.entity.id }))))
    expect([res.status, res.body.error.field, res.body.error.message]).toEqual([422, 'month', `${NEXT.words} has not begun. It can be started from ${formatDay(NEXT.start)}.`])
    expect(await prisma.moneyChain.count({ where: { companyId: w.firm.id, periodStart: NEXT.start } })).toBe(0)
  })

  it('a firm with a legal entity cannot open a month without choosing the entity', async () => {
    as(w.clerk.primaryEmail)
    const res = await json(await loop.POST(post('/api/money-loop', openMonthBody({ month: DEC }))))
    expect(res.status).toBe(422)
    expect(res.body.error.message).toMatch(/Choose which one/)
  })

  it('a seat that runs payroll opens a month, and every consultant on a running contract starts at Timesheet owed', async () => {
    as(w.clerk.primaryEmail)
    const res = await json(await loop.POST(post('/api/money-loop', openMonthBody({ month: DEC, actingEntityId: w.entity.id }))))
    expect(res.status).toBe(201)
    expect(res.body.data.message).toBe(`Started ${LIVE.words} for 3 consultants, each at “Timesheet owed”.`)
    const rows = (await list()).body.data.placements
    expect(rows.map((r: any) => [r.consultant, r.client, r.start, r.chain.label])).toEqual([
      ['Ana Consultant', w.client.name, '2026-09-01', 'Timesheet owed'],
      ['Ben Consultant', w.client.name, '2026-09-01', 'Timesheet owed'],
      ['Cy Consultant', w.client.name, '2026-09-01', 'Timesheet owed'],
    ])
    w.chain = Object.fromEntries(rows.map((r: any) => [r.consultant.split(' ')[0].toLowerCase(), r.chain.id]))
  })

  it('a contract that has not started running is not on the consultants page', async () => {
    as(w.clerk.primaryEmail)
    expect((await list()).body.data.placements.map((r: any) => r.consultant)).not.toContain('Dee Draft')
  })

  it('opening a month that is already open for everybody opens nothing and says so', async () => {
    as(w.clerk.primaryEmail)
    const res = await json(await loop.POST(post('/api/money-loop', openMonthBody({ month: DEC, actingEntityId: w.entity.id }))))
    expect(res.status).toBe(422)
    expect(res.body.error.message).toBe(`Every consultant on a running contract in ${LIVE.words} already has the month started.`)
  })

  it('the Owner reads the agreed rate, and AP & Payroll, who does not price or bill, reads that it is withheld', async () => {
    as(w.owner.primaryEmail)
    const owner = await list()
    expect(owner.body.data.placements[0].agreedRate).toEqual({ cents: 10000, currency: 'USD' })
    expect(owner.body.data.rateWithheld).toBeNull()
    as(w.clerk.primaryEmail)
    const clerk = await list()
    expect(clerk.body.data.placements.map((r: any) => r.agreedRate)).toEqual([null, null, null])
    expect(clerk.body.data.rateWithheld).toBe('The agreed rate is shown to the people who price and bill it.')
  })

  it('an Account Manager cannot read a month’s amounts', async () => {
    as(w.am.primaryEmail)
    const before = await refusalsBy(w.am.id)
    const reads = [
      await list(), await months(),
      await json(await placement.GET(req('GET', `/api/money-loop/placements/${w.ana.id}?month=${DEC}`), id(w.ana.id))),
    ]
    for (const r of reads) {
      expect(r.status).toBe(403)
      expect(r.body.error.message).toBe(CANNOT_READ_LOOP)
      expect(JSON.stringify(r.body)).not.toMatch(/cents/)
    }
    expect(await refusalsBy(w.am.id)).toBe(before + 3)
  })

  it('HR and a recruiter cannot read the money loop', async () => {
    for (const who of [w.hr, w.recruiter]) {
      as(who.primaryEmail)
      const r = await months()
      expect([r.status, r.body.error.message]).toEqual([403, CANNOT_READ_LOOP])
    }
  })

  it('a person on the firm’s bench cannot read the money loop', async () => {
    as(w.bench.primaryEmail)
    const before = await refusalsBy(w.bench.id)
    for (const r of [await list(), await months()]) {
      expect([r.status, r.body.error.message]).toEqual([403, BENCH_SEAT_REFUSED_LOOP])
    }
    expect(await refusalsBy(w.bench.id)).toBe(before + 2)
  })

  it('a seat that reads payroll and does not run it reads the month and cannot move it', async () => {
    as(w.reader.primaryEmail)
    expect((await months()).status).toBe(200)
    const res = await move(w.chain.ana, 'TIMESHEET_RECEIVED', { amount: '16000.00' })
    expect([res.status, res.body.error.message]).toEqual([403, CANNOT_RUN_LOOP])
  })

  it('recording a timesheet without the amount it states is refused in a sentence', async () => {
    as(w.clerk.primaryEmail)
    const res = await move(w.chain.ana, 'TIMESHEET_RECEIVED', { amount: '' })
    expect([res.status, res.body.error.field]).toEqual([422, 'amount'])
    expect(res.body.error.message).toBe('Type the amount as a number with at most two decimal places, such as 16000.00.')
  })

  it('a firm with a legal entity cannot move a month without choosing the entity', async () => {
    as(w.clerk.primaryEmail)
    const res = await move(w.chain.ana, 'TIMESHEET_RECEIVED', { amount: '16000.00', actingEntityId: '' })
    expect([res.status, res.body.error.field]).toEqual([422, 'actingEntityId'])
  })

  it('a move that states an amount is refused until somebody is named to decide a disagreement', async () => {
    as(w.clerk.primaryEmail)
    const res = await move(w.chain.ana, 'TIMESHEET_RECEIVED', { amount: '16000.00', disputeOwnerPersonId: '' })
    expect([res.status, res.body.error.field]).toEqual([422, 'disputeOwnerPersonId'])
  })

  it('only somebody whose working seat reads payroll is offered, and accepted, to decide a disagreement', async () => {
    as(w.clerk.primaryEmail)
    const offered = (await onPlacement(w.ana.id)).body.data.people.map((p: any) => p.name)
    // The Owner, AP & Payroll and a payroll reader; never an Account Manager, a recruiter, HR, an Admin who reads no payroll, or the bench.
    expect(offered).toEqual(['Dana Owner', 'Ravi Payroll', 'Uma Reader'])
    for (const who of [w.am, w.recruiter, w.hr, w.admin, w.bench]) {
      const res = await move(w.chain.ana, 'TIMESHEET_RECEIVED', { amount: '16000.00', disputeOwnerPersonId: who.id })
      expect([res.status, res.body.error.field, res.body.error.message], who.name).toEqual([422, 'disputeOwnerPersonId', DECIDER_READS_PAYROLL])
    }
    expect((await prisma.moneyChain.findUniqueOrThrow({ where: { id: w.chain.ana } })).state).toBe('TIMESHEET_OWED')
  })

  it('the amount a timesheet states moves the month to Timesheet received, and the move is on its ledger with the person, her role and the entity', async () => {
    as(w.clerk.primaryEmail)
    const res = await move(w.chain.ana, 'TIMESHEET_RECEIVED', { amount: '16,000.00' })
    expect([res.status, res.body.data.label]).toEqual([200, 'Timesheet received'])
    const page = await json(await placement.GET(req('GET', `/api/money-loop/placements/${w.ana.id}?month=${DEC}`), id(w.ana.id)))
    expect(page.body.data.chain.amounts.timesheet).toEqual({ cents: 1600000, currency: 'USD' })
    expect(page.body.data.chain.next).toEqual({ to: 'RECONCILED', button: 'Mark it reconciled', amountLabel: null })
    const last = page.body.data.ledger.at(-1)
    expect([last.by, last.heldAs, last.entityName]).toEqual(['Ravi Payroll', 'AP & Payroll', 'Loop Firm LLC'])
    expect(last.summary).toBe('Moved to timesheet received: $16,000.00 stated on the timesheet.')
  })

  it('a month cannot skip a state', async () => {
    as(w.clerk.primaryEmail)
    const res = await move(w.chain.ana, 'INVOICED', { amount: '16000.00' })
    expect(res.status).toBe(422)
    expect(res.body.error.message).toMatch(/one state at a time/)
  })

  it('a placement’s page shows no rate history where none is on record', async () => {
    as(w.owner.primaryEmail)
    const page = await json(await placement.GET(req('GET', `/api/money-loop/placements/${w.ana.id}?month=${DEC}`), id(w.ana.id)))
    expect(page.body.data.rateHistory).toEqual([])
    expect(page.body.data.contractHref).toBe(`/dashboard/placements/${w.ana.id}`)
  })

  it('an invoiced amount that disagrees with the timesheet disputes the month and opens a decision owed by the person named', async () => {
    as(w.clerk.primaryEmail)
    await move(w.chain.ana, 'RECONCILED')
    const res = await move(w.chain.ana, 'INVOICED', { amount: '15900.00' })
    expect([res.status, res.body.data.label]).toEqual([200, 'Disputed'])
    w.decisionId = res.body.data.disputeDecisionId
    const row = (await months()).body.data.chains.find((c: any) => c.chainId === w.chain.ana)
    expect([row.label, row.next, row.dispute]).toEqual(['Disputed', null, { decisionId: w.decisionId, open: true, ownerName: 'Dana Owner', question: row.dispute.question }])
  })

  it('a disputed month’s decision shows on the queue of the seat that owes it', async () => {
    as(w.owner.primaryEmail)
    const q = await json(await queue.GET(req('GET', '/api/decision-items?state=open')))
    const row = q.body.data.items.find((i: any) => i.id === w.decisionId)
    expect([row.ownerName, row.entityName]).toEqual(['Dana Owner', 'Loop Firm LLC'])
    // One proposed course, the one the rules take when the month returns. The amounts are in the proof.
    expect(row.question).toBe(`Ana Consultant, ${LIVE.words}: the invoiced amount differs from the timesheet’s. Keep the timesheet’s amount and state the invoiced amount again?`)
    const owed = await json(await oneList.GET(req('GET', '/api/decisions')))
    const card = owed.body.data.decisions.find((d: any) => d.entityId === w.decisionId)
    expect([card.type, card.actionUrl]).toEqual(['DECISION_ITEM', `/dashboard/decisions/${w.decisionId}`])
    // Its proof names the consultant and the month, and opens that placement's month.
    const one = await json(await item.GET(req('GET', `/api/decision-items/${w.decisionId}`), id(w.decisionId)))
    expect(one.body.data.proof).toMatch(/\$16,000\.00.*\$15,900\.00/)
    expect(one.body.data.proofLinks).toEqual([{ recordType: 'MoneyChain', recordId: w.chain.ana, label: 'A consultant’s month', name: `Ana Consultant, ${LIVE.words}`, href: `/dashboard/money-loop/placements/${w.ana.id}?month=${LIVE.key}` }])
    // And not on the list of a seat that does not owe it.
    as(w.clerk.primaryEmail)
    const clerk = await json(await oneList.GET(req('GET', '/api/decisions')))
    expect(clerk.body.data.decisions.some((d: any) => d.entityId === w.decisionId)).toBe(false)
  })

  it('HR, a compliance officer and an Admin, who do not read payroll, read no act on a payroll record on the firm’s ledger, and are told how many they are not shown', async () => {
    const payroll = { OR: [{ recordType: 'MoneyChain' }, { recordType: 'DecisionItem', recordId: w.decisionId }] }
    const hidden = await prisma.recordAction.count({ where: { companyId: w.firm.id, ...payroll } })
    const all = await prisma.recordAction.count({ where: { companyId: w.firm.id } })
    expect(hidden).toBeGreaterThan(5)
    for (const who of [w.hr, w.compliance, w.admin]) {
      as(who.primaryEmail)
      const a = await ledgerOf()
      expect(a.status, who.name).toBe(200)
      const l = a.body.data.ledger
      expect(l.payrollHidden, who.name).toBe(`${hidden} acts on payroll records are not shown here. A seat that reads payroll reads them.`)
      expect(l.total, who.name).toBe(all - hidden)
      // No amount, no month and no dispute anywhere in the answer.
      expect(JSON.stringify(a.body), who.name).not.toMatch(/\$|16,000|15,900|MoneyChain|Ana Consultant/)
      expect(l.rows.some((r: any) => r.href.includes(w.decisionId)), who.name).toBe(false)
    }
    // A seat that reads payroll reads them all, and each money line opens the month's record view.
    as(w.owner.primaryEmail)
    const owner = (await ledgerOf()).body.data.ledger
    expect([owner.payrollHidden, owner.total]).toEqual([null, all])
    const line = owner.rows.find((r: any) => r.summary === 'Moved to timesheet received: $16,000.00 stated on the timesheet.')
    expect(line.href).toBe(`/dashboard/records/MoneyChain/${w.chain.ana}`)
  })

  it('a money line on the firm’s ledger opens the month’s record: the consultant, the client, the month, its state, the stated amounts, a link to its page and its ledger', async () => {
    as(w.clerk.primaryEmail)
    const view = await recordView('MoneyChain', w.chain.ana)
    expect(view.status).toBe(200)
    expect(view.body.data.name).toBe(`Ana Consultant, ${LIVE.words}`)
    expect(view.body.data.facts).toEqual([
      { label: 'Consultant', value: 'Ana Consultant' }, { label: 'Client', value: w.client.name }, { label: 'Month', value: LIVE.words },
      { label: 'State', value: 'Disputed' }, { label: 'Stated on the timesheet', value: '$16,000.00' }, { label: 'Invoiced', value: '$15,900.00' }, { label: 'Paid', value: 'Not stated yet' },
    ])
    expect(view.body.data.ownPage).toEqual({ href: `/dashboard/money-loop/placements/${w.ana.id}?month=${LIVE.key}`, words: `See ${LIVE.words}` })
    expect(view.body.data.timeline.map((r: any) => r.action)).toEqual(['OPENED', 'ADVANCED', 'ADVANCED', 'DISPUTED'])
    expect(view.body.data.timeline[0].summary).toBe(`Started ${LIVE.words}: timesheet owed.`)
  })

  it('a seat that does not read payroll cannot open a month’s record, and another firm’s month is not on the book; each refusal is logged first', async () => {
    for (const who of [w.hr, w.compliance, w.admin, w.am]) {
      as(who.primaryEmail)
      const before = await refusalsBy(who.id)
      const view = await recordView('MoneyChain', w.chain.ana)
      expect([view.status, view.body.error.message], who.name).toEqual([403, CANNOT_READ_MONTH_RECORD])
      expect(JSON.stringify(view.body), who.name).not.toMatch(/\$|16,000/)
      expect(await refusalsBy(who.id), who.name).toBe(before + 1)
    }
    as(w.stranger.primaryEmail)
    const before = await refusalsBy(w.stranger.id)
    expect((await recordView('MoneyChain', w.chain.ana)).status).toBe(403)
    expect(await refusalsBy(w.stranger.id)).toBe(before + 1)
  })

  it('the proof and history of a disputed month’s decision are read only from a seat that the proof rule allows and that reads payroll', async () => {
    // An Admin reads every other decision's proof; this one states payroll amounts, and her seat does not read payroll.
    for (const who of [w.admin, w.hr, w.compliance]) {
      as(who.primaryEmail)
      const one = await json(await item.GET(req('GET', `/api/decision-items/${w.decisionId}`), id(w.decisionId)))
      expect(one.status, who.name).toBe(200)
      expect([one.body.data.proof, one.body.data.proofLinks, one.body.data.timeline, one.body.data.mayAct], who.name).toEqual([null, [], [], false])
      expect(JSON.stringify(one.body), who.name).not.toMatch(/\$|16,000|15,900/)
      expect((await recordView('DecisionItem', w.decisionId)).status, who.name).toBe(403)
    }
    as(w.admin.primaryEmail)
    const admin = await json(await item.GET(req('GET', `/api/decision-items/${w.decisionId}`), id(w.decisionId)))
    expect(admin.body.data.proofHidden).toMatch(/They state payroll amounts, so each of them reads them only from a seat that reads payroll\.$/)
    // A payroll clerk reads payroll, and the proof rule does not name her: she reads the question and no proof.
    as(w.clerk.primaryEmail)
    const clerk = await json(await item.GET(req('GET', `/api/decision-items/${w.decisionId}`), id(w.decisionId)))
    expect(clerk.body.data.proof).toBeNull()
    // The Owner is allowed by both.
    as(w.owner.primaryEmail)
    const owner = await json(await item.GET(req('GET', `/api/decision-items/${w.decisionId}`), id(w.decisionId)))
    expect(owner.body.data.proof).toMatch(/\$16,000\.00.*\$15,900\.00/)
    expect(owner.body.data.mayAct).toBe(true)
    expect((await recordView('DecisionItem', w.decisionId)).status).toBe(200)
  })

  it('an Admin whose seat does not read payroll cannot decide a disputed month, because she cannot read what it is about', async () => {
    as(w.admin.primaryEmail)
    const res = await json(await item.POST(post(`/api/decision-items/${w.decisionId}`, decideBody('APPROVE', '', w.entity.id)), id(w.decisionId)))
    expect([res.status, res.body.error.message]).toEqual([422, PAYROLL_DECISION_NOT_YOURS])
    expect((await prisma.decisionItem.findUniqueOrThrow({ where: { id: w.decisionId } })).state).toBe('OPEN')
  })

  it('the reason a disputed month’s decision was sent back with is not on the queue of a seat that does not read payroll', async () => {
    as(w.owner.primaryEmail)
    const sent = await json(await item.POST(post(`/api/decision-items/${w.decisionId}`, decideBody('SEND_BACK', 'The invoice says $15,900.00. Ask the client first.', w.entity.id)), id(w.decisionId)))
    expect(sent.status).toBe(200)
    const rowFor = async () => (await json(await queue.GET(req('GET', '/api/decision-items?state=open')))).body.data.items.find((i: any) => i.id === w.decisionId)
    expect((await rowFor()).sentBackReason).toBe('The invoice says $15,900.00. Ask the client first.')
    for (const who of [w.hr, w.am, w.admin]) {
      as(who.primaryEmail)
      const row = await rowFor()
      expect([row.sentBackReason, row.sentBackBy], who.name).toEqual([null, 'Dana Owner'])
      expect(JSON.stringify(row), who.name).not.toMatch(/\$|15,900/)
    }
  })

  it('a disputed month does not return until its decision is recorded, and then the amount is stated again', async () => {
    as(w.clerk.primaryEmail)
    const early = await json(await chains.POST(post(`/api/money-loop/chains/${w.chain.ana}`, resolveBody(w.entity.id)), id(w.chain.ana)))
    expect(early.status).toBe(422)
    expect(early.body.error.message).toMatch(/still open/)
    as(w.owner.primaryEmail)
    await item.POST(post(`/api/decision-items/${w.decisionId}`, decideBody('REJECT', 'The invoice was short a day.', w.entity.id)), id(w.decisionId))
    as(w.clerk.primaryEmail)
    const back = await json(await chains.POST(post(`/api/money-loop/chains/${w.chain.ana}`, resolveBody(w.entity.id)), id(w.chain.ana)))
    expect([back.status, back.body.data.label]).toEqual([200, 'Reconciled'])
    const on = await move(w.chain.ana, 'INVOICED', { amount: '16000.00' })
    expect(on.body.data.label).toBe('Invoiced')
  })

  it('a month returned from its dispute keeps the link to its recorded decision: who decided, on which day, and what', async () => {
    as(w.clerk.primaryEmail)
    const link = { decisionId: w.decisionId, says: `Decided by Dana Owner on ${formatDay(new Date(`${TODAY}T00:00:00Z`))}: Rejected` }
    const page = (await onPlacement(w.ana.id)).body.data
    expect([page.chain.label, page.chain.dispute, page.decided]).toEqual(['Invoiced', null, [link]])
    const row = (await months()).body.data.chains.find((c: any) => c.chainId === w.chain.ana)
    expect([row.dispute, row.decided]).toEqual([null, link])
    // A month nobody disputed links to no decision.
    expect((await onPlacement(w.cy.id)).body.data.decided).toEqual([])
  })

  it('a month that has not ended is not offered to be loaded as closed, and saving one is refused whatever is typed', async () => {
    as(w.clerk.primaryEmail)
    const live = (await months()).body.data
    expect(live.load).toEqual({ offered: false, says: `${LIVE.words} has not ended. A month is loaded as closed once it has ended, from ${formatDay(NEXT.start)}.`, earliest: LIVE.end.toISOString().slice(0, 10), latest: TODAY })
    expect(live.loadable).toEqual([])
    const before = await prisma.moneyChain.count({ where: { companyId: w.firm.id } })
    // The month in the walk: one that has not happened, saved as paid and closed.
    const future = await loadInto(NEXT.key, loadTyped())
    expect([future.status, future.body.error.field, future.body.error.message]).toEqual([422, 'month', `${NEXT.words} has not ended. A month is loaded as closed once it has ended, from ${formatDay(new Date(NEXT.end.getTime() + 86_400_000))}.`])
    const current = await loadInto(LIVE.key, loadTyped())
    expect([current.status, current.body.error.field]).toEqual([422, 'month'])
    expect(await prisma.moneyChain.count({ where: { companyId: w.firm.id } })).toBe(before)
    // A month that has ended is offered, as true on a day from its last day to today.
    const past = (await months(PAST.key)).body.data.load
    expect(past).toEqual({ offered: true, says: null, earliest: PAST.end.toISOString().slice(0, 10), latest: TODAY })
  })

  it('a past month cannot be loaded as true on a day before its last day, or on a day that has not happened', async () => {
    as(w.clerk.primaryEmail)
    const early = await loadInto(PAST.key, loadTyped({ asOf: new Date(PAST.end.getTime() - 86_400_000).toISOString().slice(0, 10) }))
    expect([early.status, early.body.error.field, early.body.error.message]).toEqual([422, 'asOf', `The day this history was true cannot be before the month’s last day, ${formatDay(PAST.end)}.`])
    const late = await loadInto(PAST.key, loadTyped({ asOf: new Date(Date.parse(`${TODAY}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) }))
    expect([late.status, late.body.error.field]).toEqual([422, 'asOf'])
    expect(await prisma.moneyChain.count({ where: { sellContractId: w.cy.id, periodStart: PAST.start } })).toBe(0)
  })

  it('a firm with a legal entity cannot load a past month without choosing the entity, and the refusal names the entity box', async () => {
    as(w.clerk.primaryEmail)
    const res = await loadInto(PAST.key, loadTyped({ actingEntityId: '' }))
    expect([res.status, res.body.error.field, res.body.error.message]).toEqual([422, 'actingEntityId', 'This company has legal entities. Choose which one this is done for.'])
  })

  it('a past month is loaded as closed with its source, its as-of day and three equal amounts, and reads Loaded as history', async () => {
    as(w.clerk.primaryEmail)
    const offered = (await months(PAST.key)).body.data.loadable.map((l: any) => l.name)
    expect(offered).toContain(`Ana Consultant at ${w.client.name}`)
    const res = await json(await period.POST(post(`/api/money-loop/periods/${PAST.key}`, loadBody({
      sellContractId: w.ana.id, source: 'the October payroll sheet', asOf: TODAY, timesheetAmount: '15000', invoicedAmount: '15000.00', paidAmount: '15,000.00', currency: 'usd', actingEntityId: w.entity.id,
    })), mo(PAST.key)))
    expect(res.status).toBe(201)
    const oct = (await months(PAST.key)).body.data
    expect(oct.chains.map((c: any) => [c.consultant, c.label, c.history, c.next])).toEqual([['Ana Consultant', 'Closed', `Loaded as history from the October payroll sheet, as of ${formatDay(new Date(`${TODAY}T00:00:00Z`))}.`, null]])
    const page = await json(await placement.GET(req('GET', `/api/money-loop/placements/${w.ana.id}?month=${PAST.key}`), id(w.ana.id)))
    expect(page.body.data.ledger).toHaveLength(7)
    // Seven rows, each saying its own state, and the three that state an amount saying it.
    expect(page.body.data.ledger.map((r: any) => r.summary.split(' Loaded as history')[0])).toEqual([
      'Timesheet owed.', 'Timesheet received: $15,000.00 stated on the timesheet.', 'Reconciled.', 'Invoiced: $15,000.00 was invoiced.',
      'Payment pending.', 'Paid, not confirmed: $15,000.00 was paid.', 'Confirmed and closed.',
    ])
    expect(page.body.data.chain.next).toBeNull()
  })

  it('a past month whose three amounts differ is not loaded', async () => {
    as(w.clerk.primaryEmail)
    const res = await json(await period.POST(post(`/api/money-loop/periods/${PAST.key}`, loadBody({
      sellContractId: w.cy.id, source: 'the October payroll sheet', asOf: TODAY, timesheetAmount: '100', invoicedAmount: '100', paidAmount: '99', currency: 'USD', actingEntityId: w.entity.id,
    })), mo(PAST.key)))
    expect(res.status).toBe(422)
    expect(res.body.error.message).toMatch(/cannot close while its amounts disagree/)
    expect(await prisma.moneyChain.count({ where: { sellContractId: w.cy.id, periodStart: PAST.start } })).toBe(0)
  })

  it('a past month cannot be loaded without saying where it came from', async () => {
    as(w.clerk.primaryEmail)
    const res = await json(await period.POST(post(`/api/money-loop/periods/${PAST.key}`, loadBody({
      sellContractId: w.cy.id, source: ' ', asOf: TODAY, timesheetAmount: '100', invoicedAmount: '100', paidAmount: '100', currency: 'USD', actingEntityId: w.entity.id,
    })), mo(PAST.key)))
    expect([res.status, res.body.error.field]).toEqual([422, 'source'])
  })

  it('the payroll summary counts each state and totals what timesheets state per currency, never adding two currencies', async () => {
    as(w.clerk.primaryEmail)
    await move(w.chain.ben, 'TIMESHEET_RECEIVED', { amount: '500000', currency: 'INR' })
    const s = (await months()).body.data.summary
    expect(s.statedTotals).toEqual([{ currency: 'INR', cents: 50000000 }, { currency: 'USD', cents: 1600000 }])
    expect(s.notStated).toBe(1)
    expect(Object.fromEntries(s.counts.filter((c: any) => c.count > 0).map((c: any) => [c.label, c.count]))).toEqual({ 'Timesheet owed': 1, 'Timesheet received': 1, Invoiced: 1 })
    expect(s.counts.map((c: any) => c.label)).toEqual(['Timesheet owed', 'Timesheet received', 'Reconciled', 'Invoiced', 'Payment pending', 'Paid, not confirmed', 'Closed', 'Disputed'])
  })

  it('an open dispute is on the payroll summary with its owner and a link to its decision', async () => {
    as(w.clerk.primaryEmail)
    const res = await move(w.chain.ben, 'RECONCILED')
    expect(res.status).toBe(200)
    const d = await move(w.chain.ben, 'INVOICED', { amount: '1', currency: 'USD' })
    expect(d.body.data.label).toBe('Disputed')
    const open = (await months()).body.data.chains.filter((c: any) => c.dispute?.open)
    expect(open.map((c: any) => [c.consultant, c.dispute.ownerName, c.dispute.decisionId])).toEqual([['Ben Consultant', 'Dana Owner', d.body.data.disputeDecisionId]])
  })

  it('the payroll summary says how much of the total stated on timesheets is on disputed months', async () => {
    as(w.clerk.primaryEmail)
    const s = (await months()).body.data.summary
    // Ben's month is disputed, and its timesheet's amount is still in the total: the summary says so, in its own currency.
    expect(s.statedTotals).toEqual([{ currency: 'INR', cents: 50000000 }, { currency: 'USD', cents: 1600000 }])
    expect(s.disputedTotals).toEqual([{ currency: 'INR', cents: 50000000, months: 1 }])
  })

  it('a month after a contract’s end says the contract ended on its last day', async () => {
    as(w.clerk.primaryEmail)
    const page = (await onPlacement(w.ended.id)).body.data
    expect(page.chain).toBeNull()
    expect(page.noMonthSays).toBe(`Fay Finished’s contract ended on Sep 30, 2026, so there is no ${LIVE.words} to follow.`)
    // On a running contract, a month that has not begun says so.
    expect((await onPlacement(w.cy.id, NEXT.key)).body.data.noMonthSays).toBe(`${NEXT.words} has not begun. It can be started from ${formatDay(NEXT.start)}.`)
  })

  it('another firm’s month cannot be moved, and the refusal is on the access log before it is sent', async () => {
    as(w.stranger.primaryEmail)
    const before = await refusalsBy(w.stranger.id)
    const res = await json(await chains.POST(post(`/api/money-loop/chains/${w.chain.cy}`, advanceBody('TIMESHEET_RECEIVED', { amount: '1', currency: 'USD', disputeOwnerPersonId: w.stranger.id })), id(w.chain.cy)))
    expect(res.status).toBe(404)
    expect(await refusalsBy(w.stranger.id)).toBe(before + 1)
    const row = await prisma.accessLog.findFirst({ where: { actorPersonId: w.stranger.id, allowed: false }, orderBy: { at: 'desc' } })
    expect(row?.subjectCompanyId).toBe(w.firm.id)
    expect((await prisma.moneyChain.findUniqueOrThrow({ where: { id: w.chain.cy } })).state).toBe('TIMESHEET_OWED')
  })

  it('another firm’s contract cannot be read or loaded with history, and each refusal is logged', async () => {
    as(w.clerk.primaryEmail)
    const before = await refusalsBy(w.clerk.id)
    const read = await json(await placement.GET(req('GET', `/api/money-loop/placements/${w.theirs.id}`), id(w.theirs.id)))
    const load = await json(await period.POST(post(`/api/money-loop/periods/${PAST.key}`, loadBody({
      sellContractId: w.theirs.id, source: 'a sheet', asOf: TODAY, timesheetAmount: '1', invoicedAmount: '1', paidAmount: '1', currency: 'USD', actingEntityId: w.entity.id,
    })), mo(PAST.key)))
    expect([read.status, load.status]).toEqual([404, 404])
    expect(await refusalsBy(w.clerk.id)).toBe(before + 2)
    expect(await prisma.moneyChain.count({ where: { sellContractId: w.theirs.id } })).toBe(0)
  })
})
