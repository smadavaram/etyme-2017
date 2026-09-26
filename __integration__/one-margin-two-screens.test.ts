import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'

import { GET as profitability } from '@/app/api/profitability/route'

/**
 * One firm, one margin, however many screens ask.
 *
 * ── The finding this walk holds ───────────────────────────────────────
 *
 * Walked as Teleworld Solutions on a freshly seeded world, 2026-09-26. A
 * systems integrator with two placements read two different answers to
 * one question on two entries of one menu:
 *
 *   /dashboard/reports        AVG MARGIN 10.1%, ACTIVE REVENUE $41,280
 *   /dashboard/profitability  nothing at all
 *
 * Both were wrong.
 *
 * **Profitability** grouped strictly by `projectOrderId`. Teleworld has
 * tagged nothing to a master contract — which CLAUDE.md says is the normal
 * case, the roll-up being optional by design — so every line fell out of
 * the grouping and the page said "Nothing has been posted". The product's
 * stated design is that a pair is always there, written by the award, and
 * the roll-up sometimes is; the screen was built the other way round.
 *
 * **Reports** took the mean of every active sell rate less the mean of
 * every active buy rate. For a GSI, `payerScope` returns
 * `OR: [companyId, clientCompanyId]` — correctly, because a prime both
 * sells and buys — so the sell list contained its own supplier's line
 * billing *it*, and that line's rate went into its own revenue and its own
 * denominator. Hand-derived: (14200 + 11600) / 2 = 12900; 12900 − 11600 =
 * 1300; 1300 / 12900 = 10.077%, which is the 10.1% on the screen, and
 * 25800 / 100 x 160 = $41,280, which is the revenue. The one live
 * consultant was counted at both rungs of one chain.
 *
 * The true figures are 18.3% and $22,720, and both screens read them from
 * this route now.
 */

const CLIENT = 'program@corveldt.invalid'
const GSI = 'delivery@teleworld.invalid'
const SUB = 'owner@nimbus.invalid'

const co = { corveldt: '', teleworld: '', nimbus: '' }
const who = { pm: '', sunil: '', nimbusLead: '', marcus: '', karthik: '', unpaired: '' }
const it_ = { marcusSell: '', karthikSell: '', unpairedSell: '', master: '' }

async function company(name: string, slug: string, kind: any, email: string) {
  const c = await prisma.company.create({
    data: { name, slug, kind, currency: 'USD', defaultPaymentTerms: 45, templatePack: 'US_IT' },
  })
  const role = await prisma.role.create({
    data: { companyId: c.id, name: 'Owner', permissions: ['*'], isDefault: true },
  })
  const p = await prisma.person.create({ data: { name: `${name} lead`, primaryEmail: email } })
  await prisma.context.create({
    data: { personId: p.id, companyId: c.id, roleId: role.id, type: 'EMPLOYEE', grantReason: 'margin walk' },
  })
  return { companyId: c.id, personId: p.id, roleId: role.id }
}

async function worker(name: string, email: string, employerId: string, roleId: string) {
  const p = await prisma.person.create({ data: { name, primaryEmail: email } })
  await prisma.context.create({
    data: { personId: p.id, companyId: employerId, roleId, type: 'EMPLOYEE', grantReason: 'Delivery' },
  })
  return p.id
}

