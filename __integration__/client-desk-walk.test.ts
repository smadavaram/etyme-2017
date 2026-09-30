import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as listTimesheets } from '@/app/api/timesheets/route'
import { POST as signWeek } from '@/app/api/timesheets/[id]/approve/route'
import { GET as readDecisions } from '@/app/api/decisions/route'
import { GET as readProgram } from '@/app/api/program/route'
import { GET as listJobRequests, POST as raiseJobRequest } from '@/app/api/requisitions/route'
import { GET as oneJobRequest } from '@/app/api/requisitions/[id]/route'
import { GET as readMatches } from '@/app/api/requirements/[id]/matches/route'
import { POST as askForThem } from '@/app/api/requirements/[id]/matches/ask/route'
import { stageOf } from '@/lib/requisition-stage'
import { POST as release } from '@/app/api/requisitions/[id]/distribute/route'
import { GET as supplierRegister } from '@/app/api/suppliers/route'
import { POST as recordRole } from '@/app/api/requirements/route'
import { GET as sharedWithMe } from '@/app/api/invitations/route'

/**
 * Northbend Athletic, walked as its desks — the client tester's walk of
 * 2026-09-30, as sentences.
 *
 * Seven things the tester found, each fixed at the route so every door
 * says the same: the matches had no way in from the job request the menu
 * opens; a flagged week signed with one tick; one job request named two
 * different approvers; an ask could be sent again and again; the
 * timesheet tiles added up every week ever under "this period"; two
 * pairs of totals disagreed; and a tile promised a speed.
 */

const D = '@demo.etyme.local'
const HIRING = `world-nike-hiring${D}`
const PROGRAMME = `world-nike-programme${D}`
const PRIME = `world-computer-systems${D}`
const SUB = `world-cloudepa${D}`
const withId = (id: string) => ({ params: Promise.resolve({ id }) })
const s: Record<string, any> = {}

beforeAll(async () => {
  await freshWorld()
  const job = await prisma.requirement.findFirstOrThrow({
    where: { title: 'HCM integration lead', company: { slug: 'world-nike' } },
    select: { id: true, companyId: true },
  })
  s.job = job.id
  s.northbend = job.companyId
  const week = await prisma.timesheet.findFirstOrThrow({
    where: {
      status: 'SUBMITTED',
      clientApprovedAt: null,
      totalHours: 44,
      person: { name: 'Lucía Fernández' },
    },
    select: {
      id: true, days: true,
      sellContract: { select: { overtimeAfterHours: true, requirement: { select: { hoursPerWeek: true } } } },
    },
  })
  s.week = week.id
  s.weekContract = week.sellContract
  s.weekDays = week.days
}, 240_000)

describe('a client reaches the matches from its own job request', () => {
  it('the job request the Job requests menu lists opens with its matches, suppliers first', async () => {
    as(HIRING)
    const list = await json(await listJobRequests(req('GET', '/api/requisitions')))
    expect(list.status, JSON.stringify(list.body)).toBe(200)
    const row = list.body.data.requisitions.find((r: any) => r.title === 'HCM integration lead')
    expect(row).toBeTruthy()

    // The page the menu opens, and the matches for the same id — the
    // section that page now draws.
    as(HIRING)
    const page = await json(await oneJobRequest(req('GET', `/api/requisitions/${row.id}`), withId(row.id)))
    expect(page.status, JSON.stringify(page.body)).toBe(200)
    as(HIRING)
    const m = await json(await readMatches(req('GET', `/api/requirements/${row.id}/matches`), withId(row.id)))
    expect(m.status, JSON.stringify(m.body)).toBe(200)
    expect(m.body.data.viewer.buyer).toBe(true)
    expect(m.body.data.matches.length).toBeGreaterThan(0)
    expect(m.body.data.matches[0].reach).toBe('PANEL')
  })
})

