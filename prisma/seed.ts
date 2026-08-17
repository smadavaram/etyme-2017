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
import { PERMISSIONS } from '../src/lib/permissions'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding Etyme database…')

  // Clean slate
  await prisma.$transaction([
    prisma.governanceEvaluation.deleteMany(),
    prisma.governanceRule.deleteMany(),
    prisma.governancePolicy.deleteMany(),
    prisma.verificationDoc.deleteMany(),
    prisma.verification.deleteMany(),
    prisma.blacklist.deleteMany(),
    prisma.rateHistory.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.message.deleteMany(),
    prisma.conversation.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.expense.deleteMany(),
    prisma.timesheet.deleteMany(),
    prisma.submission.deleteMany(),
    prisma.match.deleteMany(),
    prisma.requirementInvitation.deleteMany(),
    prisma.rolloffEvent.deleteMany(),
    prisma.cycle.deleteMany(),
    prisma.contractLink.deleteMany(),
    prisma.companyLocation.deleteMany(),
    prisma.sellContract.deleteMany(),
    prisma.buyContract.deleteMany(),
    prisma.engagement.deleteMany(),
    prisma.benchListing.deleteMany(),
    prisma.consultantProfile.deleteMany(),
    prisma.requirement.deleteMany(),
    prisma.automationLog.deleteMany(),
    prisma.accessLog.deleteMany(),
    prisma.verification.deleteMany(),
    prisma.requirementApproval.deleteMany(),
    prisma.approvalRule.deleteMany(),
    prisma.headcountPlan.deleteMany(),
    prisma.contractCostAllocation.deleteMany(),
    prisma.costCenter.deleteMany(),
    prisma.remitTo.deleteMany(),
    prisma.purchaseOrder.deleteMany(),
    prisma.context.deleteMany(),
    prisma.role.deleteMany(),
    prisma.orgUnit.deleteMany(),
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
  // Permissions come from PERMISSIONS in src/lib/permissions.ts — that list
  // is what every hasPermission() call in the API checks against. Inventing
  // names here (contracts.read, bench.read, company.admin) silently disabled
  // features: /api/decisions skipped its contract queue, the consultant
  // drawer hid contracts, and rolloff-scan found nobody to notify, all
  // because they look for assignments.read / assignments.write.
  const adminRole = await prisma.role.create({
    data: {
      companyId: vendor.id,
      name: 'Company Admin',
      permissions: [...PERMISSIONS],
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

  // ── Client-side context for the same demo user ──
  // A person can hold contexts at more than one company. Giving the founder
  // a seat at Terumo BCT makes the client console reachable without hand-
  // written SQL: pass its id as x-context-id, or make it the active context.
  // Program Manager is a demand-side role — it reads placements, approves
  // hours, and reviews governance, but never sees vendor cost or margin.
  const clientRole = await prisma.role.create({
    data: {
      companyId: client.id,
      name: 'Program Manager',
      permissions: [
        'consultants.read',
        'requirements.read',
        'submissions.read',
        'assignments.read',
        'timesheets.read',
        'timesheets.approve',
        'invoices.read',
        'vendors.read',
      ],
      isDefault: false,
    },
  })

  // ── The client's three teams ──
  // A client is not one person. Each team decides different things and sees
  // different data, which is why governance rules carry an owning team
  // (src/lib/governance-horizon.ts). Routing everything to one "approver"
  // is what makes governance feel like a queue rather than somebody's job.
  const clientTeams = {
    hiringManager: await prisma.role.create({
      data: {
        companyId: client.id,
        name: 'Hiring Manager',
        // Needs people. Sees their own unit, not the whole programme, and
        // never sees what a vendor pays or earns.
        permissions: [
          'requirements.read', 'requirements.write',
          'submissions.read', 'assignments.read',
          'timesheets.read', 'timesheets.approve',
        ],
        isDefault: false,
      },
    }),
    procurement: await prisma.role.create({
      data: {
        companyId: client.id,
        name: 'Indirect Procurement',
        // Owns vendors, rates, contracts and spend. Sees money across the
        // whole programme; does not adjudicate co-employment.
        permissions: [
          'vendors.read', 'vendors.write',
          'requirements.read', 'submissions.read', 'assignments.read',
          'invoices.read', 'invoices.approve',
          'rates.read', 'rates.write', // procurement owns price, so it decides amendments
          'governance.read',
        ],
        isDefault: false,
      },
    }),
    hr: await prisma.role.create({
      data: {
        companyId: client.id,
        name: 'HR — Workforce Compliance',
        // Owns co-employment, tenure, classification and work authorisation.
        // Sees people and their exposure; has no reason to see rates.
        permissions: [
          'consultants.read', 'assignments.read',
          'governance.read', 'governance.write',
          'tenure.read', 'compliance.read', 'compliance.write',
        ],
        isDefault: false,
      },
    }),
  }

  // Granted earlier than the vendor context so the vendor stays the default
  // active context — Phase 1 is vendor-first. Switch to the client console by
  // passing this context's id as x-context-id.
  await prisma.context.create({
    data: {
      personId: founder.id,
      type: 'EMPLOYEE',
      companyId: client.id,
      roleId: clientRole.id,
      grantedAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
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

  // ── Second vendor (for cross-vendor tenure demo) ──
  const vendor2 = await prisma.company.create({
    data: {
      name: 'TechVista Consulting',
      slug: 'techvista',
      domain: 'techvista.com',
      domainVerified: true,
      kind: 'VENDOR',
      templatePack: 'US_SAP',
      currency: 'USD',
      siteLiveAt: new Date(),
      networkVerifiedAt: new Date(),
    },
  })

  const msaTV = await prisma.masterAgreement.create({
    data: {
      vendorId: vendor2.id,
      clientId: client.id,
      paymentTerms: 30,
      currency: 'USD',
    },
  })

  // ── MSP company (paying customer ≠ end client demo) ──
  const msp = await prisma.company.create({
    data: {
      name: 'GlobalStaff MSP',
      slug: 'globalstaff',
      domain: 'globalstaff.com',
      domainVerified: true,
      kind: 'MSP',
      currency: 'USD',
      siteLiveAt: new Date(),
      networkVerifiedAt: new Date(),
    },
  })

  const msaMSP = await prisma.masterAgreement.create({
    data: {
      vendorId: vendor.id,
      clientId: msp.id,
      paymentTerms: 45,
      currency: 'USD',
    },
  })

  // ── Client locations ──────────────────────────────
  const locHQ = await prisma.companyLocation.create({
    data: {
      companyId: client.id,
      name: 'Lakewood HQ',
      address: '11158 W Jefferson Ave',
      city: 'Lakewood',
      state: 'CO',
      country: 'US',
      isPrimary: true,
    },
  })

  const locAnnArbor = await prisma.companyLocation.create({
    data: {
      companyId: client.id,
      name: 'Ann Arbor Site',
      city: 'Ann Arbor',
      state: 'MI',
      country: 'US',
    },
  })

  const locTokyo = await prisma.companyLocation.create({
    data: {
      companyId: client.id,
      name: 'Tokyo R&D',
      city: 'Tokyo',
      country: 'JP',
    },
  })

  const locRemote = await prisma.companyLocation.create({
    data: {
      companyId: client.id,
      name: 'Remote',
      isRemote: true,
    },
  })

  // ── Client org units and hiring managers (Addendum E) ──
  // Terumo's departments and the managers who own contingent headcount.
  // Each manager sourced their own vendors and negotiated their own rates —
  // which is exactly the condition the org view exists to expose.
  const orgUnitData = [
    { key: 'mfgFinance', name: 'Manufacturing Finance', kind: 'DEPARTMENT' },
    { key: 'quality',    name: 'Quality Systems',       kind: 'DEPARTMENT' },
    { key: 'supplyChain',name: 'Supply Chain',          kind: 'DEPARTMENT' },
    { key: 'dataPlatform', name: 'Data Platform',       kind: 'DEPARTMENT' },
    { key: 'infra',      name: 'Infrastructure',        kind: 'DEPARTMENT' },
  ]

  const orgUnits: Record<string, { id: string; name: string }> = {}
  for (const u of orgUnitData) {
    const unit = await prisma.orgUnit.create({
      data: { companyId: client.id, name: u.name, kind: u.kind },
    })
    orgUnits[u.key] = { id: unit.id, name: unit.name }
  }

  const managerData = [
    { key: 'whitfield',  name: 'Dana Whitfield',   email: 'd.whitfield@terumobct.com',  unit: 'mfgFinance' },
    { key: 'okafor',     name: 'Michael Okafor',   email: 'm.okafor@terumobct.com',     unit: 'quality' },
    { key: 'mbeki',      name: 'Joyce Mbeki',      email: 'j.mbeki@terumobct.com',      unit: 'supplyChain' },
    { key: 'ramaswamy',  name: 'Karthik Ramaswamy',email: 'k.ramaswamy@terumobct.com',  unit: 'dataPlatform' },
    { key: 'castellano', name: 'Rosa Castellano',  email: 'r.castellano@terumobct.com', unit: 'infra' },
  ]

  const managers: Record<string, { id: string; name: string; unitId: string }> = {}
  for (const m of managerData) {
    const person = await prisma.person.create({
      data: { name: m.name, primaryEmail: m.email },
    })
    await prisma.context.create({
      data: {
        personId: person.id,
        type: 'EMPLOYEE',
        companyId: client.id,
        roleId: null,
        orgUnitId: orgUnits[m.unit].id,
      },
    })
    managers[m.key] = { id: person.id, name: m.name, unitId: orgUnits[m.unit].id }
  }

  // ── Terumo's cost centres (the budgets contingent labour burns) ──
  // Codes are the client's, and must match what their ERP expects — Etyme
  // carries them for coding and export, it does not invent them.
  const costCentreData = [
    { key: 'ccMfgFin',  code: 'TBC-4100', name: 'Manufacturing Finance', gl: '6120', unit: 'mfgFinance' },
    { key: 'ccQuality', code: 'TBC-4200', name: 'Quality Systems',       gl: '6120', unit: 'quality' },
    { key: 'ccSupply',  code: 'TBC-4300', name: 'Supply Chain',          gl: '6120', unit: 'supplyChain' },
    { key: 'ccData',    code: 'TBC-5100', name: 'Data Platform',         gl: '6140', unit: 'dataPlatform' },
    { key: 'ccInfra',   code: 'TBC-5200', name: 'Infrastructure',        gl: '6140', unit: 'infra' },
  ]

  const costCentres: Record<string, { id: string; code: string; name: string }> = {}
  for (const cc of costCentreData) {
    const created = await prisma.costCenter.create({
      data: {
        companyId: client.id,
        code: cc.code,
        name: cc.name,
        glAccount: cc.gl,
        orgUnitId: orgUnits[cc.unit].id,
      },
    })
    costCentres[cc.key] = { id: created.id, code: created.code, name: created.name }
  }

  // ── Headcount plans — what each budget is approved to run ──
  // Without these, "is there room for this requisition?" has no answer and
  // every request has to go to a human, which is the failure Addendum E
  // names: governance slower than the workaround produces the workaround.
  const planPeriod = String(new Date().getFullYear())
  const headcountPlanData = [
    { cc: 'ccMfgFin',  heads: 6, budget: 1_400_000 },
    { cc: 'ccQuality', heads: 4, budget: 720_000 },
    { cc: 'ccSupply',  heads: 5, budget: 900_000 },
    { cc: 'ccData',    heads: 4, budget: 1_100_000 },
    { cc: 'ccInfra',   heads: 6, budget: 1_300_000 },
  ]
  for (const hp of headcountPlanData) {
    await prisma.headcountPlan.create({
      data: {
        costCenterId: costCentres[hp.cc].id,
        period: planPeriod,
        approvedHeads: hp.heads,
        annualBudget: hp.budget,
        currency: 'USD',
      },
    })
  }

  // ── Approval rules — the delegation of authority ──
  // Below the threshold a requisition clears itself. The catch-all only
  // fires when a check actually routed, so ordinary requests never touch it.
  await prisma.approvalRule.create({
    data: {
      companyId: client.id,
      name: 'Departmental — above $250k',
      thresholdAmount: 250_000,
      approverId: managers.whitfield.id,
      rank: 1,
      isActive: true,
    },
  })

  await prisma.approvalRule.create({
    data: {
      companyId: client.id,
      name: 'Exceptions — over plan, budget or band',
      thresholdAmount: null,
      approverId: managers.mbeki.id,
      rank: 2,
      isActive: true,
    },
  })

  // ── Put the client's people on their teams ──
  // Dana runs manufacturing finance and needs people. Joyce owns supply
  // chain and holds the exception authority. Ravi is the compliance seat —
  // tenure and co-employment are his to adjudicate, and nobody else's.
  const teamSeats: Array<[keyof typeof managers, string]> = [
    ['whitfield', clientTeams.hiringManager.id],
    ['mbeki', clientTeams.procurement.id],
  ]
  for (const [key, roleId] of teamSeats) {
    await prisma.context.create({
      data: {
        personId: managers[key].id,
        type: 'EMPLOYEE',
        companyId: client.id,
        roleId,
      },
    })
  }

  const hrLead = await prisma.person.create({
    data: { name: 'Ravi Anand', primaryEmail: 'r.anand@terumobct.com' },
  })
  await prisma.context.create({
    data: {
      personId: hrLead.id,
      type: 'EMPLOYEE',
      companyId: client.id,
      roleId: clientTeams.hr.id,
    },
  })

  // ── Who owns a breach of each rule ──
  // Defaults live in code; recording them here makes the client's own
  // arrangement explicit and overridable.
  const ruleOwners: Array<[string, 'HIRING_MANAGER' | 'PROCUREMENT' | 'HR']> = [
    ['TENURE_CAP', 'HR'],
    ['BREAK_IN_SERVICE', 'HR'],
    ['WORK_AUTHORIZATION', 'HR'],
    ['SEGREGATION_OF_DUTIES', 'HR'],
    ['INSURANCE_REQUIRED', 'PROCUREMENT'],
    ['RATE_BAND', 'PROCUREMENT'],
  ]
  for (const [ruleType, owner] of ruleOwners) {
    await prisma.governanceRule.updateMany({
      where: { ruleType: ruleType as any, policy: { companyId: client.id } },
      data: { ownerTeam: owner as any },
    })
  }

  // ── Certificates with real expiry dates ──
  // Without these the horizon has nothing to project and the console looks
  // reassuringly empty for the wrong reason.
  const day = 86_400_000
  await prisma.verification.create({
    data: {
      companyId: vendor.id,
      type: 'INSURANCE_GL',
      status: 'CLEAR',
      provider: 'The Hartford',
      issuedAt: new Date(Date.now() - 330 * day),
      // Inside the default 120-day window — procurement should see this.
      expiresAt: new Date(Date.now() + 35 * day),
      uploadedById: founder.id,
      verifiedById: founder.id,
      verifiedAt: new Date(Date.now() - 320 * day),
    },
  })
  await prisma.verification.create({
    data: {
      companyId: vendor.id,
      type: 'INSURANCE_WC',
      status: 'CLEAR',
      provider: 'The Hartford',
      issuedAt: new Date(Date.now() - 300 * day),
      expiresAt: new Date(Date.now() + 96 * day),
      uploadedById: founder.id,
      verifiedById: founder.id,
      verifiedAt: new Date(Date.now() - 295 * day),
    },
  })

  // ── Purchase orders — one per leg of the chain ──
  // Terumo raises a PO to each supplier it actually pays. In the layer-cake
  // case that is the MSP, not the sub-vendor: GlobalStaff then raises its
  // own PO to Cloudepa. A single PO on the end client would be the wrong
  // reference for whoever's AP is paying.
  const poStart = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000)
  const poEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)

  const poTerumoToCloudepa = await prisma.purchaseOrder.create({
    data: {
      number: 'PO-2026-4417',
      issuedById: client.id,
      issuedToId: vendor.id,
      amount: 1_200_000,
      currency: 'USD',
      startDate: poStart,
      endDate: poEnd,
      status: 'OPEN',
    },
  })

  const poTerumoToTechVista = await prisma.purchaseOrder.create({
    data: {
      number: 'PO-2026-4482',
      issuedById: client.id,
      issuedToId: vendor2.id,
      amount: 900_000,
      currency: 'USD',
      startDate: poStart,
      endDate: poEnd,
      status: 'OPEN',
    },
  })

  // The MSP's own PO down to the sub-vendor — the leg Cloudepa invoices.
  const poMspToCloudepa = await prisma.purchaseOrder.create({
    data: {
      number: 'GS-PO-88213',
      issuedById: msp.id,
      issuedToId: vendor.id,
      amount: 400_000,
      currency: 'USD',
      startDate: poStart,
      endDate: poEnd,
      status: 'OPEN',
    },
  })

  // ── Remit-to — where each vendor is paid ──
  // Only the last four digits are stored. Full account and routing numbers
  // must never live in this table; they belong in a payment provider vault.
  const cloudepaRemit = await prisma.remitTo.create({
    data: {
      companyId: vendor.id,
      legalName: 'Cloudepa Inc.',
      addressLines: ['2100 Ross Avenue, Suite 800', 'Dallas, TX 75201'],
      country: 'US',
      taxId: '47-2938471',
      paymentMethod: 'ACH',
      bankName: 'Wells Fargo',
      accountLast4: '4471',
      routingLast4: '0248',
      isDefault: true,
    },
  })

  await prisma.remitTo.create({
    data: {
      companyId: vendor2.id,
      legalName: 'TechVista Consulting LLC',
      addressLines: ['500 Boylston Street, Floor 12', 'Boston, MA 02116'],
      country: 'US',
      taxId: '81-4417392',
      paymentMethod: 'WIRE',
      bankName: 'Bank of America',
      accountLast4: '9902',
      routingLast4: '1173',
      isDefault: true,
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
    { title: 'Senior SAP BRIM Consultant — Remote',    skills: ['SAP BRIM', 'Revenue Accounting', 'S/4HANA'],    location: 'Remote',       billMin: 11000, billMax: 14000, months: 12, status: 'OPEN',   marginClass: 'EXPERTISE', rateVisible: true },
    { title: 'Azure Cloud Architect',                   skills: ['Azure', 'Terraform', 'Kubernetes'],              location: 'Denver, CO',   billMin: 13000, billMax: 16000, months: 6,  status: 'OPEN',   marginClass: 'EXPERTISE', rateVisible: false },
    { title: 'Full Stack React Developer',              skills: ['React', 'TypeScript', 'Node.js'],                location: 'Remote',       billMin: 8000, billMax: 11000, months: 12, status: 'OPEN',   marginClass: 'ARBITRAGE', rateVisible: true },
    { title: 'SAP SD/MM Functional Consultant',         skills: ['SAP SD', 'SAP MM'],                              location: 'Chicago, IL',  billMin: 10000, billMax: 13000, months: 8,  status: 'FILLED', marginClass: 'EXPERTISE', rateVisible: false },
    { title: 'Data Engineer — Snowflake Platform',      skills: ['Snowflake', 'dbt', 'Python'],                    location: 'Remote',       billMin: 12000, billMax: 15000, months: 12, status: 'DRAFT',  marginClass: null,        rateVisible: false },
    { title: 'ServiceNow ITSM Implementation Lead',    skills: ['ServiceNow', 'ITSM', 'JavaScript'],              location: 'Dallas, TX',   billMin: 9000, billMax: 12000, months: 6,  status: 'CLOSED', marginClass: null,        rateVisible: false },
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
        marginClass: r.marginClass ?? null,
        rateVisible: r.rateVisible ?? false,
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
  // Most contracts are direct (paying customer = end client).
  // One contract demonstrates the three-party layer cake:
  //   vendor bills MSP (paying customer) → consultant works at Terumo BCT (end client)
  // mgr/unit are the END CLIENT's owner of the engagement (Addendum E).
  // Nike contracts carry none — the org view is a Terumo surface here.
  const contractData = [
    { personIdx: 2, clientId: client.id,  billRate: 12000, state: 'IN_PROGRESS' as const, startDays: -120, endDays: 60,  engId: eng1.id, locId: locHQ.id,     mgr: 'mbeki',      unit: 'supplyChain' },
    { personIdx: 5, clientId: client.id,  billRate: 10500, state: 'IN_PROGRESS' as const, startDays: -90,  endDays: 14,  engId: eng1.id, locId: locHQ.id,     mgr: 'castellano', unit: 'infra' },
    { personIdx: 0, clientId: client2.id, billRate: 13500, state: 'IN_PROGRESS' as const, startDays: -200, endDays: 165, engId: eng2.id, locId: null,         mgr: null,         unit: null },
    { personIdx: 4, clientId: client.id,  billRate: 13000, state: 'DRAFT' as const,       startDays: 14,   endDays: 380, engId: eng1.id, locId: locRemote.id, mgr: 'ramaswamy',  unit: 'dataPlatform' },
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
        workLocationId: c.locId,
        hiringManagerId: c.mgr ? managers[c.mgr].id : null,
        orgUnitId: c.unit ? orgUnits[c.unit].id : null,
        purchaseOrderId: c.clientId === client.id ? poTerumoToCloudepa.id : null,
      },
    })
    sellContracts.push(sc)

    // Code the contract to the budget that funds the department it sits in.
    if (c.unit) {
      const cc = Object.values(costCentres).find(
        (x) => x.name === orgUnits[c.unit!].name
      )
      if (cc) {
        await prisma.contractCostAllocation.create({
          data: { sellContractId: sc.id, costCenterId: cc.id, shareBps: 10000 },
        })
      }
    }
  }

  // Three-party contract: Cloudepa bills GlobalStaff MSP, consultant works at Terumo BCT
  // personIdx 7 = David Chen (DevOps/SRE Lead)
  const mspContractStart = new Date(now)
  mspContractStart.setDate(mspContractStart.getDate() - 60)
  const mspContractEnd = new Date(now)
  mspContractEnd.setDate(mspContractEnd.getDate() + 300)

  const mspContract = await prisma.sellContract.create({
    data: {
      companyId: vendor.id,
      clientCompanyId: msp.id,           // paying customer = GlobalStaff MSP
      endClientCompanyId: client.id,      // end client = Terumo BCT
      personId: people[7].id,
      billRate: 16500,
      state: 'IN_PROGRESS',
      startDate: mspContractStart,
      endDate: mspContractEnd,
      msaId: msaMSP.id,
      workLocationId: locAnnArbor.id,     // works at Ann Arbor site
      hiringManagerId: managers.castellano.id,
      orgUnitId: orgUnits.infra.id,
      // Cloudepa invoices the MSP against the MSP's PO, not Terumo's.
      purchaseOrderId: poMspToCloudepa.id,
    },
  })
  sellContracts.push(mspContract)

  // A split contractor — David Chen's time is shared between Infrastructure
  // and Data Platform. Terumo still needs the coding even though the invoice
  // it pays comes from GlobalStaff, so it can accrue against both budgets.
  await prisma.contractCostAllocation.createMany({
    data: [
      { sellContractId: mspContract.id, costCenterId: costCentres.ccInfra.id, shareBps: 6000 },
      { sellContractId: mspContract.id, costCenterId: costCentres.ccData.id,  shareBps: 4000 },
    ],
  })

  // ── TechVista contractors at Terumo (Addendum E rate variance) ──
  // Different managers sourced the same skills from a second vendor at
  // different rates. This is the condition the org view surfaces: nobody
  // has seen these side by side, because they live in separate inboxes.
  const tvContractorData = [
    { name: 'Elena Fischer',  email: 'elena@techvista.com',  headline: 'SAP MM / SD Consultant',   skills: ['SAP MM', 'SAP SD', 'S/4HANA'],           billRate: 14800, mgr: 'whitfield', unit: 'mfgFinance',   loc: locHQ.id,      startDays: -150, endDays: 120 },
    { name: 'Owen Bradley',   email: 'owen@techvista.com',   headline: 'Data Engineer',            skills: ['Snowflake', 'Python', 'dbt'],            billRate: 11200, mgr: 'whitfield', unit: 'mfgFinance',   loc: locRemote.id,  startDays: -100, endDays: 200 },
    { name: 'Aisha Mahmood',  email: 'aisha@techvista.com',  headline: 'Cloud Platform Engineer',  skills: ['AWS', 'Kubernetes', 'Terraform'],        billRate: 13800, mgr: 'ramaswamy', unit: 'dataPlatform', loc: locRemote.id,  startDays: -70,  endDays: 240 },
    { name: 'Peter Lindgren', email: 'peter@techvista.com',  headline: 'Validation / CSV Lead',    skills: ['CSV', 'Process Validation', 'FDA'],      billRate: 9600,  mgr: 'okafor',    unit: 'quality',      loc: locAnnArbor.id, startDays: -220, endDays: 90 },
  ]

  for (const t of tvContractorData) {
    const person = await prisma.person.create({
      data: { name: t.name, primaryEmail: t.email },
    })
    await prisma.consultantProfile.create({
      data: {
        personId: person.id,
        headline: t.headline,
        skills: t.skills,
        location: 'United States',
        workAuth: 'US_CITIZEN',
        visibility: 'CLIENT_VISIBLE',
      },
    })
    await prisma.context.create({
      data: { personId: person.id, type: 'CONSULTANT', companyId: vendor2.id },
    })

    const startDate = new Date(now)
    startDate.setDate(startDate.getDate() + t.startDays)
    const endDate = new Date(now)
    endDate.setDate(endDate.getDate() + t.endDays)

    const sc = await prisma.sellContract.create({
      data: {
        companyId: vendor2.id,
        clientCompanyId: client.id,
        personId: person.id,
        billRate: t.billRate,
        state: 'IN_PROGRESS',
        startDate,
        endDate,
        msaId: msaTV.id,
        workLocationId: t.loc,
        hiringManagerId: managers[t.mgr].id,
        orgUnitId: orgUnits[t.unit].id,
        purchaseOrderId: poTerumoToTechVista.id,
      },
    })
    sellContracts.push(sc)

    const cc = Object.values(costCentres).find(
      (x) => x.name === orgUnits[t.unit].name
    )
    if (cc) {
      await prisma.contractCostAllocation.create({
        data: { sellContractId: sc.id, costCenterId: cc.id, shareBps: 10000 },
      })
    }
  }

  // ── Buy Contracts (payroll side) ────────────────
  // Each active sell contract gets a linked buy contract representing
  // what the vendor pays the consultant (BRD §12, LEGACY_RULES.md §2.5)
  const buyContractData = [
    { personIdx: 2, payRate: 8500, type: 'W2' as const,  state: 'IN_PROGRESS' as const, startDays: -120, endDays: 60,   entityName: null },
    { personIdx: 5, payRate: 7200, type: 'W2' as const,  state: 'IN_PROGRESS' as const, startDays: -90,  endDays: 14,   entityName: null },
    { personIdx: 0, payRate: 9500, type: 'C2C' as const, state: 'IN_PROGRESS' as const, startDays: -200, endDays: 165,  entityName: null },
    { personIdx: 4, payRate: 9000, type: 'W2' as const,  state: 'DRAFT' as const,       startDays: 14,   endDays: 380,  entityName: null },
    // Bench-paid H1B (no sell contract — standalone payroll obligation)
    { personIdx: 3, payRate: 6000, type: 'W2' as const,  state: 'BENCH_PAID' as const,  startDays: -30,  endDays: 180,  entityName: null },
  ]

  const buyContracts: any[] = []
  for (const bc of buyContractData) {
    const startDate = new Date(now)
    startDate.setDate(startDate.getDate() + bc.startDays)
    const endDate = new Date(now)
    endDate.setDate(endDate.getDate() + bc.endDays)

    const buyContract = await prisma.buyContract.create({
      data: {
        companyId: vendor.id,
        vendorCompanyId: null, // direct employment
        payCurrency: 'USD',
        contractType: bc.type,
        state: bc.state,
        startDate,
        endDate,
        candidates: {
          create: {
            personId: people[bc.personIdx].id,
            payRate: bc.payRate,
            payCurrency: 'USD',
            startDate,
            endDate,
          },
        },
      },
    })
    buyContracts.push(buyContract)
  }

  // ── A real subcontract: Cloudepa buys Elena's replacement from TechVista ──
  // This is the one case where a buy contract and a purchase order describe
  // the same relationship. The buy contract carries the RATE Cloudepa pays
  // TechVista; the PO carries the CEILING TechVista may bill against. Linked
  // so the two records cannot drift apart.
  const poCloudepaToTechVista = await prisma.purchaseOrder.create({
    data: {
      number: 'CLD-PO-2211',
      issuedById: vendor.id,
      issuedToId: vendor2.id,
      amount: 180_000,
      currency: 'USD',
      startDate: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 245 * 24 * 60 * 60 * 1000),
      status: 'OPEN',
    },
  })

  const subStart = new Date(now)
  subStart.setDate(subStart.getDate() - 120)
  const subEnd = new Date(now)
  subEnd.setDate(subEnd.getDate() + 245)

  // ONE agreement, THREE people at three different rates — the shape the
  // 2017 model could not express. Each carries their own rate and dates, and
  // one has already rolled off while the agreement runs on for the others.
  const subcontract = await prisma.buyContract.create({
    data: {
      companyId: vendor.id,
      vendorCompanyId: vendor2.id, // buying FROM TechVista, not employing
      payCurrency: 'USD',
      contractType: 'C2C',
      state: 'IN_PROGRESS',
      startDate: subStart,
      endDate: subEnd,
      purchaseOrderId: poCloudepaToTechVista.id,
      candidates: {
        create: [
          {
            personId: people[6].id, // Kavitha Nair
            payRate: 10_500,
            startDate: subStart,
            endDate: subEnd,
            state: 'ACTIVE',
          },
          {
            personId: people[3].id, // Vikram Reddy — joined later, cheaper
            payRate: 8_800,
            startDate: new Date(subStart.getTime() + 45 * 24 * 60 * 60 * 1000),
            endDate: subEnd,
            state: 'ACTIVE',
          },
          {
            personId: people[1].id, // Priya Sharma — rolled off early
            payRate: 13_200,
            startDate: subStart,
            endDate: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
            state: 'ENDED',
          },
        ],
      },
    },
  })
  buyContracts.push(subcontract)

  // ── Contract Links (sell ↔ buy for profitability) ──
  // First 4 buy contracts link to the 4 sell contracts
  for (let i = 0; i < 4; i++) {
    await prisma.contractLink.create({
      data: {
        sellContractId: sellContracts[i].id,
        buyContractId: buyContracts[i].id,
        effectiveFrom: sellContracts[i].startDate,
        effectiveTo: sellContracts[i].endDate,
      },
    })
  }

  // ── Buy-side Cycles (SALARY_CALCULATE, SALARY_PAY) ─
  // Generate biweekly payroll cycles for active buy contracts
  for (const bc of buyContracts) {
    if (bc.state === 'DRAFT') continue

    const start = new Date(bc.startDate)
    const end = new Date(bc.endDate)
    const cursor = new Date(start)

    // Find the first Friday
    while (cursor.getDay() !== 5) cursor.setDate(cursor.getDate() + 1)

    while (cursor <= end) {
      const calcDate = new Date(cursor)
      calcDate.setDate(calcDate.getDate() + 3) // Wednesday after period end

      const payDate = new Date(cursor)
      payDate.setDate(payDate.getDate() + 5) // Friday after period end

      // Only generate cycles near the present (±60 days)
      const diffDays = Math.abs(
        (calcDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )
      if (diffDays <= 60) {
        const isPast = calcDate < now

        await prisma.cycle.create({
          data: {
            buyContractId: bc.id,
            kind: 'SALARY_CALCULATE',
            dueOn: calcDate,
            completedAt: isPast ? calcDate : null,
          },
        })

        await prisma.cycle.create({
          data: {
            buyContractId: bc.id,
            kind: 'SALARY_PAY',
            dueOn: payDate,
            completedAt: isPast ? payDate : null,
          },
        })
      }

      cursor.setDate(cursor.getDate() + 14) // biweekly
    }
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

    // Every invoice carries the PO it draws on and where to remit — without
    // both, AP has no basis to pay it.
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
        purchaseOrderId: inv.engId === eng2.id ? null : poTerumoToCloudepa.id,
        remitToId: cloudepaRemit.id,
      },
    })
    invoiceRecords.push(invoice)
  }

  // An invoice on the MSP leg: Cloudepa bills GlobalStaff for David Chen,
  // who sits at Terumo. Its coding carries TERUMO's cost centres — because
  // that is whose budget he burns — while the bill-to is GlobalStaff, who
  // will code their own onward invoice differently. The coding export
  // labels the owner rather than passing one company's codes off as another's.
  const mspEngagement = await prisma.engagement.create({
    data: {
      msaId: msaMSP.id,
      title: 'Platform Engineering — via GlobalStaff',
      invoiceCycle: 'MONTHLY',
    },
  })

  await prisma.sellContract.update({
    where: { id: mspContract.id },
    data: { engagementId: mspEngagement.id },
  })

  const mspInvPeriodStart = new Date(now)
  mspInvPeriodStart.setDate(mspInvPeriodStart.getDate() - 30)
  const mspInvPeriodEnd = new Date(now)
  mspInvPeriodEnd.setDate(mspInvPeriodEnd.getDate() - 1)
  const mspInvDue = new Date(now)
  mspInvDue.setDate(mspInvDue.getDate() + 29)

  const mspInvoice = await prisma.invoice.create({
    data: {
      engagementId: mspEngagement.id,
      number: 'IN_GS_0041',
      periodStart: mspInvPeriodStart,
      periodEnd: mspInvPeriodEnd,
      lines: [
        {
          sellContractId: mspContract.id,
          personId: people[7].id,
          personName: people[7].name,
          billRate: 16500,
          totalHours: 160,
          amount: 26400, // 160h x $165/hr
        },
      ],
      currency: 'USD',
      total: 26400,
      paid: 0,
      dueAt: mspInvDue,
      status: 'ISSUED',
      purchaseOrderId: poMspToCloudepa.id,
      remitToId: cloudepaRemit.id,
    },
  })
  invoiceRecords.push(mspInvoice)

  // Invoice lines — one per contract billed in the period. Coding and the
  // AP export read these, so they reference real contracts rather than
  // being decorative.
  const eng1Contracts = sellContracts.filter(
    (sc) => sc.engagementId === eng1.id && sc.clientCompanyId === client.id
  )
  const eng2Contracts = sellContracts.filter((sc) => sc.engagementId === eng2.id)

  for (const invoice of invoiceRecords) {
    // The MSP invoice already has its line written above
    if (invoice.engagementId === mspEngagement.id) continue
    const pool = invoice.engagementId === eng2.id ? eng2Contracts : eng1Contracts
    if (pool.length === 0) continue

    const totalCents = Math.round(Number(invoice.total) * 100)
    // Spread the invoice across its contracts, remainder onto the first line
    const per = Math.floor(totalCents / pool.length)
    const remainder = totalCents - per * pool.length

    const lines = await Promise.all(
      pool.map(async (sc: any, i: number) => {
        const amountCents = per + (i === 0 ? remainder : 0)
        const person = await prisma.person.findUnique({
          where: { id: sc.personId },
          select: { name: true },
        })
        return {
          sellContractId: sc.id,
          personId: sc.personId,
          personName: person?.name ?? 'Unknown',
          billRate: sc.billRate,
          totalHours: Math.round((amountCents / sc.billRate) * 10) / 10,
          amount: amountCents / 100,
        }
      })
    )

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { lines },
    })
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

  // ── Expenses ───────────────────────────────────
  // BUILD.md §6.3: Client-billable expenses appear on invoices.
  // LEGACY_RULES.md §4.4: ClientExpense lifecycle, amount = sum(qty × unitPrice).
  const expenseData = [
    {
      sellContractIdx: 0,  // Anita @ Terumo
      personIdx: 2,
      category: 'TRAVEL',
      billable: true,
      description: 'Round-trip flight DFW→DEN for onsite sprint planning',
      periodStart: -14,
      periodEnd: -10,
      items: [
        { description: 'Flight DFW→DEN round-trip', quantity: 1, unitPrice: 485, expenseType: 'AIRFARE' },
        { description: 'Hotel — 4 nights @ $189/night', quantity: 4, unitPrice: 189, expenseType: 'LODGING' },
        { description: 'Rental car', quantity: 4, unitPrice: 65, expenseType: 'GROUND' },
        { description: 'Per diem meals', quantity: 4, unitPrice: 75, expenseType: 'MEALS' },
      ],
      status: 'APPROVED',
      daysAgo: 7,
    },
    {
      sellContractIdx: 1,  // John @ Terumo
      personIdx: 5,
      category: 'EQUIPMENT',
      billable: false,
      description: 'Replacement laptop charger and USB-C hub',
      periodStart: -5,
      periodEnd: -5,
      items: [
        { description: 'USB-C laptop charger', quantity: 1, unitPrice: 89.99, expenseType: 'EQUIPMENT' },
        { description: 'USB-C multiport hub', quantity: 1, unitPrice: 59.99, expenseType: 'EQUIPMENT' },
      ],
      status: 'SUBMITTED',
      daysAgo: 3,
    },
    {
      sellContractIdx: 2,  // Ravi @ Nike
      personIdx: 0,
      category: 'TRAINING',
      billable: true,
      description: 'SAP BRIM certification exam and prep materials',
      periodStart: -30,
      periodEnd: -28,
      items: [
        { description: 'SAP C_BRIM_2020 certification exam', quantity: 1, unitPrice: 595, expenseType: 'CERT' },
        { description: 'Official SAP training materials', quantity: 1, unitPrice: 250, expenseType: 'MATERIALS' },
      ],
      status: 'INVOICED',
      daysAgo: 21,
    },
    {
      sellContractIdx: 0,  // Anita @ Terumo
      personIdx: 2,
      category: 'MEALS',
      billable: true,
      description: 'Client dinner — project kickoff',
      periodStart: -3,
      periodEnd: -3,
      items: [
        { description: 'Client dinner — 4 attendees', quantity: 1, unitPrice: 312.50, expenseType: 'MEALS' },
      ],
      status: 'SUBMITTED',
      daysAgo: 2,
    },
    {
      sellContractIdx: 1,  // John @ Terumo
      personIdx: 5,
      category: 'TRAVEL',
      billable: true,
      description: 'Uber rides — week of Aug 4 for client site visits',
      periodStart: -10,
      periodEnd: -6,
      items: [
        { description: 'Uber — Mon office→client site', quantity: 1, unitPrice: 28.50, expenseType: 'GROUND' },
        { description: 'Uber — Mon client site→office', quantity: 1, unitPrice: 31.00, expenseType: 'GROUND' },
        { description: 'Uber — Wed office→datacenter', quantity: 1, unitPrice: 45.00, expenseType: 'GROUND' },
        { description: 'Uber — Wed datacenter→office', quantity: 1, unitPrice: 42.00, expenseType: 'GROUND' },
        { description: 'Uber — Fri office→client site', quantity: 1, unitPrice: 29.50, expenseType: 'GROUND' },
      ],
      status: 'DRAFT',
      daysAgo: 1,
    },
    {
      sellContractIdx: 2,  // Ravi @ Nike
      personIdx: 0,
      category: 'RELOCATION',
      billable: false,
      description: 'Temporary housing first month — Portland assignment',
      periodStart: -45,
      periodEnd: -15,
      items: [
        { description: 'Furnished apartment — 1 month', quantity: 1, unitPrice: 3200, expenseType: 'HOUSING' },
        { description: 'Moving company — personal items', quantity: 1, unitPrice: 850, expenseType: 'MOVING' },
      ],
      status: 'PAID',
      daysAgo: 35,
    },
    {
      sellContractIdx: 0,  // Anita @ Terumo
      personIdx: 2,
      category: 'EQUIPMENT',
      billable: true,
      description: 'External monitor for remote work setup',
      periodStart: -20,
      periodEnd: -20,
      items: [
        { description: 'Dell 27" 4K monitor', quantity: 1, unitPrice: 429.99, expenseType: 'EQUIPMENT' },
        { description: 'Monitor arm mount', quantity: 1, unitPrice: 39.99, expenseType: 'EQUIPMENT' },
      ],
      status: 'APPROVED',
      daysAgo: 12,
    },
    {
      sellContractIdx: 1,  // John @ Terumo
      personIdx: 5,
      category: 'TRAINING',
      billable: false,
      description: 'ServiceNow CSA renewal — online proctored',
      periodStart: -8,
      periodEnd: -8,
      items: [
        { description: 'ServiceNow CSA renewal exam', quantity: 1, unitPrice: 300, expenseType: 'CERT' },
      ],
      status: 'REJECTED',
      daysAgo: 5,
    },
  ]

  for (const exp of expenseData) {
    const periodStartDate = new Date(now)
    periodStartDate.setDate(periodStartDate.getDate() + exp.periodStart)
    const periodEndDate = new Date(now)
    periodEndDate.setDate(periodEndDate.getDate() + exp.periodEnd)
    const createdAt = new Date(now)
    createdAt.setDate(createdAt.getDate() - exp.daysAgo)

    const total = exp.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)

    await prisma.expense.create({
      data: {
        companyId: vendor.id,
        sellContractId: sellContracts[exp.sellContractIdx].id,
        personId: people[exp.personIdx].id,
        category: exp.category,
        billable: exp.billable,
        description: exp.description,
        periodStart: periodStartDate,
        periodEnd: periodEndDate,
        items: exp.items,
        total,
        status: exp.status,
        submittedAt: ['SUBMITTED', 'APPROVED', 'INVOICED', 'PAID', 'REJECTED'].includes(exp.status) ? createdAt : null,
        approvedAt: ['APPROVED', 'INVOICED', 'PAID'].includes(exp.status) ? createdAt : null,
        rejectedReason: exp.status === 'REJECTED' ? 'Company does not reimburse individual certification renewals — use group training budget' : null,
        createdAt,
      },
    })
  }

  // ── Conversations ──────────────────────────────
  // BUILD.md §6.1: "auto-created a thread per job, per contract and per document request"
  const conversationData = [
    {
      topic: 'REQUIREMENT',
      topicId: requirementRecords[0].id,
      title: 'SAP BRIM Consultant — Remote',
      messages: [
        { authorIdx: -1, body: 'Requirement created and distributed to 3 vendors.', type: 'SYSTEM', daysAgo: 30 },
        { authorIdx: 0, body: 'I have two strong BRIM candidates available immediately — Ravi and Anita. Both have 5+ years on S/4HANA.', type: 'TEXT', daysAgo: 29 },
        { authorIdx: -1, body: 'Ravi Patel submitted at $130/hr.', type: 'SYSTEM', daysAgo: 28 },
        { authorIdx: -1, body: 'Anita Desai submitted at $120/hr.', type: 'SYSTEM', daysAgo: 27 },
      ],
    },
    {
      topic: 'CONTRACT',
      topicId: sellContracts[0].id,
      title: 'Anita Desai — Terumo BCT (SAP SD/MM)',
      messages: [
        { authorIdx: -1, body: 'Sell contract created: Anita Desai → Terumo BCT at $120/hr.', type: 'SYSTEM', daysAgo: 60 },
        { authorIdx: 2, body: 'Hi team, just wanted to confirm my start date is next Monday. I have completed the I-9 and background check.', type: 'TEXT', daysAgo: 55 },
        { authorIdx: -1, body: 'All verifications passed. Contract moved to IN_PROGRESS.', type: 'SYSTEM', daysAgo: 54 },
        { authorIdx: 0, body: 'Anita, please submit timesheets by Friday EOD. The approval cycle is biweekly.', type: 'TEXT', daysAgo: 50 },
      ],
    },
    {
      topic: 'CONTRACT',
      topicId: sellContracts[2].id,
      title: 'Ravi Patel — Nike (Cloud Platform)',
      messages: [
        { authorIdx: -1, body: 'Sell contract created: Ravi Patel → Nike Inc. at $135/hr.', type: 'SYSTEM', daysAgo: 120 },
        { authorIdx: 0, body: 'Ravi is performing exceptionally. Nike has requested an extension through Q1 2027.', type: 'TEXT', daysAgo: 10 },
        { authorIdx: -1, body: 'Rate confirmation: $135/hr maintained for extension period.', type: 'RATE_CONFIRMATION', daysAgo: 9 },
      ],
    },
    {
      topic: 'SUBMISSION',
      topicId: null,
      title: 'Azure Architect — Terumo BCT submission discussion',
      messages: [
        { authorIdx: -1, body: 'Priya Sharma shortlisted for Azure Cloud Architect position.', type: 'SYSTEM', daysAgo: 20 },
        { authorIdx: 0, body: 'Priya is available for a technical interview anytime this week. She has strong Azure + Terraform credentials.', type: 'TEXT', daysAgo: 19 },
        { authorIdx: -1, body: 'Interview scheduled for Thursday at 2pm CST.', type: 'INTERVIEW', daysAgo: 18 },
      ],
    },
    {
      topic: 'EXPENSE',
      topicId: null,
      title: 'Q3 travel expense approvals',
      messages: [
        { authorIdx: 0, body: 'Please submit all Q3 travel expenses by Aug 15. We need to invoice Terumo BCT for client-billable items before month-end.', type: 'TEXT', daysAgo: 5 },
        { authorIdx: 2, body: 'Submitted my DFW→DEN trip expenses — flight, hotel, car rental, and per diem. Total $1,801.', type: 'TEXT', daysAgo: 4 },
        { authorIdx: 5, body: 'I have some Uber receipts from last week — should those go under Travel or Other?', type: 'TEXT', daysAgo: 3 },
        { authorIdx: 0, body: 'Travel — any ground transportation for client site visits counts as travel.', type: 'TEXT', daysAgo: 3 },
      ],
    },
  ]

  let conversationCount = 0
  let messageCount = 0
  for (const conv of conversationData) {
    const participants = [
      { personId: founder.id, name: founder.name, joinedAt: now.toISOString() },
    ]
    // Add relevant people from messages
    const authorIdxs = [...new Set(conv.messages.map(m => m.authorIdx).filter(i => i >= 0))]
    for (const idx of authorIdxs) {
      participants.push({
        personId: people[idx].id,
        name: consultantData[idx].name,
        joinedAt: now.toISOString(),
      })
    }

    const conversation = await prisma.conversation.create({
      data: {
        companyId: vendor.id,
        topic: conv.topic,
        topicId: conv.topicId,
        title: conv.title,
        participants,
      },
    })
    conversationCount++

    for (const msg of conv.messages) {
      const createdAt = new Date(now)
      createdAt.setDate(createdAt.getDate() - msg.daysAgo)
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          authorId: msg.authorIdx < 0 ? 'SYSTEM' : (msg.authorIdx === 0 ? founder.id : people[msg.authorIdx].id),
          body: msg.body,
          type: msg.type,
          createdAt,
        },
      })
      messageCount++
    }
  }

  // ── Notifications ──────────────────────────────
  // BUILD.md §6.2: "type × channel routing including Teams and email digests"
  const notificationData = [
    { type: 'SUBMISSION', title: 'Priya Sharma shortlisted', body: 'Priya Sharma has been shortlisted for Azure Cloud Architect at Terumo BCT.', daysAgo: 0.1, status: 'UNREAD' },
    { type: 'TIMESHEET', title: 'Timesheet due tomorrow', body: 'Anita Desai has not submitted her timesheet for the period ending Aug 15.', daysAgo: 0.5, status: 'UNREAD' },
    { type: 'INVOICE', title: 'Invoice INV-2026-003 past due', body: 'Invoice INV-2026-003 for Terumo BCT SAP BRIM Migration is 15 days past due. Outstanding: $12,000.', daysAgo: 1, status: 'UNREAD' },
    { type: 'EXPENSE', title: 'Expense submitted for approval', body: 'Anita Desai submitted a client dinner expense of $312.50 for your review.', daysAgo: 2, status: 'UNREAD' },
    { type: 'CONTRACT', title: 'Contract extension requested', body: 'Nike Inc. has requested an extension for Ravi Patel through Q1 2027 at $135/hr.', daysAgo: 3, status: 'READ' },
    { type: 'ROLLOFF', title: 'Rolloff alert: John Martinez', body: 'John Martinez at Terumo BCT ends in 14 days. No redeployment claim yet.', daysAgo: 3, status: 'UNREAD' },
    { type: 'EXPENSE', title: 'Expense approved', body: 'Your DFW→DEN travel expense of $1,801.00 has been approved and queued for invoicing.', daysAgo: 5, status: 'READ' },
    { type: 'CONVERSATION', title: 'New message in SAP BRIM requirement', body: 'Sharath Madavaram: I have two strong BRIM candidates available immediately.', daysAgo: 6, status: 'READ' },
    { type: 'SYSTEM', title: 'Payroll processed', body: 'Biweekly payroll cycle completed. 4 consultants processed, total gross: $18,400.', daysAgo: 7, status: 'READ' },
    { type: 'SUBMISSION', title: 'Rate negotiation', body: 'Terumo BCT has counter-offered $125/hr for Anita Desai (you submitted at $120/hr).', daysAgo: 8, status: 'READ' },
    { type: 'TIMESHEET', title: 'Timesheet approved', body: 'Ravi Patel timesheet for Jul 28 – Aug 10 approved. 80 hours at $135/hr.', daysAgo: 10, status: 'READ' },
    { type: 'INVOICE', title: 'Payment received', body: 'Nike Inc. payment of $16,200 received for INV-2026-001. Invoice fully paid.', daysAgo: 12, status: 'READ' },
  ]

  for (const notif of notificationData) {
    const createdAt = new Date(now)
    createdAt.setDate(createdAt.getDate() - notif.daysAgo)
    await prisma.notification.create({
      data: {
        personId: founder.id,
        companyId: vendor.id,
        type: notif.type,
        title: notif.title,
        body: notif.body,
        channel: 'IN_APP',
        status: notif.status,
        readAt: notif.status === 'READ' ? createdAt : null,
        createdAt,
      },
    })
  }

  // ── Rate History ───────────────────────────────
  // BUILD.md §6.9: "Rate changes must be versioned or the timesheet valuation
  // is unreliable."
  // LEGACY_RULES.md §2.4: ChangeRate — date-ranged rate versioning.
  const rateHistoryData = [
    // Anita's sell contract — rate went from $110 → $120 at 90 days
    {
      contractType: 'SELL',
      contractId: sellContracts[0].id,
      rate: 11000, // $110/hr
      rateType: 'HOURLY',
      fromDate: -120,
      toDate: -31,
      reason: 'Initial contract rate',
      previousRate: null,
    },
    {
      contractType: 'SELL',
      contractId: sellContracts[0].id,
      rate: 12000, // $120/hr — current rate
      rateType: 'HOURLY',
      fromDate: -30,
      toDate: null,
      reason: '90-day review — 9% increase based on performance and client feedback',
      previousRate: 11000,
    },
    // John's sell contract — steady rate
    {
      contractType: 'SELL',
      contractId: sellContracts[1].id,
      rate: 10500,
      rateType: 'HOURLY',
      fromDate: -90,
      toDate: null,
      reason: 'Initial contract rate',
      previousRate: null,
    },
    // Ravi's sell contract at Nike — rate went $125 → $130 → $135
    {
      contractType: 'SELL',
      contractId: sellContracts[2].id,
      rate: 12500,
      rateType: 'HOURLY',
      fromDate: -200,
      toDate: -121,
      reason: 'Initial contract rate',
      previousRate: null,
    },
    {
      contractType: 'SELL',
      contractId: sellContracts[2].id,
      rate: 13000,
      rateType: 'HOURLY',
      fromDate: -120,
      toDate: -31,
      reason: '6-month review — 4% increase',
      previousRate: 12500,
    },
    {
      contractType: 'SELL',
      contractId: sellContracts[2].id,
      rate: 13500,
      rateType: 'HOURLY',
      fromDate: -30,
      toDate: null,
      reason: 'Contract extension rate — client requested $135/hr',
      previousRate: 13000,
    },
    // Anita's buy contract — pay rate $75 → $85
    {
      contractType: 'BUY',
      contractId: buyContracts[0].id,
      rate: 7500,
      rateType: 'HOURLY',
      fromDate: -120,
      toDate: -31,
      reason: 'Initial pay rate',
      previousRate: null,
    },
    {
      contractType: 'BUY',
      contractId: buyContracts[0].id,
      rate: 8500,
      rateType: 'HOURLY',
      fromDate: -30,
      toDate: null,
      reason: 'Pay increase aligned with bill rate adjustment',
      previousRate: 7500,
    },
    // Ravi's buy contract (C2C) — $95/hr steady
    {
      contractType: 'BUY',
      contractId: buyContracts[2].id,
      rate: 9500,
      rateType: 'HOURLY',
      fromDate: -200,
      toDate: null,
      reason: 'C2C rate — negotiated with vendor entity',
      previousRate: null,
    },
  ]

  let rateHistoryCount = 0
  for (const rh of rateHistoryData) {
    const fromDate = new Date(now)
    fromDate.setDate(fromDate.getDate() + rh.fromDate)
    const toDate = rh.toDate !== null ? new Date(now) : null
    if (toDate !== null) toDate.setDate(toDate.getDate() + rh.toDate!)

    await prisma.rateHistory.create({
      data: {
        contractType: rh.contractType,
        contractId: rh.contractId,
        rate: rh.rate,
        rateType: rh.rateType,
        fromDate,
        toDate,
        reason: rh.reason,
        changedById: founder.id,
        previousRate: rh.previousRate,
      },
    })
    rateHistoryCount++
  }

  // ── Blacklist ─────────────────────────────────────
  // BUILD.md §6.10: "black_lister — filters candidates and companies out of
  // search, feeds and contracts."
  // Create a third-party company to blacklist
  const blockedCompany = await prisma.company.create({
    data: {
      name: 'Unreliable Staffing LLC',
      slug: 'unreliable-staffing',
      domain: 'unreliable-staffing.com',
      domainVerified: false,
      kind: 'VENDOR',
      currency: 'USD',
    },
  })

  // Create a person to blacklist (not one of our consultants)
  const blockedPerson = await prisma.person.create({
    data: {
      name: 'Former Consultant',
      primaryEmail: 'former@example.com',
    },
  })

  const blacklistData = [
    // Active permanent person blacklist
    {
      targetType: 'PERSON',
      targetId: blockedPerson.id,
      reason: 'Non-performance on 3 consecutive assignments — client escalation and contract termination',
      daysAgo: 90,
      expiresAt: null,
      liftedAt: null,
      liftedById: null,
      liftReason: null,
    },
    // Active permanent company blacklist
    {
      targetType: 'COMPANY',
      targetId: blockedCompany.id,
      reason: 'Failed background verification audit — falsified candidate credentials',
      daysAgo: 60,
      expiresAt: null,
      liftedAt: null,
      liftedById: null,
      liftReason: null,
    },
    // Active temporary blacklist (expires in 90 days)
    {
      targetType: 'COMPANY',
      targetId: client2.id,
      reason: 'Payment dispute — 3 invoices past 90 days overdue. Reinstated after settlement.',
      daysAgo: 30,
      expiresAt: 90, // days from now
      liftedAt: null,
      liftedById: null,
      liftReason: null,
    },
  ]

  let blacklistCount = 0
  for (const bl of blacklistData) {
    const blockedAt = new Date(now)
    blockedAt.setDate(blockedAt.getDate() - bl.daysAgo)
    const expiresAt = bl.expiresAt !== null ? new Date(now) : null
    if (expiresAt !== null) expiresAt.setDate(expiresAt.getDate() + bl.expiresAt!)

    await prisma.blacklist.create({
      data: {
        companyId: vendor.id,
        targetType: bl.targetType,
        targetId: bl.targetId,
        reason: bl.reason,
        blockedById: founder.id,
        blockedAt,
        expiresAt,
        liftedAt: bl.liftedAt ? new Date(bl.liftedAt) : null,
        liftedById: bl.liftedById,
        liftReason: bl.liftReason,
      },
    })
    blacklistCount++
  }

  // ── Automation Log ────────────────────────────────
  // Realistic log entries showing what the system did automatically.
  // These demonstrate platform transparency for enterprise demos.
  const automationData = [
    {
      action: 'COMPANY_CREATED',
      summary: `Company Cloudepa Inc. created with 7 default roles`,
      reason: 'Onboarding: new company created via OAuth sign-in',
      payload: { companyId: vendor.id, slug: 'cloudepa', roles: 7 },
      reversible: false,
      daysAgo: 45,
    },
    {
      action: 'TEMPLATE_PACK_APPLIED',
      summary: `US_SAP template pack applied — 4 contract types, 5 cycle definitions, 12 doc templates`,
      reason: 'Onboarding: template pack selected during company setup',
      payload: { pack: 'US_SAP', contractTypes: 4, cycles: 5, docTemplates: 12 },
      reversible: false,
      daysAgo: 45,
    },
    {
      action: 'IMPORT_COMMITTED',
      summary: `Imported 8 consultants from CSV upload`,
      reason: 'Bulk import committed after column mapping verified by user',
      payload: { total: 8, succeeded: 8, failed: 0, visibility: 'FULL' },
      reversible: false,
      daysAgo: 44,
    },
    {
      action: 'BENCH_LISTING_CREATED',
      summary: `Bench listing requested for ${consultantData[0].name}`,
      reason: 'Vendor added consultant to bench for distribution',
      payload: { personId: people[0].id, tier: 'RETAINED' },
      reversible: true,
      daysAgo: 40,
    },
    {
      action: 'BENCH_LISTING_GRANTED',
      summary: `${consultantData[0].name} granted bench listing — available for submissions`,
      reason: 'Consultant approved sharing profile with vendor network',
      payload: { personId: people[0].id, grantedAt: true },
      reversible: false,
      daysAgo: 39,
    },
    {
      action: 'REQUIREMENT_DISTRIBUTED',
      summary: `Requirement "SAP S/4HANA Migration Lead" distributed to 3 vendors`,
      reason: 'Distribution triggered: vendors selected based on reply rate > 40% and matching skill coverage',
      payload: { requirementId: requirementRecords[0].id, vendorCount: 3, criteria: 'reply_rate > 40%, skill_match' },
      reversible: true,
      daysAgo: 30,
    },
    {
      action: 'CONTRACT_CREATED',
      summary: `Sell contract created for ${consultantData[2].name} at Terumo BCT`,
      reason: 'Contract generated from accepted submission',
      payload: { contractId: sellContracts[0].id, billRate: 12000, client: 'Terumo BCT' },
      reversible: false,
      daysAgo: 28,
    },
    {
      action: 'CONSULTANT_CREATED',
      summary: `Consultant profile created for ${consultantData[3].name}`,
      reason: 'Profile created during bulk import — all required fields present',
      payload: { personId: people[3].id, skills: consultantData[3].skills },
      reversible: false,
      daysAgo: 25,
    },
    {
      action: 'TIMESHEET_APPROVED',
      summary: `Timesheet approved for ${consultantData[2].name} — 40h, $4,800`,
      reason: 'Approved by Sharath Madavaram via timesheets page',
      payload: { personName: consultantData[2].name, hours: 40, amount: 4800 },
      reversible: true,
      daysAgo: 14,
    },
    {
      action: 'INVOICE_GENERATED',
      summary: `Invoice INV-2026-001 generated — $14,400 for Terumo BCT`,
      reason: 'Invoice generated from 3 approved timesheets in billing cycle ending Jul 31',
      payload: { invoiceNumber: 'INV-2026-001', total: 1440000, timesheets: 3, client: 'Terumo BCT' },
      reversible: false,
      daysAgo: 12,
    },
    {
      action: 'PAYMENT_RECORDED',
      summary: `Payment of $14,400 recorded against INV-2026-001`,
      reason: 'Wire transfer confirmed — payment matched to invoice by amount and reference',
      payload: { invoiceNumber: 'INV-2026-001', amount: 1440000, method: 'WIRE' },
      reversible: false,
      daysAgo: 8,
    },
    {
      action: 'ROLLOFF_CLAIMED',
      summary: `Rolloff claimed for ${consultantData[5].name} — contract ends in 14 days`,
      reason: 'Manual claim via rolloff console',
      payload: { contractId: sellContracts[1].id, claimedBy: founder.id, daysUntilEnd: 14 },
      reversible: true,
      daysAgo: 7,
    },
    {
      action: 'EXPENSE_APPROVED',
      summary: `Expense report approved for ${consultantData[2].name} — $450 travel`,
      reason: 'Approved by Sharath Madavaram — within policy limits, billable to client',
      payload: { personName: consultantData[2].name, amount: 45000, category: 'TRAVEL', billable: true },
      reversible: true,
      daysAgo: 5,
    },
    {
      action: 'BLACKLIST_ADD',
      summary: `Unreliable Staffing LLC added to blacklist — permanent`,
      reason: 'Failed background verification audit — falsified candidate credentials',
      payload: { targetType: 'COMPANY', targetName: 'Unreliable Staffing LLC', permanent: true },
      reversible: true,
      daysAgo: 3,
    },
    {
      action: 'PAYROLL_RUN',
      summary: `Payroll cycle completed — 4 consultants, $28,200 disbursed`,
      reason: 'Bi-weekly payroll run for active W2 consultants',
      payload: { consultants: 4, totalDisbursed: 2820000, frequency: 'BI_WEEKLY' },
      reversible: false,
      daysAgo: 2,
    },
    {
      action: 'BENCH_LISTING_REVOKED',
      summary: `${consultantData[6].name} revoked bench listing — no longer available`,
      reason: 'Consultant requested removal from vendor bench',
      payload: { personId: people[6].id },
      reversible: false,
      daysAgo: 1,
    },
  ]

  for (const al of automationData) {
    const at = new Date(now)
    at.setDate(at.getDate() - al.daysAgo)
    await prisma.automationLog.create({
      data: {
        companyId: vendor.id,
        action: al.action,
        summary: al.summary,
        reason: al.reason,
        payload: al.payload,
        reversible: al.reversible,
        at,
      },
    })
  }

  // ── Alumni people (for cross-vendor tenure demo) ────────
  // These are people who worked at Terumo BCT through different vendors
  // and whose contracts have ended. Some came through TechVista.

  const alumniData = [
    { name: 'Marcus Bell',     email: 'marcus@techvista.com',   headline: 'SAP FICO · CO-PA',       skills: ['SAP FICO', 'CO-PA', 'Product Costing'], location: 'Denver, CO',  workAuth: 'US_CITIZEN' },
    { name: 'Sarah Lindqvist', email: 'sarah@techvista.com',    headline: 'Regulatory Affairs',      skills: ['Regulatory Affairs', 'FDA', 'ISO 13485'], location: 'Boulder, CO', workAuth: 'GC' },
    { name: 'Tomás Ferreira',  email: 'tomas@techvista.com',    headline: 'Automation · PLC',        skills: ['PLC', 'Automation', 'SCADA', 'MES'],   location: 'Fort Collins, CO', workAuth: 'US_CITIZEN' },
  ]

  const alumniPeople: any[] = []
  for (const a of alumniData) {
    const person = await prisma.person.create({
      data: { name: a.name, primaryEmail: a.email },
    })

    await prisma.consultantProfile.create({
      data: {
        personId: person.id,
        headline: a.headline,
        skills: a.skills,
        location: a.location,
        workAuth: a.workAuth,
        availableFrom: new Date(),
        visibility: 'VERIFIED',
      },
    })

    // Bench listing under TechVista (available)
    const profile = await prisma.consultantProfile.findUnique({
      where: { personId: person.id },
    })
    if (profile) {
      await prisma.benchListing.create({
        data: {
          consultantId: profile.id,
          companyId: vendor2.id,
          tier: 'RETAINED',
          rateMin: 9000,
          rateMax: 12000,
        },
      })
    }

    await prisma.context.create({
      data: {
        personId: person.id,
        type: 'CONSULTANT',
        companyId: vendor2.id,
      },
    })

    alumniPeople.push(person)
  }

  // ── Ended SellContracts at Terumo BCT (alumni) ────────

  const alumniEngagement = await prisma.engagement.create({
    data: {
      msaId: msaTV.id,
      title: 'Manufacturing Systems Support — Terumo BCT',
      invoiceCycle: 'BIWEEKLY',
    },
  })

  const endedContractData = [
    // Marcus Bell: 18 months via Cloudepa, ended 45 days ago
    // In 90-day break period — demonstrates the re-engagement block
    {
      personId: alumniPeople[0].id,
      companyId: vendor.id,
      clientCompanyId: client.id,
      engagementId: eng1.id,
      msaId: msa.id,
      billRate: 10200,
      state: 'ENDED' as const,
      startDays: -593, // 18 months (548 days) + 45 = 593 days ago
      endDays: -45,    // ended 45 days ago — in break period (45 of 90 days)
    },
    // Sarah Lindqvist: 9 months via TechVista, ended 2 months ago
    {
      personId: alumniPeople[1].id,
      companyId: vendor2.id,
      clientCompanyId: client.id,
      engagementId: alumniEngagement.id,
      msaId: msaTV.id,
      billRate: 9100,
      state: 'ENDED' as const,
      startDays: -330, // ~11 months ago
      endDays: -60,    // ended 2 months ago (9 months duration)
    },
    // Tomás Ferreira: 9 months via TechVista, then 6 months via Cloudepa
    // Total: 15 months — nearing 18-month tenure cap
    // Contract 1: TechVista, ended 8 months ago
    {
      personId: alumniPeople[2].id,
      companyId: vendor2.id,
      clientCompanyId: client.id,
      engagementId: alumniEngagement.id,
      msaId: msaTV.id,
      billRate: 8800,
      state: 'ENDED' as const,
      startDays: -480, // ~16 months ago
      endDays: -210,   // ended 7 months ago (9 months via TechVista)
    },
    // Contract 2: Cloudepa, ended 30 days ago
    {
      personId: alumniPeople[2].id,
      companyId: vendor.id,
      clientCompanyId: client.id,
      engagementId: eng1.id,
      msaId: msa.id,
      billRate: 9600,
      state: 'ENDED' as const,
      startDays: -210, // started right after TechVista contract
      endDays: -30,    // ended 30 days ago (6 months via Cloudepa)
    },
  ]

  const endedContracts: any[] = []
  // Ended contracts carry a manager too — alumni memory is per-department,
  // and tenure aggregates at the client regardless of who supplied them.
  const alumniManagerRotation = ['okafor', 'mbeki', 'whitfield'] as const

  for (const [i, c] of endedContractData.entries()) {
    const startDate = new Date(now)
    startDate.setDate(startDate.getDate() + c.startDays)
    const endDate = new Date(now)
    endDate.setDate(endDate.getDate() + c.endDays)

    const mgrKey = alumniManagerRotation[i % alumniManagerRotation.length]
    const mgr = managers[mgrKey]

    const sc = await prisma.sellContract.create({
      data: {
        companyId: c.companyId,
        clientCompanyId: c.clientCompanyId,
        personId: c.personId,
        billRate: c.billRate,
        state: c.state,
        startDate,
        endDate,
        msaId: c.msaId,
        engagementId: c.engagementId,
        hiringManagerId: mgr.id,
        orgUnitId: mgr.unitId,
      },
    })
    endedContracts.push(sc)
  }

  // Add approved timesheets for ended contracts (so alumni hours aggregate)
  for (const sc of endedContracts) {
    const tsStart = new Date(sc.startDate)
    tsStart.setDate(tsStart.getDate() + 14) // first period after start

    // Build days JSON — 8 hours per weekday in the period
    const days: Record<string, number> = {}
    const d = new Date(sc.startDate)
    while (d <= tsStart) {
      const day = d.getDay()
      if (day !== 0 && day !== 6) {
        days[d.toISOString().slice(0, 10)] = 8
      }
      d.setDate(d.getDate() + 1)
    }

    await prisma.timesheet.create({
      data: {
        sellContractId: sc.id,
        personId: sc.personId,
        status: 'APPROVED',
        periodStart: sc.startDate,
        periodEnd: tsStart,
        totalHours: 80,
        days,
      },
    })
  }

  // ── Governance Policy + Rules (Terumo BCT) ────────────

  const terumoPolicy = await prisma.governancePolicy.create({
    data: {
      companyId: client.id,
      name: 'Terumo BCT Contingent Workforce Policy',
      description: 'Standard governance rules for all contingent workers at Terumo BCT. Aligned with medical device quality system requirements.',
    },
  })

  const governanceRulesData = [
    { ruleType: 'TENURE_CAP' as const,            enforcementMode: 'BLOCK' as const, parameters: { maxMonths: 18 }, description: 'No contingent worker beyond 18 months cumulative at Terumo BCT' },
    { ruleType: 'BREAK_IN_SERVICE' as const,       enforcementMode: 'BLOCK' as const, parameters: { breakDays: 90 }, description: '90-day break in service required after reaching tenure cap' },
    { ruleType: 'RATE_BAND' as const,              enforcementMode: 'WARN' as const,  parameters: { minRate: 7500, maxRate: 16000 }, description: 'Bill rates must fall within $75–$160/hr band' },
    { ruleType: 'WORK_AUTHORIZATION' as const,     enforcementMode: 'BLOCK' as const, parameters: { requiredBefore: 'CONTRACT_START' }, description: 'Valid work authorization verified before assignment start' },
    { ruleType: 'INSURANCE_REQUIRED' as const,     enforcementMode: 'BLOCK' as const, parameters: { types: ['INSURANCE_GL', 'INSURANCE_WC'] }, description: 'Vendor must carry current GL and Workers Comp insurance' },
    { ruleType: 'SEGREGATION_OF_DUTIES' as const,  enforcementMode: 'BLOCK' as const, parameters: { conflictingRoles: [['APPROVER', 'SUBMITTER']] }, description: 'Timesheet submitter cannot also approve their own timesheet' },
  ]

  const govRules: any[] = []
  for (const r of governanceRulesData) {
    const rule = await prisma.governanceRule.create({
      data: {
        policyId: terumoPolicy.id,
        ruleType: r.ruleType,
        enforcementMode: r.enforcementMode,
        parameters: r.parameters,
        description: r.description,
      },
    })
    govRules.push(rule)
  }

  // ── Governance Evaluations ────────────────────────────

  const evaluationsData = [
    // PASS — Anita Desai contract start, work auth check
    { ruleIdx: 3, triggerPoint: 'CONTRACT_START', subjectType: 'PERSON', subjectId: people[2].id, outcome: 'PASS', reason: `${consultantData[2].name} — Green Card holder, work authorization valid`, daysAgo: 120 },
    // PASS — John Martinez contract start, rate band check
    { ruleIdx: 2, triggerPoint: 'CONTRACT_START', subjectType: 'SELL_CONTRACT', subjectId: sellContracts[1].id, outcome: 'PASS', reason: `${consultantData[5].name} — $105/hr within $75–$160 band`, daysAgo: 90 },
    // PASS — Cloudepa insurance verified
    { ruleIdx: 4, triggerPoint: 'CONTRACT_START', subjectType: 'SELL_CONTRACT', subjectId: sellContracts[0].id, outcome: 'PASS', reason: 'Cloudepa Inc. — GL and WC insurance verified, expires 2027-03-15', daysAgo: 120 },
    // PASS — Ravi Patel work auth (H1B valid through 2027)
    { ruleIdx: 3, triggerPoint: 'CONTRACT_START', subjectType: 'PERSON', subjectId: people[0].id, outcome: 'PASS', reason: `${consultantData[0].name} — H1B valid through 2027-04-30`, daysAgo: 200 },
    // PASS — segregation of duties check
    { ruleIdx: 5, triggerPoint: 'SUBMISSION', subjectType: 'PERSON', subjectId: people[1].id, outcome: 'PASS', reason: `${consultantData[1].name} — no conflicting role assignments`, daysAgo: 45 },
    // WARN — Meera rate above band (overridden)
    { ruleIdx: 2, triggerPoint: 'CONTRACT_START', subjectType: 'SELL_CONTRACT', subjectId: sellContracts[3].id, outcome: 'WARN', reason: `${consultantData[4].name} — $130/hr exceeds typical band for Data Engineer role. Specialist Snowflake skill justifies premium.`, daysAgo: 14, overriddenBy: founder.id, overrideNote: 'Approved — Snowflake expertise rare in Colorado market, justified premium' },
    // WARN — approaching headcount (no override)
    { ruleIdx: 2, triggerPoint: 'SUBMISSION', subjectType: 'SELL_CONTRACT', subjectId: sellContracts[0].id, outcome: 'WARN', reason: 'IT contingent headcount at 87 of 100 — approaching limit', daysAgo: 30 },
    // BLOCK — Marcus Bell tenure cap reached, in break period
    { ruleIdx: 0, triggerPoint: 'ALUMNI_REENGAGEMENT', subjectType: 'PERSON', subjectId: alumniPeople[0].id, outcome: 'BLOCK', reason: `${alumniData[0].name} — 18 months cumulative at Terumo BCT (cap: 18). In 90-day break period, eligible ${new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}.`, daysAgo: 5 },
    // WARN — Tomás Ferreira approaching tenure cap
    { ruleIdx: 0, triggerPoint: 'CONTRACT_EXTENSION', subjectType: 'PERSON', subjectId: alumniPeople[2].id, outcome: 'WARN', reason: `${alumniData[2].name} — 15 months cumulative at Terumo BCT (cap: 18). Approaching limit.`, daysAgo: 10 },
  ]

  let evalCount = 0
  for (const e of evaluationsData) {
    const evaluatedAt = new Date(now)
    evaluatedAt.setDate(evaluatedAt.getDate() - e.daysAgo)

    await prisma.governanceEvaluation.create({
      data: {
        ruleId: govRules[e.ruleIdx].id,
        triggerPoint: e.triggerPoint,
        subjectType: e.subjectType,
        subjectId: e.subjectId,
        outcome: e.outcome,
        reason: e.reason,
        overriddenBy: (e as any).overriddenBy ?? null,
        overrideNote: (e as any).overrideNote ?? null,
        evaluatedAt,
      },
    })
    evalCount++
  }

  // ── Verifications ─────────────────────────────────────

  const verificationsData = [
    // Person-level — I-9/E-Verify
    { personId: people[0].id, type: 'I9_EVERIFY' as const, status: 'CLEAR' as const, provider: 'E-Verify', daysAgo: 200 },
    { personId: people[2].id, type: 'I9_EVERIFY' as const, status: 'CLEAR' as const, provider: 'E-Verify', daysAgo: 120 },
    { personId: people[5].id, type: 'I9_EVERIFY' as const, status: 'CLEAR' as const, provider: 'E-Verify', daysAgo: 90 },
    { personId: people[4].id, type: 'I9_EVERIFY' as const, status: 'PENDING' as const, provider: 'E-Verify', daysAgo: 14 },
    // Background checks
    { personId: people[0].id, type: 'BACKGROUND_CHECK' as const, status: 'CLEAR' as const, provider: 'HireRight', daysAgo: 200 },
    { personId: people[2].id, type: 'BACKGROUND_CHECK' as const, status: 'CLEAR' as const, provider: 'HireRight', daysAgo: 120 },
    { personId: people[5].id, type: 'BACKGROUND_CHECK' as const, status: 'CLEAR' as const, provider: 'Sterling', daysAgo: 90 },
    { personId: people[4].id, type: 'BACKGROUND_CHECK' as const, status: 'CLEAR' as const, provider: 'HireRight', daysAgo: 14 },
    // Drug screening
    { personId: people[0].id, type: 'DRUG_SCREENING' as const, status: 'CLEAR' as const, provider: 'Quest', daysAgo: 200 },
    { personId: people[2].id, type: 'DRUG_SCREENING' as const, status: 'CLEAR' as const, provider: 'Quest', daysAgo: 120 },
    { personId: people[5].id, type: 'DRUG_SCREENING' as const, status: 'CONDITIONAL' as const, provider: 'Quest', daysAgo: 88 },
    // Company-level — insurance
    { companyId: vendor.id, type: 'INSURANCE_GL' as const, status: 'CLEAR' as const, provider: 'Travelers', daysAgo: 300, expiresInDays: 200 },
    { companyId: vendor.id, type: 'INSURANCE_WC' as const, status: 'CLEAR' as const, provider: 'Travelers', daysAgo: 300, expiresInDays: 200 },
    { companyId: vendor2.id, type: 'INSURANCE_GL' as const, status: 'CLEAR' as const, provider: 'Hartford', daysAgo: 180, expiresInDays: 90 },
    { companyId: vendor2.id, type: 'INSURANCE_WC' as const, status: 'PENDING' as const, provider: 'Hartford', daysAgo: 30 },
  ]

  let verificationCount = 0
  for (const v of verificationsData) {
    const issuedAt = new Date(now)
    issuedAt.setDate(issuedAt.getDate() - v.daysAgo)
    const expiresAt = (v as any).expiresInDays
      ? new Date(now.getTime() + (v as any).expiresInDays * 24 * 60 * 60 * 1000)
      : null

    await prisma.verification.create({
      data: {
        personId: (v as any).personId ?? null,
        companyId: (v as any).companyId ?? null,
        type: v.type,
        status: v.status,
        provider: v.provider,
        issuedAt,
        expiresAt,
        uploadedById: founder.id,
        verifiedById: v.status === 'CLEAR' ? founder.id : null,
        verifiedAt: v.status === 'CLEAR' ? issuedAt : null,
      },
    })
    verificationCount++
  }

  console.log('✅ Seed complete.')
  console.log(`   Companies:    5 (${vendor.name}, ${vendor2.name}, ${msp.name}, ${client.name}, ${client2.name})`)
  console.log(`   Demo user:    ${founder.primaryEmail} — 2 contexts (${vendor.name} vendor, ${client.name} client)`)
  console.log(`   Locations:    4 (${locHQ.name}, ${locAnnArbor.name}, ${locTokyo.name}, ${locRemote.name})`)
  console.log(`   Consultants:  ${consultantData.length} + ${alumniData.length} alumni`)
  console.log(`   Requirements: ${reqs.length}`)
  console.log(`   Submissions:  ${submissionData.length}`)
  console.log(`   Sell contracts: ${contractData.length + 1} active (1 via MSP) + ${endedContractData.length} ended`)
  console.log(`   Buy contracts:  ${buyContractData.length} (${buyContractData.filter(b => b.state !== 'DRAFT').length} active)`)
  console.log(`   Timesheets:   ${timesheetData.length} + ${endedContractData.length} alumni`)
  console.log(`   Engagements:  3 (${eng1.title}, ${eng2.title}, ${alumniEngagement.title})`)
  console.log(`   Invoices:     ${invoiceData.length}`)
  console.log(`   Expenses:     ${expenseData.length}`)
  console.log(`   Conversations: ${conversationCount} (${messageCount} messages)`)
  console.log(`   Notifications: ${notificationData.length}`)
  console.log(`   Rate history: ${rateHistoryCount}`)
  console.log(`   Blacklist:    ${blacklistCount}`)
  console.log(`   Automation:   ${automationData.length}`)
  console.log(`   Payments:     3`)
  console.log(`   Governance:   1 policy, ${governanceRulesData.length} rules, ${evalCount} evaluations`)
  console.log(`   Verifications: ${verificationCount}`)
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e)
    prisma.$disconnect()
    process.exit(1)
  })
