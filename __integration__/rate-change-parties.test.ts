import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as rateHistory, POST as proposeRate } from '@/app/api/rate-history/route'
import { POST as decideRate } from '@/app/api/rate-history/[id]/approve/route'

/**
 * A rate is a term between two firms, and only those two touch it.
 *
 * Found on 2026-09-29 walking a $66 → $70 pay rise through the seeded
 * world. The rate routes checked the caller's permission and nothing
 * else, and an owner holds every permission at their own firm — so an
 * owner at a firm that had never heard of the placement wrote a rate on
 * somebody else's pay line and got 201, and a third firm approved it
 * and got 200. Both now answer 404 with a sentence, the same as for a
 * line that does not exist.
 *
 * And the worker's own page read the wrong side of the trade: a
 * consultant seat was shown the rate the client is billed for them
 * ($112, and a proposed $117.60), which with their pay beside it is
 * their employer's whole margin. A worker is a party to the line that
 * pays them and to nothing else.
 */

type Seat = { id: string; personId: string; email: string }

let buyId = ''
let payerCompanyId = ''
let sellId = ''
let payer: Seat
let payerSecond: Seat
let client: Seat
let stranger: Seat
let thirdFirm: Seat
let worker: Seat

async function seatWith(companyId: string, perms: string[], notPerson?: string): Promise<Seat | null> {
  const ctxs = await prisma.context.findMany({
    where: { companyId, type: 'EMPLOYEE', role: { isNot: null } },
    include: { role: true, person: true },
    orderBy: { id: 'asc' },
  })
  const c = ctxs.find(
    (x) =>
      x.personId !== notPerson &&
      perms.every((p) => x.role!.permissions.includes(p) || x.role!.permissions.includes('*'))
  )
  return c ? { id: c.id, personId: c.personId, email: c.person.primaryEmail } : null
}

async function newDesk(companyId: string, name: string, email: string, permissions: string[]): Promise<Seat> {
  const role = await prisma.role.create({ data: { companyId, name, permissions } })
  const person = await prisma.person.create({ data: { name, primaryEmail: email } })
  const ctx = await prisma.context.create({
    data: { personId: person.id, companyId, roleId: role.id, type: 'EMPLOYEE', grantReason: 'Rate parties test' },
  })
  return { id: ctx.id, personId: person.id, email }
}

async function call(seat: Seat, fn: any, method: string, url: string, body?: unknown, params?: unknown) {
  as(seat.email)
  const r = req(method, url, body, { 'x-context-id': seat.id })
  return json(params ? await fn(r, { params: Promise.resolve(params) }) : await fn(r))
}

/** Words somebody can act on, and never a permission key. */
function aSentence(message: string) {
  expect(message).toMatch(/[a-z]{3,}\s+[a-z]{2,}\s+[a-z]{2,}/i)
  expect(message).not.toMatch(/\b[a-z]+\.(read|write|cost|approve)\b/)
}

