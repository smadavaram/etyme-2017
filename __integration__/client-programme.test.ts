import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { day } from '@/lib/seed-days'

import { POST as raiseRequisition } from '@/app/api/requisitions/route'
import { POST as decideRequisition } from '@/app/api/requisitions/[id]/approve/route'
import { POST as distribute } from '@/app/api/requisitions/[id]/distribute/route'
import { POST as submitCandidates } from '@/app/api/submissions/route'
import { POST as award } from '@/app/api/submissions/[id]/award/route'
import { POST as activate } from '@/app/api/contracts/[id]/activate/route'
import { GET as placement } from '@/app/api/placements/[id]/route'
import { POST as fileTimesheet } from '@/app/api/timesheets/route'
import { POST as sendTimesheet } from '@/app/api/timesheets/[id]/submit/route'
import { POST as approveTimesheet } from '@/app/api/timesheets/[id]/approve/route'
import { POST as generateInvoice } from '@/app/api/invoices/generate/route'
import { POST as submitInvoice } from '@/app/api/invoices/[id]/submit/route'
import { POST as pay } from '@/app/api/invoices/[id]/payments/route'
import { GET as tenure } from '@/app/api/tenure/route'
import { GET as alumni } from '@/app/api/alumni/route'
import { GET as compliance } from '@/app/api/compliance/route'

/**
 * A client's month, from its own desks.
 *
 * Nike buys contract labour from three suppliers and pays for this
 * product. The people who use it are not "Nike": they are a hiring
 * manager who needs somebody, a programme office that decides which
 * suppliers see the role, a VP who signs for the money, a clerk who pays
 * what matched, and an officer who answers for tenure and paperwork.
 * Each of them has exactly the rights their job needs, and this walks
 * the ten stations of one hire from whichever desk owns each — and
 * checks, at each, who is refused.
 */

const D = '@demo.etyme.local'
const NIKE = {
  office: `world-nike${D}`,
  programme: `world-nike-programme${D}`,
  hiring: `world-nike-hiring${D}`,
  hr: `world-nike-hr${D}`,
  procurement: `world-nike-procurement${D}`,
  vp: `world-nike-vp${D}`,
  ap: `world-nike-ap${D}`,
  compliance: `world-nike-compliance${D}`,
}
const PINNACLE = `world-pinnacle${D}`
const BRIGHTMOOR = `world-brightmoor${D}`
const WORKER = 'tariq.al.amin@seed.etyme.invalid'

const call = async (fn: (r: any, ctx: any) => Promise<Response>, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve({ id }) }))

const co: Record<string, string> = {}
const it_: Record<string, any> = {}

describe('a client programme, seeded', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
    for (const slug of ['world-nike', 'world-pinnacle', 'world-brightmoor', 'world-corning', 'world-terumo-bct']) {
      co[slug] = (await prisma.company.findUniqueOrThrow({ where: { slug } })).id
    }
    // Somebody on Pinnacle's bench, who can sign in and file their own hours.
    const tariq = await prisma.person.create({ data: { name: 'Tariq Al-Amin', primaryEmail: WORKER } })
    it_.worker = tariq.id
    const profile = await prisma.consultantProfile.create({
      data: { personId: tariq.id, skills: ['Sustainability reporting', 'Power BI'], location: 'Portland, OR', visibility: 'VERIFIED', workAuth: 'USC' },
    })
    await prisma.benchListing.create({
      data: { consultantId: profile.id, companyId: co['world-pinnacle'], tier: 'RETAINED', state: 'GRANTED', invitedAt: day(-30), respondedAt: day(-29), grantedAt: day(-29) },
    })
    await prisma.context.create({
      data: { personId: tariq.id, companyId: co['world-pinnacle'], type: 'CONSULTANT', side: 'SELL', grantReason: 'On the bench' },
    })
  }, 240_000)

  it('every desk exists, with the role its job needs and no more', async () => {
    const desks = await prisma.context.findMany({
      where: { companyId: co['world-nike'], person: { primaryEmail: { in: Object.values(NIKE) } } },
      select: { person: { select: { primaryEmail: true } }, role: { select: { name: true, permissions: true } } },
    })
    const roleOf = (email: string) => desks.find((d) => d.person.primaryEmail === email)?.role
    expect(roleOf(NIKE.hiring)?.name).toBe('Hiring Manager')
    expect(roleOf(NIKE.ap)?.name).toBe('AP Clerk')
    expect(roleOf(NIKE.compliance)?.name).toBe('Compliance Officer')
    expect(roleOf(NIKE.programme)?.name).toBe('Programme Manager')
    // The clerk pays and does not hire; the manager hires and does not pay.
    expect(roleOf(NIKE.ap)?.permissions).toContain('payments.record')
    expect(roleOf(NIKE.ap)?.permissions).not.toContain('requirements.write')
    expect(roleOf(NIKE.hiring)?.permissions).toContain('timesheets.approve')
    expect(roleOf(NIKE.hiring)?.permissions).not.toContain('payments.record')
  })
})

