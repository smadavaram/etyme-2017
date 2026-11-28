import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { req, json, resetDatabase, prisma } from './harness'
import { GET as autoApprove } from '@/app/api/cron/auto-approve/route'

/**
 * Approval by silence is the client's term, read off the order the client
 * itself issued.
 *
 * Found by demand on 2026-09-29: `cron/auto-approve` read the term off the
 * order on the contract the hours are filed on. On a direct placement
 * that is the client's order. In a chain it is the prime's order to its
 * sub — so the client's own term was never read for a chain week, and a
 * prime switching the setting on for its sub's order wrote the END
 * CLIENT's approval by silence, at the sub's rate. The job now walks the
 * week up to the rung the client pays and reads that rung's order, only
 * where the client issued it.
 */

const DAY = 86_400_000
const ago = (n: number) => new Date(Date.now() - n * DAY)
const SECRET = 'silence-is-the-clients'
let secretBefore: string | undefined

let n = 0
const tag = () => `${++n}`.padStart(3, '0')

async function firm(name: string, kind: 'CLIENT' | 'VENDOR') {
  const slug = `${name.toLowerCase().replace(/[^a-z]+/g, '-')}-${tag()}`
  return prisma.company.create({ data: { name, slug, kind, domain: `${slug}.example` } })
}

async function order(issuedById: string, issuedToId: string, silence: boolean) {
  return prisma.workOrder.create({
    data: {
      number: `PO-${tag()}`, issuedById, issuedToId, recordedById: issuedById,
      amount: 100_000, currency: 'USD', status: 'OPEN', startDate: ago(120),
      autoApproveTimesheets: silence, approvalWindowDays: silence ? 5 : null,
    },
  })
}

async function line(input: {
  seller: string; buyer: string; endClient?: string; personId: string; billRate: number; orderId: string | null
}) {
  return prisma.sellContract.create({
    data: {
      companyId: input.seller, clientCompanyId: input.buyer, endClientCompanyId: input.endClient ?? null,
      personId: input.personId, billRate: input.billRate, startDate: ago(120), state: 'IN_PROGRESS',
      workOrderId: input.orderId,
    },
  })
}

/** A week filed twelve days ago on this contract, that nobody has signed. */
async function week(sellContractId: string, personId: string) {
  return prisma.timesheet.create({
    data: {
      sellContractId, personId, periodStart: ago(16), periodEnd: ago(12), days: {}, totalHours: 40,
      status: 'SUBMITTED', submittedAt: ago(12),
    },
  })
}

/**
 * A client buys a person from a prime, who buys her from a sub. The week
 * is filed on the sub's contract, as a chain week is.
 */
async function chain(silence: { clients: boolean; primes: boolean }, opts: { topIssuedByPrime?: boolean; twoTops?: boolean } = {}) {
  const client = await firm('Harrowgate Freight', 'CLIENT')
  const prime = await firm('Tern Staffing', 'VENDOR')
  const sub = await firm('Pell Contract Labor', 'VENDOR')
  const person = await prisma.person.create({ data: { name: `Dana Okoro ${tag()}`, primaryEmail: `dana.${tag()}@pell.example` } })
  const clientsOrder = await order(opts.topIssuedByPrime ? prime.id : client.id, prime.id, silence.clients)
  const top = await line({ seller: prime.id, buyer: client.id, personId: person.id, billRate: 15_000, orderId: clientsOrder.id })
  if (opts.twoTops) await line({ seller: prime.id, buyer: client.id, personId: person.id, billRate: 14_000, orderId: clientsOrder.id })
  const primesOrder = await order(prime.id, sub.id, silence.primes)
  const bottom = await line({ seller: sub.id, buyer: prime.id, endClient: client.id, personId: person.id, billRate: 11_000, orderId: primesOrder.id })
  const sheet = await week(bottom.id, person.id)
  return { client, prime, sub, top, bottom, sheet }
}

let primeOnly: Awaited<ReturnType<typeof chain>>
let clientsTerm: Awaited<ReturnType<typeof chain>>
let ambiguous: Awaited<ReturnType<typeof chain>>
let notTheClients: Awaited<ReturnType<typeof chain>>
let direct: { client: { id: string }; supplier: { id: string }; sheet: { id: string } }

