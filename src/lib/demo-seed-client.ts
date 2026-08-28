/**
 * A buyer's sandbox: one client company, and the pile that landed on it.
 *
 * The vendor seed fills a bench and the demand it is chasing. This fills
 * the other chair — three open requisitions and fifteen submissions from
 * four suppliers, most of which should never have reached a hiring
 * manager.
 *
 * ── Why the mess is the point ────────────────────────────────────────
 *
 * A client demo that opens on four excellent candidates has demonstrated
 * nothing. Anybody can show four good CVs. What a buyer is paying for is
 * the eleven they did not have to read, and that only shows if the
 * eleven are here:
 *
 *   the same consultant, from two vendors, at $78 and $96
 *   somebody eleven dollars over the band that vendor signed
 *   a submission from a firm nobody has an agreement with
 *   a consultant already nineteen months into an eighteen-month cap
 *   somebody who left mid-project last year and is on the barred list
 *   a CV with no work permit recorded, for a role that requires one
 *
 * Each one is a real thing that arrives in a real inbox every week, and
 * each is caught by a different check. Take any of them out and one of
 * the checks becomes a claim rather than a demonstration.
 *
 * ── And why one of them is good news ─────────────────────────────────
 *
 * One candidate in the pile has worked here before, through a vendor the
 * client no longer uses, and nobody in the building remembers. The
 * tenure ledger knows. That is the single screen in this product that a
 * VMS cannot produce, and it should be the third thing a visitor sees.
 */

import { prisma } from '@/lib/db'
import { rolesFor } from '@/lib/company-defaults'
import { defaultPostureFor } from '@/lib/walls'
import { DEMO_DAYS, type Seeded } from '@/lib/demo-seed'

/**
 * The four suppliers. Three you work with, one you do not.
 *
 * `bandOfMax` is where their ceiling sits inside the role's own budget,
 * not a fixed number of dollars. A flat $85 ceiling was being handed out
 * on a $140/hr SAP role, which made three honest submissions read as
 * over-band on the scorecard — a demo teaching the opposite of the
 * thing it is demonstrating.
 */
const VENDORS = [
  { name: 'Cloudepa Systems', bandOfMax: 0.94, agreement: true, invited: true },
  { name: 'Vertex Talent', bandOfMax: 0.98, agreement: true, invited: true },
  { name: 'Brightmoor Staffing', bandOfMax: 0.91, agreement: true, invited: true },
  { name: 'Kestrel Consulting', bandOfMax: null, agreement: false, invited: false },
]

/**
 * What each submission is here to demonstrate.
 *
 * `problem` is the check it is meant to trip. Null means it should sail
 * through, and a pile with no clean submissions in it would be as
 * useless as a pile with no dirty ones.
 */
interface Candidate {
  name: string
  skills: string[]
  location: string
  auth: string | null
  vendor: string
  rate: number
  score: number | null
  problem:
    | null
    | 'DUPLICATE'
    | 'OVER_BAND'
    | 'NO_AGREEMENT'
    | 'TENURE'
    | 'BARRED'
    | 'NO_PERMIT'
    | 'TOO_LATE'
  /** Months already worked here, through whoever. */
  workedHere?: { months: number; endedDaysAgo: number }
}

const JAVA_PILE: Candidate[] = [
  { name: 'Rohan Menon', skills: ['Java', 'Spring Boot', 'AWS'], location: 'Dallas, TX', auth: 'US_CITIZEN', vendor: 'Cloudepa Systems', rate: 7800, score: 94, problem: null },
  { name: 'Rohan Menon', skills: ['Java', 'Spring Boot', 'AWS'], location: 'Dallas, TX', auth: 'US_CITIZEN', vendor: 'Vertex Talent', rate: 9600, score: 94, problem: 'DUPLICATE' },
  { name: 'James Whitfield', skills: ['Java', 'Spring Boot'], location: 'Dallas, TX', auth: 'US_CITIZEN', vendor: 'Brightmoor Staffing', rate: 8000, score: 81, problem: null },
  { name: 'Lucia Braga', skills: ['Java', 'AWS', 'Kafka'], location: 'Dallas, TX', auth: 'US_CITIZEN', vendor: 'Brightmoor Staffing', rate: 8100, score: 76, problem: null },
  { name: 'Marta Farrow', skills: ['Java', 'Spring Boot', 'AWS'], location: 'Dallas, TX', auth: 'US_CITIZEN', vendor: 'Cloudepa Systems', rate: 7900, score: 88, problem: null, workedHere: { months: 14, endedDaysAgo: 430 } },
  { name: 'Adaeze Okafor', skills: ['Java', 'AWS'], location: 'Remote', auth: 'US_CITIZEN', vendor: 'Cloudepa Systems', rate: 9600, score: 62, problem: 'OVER_BAND' },
  { name: 'Tomo Nakamura', skills: ['Java', 'Spring Boot'], location: 'Dallas, TX', auth: 'US_CITIZEN', vendor: 'Kestrel Consulting', rate: 8200, score: 71, problem: 'NO_AGREEMENT' },
  { name: 'Peter Osei', skills: ['Java', 'Spring Boot', 'AWS'], location: 'Dallas, TX', auth: 'US_CITIZEN', vendor: 'Brightmoor Staffing', rate: 8100, score: 84, problem: 'TENURE', workedHere: { months: 19, endedDaysAgo: 40 } },
  { name: 'Dermot Kelso', skills: ['Java'], location: 'Dallas, TX', auth: 'US_CITIZEN', vendor: 'Vertex Talent', rate: 8000, score: 58, problem: 'BARRED' },
  { name: 'Sade Aluko', skills: ['Java', 'AWS'], location: 'Dallas, TX', auth: null, vendor: 'Vertex Talent', rate: 8400, score: 79, problem: 'NO_PERMIT' },
]

