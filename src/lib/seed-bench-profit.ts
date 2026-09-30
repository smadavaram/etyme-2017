/**
 * A niche bench vendor on the seeded world, so bench profit has real
 * numbers to read (CLAUDE.md, "Bench profit, next after the integrator
 * flow", 2026-09-30).
 *
 * The founder's picture of the second kind of bench creator: "bench-based
 * supplier companies focus on a niche skill, offer trainings to attract
 * people to their bench, that they place with sub-vendors, prime vendors
 * and clients." Every bench vendor already in the world sells software
 * people and runs no course, so none of them could show it.
 *
 *   Pellwright Validation Partners   validation engineers for regulated
 *                                    manufacturing — equipment, process
 *                                    and cleaning validation. Not IT.
 *
 * It runs one course, "Equipment and process validation: IQ, OQ and PQ",
 * at $1,800 a seat, and pays its bench half pay for up to ninety days.
 * It places through a prime, Sundara Systems, at Corveldt Aerospace:
 *
 *   Tobias Wren       finished the course, sat fifty-odd days, placed; his
 *                     margin has paid his bench back
 *   Noor Abernathy    finished the course, sat about a month, placed four
 *                     weeks ago; not paid back yet
 *   Lucia Brandvold   finished the course, on the bench now, and nothing
 *                     says what she is paid, so her cost is not known yet
 *   Samuel Varga      on the course now, on the bench while he learns
 *   Greta Lindahl     took a seat and dropped out; never on the bench
 *   Hector Valdivia   on the bench before the course existed; his last
 *                     placement ended two months ago and he is between
 *                     placements now
 *
 * And the three desks the section is walked from: the owner (seated by
 * the world's own firm step), a finance desk that reads it, and a
 * recruiter who is refused.
 *
 * Every row is found before it is written, every date counts from the
 * world's birthday (lib/seed-days), and it runs before the order-to-cash
 * layer, which raises the order each running line sits on — so a second
 * seeding writes nothing.
 *
 * ── Its weeks are signed later, and posted as they are signed ────────
 *
 * The route that signs a week posts it to the books (`postAssertion` in
 * lib/order-postings) in the same breath. The order-to-cash layer does
 * that later for the rest of the world, in sixteen shares dealt by id,
 * and on 2026-09-30 they already ran at 296 to 335 queries against a line
 * of 350 (`__integration__/seed-step-size.test.ts`). Forty-two more
 * signatures there put fifteen of sixteen over it; posted first, they sat
 * at the end of the id order and crowded the world's into fourteen.
 *
 * So the lines are written before that layer (`seedBenchProfit`, which
 * it reads to raise each running line's order), and the weeks are signed
 * after its postings and before its books (`seedBenchProfitWeeks`), then
 * posted here in shares of their own (`postBenchProfitWeeks`). The share
 * count of that layer is etyme-money's to raise when the next story
 * needs the room.
 */

import { prisma as db } from '@/lib/db'
import { day } from '@/lib/seed-days'
import { holidayKeys } from '@/lib/seed-calendar'
import { rolesFor } from '@/lib/company-defaults'
import { DEMO_MONTHLY_PAY, writeCyclesFor } from '@/lib/contract-cycles'
import { completeCycle } from '@/lib/cycle-complete'
import { postAssertion } from '@/lib/order-postings'
import { shareOf, type Share } from '@/lib/seed-steps'
import type { SeedContext } from '@/lib/seed-order-to-cash'

const DAY = 86_400_000
const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const plus = (d: Date, n: number) => new Date(d.getTime() + n * DAY)
const atHour = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000)
/** The Monday on or before a day. */
const mondayOf = (d: Date) => plus(d, -((d.getUTCDay() + 6) % 7))

/** The firm, by its seed slug without the `world-` prefix. Read by lib/seed-world for `FIRMS`. */
export const NICHE_VENDOR = {
  slug: 'pellwright',
  name: 'Pellwright Validation Partners',
  owner: 'Imogen Hartley',
} as const

/** The prime it places through, and the client the work is at. */
export const NICHE_PRIME = 'sundara'
export const NICHE_CLIENT = 'corveldt'