/** A placement: the sell line, the buy line that funds it, and the link. */
async function placement(o: {
  sellerId: string
  clientId: string
  personId: string
  billRate: number
  payRate: number
  vendorCompanyId: string | null
  contractType: 'W2' | 'C2C'
  state: 'IN_PROGRESS' | 'ENDED'
  start: Date
  end: Date
  /** Left unlinked on purpose, to prove a gap is named rather than dropped. */
  link?: boolean
  projectOrderId?: string | null
}) {
  const engagement = await prisma.engagement.create({
    data: { msaId: null, title: 'Avionics software assurance', invoiceCycle: 'MONTHLY' },
  })
  const sell = await prisma.sellContract.create({
    data: {
      companyId: o.sellerId, clientCompanyId: o.clientId, personId: o.personId,
      engagementId: engagement.id, billRate: o.billRate, billCurrency: 'USD',
      state: o.state, startDate: o.start, endDate: o.end,
      projectOrderId: o.projectOrderId ?? null,
    },
  })
  const buy = await prisma.buyContract.create({
    data: {
      companyId: o.sellerId, vendorCompanyId: o.vendorCompanyId,
      contractType: o.contractType, payCurrency: 'USD',
      state: o.state, startDate: o.start, endDate: o.end,
      projectOrderId: o.projectOrderId ?? null,
      candidates: {
        create: { personId: o.personId, payRate: o.payRate, payCurrency: 'USD', startDate: o.start, endDate: o.end },
      },
    },
  })
  if (o.link !== false) {
    await prisma.contractLink.create({
      data: { sellContractId: sell.id, buyContractId: buy.id, effectiveFrom: o.start, effectiveTo: o.end },
    })
  }
  return { sellId: sell.id, buyId: buy.id }
}

const ask = async (query: string) =>
  json(await profitability(req('GET', `/api/profitability?${query}`)))

beforeAll(async () => {
  await resetDatabase()

  const corveldt = await company('Corveldt Aerospace', 'corveldt-aerospace', 'CLIENT', CLIENT)
  co.corveldt = corveldt.companyId
  who.pm = corveldt.personId

  const teleworld = await company('Teleworld Solutions', 'teleworld-solutions', 'GSI', GSI)
  co.teleworld = teleworld.companyId
  who.sunil = teleworld.personId

  const nimbus = await company('Nimbus Talent', 'nimbus-talent', 'VENDOR', SUB)
  co.nimbus = nimbus.companyId
  who.nimbusLead = nimbus.personId

  who.marcus = await worker('Marcus Whitfield', 'marcus@nimbus.invalid', co.nimbus, nimbus.roleId)
  who.karthik = await worker('Karthik Menon', 'karthik@teleworld.invalid', co.teleworld, teleworld.roleId)
  who.unpaired = await worker('Aditi Ramaswamy', 'aditi@teleworld.invalid', co.teleworld, teleworld.roleId)

  // Marcus: bought from a sub-vendor, running. $142 billed, $116 paid.
  const marcus = await placement({
    sellerId: co.teleworld, clientId: co.corveldt, personId: who.marcus,
    billRate: 14_200, payRate: 11_600, vendorCompanyId: co.nimbus,
    contractType: 'C2C', state: 'IN_PROGRESS',
    start: new Date('2026-06-28'), end: new Date('2027-06-28'),
  })
  it_.marcusSell = marcus.sellId

  // Karthik: Teleworld's own W2, finished. $136 billed, $89 paid.
  const karthik = await placement({
    sellerId: co.teleworld, clientId: co.corveldt, personId: who.karthik,
    billRate: 13_600, payRate: 8_900, vendorCompanyId: null,
    contractType: 'W2', state: 'ENDED',
    start: new Date('2025-11-30'), end: new Date('2026-09-05'),
  })
  it_.karthikSell = karthik.sellId

  // ── And the line Teleworld BUYS, which is Nimbus's to sell ──────────
  //
  // Nimbus's own sell contract, billing Teleworld for Marcus at $116. It
  // is on the list `/api/contracts?side=sell` serves Teleworld, because a
  // GSI is a party to both sides of its placements. It is Teleworld's
  // cost, and this walk exists partly to prove it is never its revenue.
  const nimbusEngagement = await prisma.engagement.create({
    data: { msaId: null, title: 'Marcus Whitfield to Teleworld', invoiceCycle: 'MONTHLY' },
  })
  await prisma.sellContract.create({
    data: {
      companyId: co.nimbus, clientCompanyId: co.teleworld, personId: who.marcus,
      engagementId: nimbusEngagement.id, billRate: 11_600, billCurrency: 'USD',
      state: 'IN_PROGRESS', startDate: new Date('2026-06-28'), endDate: new Date('2027-06-28'),
    },
  })
})

