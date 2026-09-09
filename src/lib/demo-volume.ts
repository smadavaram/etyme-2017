/**
 * Enough rows to make the working surfaces work.
 *
 * A demo with one requirement and one submission demonstrates a form. A
 * working surface — the dense, sortable, filterable, searchable table
 * the design system says every list must be — cannot be judged against
 * one row, because there is nothing to sort, filter, or search. The
 * founder looked at the page and could not tell whether it worked,
 * which is the correct verdict on one row.
 *
 * So this fills a freshly seeded demo company's book to the volume a
 * mid-market programme actually runs at: a couple of hundred
 * requirements, a few hundred submissions against them, a bench of
 * consultants across the suppliers, and a handful of unread
 * notifications so the bell has something to say.
 *
 * ── What it is not ───────────────────────────────────────────────────
 *
 * Not a replacement for the chain seed. That builds one placement all
 * the way through to money, with every station honest. This adds width
 * to it, not depth: the rows here stop at the pipeline and never reach a
 * contract, because four hundred contracts with four hundred sets of
 * timesheets is not what anybody opens a demo to look at.
 *
 * ── Reproducible on purpose ──────────────────────────────────────────
 *
 * Every random choice comes from a seeded generator keyed on the
 * company, so two visitors who start from the same seat see the same
 * world and a bug report can be reproduced by starting again. Math.random
 * would give each visitor a private set of numbers nobody could match.
 */

import { prisma as db } from '@/lib/db'

// ── Deterministic randomness ─────────────────────────────────────────

/** mulberry32. Small, fast, and good enough to shuffle a demo. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

// ── The material ─────────────────────────────────────────────────────
//
// Horizontal on purpose. A demo that is all Java developers reads as an
// IT staffing tool, which the positioning says never to be.

interface Role {
  title: string
  skills: string[]
  band: [number, number] // cents per hour
  /** What the manager would actually write. */
  says: string
}

