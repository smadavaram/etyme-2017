/**
 * Seed script — populates realistic demo data for all working surfaces.
 *
 * Creates:
 *   - 1 vendor company (Cloudepa Inc.) with roles, a founder user
 *   - 1 client company (Terumo BCT)
 *   - 8 consultants with varied skills, work auth, availability
 *   - 6 requirements with varied statuses
 *   - 7 submissions in various pipeline stages
 *   - 4 sell contracts (2 active, 1 draft, 1 ended)
 *   - 5 timesheets across statuses
 *   - Bench listings for all consultants
 *
 * Run: npx tsx prisma/seed.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding Etyme database…')

  // Clean slate
  await prisma.$transaction([
    prisma.payment.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.timesheet.deleteMany(),
    prisma.submission.deleteMany(),
    prisma.match.deleteMany(),
    prisma.requirementInvitation.deleteMany(),
    prisma.rolloffEvent.deleteMany(),
    prisma.cycle.deleteMany(),
    prisma.contractLink.deleteMany(),
    prisma.sellContract.deleteMany(),
    prisma.buyContract.deleteMany(),
    prisma.engagement.deleteMany(),
    prisma.benchListing.deleteMany(),
    prisma.consultantProfile.deleteMany(),
    prisma.requirement.deleteMany(),
    prisma.automationLog.deleteMany(),
    prisma.accessLog.deleteMany(),
    prisma.context.deleteMany(),
    prisma.role.deleteMany(),
    prisma.masterAgreement.deleteMany(),
    prisma.person.deleteMany(),
    prisma.company.deleteMany(),
  ])

  // ── Companies ──────────────────────────────────
  const vendor = await prisma.company.create({
    data: {
      name: 'Cloudepa Inc.',
      slug: 'cloudepa',
      domain: 'cloudepa.com',
      domainVerified: true,
      kind: 'VENDOR',
      templatePack: 'US_SAP',
      currency: 'USD',
      siteLiveAt: new Date(),
      networkVerifiedAt: new Date(),
    },
  })

  const client = await prisma.company.create({
    data: {
      name: 'Terumo BCT',
      slug: 'terumobct',
      domain: 'terumobct.com',
      domainVerified: true,
      kind: 'CLIENT',
      currency: 'USD',
      siteLiveAt: new Date(),
    },
  })

  const client2 = await prisma.company.create({
    data: {
      name: 'Nike Inc.',
      slug: 'nike',
      domain: 'nike.com',
      domainVerified: true,
      kind: 'CLIENT',
      currency: 'USD',
    },
  })

  // ── Roles ──────────────────────────────────────
  const adminRole = await prisma.role.create({
    data: {
      companyId: vendor.id,
      name: 'Company Admin',
      permissions: [
        'consultants.read', 'consultants.write', 'consultants.cost',
        'requirements.read', 'requirements.write',
        'submissions.read', 'submissions.write',
        'contracts.read', 'contracts.write',
        'timesheets.read', 'timesheets.write', 'timesheets.approve',
        'invoices.read', 'invoices.issue', 'payments.record',
        'margin.read', 'pnl.read',
        'bench.read', 'bench.write',
        'company.admin',
      ],
      isDefault: false,
    },
  })

  // ── Founder / demo user ────────────────────────
  const founder = await prisma.person.create({
    data: {
      name: 'Sharath Madavaram',
      primaryEmail: 'smadavaram@gmail.com',
    },
  })

  await prisma.context.create({
    data: {
      personId: founder.id,
      type: 'EMPLOYEE',
      companyId: vendor.id,
      roleId: adminRole.id,
    },
  })

  // ── MSA ────────────────────────────────────────
  const msa = await prisma.masterAgreement.create({
    data: {
      vendorId: vendor.id,
      clientId: client.id,
      paymentTerms: 30,
      currency: 'USD',
    },
  })

  const msa2 = await prisma.masterAgreement.create({
    data: {
      vendorId: vendor.id,
      clientId: client2.id,
      paymentTerms: 45,
      currency: 'USD',
    },
  })

  // ── People & Consultant Profiles ───────────────
  const consultantData = [
    { name: 'Ravi Patel',       email: 'ravi@cloudepa.com',    headline: 'Senior SAP BRIM Consultant',    skills: ['SAP BRIM', 'Revenue Accounting', 'S/4HANA', 'ABAP'],    location: 'Dallas, TX',     workAuth: 'H1B',        availDays: -30, tier: 'RETAINED' as const,  rateMin: 11000, rateMax: 13000 },
    { name: 'Priya Sharma',     email: 'priya@cloudepa.com',   headline: 'Azure Cloud Architect',          skills: ['Azure', '.NET', 'Terraform', 'Kubernetes'],              location: 'Remote',         workAuth: 'US_CITIZEN', availDays: -10, tier: 'RETAINED' as const,  rateMin: 14000, rateMax: 16000 },
    { name: 'Anita Desai',      email: 'anita@cloudepa.com',   headline: 'SAP SD/MM Functional Lead',      skills: ['SAP SD', 'SAP MM', 'SAP S/4HANA', 'Integration'],       location: 'Chicago, IL',    workAuth: 'GC',         availDays: 7,   tier: 'RETAINED' as const,  rateMin: 10000, rateMax: 12500 },
    { name: 'Vikram Reddy',     email: 'vikram@cloudepa.com',  headline: 'Full Stack Developer',           skills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL'],          location: 'Austin, TX',     workAuth: 'OPT',        availDays: -5,  tier: 'MARKETING' as const, rateMin: 8000,  rateMax: 10000 },
    { name: 'Meera Krishnan',   email: 'meera@cloudepa.com',   headline: 'Data Engineer — Snowflake',      skills: ['Snowflake', 'dbt', 'Python', 'Airflow'],                 location: 'Remote',         workAuth: 'H1B',        availDays: 21,  tier: 'RETAINED' as const,  rateMin: 12000, rateMax: 14000 },
    { name: 'John Martinez',    email: 'john@cloudepa.com',    headline: 'ServiceNow Developer',           skills: ['ServiceNow', 'ITSM', 'JavaScript', 'REST APIs'],         location: 'Denver, CO',     workAuth: 'US_CITIZEN', availDays: -60, tier: 'MARKETING' as const, rateMin: 9000,  rateMax: 11000 },
    { name: 'Kavitha Nair',     email: 'kavitha@cloudepa.com', headline: 'SAP SuccessFactors Consultant',  skills: ['SuccessFactors', 'SAP HCM', 'Employee Central'],         location: 'Atlanta, GA',    workAuth: 'GC',         availDays: 14,  tier: 'RETAINED' as const,  rateMin: 11500, rateMax: 13500 },
    { name: 'David Chen',       email: 'david@cloudepa.com',   headline: 'DevOps / SRE Lead',              skills: ['AWS', 'Docker', 'Kubernetes', 'CI/CD', 'Prometheus'],     location: 'San Francisco',  workAuth: 'US_CITIZEN', availDays: -2,  tier: 'RETAINED' as const,  rateMin: 15000, rateMax: 18000 },
  ]

  const now = new Date()
  const people: any[] = []
  const profiles: any[] = []

  for (const c of consultantData) {
    const person = await prisma.person.create({
      data: { name: c.name, primaryEmail: c.email },
    })

    const availDate = new Date(now)
    availDate.setDate(availDate.getDate() + c.availDays)

    const profile = await prisma.consultantProfile.create({
      data: {
        personId: person.id,
        headline: c.headline,
        skills: c.skills,
        location: c.location,
        workAuth: c.workAuth,
        availableFrom: availDate,
        visibility: 'VERIFIED',
      },
    })

    await prisma.benchListing.create({
      data: {
        consultantId: profile.id,
        companyId: vendor.id,
        tier: c.tier,
        rateMin: c.rateMin,
        rateMax: c.rateMax,
      },
    })

    await prisma.context.create({
      data: {
        personId: person.id,
        type: 'CONSULTANT',
        companyId: vendor.id,
      },
    })

    people.push(person)
    profiles.push(profile)
  }

  // ── Requirements ───────────────────────────────
  const reqs = [
    { title: 'Senior SAP BRIM Consultant — Remote',    skills: ['SAP BRIM', 'Revenue Accounting', 'S/4HANA'],    location: 'Remote',       billMin: 110, billMax: 140, months: 12, status: 'OPEN' },
    { title: 'Azure Cloud Architect',                   skills: ['Azure', 'Terraform', 'Kubernetes'],              location: 'Denver, CO',   billMin: 130, billMax: 160, months: 6,  status: 'OPEN' },
    { title: 'Full Stack React Developer',              skills: ['React', 'TypeScript', 'Node.js'],                location: 'Remote',       billMin: 80,  billMax: 110, months: 12, status: 'OPEN' },
    { title: 'SAP SD/MM Functional Consultant',         skills: ['SAP SD', 'SAP MM'],                              location: 'Chicago, IL',  billMin: 100, billMax: 130, months: 8,  status: 'FILLED' },
    { title: 'Data Engineer — Snowflake Platform',      skills: ['Snowflake', 'dbt', 'Python'],                    location: 'Remote',       billMin: 120, billMax: 150, months: 12, status: 'DRAFT' },
    { title: 'ServiceNow ITSM Implementation Lead',    skills: ['ServiceNow', 'ITSM', 'JavaScript'],              location: 'Dallas, TX',   billMin: 90,  billMax: 120, months: 6,  status: 'CLOSED' },
  ]

  const requirementRecords: any[] = []
  for (const r of reqs) {
    const req = await prisma.requirement.create({
      data: {
        companyId: vendor.id,
        title: r.title,
        skills: r.skills,
        location: r.location,
        billMin: r.billMin,
        billMax: r.billMax,
        months: r.months,
        status: r.status,
        source: 'MANUAL',
        msaId: msa.id,
      },
    })
    requirementRecords.push(req)
  }

  // ── Matches ────────────────────────────────────
  // Ravi matches the SAP BRIM req
  await prisma.match.create({
    data: {
      requirementId: requirementRecords[0].id,
      consultantId: profiles[0].id,
      score: 92,
      confidence: 'HIGH',
      factors: [
        { label: 'SAP BRIM', value: 95, weight: 0.4 },
        { label: 'Revenue Accounting', value: 90, weight: 0.3 },
        { label: 'S/4HANA', value: 88, weight: 0.2 },
        { label: 'Location', value: 100, weight: 0.1 },
      ],
      basis: '6 years SAP BRIM experience, 3 placements at similar clients',
      unknowns: 'Client-specific module configuration experience unknown',
    },
  })

  // Priya matches Azure req
  await prisma.match.create({
    data: {
      requirementId: requirementRecords[1].id,
      consultantId: profiles[1].id,
      score: 88,
      confidence: 'HIGH',
      factors: [
        { label: 'Azure', value: 95, weight: 0.35 },
        { label: 'Terraform', value: 85, weight: 0.25 },
        { label: 'Kubernetes', value: 80, weight: 0.25 },
        { label: 'Location match', value: 90, weight: 0.15 },
      ],
      basis: '4 years Azure architecture, AZ-305 certified',
      unknowns: 'GovCloud experience not verified',
    },
  })

  // Vikram matches React req
  await prisma.match.create({
    data: {
      requirementId: requirementRecords[2].id,
      consultantId: profiles[3].id,
      score: 85,
      confidence: 'MODERATE',
      factors: [
        { label: 'React', value: 90, weight: 0.3 },
        { label: 'TypeScript', value: 85, weight: 0.3 },
        { label: 'Node.js', value: 80, weight: 0.25 },
        { label: 'Location', value: 100, weight: 0.15 },
      ],
      basis: '3 years React, built 2 production apps',
      unknowns: 'OPT status — work auth timeline unclear',
    },
  })

  // ── Submissions ────────────────────────────────
  const submissionData = [
    { reqIdx: 0, personIdx: 0, kind: 'BENCH' as const,    rate: 12500, status: 'SHORTLISTED', daysAgo: 5 },
    { reqIdx: 1, personIdx: 1, kind: 'BENCH' as const,    rate: 15000, status: 'INTERVIEW',   daysAgo: 3 },
    { reqIdx: 2, personIdx: 3, kind: 'BENCH' as const,    rate: 9500,  status: 'SUBMITTED',   daysAgo: 1 },
    { reqIdx: 0, personIdx: 6, kind: 'BENCH' as const,    rate: 12000, status: 'SUBMITTED',   daysAgo: 2 },
    { reqIdx: 3, personIdx: 2, kind: 'BENCH' as const,    rate: 11500, status: 'PLACED',      daysAgo: 30 },
    { reqIdx: 1, personIdx: 7, kind: 'BENCH' as const,    rate: 16000, status: 'REJECTED',    daysAgo: 7 },
    { reqIdx: 5, personIdx: 5, kind: 'BENCH' as const,    rate: 10000, status: 'PLACED',      daysAgo: 45 },
  ]

  for (const s of submissionData) {
    const submittedAt = new Date(now)
    submittedAt.setDate(submittedAt.getDate() - s.daysAgo)

    await prisma.submission.create({
      data: {
        requirementId: requirementRecords[s.reqIdx].id,
        personId: people[s.personIdx].id,
        fromCompanyId: vendor.id,
        toCompanyId: client.id,
        kind: s.kind,
        rate: s.rate,
        status: s.status,
        submittedAt,
      },
    })
  }

  // ── Engagements ────────────────────────────────
  const eng1 = await prisma.engagement.create({
    data: {
      msaId: msa.id,
      title: 'SAP BRIM Migration — Terumo BCT',
      invoiceCycle: 'BIWEEKLY',
    },
  })

  const eng2 = await prisma.engagement.create({
    data: {
      msaId: msa2.id,
      title: 'Cloud Platform Modernization — Nike',
      invoiceCycle: 'MONTHLY',
    },
  })

  // ── Sell Contracts ─────────────────────────────
  const contractData = [
    { personIdx: 2, clientId: client.id,  billRate: 12000, state: 'IN_PROGRESS' as const, startDays: -120, endDays: 60,  engId: eng1.id },
    { personIdx: 5, clientId: client.id,  billRate: 10500, state: 'IN_PROGRESS' as const, startDays: -90,  endDays: 14,  engId: eng1.id },
    { personIdx: 0, clientId: client2.id, billRate: 13500, state: 'IN_PROGRESS' as const, startDays: -200, endDays: 165, engId: eng2.id },
    { personIdx: 4, clientId: client.id,  billRate: 13000, state: 'DRAFT' as const,       startDays: 14,   endDays: 380, engId: eng1.id },
  ]

  const sellContracts: any[] = []
  for (const c of contractData) {
    const startDate = new Date(now)
    startDate.setDate(startDate.getDate() + c.startDays)
    const endDate = new Date(now)
    endDate.setDate(endDate.getDate() + c.endDays)

    const sc = await prisma.sellContract.create({
      data: {
        companyId: vendor.id,
        clientCompanyId: c.clientId,
        personId: people[c.personIdx].id,
        billRate: c.billRate,
        state: c.state,
        startDate,
        endDate,
        msaId: c.clientId === client.id ? msa.id : msa2.id,
        engagementId: c.engId,
      },
    })
    sellContracts.push(sc)
  }

  // ── Timesheets ─────────────────────────────────
  const timesheetData = [
    { contractIdx: 0, startDays: -14, endDays: -1,  hours: 40,   status: 'APPROVED'  },
    { contractIdx: 0, startDays: 0,   endDays: 13,  hours: 36.5, status: 'SUBMITTED' },
    { contractIdx: 1, startDays: -14, endDays: -1,  hours: 80,   status: 'REJECTED'  },
    { contractIdx: 1, startDays: 0,   endDays: 13,  hours: 38,   status: 'OPEN'      },
    { contractIdx: 2, startDays: -14, endDays: -1,  hours: 40,   status: 'APPROVED'  },
  ]

  for (const t of timesheetData) {
    const periodStart = new Date(now)
    periodStart.setDate(periodStart.getDate() + t.startDays)
    const periodEnd = new Date(now)
    periodEnd.setDate(periodEnd.getDate() + t.endDays)

    const isAnomaly = t.hours >= 60

    // Generate daily hour entries for the period
    const days: Record<string, number> = {}
    const hoursPerDay = t.hours / 10 // spread across ~10 working days
    const d = new Date(periodStart)
    let remaining = t.hours
    while (d <= periodEnd && remaining > 0) {
      const dow = d.getDay()
      if (dow !== 0 && dow !== 6) { // skip weekends
        const dayHours = Math.min(remaining, isAnomaly ? 12 : hoursPerDay)
        days[d.toISOString().slice(0, 10)] = Math.round(dayHours * 10) / 10
        remaining -= dayHours
      }
      d.setDate(d.getDate() + 1)
    }

    await prisma.timesheet.create({
      data: {
        sellContractId: sellContracts[t.contractIdx].id,
        personId: sellContracts[t.contractIdx].personId,
        periodStart,
        periodEnd,
        days,
        totalHours: t.hours,
        status: t.status,
        anomalyScore: isAnomaly ? 50 : null,
        anomalyReason: isAnomaly ? `Total ${t.hours} hours exceeds 60-hour weekly threshold` : null,
        approvedAt: t.status === 'APPROVED' ? new Date() : null,
      },
    })
  }

  // ── Invoices ───────────────────────────────────
  const invoiceData = [
    // Paid invoice from 2 months ago
    {
      engId: eng1.id, number: 'IN_BRIM01_001',
      periodStartDays: -75, periodEndDays: -61,
      total: 9600, paid: 9600, // 80hrs × $120/hr
      dueDays: -31, status: 'PAID',
    },
    // Partially paid invoice from last month — 11 days overdue
    {
      engId: eng1.id, number: 'IN_BRIM01_002',
      periodStartDays: -42, periodEndDays: -29,
      total: 12600, paid: 5000, // 105hrs × $120/hr
      dueDays: -11, status: 'PARTIALLY_PAID',
    },
    // Issued invoice — current, not yet due
    {
      engId: eng1.id, number: 'IN_BRIM01_003',
      periodStartDays: -28, periodEndDays: -15,
      total: 4800, paid: 0, // 40hrs × $120/hr
      dueDays: 19, status: 'ISSUED',
    },
    // Nike engagement — paid
    {
      engId: eng2.id, number: 'IN_NIKE01_001',
      periodStartDays: -60, periodEndDays: -31,
      total: 16200, paid: 16200, // 120hrs × $135/hr
      dueDays: -1, status: 'PAID',
    },
    // Nike engagement — issued, current
    {
      engId: eng2.id, number: 'IN_NIKE01_002',
      periodStartDays: -30, periodEndDays: -1,
      total: 10800, paid: 0, // 80hrs × $135/hr
      dueDays: 29, status: 'ISSUED',
    },
    // Old overdue invoice — 65 days overdue (61-90 bucket)
    {
      engId: eng1.id, number: 'IN_BRIM01_000',
      periodStartDays: -130, periodEndDays: -106,
      total: 6300, paid: 0, // 52.5hrs × $120/hr
      dueDays: -65, status: 'ISSUED',
    },
  ]

  const invoiceRecords: any[] = []
  for (const inv of invoiceData) {
    const periodStart = new Date(now)
    periodStart.setDate(periodStart.getDate() + inv.periodStartDays)
    const periodEnd = new Date(now)
    periodEnd.setDate(periodEnd.getDate() + inv.periodEndDays)
    const dueAt = new Date(now)
    dueAt.setDate(dueAt.getDate() + inv.dueDays)

    const invoice = await prisma.invoice.create({
      data: {
        engagementId: inv.engId,
        number: inv.number,
        periodStart,
        periodEnd,
        lines: [],
        currency: 'USD',
        total: inv.total,
        paid: inv.paid,
        dueAt,
        status: inv.status,
      },
    })
    invoiceRecords.push(invoice)
  }

  // ── Payments ──────────────────────────────────
  // Payment for fully paid Terumo invoice
  await prisma.payment.create({
    data: {
      invoiceId: invoiceRecords[0].id,
      amount: 9600,
      method: 'ACH',
      reference: 'TRM-PAY-2026-001',
    },
  })

  // Partial payment for Terumo invoice #002
  await prisma.payment.create({
    data: {
      invoiceId: invoiceRecords[1].id,
      amount: 5000,
      method: 'Wire',
      reference: 'TRM-PAY-2026-002',
    },
  })

  // Full payment for Nike invoice #001
  await prisma.payment.create({
    data: {
      invoiceId: invoiceRecords[3].id,
      amount: 16200,
      method: 'ACH',
      reference: 'NKE-PAY-2026-001',
    },
  })

  console.log('✅ Seed complete.')
  console.log(`   Companies:   3 (${vendor.name}, ${client.name}, ${client2.name})`)
  console.log(`   Consultants: ${consultantData.length}`)
  console.log(`   Requirements: ${reqs.length}`)
  console.log(`   Submissions: ${submissionData.length}`)
  console.log(`   Contracts:   ${contractData.length}`)
  console.log(`   Timesheets:  ${timesheetData.length}`)
  console.log(`   Engagements: 2 (${eng1.title}, ${eng2.title})`)
  console.log(`   Invoices:    ${invoiceData.length}`)
  console.log(`   Payments:    3`)
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e)
    prisma.$disconnect()
    process.exit(1)
  })