describe('a rate is changed and decided only by the firms it is between', () => {
  beforeAll(async () => {
    await freshWorld()

    // A direct W2: the firm that sells the person also employs them.
    //
    // A live one, picked the same way every run. Unordered and unfiltered,
    // this sometimes landed on an ENDED line, where a rate change is
    // refused for a reason this file is not about.
    const buys = await prisma.buyContract.findMany({
      where: {
        contractType: 'W2', supplierSellContractId: null, state: 'IN_PROGRESS',
        sellLinks: { some: { sellContract: { state: 'IN_PROGRESS' } } },
      },
      include: {
        candidates: true,
        sellLinks: { include: { sellContract: true } },
      },
      orderBy: { id: 'asc' },
    })
    const pick = buys.find(
      (b) =>
        b.candidates.length === 1 &&
        b.sellLinks.some(
          (l) =>
            l.sellContract.state === 'IN_PROGRESS' &&
            l.sellContract.companyId === b.companyId &&
            l.sellContract.clientCompanyId !== b.companyId
        )
    )!
    buyId = pick.id
    payerCompanyId = pick.companyId
    const sell = pick.sellLinks.find((l) => l.sellContract.state === 'IN_PROGRESS' && l.sellContract.companyId === pick.companyId)!.sellContract
    sellId = sell.id
    // A line with no history of its own, so the changes below are the
    // only ones on it.
    await prisma.rateHistory.deleteMany({ where: { contractId: { in: [buyId, sellId] } } })

    payer = (await seatWith(pick.companyId, ['assignments.write', 'consultants.cost']))!
    payerSecond = await newDesk(pick.companyId, 'Contract Manager (rates test)', 'second-desk@rates.etyme.invalid', [
      'rates.read', 'rates.write', 'consultants.cost',
    ])
    client = (await seatWith(sell.clientCompanyId, ['assignments.write']))!

    const others = await prisma.company.findMany({
      where: { id: { notIn: [pick.companyId, sell.clientCompanyId] }, slug: { startsWith: 'world-' } },
      select: { id: true },
    })
    const strangers: Seat[] = []
    for (const f of others) {
      const s = await seatWith(f.id, ['assignments.write', 'consultants.cost'])
      if (s && !strangers.some((x) => x.personId === s.personId)) strangers.push(s)
      if (strangers.length === 2) break
    }
    ;[stranger, thirdFirm] = strangers

    // The person the line pays, in a consultant seat at the firm.
    const personId = pick.candidates[0].personId
    const person = await prisma.person.findUniqueOrThrow({ where: { id: personId } })
    const ctx = await prisma.context.create({
      data: { personId, companyId: pick.companyId, type: 'CONSULTANT', grantReason: 'Rate parties test — the worker' },
    })
    worker = { id: ctx.id, personId, email: person.primaryEmail }
  }, 900_000)

  it('has a pay line, its sell line, and seats at four different firms, or nothing here proves anything', () => {
    expect(buyId).toBeTruthy()
    expect(sellId).toBeTruthy()
    for (const s of [payer, payerSecond, client, stranger, thirdFirm, worker]) expect(s?.id).toBeTruthy()
  })

  it('refuses a firm that is not party to a pay line when it writes a rate on it, and says there is nothing there', async () => {
    const before = await prisma.rateHistory.count({ where: { contractId: buyId } })
    const r = await call(stranger, proposeRate, 'POST', '/api/rate-history', {
      contractType: 'BUY', contractId: buyId, rate: 1, fromDate: '2031-01-01', toDate: '2031-01-02',
    })
    expect(r.status).toBe(404)
    aSentence(r.body.error.message)
    expect(await prisma.rateHistory.count({ where: { contractId: buyId } })).toBe(before)
  })

  it('refuses a firm that is not party to a sell line when it writes a rate on it', async () => {
    const r = await call(stranger, proposeRate, 'POST', '/api/rate-history', {
      contractType: 'SELL', contractId: sellId, rate: 1, fromDate: '2031-01-01',
    })
    expect(r.status).toBe(404)
    aSentence(r.body.error.message)
  })

  it('refuses the client when it writes the pay rate on a line it does not pay', async () => {
    const r = await call(client, proposeRate, 'POST', '/api/rate-history', {
      contractType: 'BUY', contractId: buyId, rate: 1, fromDate: '2031-01-01',
    })
    expect(r.status).toBe(404)
  })

  let proposal = ''

  it('lets the firm that pays a line propose a rise on it', async () => {
    const line = await prisma.buyContractCandidate.findFirstOrThrow({ where: { buyContractId: buyId } })
    const r = await call(payer, proposeRate, 'POST', '/api/rate-history', {
      contractType: 'BUY', contractId: buyId, rate: Math.round(line.payRate * 1.2), fromDate: '2030-01-01',
      reason: 'Review',
    })
    expect(r.status).toBe(201)
    proposal = r.body.data.rateHistory.id
  })

  it('refuses a firm that is not party to the line when it approves a change on it, and the change stays proposed', async () => {
    const r = await call(thirdFirm, decideRate, 'POST', `/api/rate-history/${proposal}/approve`, { action: 'approve' }, { id: proposal })
    expect(r.status).toBe(404)
    aSentence(r.body.error.message)
    const row = await prisma.rateHistory.findUniqueOrThrow({ where: { id: proposal } })
    expect(row.approvalState).toBe('PROPOSED')
  })

  it('refuses the desk that proposed a change when it approves its own', async () => {
    const r = await call(payer, decideRate, 'POST', `/api/rate-history/${proposal}/approve`, { action: 'approve' }, { id: proposal })
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('SELF_APPROVAL')
  })

  it('lets a second desk at the paying firm approve it', async () => {
    const r = await call(payerSecond, decideRate, 'POST', `/api/rate-history/${proposal}/approve`, { action: 'approve', reason: 'agreed' }, { id: proposal })
    expect(r.status).toBe(200)
    expect(r.body.data.approvalState).toBe('APPROVED')
  })

  it('tells the worker the pay line pays that their rate changed, and nobody else', async () => {
    const told = await prisma.notification.findMany({ where: { entityId: proposal } })
    expect(told.map((n) => n.personId)).toEqual([worker.personId])
    expect(told[0].title).toBe('Your pay rate has changed')
    expect(told[0].body).toMatch(/^Your pay rate changes from \$[\d,.]+ to \$[\d,.]+ an hour from /)
  })

  it('lets the client on a sell line propose a change to what it is billed, and the firm selling decide it', async () => {
    const sell = await prisma.sellContract.findUniqueOrThrow({ where: { id: sellId } })
    const p = await call(client, proposeRate, 'POST', '/api/rate-history', {
      contractType: 'SELL', contractId: sellId, rate: Math.round(sell.billRate * 1.2), fromDate: '2030-06-01',
    })
    expect(p.status).toBe(201)
    const id = p.body.data.rateHistory.id
    const d = await call(payer, decideRate, 'POST', `/api/rate-history/${id}/approve`, { action: 'reject', reason: 'Not this year' }, { id })
    expect(d.status).toBe(200)
    expect(d.body.data.approvalState).toBe('REJECTED')
  })

  it('tells no worker when what the client is billed for them changes', async () => {
    const sell = await prisma.sellContract.findUniqueOrThrow({ where: { id: sellId } })
    const p = await call(client, proposeRate, 'POST', '/api/rate-history', {
      contractType: 'SELL', contractId: sellId, rate: Math.round(sell.billRate * 1.2), fromDate: '2031-03-03',
    })
    expect(p.status).toBe(201)
    const id = p.body.data.rateHistory.id
    const d = await call(payer, decideRate, 'POST', `/api/rate-history/${id}/approve`, { action: 'approve', reason: 'agreed' }, { id })
    expect(d.status).toBe(200)
    expect(await prisma.notification.count({ where: { entityId: id } })).toBe(0)
    expect(d.body.data.workerTold).toBeNull()
  })

  it('shows a worker the movements on the line that pays them, and never what the client is billed for them', async () => {
    const r = await call(worker, rateHistory, 'GET', '/api/rate-history')
    expect(r.status).toBe(200)
    const rows: any[] = r.body.data.rateHistory
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(row.contractType).toBe('BUY')
    expect(rows.map((x) => x.contractId)).toContain(buyId)
  })

  it('refuses a worker the rate history of their own sell line, by name or by the whole book', async () => {
    const r = await call(worker, rateHistory, 'GET', `/api/rate-history?contractId=${sellId}&contractType=SELL`)
    expect(r.status).toBe(404)
    aSentence(r.body.error.message)
  })

  it('lets a worker read their own pay line by name', async () => {
    const r = await call(worker, rateHistory, 'GET', `/api/rate-history?contractId=${buyId}&contractType=BUY`)
    expect(r.status).toBe(200)
    expect(r.body.data.rateHistory.length).toBeGreaterThan(0)
  })

  it('refuses a worker a pay line that is not theirs', async () => {
    const other = await prisma.buyContract.findFirstOrThrow({
      where: { id: { not: buyId }, candidates: { none: { personId: worker.personId } } },
    })
    const r = await call(worker, rateHistory, 'GET', `/api/rate-history?contractId=${other.id}&contractType=BUY`)
    expect(r.status).toBe(404)
  })

  it('never lets a worker write a rate, even on the line that pays them', async () => {
    const r = await call(worker, proposeRate, 'POST', '/api/rate-history', {
      contractType: 'BUY', contractId: buyId, rate: 99_999, fromDate: '2032-01-01',
    })
    expect([403, 404]).toContain(r.status)
  })

  // ── The form that changes a rate is offered only where it would work ──

  it('offers the "Change a rate" form the lines the paying firm may change, the pay line and the sell line both', async () => {
    const r = await call(payer, rateHistory, 'GET', '/api/rate-history')
    expect(r.status).toBe(200)
    const lines = r.body.data.changeable.map((l: any) => `${l.contractType}:${l.contractId}`)
    expect(lines).toContain(`BUY:${buyId}`)
    expect(lines).toContain(`SELL:${sellId}`)
  })

  it('offers it to no desk that may only read rates', async () => {
    const reader = await newDesk(payerCompanyId, 'Accounts Receivable (rates test)', 'ar-desk@rates.etyme.invalid', ['rates.read'])
    const r = await call(reader, rateHistory, 'GET', '/api/rate-history')
    expect(r.status).toBe(200)
    expect(r.body.data.changeable).toEqual([])
  })

  it('never offers a pay line to a desk that cannot read what people cost', async () => {
    const am = await newDesk(payerCompanyId, 'Account Manager (rates test)', 'am-desk@rates.etyme.invalid', ['rates.read', 'assignments.write'])
    const r = await call(am, rateHistory, 'GET', '/api/rate-history')
    const types = new Set(r.body.data.changeable.map((l: any) => l.contractType))
    expect(types.has('BUY')).toBe(false)
    expect(types.has('SELL')).toBe(true)
  })

  it('offers a worker nothing to change, on the line that pays them or anywhere else', async () => {
    const r = await call(worker, rateHistory, 'GET', '/api/rate-history')
    expect(r.body.data.changeable ?? []).toEqual([])
  })
})
