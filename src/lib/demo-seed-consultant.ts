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
import { seedProfile } from '@/lib/candidate-fixture'
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

  // ── The other two who also have you ─────────────────────────────────
  //
  // "Who has you" is the one page in the consultant portal that cannot be
  // demonstrated with one vendor, and it was seeded with one. A
  // consultant on a single bench sees a list of length one and learns
  // nothing; a consultant on three sees the thing the page exists for —
  // who is representing them, for what, and who is holding them right
  // now. It is also the cross-vendor case tenure aggregation rests on.
  //
  // They never learn from us that the other two exist in each other's
  // sight. This is the consultant's own view of their own
  // representation, which is the one place the whole picture belongs.
  const alsoHaveYou = await Promise.all(
    ['Northlane Partners', 'Verrick Staffing'].map((name, i) =>
      prisma.company.create({
        data: {
          name,
          slug: `${input.slug}-agency-${i + 2}`,
          kind: 'VENDOR',
          currency: 'USD',
          outsideAccess: defaultPostureFor('VENDOR'),
          isDemo: true,
          demoExpiresAt: expiresAt,
        },
      })
    )
  )

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
      confirmedVia: 'EMAIL',
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

  // ── What they are actually paid, and when things are due ────────────
  //
  // Both were missing and both are things a consultant asked for by
  // name. Without the buy side their own rate reads "not recorded on
  // Etyme" and the money they are owed cannot be worked out at all;
  // without cycles, the one party with a deadline is the only party who
  // cannot see it.
  const buy = await prisma.buyContract.create({
    data: {
      companyId: agency.id,
      payCurrency: 'USD',
      contractType: 'W2',
      startDate: contract.startDate,
      candidates: {
        create: {
          personId: input.personId,
          // Below the bill rate, which is the point of a margin, and a
          // real number rather than a round one.
          payRate: 9600,
          startDate: contract.startDate,
        },
      },
    },
  })

  await prisma.contractLink.create({
    data: {
      sellContractId: contract.id,
      buyContractId: buy.id,
      effectiveFrom: contract.startDate,
    },
  })

  // Four fortnights of deadlines, theirs and the client's, some already
  // passed so the overdue state is visible rather than theoretical.
  await prisma.cycle.createMany({
    data: [-1, 0, 1, 2].flatMap((n) => [
      { sellContractId: contract.id, kind: 'TIMESHEET_SUBMIT', dueOn: daysAhead(n * 14 + 2) },
      { sellContractId: contract.id, kind: 'TIMESHEET_APPROVE', dueOn: daysAhead(n * 14 + 5) },
    ]),
  })

  // ── The other two benches, and who is holding you ───────────────────
  //
  // A listing says a vendor may market you. A representation says one of
  // them is actively putting you somewhere, and only one may at a time
  // for a given client — which is the thing that stops two vendors
  // sending the same person to one client and getting both rejected.
  for (const [i, other] of alsoHaveYou.entries()) {
    await prisma.benchListing.create({
      data: {
        consultantId: profile.id,
        companyId: other.id,
        // Marketing rather than retained: they may put you forward, they
        // are not holding you exclusively. Two vendors both claiming a
        // retained listing is the state that should never exist.
        tier: 'MARKETING',
        grantedAt: daysAgo(40 + i * 25),
      },
    })
  }

  await prisma.representation.create({
    data: {
      personId: input.personId,
      companyId: agency.id,
      clientCompanyId: client.id,
      state: 'HELD',
      takenAt: daysAgo(9),
      // A hold is temporary by design. One that never expires is a
      // vendor owning somebody, which is what right-to-represent exists
      // to prevent.
      expiresAt: daysAhead(21),
      consentedAt: daysAgo(9),
      consentVia: 'EMAIL',
      holdKey: `${input.personId}:${client.id}`,
    },
  })

  // ── Two CVs, because everybody keeps more than one ──────────────────
  //
  // The general one and the one tailored to the role they actually want.
  // /api/me/resumes returned an empty list before this, so the page it
  // drives rendered a working screen with nothing on it — which passes
  // every test and shows a consultant nothing.
  await prisma.resume.createMany({
    data: [
      {
        personId: input.personId,
        label: `${profile.headline} 2026`,
        fileName: 'cv-general-2026.pdf',
        contentType: 'application/pdf',
        sizeBytes: 184_320,
        storage: 'DB',
      },
      {
        personId: input.personId,
        label: 'Tailored — platform work',
        fileName: 'cv-platform-2026.pdf',
        contentType: 'application/pdf',
        sizeBytes: 171_008,
        storage: 'DB',
      },
    ],
  })

  // ── Things that have happened to you ────────────────────────────────
  //
  // Also empty before. A notifications page with nothing in it is
  // indistinguishable from a broken one.
  await prisma.notification.createMany({
    data: [
      {
        personId: input.personId,
        companyId: agency.id,
        type: 'TIMESHEET',
        title: 'Your week was approved',
        body: `${client.name} approved your hours. It will be on the next invoice.`,
        channel: 'IN_APP',
        status: 'READ',
        createdAt: daysAgo(3),
      },
      {
        personId: input.personId,
        companyId: agency.id,
        type: 'SUBMISSION',
        title: 'You were put forward',
        body: `${agency.name} submitted you for a role after you said yes.`,
        channel: 'IN_APP',
        status: 'UNREAD',
        createdAt: daysAgo(9),
      },
      {
        personId: input.personId,
        companyId: alsoHaveYou[0].id,
        type: 'BENCH',
        title: `${alsoHaveYou[0].name} added you to their bench`,
        body: 'They can now put you forward for roles. You can revoke this at any time.',
        channel: 'IN_APP',
        status: 'UNREAD',
        createdAt: daysAgo(40),
      },
    ],
  })

  return {
    companyId: agency.id,
    companyName: agency.name,
    counts: {
      placements: 1,
      openSubmissions: 1,
      timesheets: timesheetCount,
      benches: 1 + alsoHaveYou.length,
      resumes: 2,
    },
  }
}
