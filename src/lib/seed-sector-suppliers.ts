/**
 * Two suppliers that are not IT staffing, on the seeded world.
 *
 * ── Why ──────────────────────────────────────────────────────────────
 *
 * CLAUDE.md: horizontal, never vertical — "the same product has to work
 * for a travel nurse or a validation engineer." The three client programs
 * were already a sportswear company, a glass plant and a medical device
 * maker, and every firm supplying them sold software people. So a visitor
 * reading the supplier doors on /demo concluded this is software for IT
 * staffing firms. The founder approved two more suppliers, 2026-09-29:
 *
 *   Sorrelwood Clinical Staffing     supplies Talvern Medical with an
 *                                    occupational health nurse
 *   Quarrystone Industrial Staffing  supplies Cavanaugh Glassworks with a
 *                                    forming line maintenance technician
 *
 * Both names are invented and checked against `docs/demo-names.md`; both
 * firms are on `WORLD_SLUGS`, so the rebuild deletes them with the world.
 *
 * ── What each one holds ──────────────────────────────────────────────
 *
 * One placement each, of the firm's own W2 employee, so the submission is
 * INTERNAL: the employment is the consent and there is no bench listing.
 *
 *   the award      a filled job at the client, charged to a department
 *                  of the client's own under Operations, and the firm's
 *                  submission of its own employee, placed
 *   the line       a sell line at the bill rate, a W2 buy line at the pay
 *                  rate, joined, with the pack's hours-due and pay dates
 *   the paper      what the line requires, on file: the I-9, the
 *                  background check the employer ordered, and — for the
 *                  nurse, because `lib/packets` reads "nurse" as a
 *                  licensed occupation — her state nursing license. The
 *                  firm's cover and its certificate of good standing,
 *                  and a signed agreement with the client. The worker's
 *                  own papers the order asks for (the NDA, the client's
 *                  own induction) are signed from her page, in phase two,
 *                  once the order's set exists to be read
 *   the weeks      Monday to Friday from the start, each signed by the
 *                  client's hiring manager at the bill rate and then
 *                  accepted by the employer at the pay rate — the chain,
 *                  top to bottom. The nurse's latest week is filed and
 *                  waits for Talvern to sign it
 *
 * No bill is raised. What each door says is waiting is the unbilled or
 * unsigned week, and that is exactly what an unbilled line looks like.
 *
 * ── Dates ────────────────────────────────────────────────────────────
 *
 * Every date counts from the world's birthday (lib/seed-days), and every
 * row is found before it is written, so a second seeding writes nothing.
 * Phase one runs before the order-to-cash layer, which raises the order
 * each running line sits on; phase two runs after the order's required
 * set is written, because it reads that set.
 */

import { prisma as db } from '@/lib/db'
import { day } from '@/lib/seed-days'
import { holidayKeys } from '@/lib/seed-calendar'
import { DEMO_MONTHLY_PAY, writeCyclesFor } from '@/lib/contract-cycles'
import { completeCycle } from '@/lib/cycle-complete'
import { requirementsFor } from '@/lib/document-requirements'
import type { SeedContext } from '@/lib/seed-order-to-cash'
import { departmentAt, codeTheLine, type SeedDepartment } from '@/lib/seed-coding'

const DAY = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)
const plus = (d: Date, n: number) => new Date(d.getTime() + n * DAY)
const atHour = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000)
/** The Monday on or before a day. */
const mondayOf = (d: Date) => plus(d, -((d.getUTCDay() + 6) % 7))

export interface SectorSupplier {
  /** The firm's slug in the seed, without the `world-` prefix. */
  slug: string
  name: string
  /** The client program it supplies, by seed slug. */
  client: string
  role: string
  skills: string[]
  loc: string
  person: { name: string; email: string }
  /** Cents an hour: what the client is billed and what the worker is paid. */
  bill: number
  pay: number
  /** Days before the world's birthday the placement started (rounded to its Monday). */
  startedDaysAgo: number
  /** Days after the world's birthday the placement ends. */
  endsInDays: number
  /**
   * The client's own department the job is charged to, under Operations.
   * A nurse is not charged to the Apps department, and the budget screen
   * names the department beside her.
   */
  department: SeedDepartment
  /** Whether the latest week is filed and still waiting for the client. */
  lastWeekAwaiting: boolean
  /** The state license, where the role is a licensed occupation. */
  license?: { issuer: string; number: string; state: string; issuedDaysAgo: number; expiresInDays: number }
}

