/**
 * The third seat, not the first two.
 *
 * `demo-seed.ts` seeds the visitor as a vendor's owner. `demo-seed-client.ts`
 * seeds them as a client's programme manager. Both put the visitor in charge
 * of a company. A candidate is not in charge of a company — they are one
 * person, on somebody else's bench, and the whole point of `CONSULTANT_NAV`
 * ("You → Grow") is that it never asks them to think like an agency.
 *
 * So this seeds the opposite shape: one Person (the visitor) with a real
 * ConsultantProfile, sitting on an invented agency's bench, mid-placement at
 * an invented client — a live contract with timesheets, and one more role
 * still in flight — so /dashboard/my-work, /dashboard/my-benches and
 * /dashboard/my-page all open to something real rather than an empty state.
 *
 * Deliberately smaller than the other two: a candidate's day is one person's
 * worth of facts, not an agency's whole book.
 */

import { prisma } from '@/lib/db'
import { defaultPostureFor } from '@/lib/walls'
import { DEMO_DAYS } from '@/lib/demo-seed'
import type { Seeded } from '@/lib/demo-seed'

/** Names that read like a staffing firm without naming a real one. */
const AGENCIES = [
  'Kestrel Consulting', 'Alderway Partners', 'Marchfield Group', 'Two Rivers Talent',
]

/** And names that read like a company that buys contract staff. */
const SITES = [
  'Calder Manufacturing', 'Harlow Health', 'Ravensmere Energy', 'Stanmore Logistics',
]

export async function seedDemoConsultant(input: {
  personId: string
  personName: string
  companyName: string
  slug: string
}): Promise<Seeded> {
  const now = new Date()
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000)
  const daysAhead = (n: number) => new Date(now.getTime() + n * 86_400_000)
  const expiresAt = daysAhead(DEMO_DAYS)

  const agencyName = AGENCIES[Math.floor(Math.random() * AGENCIES.length)]
  const siteName = SITES[Math.floor(Math.random() * SITES.length)]

  // ── The agency that has you on their bench ──────────────────────────
  const agency = await prisma.company.create({
    data: {
      name: agencyName,
      slug: `${input.slug}-agency`,
      kind: 'VENDOR',
      currency: 'USD',
      outsideAccess: defaultPostureFor('VENDOR'),
      isDemo: true,
      demoExpiresAt: expiresAt,
    },
  })

  // ── Where you actually go ────────────────────────────────────────────
  const client = await prisma.company.create({
    data: {
      name: `${siteName} (demo client)`,
      slug: `${input.slug}-client`,
      kind: 'CLIENT',
      currency: 'USD',
      outsideAccess: defaultPostureFor('CLIENT'),
      isDemo: true,
      demoExpiresAt: expiresAt,
    },
  })

  // ── You, as a candidate rather than as an owner ──────────────────────
  //
  // No Role and no EMPLOYEE context — a CONSULTANT context is deliberately
  // the only one, which is what makes `isConsultant` true and hands this
  // visitor CONSULTANT_NAV instead of the agency's own book.
  const profile = await prisma.consultantProfile.create({
    data: {
      personId: input.personId,
      headline: 'Senior Java Developer',
      skills: ['Java', 'Spring Boot', 'AWS', 'Kafka'],
      location: 'Denver, CO',
      workAuth: 'US_CITIZEN',
      rateFloor: 12000,
      availableFrom: daysAgo(60),
      visibility: 'VERIFIED',
      confirmedAt: daysAgo(4),
      confirmedVia: 'SMS',
      mobile: '+13035557890',
    },
  })

  await prisma.context.create({
    data: {
      personId: input.personId,
      companyId: agency.id,
      type: 'CONSULTANT',
      side: 'SELL',
      grantReason: 'Demo workspace',
    },
  })

  await prisma.benchListing.create({
    data: {
      consultantId: profile.id,
      companyId: agency.id,
      tier: 'RETAINED',
      rateMin: 12000,
      rateMax: 14500,
    },
  })

  // ── One role still in flight ──────────────────────────────────────────
  const openRole = await prisma.requirement.create({
    data: {
      companyId: agency.id,
      title: 'Staff Java Engineer',
      skills: ['Java', 'Kafka'],
      location: 'Remote',
      billMin: 12500,
      billMax: 15000,
      startDate: daysAhead(21),
      status: 'OPEN',
      approvalState: 'AUTO_APPROVED',
      payerCompanyId: client.id,
      source: 'REFERRAL',
      createdAt: daysAgo(6),
    },
  })

  await prisma.submission.create({
    data: {
      requirementId: openRole.id,
      personId: input.personId,
      fromCompanyId: agency.id,
      toCompanyId: client.id,
      kind: 'NETWORK',
      rate: 13500,
      status: 'SUBMITTED',
      submittedAt: daysAgo(3),
      checkState: 'SENT',
      checkAttempt: 1,
    },
  })

  // ── A live placement, with real hours behind it ───────────────────────
  const contract = await prisma.sellContract.create({
    data: {
      companyId: agency.id,
      personId: input.personId,
      clientCompanyId: client.id,
      endClientCompanyId: client.id,
      billRate: 12500,
      billCurrency: 'USD',
      startDate: daysAgo(60),
      endDate: daysAhead(120),
      state: 'IN_PROGRESS',
      paymentTerms: 30,
    },
  })

  // Three weeks behind you, approved; this week, waiting on a signature —
  // which is what makes "awaiting approval" on /dashboard/my-work real
  // rather than always reading zero.
  let timesheetCount = 0
  for (let w = 3; w >= 0; w--) {
    const start = daysAgo(w * 7 + 4)
    const end = daysAgo(w * 7 - 2)
    const days: Record<string, number> = {}
    const d = new Date(start)
    while (d <= end) {
      const dow = d.getUTCDay()
      if (dow !== 0 && dow !== 6) days[d.toISOString().slice(0, 10)] = 8
      d.setUTCDate(d.getUTCDate() + 1)
    }
    const total = Object.values(days).reduce((a, b) => a + b, 0)
    await prisma.timesheet.create({
      data: {
        sellContractId: contract.id,
        personId: input.personId,
        periodStart: start,
        periodEnd: end,
        days,
        totalHours: total,
        status: w > 0 ? 'APPROVED' : 'SUBMITTED',
        approvedAt: w > 0 ? daysAgo(w * 7 - 5) : null,
      },
    })
    timesheetCount++
  }

  return {
    companyId: agency.id,
    companyName: agency.name,
    counts: {
      placements: 1,
      openSubmissions: 1,
      timesheets: timesheetCount,
    },
  }
}
