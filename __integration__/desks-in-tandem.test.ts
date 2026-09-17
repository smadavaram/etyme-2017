import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { day } from '@/lib/seed-days'

import { GET as listRoles } from '@/app/api/roles/route'
import { POST as invite } from '@/app/api/access/invite/route'
import { POST as raiseRequisition } from '@/app/api/requisitions/route'
import { POST as distribute } from '@/app/api/requisitions/[id]/distribute/route'
import { POST as submitCandidates } from '@/app/api/submissions/route'
import { POST as award } from '@/app/api/submissions/[id]/award/route'
import { POST as activate } from '@/app/api/contracts/[id]/activate/route'
import { POST as reviewPacket } from '@/app/api/packets/[id]/review/route'
import { POST as fileTimesheet } from '@/app/api/timesheets/route'
import { POST as sendTimesheet } from '@/app/api/timesheets/[id]/submit/route'
import { POST as approveTimesheet } from '@/app/api/timesheets/[id]/approve/route'
import { POST as generateBill } from '@/app/api/invoices/generate/route'
import { POST as runPayroll } from '@/app/api/payroll/run/route'
import { GET as profitability } from '@/app/api/profitability/route'

/**
 * The desks, in tandem.
 *
 * "Create test scripts where the flows in each company are working in
 * tandem." One placement — Northbend Athletic hiring through Brightmoor
 * Staffing — walked station by station in the founder's own order:
 * the recruiter procures and submits, the account manager sells upward,
 * the client interviews and hires, the contract manager and HR make both
 * sides compliant, the consultant files a week, the client signs it, the
 * firm bills its customer, pays its people, and the owner reads what it
 * made.
 *
 * What makes this file different from `full-spine.test.ts`, which walks
 * the same chain company to company: **every seat here holds a real
 * role.** `full-spine` creates one role per company named Owner with
 * `permissions: ['*']`, so it has never once exercised a desk being
 * refused. Each station below therefore has two halves — the desk that
 * owns the work does it, and a desk at the same company, signed in and
 * entitled to be there, is refused.
 *
 * That second half is the point. A hole in segregation of duties looks
 * exactly like working software until somebody tries it.
 *
 * The words are the trade's, settled 2026-09-17: the firm **bills** its
 * customer, the signed week is a **timesheet receipt**, and its own
 * employee is paid by **payroll**.
 */

const D = '@demo.etyme.local'

/** Northbend Athletic — a client, whose desks the world seed already seats. */
const NIKE = {
  owner: `world-nike${D}`,
  programme: `world-nike-programme${D}`,
  hiring: `world-nike-hiring${D}`,
  ap: `world-nike-ap${D}`,
  viewer: 'wren.holloway@northbend.invalid',
}

/** Brightmoor Staffing — a supplier, seeded with an owner and no one else. */
const BRIGHTMOOR = {
  owner: `world-brightmoor${D}`,
  recruiter: 'dev.raman@brightmoor.demo.etyme.local',
  account: 'priya.sethi@brightmoor.demo.etyme.local',
  hr: 'tom.adeyemi@brightmoor.demo.etyme.local',
  contract: 'ines.farah@brightmoor.demo.etyme.local',
  ar: 'noor.haddad@brightmoor.demo.etyme.local',
  payroll: 'karl.bennett@brightmoor.demo.etyme.local',
  compliance: 'mei.tanaka@brightmoor.demo.etyme.local',
}

const WORKER = 'rosalind.ferrer@seed.etyme.invalid'

const call = async (fn: (r: any, ctx: any) => Promise<Response>, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve({ id }) }))

const co: Record<string, string> = {}
const it_: Record<string, any> = {}

/** Seat somebody at the company the caller belongs to, in a named role. */
async function seat(inviter: string, roles: Record<string, string>, roleName: string, name: string, email: string) {
  as(inviter)
  const r = await json(await invite(req('POST', '/api/access/invite', { name, email, roleId: roles[roleName] })))
  if (r.status !== 201) throw new Error(`could not seat ${roleName}: ${JSON.stringify(r.body)}`)
}

async function rolesAt(owner: string): Promise<Record<string, string>> {
  as(owner)
  const r = await json(await listRoles(req('GET', '/api/roles')))
  return Object.fromEntries(r.body.data.roles.map((x: any) => [x.name, x.id]))
}