/** The desks beside the owner, and the address each signs in on (`world-pellwright-<desk>@`). */
export const NICHE_DESKS = [
  { desk: 'finance', role: 'Finance', name: 'Desmond Achterberg' },
  { desk: 'recruiter', role: 'Recruiter', name: 'Priyanka Solis' },
] as const

/** Half pay on the bench, for up to ninety days. */
export const NICHE_POLICY = { benchPolicy: 'REDUCED_RATE', benchRateBps: 5_000, benchCarryDays: 90 } as const

export const NICHE_COURSE = {
  title: 'Equipment and process validation: IQ, OQ and PQ',
  description: 'Installation, operational and performance qualification for regulated plants — protocols, deviations and the final report.',
  category: 'CERTIFICATION',
  duration: 40,
  /** Cents a seat. */
  price: 180_000,
} as const

const SKILLS = ['Process validation', 'Equipment qualification (IQ/OQ/PQ)', 'Cleaning validation', 'GMP documentation']
const LOC = 'Wichita, KS'

interface Placement {
  role: string
  /** Days from the world's birthday; rounded back to a Monday. */
  start: number
  end: number
  /** Cents an hour: the prime bills the client, the prime pays this firm, this firm pays the person. */
  top: number
  bill: number
  pay: number
  ended?: true
}

interface NichePerson {
  name: string
  email: string
  course?: { enrolled: number; status: 'COMPLETED' | 'IN_PROGRESS' | 'DROPPED'; done?: number }
  /** Days from the world's birthday they said yes to this firm's bench. */
  listed?: number
  placement?: Placement
}

export const NICHE_PEOPLE: NichePerson[] = [
  {
    name: 'Tobias Wren', email: 'tobias.wren@seed.etyme.invalid',
    course: { enrolled: -200, status: 'COMPLETED', done: -170 }, listed: -170,
    placement: { role: 'Process validation engineer', start: -120, end: 245, top: 11_200, bill: 8_800, pay: 6_200 },
  },
  {
    name: 'Noor Abernathy', email: 'noor.abernathy@seed.etyme.invalid',
    course: { enrolled: -95, status: 'COMPLETED', done: -65 }, listed: -65,
    placement: { role: 'Equipment qualification engineer', start: -30, end: 335, top: 10_600, bill: 8_200, pay: 5_800 },
  },
  {
    name: 'Lucia Brandvold', email: 'lucia.brandvold@seed.etyme.invalid',
    course: { enrolled: -70, status: 'COMPLETED', done: -40 }, listed: -40,
  },
  {
    name: 'Samuel Varga', email: 'samuel.varga@seed.etyme.invalid',
    course: { enrolled: -18, status: 'IN_PROGRESS' }, listed: -18,
  },
  {
    name: 'Greta Lindahl', email: 'greta.lindahl@seed.etyme.invalid',
    course: { enrolled: -150, status: 'DROPPED', done: -130 },
  },
  {
    name: 'Hector Valdivia', email: 'hector.valdivia@seed.etyme.invalid',
    listed: -420,
    placement: { role: 'Cleaning validation engineer', start: -400, end: -60, top: 11_500, bill: 9_000, pay: 6_400, ended: true },
  },
]

/** The day a placement starts: its Monday. */
export const nicheStart = (p: Placement) => mondayOf(day(p.start))

export interface NicheSeed {
  people: number
  placements: number
}

