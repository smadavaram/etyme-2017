import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { ensureDefaultRoles } from '@/lib/company-roles'

import { GET as burn } from '@/app/api/bench/burn/route'
import { GET as progression } from '@/app/api/consultants/[id]/rate-progression/route'
import { GET as myWork } from '@/app/api/me/work/route'
import { GET as myBenches } from '@/app/api/me/benches/route'

/**
 * The bench's doors onto a pay rate, walked on the seeded world.
 *
 * Karthik Menon is a delivery engineer on Teleworld Solutions' own
 * payroll. His seat reads assignments and timesheets and nothing about
 * money, so he must not read what Teleworld pays a colleague — not from
 * the bench burn and not from the colleague's rate history — and must go
 * on reading his own pay on his own work page.
 */

type Seat = { id: string; personId: string; email: string }

let teleworldId = ''
let karthik: Seat
let payroll: Seat
let delivery: Seat
let colleagueProfileId = ''
let colleagueId = ''

async function call(seat: Seat, fn: any, url: string, params?: unknown) {
  as(seat.email)
  const r = req('GET', url, undefined, { 'x-context-id': seat.id })
  return json(params ? await fn(r, { params }) : await fn(r))
}

async function seatAt(companyId: string, name: string): Promise<Seat> {
  const c = await prisma.context.findFirstOrThrow({
    where: { companyId, type: 'EMPLOYEE', person: { name } },
    include: { person: true },
  })
  return { id: c.id, personId: c.personId, email: c.person.primaryEmail }
}

async function seatAs(roleName: string, name: string, email: string): Promise<Seat> {
  const role = await prisma.role.findFirstOrThrow({ where: { companyId: teleworldId, name: roleName } })
  const who = await prisma.person.create({ data: { name, primaryEmail: email } })
  const ctx = await prisma.context.create({
    data: { personId: who.id, companyId: teleworldId, roleId: role.id, type: 'EMPLOYEE', grantReason: 'supply pay-doors walk' },
  })
  return { id: ctx.id, personId: who.id, email }
}

const PAY_TRAIL = (actor: string, subject: string, allowed: boolean) =>
  prisma.accessLog.count({
    where: { actorPersonId: actor, subjectId: subject, action: 'PAYROLL_VIEW', allowed },
  })