/** A refusal is a sentence somebody can act on, not a code. */
function refused(r: { status: number; body: any }) {
  expect(r.status, JSON.stringify(r.body)).toBe(403)
  const message = String(r.body?.error?.message ?? '')
  expect(message.length, 'a refusal says what is wrong').toBeGreaterThan(12)
  return message
}

describe('the desks, in tandem: one placement, and at every station the wrong desk is refused', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
    for (const slug of ['world-nike', 'world-brightmoor']) {
      co[slug] = (await prisma.company.findUniqueOrThrow({ where: { slug }, select: { id: true } })).id
    }

    // Brightmoor's owner brings the firm's desks in, through the same
    // route a real owner uses.
    const bm = await rolesAt(BRIGHTMOOR.owner)
    await seat(BRIGHTMOOR.owner, bm, 'Recruiter', 'Dev Raman', BRIGHTMOOR.recruiter)
    await seat(BRIGHTMOOR.owner, bm, 'Account Manager', 'Priya Sethi', BRIGHTMOOR.account)
    await seat(BRIGHTMOOR.owner, bm, 'HR', 'Tom Adeyemi', BRIGHTMOOR.hr)
    await seat(BRIGHTMOOR.owner, bm, 'Contract Manager', 'Ines Farah', BRIGHTMOOR.contract)
    await seat(BRIGHTMOOR.owner, bm, 'Accounts Receivable', 'Noor Haddad', BRIGHTMOOR.ar)
    await seat(BRIGHTMOOR.owner, bm, 'AP & Payroll', 'Karl Bennett', BRIGHTMOOR.payroll)
    await seat(BRIGHTMOOR.owner, bm, 'Compliance Officer', 'Mei Tanaka', BRIGHTMOOR.compliance)

    // The client's desks are seeded; it has no Viewer, and the whole
    // point of a Viewer is that they change nothing.
    const nk = await rolesAt(NIKE.owner)
    await seat(NIKE.owner, nk, 'Viewer', 'Wren Holloway', NIKE.viewer)

    // Rosalind is on Brightmoor's bench, with consent actually recorded,
    // and employed by Brightmoor on W2 — so the money out is payroll.
    const worker = await prisma.person.create({ data: { name: 'Rosalind Ferrer', primaryEmail: WORKER } })
    it_.worker = worker.id
    const profile = await prisma.consultantProfile.create({
      data: { personId: worker.id, skills: ['Power BI', 'Workforce planning'], location: 'Portland, OR', visibility: 'VERIFIED', workAuth: 'USC' },
    })
    await prisma.benchListing.create({
      data: { consultantId: profile.id, companyId: co['world-brightmoor'], tier: 'RETAINED', state: 'GRANTED', invitedAt: day(-30), respondedAt: day(-29), grantedAt: day(-29) },
    })
    await prisma.context.create({
      data: { personId: worker.id, companyId: co['world-brightmoor'], type: 'CONSULTANT', side: 'SELL', grantReason: 'On the bench' },
    })
  }, 300_000)

  // ── 1 ────────────────────────────────────────────────────────────────

  it('the hiring manager raises the requisition, and the AP clerk who will pay for it cannot', async () => {
    const cc = await prisma.costCenter.findFirstOrThrow({ where: { companyId: co['world-nike'], code: { startsWith: 'APPS-' } } })
    it_.costCenter = cc.id
    const body = {
      title: 'Workforce analytics lead', skills: ['Power BI', 'Workforce planning'],
      location: 'Beaverton, OR', billMin: 3200, billMax: 4000, months: 6, headcount: 1, hoursPerWeek: 40,
      costCenterId: cc.id, neededBy: day(7).toISOString(),
    }

    as(NIKE.hiring)
    const mine = await json(await raiseRequisition(req('POST', '/api/requisitions', body)))
    expect(mine.body?.error, JSON.stringify(mine.body)).toBeUndefined()
    it_.requisition = mine.body.data.requisition.id

    as(NIKE.ap)
    refused(await json(await raiseRequisition(req('POST', '/api/requisitions', body))))
  })

  it('a viewer who reads the whole program cannot raise one either', async () => {
    as(NIKE.viewer)
    refused(await json(await raiseRequisition(req('POST', '/api/requisitions', {
      title: 'Second analytics lead', skills: ['Power BI'], location: 'Beaverton, OR',
      billMin: 3200, billMax: 4000, months: 6, headcount: 1, hoursPerWeek: 40,
      costCenterId: it_.costCenter, neededBy: day(7).toISOString(),
    }))))
  })

  // ── 2 ────────────────────────────────────────────────────────────────

  it('the program office chooses which suppliers see it, and the hiring manager who raised it cannot', async () => {
    const release = { vendors: [{ companyId: co['world-brightmoor'], payMin: 3200, payMax: 3800 }] }

    as(NIKE.hiring)
    refused(await call(distribute, 'POST', `/api/requisitions/${it_.requisition}/distribute`, it_.requisition, release))

    as(NIKE.programme)
    const ok = await call(distribute, 'POST', `/api/requisitions/${it_.requisition}/distribute`, it_.requisition, release)
    expect(ok.body?.error, JSON.stringify(ok.body)).toBeUndefined()
    expect((await prisma.requirementInvitation.findFirstOrThrow({ where: { requirementId: it_.requisition } })).status).toBe('SENT')
  })

  // ── 3 ────────────────────────────────────────────────────────────────

  it('the recruiter puts Rosalind forward, and the firm’s own HR desk cannot', async () => {
    const put = { requirementId: it_.requisition, personIds: [it_.worker], rate: 3800, fromCompanyId: co['world-brightmoor'] }

    as(BRIGHTMOOR.hr)
    refused(await json(await submitCandidates(req('POST', '/api/submissions', put))))

    as(BRIGHTMOOR.recruiter)
    const ok = await json(await submitCandidates(req('POST', '/api/submissions', put)))
    expect(ok.body?.error, JSON.stringify(ok.body)).toBeUndefined()
    it_.submission = (await prisma.submission.findFirstOrThrow({ where: { requirementId: it_.requisition, personId: it_.worker } })).id
  })

  it('nor can the desk that will bill for her, which has never met her', async () => {
    as(BRIGHTMOOR.ar)
    refused(await json(await submitCandidates(req('POST', '/api/submissions', {
      requirementId: it_.requisition, personIds: [it_.worker], rate: 3800, fromCompanyId: co['world-brightmoor'],
    }))))
  })

  // ── 4 ────────────────────────────────────────────────────────────────

  it('the client’s hiring manager awards the seat, and the viewer cannot', async () => {
    const terms = { rate: 3800, startDate: day(-14).toISOString().slice(0, 10), endDate: day(180).toISOString().slice(0, 10) }

    as(NIKE.viewer)
    refused(await call(award, 'POST', `/api/submissions/${it_.submission}/award`, it_.submission, terms))

    as(NIKE.hiring)
    const ok = await call(award, 'POST', `/api/submissions/${it_.submission}/award`, it_.submission, terms)
    expect(ok.body?.error, JSON.stringify(ok.body)).toBeUndefined()
    it_.contract = ok.body.data.contractId
    const sell = await prisma.sellContract.findUniqueOrThrow({ where: { id: it_.contract }, include: { buyLinks: true } })
    it_.buy = sell.buyLinks[0].buyContractId
    expect(sell.state).toBe('DRAFT')
  })

  // ── 5 ────────────────────────────────────────────────────────────────

  it('HR clears her paperwork, and the compliance officer who checks it reads only', async () => {
    const tomSeat = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: BRIGHTMOOR.hr }, select: { id: true } })
    const packet = await prisma.documentPacket.create({
      data: {
        companyId: co['world-brightmoor'], packetKey: 'consultant-onboarding', label: 'Onboarding papers',
        purpose: 'COMPLIANCE', direction: 'COLLECT', subjectPersonId: it_.worker,
        recipientEmail: WORKER, recipientName: 'Rosalind Ferrer',
        token: 'tandem-walk-packet-token', expiresAt: day(21), createdById: tomSeat.id,
      },
      select: { id: true },
    })
    const item = await prisma.packetItem.create({
      data: { packetId: packet.id, key: 'i9', label: 'Form I-9', hint: 'Both sections, with the evidence behind it', state: 'RECEIVED', receivedAt: day(-2), position: 0 },
      select: { id: true },
    })

    as(BRIGHTMOOR.compliance)
    refused(await call(reviewPacket, 'POST', `/api/packets/${packet.id}/review`, packet.id, { itemId: item.id, action: 'accept' }))

    as(BRIGHTMOOR.hr)
    const ok = await call(reviewPacket, 'POST', `/api/packets/${packet.id}/review`, packet.id, { itemId: item.id, action: 'accept' })
    expect(ok.body?.error, JSON.stringify(ok.body)).toBeUndefined()
    expect((await prisma.packetItem.findUniqueOrThrow({ where: { id: item.id } })).reviewedAt).not.toBeNull()
  })

  // ── 6 ────────────────────────────────────────────────────────────────

  it('the contract manager starts them both, and the recruiter who found her cannot', async () => {
    // The I-9 the activation gate demands, so this station is about the
    // desk rather than about the paperwork.
    const tom = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: BRIGHTMOOR.hr } })
    await prisma.verification.create({
      data: {
        personId: it_.worker, type: 'I9_EVERIFY', status: 'CLEAR', provider: 'E-Verify', issuedAt: day(-1),
        uploadedById: tom.id, verifiedById: tom.id, verifiedAt: day(-1), result: { outcome: 'CLEAR' },
      },
    })
    const go = { action: 'activate', overrideReason: 'Background check ordered; Northbend Athletic waived it for the first fortnight in writing.' }

    as(BRIGHTMOOR.recruiter)
    refused(await call(activate, 'POST', `/api/contracts/${it_.contract}/activate`, it_.contract, go))

    as(BRIGHTMOOR.contract)
    const ok = await call(activate, 'POST', `/api/contracts/${it_.contract}/activate`, it_.contract, go)
    expect(ok.body?.error, JSON.stringify(ok.body)).toBeUndefined()
    expect((await prisma.sellContract.findUniqueOrThrow({ where: { id: it_.contract } })).state).toBe('IN_PROGRESS')
    expect((await prisma.buyContract.findUniqueOrThrow({ where: { id: it_.buy } })).state).toBe('IN_PROGRESS')
  })

  // ── 7 ────────────────────────────────────────────────────────────────

  it('Rosalind files her own week, and a firm that is not on the deal cannot file it for her', async () => {
    const WEEK = { periodStart: day(-7).toISOString().slice(0, 10), periodEnd: day(-3).toISOString().slice(0, 10) }
    const days: Record<string, number> = {}
    for (let i = 0; i < 5; i++) days[day(-7 + i).toISOString().slice(0, 10)] = 8

    as(`world-pinnacle${D}`)
    const stranger = await json(await fileTimesheet(req('POST', '/api/timesheets', { sellContractId: it_.contract, ...WEEK, days })))
    expect(stranger.status, JSON.stringify(stranger.body)).toBe(403)

    as(WORKER)
    const ok = await json(await fileTimesheet(req('POST', '/api/timesheets', { sellContractId: it_.contract, ...WEEK, days })))
    expect(ok.body?.error, JSON.stringify(ok.body)).toBeUndefined()
    it_.timesheet = ok.body.data.timesheet.id

    const sent = await call(sendTimesheet, 'POST', `/api/timesheets/${it_.timesheet}/submit`, it_.timesheet, {})
    expect(sent.body?.error, JSON.stringify(sent.body)).toBeUndefined()
    expect((await prisma.timesheet.findUniqueOrThrow({ where: { id: it_.timesheet } })).status).toBe('SUBMITTED')
  })

  // ── 8 ────────────────────────────────────────────────────────────────

  it('the client signs the week — the timesheet receipt — and Rosalind cannot sign her own hours', async () => {
    as(WORKER)
    const own = await call(approveTimesheet, 'POST', `/api/timesheets/${it_.timesheet}/approve`, it_.timesheet, {})
    expect(own.status, JSON.stringify(own.body)).toBe(403)
    expect(String(own.body?.error?.message)).toContain('Nobody approves their own hours')

    as(NIKE.hiring)
    const ok = await call(approveTimesheet, 'POST', `/api/timesheets/${it_.timesheet}/approve`, it_.timesheet, {})
    expect(ok.body?.error, JSON.stringify(ok.body)).toBeUndefined()
    expect((await prisma.timesheet.findUniqueOrThrow({ where: { id: it_.timesheet } })).clientApprovedAt).not.toBeNull()
  })

  it('AP & Payroll accepts what the firm will pay, and the desk that bills the customer cannot', async () => {
    as(BRIGHTMOOR.ar)
    const wrong = await call(approveTimesheet, 'POST', `/api/timesheets/${it_.timesheet}/approve`, it_.timesheet, {})
    expect(wrong.status, JSON.stringify(wrong.body)).toBe(403)

    as(BRIGHTMOOR.payroll)
    const ok = await call(approveTimesheet, 'POST', `/api/timesheets/${it_.timesheet}/approve`, it_.timesheet, {})
    expect(ok.body?.error, JSON.stringify(ok.body)).toBeUndefined()
    expect((await prisma.timesheet.findUniqueOrThrow({ where: { id: it_.timesheet } })).status).toBe('APPROVED')
  })

  // ── 9 ────────────────────────────────────────────────────────────────

  it('Accounts Receivable bills the customer, and the desk that pays Rosalind cannot raise a bill', async () => {
    it_.engagement = (await prisma.sellContract.findUniqueOrThrow({ where: { id: it_.contract }, select: { engagementId: true } })).engagementId
    const period = {
      engagementId: it_.engagement,
      periodStart: day(-7).toISOString().slice(0, 10),
      periodEnd: day(-3).toISOString().slice(0, 10),
    }

    as(BRIGHTMOOR.payroll)
    refused(await json(await generateBill(req('POST', '/api/invoices/generate', period))))

    as(BRIGHTMOOR.ar)
    const ok = await json(await generateBill(req('POST', '/api/invoices/generate', period)))
    expect(ok.body?.error, JSON.stringify(ok.body)).toBeUndefined()
    const bill = await prisma.invoice.findFirstOrThrow({ where: { engagementId: it_.engagement } })
    expect(Number(bill.total)).toBeGreaterThan(0)
  })

  // ── 10 ───────────────────────────────────────────────────────────────

  it('AP & Payroll runs her payroll, and the desk that billed for it cannot', async () => {
    const run = {
      buyContractIds: [it_.buy],
      period: { start: day(-7).toISOString().slice(0, 10), end: day(-3).toISOString().slice(0, 10) },
      action: 'calculate',
    }

    as(BRIGHTMOOR.ar)
    refused(await json(await runPayroll(req('POST', '/api/payroll/run', run))))

    as(BRIGHTMOOR.payroll)
    const ok = await json(await runPayroll(req('POST', '/api/payroll/run', run)))
    expect(ok.body?.error, JSON.stringify(ok.body)).toBeUndefined()
  })

  // ── 11 ───────────────────────────────────────────────────────────────

  it('the owner reads what the placement made, and the recruiter — who cannot see what anyone costs — cannot', async () => {
    as(BRIGHTMOOR.recruiter)
    refused(await json(await profitability(req('GET', '/api/profitability'))))

    as(BRIGHTMOOR.owner)
    const ok = await json(await profitability(req('GET', '/api/profitability')))
    expect(ok.body?.error, JSON.stringify(ok.body)).toBeUndefined()
  })

  // ── the shape of the whole walk ──────────────────────────────────────

  it('and no desk in the firm could have done the whole thing alone', async () => {
    // Every role the firm has, not only the ones somebody is sitting in:
    // this is a statement about how the desks are cut, and it should hold
    // whether or not anybody has been hired into a given one yet.
    const roles = await prisma.role.findMany({
      where: { companyId: co['world-brightmoor'] },
      select: { name: true, permissions: true },
    })
    // One permission per station of the walk above.
    const stations = ['submissions.create', 'assignments.write', 'consultants.write', 'invoices.issue', 'payroll.run']
    const whole = roles.filter((r) => {
      const held = r.permissions as string[]
      return stations.every((p) => held.includes(p) || held.includes('*'))
    })
    // Owner and Admin are deliberately able to do everything, because
    // somebody has to be able to. Every desk below them can do its own
    // station and not the next one, which is the whole point of the walk.
    expect(whole.map((r) => r.name).sort()).toEqual(['Admin', 'Owner'])
    expect(roles.length).toBeGreaterThan(8)
  })
})