/**
 * The two firms. Also read by `lib/seed-world` for `FIRMS`, so the roster,
 * the owner seat and the demo door all name the same firm.
 */
export const SECTOR_SUPPLIERS: SectorSupplier[] = [
  {
    slug: 'sorrelwood',
    name: 'Sorrelwood Clinical Staffing',
    client: 'terumo-bct',
    role: 'Occupational health nurse',
    skills: ['Occupational health', 'Employee health screening', 'OSHA recordkeeping'],
    loc: 'Westminster, CO',
    person: { name: 'Adaeze Obi', email: 'adaeze.obi@seed.etyme.invalid' },
    bill: 9_800,
    pay: 6_200,
    startedDaysAgo: 38,
    endsInDays: 145,
    department: { name: 'Employee Health', code: 'EHS' },
    lastWeekAwaiting: true,
    license: { issuer: 'Colorado Board of Nursing', number: 'RN 1.721904', state: 'CO', issuedDaysAgo: 1_460, expiresInDays: 425 },
  },
  {
    slug: 'quarrystone',
    name: 'Quarrystone Industrial Staffing',
    client: 'corning',
    role: 'Forming line maintenance technician',
    skills: ['Industrial maintenance', 'Hydraulics', 'Preventive maintenance'],
    loc: 'Elmira, NY',
    person: { name: 'Wendell Price', email: 'wendell.price@seed.etyme.invalid' },
    bill: 7_800,
    pay: 5_200,
    startedDaysAgo: 52,
    endsInDays: 130,
    department: { name: 'Plant Maintenance', code: 'MAINT' },
    lastWeekAwaiting: false,
  },
]

/** The owner at each firm, by name. Read by `lib/seed-world` for `FIRMS`. */
export const SECTOR_OWNERS: Record<string, string> = {
  sorrelwood: 'Maribel Ortega',
  quarrystone: 'Curtis Mahoney',
}

/** The day a placement starts, from the world's birthday. */
export function sectorStart(s: SectorSupplier): Date {
  return mondayOf(day(-s.startedDaysAgo))
}

/**
 * The Mondays of every week worked, oldest first.
 *
 * From the start to the last whole week that ended at least three days
 * before the world's birthday, so the latest week has had its weekend.
 */
export function sectorWeeks(s: SectorSupplier): Date[] {
  const out: Date[] = []
  for (let m = sectorStart(s); plus(m, 4) <= day(-3); m = plus(m, 7)) out.push(m)
  return out
}

export interface SectorSeed {
  placements: number
  weeks: number
}