describe('1 · the hiring manager posts a requirement', () => {
  it('a role inside plan and under every line opens itself — nobody has to approve it', async () => {
    const cc = await prisma.costCenter.findFirstOrThrow({ where: { companyId: co['world-nike'], code: { startsWith: 'APPS-' } } })
    as(NIKE.hiring)
    const r = await json(await raiseRequisition(req('POST', '/api/requisitions', {
      title: 'Sustainability data analyst', skills: ['Sustainability reporting', 'Power BI'],
      location: 'Beaverton, OR', billMin: 3200, billMax: 4000, months: 12, headcount: 1, hoursPerWeek: 40,
      costCenterId: cc.id, neededBy: day(14).toISOString(),
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.requisition.approvalState).toBe('AUTO_APPROVED')
    expect(r.body.data.requisition.status).toBe('OPEN')
    it_.requisition = r.body.data.requisition.id
  })

  it('a role over the plan and over the line waits on HR\'s read of the role, then the money — and the manager who raised it cannot wave it through', async () => {
    const routed = await prisma.requirement.findFirstOrThrow({
      where: { companyId: co['world-nike'], approvalState: 'PENDING_APPROVAL' },
      include: { approvals: true },
    })
    // Three stages on the row: HR asked, Procurement cleared by rule, the money at the end.
    expect(routed.approvals.find(a => a.stage === 'ROLE')?.outcome).toBe('PENDING')
    expect(routed.approvals.find(a => a.stage === 'SOURCING')?.outcome).toBe('AUTO_CLEARED')
    expect(routed.approvals.filter(a => a.stage === 'FINAL').every(a => a.outcome === 'PENDING')).toBe(true)

    as(NIKE.hiring)
    const mine = await call(decideRequisition, 'POST', `/api/requisitions/${routed.id}/approve`, routed.id, { action: 'approve' })
    expect(mine.status).toBe(403)

    // The VP is not asked before HR has read the role.
    as(NIKE.vp)
    const early = await call(decideRequisition, 'POST', `/api/requisitions/${routed.id}/approve`, routed.id, { action: 'approve' })
    expect(early.status).toBe(403)

    as(NIKE.hr)
    const hr = await call(decideRequisition, 'POST', `/api/requisitions/${routed.id}/approve`, routed.id, { action: 'approve', reason: 'A real role, and the plan will be amended.' })
    expect(hr.body?.error, JSON.stringify(hr.body)).toBeUndefined()
    expect((await prisma.requirement.findUniqueOrThrow({ where: { id: routed.id } })).status).not.toBe('OPEN')

    // Then the money: everyone at the final rank, in either order.
    const finals = routed.approvals.filter(a => a.stage === 'FINAL' && a.approverId)
    const vpPerson = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: NIKE.vp }, select: { id: true } })
    for (const a of finals) {
      const who = a.approverId === vpPerson.id ? NIKE.vp : (await prisma.person.findUniqueOrThrow({ where: { id: a.approverId! }, select: { primaryEmail: true } })).primaryEmail
      as(who)
      const r = await call(decideRequisition, 'POST', `/api/requisitions/${routed.id}/approve`, routed.id, { action: 'approve' })
      expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    }
    const after = await prisma.requirement.findUniqueOrThrow({ where: { id: routed.id } })
    expect(after.status).toBe('OPEN')
  })

  it('the release can only go to the suppliers Procurement cleared', async () => {
    // Procurement's yes named Pinnacle alone; the office tries Brightmoor as well.
    await prisma.requirement.update({ where: { id: it_.requisition }, data: { clearedSupplierIds: [co['world-pinnacle']] } })
    as(NIKE.programme)
    const r = await call(distribute, 'POST', `/api/requisitions/${it_.requisition}/distribute`, it_.requisition, {
      vendors: [{ companyId: co['world-pinnacle'], payMin: 3200, payMax: 3800 }, { companyId: co['world-brightmoor'], payMin: 3200, payMax: 3800 }],
    })
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('NOT_CLEARED')
    expect(r.body.error.message).toContain('Brightmoor Staffing was not among the suppliers Procurement cleared')
    // Back to "every approved supplier", so the rest of the walk stands.
    await prisma.requirement.update({ where: { id: it_.requisition }, data: { clearedSupplierIds: [] } })
  })
})