const ROLES: Role[] = [
  { title: 'SAP FICO consultant', skills: ['SAP FICO', 'S/4HANA'], band: [12000, 14500],
    says: 'Finance is moving off ECC in Q2 and the current team has done configuration but never a cutover. We need somebody who has taken a plant live on S/4 and can say what goes wrong in week two.' },
  { title: 'Epic Ambulatory analyst', skills: ['Epic', 'Ambulatory', 'Clinical workflows'], band: [10500, 12500],
    says: 'Two clinics onboarding onto our Epic instance in the autumn. The build is done; this is workflow validation with the clinical leads and the go-live support that follows. Certification current, please.' },
  { title: 'Java microservices engineer', skills: ['Java', 'Spring Boot', 'Kubernetes'], band: [11500, 13500],
    says: 'Payments platform, twelve services, moving from a shared database to one per service. Team of five. The person will own two of the extractions end to end and sit in the on-call rotation from month two.' },
  { title: 'Validation engineer', skills: ['CSV', 'GAMP 5', 'IQ/OQ/PQ'], band: [9500, 11500],
    says: 'New packaging line, validation protocols to be written and executed under our QMS. Pharma background essential. This is documentation-heavy and the auditors will read every page.' },
  { title: 'Travel nurse — ICU', skills: ['ICU', 'Critical care', 'BLS/ACLS'], band: [8500, 10500],
    says: 'Thirteen-week block, nights, 24-bed unit. Compact licence required. We have housing stipend arrangements with two suppliers and will discuss for a third.' },
  { title: 'Avionics test engineer', skills: ['DO-178C', 'Embedded C', 'Test benches'], band: [13000, 15000],
    says: 'Flight control software certification programme. Hardware-in-the-loop rig is built; this is test procedure authorship and execution to DAL B. Prior certification evidence packages a strong plus.' },
  { title: 'Workday integrations lead', skills: ['Workday', 'Studio', 'EIB'], band: [13500, 15500],
    says: 'Payroll vendor is changing and eleven integrations touch it. Studio experience is the whole requirement — we have plenty of people who can do EIBs.' },
  { title: 'Data engineer', skills: ['Python', 'dbt', 'Snowflake'], band: [10500, 12500],
    says: 'Marketing analytics warehouse is a tangle of hand-written SQL nobody owns. Rebuild it in dbt with tests. The person will inherit forty models and should expect to delete half.' },
  { title: 'Oracle Retail consultant', skills: ['Oracle Retail', 'RMS', 'PL/SQL'], band: [12000, 14000],
    says: 'Merchandising system upgrade, 14 to 19. Functional and technical. Store count is 340 and the allocation module is customised in ways the vendor does not support.' },
  { title: 'Murex support analyst', skills: ['Murex', 'FX', 'MxML'], band: [12500, 14500],
    says: 'FX desk, follow-the-sun support, London hours. Production incidents, MxML workflow changes, and the monthly release regression. Not a build role.' },
  { title: 'Business analyst', skills: ['Requirements', 'Process mapping', 'SQL'], band: [7500, 9500],
    says: 'Claims process re-engineering. Sit with the adjusters, map what actually happens, write it up so the platform team can build against it. Insurance background helps, listening skills matter more.' },
  { title: 'QA automation engineer', skills: ['Selenium', 'Playwright', 'CI'], band: [8000, 10000],
    says: 'Manual regression takes nine days. Get it under two. Existing suite is Selenium and brittle; we would accept a Playwright rewrite if the case is made.' },
  { title: 'Cybersecurity analyst', skills: ['SIEM', 'Incident response', 'Splunk'], band: [9500, 12000],
    says: 'SOC tier 2, rotating shifts. Splunk tuning, playbook authorship, escalation. Clearance not required, background check is.' },
  { title: 'PLM systems engineer', skills: ['Teamcenter', 'PLM', 'CAD integration'], band: [12000, 14000],
    says: 'Teamcenter upgrade with NX integration. Engineering change process is the hard part — 2,000 engineers use it and every one has an opinion.' },
  { title: 'Scrum master', skills: ['Scrum', 'Jira', 'Facilitation'], band: [7500, 9500],
    says: 'Two squads, one of which has never worked in sprints. Bring the second up to the first without breaking the first.' },
  { title: 'Salesforce developer', skills: ['Apex', 'LWC', 'Salesforce'], band: [9500, 11500],
    says: 'Service Cloud implementation, phase two. Case routing, entitlements, a customer portal. The org is heavily customised and the previous developer left no notes.' },
  { title: 'Mechanical design engineer', skills: ['SolidWorks', 'GD&T', 'DFM'], band: [8500, 10500],
    says: 'Enclosure redesign for cost-down. Sheet metal to injection moulding. The person will work with the supplier in Monterrey directly.' },
  { title: 'Clinical research coordinator', skills: ['GCP', 'CRF', 'Site management'], band: [6500, 8500],
    says: 'Phase III oncology trial, three sites. Patient scheduling, CRF completion, monitor visits. GCP certification within the last two years.' },
  { title: 'Network engineer', skills: ['Cisco', 'BGP', 'SD-WAN'], band: [9500, 11500],
    says: 'Forty-site SD-WAN rollout replacing MPLS. Cutover planning, on-site for the first five, remote thereafter.' },
  { title: 'Technical writer', skills: ['DITA', 'API documentation', 'Markdown'], band: [6000, 8000],
    says: 'Public API docs are three years stale. Rewrite them against the current OpenAPI spec and set up the pipeline so they stop rotting.' },
  { title: 'Project manager — infrastructure', skills: ['PMP', 'Data centre', 'Vendor management'], band: [10000, 12000],
    says: 'Data centre exit. 18 months, 400 workloads, four vendors, a landlord who wants us out. Has to have done one before.' },
  { title: 'Machine learning engineer', skills: ['Python', 'PyTorch', 'MLOps'], band: [13000, 15500],
    says: 'Demand forecasting model is in a notebook. Make it a service with monitoring, retraining, and a rollback. Not research — productionisation.' },
  { title: 'Electrical engineer — power systems', skills: ['Protection relays', 'ETAP', 'NEC'], band: [10000, 12500],
    says: 'Substation upgrade, protection coordination study, relay settings. PE licence preferred, utility experience essential.' },
  { title: 'UX designer', skills: ['Figma', 'User research', 'Design systems'], band: [8000, 10000],
    says: 'Internal tooling for the claims team. Nobody has ever asked them what they need. Start there.' },
]