const SAP_PILE: Candidate[] = [
  { name: 'Anita Desai', skills: ['SAP FICO', 'S/4HANA'], location: 'Denver, CO', auth: 'US_CITIZEN', vendor: 'Cloudepa Systems', rate: 12500, score: null, problem: null },
  { name: 'Ravi Patel', skills: ['SAP FICO', 'SAP BRIM'], location: 'Remote', auth: 'H1B', vendor: 'Vertex Talent', rate: 15500, score: null, problem: 'OVER_BAND' },
  { name: 'Grace Lindqvist', skills: ['SAP FICO'], location: 'Denver, CO', auth: 'GC', vendor: 'Brightmoor Staffing', rate: 12000, score: null, problem: null },
]

const DATA_PILE: Candidate[] = [
  { name: 'Meera Krishnan', skills: ['Snowflake', 'Python'], location: 'Austin, TX', auth: 'GC', vendor: 'Cloudepa Systems', rate: 9800, score: null, problem: null },
  { name: 'Owen Trevelyan', skills: ['Snowflake', 'dbt'], location: 'Remote', auth: 'US_CITIZEN', vendor: 'Brightmoor Staffing', rate: 10200, score: null, problem: 'TOO_LATE' },
]

/**
 * Fill one client company.
 *
 * Everything hangs off the company row, so reaping it takes the whole
 * sandbox with it and two visitors never meet.
 */