describe('a firm that has tagged nothing to a master contract still sees its margins', () => {
  it('a firm sees the margin on a placement it never tagged to anything', async () => {
    as(GSI)
    const { status, body } = await ask('by=order')
    expect(status).toBe(200)

    // Nothing was tagged, so there is no ProjectOrder anywhere.
    expect(await prisma.projectOrder.count()).toBe(0)
    // And the page is not empty.
    expect(body.data.rows.length).toBeGreaterThan(0)
    expect(body.data.source).toBe('PAIRS')
    expect(body.data.untagged).toBeGreaterThan(0)
  })

  it('a placement not on a master contract is told that is nobody’s problem, not that nothing has posted', async () => {
    as(GSI)
    const { body } = await ask('by=order')
    expect(body.data.note).not.toMatch(/Nothing has been posted/i)
    expect(body.data.rows.every((r: any) => r.tagged === false)).toBe(true)
  })

  it('the margin on one placement is its own bill rate less the pay rate of the buy line that funds it', async () => {
    as(GSI)
    const { body } = await ask('by=order')
    const marcus = body.data.rows
      .flatMap((r: any) => r.placements)
      .find((p: any) => p.person.name === 'Marcus Whitfield')

    // $142 billed, $116 paid, 26 dollars on 142. Derived by hand: 2600 /
    // 14200 = 18.3099%, which rounds to 18.3.
    expect(marcus.agreed.billRateCents).toBe(14_200)
    expect(marcus.agreed.payRateCents).toBe(11_600)
    expect(marcus.agreed.spreadRateCents).toBe(2_600)
    expect(marcus.agreed.pct).toBe(18.3)
  })

  it('a placement tagged to a master contract reads under that master contract, and once', async () => {
    const order = await prisma.projectOrder.create({
      data: {
        companyId: co.teleworld, clientCompanyId: co.corveldt,
        code: 'MC-AVIONICS', name: 'Corveldt avionics program',
        kind: 'TIME_AND_MATERIALS', currency: 'USD', status: 'OPEN',
      },
    })
    it_.master = order.id
    await prisma.sellContract.update({
      where: { id: it_.marcusSell },
      data: { projectOrderId: order.id },
    })

    as(GSI)
    const { body } = await ask('by=order')
    const tagged = body.data.rows.filter((r: any) => r.tagged)
    expect(tagged).toHaveLength(1)
    expect(tagged[0].name).toBe('Corveldt avionics program')
    expect(tagged[0].code).toBe('MC-AVIONICS')

    // Once, not twice: Marcus appears under the master contract and
    // nowhere else.
    const everywhere = body.data.rows
      .flatMap((r: any) => r.placements)
      .filter((p: any) => p.person.name === 'Marcus Whitfield')
    expect(everywhere).toHaveLength(1)

    // And the untagged one is still its own row, because a company that
    // tags one line has not agreed to tag the rest.
    expect(body.data.rows.filter((r: any) => !r.tagged)).toHaveLength(1)

    await prisma.sellContract.update({ where: { id: it_.marcusSell }, data: { projectOrderId: null } })
    await prisma.projectOrder.delete({ where: { id: order.id } })
  })
})