const PLACES = [
  'Dallas, TX', 'Charlotte, NC', 'Madison, WI', 'San Jose, CA', 'Columbus, OH',
  'Minneapolis, MN', 'Wichita, KS', 'Everett, WA', 'Jersey City, NJ', 'Atlanta, GA',
  'Chicago, IL', 'Phoenix, AZ', 'Denver, CO', 'Raleigh, NC', 'Austin, TX', 'Remote',
]

const FIRST = [
  'Priya', 'Daniel', 'Anjali', 'Marcus', 'Ravi', 'Elena', 'Thomas', 'Sneha', 'Grace',
  'Arjun', 'Yusuf', 'Claire', 'Vikram', 'Naomi', 'Peter', 'Divya', 'Ifeoma', 'Tobias',
  'Meera', 'Samuel', 'Aisha', 'Lucas', 'Kavya', 'Omar', 'Hannah', 'Rohan', 'Zara',
  'Felix', 'Lakshmi', 'Jonas', 'Amara', 'Nikhil', 'Sofia', 'Karthik', 'Leila',
]
const LAST = [
  'Raman', 'Osei', 'Mehta', 'Whitfield', 'Subramanian', 'Castillo', 'Okonkwo',
  'Kulkarni', 'Lindqvist', 'Nair', 'Demir', 'Beaumont', 'Joshi', 'Adeyemi',
  'Halloran', 'Rangan', 'Balogun', 'Lindgren', 'Balakrishnan', 'Park', 'Hassan',
  'Ferreira', 'Iyer', 'Farouk', 'Novak', 'Desai', 'Rahimi', 'Weber', 'Pillai',
  'Berg', 'Nwosu', 'Reddy', 'Costa', 'Menon', 'Haddad',
]

// ── The distribution ─────────────────────────────────────────────────
//
// Weighted so the stage tabs all have something in them and the shape
// looks like a programme that has been running for a while: most roles
// open, a fair number filled, a few in each of the awkward states.

function pick<T>(r: () => number, xs: readonly T[]): T {
  return xs[Math.floor(r() * xs.length)]
}

function weighted<T extends string | number>(r: () => number, table: Array<[T, number]>): T {
  const total = table.reduce((n, [, w]) => n + w, 0)
  let x = r() * total
  for (const [v, w] of table) {
    x -= w
    if (x <= 0) return v
  }
  return table[table.length - 1][0]
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000)
const daysAhead = (n: number) => new Date(Date.now() + n * 86_400_000)

// ── The seeder ───────────────────────────────────────────────────────

export interface VolumeInput {
  /** The company whose book gets filled. */
  companyId: string
  /** Who is signed in — they get the unread notifications. */
  seatPersonId: string
  /** How many. Defaults chosen to clear the founder's floor with margin. */
  requirements?: number
  submissions?: number
}

export interface VolumeResult {
  requirements: number
  submissions: number
  consultants: number
  notifications: number
  /** True when the company already had volume and nothing was added. */
  skipped: boolean
}

/**
 * Fill a demo company's book.
 *
 * Refuses to run twice: a company that already carries more than fifty
 * requirements has been filled, and running again would double it.
 */