export async function seedDemoClientCompany(input: {
  personId: string
  personName: string
  companyName: string
  slug: string
}): Promise<Seeded> {
  const now = new Date()
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000)
  const daysAhead = (n: number) => new Date(now.getTime() + n * 86_400_000)
  const expires = daysAhead(DEMO_DAYS)

  const company = await prisma.company.create({
    data: {
      name: input.companyName,
      slug: input.slug,
      kind: 'CLIENT',
      currency: 'USD',
      outsideAccess: defaultPostureFor('CLIENT'),
      isDemo: true,
      demoExpiresAt: expires,
    },
  })

  // ── The visitor's seat ──────────────────────────────────────────────
  const roles = await Promise.all(
    rolesFor('CLIENT').map((r) =>
      prisma.role.create({
        data: {
          companyId: company.id,
          name: r.name,
          permissions: r.permissions as string[],
          isDefault: r.isOwner ?? false,
        },
      })
    )
  )

  const ownerSeed = rolesFor('CLIENT').find((r) => r.isOwner)
  const owner = roles.find((r) => r.name === ownerSeed?.name) ?? roles[0]

  const orgUnit = await prisma.orgUnit.create({
    data: { companyId: company.id, name: 'Enterprise Applications', kind: 'DEPARTMENT' },
  })

  const costCenter = await prisma.costCenter.create({
    data: {
      companyId: company.id,
      code: 'EA-4100',
      name: 'Enterprise Applications — contingent',
      orgUnitId: orgUnit.id,
    },
  })

  await prisma.context.create({
    data: {
      personId: input.personId,
      companyId: company.id,
      roleId: owner.id,
      orgUnitId: orgUnit.id,
      type: 'EMPLOYEE',
      grantReason: 'Demo workspace',
    },
  })

  // The manager whose roles these are. Somebody has to have raised them,
  // and a requisition with no raiser reads as having come from nowhere.
  const manager = await prisma.person.create({
    data: { name: 'Dana Whitfield', primaryEmail: `dana.whitfield@${input.slug}.demo` },
  })
  await prisma.context.create({
    data: {
      personId: manager.id,
      companyId: company.id,
      roleId: roles.find((r) => /manager/i.test(r.name))?.id ?? owner.id,
      orgUnitId: orgUnit.id,
      type: 'EMPLOYEE',
      grantReason: 'Demo workspace',
    },
  })

  // ── The rules this client actually enforces ─────────────────────────
  //
  // Addendum E: BLOCK where legally grounded, WARN and capture a reason
  // everywhere else. Seeded so the screen has something real to enforce
  // rather than a policy screen full of zeroes.
  const policy = await prisma.governancePolicy.create({
    data: {
      companyId: company.id,
      name: 'Standard Contingent Workforce Policy',
      description: 'Co-employment controls for contract staff.',
    },
  })

  await prisma.governanceRule.createMany({
    data: [
      {
        policyId: policy.id,
        ruleType: 'TENURE_CAP',
        enforcementMode: 'BLOCK',
        parameters: { maxMonths: 18 },
        description: 'Nobody works here more than 18 months without converting.',
      },
      {
        policyId: policy.id,
        ruleType: 'BREAK_IN_SERVICE',
        enforcementMode: 'BLOCK',
        parameters: { minDays: 90 },
        description: 'Ninety days out before coming back on contract.',
      },
      {
        policyId: policy.id,
        ruleType: 'RATE_BAND',
        enforcementMode: 'WARN',
        parameters: { minRate: 6000, maxRate: 16000 },
        description: 'Outside the approved band needs a reason on the record.',
      },
    ],
  })

  // ── The suppliers ───────────────────────────────────────────────────
  const vendors = new Map<string, { id: string }>()

  for (const v of VENDORS) {
    const vc = await prisma.company.create({
      data: {
        name: v.name,
        slug: `${input.slug}-${v.name.toLowerCase().replace(/[^a-z]+/g, '-')}`,
        kind: 'VENDOR',
        currency: 'USD',
        outsideAccess: defaultPostureFor('VENDOR'),
        isDemo: true,
        demoExpiresAt: expires,
      },
    })

    if (v.agreement) {
      await prisma.masterAgreement.create({
        data: {
          vendorId: vc.id,
          clientId: company.id,
          paymentTerms: 45,
          signedAt: daysAgo(400),
        },
      })
    }

    vendors.set(v.name, { id: vc.id })
  }

  // ── The roles ───────────────────────────────────────────────────────
  const roleSpecs = [
    {
      title: 'Senior Java Developer',
      skills: ['Java', 'Spring Boot', 'AWS'],
      location: 'Dallas, TX — hybrid',
      min: 7500,
      max: 9000,
      auth: 'US_CITIZEN',
      startsIn: 14,
      openedDaysAgo: 9,
      pile: JAVA_PILE,
    },
    {
      title: 'SAP FICO Consultant',
      skills: ['SAP FICO', 'S/4HANA'],
      location: 'Denver, CO',
      min: 11000,
      max: 14000,
      auth: null,
      startsIn: 30,
      openedDaysAgo: 5,
      pile: SAP_PILE,
    },
    {
      title: 'Data Engineer — Snowflake',
      skills: ['Snowflake', 'Python'],
      location: 'Austin, TX',
      min: 9000,
      max: 12000,
      auth: null,
      startsIn: 21,
      openedDaysAgo: 3,
      pile: DATA_PILE,
    },
  ]

  const known = new Map<string, { personId: string; consultantId: string }>()
  let arrived = 0

  for (const spec of roleSpecs) {
    // The seat, where more than one record points at it.
    //
    // A client's requisition and a prime's mirror of it are two rows for
    // one job, and the database refuses two submissions of the same
    // person against one requirement — which is the deduplication
    // working, not a limitation. The duplicate a buyer actually suffers
    // arrives on the other record, so the seat is what holds them
    // together.
    const needsSeat = spec.pile.some((c) => c.problem === 'DUPLICATE')

    const opening = needsSeat
      ? await prisma.opening.create({
          data: {
            companyId: company.id,
            clientCompanyId: company.id,
            title: spec.title,
            skills: spec.skills,
            location: spec.location,
            firstSeen: daysAgo(spec.openedDaysAgo),
            lastSeen: daysAgo(spec.openedDaysAgo),
          },
        })
      : null

    const requirement = await prisma.requirement.create({
      data: {
        companyId: company.id,
        openingId: opening?.id ?? null,
        title: spec.title,
        skills: spec.skills,
        location: spec.location,
        billMin: spec.min,
        billMax: spec.max,
        workAuthRequired: spec.auth,
        startDate: daysAhead(spec.startsIn),
        neededBy: daysAhead(spec.startsIn),
        status: 'OPEN',
        approvalState: 'AUTO_APPROVED',
        raisedById: manager.id,
        orgUnitId: orgUnit.id,
        costCenterId: costCenter.id,
        headcount: 1,
        createdAt: daysAgo(spec.openedDaysAgo),
        source: 'MANUAL',
      },
    })

    // Each invited supplier gets their own ceiling. The band lives here
    // and never on the requirement, so no vendor can read another's.
    for (const v of VENDORS.filter((x) => x.invited)) {
      await prisma.requirementInvitation.create({
        data: {
          requirementId: requirement.id,
          fromCompanyId: company.id,
          toCompanyId: vendors.get(v.name)!.id,
          payMin: spec.min,
          payMax: v.bandOfMax ? Math.round(spec.max * v.bandOfMax) : null,
          expiresAt: daysAhead(spec.startsIn),
          status: 'ACCEPTED',
          createdAt: daysAgo(spec.openedDaysAgo),
        },
      })
    }

    // The prime's own record of the same job. A sub-vendor was submitted
    // against this one and the prime passed them upward, which is how the
    // client ends up holding two rows for one consultant.
    const mirror = opening
      ? await prisma.requirement.create({
          data: {
            companyId: vendors.get('Vertex Talent')!.id,
            openingId: opening.id,
            mirroredFromId: requirement.id,
            payerCompanyId: company.id,
            endClientCompanyId: company.id,
            title: spec.title,
            skills: spec.skills,
            location: spec.location,
            billMin: spec.min,
            billMax: spec.max,
            workAuthRequired: spec.auth,
            startDate: daysAhead(spec.startsIn),
            status: 'OPEN',
            createdAt: daysAgo(spec.openedDaysAgo - 1),
            source: 'NETWORK',
          },
        })
      : null

    for (const [i, c] of spec.pile.entries()) {
      const person = await ensurePerson(known, c, input.slug)
      const vendor = vendors.get(c.vendor)!

      // Prior work here, through whoever. Counted against the person, not
      // the contract — which is the whole reason the ledger exists.
      if (c.workedHere) {
        const ended = daysAgo(c.workedHere.endedDaysAgo)
        const started = new Date(ended.getTime() - c.workedHere.months * 30.44 * 86_400_000)
        const already = await prisma.sellContract.findFirst({
          where: { personId: person.personId, clientCompanyId: company.id },
          select: { id: true },
        })
        if (!already) {
          await prisma.sellContract.create({
            data: {
              companyId: vendor.id,
              personId: person.personId,
              clientCompanyId: company.id,
              billRate: c.rate - 400,
              billCurrency: 'USD',
              startDate: started,
              endDate: ended,
              state: 'ENDED',
              paymentTerms: 45,
            },
          })
        }
      }

      if (c.problem === 'BARRED') {
        await prisma.blacklist.upsert({
          where: {
            companyId_targetType_targetId: {
              companyId: company.id,
              targetType: 'PERSON',
              targetId: person.personId,
            },
          },
          create: {
            companyId: company.id,
            targetType: 'PERSON',
            targetId: person.personId,
            reason: 'Left mid-project without notice in March',
            blockedById: manager.id,
            blockedAt: daysAgo(150),
          },
          update: {},
        })
      }

      // The duplicate has to arrive after the one it duplicates, or first
      // in wins picks the wrong vendor and the demo teaches the opposite
      // of the rule.
      const submittedAt =
        c.problem === 'DUPLICATE'
          ? daysAgo(spec.openedDaysAgo - 5)
          : daysAgo(spec.openedDaysAgo - 2 - (i % 4))

      const landsOn = c.problem === 'DUPLICATE' && mirror ? mirror.id : requirement.id

      await prisma.submission.create({
        data: {
          requirementId: landsOn,
          personId: person.personId,
          fromCompanyId: vendor.id,
          toCompanyId: company.id,
          kind: 'NETWORK',
          rate: c.rate,
          status: 'SUBMITTED',
          submittedAt,
          checkState: 'SENT',
          checkAttempt: 1,
        },
      })
      arrived++

      if (c.score != null) {
        await prisma.match.upsert({
          where: {
            requirementId_consultantId: {
              requirementId: requirement.id,
              consultantId: person.consultantId,
            },
          },
          create: {
            requirementId: requirement.id,
            consultantId: person.consultantId,
            score: c.score,
            confidence: c.score >= 85 ? 'HIGH' : c.score >= 70 ? 'MODERATE' : 'LOW',
            factors: factorsFor(c, spec.skills),
            basis: `${spec.skills.length} required skills against the CV and ${c.location}.`,
            unknowns: c.auth == null ? 'No work authorisation recorded.' : null,
          },
          update: {},
        })
      }
    }
  }

  // ── One person already working here ─────────────────────────────────
  //
  // So tenure, timesheets, invoices and the org view are not three empty
  // screens behind the one good one.
  const inPost = await ensurePerson(
    known,
    {
      name: 'Helena Vaz',
      skills: ['SAP FICO', 'S/4HANA'],
      location: 'Denver, CO',
      auth: 'US_CITIZEN',
      vendor: 'Cloudepa Systems',
      rate: 12800,
      score: null,
      problem: null,
    },
    input.slug
  )

  const live = await prisma.sellContract.create({
    data: {
      companyId: vendors.get('Cloudepa Systems')!.id,
      personId: inPost.personId,
      clientCompanyId: company.id,
      orgUnitId: orgUnit.id,
      billRate: 12800,
      billCurrency: 'USD',
      startDate: daysAgo(300),
      endDate: daysAhead(65),
      state: 'IN_PROGRESS',
      paymentTerms: 45,
    },
  })

  let sheets = 0
  for (let w = 4; w >= 1; w--) {
    const start = daysAgo(w * 7 + 2)
    const end = daysAgo(w * 7 - 4)
    const days: Record<string, number> = {}
    const d = new Date(start)
    while (d <= end) {
      const dow = d.getUTCDay()
      if (dow !== 0 && dow !== 6) days[d.toISOString().slice(0, 10)] = 8
      d.setUTCDate(d.getUTCDate() + 1)
    }
    await prisma.timesheet.create({
      data: {
        sellContractId: live.id,
        personId: inPost.personId,
        periodStart: start,
        periodEnd: end,
        days,
        totalHours: Object.values(days).reduce((a, b) => a + b, 0),
        status: w > 1 ? 'APPROVED' : 'SUBMITTED',
        approvedAt: w > 1 ? daysAgo(w * 7 - 5) : null,
      },
    })
    sheets++
  }

  return {
    companyId: company.id,
    companyName: company.name,
    counts: {
      openRoles: roleSpecs.length,
      submissionsArrived: arrived,
      suppliers: VENDORS.length,
      workingHere: 1,
      timesheets: sheets,
    },
  }
}