export async function seedBenchProfit(ctx: SeedContext): Promise<NicheSeed> {
  const out: NicheSeed = { people: 0, placements: 0 }
  const firm = ctx.firmBySlug.get(NICHE_VENDOR.slug)
  const prime = ctx.firmBySlug.get(NICHE_PRIME)
  const client = ctx.firmBySlug.get(NICHE_CLIENT)
  const owner = ctx.seatBySlug.get(NICHE_VENDOR.slug)
  const primeSeat = ctx.seatBySlug.get(NICHE_PRIME)
  const clientSeat = ctx.seatBySlug.get(NICHE_CLIENT)
  if (!firm || !prime || !client || !owner || !primeSeat || !clientSeat) return out
  const holidays = holidayKeys()

  // ── The firm's house policy: half pay on the bench, ninety days ─────
  await db.company.update({ where: { id: firm.id }, data: { ...NICHE_POLICY } })

  // ── Its desks beside the owner ──────────────────────────────────────
  for (const d of NICHE_DESKS) {
    const seed = rolesFor('VENDOR').find((r) => r.name === d.role)!
    const role =
      (await db.role.findFirst({ where: { companyId: firm.id, name: d.role }, select: { id: true } })) ??
      (await db.role.create({ data: { companyId: firm.id, name: d.role, permissions: seed.permissions, isDefault: false }, select: { id: true } }))
    const email = `${ctx.prefix}${NICHE_VENDOR.slug}-${d.desk}@${ctx.domain}`
    const p = await db.person.upsert({ where: { primaryEmail: email }, update: { name: d.name }, create: { name: d.name, primaryEmail: email } })
    if (!(await db.context.findFirst({ where: { personId: p.id, companyId: firm.id } }))) {
      await db.context.create({ data: { personId: p.id, companyId: firm.id, roleId: role.id, type: 'EMPLOYEE', grantReason: `${d.role} — seeded world` } })
    }
  }

  // ── On each other's register, one rung at a time ────────────────────
  for (const [a, b, relationship] of [
    [firm.id, prime.id, 'CLIENT'],
    [prime.id, firm.id, 'SUPPLIER'],
  ] as const) {
    if (!(await db.counterparty.findFirst({ where: { companyId: a, otherCompanyId: b, relationship } }))) {
      await db.counterparty.create({ data: { companyId: a, otherCompanyId: b, relationship } })
    }
  }

  // ── The firm's own standing, which lets it place anybody at all ─────
  for (const c of [
    { type: 'INSURANCE_GL' as const, provider: 'Hartford', from: -300, to: 65 },
    { type: 'INSURANCE_WC' as const, provider: 'Hartford', from: -300, to: 65 },
    { type: 'GOOD_STANDING' as const, provider: 'Secretary of State', from: -150, to: 215 },
  ]) {
    if (await db.verification.findFirst({ where: { companyId: firm.id, type: c.type } })) continue
    await db.verification.create({
      data: {
        companyId: firm.id, type: c.type, status: 'CLEAR', provider: c.provider,
        issuedAt: day(c.from), validFrom: day(c.from), expiresAt: day(c.to),
        uploadedById: owner.personId, verifiedById: primeSeat.personId, verifiedAt: day(c.from + 5),
        result: { outcome: 'CLEAR' },
      },
    })
  }

  // ── The course ──────────────────────────────────────────────────────
  const course =
    (await db.course.findFirst({ where: { companyId: firm.id, title: NICHE_COURSE.title } })) ??
    (await db.course.create({
      data: {
        companyId: firm.id, title: NICHE_COURSE.title, description: NICHE_COURSE.description,
        category: NICHE_COURSE.category, duration: NICHE_COURSE.duration, price: NICHE_COURSE.price,
        currency: 'USD', isPublic: true, createdAt: day(-240),
      },
    }))

  // ── The agreements the placements sit under ─────────────────────────
  const agreement = async (vendorId: string, clientId: string, signed: number) =>
    (await db.masterAgreement.findFirst({ where: { vendorId, clientId } })) ??
    (await db.masterAgreement.create({ data: { vendorId, clientId, paymentTerms: 45, currency: 'USD', signedAt: day(signed) } }))
  const below = await agreement(firm.id, prime.id, -430)
  const above = await agreement(prime.id, client.id, -430)
  const engagement = async (msaId: string, title: string) =>
    (await db.engagement.findFirst({ where: { msaId, title } })) ??
    (await db.engagement.create({ data: { msaId, title, invoiceCycle: 'MONTHLY' } }))

  for (const n of NICHE_PEOPLE) {
    const person = await db.person.upsert({ where: { primaryEmail: n.email }, update: {}, create: { name: n.name, primaryEmail: n.email } })
    out.people++

    if (n.course) {
      if (!(await db.enrollment.findUnique({ where: { courseId_personId: { courseId: course.id, personId: person.id } } }))) {
        await db.enrollment.create({
          data: {
            courseId: course.id, personId: person.id, status: n.course.status, enrolledAt: day(n.course.enrolled),
            completedAt: n.course.status === 'COMPLETED' ? day(n.course.done!) : null,
            score: n.course.status === 'COMPLETED' ? 88 : null,
          },
        })
      }
    }

    if (n.listed == null) continue
    const profile =
      (await db.consultantProfile.findFirst({ where: { personId: person.id } })) ??
      (await db.consultantProfile.create({ data: { personId: person.id, skills: SKILLS, location: LOC, visibility: 'VERIFIED', workAuth: 'USC' } }))
    // Their own yes, and marketed by default.
    if (!(await db.benchListing.findFirst({ where: { consultantId: profile.id, companyId: firm.id } }))) {
      await db.benchListing.create({
        data: {
          consultantId: profile.id, companyId: firm.id, tier: 'MARKETING', state: 'GRANTED',
          invitedAt: day(n.listed - 2), respondedAt: day(n.listed), grantedAt: day(n.listed),
        },
      })
    }

    const p = n.placement
    if (!p) continue
    const start = nicheStart(p)
    const end = day(p.end)
    const state = p.ended ? 'ENDED' : 'IN_PROGRESS'

    // Her own seat, so a placed worker can sign in and file her own week.
    if (!(await db.context.findFirst({ where: { personId: person.id, companyId: firm.id, type: 'CONSULTANT' } }))) {
      await db.context.create({ data: { personId: person.id, companyId: firm.id, type: 'CONSULTANT', side: 'SELL', grantReason: 'On the payroll — W2' } })
    }
    for (const v of [
      { type: 'I9_EVERIFY' as const, provider: 'E-Verify', expiresAt: null as Date | null },
      { type: 'BACKGROUND_CHECK' as const, provider: 'Sterling', expiresAt: plus(start, 365) as Date | null },
    ]) {
      if (await db.verification.findFirst({ where: { personId: person.id, type: v.type } })) continue
      await db.verification.create({
        data: {
          personId: person.id, type: v.type, status: 'CLEAR', provider: v.provider,
          issuedAt: plus(start, -8), expiresAt: v.expiresAt,
          ...(v.type === 'BACKGROUND_CHECK' ? { orderedByCompanyId: firm.id, orderedAt: plus(start, -12) } : {}),
          uploadedById: owner.personId, verifiedById: owner.personId, verifiedAt: plus(start, -7),
          result: { outcome: 'CLEAR' },
        },
      })
    }

    // The client's job, and the prime's submission of this firm's person.
    const requirement =
      (await db.requirement.findFirst({ where: { companyId: client.id, title: p.role } })) ??
      (await db.requirement.create({
        data: {
          companyId: client.id, title: p.role, skills: SKILLS.slice(0, 3), location: LOC,
          billMin: p.top - 1_000, billMax: p.top + 500, months: 12, headcount: 1, hoursPerWeek: 40,
          status: 'FILLED', approvalState: 'AUTO_APPROVED', source: 'MANUAL', neededBy: start, createdAt: plus(start, -35),
        },
      }))
    if (!(await db.submission.findFirst({ where: { requirementId: requirement.id, personId: person.id } }))) {
      await db.submission.create({
        data: {
          requirementId: requirement.id, personId: person.id, fromCompanyId: prime.id, toCompanyId: client.id,
          // The prime does not employ them and holds no listing: somebody
          // its supplier offered it, so NETWORK.
          kind: 'NETWORK', rate: p.top, status: 'PLACED', checkState: 'SENT',
          submittedAt: plus(start, -24), forwardedAt: plus(start, -23), decidedAt: plus(start, -12),
        },
      })
    }

    // ── The two rungs: this firm to the prime, the prime to the client ─
    let sell = await db.sellContract.findFirst({ where: { companyId: firm.id, personId: person.id, requirementId: requirement.id } })
    if (!sell) {
      const eng = await engagement(below.id, p.role)
      sell = await db.sellContract.create({
        data: {
          companyId: firm.id, clientCompanyId: prime.id, endClientCompanyId: client.id, personId: person.id,
          requirementId: requirement.id, engagementId: eng.id, msaId: below.id,
          billRate: p.bill, billCurrency: 'USD', paymentTerms: 45, state, startDate: start, endDate: end,
        },
      })
      const buy = await db.buyContract.create({
        data: { companyId: firm.id, vendorCompanyId: null, payCurrency: 'USD', contractType: 'W2', state, startDate: start, endDate: end },
      })
      await db.buyContractCandidate.create({
        data: { buyContractId: buy.id, personId: person.id, payRate: p.pay, payCurrency: 'USD', startDate: start, endDate: end, state: p.ended ? 'ENDED' : 'ACTIVE' },
      })
      await db.contractLink.create({ data: { sellContractId: sell.id, buyContractId: buy.id, effectiveFrom: start, effectiveTo: end } })

      const engUp = await engagement(above.id, p.role)
      const up = await db.sellContract.create({
        data: {
          companyId: prime.id, clientCompanyId: client.id, endClientCompanyId: client.id, personId: person.id,
          requirementId: requirement.id, engagementId: engUp.id, msaId: above.id,
          billRate: p.top, billCurrency: 'USD', paymentTerms: 45, state, startDate: start, endDate: end,
        },
      })
      const upBuy = await db.buyContract.create({
        data: {
          companyId: prime.id, vendorCompanyId: firm.id, payCurrency: 'USD', contractType: 'C2C', state,
          startDate: start, endDate: end, supplierSellContractId: sell.id,
        },
      })
      await db.buyContractCandidate.create({
        data: { buyContractId: upBuy.id, personId: person.id, payRate: p.bill, payCurrency: 'USD', startDate: start, endDate: end, state: p.ended ? 'ENDED' : 'ACTIVE' },
      })
      await db.contractLink.create({ data: { sellContractId: up.id, buyContractId: upBuy.id, effectiveFrom: start, effectiveTo: end } })

      // A finished placement is history: its dates were worked to at the
      // time and none of them is owed today.
      if (!p.ended) {
        await writeCyclesFor(db, { sell, buy, packId: 'US_IT', holidays, pay: DEMO_MONTHLY_PAY })
        await writeCyclesFor(db, { sell: up, buy: upBuy, packId: 'US_IT', holidays, pay: DEMO_MONTHLY_PAY })
      }
    }
    out.placements++
  }
  return out
}