describe('two screens on one menu do not disagree about one firm’s margin', () => {
  it('the figure the reports page shows is the figure this route computed, to the decimal', async () => {
    as(GSI)
    const book = (await ask('by=book&scope=live')).body.data
    const order = (await ask('by=order&scope=live')).body.data

    expect(book.agreed.pct).toBe(18.3)
    expect(order.agreed.pct).toBe(book.agreed.pct)
    expect(order.agreed.totalBillRateCents).toBe(book.agreed.totalBillRateCents)
  })

  it('a prime’s revenue counts the lines it sells and never the line its own supplier sells to it', async () => {
    as(GSI)
    const { body } = await ask('by=book&scope=live')

    // Nimbus's $116/hr line billing Teleworld exists and is live.
    const nimbusLine = await prisma.sellContract.findFirst({
      where: { companyId: co.nimbus, clientCompanyId: co.teleworld },
    })
    expect(nimbusLine).not.toBeNull()

    // One live placement at $142/hr, which is $22,720 a month at 160
    // hours — not the $41,280 the Reports page read from 14200 + 11600.
    expect(body.data.revenue.placements).toBe(1)
    expect(body.data.revenue.totalBillRateCents).toBe(14_200)
    expect(body.data.revenue.monthlyCents).toBe(2_272_000)
    expect(body.data.revenue.monthlyCents).not.toBe(4_128_000)
  })

  it('the placement count a screen prints is placements, so one consultant in a chain is one and not two', async () => {
    as(GSI)
    const { body } = await ask('by=book&scope=live')
    expect(body.data.pipeline.total).toBe(2)
    expect(body.data.pipeline.counts.IN_PROGRESS).toBe(1)
    expect(body.data.pipeline.counts.ENDED).toBe(1)
  })
})

describe('a placement with no buy line behind it says so rather than being left out', () => {
  beforeAll(async () => {
    const unpaired = await placement({
      sellerId: co.teleworld, clientId: co.corveldt, personId: who.unpaired,
      billRate: 15_000, payRate: 9_000, vendorCompanyId: null,
      contractType: 'W2', state: 'IN_PROGRESS',
      start: new Date('2026-08-03'), end: new Date('2027-08-03'),
      link: false,
    })
    it_.unpairedSell = unpaired.sellId
  })

  it('a sell line the award never linked is on the list, named, with the reason', async () => {
    as(GSI)
    const { body } = await ask('by=order')
    const rows = body.data.rows.flatMap((r: any) => r.placements)
    const aditi = rows.find((p: any) => p.person.name === 'Aditi Ramaswamy')

    expect(aditi).toBeDefined()
    expect(aditi.buyContractId).toBeNull()
    expect(aditi.agreed.pct).toBeNull()
    expect(aditi.agreed.refusedBecause).toMatch(/no buy line/i)
    expect(body.data.unlinked).toBe(1)
  })

  it('one unlinked placement blanks the rate on the whole book rather than being averaged in', async () => {
    as(GSI)
    const { body } = await ask('by=book')
    expect(body.data.agreed.pct).toBeNull()
    expect(body.data.agreed.unpriced).toBe(1)
    expect(body.data.agreed.refusedBecause).toMatch(/no buy line/i)
  })

  it('and it is still counted as revenue, because revenue does not need a cost', async () => {
    as(GSI)
    const { body } = await ask('by=book')
    // $142 + $136 + $150 an hour across three placements to date.
    expect(body.data.revenue.totalBillRateCents).toBe(42_800)
    expect(body.data.revenue.withoutCost).toBe(1)
    expect(body.data.revenue.says).toMatch(/no buy line/i)
  })

  it('a hundred per cent margin is never shown, because it is always a missing link', async () => {
    as(GSI)
    const { body } = await ask('by=order')
    const every = body.data.rows.flatMap((r: any) => r.placements)
    expect(every.some((p: any) => p.agreed.pct === 100)).toBe(false)
  })
})

