/**
 * One company's worth of demo data, and nobody else's.
 *
 * `prisma/seed.ts` starts by deleting everything. That is right for a
 * development database and catastrophic for a live one, so a visitor who
 * wants to look around cannot use it.
 *
 * This fills a single company. Every row it writes hangs off the company
 * it was given, so two people demoing at once never see each other, and
 * either can break their own copy freely.
 *
 * ── What it has to contain ───────────────────────────────────────────
 *
 * Enough that no screen is empty, because an empty screen teaches a
 * visitor nothing and reads as a broken product. And enough history that
 * the two slow surfaces mean something: the rate benchmark needs real
 * submissions behind it, and the recurring-failure panel needs a habit to
 * have formed.
 *
 * ── What it must never contain ───────────────────────────────────────
 *
 * Anything that looks like a real client. The companies here are plainly
 * invented, and the banner says demo on every screen — a prospect who
 * mistakes seeded numbers for a benchmark of their own book has been
 * misled by us.
 */

import { prisma } from '@/lib/db'
import { rolesFor } from '@/lib/company-defaults'
import { defaultPostureFor } from '@/lib/walls'

/** How long a demo lives before it is reaped. */
export const DEMO_DAYS = 14

const CONSULTANTS = [
  { name: 'Anita Desai', headline: 'SAP FICO Lead', skills: ['SAP FICO', 'S/4HANA', 'ABAP'], rate: 11000, location: 'Denver, CO', auth: 'US_CITIZEN' },
  { name: 'Ravi Patel', headline: 'Senior SAP BRIM Consultant', skills: ['SAP BRIM', 'Revenue Accounting', 'S/4HANA'], rate: 12500, location: 'Remote', auth: 'H1B' },
  { name: 'Meera Krishnan', headline: 'Data Engineer', skills: ['Snowflake', 'Python', 'Databricks'], rate: 9500, location: 'Austin, TX', auth: 'GC' },
  { name: 'David Chen', headline: 'DevOps / SRE', skills: ['Kubernetes', 'Terraform', 'AWS'], rate: 10500, location: 'Remote', auth: 'US_CITIZEN' },
  { name: 'Priya Sharma', headline: 'Azure Cloud Architect', skills: ['Azure', 'Terraform', '.NET'], rate: 13000, location: 'Dallas, TX', auth: 'US_CITIZEN' },
  { name: 'John Martinez', headline: 'Workday Integrations', skills: ['Workday', 'Integrations'], rate: 9000, location: 'Denver, CO', auth: 'GC' },
]

const ROLES = [
  { title: 'Senior SAP FICO Consultant', skills: ['SAP FICO', 'S/4HANA'], location: 'Denver, CO', min: 11000, max: 14000 },
  { title: 'Data Engineer — Snowflake', skills: ['Snowflake', 'Python'], location: 'Austin, TX', min: 9000, max: 12000 },
  { title: 'Kubernetes Platform Engineer', skills: ['Kubernetes', 'Terraform'], location: 'Remote', min: 10000, max: 13500 },
]

export interface Seeded {
  companyId: string
  companyName: string
  counts: Record<string, number>
}

/**
 * Fill one company.
 *
 * Everything is relative to `now`, so a demo created today shows work
 * done last week rather than dates from whenever this was written.
 */