/**
 * The weeks on each running placement, filed once on this firm's line and
 * signed down the chain.
 *
 * Its own step, after the order-to-cash postings and before the books:
 * the postings layer deals every unposted signature in the world into
 * shares by id, and these, signed later than the rest, would all fall in
 * its last shares and crowd the world's into the others. So they are
 * signed here and posted by `postBenchProfitWeeks`, as the sign route
 * posts a week, and the books that follow carry them on the first seeding.
 */
export async function seedBenchProfitWeeks(ctx: SeedContext): Promise<number> {
  let weeks = 0
  const firm = ctx.firmBySlug.get(NICHE_VENDOR.slug)
  const prime = ctx.firmBySlug.get(NICHE_PRIME)
  const client = ctx.firmBySlug.get(NICHE_CLIENT)
  const owner = ctx.seatBySlug.get(NICHE_VENDOR.slug)
  const primeSeat = ctx.seatBySlug.get(NICHE_PRIME)
  const clientSeat = ctx.seatBySlug.get(NICHE_CLIENT)
  if (!firm || !prime || !client || !owner || !primeSeat || !clientSeat) return 0
  const holidays = holidayKeys()

  for (const n of NICHE_PEOPLE) {
    const p = n.placement
    if (!p || p.ended) continue
    const person = await db.person.findUnique({ where: { primaryEmail: n.email }, select: { id: true } })
    if (!person) continue
    const sell = await db.sellContract.findFirst({
      where: { companyId: firm.id, personId: person.id, requirement: { companyId: client.id, title: p.role } },
      select: { id: true },
    })
    if (!sell) continue
    const start = nicheStart(p)

    // ── The weeks, filed once on this firm's line and signed down ─────
    //
    // The client signs at what it pays the prime, the prime accepts at
    // what it pays this firm, and this firm accepts last at what it pays
    // the person — the chain, top to bottom (CLAUDE.md, "The signed week
    // travels down the chain").
    for (let m = start; plus(m, 4) <= day(-3); m = plus(m, 7)) {
      weeks++
      if (await db.timesheet.findFirst({ where: { sellContractId: sell.id, periodStart: m } })) continue
      const friday = plus(m, 4)
      const days: Record<string, number> = {}
      for (let k = 0; k < 5; k++) {
        const on = isoDay(plus(m, k))
        if (!holidays.has(on)) days[on] = 8
      }
      const total = Object.values(days).reduce((a, b) => a + b, 0)
      const clientAt = atHour(plus(friday, 3), 15)
      const primeAt = atHour(plus(friday, 3), 16)
      const employerAt = atHour(plus(friday, 4), 17)
      const ts = await db.timesheet.create({
        data: {
          sellContractId: sell.id, personId: person.id, periodStart: m, periodEnd: friday,
          days, totalHours: total, status: 'APPROVED', submittedAt: atHour(friday, 22),
          approvedAt: clientAt, approvedById: clientSeat.personId,
          clientApprovedAt: clientAt, clientApprovedById: clientSeat.personId,
          employerAcceptedAt: employerAt, employerAcceptedById: owner.personId,
        },
      })
      await db.workAssertion.create({
        data: { timesheetId: ts.id, companyId: client.id, role: 'CLIENT_APPROVAL', hours: total, rateCents: p.top, state: 'LIVE', byId: clientSeat.personId, auto: false, at: clientAt },
      })
      await db.workAssertion.create({
        data: { timesheetId: ts.id, companyId: prime.id, role: 'PASS_THROUGH', hours: total, rateCents: p.bill, state: 'LIVE', byId: primeSeat.personId, auto: false, at: primeAt },
      })
      await db.workAssertion.create({
        data: { timesheetId: ts.id, companyId: firm.id, role: 'EMPLOYER_ACCEPTANCE', hours: total, rateCents: p.pay, state: 'LIVE', byId: owner.personId, auto: false, at: employerAt },
      })
      await completeCycle(db, { sellContractId: sell.id, kind: 'TIMESHEET_APPROVE', periodEnd: friday, at: employerAt })
    }
  }
  return weeks
}