describe('a flagged week is signed with a reason, from every door', () => {
  it('the week under test is on a contract that names no overtime line, over the hours its job runs', () => {
    expect(s.weekContract.overtimeAfterHours).toBeNull()
    expect(s.weekContract.requirement?.hoursPerWeek ?? 40).toBe(40)
  })

  it('the timesheet list marks the week, carries its days and asks the overtime question before anybody signs', async () => {
    as(HIRING)
    const r = await json(await listTimesheets(req('GET', '/api/timesheets?limit=50')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const row = r.body.data.timesheets.find((t: any) => t.id === s.week)
    expect(row.flag).toBe('44h claimed on a 40h-a-week job.')
    const days = Object.values(row.days as Record<string, number>).reduce((a, b) => a + Number(b), 0)
    expect(days).toBe(44)
    expect(row.overtime.pendingHours).toBe(4)
    expect(row.overtime.weeks).toHaveLength(1)
    expect(row.overtime.weeks[0].overtimeHours).toBe(4)
  })

  it('the dashboard’s Look opens the very week it names', async () => {
    as(HIRING)
    const r = await json(await readDecisions(req('GET', '/api/decisions')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const row = r.body.data.decisions.find((d: any) => d.entityId === s.week)
    expect(row.flag).toBe('44h claimed on a 40h-a-week job.')
    expect(row.actionUrl).toBe(`/dashboard/timesheets?id=${s.week}`)

    // And the list, asked for that one week, answers with that week.
    as(HIRING)
    const one = await json(await listTimesheets(req('GET', `/api/timesheets?id=${s.week}`)))
    expect(one.body.data.timesheets.map((t: any) => t.id)).toEqual([s.week])
  })

  it('a flagged week is not signed without a reason — the tick is refused in a sentence and nothing is written', async () => {
    as(HIRING)
    const r = await json(await signWeek(req('POST', `/api/timesheets/${s.week}/approve`, {}), withId(s.week)))
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('FLAG_NEEDS_REASON')
    expect(r.body.error.message).toContain('44h claimed on a 40h-a-week job.')
    expect(r.body.error.message).toContain('The reason goes on your signature.')
    const after = await prisma.timesheet.findUniqueOrThrow({ where: { id: s.week }, select: { clientApprovedAt: true } })
    expect(after.clientApprovedAt).toBeNull()
    expect(await prisma.workAssertion.count({ where: { timesheetId: s.week } })).toBe(0)
  })

  it('a blank reason is no reason', async () => {
    as(HIRING)
    const r = await json(await signWeek(req('POST', `/api/timesheets/${s.week}/approve`, { note: '   ' }), withId(s.week)))
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('FLAG_NEEDS_REASON')
  })

  it('hours past the job’s hours on a contract with no overtime line raise the same overtime question the other weeks get', async () => {
    as(HIRING)
    const r = await json(
      await signWeek(req('POST', `/api/timesheets/${s.week}/approve`, { note: 'Release weekend, agreed with Marcus' }), withId(s.week))
    )
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('OVERTIME_UNDECIDED')
    expect(r.body.error.weeks).toHaveLength(1)
    expect(r.body.error.weeks[0]).toMatchObject({ overtimeHours: 4, afterHours: 40 })
    s.weekOf = r.body.error.weeks[0].weekOf
  })

  it('the reason given for a flagged week is stored on the signature', async () => {
    const why = 'Release weekend, agreed with Marcus'
    as(HIRING)
    const r = await json(
      await signWeek(
        req('POST', `/api/timesheets/${s.week}/approve`, {
          note: why,
          overtime: [{ weekOf: s.weekOf, treatment: 'SAME_RATE' }],
        }),
        withId(s.week)
      )
    )
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const sheet = await prisma.timesheet.findUniqueOrThrow({ where: { id: s.week }, select: { clientApprovedAt: true } })
    expect(sheet.clientApprovedAt).not.toBeNull()
    const signature = await prisma.workAssertion.findFirstOrThrow({
      where: { timesheetId: s.week, role: 'CLIENT_APPROVAL' },
      select: { note: true },
    })
    expect(signature.note).toBe(why)
    const decided = await prisma.overtimeDecision.findFirstOrThrow({ where: { timesheetId: s.week }, select: { treatment: true, overtimeHours: true } })
    expect(decided.treatment).toBe('SAME_RATE')
    expect(Number(decided.overtimeHours)).toBe(4)
  })

  it('once signed, the week holds no question and is valued with every hour somebody decided', async () => {
    as(HIRING)
    const r = await json(await listTimesheets(req('GET', `/api/timesheets?id=${s.week}`)))
    const row = r.body.data.timesheets[0]
    expect(row.overtime.pendingHours).toBe(0)
    expect(row.overtime.weeks).toHaveLength(0)
    // 40 at the rate and 4 decided at the same rate: all 44 are in it.
    expect(row.overtime.billableCents).toBe(44 * row.rate.cents)
  })
})

describe('one job request names the same people it waits on', () => {
  it('a job request routed to a person names the same people on the list and on its own page', async () => {
    const apps = await prisma.costCenter.findFirstOrThrow({
      where: { companyId: s.northbend, code: { startsWith: 'APPS' } },
      select: { id: true },
    })
    as(HIRING)
    const raised = await json(
      await raiseJobRequest(
        req('POST', '/api/requisitions', {
          title: 'Payroll data analyst',
          skills: ['Payroll', 'Workday reporting', 'SQL'],
          location: 'Tualatin, OR',
          headcount: 1,
          budget: 12_000_000,
          hoursPerWeek: 40,
          billMin: 9_000,
          billMax: 11_500,
          months: 6,
          description: 'Reporting on payroll data.',
          justification: 'The payroll move needs somebody on the data.',
          costCenterId: apps.id,
        })
      )
    )
    expect(raised.status, JSON.stringify(raised.body)).toBeLessThan(300)
    const id = raised.body.data?.requisition?.id ?? raised.body.data?.id
    expect(id).toBeTruthy()

    as(HIRING)
    const list = await json(await listJobRequests(req('GET', '/api/requisitions')))
    const card = list.body.data.requisitions.find((r: any) => r.id === id)
    as(HIRING)
    const page = await json(await oneJobRequest(req('GET', `/api/requisitions/${id}`), withId(id)))

    s.raised = id
    expect(card.approvalState).toBe('PENDING_APPROVAL')
    expect(card.waitingOn).toMatch(/^Waiting on /)
    expect(page.body.data.waitingOn).toBe(card.waitingOn)
    // Every desk at the rank in play is named, not whichever row came first.
    const pending = (page.body.data.approvals as any[]).filter((a) => a.outcome === 'PENDING')
    const lowest = Math.min(...pending.map((a) => a.rank))
    for (const a of pending.filter((x) => x.rank === lowest)) {
      if (a.approver) expect(card.waitingOn).toContain(a.approver.name)
    }
  })
})

describe('an ask is made once and said once', () => {
  it('after asking a supplier for a matched person, the match says when it was asked and offers no second ask', async () => {
    as(HIRING)
    const before = await json(await readMatches(req('GET', `/api/requirements/${s.job}/matches`), withId(s.job)))
    const tamsin = before.body.data.matches.find((m: any) => m.consultant.name === 'Tamsin Okoro')
    expect(tamsin.action.kind).toBe('ASK')
    expect(tamsin.askedFor).toBeNull()
    s.tamsin = tamsin.id

    as(HIRING)
    const asked = await json(await askForThem(req('POST', `/api/requirements/${s.job}/matches/ask`, { matchId: s.tamsin }), withId(s.job)))
    expect(asked.status, JSON.stringify(asked.body)).toBe(201)
    expect(asked.body.data.askedFor.mayAskAgain).toBe(false)

    as(HIRING)
    const after = await json(await readMatches(req('GET', `/api/requirements/${s.job}/matches`), withId(s.job)))
    const row = after.body.data.matches.find((m: any) => m.id === s.tamsin)
    expect(row.askedFor.says).toMatch(/^Asked on [A-Z][a-z]{2} \d{1,2}$/)
    expect(row.askedFor.mayAskAgain).toBe(false)
  })

  it('asking again for the same person inside three days is refused in a sentence, and nothing is sent', async () => {
    const sent = await prisma.message.count({ where: { type: 'ASK', conversation: { companyId: s.northbend, topicId: s.job } } })
    as(HIRING)
    const again = await json(await askForThem(req('POST', `/api/requirements/${s.job}/matches/ask`, { matchId: s.tamsin }), withId(s.job)))
    expect(again.status).toBe(409)
    expect(again.body.error.code).toBe('ASKED_ALREADY')
    expect(again.body.error.message).toMatch(/^You asked Pinnacle Resourcing for Tamsin Okoro on .+ you can ask again from /)
    expect(await prisma.message.count({ where: { type: 'ASK', conversation: { companyId: s.northbend, topicId: s.job } } })).toBe(sent)
  })

  it('the dashboard lists one line per ask, however many times it was pressed', async () => {
    // Two repeats of the same ask, as the button wrote them before it
    // stopped offering itself.
    const first = await prisma.message.findFirstOrThrow({
      where: { type: 'ASK', conversation: { companyId: s.northbend, topicId: s.job } },
      orderBy: { createdAt: 'desc' },
    })
    for (let i = 0; i < 2; i++) {
      await prisma.message.create({
        data: {
          conversationId: first.conversationId, authorId: first.authorId, body: first.body,
          type: 'ASK', metadata: first.metadata as object,
        },
      })
    }
    as(HIRING)
    const r = await json(await readProgram(req('GET', '/api/program')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const asks = (r.body.data.today as any[]).filter((t) => t.what === 'Asked for' && t.who.startsWith('Tamsin Okoro'))
    expect(asks).toHaveLength(1)
  })

  it('three days after the last ask, the match offers "Ask again"', async () => {
    const back = new Date(Date.now() - 4 * 86_400_000)
    await prisma.message.updateMany({
      where: { type: 'ASK', conversation: { companyId: s.northbend, topicId: s.job } },
      data: { createdAt: back },
    })
    as(HIRING)
    const r = await json(await readMatches(req('GET', `/api/requirements/${s.job}/matches`), withId(s.job)))
    const row = r.body.data.matches.find((m: any) => m.id === s.tamsin)
    expect(row.askedFor.mayAskAgain).toBe(true)
    as(HIRING)
    const again = await json(await askForThem(req('POST', `/api/requirements/${s.job}/matches/ask`, { matchId: s.tamsin }), withId(s.job)))
    expect(again.status, JSON.stringify(again.body)).toBe(201)
  })
})

describe('two totals that sat side by side count the same thing', () => {
  it('the All job requests count and the All tab count the same rows, and the settled ones are counted apart', async () => {
    as(HIRING)
    const r = await json(await listJobRequests(req('GET', '/api/requisitions')))
    const rows = r.body.data.requisitions as any[]
    const onTheList = rows.filter((x) => stageOf(x) !== 'ARCHIVED').length
    expect(r.body.data.summary.total).toBe(onTheList)
    expect(r.body.data.summary.settled).toBe(rows.length - onTheList)
  })

  it('contractors on site plus those not started yet add up to the Contractors tab, counted in people', async () => {
    as(HIRING)
    const r = await json(await readProgram(req('GET', '/api/program')))
    const sum = r.body.data.summary
    const people = new Set((r.body.data.contractors as any[]).map((c) => c.person.id)).size
    expect(sum.contractors).toBe(people)
    expect(sum.activeContractors + sum.notStarted).toBe(sum.contractors)
  })
})

describe('a sub-vendor’s name is the prime’s to keep', () => {
  it('the premise: Northbend buys Helena Marsh through Computer Systems, which buys her from CloudEPA, and their agreement discloses nobody', async () => {
    const cs = await prisma.company.findFirstOrThrow({ where: { slug: 'world-computer-systems' }, select: { id: true } })
    const cloudepa = await prisma.company.findFirstOrThrow({ where: { slug: 'world-cloudepa' }, select: { id: true } })
    s.cs = cs.id
    s.cloudepa = cloudepa.id
    const terms = await prisma.masterAgreement.findMany({ where: { clientId: s.northbend, vendorId: cs.id }, select: { disclosesSubVendors: true } })
    expect(terms.length).toBeGreaterThan(0)
    expect(terms.every((t) => !t.disclosesSubVendors)).toBe(true)
  })

  it('a client never reads the name of a firm below its prime on the release panel’s list of suppliers', async () => {
    as(PROGRAMME)
    const r = await json(await supplierRegister(req('GET', '/api/suppliers')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const names = (r.body.data.suppliers as any[]).map((x) => x.name)
    expect(names).toContain('Computer Systems Inc')
    expect(JSON.stringify(r.body)).not.toContain('CloudEPA')
  })

  it('a job request cannot be released to a firm the client reaches only through its prime, and the refusal names nobody', async () => {
    as(PROGRAMME)
    const r = await json(
      await release(
        req('POST', `/api/requisitions/${s.job}/distribute`, { vendors: [{ companyId: s.cloudepa }] }),
        withId(s.job)
      )
    )
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('NOT_YOUR_SUPPLIER')
    expect(r.body.error.message).not.toContain('CloudEPA')
    expect(await prisma.requirementInvitation.count({ where: { requirementId: s.job, toCompanyId: s.cloudepa } })).toBe(0)
  })

  it('a client never reads the name of a firm below its prime on its timesheets — a signed week waits on the firm it pays', async () => {
    const week = await prisma.timesheet.findFirstOrThrow({
      where: { status: 'SUBMITTED', clientApprovedAt: null, person: { name: 'Helena Marsh' }, sellContract: { companyId: s.cloudepa } },
      select: { id: true },
    })
    as(HIRING)
    const signed = await json(await signWeek(req('POST', `/api/timesheets/${week.id}/approve`, {}), withId(week.id)))
    expect(signed.status, JSON.stringify(signed.body)).toBe(200)

    as(HIRING)
    const r = await json(await listTimesheets(req('GET', '/api/timesheets?limit=50')))
    expect(r.status).toBe(200)
    expect(JSON.stringify(r.body)).not.toContain('CloudEPA')
    const row = r.body.data.timesheets.find((t: any) => t.id === week.id)
    expect(row.signature.youSigned).toBe(true)
    expect(row.signature.waitingOn).toBe('Computer Systems Inc')
  })
})

describe('a job request says what the job is, and what its approval checked', () => {
  it('a job request shows what the work is, the skills, where, how long and the pay range before anybody approves it', async () => {
    as(HIRING)
    const r = await json(await oneJobRequest(req('GET', `/api/requisitions/${s.raised}`), withId(s.raised)))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const job = r.body.data.requisition
    expect(job).toMatchObject({
      description: 'Reporting on payroll data.',
      justification: 'The payroll move needs somebody on the data.',
      skills: ['Payroll', 'Workday reporting', 'SQL'],
      location: 'Tualatin, OR',
      months: 6,
      hoursPerWeek: 40,
      billMin: 9_000,
      billMax: 11_500,
      budgetCents: 12_000_000,
      headcount: 1,
    })
    expect(job.costCenter.code).toMatch(/^APPS/)
  })

  it('an approval says what it checked the job against, as recorded when it was raised', async () => {
    as(HIRING)
    const r = await json(await oneJobRequest(req('GET', `/api/requisitions/${s.raised}`), withId(s.raised)))
    const checked = r.body.data.checked
    expect(checked.basis).toBe('RECORDED')
    const byCode = Object.fromEntries((checked.checks as any[]).map((c) => [c.code, c]))
    expect(byCode.HEADCOUNT_PLAN.reason).toMatch(/\d+ of \d+ approved heads/)
    expect(byCode.HEADCOUNT_PLAN.stage).toBe('ROLE')
    expect(byCode.RATE_BAND.stage).toBe('SOURCING')
    expect(byCode.VALUE.reason).toContain('$120,000')
    for (const c of checked.checks) expect(c.reason.length).toBeGreaterThan(0)
  })

  it('a job request raised before its checks were recorded has them run again on today’s plan, and says so', async () => {
    as(HIRING)
    const r = await json(await oneJobRequest(req('GET', `/api/requisitions/${s.job}`), withId(s.job)))
    expect(r.body.data.checked.basis).toBe('NOW')
    expect(r.body.data.checked.checks.length).toBeGreaterThan(0)
  })

  it('a supplier that put somebody forward is working it, never counted as gone quiet', async () => {
    as(HIRING)
    const r = await json(await oneJobRequest(req('GET', `/api/requisitions/${s.job}`), withId(s.job)))
    const sum = r.body.data.summary
    const sentSomebody = (r.body.data.invitations as any[]).filter((i) => i.submittedCount > 0).length
    expect(sentSomebody).toBeGreaterThan(0)
    expect(sum.silent).toBe((r.body.data.invitations as any[]).filter((i) => i.status === 'SENT' && i.submittedCount === 0).length)
    expect(sum.accepted).toBeGreaterThanOrEqual(sentSomebody)
  })
})

describe('a job travels down the chain through the prime’s own record of it', () => {
  it('a prime cannot release the client’s own job request, and is told whose it is', async () => {
    as(PRIME)
    const r = await json(await release(req('POST', `/api/requisitions/${s.job}/distribute`, { vendors: [{ companyId: s.cloudepa }] }), withId(s.job)))
    expect(r.status).toBe(403)
    expect(r.body.error.message).toContain('Only the raising company')
  })

  it('a prime records the job as its own and sends it to its sub-vendor, and it reaches the sub-vendor’s Shared with you list', async () => {
    as(PRIME)
    const own = await json(await recordRole(req('POST', '/api/requirements', {
      title: 'HCM integration lead', skills: ['HCM integration', 'Payroll interfaces'], months: 12,
      endClientCompanyId: s.northbend,
    })))
    expect(own.status, JSON.stringify(own.body)).toBeLessThan(300)
    const id = own.body.data.requirement.id
    as(PRIME)
    const sent = await json(await release(req('POST', `/api/requisitions/${id}/distribute`, { vendors: [{ companyId: s.cloudepa, payMin: 9_000, payMax: 10_500 }] }), withId(id)))
    expect(sent.body?.error, JSON.stringify(sent.body)).toBeUndefined()

    as(SUB)
    const inbox = await json(await sharedWithMe(req('GET', '/api/invitations')))
    expect(inbox.status, JSON.stringify(inbox.body)).toBe(200)
    expect(JSON.stringify(inbox.body)).toContain(id)
  })

  it('the client still reads no name below its prime after the job went down the chain', async () => {
    as(PROGRAMME)
    const r = await json(await supplierRegister(req('GET', '/api/suppliers')))
    expect(JSON.stringify(r.body)).not.toContain('CloudEPA')
  })
})