describe("a colleague's pay at Teleworld is read by the payroll desk, and a worker still reads their own", () => {
  beforeAll(async () => {
    await freshWorld()

    const teleworld = await prisma.company.findFirstOrThrow({ where: { name: 'Teleworld Solutions' } })
    teleworldId = teleworld.id
    karthik = await seatAt(teleworldId, 'Karthik Menon')

    // Teleworld seats neither desk on the seeded world, so each is seated
    // here under the GSI's own default role.
    await ensureDefaultRoles(teleworldId, 'GSI')
    // The default AP & Payroll desk reads pay but not the consultant
    // register, and both routes ask for the register first. So the payroll
    // desk here is the one a firm widens to both — AP & Payroll's own
    // permissions plus consultants.read — and still without the price
    // desk's margin.read.
    const ap = await prisma.role.findFirstOrThrow({ where: { companyId: teleworldId, name: 'AP & Payroll' } })
    await prisma.role.create({
      data: {
        companyId: teleworldId, name: 'Payroll Lead',
        permissions: [...new Set([...ap.permissions, 'consultants.read'])],
      },
    })
    payroll = await seatAs('Payroll Lead', 'Teleworld Payroll', 'payroll@teleworld-supply-walk.invalid')
    delivery = await seatAs('Delivery Manager', 'Teleworld Delivery', 'delivery@teleworld-supply-walk.invalid')

    // A colleague Teleworld pays, with a consultant profile to open.
    const line = await prisma.buyContractCandidate.findFirstOrThrow({
      where: {
        personId: { not: karthik.personId },
        payRate: { gt: 0 },
        buyContract: { companyId: teleworldId, state: { in: ['IN_PROGRESS', 'ENDED', 'PAUSED'] } },
      },
    })
    colleagueId = line.personId
    const profile = await prisma.consultantProfile.upsert({
      where: { personId: colleagueId },
      update: {},
      create: { personId: colleagueId, skills: [] },
    })
    colleagueProfileId = profile.id
  }, 900_000)

  it('a delivery engineer is refused the bench burn in a sentence that names the desks and never the permission key', async () => {
    const r = await call(karthik, burn, '/api/bench/burn')
    expect(r.status).toBe(403)
    expect(r.body.error.message).not.toMatch(/consultants\.|Requires/)
    expect(r.body.error.message).toMatch(/Teleworld Solutions/)
  })

  it("a delivery engineer cannot read a colleague's rate history at all", async () => {
    const r = await call(karthik, progression, `/api/consultants/${colleagueProfileId}/rate-progression`, { id: colleagueProfileId })
    expect(r.status).toBe(403)
    expect(r.body.error.message).not.toMatch(/consultants\.read/)
  })

  it("a delivery manager who reads consultants sees a colleague's rate history with the pay withheld and a sentence saying who reads it", async () => {
    const r = await call(delivery, progression, `/api/consultants/${colleagueProfileId}/rate-progression`, { id: colleagueProfileId })
    expect(r.status).toBe(200)
    const points = r.body.data.progression as any[]
    expect(points.length).toBeGreaterThan(0)
    for (const p of points) {
      expect(p.payRate).toBeNull()
      expect(p.margin).toBeNull()
    }
    expect(r.body.data.summary.currentRate).toBeNull()
    expect(r.body.data.payWithheldSays).toMatch(/AP & Payroll/)
  })

  it("the withheld pay on a colleague's rate history is a refusal on the access trail", async () => {
    expect(await PAY_TRAIL(delivery.personId, colleagueId, false)).toBeGreaterThan(0)
    expect(await PAY_TRAIL(delivery.personId, colleagueId, true)).toBe(0)
  })

  it("the payroll desk reads a colleague's pay on the rate history, never the bill rate or the margin, and the read is on the trail", async () => {
    const r = await call(payroll, progression, `/api/consultants/${colleagueProfileId}/rate-progression`, { id: colleagueProfileId })
    expect(r.status).toBe(200)
    const points = r.body.data.progression as any[]
    expect(points.length).toBeGreaterThan(0)
    expect(points.some((p) => typeof p.payRate === 'number' && p.payRate > 0)).toBe(true)
    for (const p of points) {
      expect(p.billRate).toBeNull()
      expect(p.margin).toBeNull()
      expect(p.marginPercent).toBeNull()
    }
    expect(r.body.data.payWithheldSays).toBeNull()
    expect(await PAY_TRAIL(payroll.personId, colleagueId, true)).toBeGreaterThan(0)
  })

  it('a desk that reads pay sees the bench burn, and everybody on it is on the access trail as read', async () => {
    // Teleworld keeps no paid bench on the seeded world; CloudEPA does.
    const cloud = await prisma.company.findFirstOrThrow({ where: { name: 'CloudEPA' } })
    await ensureDefaultRoles(cloud.id, cloud.kind as any)
    const owner = await prisma.role.findFirstOrThrow({ where: { companyId: cloud.id, name: 'Owner' } })
    const who = await prisma.person.create({ data: { name: 'CloudEPA Owner Walk', primaryEmail: 'owner@cloudepa-supply-walk.invalid' } })
    const ctx = await prisma.context.create({
      data: { personId: who.id, companyId: cloud.id, roleId: owner.id, type: 'EMPLOYEE', grantReason: 'supply pay-doors walk' },
    })
    const seat = { id: ctx.id, personId: who.id, email: who.primaryEmail }

    // Everybody CloudEPA pays on the seeded world is placed and billing,
    // which costs the bench nothing (burn reads `burnOf` since the bench
    // tester, 2026-09-30, found Helena Marsh counted as $66k of burn while
    // on site at Northbend). So one person is put on its paid bench here:
    // listed, paid, and on no placement.
    const sitter = await prisma.person.create({ data: { name: 'Bench Sitter Walk', primaryEmail: 'sitter@cloudepa-supply-walk.invalid' } })
    const profile = await prisma.consultantProfile.create({ data: { personId: sitter.id, skills: ['ERP finance'] } })
    await prisma.benchListing.create({
      data: { consultantId: profile.id, companyId: cloud.id, tier: 'RETAINED', state: 'GRANTED', grantedAt: new Date(Date.now() - 20 * 86_400_000) },
    })
    const paid = await prisma.buyContract.create({
      data: { companyId: cloud.id, contractType: 'W2', state: 'BENCH_PAID', startDate: new Date(Date.now() - 20 * 86_400_000) },
    })
    await prisma.buyContractCandidate.create({ data: { buyContractId: paid.id, personId: sitter.id, payRate: 6_000, state: 'ACTIVE', startDate: new Date(Date.now() - 20 * 86_400_000) } })

    const r = await call(seat, burn, '/api/bench/burn')
    expect(r.status).toBe(200)
    const entries = r.body.data.entries as any[]
    expect(entries.map((e) => e.personName)).toContain('Bench Sitter Walk')
    // Somebody placed and billing is never counted as bench burn.
    expect(entries.map((e) => e.personName)).not.toContain('Helena Marsh')
    const sat = entries.find((e) => e.personName === 'Bench Sitter Walk')
    expect(sat.dailyCents).toBe(6_000 * 8)
    expect(sat.toDateCents).toBe(sat.dailyCents * sat.workingDays)
    for (const e of entries) {
      expect(await PAY_TRAIL(seat.personId, e.personId, true), e.personName).toBeGreaterThan(0)
    }
  })

  it('Karthik Menon still reads his own pay on his own work page', async () => {
    const r = await call(karthik, myWork, '/api/me/work')
    expect(r.status).toBe(200)
    const rates = JSON.stringify(r.body.data)
    // At least one of his own placements carries the rate that pays him.
    expect(rates).toMatch(/"payRate":\d+/)
  })

  it('reading his own work page puts nothing about his pay on the trail as somebody else reading it', async () => {
    expect(await PAY_TRAIL(karthik.personId, karthik.personId, true)).toBe(0)
    expect(await PAY_TRAIL(karthik.personId, karthik.personId, false)).toBe(0)
  })

  it('My benches prints the day a firm started marketing somebody as a plain date', async () => {
    const listing = await prisma.benchListing.findFirst({
      where: { revokedAt: null, state: 'GRANTED' },
      include: { consultant: { include: { person: true } } },
    })
    if (!listing) throw new Error('the seeded world has no granted bench listing to read')
    as(listing.consultant.person.primaryEmail)
    const r = await json(await myBenches(req('GET', '/api/me/benches')))
    expect(r.status).toBe(200)
    const benches = r.body.data.benches as any[]
    expect(benches.length).toBeGreaterThan(0)
    for (const b of benches) expect(b.since).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/)
  })
})