describe('2 · the programme office sends it to suppliers, and a supplier answers', () => {
  it('the hiring manager cannot choose which suppliers see it — that is the programme office\'s control', async () => {
    as(NIKE.hiring)
    const r = await call(distribute, 'POST', `/api/requisitions/${it_.requisition}/distribute`, it_.requisition, {
      vendors: [{ companyId: co['world-pinnacle'], payMin: 3200, payMax: 3800 }],
    })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toMatch(/programme office/)
  })

  it('the programme office sends it to Pinnacle with a band Pinnacle alone can see', async () => {
    as(NIKE.programme)
    const r = await call(distribute, 'POST', `/api/requisitions/${it_.requisition}/distribute`, it_.requisition, {
      vendors: [{ companyId: co['world-pinnacle'], payMin: 3200, payMax: 3800 }],
    })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.summary.sent).toBe(1)
    expect(JSON.stringify(r.body)).not.toContain('3800')
  })

  it('Pinnacle puts Tariq forward', async () => {
    as(PINNACLE)
    const r = await json(await submitCandidates(req('POST', '/api/submissions', {
      requirementId: it_.requisition, personIds: [it_.worker], rate: 3800, fromCompanyId: co['world-pinnacle'],
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const created = r.body.data.results.filter((x: any) => x.status === 'created')
    expect(created, JSON.stringify(r.body.data.results)).toHaveLength(1)
    it_.submission = created[0].submissionId ?? (await prisma.submission.findFirstOrThrow({ where: { requirementId: it_.requisition, personId: it_.worker } })).id
  })
})

describe('3 · the hiring manager awards, and both contracts exist with their due dates', () => {
  it('a supplier cannot award its own candidate', async () => {
    as(PINNACLE)
    const r = await call(award, 'POST', `/api/submissions/${it_.submission}/award`, it_.submission, { rate: 3800 })
    expect(r.status).toBe(403)
  })

  it('the award writes the sell contract, the buy contract, the link and the cycles', async () => {
    as(NIKE.hiring)
    const r = await call(award, 'POST', `/api/submissions/${it_.submission}/award`, it_.submission, {
      rate: 3800, startDate: day(-7).toISOString().slice(0, 10), endDate: day(173).toISOString().slice(0, 10),
    })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.contract = r.body.data.contractId
    const sell = await prisma.sellContract.findUniqueOrThrow({ where: { id: it_.contract }, include: { buyLinks: true } })
    expect(sell.state).toBe('DRAFT')
    expect(sell.clientCompanyId).toBe(co['world-nike'])
    expect(sell.buyLinks).toHaveLength(1)
    it_.engagement = sell.engagementId
    // The thing the award path never did: a placement made by awarding
    // had no hours due, no pay day and no invoice date.
    expect(await prisma.cycle.count({ where: { sellContractId: sell.id } })).toBeGreaterThan(0)
    expect(await prisma.cycle.count({ where: { buyContractId: sell.buyLinks[0].buyContractId } })).toBeGreaterThan(0)
  })
})

describe('4 · nobody starts without paperwork', () => {
  it('the hiring manager can see on the thread why Tariq cannot start, before anybody presses activate', async () => {
    as(NIKE.hiring)
    const r = await call(placement, 'GET', `/api/placements/${it_.contract}`, it_.contract)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.checklist.outcome).toBe('BLOCK')
    expect(r.body.data.checklist.says).toMatch(/cannot start without/)
    // What the supplier pays Tariq is the supplier's business.
    expect(r.body.data.timeline.pay).toEqual([])
  })

  it('a firm that is not a party to the contract cannot touch it, and is told so in words', async () => {
    as(BRIGHTMOOR)
    const r = await call(activate, 'POST', `/api/contracts/${it_.contract}/activate`, it_.contract, { action: 'activate' })
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('NOT_A_PARTY')
    expect(r.body.error.message).toMatch(/not a party/)
  })

  it('the AP clerk is a party and still cannot start somebody — that is not the clerk\'s job', async () => {
    as(NIKE.ap)
    const r = await call(activate, 'POST', `/api/contracts/${it_.contract}/activate`, it_.contract, { action: 'activate' })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toMatch(/assignments\.write/)
  })

  it('with no I-9 on file the supplier is refused, whatever reason it gives', async () => {
    as(PINNACLE)
    const r = await call(activate, 'POST', `/api/contracts/${it_.contract}/activate`, it_.contract, { action: 'activate', overrideReason: 'starts Monday' })
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('DOCUMENTS_BLOCK')
  })

  it('with an I-9 and no background check it warns, and proceeds with a reason that travels with the record', async () => {
    const seat = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: PINNACLE } })
    await prisma.verification.create({
      data: {
        personId: it_.worker, type: 'I9_EVERIFY', status: 'CLEAR', provider: 'E-Verify', issuedAt: day(-1),
        uploadedById: seat.id, verifiedById: seat.id, verifiedAt: day(-1), result: { outcome: 'CLEAR' },
      },
    })
    as(PINNACLE)
    const warned = await call(activate, 'POST', `/api/contracts/${it_.contract}/activate`, it_.contract, { action: 'activate' })
    expect(warned.status).toBe(422)
    expect(warned.body.error.code).toBe('DOCUMENTS_WARN')

    const r = await call(activate, 'POST', `/api/contracts/${it_.contract}/activate`, it_.contract, {
      action: 'activate', overrideReason: 'Background check ordered from Sterling, reference ST-90210; Nike waived it for the first fortnight in writing.',
    })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const live = await prisma.sellContract.findUniqueOrThrow({ where: { id: it_.contract } })
    expect(live.state).toBe('IN_PROGRESS')
    const log = await prisma.automationLog.findFirstOrThrow({
      where: { action: 'CONTRACT_ACTIVATE', payload: { path: ['contractId'], equals: it_.contract } },
    })
    const payload = log.payload as { documentsOverride?: string; by?: { side?: string } }
    expect(payload.documentsOverride).toMatch(/Sterling/)
    expect(payload.by?.side).toBe('SUPPLIER')
  })
})