export async function seedDemoCompany(input: {
  personId: string
  personName: string
  companyName: string
  slug: string
}): Promise<Seeded> {
  const now = new Date()
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000)
  const daysAhead = (n: number) => new Date(now.getTime() + n * 86_400_000)

  const company = await prisma.company.create({
    data: {
      name: input.companyName,
      slug: input.slug,
      kind: 'VENDOR',
      currency: 'USD',
      templatePack: 'US_SAP',
      outsideAccess: defaultPostureFor('VENDOR'),
      isDemo: true,
      demoExpiresAt: daysAhead(DEMO_DAYS),
    },
  })

  // The client they bill. Invented, and named so nobody mistakes it.
  const client = await prisma.company.create({
    data: {
      name: 'Northwind Medical (demo client)',
      slug: `${input.slug}-client`,
      kind: 'CLIENT',
      currency: 'USD',
      outsideAccess: defaultPostureFor('CLIENT'),
      isDemo: true,
      demoExpiresAt: daysAhead(DEMO_DAYS),
    },
  })

  // ── Roles and the seat at the top ───────────────────────────────────
  const roles = await Promise.all(
    rolesFor('VENDOR').map((r) =>
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

  const ownerSeed = rolesFor('VENDOR').find((r) => r.isOwner)
  const owner = roles.find((r) => r.name === ownerSeed?.name) ?? roles[0]

  await prisma.context.create({
    data: {
      personId: input.personId,
      companyId: company.id,
      roleId: owner.id,
      type: 'EMPLOYEE',
      grantReason: 'Demo workspace',
    },
  })

  // ── The bench ───────────────────────────────────────────────────────
  //
  // Freshness varies deliberately: some confirmed this week, some a month
  // ago, one asked twice and silent. The filter ranks all three
  // differently and the demo should show that rather than a tidy row of
  // identical records.
  const people: { id: string; consultantId: string; name: string }[] = []

  for (const [i, c] of CONSULTANTS.entries()) {
    const person = await prisma.person.create({
      data: {
        name: c.name,
        primaryEmail: `${c.name.toLowerCase().replace(/\s+/g, '.')}@${input.slug}.demo`,
      },
    })

    const fresh =
      i % 3 === 0
        ? { confirmedAt: daysAgo(3), confirmedVia: 'SMS', unanswered: 0, askedAt: daysAgo(3) }
        : i % 3 === 1
          ? { confirmedAt: daysAgo(34), confirmedVia: 'SMS', unanswered: 0, askedAt: daysAgo(34) }
          : { confirmedAt: null, unanswered: 2, askedAt: daysAgo(15) }

    const profile = await prisma.consultantProfile.create({
      data: {
        personId: person.id,
        headline: c.headline,
        skills: c.skills,
        location: c.location,
        workAuth: c.auth,
        rateFloor: c.rate,
        availableFrom: daysAhead(i * 3),
        visibility: 'VERIFIED',
        mobile: `+1303555${String(2000 + i).slice(-4)}`,
        ...fresh,
      },
    })

    await prisma.benchListing.create({
      data: {
        consultantId: profile.id,
        companyId: company.id,
        tier: i < 2 ? 'RETAINED' : 'MARKETING',
        rateMin: c.rate,
        rateMax: c.rate + 2500,
      },
    })

    people.push({ id: person.id, consultantId: profile.id, name: c.name })
  }

  // ── Demand ──────────────────────────────────────────────────────────
  const requirements = await Promise.all(
    ROLES.map((r, i) =>
      prisma.requirement.create({
        data: {
          companyId: company.id,
          title: r.title,
          skills: r.skills,
          location: r.location,
          billMin: r.min,
          billMax: r.max,
          startDate: daysAhead(21 + i * 7),
          status: 'OPEN',
          approvalState: 'AUTO_APPROVED',
          payerCompanyId: client.id,
          source: 'DICE',
          createdAt: daysAgo(10 - i * 2),
        },
      })
    )
  )

  // ── Six months of closed business ───────────────────────────────────
  //
  // The rate benchmark says nothing without it, and the recurring-failure
  // panel has no habit to notice. Rates cluster where the market bears
  // with a tail of optimistic ones that lost on rate — which is what
  // teaches the benchmark where the ceiling is.
  let closed = 0
  const checkRows: any[] = []

  for (const [ri, r] of ROLES.entries()) {
    for (let round = 0; round < 3; round++) {
      const openedDaysAgo = 140 - round * 40
      const past = await prisma.requirement.create({
        data: {
          companyId: company.id,
          title: `${r.title} — closed`,
          skills: r.skills,
          location: r.location,
          billMin: r.min,
          billMax: r.max,
          status: 'CLOSED',
          approvalState: 'AUTO_APPROVED',
          payerCompanyId: client.id,
          source: 'DICE',
          createdAt: daysAgo(openedDaysAgo),
        },
      })

      for (let i = 0; i < 4; i++) {
        const who = people[(ri * 2 + round + i) % people.length]
        const n = round * 4 + i
        const optimistic = n % 3 === 2
        const rate = optimistic ? r.max + 3000 : r.min + (n % 5) * 400
        const placed = n % 4 === 0 && !optimistic
        // A CV habit, on most of them. One vendor, one process fault.
        const noCv = n % 5 !== 0

        const sub = await prisma.submission.create({
          data: {
            requirementId: past.id,
            personId: who.id,
            fromCompanyId: company.id,
            toCompanyId: client.id,
            kind: 'BENCH',
            rate,
            status: placed ? 'PLACED' : 'REJECTED',
            submittedAt: daysAgo(openedDaysAgo - 5),
            checkState: 'SENT',
            checkAttempt: 1,
            ...(placed
              ? {}
              : {
                  rejectReason: optimistic ? 'RATE' : 'INTERVIEW',
                  rejectNote: optimistic
                    ? 'Above what they would pay.'
                    : 'Went with another candidate.',
                  rejectedAt: daysAgo(openedDaysAgo - 9),
                }),
          },
        })

        checkRows.push({
          companyId: company.id,
          recordType: 'SUBMISSION',
          recordId: sub.id,
          checker: 'RULE',
          code: 'CV_ATTACHED',
          verdict: noCv ? 'FAIL' : 'PASS',
          reason: noCv
            ? `${who.name} has no CV on this submission. The client reads the CV, not the row.`
            : 'CV attached.',
          at: daysAgo(openedDaysAgo - 5),
        })

        closed++
      }
    }
  }

  await prisma.check.createMany({ data: checkRows })

  // ── This fortnight's pipeline ───────────────────────────────────────
  //
  // Without it "the number" — good submissions a day, per role — reads as
  // a dash on the first screen a visitor sees, and the headline measure of
  // the whole product looks dead on arrival.
  //
  // Deliberately short of the bar. Showing five a day out of the box
  // would claim the product delivers what a vendor has to earn, and the
  // first real week would then look like a regression.
  let live = 0
  for (const [ri, r] of requirements.entries()) {
    for (let i = 0; i < 3; i++) {
      const who = people[(ri * 3 + i) % people.length]
      const daysBack = 2 + i * 3 + ri
      const rate = ROLES[ri].min + i * 500

      // Two of the nine are still being fixed, which is what a working
      // check loop looks like rather than a clean sheet.
      const clean = !(ri === 1 && i === 2)

      await prisma.submission.create({
        data: {
          requirementId: r.id,
          personId: who.id,
          fromCompanyId: company.id,
          toCompanyId: client.id,
          kind: 'BENCH',
          rate,
          status: i === 0 ? 'SHORTLISTED' : 'SUBMITTED',
          submittedAt: daysAgo(daysBack),
          checkState: clean ? 'SENT' : 'NEEDS_FIX',
          checkAttempt: 1,
        },
      })
      live++
    }
  }

  // ── One live placement, with money behind it ────────────────────────
  const msa = await prisma.masterAgreement.create({
    data: {
      vendorId: company.id,
      clientId: client.id,
      paymentTerms: 30,
      signedAt: daysAgo(178),
    },
  })

  const engagement = await prisma.engagement.create({
    data: { msaId: msa.id, title: 'SAP Programme — Northwind', invoiceCycle: 'MONTHLY' },
  })

  const po = await prisma.purchaseOrder.create({
    data: {
      number: 'NW-PO-40118',
      issuedById: client.id,
      issuedToId: company.id,
      amount: 250000,
      status: 'OPEN',
      startDate: daysAgo(180),
      endDate: daysAhead(180),
    },
  })

  const placedPerson = people[0]

  const contract = await prisma.sellContract.create({
    data: {
      companyId: company.id,
      personId: placedPerson.id,
      clientCompanyId: client.id,
      engagementId: engagement.id,
      msaId: msa.id,
      purchaseOrderId: po.id,
      billRate: 13000,
      billCurrency: 'USD',
      startDate: daysAgo(60),
      endDate: daysAhead(120),
      state: 'IN_PROGRESS',
      paymentTerms: 30,
    },
  })

  // Weekly timesheets across the month just gone, with the daily
  // breakdown — which is what lets a monthly invoice take exactly its own
  // days out of a week that crosses the boundary.
  const sheets: string[] = []
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
    const total = Object.values(days).reduce((a, b) => a + b, 0)
    const ts = await prisma.timesheet.create({
      data: {
        sellContractId: contract.id,
        personId: placedPerson.id,
        periodStart: start,
        periodEnd: end,
        days,
        totalHours: total,
        status: w > 1 ? 'APPROVED' : 'SUBMITTED',
        approvedAt: w > 1 ? daysAgo(w * 7 - 5) : null,
      },
    })
    if (w > 1) sheets.push(ts.id)
  }

  return {
    companyId: company.id,
    companyName: company.name,
    counts: {
      consultants: people.length,
      openRoles: requirements.length,
      closedSubmissions: closed,
      livePipeline: live,
      timesheets: sheets.length + 1,
      contracts: 1,
    },
  }
}

/**
 * Reap the ones nobody came back to.
 *
 * Deleting a company cascades to everything hanging off it, which is why
 * every row above was written against one.
 */
export async function reapExpiredDemos(now: Date): Promise<number> {
  const { count } = await prisma.company.deleteMany({
    where: { isDemo: true, demoExpiresAt: { lt: now } },
  })
  return count
}