beforeAll(async () => {
  await resetDatabase()
  secretBefore = process.env.CRON_SECRET
  process.env.CRON_SECRET = SECRET

  primeOnly = await chain({ clients: false, primes: true })
  clientsTerm = await chain({ clients: true, primes: false })
  ambiguous = await chain({ clients: true, primes: true }, { twoTops: true })
  notTheClients = await chain({ clients: true, primes: false }, { topIssuedByPrime: true })

  const client = await firm('Cavell Mills', 'CLIENT')
  const supplier = await firm('Wrenhollow Staffing', 'VENDOR')
  const person = await prisma.person.create({ data: { name: 'Ines Varga', primaryEmail: `ines.${tag()}@wrenhollow.example` } })
  const o = await order(client.id, supplier.id, true)
  const c = await line({ seller: supplier.id, buyer: client.id, personId: person.id, billRate: 12_500, orderId: o.id })
  direct = { client, supplier, sheet: await week(c.id, person.id) }

  const r = await json(await autoApprove(req('GET', '/api/cron/auto-approve', undefined, { authorization: `Bearer ${SECRET}` })))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
}, 900_000)

afterAll(() => {
  if (secretBefore === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = secretBefore
})

const approvals = (timesheetId: string) =>
  prisma.workAssertion.findMany({ where: { timesheetId, role: 'CLIENT_APPROVAL', state: 'LIVE' } })

describe('approval by silence is the client’s term, on the order the client issued', () => {
  it('a prime’s silence setting on its sub’s order never approves a week for the end client', async () => {
    expect(await approvals(primeOnly.sheet.id)).toEqual([])
    const sheet = await prisma.timesheet.findUniqueOrThrow({ where: { id: primeOnly.sheet.id } })
    expect(sheet.status).toBe('SUBMITTED')
    expect(sheet.clientApprovedAt).toBeNull()
  })

  it('the client’s own silence term, on the order it issued to the top of the chain, approves a chain week once its window has passed', async () => {
    const [approval] = await approvals(clientsTerm.sheet.id)
    expect(approval.companyId).toBe(clientsTerm.client.id)
    expect(approval.auto).toBe(true)
    expect(approval.byId).toBeNull()
    const sheet = await prisma.timesheet.findUniqueOrThrow({ where: { id: clientsTerm.sheet.id } })
    expect(sheet.clientApprovedAt).not.toBeNull()
    expect(sheet.autoApproved).toBe(true)
    expect(sheet.clientApprovedById).toBeNull()
  })

  it('an approval by silence carries the rate the client is billed, never the rate a sub-supplier bills its prime', async () => {
    const [approval] = await approvals(clientsTerm.sheet.id)
    expect(approval.rateCents).toBe(clientsTerm.top.billRate)
    expect(approval.rateCents).not.toBe(clientsTerm.bottom.billRate)
  })

  it('the approval by silence is written down against the supplier the client’s order is to', async () => {
    const log = await prisma.automationLog.findFirstOrThrow({
      where: { action: 'TIMESHEET_AUTO_APPROVED', payload: { path: ['timesheetId'], equals: clientsTerm.sheet.id } },
    })
    expect(log.companyId).toBe(clientsTerm.prime.id)
    expect(log.reversible).toBe(true)
  })

  it('where two contracts above the week cover the same days, silence approves nothing, because no single order is the client’s term', async () => {
    expect(await approvals(ambiguous.sheet.id)).toEqual([])
  })

  it('an order on the client’s rung that some other firm issued is not the client’s term', async () => {
    expect(await approvals(notTheClients.sheet.id)).toEqual([])
  })

  it('on a direct placement the client’s order on the week’s own contract is still the term', async () => {
    const [approval] = await approvals(direct.sheet.id)
    expect(approval.companyId).toBe(direct.client.id)
    expect(approval.rateCents).toBe(12_500)
    expect(approval.auto).toBe(true)
  })
})