/** Phase one: the firms' paper, the placement and the weeks. */
export async function seedSectorSuppliers(ctx: SeedContext): Promise<SectorSeed> {
  const out: SectorSeed = { placements: 0, weeks: 0 }
  const holidays = holidayKeys()

  for (const s of SECTOR_SUPPLIERS) {
    const firm = ctx.firmBySlug.get(s.slug)
    const client = ctx.firmBySlug.get(s.client)
    const owner = ctx.seatBySlug.get(s.slug)
    const clientOwner = ctx.seatBySlug.get(s.client)
    if (!firm || !client || !owner || !clientOwner) continue
    const hiring = await db.person.findUnique({
      where: { primaryEmail: `${ctx.prefix}${s.client}-hiring@${ctx.domain}` },
      select: { id: true },
    })
    const compliance = await db.person.findUnique({
      where: { primaryEmail: `${ctx.prefix}${s.client}-compliance@${ctx.domain}` },
      select: { id: true },
    })
    if (!hiring || !compliance) continue

    const start = sectorStart(s)
    const end = day(s.endsInDays)

    // ── On each other's register ──────────────────────────────────────
    for (const [a, b, relationship] of [
      [firm.id, client.id, 'CLIENT'],
      [client.id, firm.id, 'SUPPLIER'],
    ] as const) {
      if (!(await db.counterparty.findFirst({ where: { companyId: a, otherCompanyId: b, relationship } }))) {
        await db.counterparty.create({ data: { companyId: a, otherCompanyId: b, relationship } })
      }
    }

    // ── The firm's own standing ───────────────────────────────────────
    //
    // Cover and good standing each carry the two dates printed on the
    // certificate, the way the one door that writes a certificate does.
    // Read by the client's compliance officer, who verified them.
    for (const c of [
      { type: 'INSURANCE_GL' as const, provider: 'Hartford', from: -200, to: 165 },
      { type: 'INSURANCE_WC' as const, provider: 'Hartford', from: -200, to: 165 },
      { type: 'GOOD_STANDING' as const, provider: 'Secretary of State', from: -120, to: 245 },
    ]) {
      if (await db.verification.findFirst({ where: { companyId: firm.id, type: c.type } })) continue
      await db.verification.create({
        data: {
          companyId: firm.id, type: c.type, status: 'CLEAR', provider: c.provider,
          issuedAt: day(c.from), validFrom: day(c.from), expiresAt: day(c.to),
          uploadedById: owner.personId, verifiedById: compliance.id, verifiedAt: plus(start, -10),
          result: { outcome: 'CLEAR' },
        },
      })
    }

    // ── The worker, on the firm's payroll ─────────────────────────────
    const person = await db.person.upsert({
      where: { primaryEmail: s.person.email },
      update: {},
      create: { name: s.person.name, primaryEmail: s.person.email },
    })
    if (!(await db.consultantProfile.findFirst({ where: { personId: person.id } }))) {
      await db.consultantProfile.create({
        data: { personId: person.id, skills: s.skills, location: s.loc, visibility: 'VERIFIED', workAuth: 'USC' },
      })
    }
    // Her own seat, so she can sign in and file her own week.
    if (!(await db.context.findFirst({ where: { personId: person.id, companyId: firm.id, type: 'CONSULTANT' } }))) {
      await db.context.create({
        data: { personId: person.id, companyId: firm.id, type: 'CONSULTANT', side: 'SELL', grantReason: 'On the payroll — W2' },
      })
    }

    // ── The award ─────────────────────────────────────────────────────
    //
    // The job is charged to a department of the client's own, the way
    // the client coded it when it raised the job; the award carries that
    // coding onto the line below.
    const coding = await departmentAt({
      clientId: client.id, clientSlug: s.client, ownerId: clientOwner.personId,
      dept: s.department, billCents: s.bill,
    })
    const requirement =
      (await db.requirement.findFirst({ where: { companyId: client.id, title: s.role } })) ??
      (await db.requirement.create({
        data: {
          companyId: client.id, title: s.role, skills: s.skills, location: s.loc,
          billMin: s.bill - 1_000, billMax: s.bill + 500, months: 6, headcount: 1, hoursPerWeek: 40,
          status: 'FILLED', approvalState: 'AUTO_APPROVED', source: 'MANUAL',
          neededBy: start, raisedById: hiring.id, createdAt: plus(start, -30),
          costCenterId: coding.costCenterId, orgUnitId: coding.orgUnitId,
        },
      }))
    // The firm's own employee, so INTERNAL: the employment is the
    // consent, and there is no bench listing behind it.
    if (!(await db.submission.findFirst({ where: { requirementId: requirement.id, personId: person.id } }))) {
      await db.submission.create({
        data: {
          requirementId: requirement.id, personId: person.id,
          fromCompanyId: firm.id, toCompanyId: client.id, kind: 'INTERNAL',
          rate: s.bill, status: 'PLACED', checkState: 'SENT',
          submittedAt: plus(start, -24), decidedAt: plus(start, -14),
        },
      })
    }

    // ── What the worker holds ─────────────────────────────────────────
    const papers: {
      type: 'I9_EVERIFY' | 'BACKGROUND_CHECK' | 'PROFESSIONAL_LICENSE'
      provider: string
      issuedAt: Date
      validFrom?: Date
      expiresAt: Date | null
      orderedByCompanyId?: string
      orderedAt?: Date
      result: Record<string, string>
    }[] = [
      { type: 'I9_EVERIFY', provider: 'E-Verify', issuedAt: plus(start, -8), expiresAt: null, result: { outcome: 'CLEAR' } },
      // The employer ordered the report; the screening company rendered
      // the verdict. Recorded as theirs.
      { type: 'BACKGROUND_CHECK', provider: 'Sterling', issuedAt: plus(start, -8), expiresAt: plus(start, 365),
        orderedByCompanyId: firm.id, orderedAt: plus(start, -12), result: { outcome: 'CLEAR' } },
    ]
    if (s.license) {
      papers.push({
        type: 'PROFESSIONAL_LICENSE', provider: s.license.issuer,
        issuedAt: day(-s.license.issuedDaysAgo), validFrom: day(-s.license.issuedDaysAgo),
        expiresAt: day(s.license.expiresInDays),
        result: { outcome: 'CLEAR', license: s.license.number, state: s.license.state },
      })
    }
    for (const v of papers) {
      if (await db.verification.findFirst({ where: { personId: person.id, type: v.type } })) continue
      await db.verification.create({
        data: {
          personId: person.id, ...v, status: 'CLEAR',
          uploadedById: owner.personId, verifiedById: owner.personId, verifiedAt: plus(start, -7),
        },
      })
    }

    // ── The line: sold at the bill rate, paid at the pay rate ─────────
    let sell = await db.sellContract.findFirst({
      where: { companyId: firm.id, clientCompanyId: client.id, personId: person.id, requirementId: requirement.id },
    })
    if (!sell) {
      const msa =
        (await db.masterAgreement.findFirst({ where: { vendorId: firm.id, clientId: client.id } })) ??
        (await db.masterAgreement.create({
          data: { vendorId: firm.id, clientId: client.id, paymentTerms: 45, currency: 'USD', signedAt: plus(start, -21) },
        }))
      const eng =
        (await db.engagement.findFirst({ where: { msaId: msa.id, title: s.role } })) ??
        (await db.engagement.create({ data: { msaId: msa.id, title: s.role, invoiceCycle: 'MONTHLY' } }))
      sell = await db.sellContract.create({
        data: {
          companyId: firm.id, clientCompanyId: client.id, endClientCompanyId: client.id,
          personId: person.id, requirementId: requirement.id, engagementId: eng.id, msaId: msa.id,
          hiringManagerId: hiring.id, orgUnitId: coding.orgUnitId,
          billRate: s.bill, billCurrency: 'USD', paymentTerms: 45, state: 'IN_PROGRESS',
          startDate: start, endDate: end,
        },
      })
      const buy = await db.buyContract.create({
        data: {
          companyId: firm.id, vendorCompanyId: null, payCurrency: 'USD', contractType: 'W2',
          state: 'IN_PROGRESS', startDate: start, endDate: end,
        },
      })
      await db.buyContractCandidate.create({
        data: { buyContractId: buy.id, personId: person.id, payRate: s.pay, payCurrency: 'USD', startDate: start, endDate: end },
      })
      await db.contractLink.create({
        data: { sellContractId: sell.id, buyContractId: buy.id, effectiveFrom: start, effectiveTo: end },
      })
      await writeCyclesFor(db, { sell, buy, packId: 'US_IT', holidays, pay: DEMO_MONTHLY_PAY })
    }
    // The coding the award writes: without the allocation the client
    // signed every week and its budget counted none of them. Here as
    // well as on create, so a world seeded before it gains it.
    await codeTheLine({ requirementId: requirement.id, sellContractId: sell.id, ...coding })
    out.placements++

    // ── The weeks, signed top to bottom ───────────────────────────────
    const mondays = sectorWeeks(s)
    for (const [i, monday] of mondays.entries()) {
      out.weeks++
      if (await db.timesheet.findFirst({ where: { sellContractId: sell.id, periodStart: monday } })) continue
      const friday = plus(monday, 4)
      const days: Record<string, number> = {}
      for (let k = 0; k < 5; k++) {
        const on = iso(plus(monday, k))
        if (!holidays.has(on)) days[on] = 8
      }
      const total = Object.values(days).reduce((a, b) => a + b, 0)
      const submittedAt = atHour(friday, 22)
      const awaiting = s.lastWeekAwaiting && i === mondays.length - 1

      if (awaiting) {
        // Filed by her, and nobody has signed it yet.
        await db.timesheet.create({
          data: {
            sellContractId: sell.id, personId: person.id, periodStart: monday, periodEnd: friday,
            days, totalHours: total, status: 'SUBMITTED', submittedAt,
          },
        })
        continue
      }

      const clientAt = atHour(plus(friday, 3), 16)
      const employerAt = atHour(plus(friday, 4), 17)
      const ts = await db.timesheet.create({
        data: {
          sellContractId: sell.id, personId: person.id, periodStart: monday, periodEnd: friday,
          days, totalHours: total, status: 'APPROVED', submittedAt,
          approvedAt: clientAt, approvedById: hiring.id,
          clientApprovedAt: clientAt, clientApprovedById: hiring.id,
          employerAcceptedAt: employerAt, employerAcceptedById: owner.personId,
        },
      })
      // The client signs at what it is billed; the employer accepts at
      // what it pays, after the client.
      await db.workAssertion.create({
        data: {
          timesheetId: ts.id, companyId: client.id, role: 'CLIENT_APPROVAL', hours: total,
          rateCents: s.bill, state: 'LIVE', byId: hiring.id, auto: false, at: clientAt,
        },
      })
      await db.workAssertion.create({
        data: {
          timesheetId: ts.id, companyId: firm.id, role: 'EMPLOYER_ACCEPTANCE', hours: total,
          rateCents: s.pay, state: 'LIVE', byId: owner.personId, auto: false, at: employerAt,
        },
      })
      await completeCycle(db, { sellContractId: sell.id, kind: 'TIMESHEET_APPROVE', periodEnd: friday, at: employerAt })
    }
  }
  return out
}