describe('5 · Tariq files a week; the hiring manager signs it', () => {
  const WEEK = { periodStart: day(-7).toISOString().slice(0, 10), periodEnd: day(-3).toISOString().slice(0, 10) }
  const days: Record<string, number> = {}
  for (let i = 0; i < 5; i++) days[day(-7 + i).toISOString().slice(0, 10)] = 8

  it('the AP clerk cannot enter hours for him', async () => {
    as(NIKE.ap)
    const r = await json(await fileTimesheet(req('POST', '/api/timesheets', { sellContractId: it_.contract, ...WEEK, days })))
    expect(r.status).toBe(403)
  })

  it('Tariq enters his own week and sends it', async () => {
    as(WORKER)
    const r = await json(await fileTimesheet(req('POST', '/api/timesheets', { sellContractId: it_.contract, ...WEEK, days })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.timesheet = r.body.data.timesheet.id
    expect(r.body.data.timesheet.totalHours).toBe(40)
    const sent = await call(sendTimesheet, 'POST', `/api/timesheets/${it_.timesheet}/submit`, it_.timesheet, {})
    expect(sent.body?.error, JSON.stringify(sent.body)).toBeUndefined()
  })

  it('nobody signs their own hours, and the clerk cannot sign anybody\'s', async () => {
    as(WORKER)
    const own = await call(approveTimesheet, 'POST', `/api/timesheets/${it_.timesheet}/approve`, it_.timesheet, {})
    expect(own.status).toBe(403)
    as(NIKE.ap)
    const clerk = await call(approveTimesheet, 'POST', `/api/timesheets/${it_.timesheet}/approve`, it_.timesheet, {})
    expect(clerk.status).toBe(403)
  })

  it('the hiring manager approves the work; the supplier accepts what it will pay; only then is the week approved', async () => {
    as(NIKE.hiring)
    const r = await call(approveTimesheet, 'POST', `/api/timesheets/${it_.timesheet}/approve`, it_.timesheet, {})
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const half = await prisma.timesheet.findUniqueOrThrow({ where: { id: it_.timesheet } })
    expect(half.clientApprovedAt).not.toBeNull()
    expect(half.status).toBe('SUBMITTED')

    as(PINNACLE)
    const e = await call(approveTimesheet, 'POST', `/api/timesheets/${it_.timesheet}/approve`, it_.timesheet, { as: 'EMPLOYER' })
    expect(e.body?.error, JSON.stringify(e.body)).toBeUndefined()
    const done = await prisma.timesheet.findUniqueOrThrow({ where: { id: it_.timesheet } })
    expect(done.status).toBe('APPROVED')
  })
})

describe('6 · Pinnacle invoices; Nike pays what matched', () => {
  it('Pinnacle raises the invoice from the signed week — 40 hours at $38', async () => {
    as(PINNACLE)
    const r = await json(await generateInvoice(req('POST', '/api/invoices/generate', { engagementId: it_.engagement })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.invoice = r.body.data.invoice.id
    expect(r.body.data.invoice.total).toBe(1520)
  })

  it('Brightmoor cannot raise an invoice on Pinnacle\'s engagement', async () => {
    as(BRIGHTMOOR)
    const r = await json(await generateInvoice(req('POST', '/api/invoices/generate', { engagementId: it_.engagement })))
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('NOT_THE_SUPPLIER')
  })

  it('the clerk cannot pay an invoice the supplier has not submitted through the match', async () => {
    as(NIKE.ap)
    const r = await call(pay, 'POST', `/api/invoices/${it_.invoice}/payments`, it_.invoice, { amount: 1520, method: 'ACH' })
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('NOT_SUBMITTED')
  })

  it('Pinnacle submits it; the invoice matches the hours', async () => {
    as(PINNACLE)
    const r = await call(submitInvoice, 'POST', `/api/invoices/${it_.invoice}/submit`, it_.invoice, {})
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.invoice.status).toBe('SUBMITTED')
  })

  it('a firm that is not on the invoice cannot pay it, and is not told it exists', async () => {
    as(BRIGHTMOOR)
    const r = await call(pay, 'POST', `/api/invoices/${it_.invoice}/payments`, it_.invoice, { amount: 1520, method: 'ACH' })
    expect(r.status).toBe(404)
  })

  it('the compliance officer cannot pay it either — reading is not paying', async () => {
    as(NIKE.compliance)
    const r = await call(pay, 'POST', `/api/invoices/${it_.invoice}/payments`, it_.invoice, { amount: 1520, method: 'ACH' })
    expect(r.status).toBe(403)
  })

  it('the AP clerk pays it, and the payment says who paid whom', async () => {
    as(NIKE.ap)
    const r = await call(pay, 'POST', `/api/invoices/${it_.invoice}/payments`, it_.invoice, { amount: 1520, method: 'ACH', reference: 'NIKE-AP-0917' })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.invoice.status).toBe('PAID')
    const p = await prisma.payment.findFirstOrThrow({ where: { invoiceId: it_.invoice } })
    expect(p.payerCompanyId).toBe(co['world-nike'])
    expect(p.receivedByCompanyId).toBe(co['world-pinnacle'])
  })
})

describe('7 · tenure is the person\'s, across every supplier', () => {
  it('Lucía has fourteen months at Nike — thirteen through Brightmoor, one through Pinnacle — and Pinnacle knows only the one', async () => {
    as(NIKE.compliance)
    const r = await json(await tenure(req('GET', '/api/tenure')))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const lucia = r.body.data.people.find((p: any) => p.name === 'Lucía Fernández')
    expect(lucia, 'Lucía is on the ledger').toBeTruthy()
    expect(lucia.vendors.map((v: any) => v.name).sort()).toEqual(['Brightmoor Staffing', 'Pinnacle Resourcing'])
    expect(lucia.cumulativeMonths).toBe(14)
    expect(lucia.status).toBe('WARNING')
  })

  it('Kwame is over the cap and inside the break — the ledger shows the date he is eligible', async () => {
    as(NIKE.compliance)
    const r = await json(await tenure(req('GET', '/api/tenure')))
    const kwame = r.body.data.people.find((p: any) => p.name === 'Kwame Mensah')
    expect(kwame.status).toBe('IN_BREAK')
    expect(kwame.eligibleDate).toBe(day(40).toISOString().slice(0, 10))
  })

  it('at Terumo BCT, Anders is twenty-three months on site across two suppliers against a cap of eighteen', async () => {
    as(`world-terumo-bct-compliance${D}`)
    const r = await json(await tenure(req('GET', '/api/tenure')))
    const anders = r.body.data.people.find((p: any) => p.name === 'Anders Lund')
    expect(anders.cumulativeMonths).toBe(23)
    expect(anders.status).toBe('BREAK_REQUIRED')
    expect(anders.vendors).toHaveLength(2)
  })

  it('a person supplied through a prime and a bench vendor is counted once, not once per rung', async () => {
    as(NIKE.compliance)
    const r = await json(await tenure(req('GET', '/api/tenure')))
    // Helena Marsh: Nike ← Computer Systems ← CloudEPA, 200 days. Two
    // contracts, one person, one stretch.
    const helena = r.body.data.people.find((p: any) => p.name === 'Helena Marsh')
    expect(helena.contractCount).toBe(2)
    expect(helena.cumulativeMonths).toBe(7)
  })

  it('asking somebody back is a date inside the break, and a button after it', async () => {
    as(NIKE.hiring)
    const r = await json(await alumni(req('GET', '/api/alumni')))
    const kwame = r.body.data.alumni.find((a: any) => a.name === 'Kwame Mensah')
    expect(kwame.canReengage).toBe(false)
    expect(kwame.eligibleDate).toBe(day(40).toISOString().slice(0, 10))

    as(`world-corning-hiring${D}`)
    const c = await json(await alumni(req('GET', '/api/alumni')))
    const nadia = c.body.data.alumni.find((a: any) => a.name === 'Nadia Petrova')
    expect(nadia.canReengage).toBe(true)
  })

  it('the compliance officer sees which supplier\'s cover is about to run out', async () => {
    as(NIKE.compliance)
    const r = await json(await compliance(req('GET', '/api/compliance')))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const brightmoor = r.body.data.verifications.companies.find((c: any) => c.name === 'Brightmoor Staffing')
    expect(brightmoor, 'Brightmoor is on the compliance view').toBeTruthy()
    expect(brightmoor.cover.outcome).toBe('WARN')
  })

  it('every one of those reads left a trail', async () => {
    const officer = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: NIKE.compliance } })
    const n = await prisma.accessLog.count({ where: { actorPersonId: officer.id, action: 'TENURE_VIEW' } })
    expect(n).toBeGreaterThan(0)
  })
})
