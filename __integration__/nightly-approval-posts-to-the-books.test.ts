import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { req, json, resetDatabase, prisma } from './harness'
import { GET as autoApprove } from '@/app/api/cron/auto-approve/route'

/**
 * A week the nightly job approves reaches the books, the same as one
 * signed from the approve button.
 *
 * Before this, `cron/auto-approve` wrote the client's approval by silence
 * onto the ledger and posted nothing, so revenue on a week nobody signed
 * by hand was missing from the project order. The approve route was fixed
 * first (approve-button-posts-to-the-books); this is the other door.
 *
 * Postings are keyed on the assertion, so a second run — which finds the
 * week already signed — posts nothing twice. A week flagged when it was
 * filed is never signed by the job, so it is never posted either.
 */

const DAY = 86_400_000
const ago = (n: number) => new Date(Date.now() - n * DAY)
const SECRET = 'nightly-approval-posts-to-the-books'
let secretBefore: string | undefined

let n = 0
const tag = () => `${++n}`.padStart(3, '0')

async function firm(name: string, kind: 'CLIENT' | 'VENDOR') {
  const slug = `${name.toLowerCase().replace(/[^a-z]+/g, '-')}-${tag()}`
  return prisma.company.create({ data: { name, slug, kind, domain: `${slug}.example` } })
}

/** A direct placement under a client order on which silence approves after five days. */
async function placement(flagged: boolean) {
  const client = await firm('Cavell Mills', 'CLIENT')
  const supplier = await firm('Wrenhollow Staffing', 'VENDOR')
  const person = await prisma.person.create({ data: { name: `Ines Varga ${tag()}`, primaryEmail: `ines.${tag()}@wrenhollow.example` } })
  const order = await prisma.workOrder.create({
    data: {
      number: `PO-${tag()}`, issuedById: client.id, issuedToId: supplier.id, recordedById: client.id,
      amount: 100_000, currency: 'USD', status: 'OPEN', startDate: ago(120),
      autoApproveTimesheets: true, approvalWindowDays: 5,
    },
  })
  const line = await prisma.sellContract.create({
    data: {
      companyId: supplier.id, clientCompanyId: client.id, personId: person.id,
      billRate: 12_500, startDate: ago(120), state: 'IN_PROGRESS', workOrderId: order.id,
    },
  })
  return prisma.timesheet.create({
    data: {
      sellContractId: line.id, personId: person.id, periodStart: ago(16), periodEnd: ago(12),
      days: {}, totalHours: 40, status: 'SUBMITTED', submittedAt: ago(12),
      anomalyScore: flagged ? 1 : null,
      anomalyReason: flagged ? 'Fourteen hours on one day.' : null,
    },
  })
}

const run = async () => {
  const r = await json(await autoApprove(req('GET', '/api/cron/auto-approve', undefined, { authorization: `Bearer ${SECRET}` })))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
}

const approvals = (timesheetId: string) =>
  prisma.workAssertion.findMany({ where: { timesheetId, role: 'CLIENT_APPROVAL', state: 'LIVE' } })
const revenue = (sourceId: string) =>
  prisma.orderPosting.findMany({ where: { source: 'TIMESHEET', sourceId, kind: 'REVENUE', reversalOfId: null } })

let quiet: { id: string }
let flagged: { id: string }

beforeAll(async () => {
  await resetDatabase()
  secretBefore = process.env.CRON_SECRET
  process.env.CRON_SECRET = SECRET
  quiet = await placement(false)
  flagged = await placement(true)
  await run()
}, 900_000)

afterAll(() => {
  if (secretBefore === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = secretBefore
})

describe('a week the nightly job approves reaches the books', () => {
  it('a week the nightly job approves is posted to the books once', async () => {
    const [approval] = await approvals(quiet.id)
    expect(approval.auto).toBe(true)
    const posted = await revenue(approval.id)
    expect(posted).toHaveLength(1)
    // Forty hours at the client's $125.00, in cents.
    expect(posted[0].txAmountCents).toBe(500_000)
    // Nobody signed it, so nobody is named as having posted it.
    expect(posted[0].createdById).toBeNull()
  })

  it('running the nightly job twice posts nothing twice', async () => {
    await run()
    const live = await approvals(quiet.id)
    expect(live).toHaveLength(1)
    expect(await revenue(live[0].id)).toHaveLength(1)
    expect(await prisma.orderPosting.count({ where: { source: 'TIMESHEET', sourceId: live[0].id } })).toBe(1)
  })

  it('a week flagged when it was filed is neither signed nor posted by the nightly job', async () => {
    expect(await approvals(flagged.id)).toEqual([])
    const assertionIds = (await prisma.workAssertion.findMany({ where: { timesheetId: flagged.id }, select: { id: true } })).map((a) => a.id)
    expect(assertionIds).toEqual([])
    const sheet = await prisma.timesheet.findUniqueOrThrow({ where: { id: flagged.id } })
    expect(sheet.status).toBe('SUBMITTED')
  })
})