/**
 * Phase two: the papers the worker owes on her line, signed.
 *
 * Read off the line's own required set once the order's set exists, so
 * what is signed is exactly what is asked — the NDA from the W-2 start
 * packet, the client's own induction from its order — and named by the
 * item's label, which is how her page matches a paper to what it answers.
 * A check or a license is a `Verification` written in phase one and is
 * never turned into a paper here.
 */
export async function seedSectorPapers(ctx: SeedContext): Promise<number> {
  let wrote = 0
  const checks = new Set(['I9_EVERIFY', 'RIGHT_TO_WORK', 'BACKGROUND_CHECK', 'DRUG_SCREENING', 'PROFESSIONAL_LICENSE'])
  for (const s of SECTOR_SUPPLIERS) {
    const firm = ctx.firmBySlug.get(s.slug)
    if (!firm) continue
    const person = await db.person.findUnique({ where: { primaryEmail: s.person.email }, select: { id: true } })
    if (!person) continue
    const sell = await db.sellContract.findFirst({
      where: { companyId: firm.id, personId: person.id },
      select: { id: true, startDate: true, buyLinks: { select: { buyContractId: true } } },
    })
    const buyId = sell?.buyLinks[0]?.buyContractId
    if (!sell || !buyId) continue

    const sets = await Promise.all([requirementsFor({ sellContractId: sell.id }), requirementsFor({ buyContractId: buyId })])
    const owed = new Map<string, string>()
    for (const set of sets) {
      for (const item of set?.items ?? []) {
        if (item.required && item.owedBy === 'WORKER' && !checks.has(item.key)) owed.set(item.key, item.label)
      }
    }

    const signedAt = atHour(plus(sell.startDate ?? day(0), -5), 11)
    for (const label of owed.values()) {
      const template =
        (await db.docTemplate.findFirst({ where: { companyId: firm.id, name: label } })) ??
        (await db.docTemplate.create({ data: { companyId: firm.id, name: label, audience: 'EMPLOYEE', needsSignature: true } }))
      if (await db.docInstance.findFirst({ where: { templateId: template.id, subjectType: 'PERSON', subjectId: person.id } })) continue
      await db.docInstance.create({
        data: {
          templateId: template.id, buyContractId: buyId, subjectType: 'PERSON', subjectId: person.id,
          status: 'SIGNED', sentAt: plus(signedAt, -2), signedAt, signedById: person.id, validFrom: signedAt,
        },
      })
      wrote++
    }
  }
  return wrote
}