// ── Small helpers ─────────────────────────────────────────────────────

/**
 * One person per name, however many vendors send them.
 *
 * The duplicate only demonstrates anything if both submissions point at
 * the same Person row. Creating two would produce two people who happen
 * to share a name, which is the bug this product exists to prevent.
 */
async function ensurePerson(
  known: Map<string, { personId: string; consultantId: string }>,
  c: Candidate,
  slug: string
): Promise<{ personId: string; consultantId: string }> {
  const hit = known.get(c.name)
  if (hit) return hit

  const person = await prisma.person.create({
    data: {
      name: c.name,
      primaryEmail: `${c.name.toLowerCase().replace(/\s+/g, '.')}@${slug}.demo`,
    },
  })

  const profile = await prisma.consultantProfile.create({
    data: {
      personId: person.id,
      headline: c.skills.slice(0, 2).join(' · '),
      skills: c.skills,
      location: c.location,
      workAuth: c.auth,
      rateFloor: c.rate,
      availableFrom:
        c.problem === 'TOO_LATE'
          ? new Date(Date.now() + 75 * 86_400_000)
          : new Date(Date.now() + 7 * 86_400_000),
      visibility: 'VERIFIED',
    },
  })

  const made = { personId: person.id, consultantId: profile.id }
  known.set(c.name, made)
  return made
}

/**
 * What the score is made of.
 *
 * Never a bare number. A match without factors is the thing every VMS
 * already sells and nobody believes.
 */
function factorsFor(c: Candidate, required: string[]): { label: string; value: number; weight: number }[] {
  const have = new Set(c.skills.map((s) => s.toLowerCase()))
  const out = required.map((s) => ({
    label: s,
    value: have.has(s.toLowerCase()) ? 100 : 0,
    weight: Math.round(70 / required.length),
  }))
  out.push({ label: 'Location', value: /remote/i.test(c.location) ? 60 : 100, weight: 15 })
  out.push({ label: 'Work authorisation', value: c.auth ? 100 : 0, weight: 15 })
  return out
}