/** How many steps the niche vendor's weeks are posted in. Each posting is about twenty queries. */
export const NICHE_POSTING_SHARES = 4

/**
 * Post one share of the niche vendor's signed weeks to its books, the way
 * the route that signs a week does. A signature already posted in full is
 * passed over — the same test the order-to-cash layer applies — so a
 * second seeding writes nothing and asks almost nothing.
 */
export async function postBenchProfitWeeks(ctx: SeedContext, share?: Share): Promise<number> {
  const firm = ctx.firmBySlug.get(NICHE_VENDOR.slug)
  if (!firm) return 0
  const all = await db.workAssertion.findMany({
    where: { state: 'LIVE', role: { not: 'PASS_THROUGH' }, timesheet: { sellContract: { companyId: firm.id } } },
    select: { id: true, byId: true, role: true },
    orderBy: { id: 'asc' },
  })
  const mine = shareOf(all, share)
  const written = new Map<string, Set<string>>()
  for (const p of await db.orderPosting.findMany({
    where: { source: 'TIMESHEET', sourceId: { in: mine.map((a) => a.id) } },
    select: { sourceId: true, kind: true },
  })) {
    if (p.sourceId) written.set(p.sourceId, (written.get(p.sourceId) ?? new Set()).add(p.kind))
  }
  let posted = 0
  for (const a of mine) {
    const kinds = written.get(a.id)
    const complete =
      a.role === 'CLIENT_APPROVAL' ? kinds?.has('REVENUE') : kinds?.has('PAY') && kinds?.has('BURDEN')
    if (complete) continue
    posted += ((await postAssertion(a.id, a.byId)) ?? []).filter(Boolean).length
  }
  return posted
}