export async function addVolume(input: VolumeInput): Promise<VolumeResult> {
  const wantReqs = input.requirements ?? 220
  const wantSubs = input.submissions ?? 450

  const company = await db.company.findUniqueOrThrow({
    where: { id: input.companyId },
    select: { id: true, slug: true, kind: true, isDemo: true },
  })

  // Real companies are never bulk-filled. This is for sandboxes only.
  if (!company.isDemo) {
    throw new Error('addVolume only fills demo companies')
  }

  const already = await db.requirement.count({ where: { companyId: company.id } })
  if (already > 50) {
    return { requirements: 0, submissions: 0, consultants: 0, notifications: 0, skipped: true }
  }

  const r = rng(hash(company.slug))

  // ── Who supplies this company ──────────────────────────────────────
  //
  // The chain seed names its firms `<visitor>-<seat>`, so the siblings
  // of this company are the rest of its chain. Where this is a supplier
  // rather than a buyer, the same lookup finds the buyer and the other
  // suppliers, and the roles below flip accordingly.
  const stem = company.slug.replace(/-(client|msp|gsi|prime|bench)$/i, '')
  const chain = await db.company.findMany({
    where: { slug: { startsWith: stem }, isDemo: true },
    select: { id: true, kind: true, name: true },
  })
  const buyers = chain.filter((c) => c.kind === 'CLIENT' || c.kind === 'MSP')
  const suppliers = chain.filter((c) => c.kind === 'VENDOR' || c.kind === 'GSI')

  const isBuyer = company.kind === 'CLIENT' || company.kind === 'MSP'
  // The requirement owner and the parties on each submission.
  const owner = isBuyer ? company : (buyers[0] ?? company)
  const sendersPool = isBuyer ? suppliers : [company, ...suppliers.filter((s) => s.id !== company.id)]
  if (sendersPool.length === 0) sendersPool.push(company)

  // ── Consultants on the suppliers' benches ──────────────────────────
  const consultantCount = Math.max(80, Math.ceil(wantSubs / 4))
  const people: { name: string; primaryEmail: string }[] = []
  const seen = new Set<string>()
  while (people.length < consultantCount) {
    const name = `${pick(r, FIRST)} ${pick(r, LAST)}`
    if (seen.has(name)) continue
    seen.add(name)
    const local = name.toLowerCase().replace(/[^a-z]+/g, '.')
    people.push({ name, primaryEmail: `${local}.${stem.slice(-6)}@demo.etyme.invalid` })
  }
  await db.person.createMany({ data: people, skipDuplicates: true })
  const persons = await db.person.findMany({
    where: { primaryEmail: { in: people.map((p) => p.primaryEmail) } },
    select: { id: true, name: true },
  })

  // A profile each, with skills drawn from the same role pool the
  // requirements use, so matches are possible rather than accidental.
  const profiles = persons.map((p) => {
    const role = pick(r, ROLES)
    return {
      personId: p.id,
      skills: role.skills,
      location: pick(r, PLACES),
      visibility: 'VERIFIED' as const,
      workAuth: weighted(r, [['USC', 4], ['GC', 3], ['H1B', 3], ['TN', 1]]),
    }
  })
  await db.consultantProfile.createMany({ data: profiles, skipDuplicates: true })
  const profileRows = await db.consultantProfile.findMany({
    where: { personId: { in: persons.map((p) => p.id) } },
    select: { id: true, personId: true, skills: true },
  })

  // Each consultant sits on one supplier's bench, granted. A submission
  // requires a live listing, and seed data should not be the exception.
  const supplierFor = new Map<string, string>()
  await db.benchListing.createMany({
    data: profileRows.map((pr) => {
      const supplier = pick(r, sendersPool)
      supplierFor.set(pr.personId, supplier.id)
      return {
        consultantId: pr.id,
        companyId: supplier.id,
        tier: 'RETAINED' as const,
        state: 'GRANTED',
        invitedAt: daysAgo(200),
        respondedAt: daysAgo(199),
        grantedAt: daysAgo(199),
      }
    }),
    skipDuplicates: true,
  })

  // ── Requirements ───────────────────────────────────────────────────
  const reqRows = Array.from({ length: wantReqs }, (_, i) => {
    const role = ROLES[i % ROLES.length]
    const age = Math.floor(r() * 180)
    const status = weighted(r, [
      ['OPEN', 55], ['FILLED', 22], ['DRAFT', 8], ['CANCELLED', 8], ['CLOSED', 7],
    ])
    const approvalState =
      status === 'DRAFT'
        ? weighted(r, [['DRAFT', 6], ['PENDING_APPROVAL', 3], ['CHANGES_REQUESTED', 1]])
        : status === 'CANCELLED'
          ? 'APPROVED'
          : weighted(r, [['AUTO_APPROVED', 7], ['APPROVED', 3]])
    const heads = weighted(r, [[1, 7], [2, 2], [3, 1]])
    const [lo, hi] = role.band
    const wobble = Math.round((r() - 0.5) * 1000)
    return {
      companyId: owner.id,
      title: role.title,
      skills: role.skills,
      description: role.says,
      location: pick(r, PLACES),
      billMin: lo + wobble,
      billMax: hi + wobble,
      headcount: heads,
      months: pick(r, [6, 6, 12, 12, 12, 18, 24]),
      neededBy: daysAhead(15 + Math.floor(r() * 60) - age),
      status,
      approvalState,
      source: weighted(r, [['MANUAL', 6], ['EMAIL', 2], ['VMS', 2]]),
      cancelReason: status === 'CANCELLED' ? 'Budget reallocated to Q3 programme.' : null,
      createdAt: daysAgo(age),
    }
  })
  await db.requirement.createMany({ data: reqRows })
  const reqs = await db.requirement.findMany({
    where: { companyId: owner.id },
    select: { id: true, skills: true, billMax: true, status: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  // ── Submissions ────────────────────────────────────────────────────
  //
  // Skewed: a third of the roles get most of the traffic, some get
  // none. That is what a real pipeline looks like, and a flat two per
  // role would read as generated.
  const byPerson = new Map(profileRows.map((p) => [p.personId, p]))
  const subRows: Array<Record<string, unknown>> = []
  const used = new Set<string>()
  const live = reqs.filter((q) => q.status !== 'DRAFT')
  let guard = 0
  while (subRows.length < wantSubs && guard++ < wantSubs * 6) {
    // Heavier weight on the newer, open roles.
    const idx = Math.floor(Math.pow(r(), 1.6) * live.length)
    const req = live[idx]
    if (!req) continue
    const person = pick(r, persons)
    const key = `${req.id}:${person.id}`
    if (used.has(key)) continue
    used.add(key)

    const from = supplierFor.get(person.id) ?? sendersPool[0].id
    const to = owner.id
    if (from === to) continue

    const profile = byPerson.get(person.id)
    const fits = profile?.skills.some((s) => req.skills.includes(s)) ?? false
    const status = weighted(r, [
      ['SUBMITTED', 40], ['SHORTLISTED', 22], ['INTERVIEWING', 10],
      ['OFFERED', 4], ['PLACED', 8], ['REJECTED', 16],
    ])
    const submittedAt = new Date(
      req.createdAt.getTime() + Math.floor(r() * 14) * 86_400_000 + 3_600_000
    )
    const decided = status === 'PLACED' || status === 'REJECTED'
    subRows.push({
      requirementId: req.id,
      personId: person.id,
      fromCompanyId: from,
      toCompanyId: to,
      kind: 'BENCH',
      rate: Math.round((req.billMax ?? 10000) * (0.82 + r() * 0.16)),
      contractType: weighted(r, [['W2', 5], ['C2C', 4], ['IND_1099', 1]]),
      status,
      checkState: 'SENT',
      screenState: fits ? 'READY' : weighted(r, [['READY', 6], ['NEEDS_FIX', 4]]),
      submittedAt,
      decidedAt: decided ? new Date(submittedAt.getTime() + (3 + Math.floor(r() * 20)) * 86_400_000) : null,
      rejectReason: status === 'REJECTED'
        ? weighted(r, [['RATE', 3], ['SKILLS', 3], ['AVAILABILITY', 2], ['WORK_AUTH', 1], ['TIMING', 1]])
        : null,
    })
  }
  await db.submission.createMany({ data: subRows as never[], skipDuplicates: true })

  // ── Something unread ───────────────────────────────────────────────
  //
  // Twelve, so the bell has a number rather than a dot, and all of them
  // about things that actually exist in the book above.
  const fresh = await db.submission.findMany({
    where: { toCompanyId: owner.id, status: 'SUBMITTED' },
    orderBy: { submittedAt: 'desc' },
    take: 12,
    select: { id: true, requirement: { select: { title: true } }, person: { select: { name: true } }, fromCompany: { select: { name: true } } },
  })
  const notes = fresh.map((s, i) => ({
    personId: input.seatPersonId,
    companyId: company.id,
    type: 'SUBMISSION',
    title: `${s.person.name} put forward for ${s.requirement.title}`,
    body: `${s.fromCompany.name} submitted ${s.person.name}. Waiting on your screen.`,
    entityId: s.id,
    channel: 'IN_APP',
    deliveryState: 'DELIVERED',
    deliveredAt: daysAgo(i * 0.3),
    status: 'UNREAD',
    createdAt: daysAgo(i * 0.3),
  }))
  await db.notification.createMany({ data: notes })

  return {
    requirements: reqRows.length,
    submissions: subRows.length,
    consultants: persons.length,
    notifications: notes.length,
    skipped: false,
  }
}