describe('a figure says whether it counts work that has finished', () => {
  it('a book read to date includes a placement that has ended, and says so', async () => {
    as(GSI)
    const { body } = await ask('by=order&scope=all')
    expect(body.data.scope).toBe('all')
    expect(body.data.scopeSays).toMatch(/finished work included/i)
    const names = body.data.rows.flatMap((r: any) => r.placements).map((p: any) => p.person.name)
    expect(names).toContain('Karthik Menon')
  })

  it('a book read live leaves the finished placement out, and says that instead', async () => {
    as(GSI)
    const { body } = await ask('by=order&scope=live')
    expect(body.data.scope).toBe('live')
    expect(body.data.scopeSays).toMatch(/running now only/i)
    const names = body.data.rows.flatMap((r: any) => r.placements).map((p: any) => p.person.name)
    expect(names).not.toContain('Karthik Menon')
    expect(names).toContain('Marcus Whitfield')
  })

  it('the candidate view honours the same scope, so nobody whose placement ended appears under running now', async () => {
    as(GSI)
    const live = (await ask('by=candidate&scope=live')).body.data
    expect(live.rows.map((r: any) => r.person.name)).not.toContain('Karthik Menon')

    const all = (await ask('by=candidate&scope=all')).body.data
    expect(all.rows.map((r: any) => r.person.name)).toContain('Karthik Menon')
  })

  it('a finished placement still knows what it cost, however the book is scoped', async () => {
    // Cost is a fact about a placement, not about the reader's scope.
    // Reading it through the scoped set made an ENDED placement report
    // "no cost on record" the moment somebody asked for live-only.
    as(GSI)
    const { body } = await ask('by=contract&scope=live')
    const karthik = body.data.rows.find((r: any) => r.person.name === 'Karthik Menon')
    expect(karthik).toBeUndefined()

    const all = (await ask('by=contract&scope=all')).body.data
    const his = all.rows.find((r: any) => r.person.name === 'Karthik Menon')
    expect(his.profit.costUnknown).toBe(false)
    expect(his.agreed.payRateCents).toBe(8_900)
  })
})

describe('what a placement cost belongs to that placement and to no other', () => {
  it('a consultant with two placements is priced from the buy line of each, never from whichever came last', async () => {
    // Karthik again, at a different rate on a second engagement. Paired by
    // person this handed one placement's pay rate to the other; paired by
    // `ContractLink` each reads its own.
    const second = await placement({
      sellerId: co.teleworld, clientId: co.corveldt, personId: who.karthik,
      billRate: 15_800, payRate: 10_400, vendorCompanyId: null,
      contractType: 'W2', state: 'IN_PROGRESS',
      start: new Date('2026-09-20'), end: new Date('2027-09-20'),
    })

    as(GSI)
    const { body } = await ask('by=order&scope=all')
    const his = body.data.rows
      .flatMap((r: any) => r.placements)
      .filter((p: any) => p.person.name === 'Karthik Menon')

    expect(his).toHaveLength(2)
    expect(his.map((p: any) => p.agreed.payRateCents).sort((a: number, b: number) => a - b))
      .toEqual([8_900, 10_400])
    expect(his.map((p: any) => p.agreed.billRateCents).sort((a: number, b: number) => a - b))
      .toEqual([13_600, 15_800])

    await prisma.contractLink.deleteMany({ where: { sellContractId: second.sellId } })
    await prisma.buyContractCandidate.deleteMany({ where: { buyContractId: second.buyId } })
    await prisma.buyContract.delete({ where: { id: second.buyId } })
    const sell = await prisma.sellContract.findUnique({ where: { id: second.sellId } })
    await prisma.sellContract.delete({ where: { id: second.sellId } })
    if (sell?.engagementId) await prisma.engagement.delete({ where: { id: sell.engagementId } })
  })
})

describe('who may read a margin at all', () => {
  it('a seat without margin.read is refused in a sentence rather than shown a blank', async () => {
    const recruiterRole = await prisma.role.create({
      data: {
        companyId: co.teleworld, name: 'Recruiter',
        // Everything a recruiter does, and deliberately not the money.
        permissions: ['submissions.write', 'requirements.read', 'consultants.read'],
      },
    })
    const p = await prisma.person.create({
      data: { name: 'Ravi Kulkarni', primaryEmail: 'ravi@teleworld.invalid' },
    })
    await prisma.context.create({
      data: { personId: p.id, companyId: co.teleworld, roleId: recruiterRole.id, type: 'EMPLOYEE', grantReason: 'Recruiting' },
    })

    as('ravi@teleworld.invalid')
    const { status, body } = await ask('by=book')
    expect(status).toBe(403)
    expect(body.error.message).toMatch(/cannot see what placements earn/i)
  })
})
