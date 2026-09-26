/**
 * One market, twenty firms, seen from every side.
 *
 * Every demo built a private five-company copy per visitor, so signing in
 * as CloudEPA and signing in as Harlow Health showed two unrelated worlds
 * with the same placeholder names. Nothing lined up, because nothing was
 * the same data.
 *
 * This builds one world instead. A consultant CloudEPA sourced sits at
 * Harlow Health through Computer Systems, and each of those three firms
 * sees its own true side of that one placement:
 *
 *   Harlow Health      a contractor on site, supplied by Computer
 *                      Systems, at $138/hr. It never learns CloudEPA
 *                      exists.
 *   Computer Systems   sells at $138, buys from CloudEPA at $112,
 *                      keeps $26.
 *   CloudEPA           sells to Computer Systems at $112, pays the
 *                      consultant $86, keeps $26. It cannot see what
 *                      Harlow Health pays.
 *
 * Nothing is duplicated to make that work — it is one contract chain read
 * from three positions, which is the whole product.
 *
 * ── Not a demo copy ──────────────────────────────────────────────────
 *
 * These twenty are `isDemo: false` deliberately. A demo company is reaped
 * after a fortnight and deleted outright by the "start again with clean
 * data" button; this world has to survive both. It is reference data many
 * people look at, not one visitor\'s sandbox.
 *
 * Idempotent by slug: run it twice and there is one world. That also
 * makes it safe to re-run after a timeout — it picks up where it stopped.
 */

import { prisma as db } from '@/lib/db'
import { writeCyclesFor } from '@/lib/contract-cycles'
import { seedProgrammes } from '@/lib/seed-programmes'
import { seedDoors } from '@/lib/seed-doors'
import { anchorSeed, day, at } from '@/lib/seed-days'
import { seedCalendar, holidayKeys } from '@/lib/seed-calendar'
import { seedStanding } from '@/lib/seed-standing'
import { seedOrderToCash } from '@/lib/seed-order-to-cash'
import { seedPipeline } from '@/lib/seed-pipeline'
import { seedDocumentRequirements } from '@/lib/seed-document-requirements'
import { rolesFor, RENAMED_ROLES } from '@/lib/company-defaults'
// A seeded bill is shaped by the two doors a real one is: `periodFor`
// under the terms of the document the line is on, and `dueOn` under what
// those terms count from.
import { periodFor, iso, type Period } from '@/lib/periods'
import { periodTermsFor, termsFor } from '@/lib/money/order-terms'
import { dueOn } from '@/lib/billing-cascade'

/** `n` days after a UTC midnight, still at UTC midnight. */
function plusDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000)
}

/** The earlier of two days. Keeps a seeded date out of the future. */
function earlierOf(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b
}

const DOMAIN = 'demo.etyme.local'          // the domain the signed demo cookie accepts
const PREFIX = 'world-'                    // marks a company as part of this world

// ── The market ───────────────────────────────────────────────────────
//
// Four buyers, two program offices, two delivery firms, six primes and
// six bench vendors. The shape of the contingent market, small enough to
// hold in your head and wide enough that every seat has somebody above
// and below it.
type Kind = 'CLIENT' | 'MSP' | 'GSI' | 'VENDOR'
interface Firm {
  slug: string; name: string; kind: Kind; seat: string; who: string
  /**
   * A firm on the register that nobody at it has joined.
   *
   * `Company.claimedAt` stays null and no seat is created, which is what
   * a shell actually is: it can be traded with and recorded against, it
   * cannot sign in, and every screen says so. Exactly one firm in this
   * world is one, because three real answers turn on the difference and
   * a world where every firm is here can demonstrate none of them.
   */
  seatless?: true
}
/** The VP who owns the money at each client, by name. */
const VP_NAMES: Record<string, string> = {'harlow-health': 'Marianne Cole', 'meridian-bank': 'Theo Lindsay', 'corveldt': 'Helga Brandt', 'nordway': 'Sigrid Hansen', 'nike': 'Dana Whitfield', 'corning': 'Robert Ashby', 'terumo-bct': 'Elena Vasquez'}

const FIRMS: Firm[] = [
  { slug: 'harlow-health',    name: 'Harlow Health',        kind: 'CLIENT',  seat: 'Program office', who: 'Grace Whitmore' },
  { slug: 'meridian-bank',    name: 'Meridian Bank',        kind: 'CLIENT',  seat: 'Contingent program', who: 'Daniel Achebe' },
  { slug: 'corveldt',         name: 'Corveldt Aerospace',   kind: 'CLIENT',  seat: 'Engineering resourcing', who: 'Ines Marquardt' },
  { slug: 'nordway',          name: 'Nordway Retail',       kind: 'CLIENT',  seat: 'Workforce office', who: 'Olav Brekke' },

  // Three enterprise programs, seated for every desk that works one —
  // hiring, approval, payables, compliance. The client is who pays for
  // this product, and these are the accounts it is shown on. What each
  // of them has on its books is in lib/seed-programmes.
  { slug: 'nike',             name: 'Northbend Athletic',   kind: 'CLIENT',  seat: 'Contingent workforce office', who: 'Camille Whitford' },
  { slug: 'corning',          name: 'Cavanaugh Glassworks', kind: 'CLIENT',  seat: 'Contingent workforce office', who: 'Ethan Garland' },
  { slug: 'terumo-bct',       name: 'Talvern Medical',      kind: 'CLIENT',  seat: 'Contingent workforce office', who: 'Naomi Feldman' },

  { slug: 'aptiva',           name: 'Aptiva Workforce',     kind: 'MSP',     seat: 'Program manager', who: 'Rashida Coleman' },
  { slug: 'kestrel',          name: 'Kestrel MSP',          kind: 'MSP',     seat: 'Program manager', who: 'Piotr Zielinski' },

  { slug: 'teleworld',        name: 'Teleworld Solutions',  kind: 'GSI',     seat: 'Delivery manager', who: 'Sunil Raghavan' },
  { slug: 'sundara',          name: 'Sundara Systems',      kind: 'GSI',     seat: 'Delivery manager', who: 'Lakshmi Iyer' },

  { slug: 'computer-systems', name: 'Computer Systems Inc', kind: 'VENDOR',  seat: 'Account manager', who: 'Victor Hale' },
  { slug: 'brightmoor',       name: 'Brightmoor Staffing',  kind: 'VENDOR',  seat: 'Account manager', who: 'Jenna Okafor' },
  { slug: 'vertex-global',    name: 'Vertex Global',        kind: 'VENDOR',  seat: 'Account manager', who: 'Marco Petrucci' },
  { slug: 'halcyon',          name: 'Halcyon Talent',       kind: 'VENDOR',  seat: 'Account manager', who: 'Sade Balogun' },
  { slug: 'pinnacle',         name: 'Pinnacle Resourcing',  kind: 'VENDOR',  seat: 'Account manager', who: 'Ruth Calloway' },
  { slug: 'arcadia',          name: 'Arcadia Tech Group',   kind: 'VENDOR',  seat: 'Account manager', who: 'Owen Bradshaw' },

  { slug: 'cloudepa',         name: 'CloudEPA',             kind: 'VENDOR',  seat: 'Bench sales', who: 'Bhavesh Nair' },
  { slug: 'consultis',        name: 'Consultis',            kind: 'VENDOR',  seat: 'Bench sales', who: 'Teresa Lindqvist' },
  { slug: 'nimbus',           name: 'Nimbus Talent',        kind: 'VENDOR',  seat: 'Bench sales', who: 'Kofi Asante' },
  { slug: 'sahasra',          name: 'Sahasra Infotech',     kind: 'VENDOR',  seat: 'Bench sales', who: 'Anjali Deshmukh' },
  { slug: 'orchid',           name: 'Orchid Systems',       kind: 'VENDOR',  seat: 'Bench sales', who: 'Yusuf Demir' },
  // The one firm here that is not here. Pinnacle buys an HCM integration
  // lead from Bluecrest and pays it; Bluecrest never joined, so the
  // chain below Pinnacle stops, accounts payable says the float is
  // carried somewhere it cannot see, and the register shows what a firm
  // looks like before it takes possession of itself. Every other seeded
  // firm has somebody seated at it and is claimed by the sweep at the
  // end of this file; this one is deliberately outside it.
  { slug: 'bluecrest',        name: 'Bluecrest Staffing',   kind: 'VENDOR',  seat: 'Bench sales', who: 'Hollis Grant', seatless: true },

  // The one firm in this world with no agreement behind it. Cavanaugh
  // Glassworks sent it a purchase order and one contractor started; nobody
  // papered an MSA first, and nothing in the product asks them to. What
  // it has on its books is the `direct` block in lib/seed-programmes.
  { slug: 'wrenfield',        name: 'Wrenfield Technical',  kind: 'VENDOR',  seat: 'Account manager', who: 'Dale Kirkbride' },
]

// ── The placements ───────────────────────────────────────────────────
//
// `via` is the chain from the client down to whoever employs the person.
// An MSP that routes work and takes no rate is named in `routedBy` and
// holds no contract — which is what an agent MSP actually is.
//
// Rates descend: the client pays the first, each hop keeps the gap.
interface Placement {
  role: string; skills: string[]; loc: string
  routedBy?: string; via: string[]; rates: number[]
}
const PLACEMENTS: Placement[] = [
  { role: 'ERP finance consultant',     skills: ['ERP finance', 'General ledger'], loc: 'San Jose, CA',
    routedBy: 'aptiva',  via: ['harlow-health', 'computer-systems', 'cloudepa'], rates: [13800, 11200, 8600] },
  { role: 'Epic Ambulatory analyst',    skills: ['Epic', 'Ambulatory'],        loc: 'Madison, WI',
    via: ['harlow-health', 'computer-systems'],                                  rates: [11500, 8400] },
  { role: 'Java microservices engineer',skills: ['Java', 'Spring Boot', 'AWS'],loc: 'Charlotte, NC',
    via: ['meridian-bank', 'vertex-global', 'sahasra'],                          rates: [12600, 10200, 7900] },
  { role: 'Avionics test engineer',     skills: ['DO-178C', 'Embedded C'],     loc: 'Wichita, KS',
    via: ['corveldt', 'teleworld', 'nimbus'],                                    rates: [14200, 11600, 9100] },
  { role: 'Retail systems consultant',  skills: ['Retail merchandising', 'PL/SQL'], loc: 'Columbus, OH',
    routedBy: 'kestrel', via: ['nordway', 'brightmoor', 'consultis'],            rates: [12900, 10400, 8100] },
  { role: 'Murex support analyst',      skills: ['Murex', 'FX'],               loc: 'Jersey City, NJ',
    via: ['meridian-bank', 'halcyon'],                                           rates: [13400, 9800] },
  { role: 'PLM systems engineer',       skills: ['Teamcenter', 'PLM'],         loc: 'Everett, WA',
    via: ['corveldt', 'sundara', 'orchid'],                                      rates: [13100, 10700, 8300] },
  { role: 'HCM integration lead',       skills: ['HCM integration', 'Payroll interfaces'], loc: 'Minneapolis, MN',
    via: ['nordway', 'pinnacle', 'bluecrest'],                                   rates: [14500, 11800, 9200] },
]

const NAMES: string[] = [
  'Priya Raman', 'Daniel Osei', 'Anjali Mehta', 'Marcus Whitfield',
  'Ravi Subramanian', 'Elena Castillo', 'Thomas Okonkwo', 'Sneha Kulkarni',
  'Grace Lindqvist', 'Arjun Nair', 'Yusuf Demir', 'Claire Beaumont',
  'Vikram Joshi', 'Naomi Adeyemi', 'Peter Halloran', 'Divya Rangan',
]

export async function seedWorld(): Promise<{
  firms: number; placements: number; consultants: number
  /// The integrators' own employees — a live EMPLOYEE seat, no bench listing.
  onPayroll: number
  /// One seat per job at a supplier and at a program office, so every
  /// desk a staffing firm actually runs on can be opened from /demo.
  supplierDesks: number
  /// Chains still mid-flight — open requirements with rounds not yet held.
  live: number
  /// Days off on every firm's calendar, so a due date can be shifted.
  holidays: number
  /// The layers above and below the placement.
  orders: number
  postings: number
  journalEntries: number
  /// Firms that hold a seat and were still on the register as shells.
  claimed: number
  /// Orders carrying a required set of documents, and the rows on them.
  documentRequirementOrders: number
  documentRequirements: number
  petitions: number
  backings: number
  resumes: number
  threads: number
  roster: { kind: string; name: string; slug: string }[]
  }> {
  // ── The day this world counts from ──────────────────────────────────
  //
  // A seeded world is written as "n days from today", which is right the
  // first time and wrong every time after: re-seeded a week later, every
  // week of hours the seed looks for has moved, nothing is found, and
  // the whole world is written a second time beside the first. So the
  // world keeps the day it was born — the created date of the first
  // company this seed ever wrote — and a re-run on any later day
  // computes the same midnights and finds everything.
  //
  // Read before anything is written, because the first write would
  // otherwise be the answer.
  const born = await db.company.findFirst({
    where: { slug: { startsWith: PREFIX } },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  })
  anchorSeed(born?.createdAt)

  // Scoped to the call, not the module: a long-lived server would
  // otherwise carry one run's ids into the next.
  const firmBySlug = new Map<string, { id: string }>()
  const seatBySlug = new Map<string, { personId: string; email: string }>()

  async function firm(f: Firm) {
  const slug = PREFIX + f.slug
  const c = await db.company.upsert({
    where: { slug },
    update: { name: f.name, kind: f.kind },
    create: {
      slug, name: f.name, kind: f.kind, currency: 'USD',
      defaultPaymentTerms: f.kind === 'CLIENT' ? 45 : 30,
      // The day this world counts from, written down rather than left to
      // the database clock — this is the value the next run reads back
      // to find the world's birthday, so it has to be the same midnight
      // every other seeded date was measured from.
      createdAt: day(0),
      // Never a demo company: reaped after a fortnight, and deleted
      // outright by the reset button. This world outlives both.
      isDemo: false,
    },
  })
  // A firm nobody has joined gets no owner, no seat and no door. The
  // register knows it, the money knows it, and it stays a shell until
  // somebody at it takes possession through the claim path — which is
  // the only thing in the product that writes `claimedAt`, apart from
  // the sweep at the end of this file that reads a seat as possession.
  if (f.seatless) {
    firmBySlug.set(f.slug, c)
    return
  }

  const role =
    (await db.role.findFirst({ where: { companyId: c.id, name: 'Owner' } })) ??
    (await db.role.create({ data: { companyId: c.id, name: 'Owner', permissions: ['*'], isDefault: true } }))
  const email = `${slug}@${DOMAIN}`
  const p = await db.person.upsert({
    // A person, not a job title: 'Contingent workforce office' was turning up
    // as an approver's name in a requisition's summary.
    where: { primaryEmail: email }, update: { name: f.who }, create: { name: f.who, primaryEmail: email },
  })
  if (!(await db.context.findFirst({ where: { personId: p.id, companyId: c.id } }))) {
    await db.context.create({
      data: { personId: p.id, companyId: c.id, roleId: role.id, type: 'EMPLOYEE', grantReason: 'Seeded world' },
    })
  }
  firmBySlug.set(f.slug, c)
  seatBySlug.set(f.slug, { personId: p.id, email })

  // ── What a client needs before governance means anything ──────────
  //
  // Cost centers, a headcount plan, departments and a delegation of
  // authority. Without them the "which budget pays for it" list is
  // empty, every requisition clears itself, and the approval engine —
  // which is built and tested — can never be reached. The demo showed a
  // governance product with the governance switched off.
  if (f.kind === 'CLIENT') {
    const approverEmail = `${slug}-vp@${DOMAIN}`
    const approver = await db.person.upsert({
      where: { primaryEmail: approverEmail },
      update: { name: VP_NAMES[f.slug] ?? 'VP, ' + f.name.split(' ')[0] },
      // The VP by name, for the same reason.
      create: { name: VP_NAMES[f.slug] ?? 'VP, ' + f.name.split(' ')[0], primaryEmail: approverEmail },
    })
    // An approver, not an owner. The VP sat on the seat's own role, which
    // is everything — so the VP could edit the requisition they were
    // asked to approve. Approvers ask for changes; they do not rewrite.
    const approverSeed = rolesFor('CLIENT').find((r) => r.name === 'Approver')!
    const approverRole =
      (await db.role.findFirst({ where: { companyId: c.id, name: 'Approver' } })) ??
      (await db.role.create({ data: { companyId: c.id, name: 'Approver', permissions: approverSeed.permissions, isDefault: false } }))
    const vpSeat = await db.context.findFirst({ where: { personId: approver.id, companyId: c.id } })
    if (!vpSeat) {
      await db.context.create({
        data: {
          personId: approver.id, companyId: c.id, roleId: approverRole.id,
          type: 'EMPLOYEE', grantReason: 'Seeded world — approver',
        },
      })
    } else if (vpSeat.roleId !== approverRole.id) {
      // Re-seeding corrects a VP seated too high.
      await db.context.update({ where: { id: vpSeat.id }, data: { roleId: approverRole.id } })
    }

    // A real shape, not two flat departments. Indirect procurement and HR
    // sit across all of it; each team has its own money and its own lead;
    // and R&D has two groups under it, so a rule on the parent has
    // something to be responsible for.
    //
    //   Technology
    //     Apps · Security · Infrastructure · SaaS
    //     R&D
    //       R&D 1 · R&D 2
    const tree: { code: string; name: string; kind: string; parent?: string }[] = [
      { code: 'TECH', name: 'Technology', kind: 'BU' },
      { code: 'APPS', name: 'Apps', kind: 'DEPARTMENT', parent: 'Technology' },
      { code: 'SEC', name: 'Security', kind: 'DEPARTMENT', parent: 'Technology' },
      { code: 'INFRA', name: 'Infrastructure', kind: 'DEPARTMENT', parent: 'Technology' },
      { code: 'SAAS', name: 'SaaS', kind: 'DEPARTMENT', parent: 'Technology' },
      { code: 'RND', name: 'R&D', kind: 'DEPARTMENT', parent: 'Technology' },
      { code: 'RND1', name: 'R&D 1', kind: 'PROJECT', parent: 'R&D' },
      { code: 'RND2', name: 'R&D 2', kind: 'PROJECT', parent: 'R&D' },
    ]
    const unitByName = new Map<string, { id: string }>()
    for (const t of tree) {
      const existing = await db.orgUnit.findFirst({ where: { companyId: c.id, name: t.name } })
      const unit =
        existing ??
        (await db.orgUnit.create({
          data: {
            companyId: c.id, name: t.name, kind: t.kind,
            parentId: t.parent ? unitByName.get(t.parent)?.id ?? null : null,
          },
        }))
      unitByName.set(t.name, unit)
    }

    // Budgets on the teams that actually spend, not on the parent.
    for (const d of [
      { code: 'APPS', name: 'Apps' },
      { code: 'SEC', name: 'Security' },
      { code: 'RND1', name: 'R&D 1' },
    ]) {
      const unit = unitByName.get(d.name)!

      const code = `${d.code}-${f.slug.slice(0, 4).toUpperCase()}-4100`
      const cc =
        (await db.costCenter.findFirst({ where: { companyId: c.id, code } })) ??
        (await db.costCenter.create({
          data: {
            companyId: c.id, code, name: `${d.name} — contingent`, orgUnitId: unit.id,
            // Somebody answerable for it. A budget with nobody's name on
            // it sends every requisition charged to it for approval.
            ownerId: p.id,
          },
        }))
      if (!(await db.headcountPlan.findFirst({ where: { costCenterId: cc.id, period: '2026' } }))) {
        await db.headcountPlan.create({
          data: {
            costCenterId: cc.id, period: '2026',
            approvedHeads: d.code === 'APPS' ? 6 : 3,
            annualBudget: d.code === 'APPS' ? 2_400_000 : 900_000,
            currency: 'USD',
          },
        })
      }
    }

    // Anything over $250k a year is the VP's. Most requisitions fall
    // under it and clear themselves, which is the point — governance
    // slower than the workaround produces the workaround.
    if (!(await db.approvalRule.findFirst({ where: { companyId: c.id, name: 'Over $250k' } }))) {
      await db.approvalRule.create({
        data: {
          companyId: c.id, name: 'Over $250k', thresholdAmount: 250_000,
          approverId: approver.id, rank: 1, isActive: true, authoredById: p.id,
        },
      })
    }

    // The lead: a rule with no threshold, which catches whatever a check
    // routes and matches nothing else. Without one, a requisition
    // flagged for being over plan has nobody to go to and clears itself
    // — an approval chain with a hole in it.
    // Scoped to Technology. A requisition raised in R&D 1 must reach this
    // person through R&D and Technology, without the rule being copied
    // onto either.
    if (!(await db.approvalRule.findFirst({ where: { companyId: c.id, name: 'Technology — over $80k' } }))) {
      await db.approvalRule.create({
        data: {
          companyId: c.id, name: 'Technology — over $80k', thresholdAmount: 80_000,
          approverId: approver.id, rank: 1, isActive: true, authoredById: p.id,
          orgUnitId: unitByName.get('Technology')!.id,
        },
      })
    }

    if (!(await db.approvalRule.findFirst({ where: { companyId: c.id, name: 'Program lead' } }))) {
      await db.approvalRule.create({
        data: {
          companyId: c.id, name: 'Program lead', thresholdAmount: null,
          approverId: approver.id, rank: 2, isActive: true, authoredById: p.id,
        },
      })
    }
  }

  return c
  }

  async function trade(a: string, b: string, relationship: string) {
  const A = firmBySlug.get(a)!.id, B = firmBySlug.get(b)!.id
  if (!(await db.counterparty.findFirst({ where: { companyId: A, otherCompanyId: B, relationship } }))) {
    await db.counterparty.create({ data: { companyId: A, otherCompanyId: B, relationship } })
  }
  }

  async function agreement(vendorSlug: string, clientSlug: string, title: string) {
  const vendorId = firmBySlug.get(vendorSlug)!.id, clientId = firmBySlug.get(clientSlug)!.id
  const msa =
    (await db.masterAgreement.findFirst({ where: { vendorId, clientId } })) ??
    (await db.masterAgreement.create({
      data: { vendorId, clientId, paymentTerms: 45, currency: 'USD', signedAt: day(-400) },
    }))
  const eng =
    (await db.engagement.findFirst({ where: { msaId: msa.id, title } })) ??
    (await db.engagement.create({ data: { msaId: msa.id, title, invoiceCycle: 'MONTHLY' } }))
  return { msa, eng }
  }

  /** One placement's whole life: paper, clearances, hours, money. */
  async function place(spec: Placement, personName: string, index: number) {
  const [clientSlug, ...suppliers] = spec.via
  const employerSlug = suppliers[suppliers.length - 1]
  const client = firmBySlug.get(clientSlug)!

  // The person, and the bench they sit on.
  const email = `${personName.toLowerCase().replace(/[^a-z]+/g, '.')}@seed.etyme.invalid`
  const person = await db.person.upsert({
    where: { primaryEmail: email }, update: {}, create: { name: personName, primaryEmail: email },
  })
  const profile =
    (await db.consultantProfile.findFirst({ where: { personId: person.id } })) ??
    (await db.consultantProfile.create({
      data: {
        personId: person.id, skills: spec.skills, location: spec.loc,
        visibility: 'VERIFIED', workAuth: index % 3 === 0 ? 'GC' : index % 3 === 1 ? 'H1B' : 'USC',
      },
    }))
  const employer = firmBySlug.get(employerSlug)!
  // The same rule as the bench rotation below: a firm nobody has joined
  // holds nobody's consent. This person is employed by it — there is a
  // buy contract saying so — and being employed is not being marketed.
  const employerIsHere = seatBySlug.has(employerSlug)
  if (employerIsHere && !(await db.benchListing.findFirst({ where: { consultantId: profile.id, companyId: employer.id } }))) {
    await db.benchListing.create({
      data: {
        consultantId: profile.id, companyId: employer.id, tier: 'RETAINED', state: 'GRANTED',
        invitedAt: day(-120), respondedAt: day(-118), grantedAt: day(-118),
      },
    })
  }

  // The requirement, owned by the client and carried down the chain.
  const requirement =
    (await db.requirement.findFirst({ where: { companyId: client.id, title: spec.role } })) ??
    (await db.requirement.create({
      data: {
        companyId: client.id, title: spec.role, skills: spec.skills, location: spec.loc,
        billMin: spec.rates[0] - 1500, billMax: spec.rates[0] + 500, months: 12, headcount: 1,
        status: 'FILLED', approvalState: 'AUTO_APPROVED', source: 'MANUAL', neededBy: day(-95),
      },
    }))

  // A contract pair per supplier, each buying from the one below it.
  let supplierSellContractId = null
  const contracts: any[] = []
  for (let i = suppliers.length - 1; i >= 0; i--) {
    const sellerSlug = suppliers[i]
    const buyerSlug = i === 0 ? clientSlug : suppliers[i - 1]
    const seller = firmBySlug.get(sellerSlug)!, buyer = firmBySlug.get(buyerSlug)!
    const sellRate = spec.rates[i + 1] !== undefined && i > 0 ? spec.rates[i] : spec.rates[i]
    const payRate = spec.rates[i + 1]

    const existing = await db.sellContract.findFirst({
      where: { companyId: seller.id, personId: person.id, clientCompanyId: buyer.id },
    })
    if (existing) { supplierSellContractId = existing.id; contracts.push(existing); continue }

    const { msa, eng } = await agreement(sellerSlug, buyerSlug, spec.role)
    const sell = await db.sellContract.create({
      data: {
        companyId: seller.id, clientCompanyId: buyer.id, endClientCompanyId: client.id,
        personId: person.id, requirementId: requirement.id, engagementId: eng.id, msaId: msa.id,
        billRate: sellRate, billCurrency: 'USD', paymentTerms: 45, state: 'IN_PROGRESS',
        startDate: day(-90), endDate: day(275),
      },
    })
    const employsThem = i === suppliers.length - 1
    const buy = await db.buyContract.create({
      data: {
        companyId: seller.id,
        vendorCompanyId: employsThem ? null : firmBySlug.get(suppliers[i + 1])!.id,
        payCurrency: 'USD', contractType: employsThem ? 'W2' : 'C2C',
        state: 'IN_PROGRESS', startDate: day(-90), endDate: day(275),
        // The rung below — what makes the hours reachable from up here.
        supplierSellContractId: employsThem ? null : supplierSellContractId,
      },
    })
    await db.buyContractCandidate.create({
      data: {
        buyContractId: buy.id, personId: person.id, payRate, payCurrency: 'USD',
        startDate: day(-90), endDate: day(275),
      },
    })
    await db.contractLink.create({
      data: { sellContractId: sell.id, buyContractId: buy.id, effectiveFrom: day(-90), effectiveTo: day(275) },
    })
    // Its due dates, on the side each belongs to. The routes did this
    // and the seed did not, so every seeded placement's timeline read
    // "no cycles have been generated". US_IT: world firms carry no pack.
    await writeCyclesFor(db, { sell, buy, packId: 'US_IT', holidays: holidayKeys() })
    supplierSellContractId = sell.id
    contracts.push(sell)
  }

  // How they reached the client, and who met them.
  const topSeller = firmBySlug.get(suppliers[0])!
  const sub =
    (await db.submission.findFirst({ where: { requirementId: requirement.id, personId: person.id } })) ??
    (await db.submission.create({
      data: {
        requirementId: requirement.id, personId: person.id,
        fromCompanyId: topSeller.id, toCompanyId: client.id, kind: 'BENCH',
        rate: spec.rates[0], status: 'PLACED', checkState: 'SENT',
        submittedAt: day(-110), forwardedAt: day(-108), decidedAt: day(-96),
      },
    }))
  for (const r of [
    { round: 1, stage: 'SCREEN', mode: 'PHONE', at: -106, hour: 15, says: 'Passed.' },
    { round: 2, stage: 'TECHNICAL', mode: 'VIDEO', at: -101, hour: 17, says: 'Strong. Offer.' },
  ]) {
    if (await db.interview.findFirst({ where: { submissionId: sub.id, round: r.round } })) continue
    await db.interview.create({
      data: {
        submissionId: sub.id, companyId: client.id, vendorId: topSeller.id,
        round: r.round, stage: r.stage, mode: r.mode, state: 'DONE',
        proposedSlots: [], durationMins: 45,
        scheduledAt: at(r.at, r.hour), decidedAt: at(r.at, r.hour + 1),
        clientConfirmedAt: day(r.at - 2), vendorConfirmedAt: day(r.at - 2),
        requestedById: seatBySlug.get(clientSlug)!.personId,
        decidedById: seatBySlug.get(clientSlug)!.personId,
        feedback: r.says,
      },
    })
  }

  // Cleared to work.
  // Whoever at the employing firm files its paperwork — or, where that
  // firm never joined, the firm above it, which is who actually holds
  // the certificate it was handed. A seatless firm files nothing itself
  // because there is nobody at it to file anything.
  const employerSeat =
    seatBySlug.get(employerSlug)?.personId ??
    seatBySlug.get(suppliers[suppliers.length - 2] ?? clientSlug)!.personId
  // Two on the person — the one that blocks and the one that warns — and
  // the supplier's cover, which is what lets it place anybody at all.
  const clearances: {
    personId?: string; companyId?: string
    type: 'I9_EVERIFY' | 'BACKGROUND_CHECK' | 'INSURANCE_GL' | 'INSURANCE_WC'
    provider: string; expiresAt: Date | null
    /**
     * The day cover begins.
     *
     * Only the two company rows carry it, and they carry it because the
     * one door that puts a certificate on a compliance record —
     * `lib/onboarding-evidence`, reached from the supplier walk —
     * refuses to write a row without the two dates printed on the
     * certificate, and writes both on every row it does write. A seeded
     * row with no start is a verdict no desk could have reached through
     * the door it would really use.
     *
     * A person's I-9 and background check are left alone: no route in
     * the product writes either yet, so there is no door to be honest
     * about, and inventing a start date for a form would be inventing a
     * fact rather than recording one.
     */
    validFrom?: Date
    orderedByCompanyId?: string; orderedAt?: Date
  }[] = [
    { personId: person.id, type: 'I9_EVERIFY', provider: 'E-Verify', expiresAt: null },
    // The employer bought the report. Recorded, because `mayRelyOn` says
    // a background check is point in time and that passing on somebody
    // else's report is a regulated act of its own — and a row that
    // cannot say whose report it is cannot answer that at all.
    { personId: person.id, type: 'BACKGROUND_CHECK', provider: 'Sterling', expiresAt: day(250),
      orderedByCompanyId: employer.id, orderedAt: day(-96) },
    { companyId: employer.id, type: 'INSURANCE_GL', provider: 'Hartford', expiresAt: day(200), validFrom: day(-165) },
    { companyId: employer.id, type: 'INSURANCE_WC', provider: 'Hartford', expiresAt: day(200), validFrom: day(-165) },
  ]
  for (const v of clearances) {
    const where = v.personId ? { personId: v.personId, type: v.type } : { companyId: v.companyId, type: v.type }
    if (await db.verification.findFirst({ where })) continue
    await db.verification.create({
      data: {
        ...v, status: 'CLEAR', issuedAt: day(-92),
        uploadedById: employerSeat, verifiedById: seatBySlug.get(clientSlug)!.personId, verifiedAt: day(-91),
        result: { outcome: 'CLEAR' },
      },
    })
  }

  // Hours, filed once against the contract of the firm that employs them,
  // and signed by the client above and the employer below.
  const bottom = contracts[0]
  const sheets: any[] = []
  for (let w = 4; w >= 1; w--) {
    const start = day(-(w * 7 + 4)), end = day(-(w * 7))
    const days: Record<string, number> = {}
    for (let d = 0; d < 5; d++) days[day(-(w * 7 + 4) + d).toISOString().slice(0, 10)] = 8
    const already = await db.timesheet.findFirst({ where: { sellContractId: bottom.id, periodStart: start } })
    if (already) { sheets.push(already); continue }
    const ts = await db.timesheet.create({
      data: {
        sellContractId: bottom.id, personId: person.id, periodStart: start, periodEnd: end,
        days, totalHours: 40, status: 'APPROVED', submittedAt: end, approvedAt: day(-(w * 7 - 2)),
      },
    })
    await db.workAssertion.createMany({
      data: [
        { timesheetId: ts.id, companyId: client.id, role: 'CLIENT_APPROVAL',
          hours: 40, rateCents: spec.rates[0], state: 'LIVE', byId: seatBySlug.get(clientSlug)!.personId },
        { timesheetId: ts.id, companyId: employer.id, role: 'EMPLOYER_ACCEPTANCE',
          hours: 40, rateCents: spec.rates[spec.rates.length - 1], state: 'LIVE', byId: employerSeat },
      ],
    })
    sheets.push(ts)
  }

  // Each hop bills its own leg for the same weeks — one week of work,
  // one invoice line per contract, which is what the chain actually does.
  //
  // One bill per billing period, the way `POST /api/invoices/generate`
  // raises them. The period used to be the span of whichever weeks were
  // unbilled — first sheet's start to last sheet's end — which is a
  // period belonging to no contract and matching no order, and on three
  // consecutive weeks it crosses a month boundary roughly a third of
  // the time. Which third depends on the day the world was seeded,
  // which is the worst way for a seeded figure to be wrong.
  for (const sell of contracts) {
    const billTerms = periodTermsFor('SELL', sell)
    const billed = termsFor('SELL', sell)

    const byPeriod = new Map<string, { period: Period; weeks: any[] }>()
    for (const t of sheets.slice(0, 3)) {
      const period = periodFor(t.periodStart, billTerms)
      const bucket = byPeriod.get(iso(period.start)) ?? { period, weeks: [] }
      bucket.weeks.push(t)
      byPeriod.set(iso(period.start), bucket)
    }

    for (const { period, weeks } of [...byPeriod.values()].sort(
      (a, b) => a.period.start.getTime() - b.period.start.getTime()
    )) {
      // Asked before the header is written, so a run that finds every
      // week already billed writes no invoice at all rather than an
      // empty one carrying a total.
      const unbilled: any[] = []
      for (const t of weeks) {
        if (await db.invoiceLine.findFirst({ where: { timesheetId: t.id, sellContractId: sell.id } })) continue
        unbilled.push(t)
      }
      if (unbilled.length === 0) continue

      const cents = weeks.length * 40 * sell.billRate
      // Per contract AND per period. Keyed on the contract alone, a
      // later run covering a new week collided with the first run's
      // invoice on Invoice.number, which is unique.
      const number = `IN-${sell.id.slice(-6).toUpperCase()}-${iso(period.start).replace(/-/g, '')}`
      const issuedAt = earlierOf(plusDays(period.end, 2), day(-1))
      // The one due date, counted the way the contract says to count it,
      // rather than a hand-written day(20) that agreed with nothing.
      const due = dueOn({
        anchor: billed.paymentTermsFrom ?? 'PERIOD_END',
        days: billed.paymentTermsDays ?? 30,
        periodEnd: period.end,
        issuedAt,
        receivedAt: null,
        approvedAt: null,
      })

      const inv =
        (await db.invoice.findUnique({ where: { number } })) ??
        (await db.invoice.create({
          data: {
            engagementId: sell.engagementId, number,
            periodStart: period.start, periodEnd: period.end,
            currency: 'USD', total: cents / 100, paid: cents / 100,
            dueAt: due.dueAt, issuedAt, status: 'PAID',
          },
        }))
      for (const t of unbilled) {
        await db.invoiceLine.create({
          data: {
            invoiceId: inv.id, timesheetId: t.id, sellContractId: sell.id, personId: person.id,
            hours: 40, rateCents: sell.billRate, amountCents: 40 * sell.billRate,
          },
        })
      }
      if (!(await db.payment.findFirst({ where: { invoiceId: inv.id } }))) {
        await db.payment.create({
          data: {
            invoiceId: inv.id, payerCompanyId: sell.clientCompanyId, receivedByCompanyId: sell.companyId,
            amount: cents / 100, currency: 'USD', method: 'ACH',
            receivedAt: earlierOf(plusDays(issuedAt, 20), day(-1)),
            appliedAt: earlierOf(plusDays(issuedAt, 20), day(-1)),
          },
        })
      }
    }
  }

  return { person, requirement }
  }

  // ── Build it ─────────────────────────────────────────────────────────

  for (const f of FIRMS) await firm(f)

  // The days nobody works, before anybody is placed.
  //
  // Cycle dates are generated once, when a contract is written, and
  // nothing regenerates them — which is right, because a date already
  // issued is a date somebody is working to. So the calendar has to exist
  // before the first contract or no due date in this world will ever have
  // been shifted off a holiday. A world seeded before this existed keeps
  // its dates; to move them, drop the world and seed it again.
  const calendar = await seedCalendar(firmBySlug)

  // Who trades with whom. An MSP routes and holds no contract, so it is a
  // counterparty of the client and of the primes, and of nobody's money.
  for (const p of PLACEMENTS) {
    const [client, ...suppliers] = p.via
    for (let i = 0; i < suppliers.length; i++) {
      const above = i === 0 ? client : suppliers[i - 1]
      await trade(suppliers[i], above, i === 0 ? 'CLIENT' : 'PRIME')
      await trade(above, suppliers[i], 'SUPPLIER')
    }
    if (p.routedBy) {
      await trade(client, p.routedBy, 'MSP')
      await trade(p.routedBy, client, 'CLIENT')
      await trade(p.routedBy, suppliers[0], 'SUPPLIER')
      await trade(suppliers[0], p.routedBy, 'MSP')
    }
  }

  const placed = []
  for (const [i, p] of PLACEMENTS.entries()) placed.push(await place(p, NAMES[i], i))

  // Bench nobody has placed yet, so a bench vendor's list is not just the
  // one person who is already out.
  // Bluecrest is not on this list and must not be: a bench listing is a
  // consultant's consent granted to a firm, and a firm nobody has joined
  // has nobody to grant it to. Halcyon takes the sixth slot so the
  // rotation is the same length and everybody else lands where they did.
  const benchVendors = ['cloudepa', 'consultis', 'nimbus', 'sahasra', 'orchid', 'halcyon']
  for (const [i, name] of NAMES.slice(PLACEMENTS.length).entries()) {
    const co = firmBySlug.get(benchVendors[i % benchVendors.length])!
    const email = `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@seed.etyme.invalid`
    const person = await db.person.upsert({
      where: { primaryEmail: email }, update: {}, create: { name, primaryEmail: email },
    })
    const profile =
      (await db.consultantProfile.findFirst({ where: { personId: person.id } })) ??
      (await db.consultantProfile.create({
        data: {
          personId: person.id,
          skills: PLACEMENTS[i % PLACEMENTS.length].skills,
          location: PLACEMENTS[i % PLACEMENTS.length].loc,
          visibility: 'VERIFIED', workAuth: i % 2 ? 'H1B' : 'GC',
        },
      }))
    if (!(await db.benchListing.findFirst({ where: { consultantId: profile.id, companyId: co.id } }))) {
      await db.benchListing.create({
        data: {
          consultantId: profile.id, companyId: co.id, tier: 'MARKETING', state: 'GRANTED',
          invitedAt: day(-60), respondedAt: day(-59), grantedAt: day(-59),
        },
      })
    }
  }


  // ── Work still in flight ─────────────────────────────────────────────
  //
  // Every placement above is finished: requirement FILLED, submission
  // PLACED, both rounds DONE. A world where nothing is pending reads as
  // an archive — the interviews queue showed five completed rounds and no
  // reason to open it, and the line that prints a round's time and zone
  // was never reached, because no round had a time still ahead of it.
  //
  // So three chains stopped mid-way, each at a different station: a
  // screen confirmed for later this week, a technical round the client
  // has offered slots for and nobody has picked one, and a round two
  // confirmed after a round one that passed.
  //
  // Each runs bench vendor → prime → client, which needs two requirements
  // and two submissions: Submission is unique on (requirementId,
  // personId), so the same person cannot be submitted twice against one
  // requirement. The prime posts its own, carrying endClientCompanyId, and
  // that is the mirror the bench vendor answers.
  interface Round {
    round: number
    stage: string
    mode: string
    /// PROPOSED · CONFIRMED · DONE
    state: string
    /// Days from now. Negative is a round that already happened.
    inDays: number
    /// Whole hour UTC. Deliberately not local — stored absolute, read in
    /// whatever zone the reader set.
    atHourUtc: number
    interviewers: string[]
    outcome?: string
    feedback?: string
  }
  interface Live {
    role: string
    skills: string[]
    loc: string
    /// client ← prime ← bench vendor.
    client: string
    prime: string
    bench: string
    name: string
    /// What the client will pay, what the prime quotes it, what the bench
    /// vendor quotes the prime. In cents, as everywhere else.
    band: [number, number]
    primeRate: number
    benchRate: number
    rounds: Round[]
  }
  const LIVE: Live[] = [
    {
      role: 'Epic Beaker analyst', skills: ['Epic', 'Beaker', 'LIS'], loc: 'Madison, WI',
      client: 'harlow-health', prime: 'computer-systems', bench: 'cloudepa',
      name: 'Ifeoma Balogun', band: [11000, 13000], primeRate: 12400, benchRate: 9900,
      rounds: [
        {
          round: 1, stage: 'SCREEN', mode: 'PHONE', state: 'CONFIRMED',
          inDays: 3, atHourUtc: 15,
          interviewers: ['Anne Whitfield, Lab Systems', 'Ravi Menon, Clinical Apps'],
        },
      ],
    },
    {
      role: 'Python market risk developer', skills: ['Python', 'Pandas', 'Market risk'],
      loc: 'Charlotte, NC',
      client: 'meridian-bank', prime: 'vertex-global', bench: 'sahasra',
      name: 'Tobias Lindgren', band: [12000, 14000], primeRate: 13200, benchRate: 10400,
      rounds: [
        {
          round: 1, stage: 'SCREEN', mode: 'PHONE', state: 'DONE', inDays: -6, atHourUtc: 14,
          interviewers: ['Sarah Kwan, Risk Technology'],
          outcome: 'ADVANCE', feedback: 'Knows the book. Send to the desk.',
        },
        {
          round: 2, stage: 'TECHNICAL', mode: 'VIDEO', state: 'PROPOSED', inDays: 6, atHourUtc: 18,
          interviewers: ['Miguel Ortiz, Quant Dev', 'Sarah Kwan, Risk Technology'],
        },
      ],
    },
    {
      role: 'DO-178C verification engineer', skills: ['DO-178C', 'Embedded C', 'LDRA'],
      loc: 'Wichita, KS',
      client: 'corveldt', prime: 'teleworld', bench: 'nimbus',
      name: 'Meera Balakrishnan', band: [13000, 15000], primeRate: 14100, benchRate: 11300,
      rounds: [
        {
          round: 1, stage: 'SCREEN', mode: 'VIDEO', state: 'DONE', inDays: -4, atHourUtc: 16,
          interviewers: ['Karl Vogt, Software Assurance'],
          outcome: 'ADVANCE', feedback: 'Certification experience is real. Bring them in.',
        },
        {
          round: 2, stage: 'TECHNICAL', mode: 'ONSITE', state: 'CONFIRMED',
          inDays: 2, atHourUtc: 16,
          interviewers: [
            'Karl Vogt, Software Assurance',
            'Dana Reyes, Avionics Integration',
            'Priyanka Sethi, DER',
          ],
        },
      ],
    },
  ]

  for (const l of LIVE) {
    const client = firmBySlug.get(l.client)!
    const prime = firmBySlug.get(l.prime)!
    const bench = firmBySlug.get(l.bench)!

    const email = `${l.name.toLowerCase().replace(/[^a-z]+/g, '.')}@seed.etyme.invalid`
    const person = await db.person.upsert({
      where: { primaryEmail: email }, update: {}, create: { name: l.name, primaryEmail: email },
    })
    const profile =
      (await db.consultantProfile.findFirst({ where: { personId: person.id } })) ??
      (await db.consultantProfile.create({
        data: {
          personId: person.id, skills: l.skills, location: l.loc,
          visibility: 'VERIFIED', workAuth: 'H1B',
        },
      }))
    // RETAINED, because the kind of a submission is computed from the
    // tier: their own bench reads BENCH, anybody else's reads NETWORK.
    if (!(await db.benchListing.findFirst({ where: { consultantId: profile.id, companyId: bench.id } }))) {
      await db.benchListing.create({
        data: {
          consultantId: profile.id, companyId: bench.id, tier: 'RETAINED', state: 'GRANTED',
          invitedAt: day(-45), respondedAt: day(-44), grantedAt: day(-44),
        },
      })
    }

    // The client's own requirement, still open.
    const req =
      (await db.requirement.findFirst({ where: { companyId: client.id, title: l.role } })) ??
      (await db.requirement.create({
        data: {
          companyId: client.id, title: l.role, skills: l.skills, location: l.loc,
          billMin: l.band[0], billMax: l.band[1], months: 12, headcount: 1,
          status: 'OPEN', approvalState: 'AUTO_APPROVED', source: 'MANUAL', neededBy: day(30),
        },
      }))

    // The prime's mirror. Its band is what it will pay a supplier, which
    // is not what the client pays it — the whole reason this is a second
    // row and not a flag on the first.
    const mirror =
      (await db.requirement.findFirst({ where: { companyId: prime.id, title: l.role } })) ??
      (await db.requirement.create({
        data: {
          companyId: prime.id, title: l.role, skills: l.skills, location: l.loc,
          billMin: l.benchRate - 800, billMax: l.benchRate + 400, months: 12, headcount: 1,
          status: 'OPEN', approvalState: 'AUTO_APPROVED', source: 'NETWORK', neededBy: day(30),
          endClientCompanyId: client.id,
        },
      }))

    const up =
      (await db.submission.findFirst({ where: { requirementId: mirror.id, personId: person.id } })) ??
      (await db.submission.create({
        data: {
          requirementId: mirror.id, personId: person.id,
          fromCompanyId: bench.id, toCompanyId: prime.id, kind: 'BENCH',
          rate: l.benchRate, status: 'SHORTLISTED', checkState: 'SENT', screenState: 'READY',
          submittedAt: day(-14), forwardedAt: day(-12), forwardedVia: 'ONWARD',
          forwardedById: seatBySlug.get(l.bench)!.personId,
        },
      }))

    // The hop onward, carrying the prime's rate and the prime's decision
    // date. A flag on the first row could carry neither.
    const sub =
      (await db.submission.findFirst({ where: { requirementId: req.id, personId: person.id } })) ??
      (await db.submission.create({
        data: {
          requirementId: req.id, personId: person.id,
          fromCompanyId: prime.id, toCompanyId: client.id, kind: 'NETWORK',
          rate: l.primeRate, status: 'SHORTLISTED', checkState: 'SENT', screenState: 'READY',
          submittedAt: day(-12), parentSubmissionId: up.id,
        },
      }))

    for (const r of l.rounds) {
      if (await db.interview.findFirst({ where: { submissionId: sub.id, round: r.round } })) continue
      const when = at(r.inDays, r.atHourUtc)
      const proposed = r.state === 'PROPOSED'
      await db.interview.create({
        data: {
          submissionId: sub.id, companyId: client.id, vendorId: prime.id,
          round: r.round, stage: r.stage, mode: r.mode, state: r.state,
          // A proposal is slots and no time; anything further along is a
          // time and no slots. Setting both would say the diary is booked
          // and still asking.
          proposedSlots: proposed
            ? [
                { start: when.toISOString(), end: at(r.inDays, r.atHourUtc + 1).toISOString() },
                // Three days apart, not one: a nudge off a weekend moves a
                // date by at most two, so a one-day gap can collapse to
                // the same slot offered twice.
                {
                  start: at(r.inDays + 3, r.atHourUtc).toISOString(),
                  end: at(r.inDays + 3, r.atHourUtc + 1).toISOString(),
                },
              ]
            : [],
          scheduledAt: proposed ? null : when,
          durationMins: r.stage === 'SCREEN' ? 30 : 60,
          location: r.mode === 'ONSITE' ? l.loc : 'https://meet.example.invalid/etyme-demo',
          requestedById: seatBySlug.get(l.client)!.personId,
          interviewers: r.interviewers,
          // A proposal nobody has answered in nine days reads as neglect
          // rather than a live queue; a confirmed round was arranged a
          // while back, which is ordinary.
          proposedAt: proposed ? day(-3) : day(-9),
          clientConfirmedAt: proposed ? null : day(-8),
          vendorConfirmedAt: proposed ? null : day(-8),
          consultantConfirmedAt: proposed ? null : day(-8),
          consultantConfirmedVia: proposed ? null : 'VENDOR_ASSERTED',
          outcome: r.outcome ?? null,
          feedback: r.feedback ?? null,
          decidedAt: r.state === 'DONE' ? when : null,
          decidedById: r.state === 'DONE' ? seatBySlug.get(l.client)!.personId : null,
        },
      })
    }
  }



  // ── The delivery firms' own payroll ──────────────────────────────────
  //
  // An integrator staffs a seat two ways: it buys a consultant from a
  // bench vendor, and it puts one of its own employees on it. The second
  // is the ordinary case at a firm like this and the world had none of
  // it — each GSI held exactly one EMPLOYEE seat, the delivery manager's
  // own login — so the submit picker's "On our payroll" group offered a
  // delivery manager himself and nobody else.
  //
  // These people carry a live EMPLOYEE seat and nothing else: no
  // `ConsultantProfile` and no `BenchListing`, because that absence is
  // precisely what tells staff from a marketed consultant. Nobody asks
  // an employee's permission to be staffed on a project — the
  // employment contract already said it — so the submit door skips the
  // listing for them, computes the kind as INTERNAL and tells them where
  // they went (`app/api/submissions/kind.ts`).
  //
  // The discipline rides on the seat's role name, because the picker
  // falls back to the role where a person has no skills, and seeding a
  // consultant profile to carry four words would seed the very thing the
  // carve-out exists to do without. `ensureDefaultRoles` never touches a
  // role a company wrote itself, so these survive every later run.
  interface Staffer {
    name: string
    /** What they do, in the trade's words. The name of their seat's role. */
    discipline: string
    /** The practice they sit in, read on the seat as the reason it was granted. */
    practice: string
  }
  const PAYROLL: { slug: string; team: Staffer[] }[] = [
    { slug: 'teleworld', team: [
      { name: 'Karthik Menon',   discipline: 'Validation Engineer',   practice: 'Delivery — avionics software assurance practice' },
      { name: 'Amara Nwosu',     discipline: 'Data Engineer',         practice: 'Delivery — data platform practice' },
      { name: 'Felix Brenner',   discipline: 'ERP Finance Consultant', practice: 'Delivery — ERP finance practice' },
      { name: 'Deepa Varma',     discipline: 'Integration Architect', practice: 'Delivery — integration practice' },
    ]},
    { slug: 'sundara', team: [
      { name: 'Aditi Ramaswamy', discipline: 'Validation Engineer',   practice: 'Delivery — safety-critical software practice' },
      { name: 'Olivier Renard',  discipline: 'Data Engineer',         practice: 'Delivery — manufacturing data practice' },
      { name: 'Harish Pillai',   discipline: 'ERP Finance Consultant', practice: 'Delivery — plant maintenance practice' },
      { name: 'Beatriz Salgado', discipline: 'PLM Systems Engineer',  practice: 'Delivery — Teamcenter practice' },
    ]},
  ]

  let onPayroll = 0
  for (const { slug, team } of PAYROLL) {
    const co = firmBySlug.get(slug)!
    for (const s of team) {
      const email = `${s.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z]+/g, '.')}@seed.etyme.invalid`
      const person = await db.person.upsert({
        where: { primaryEmail: email }, update: { name: s.name }, create: { name: s.name, primaryEmail: email },
      })
      const role =
        (await db.role.findFirst({ where: { companyId: co.id, name: s.discipline } })) ??
        (await db.role.create({
          data: {
            companyId: co.id, name: s.discipline, isDefault: false,
            // A delivery engineer reads the work they are on and files
            // their own week. Nothing else — they staff nobody, sell
            // nobody, and see no money.
            permissions: ['assignments.read', 'timesheets.read'],
          },
        }))
      if (!(await db.context.findFirst({ where: { personId: person.id, companyId: co.id } }))) {
        await db.context.create({
          data: {
            personId: person.id, companyId: co.id, roleId: role.id, type: 'EMPLOYEE',
            grantReason: s.practice,
          },
        })
      }
      onPayroll++
    }

    // Cover on file, which is what lets a firm put anybody in front of a
    // client at all. Neither integrator had any: `place` writes a
    // certificate for whoever employs the consultant, and on every chain
    // in this world these two sit in the middle. So the submit door
    // refused them on COVER_LAPSED one screen before the payroll
    // carve-out was ever reached.
    for (const type of ['INSURANCE_GL', 'INSURANCE_WC'] as const) {
      if (await db.verification.findFirst({ where: { companyId: co.id, type } })) continue
      await db.verification.create({
        data: {
          companyId: co.id, type, status: 'CLEAR', provider: 'Hartford',
          issuedAt: day(-300), validFrom: day(-300), expiresAt: day(200),
          uploadedById: seatBySlug.get(slug)!.personId,
          verifiedById: seatBySlug.get(slug)!.personId, verifiedAt: day(-299),
          result: { outcome: 'CLEAR' },
        },
      })
    }
  }

  // And a seat one of them can actually answer with somebody off that
  // payroll. Corveldt's DO-178C verification engineer is open and
  // Corveldt chose which suppliers see it, so without an invitation the
  // submit door refuses both integrators with NOT_INVITED and the picker
  // leads nowhere. Both already supply Corveldt — Teleworld on avionics,
  // Sundara on PLM — and Karthik Menon and Aditi Ramaswamy are the two
  // people on this list who could do the work.
  const corveldt = firmBySlug.get('corveldt')!
  const avionics = await db.requirement.findFirst({
    where: { companyId: corveldt.id, title: 'DO-178C verification engineer' },
    select: { id: true },
  })
  if (avionics) {
    for (const slug of ['teleworld', 'sundara']) {
      const to = firmBySlug.get(slug)!
      if (await db.requirementInvitation.findFirst({ where: { requirementId: avionics.id, toCompanyId: to.id } })) continue
      await db.requirementInvitation.create({
        data: {
          requirementId: avionics.id, fromCompanyId: corveldt.id, toCompanyId: to.id,
          // Under the client's own ceiling, and not the same for both.
          payMin: 13_000, payMax: slug === 'teleworld' ? 14_500 : 14_000,
          expiresAt: day(12), status: 'SENT', createdAt: day(-9),
        },
      })
    }
  }

  // ── The three client programs ──────────────────────────────────────
  //
  // Everything above is one placement seen from each firm in its chain.
  // This is the other product: a client with a dozen suppliers, a
  // history, and a desk for each job — the office that runs it, the
  // manager who needs somebody, the VP who signs, the clerk who pays,
  // the officer who answers for tenure and paperwork.
  const programs = await seedProgrammes({ firmBySlug, seatBySlug, domain: DOMAIN, prefix: PREFIX })

  // ── A program office in a seat, at one of the three programs ───────
  //
  // Cavanaugh Glassworks has no contingent workforce office of its own —
  // a mid-size manufacturer rarely does — so it hands the running of its
  // program to Aptiva Workforce and gives Aptiva a desk in it. That is
  // the whole point of the seat: Aptiva places nobody at Cavanaugh and
  // never will, so no contract will ever tie the two firms together, and
  // without the client saying so in a row the platform has no way to let
  // Aptiva in (`lib/program-seat`).
  //
  // The desk it sits at is Cavanaugh's OWN Program Manager role, not
  // Aptiva's. So what Aptiva may do here is exactly what Cavanaugh's
  // program manager may do, and it narrows the day Cavanaugh narrows it.
  //
  // Granted by Cavanaugh's account owner, because a seat is an owner's or
  // the program manager's to give and nobody else's.
  const cavanaugh = firmBySlug.get('corning')
  const aptiva = firmBySlug.get('aptiva')
  const cavanaughOwner = seatBySlug.get('corning')
  if (cavanaugh && aptiva && cavanaughOwner) {
    const pmRole = await db.role.findFirst({
      where: { companyId: cavanaugh.id, name: 'Program Manager' },
      select: { id: true },
    })
    const already = await db.programSeat.findFirst({
      where: { clientCompanyId: cavanaugh.id, officeCompanyId: aptiva.id },
      select: { id: true },
    })
    if (pmRole && !already) {
      await db.programSeat.create({
        data: {
          clientCompanyId: cavanaugh.id,
          officeCompanyId: aptiva.id,
          roleId: pmRole.id,
          grantedById: cavanaughOwner.personId,
          grantedAt: day(-210),
          validFrom: day(-210),
          reason:
            'Aptiva runs our contingent program. We have no workforce office of our own and they ' +
            'place nobody here, so they sit at our program manager desk under our own rules.',
        },
      })
    }
  }

  // ── A supplier's own desks ─────────────────────────────────────────
  //
  // Every supplier in this world seated exactly one person, its owner,
  // so the eight roles a staffing firm actually runs on — Account
  // Manager, Recruiter, Resource Manager, HR, Contract Manager,
  // Accounts Receivable, AP & Payroll, Finance and Compliance Officer —
  // existed as roles and were held by nobody. None of them could be
  // opened from /demo at all (the browser walk, 2026-09-21), which is
  // how a role with a permission set nobody has ever sat behind stays
  // wrong without anybody noticing.
  //
  // Brightmoor Staffing gets the full set, because it has the richest
  // story in the world — it sells into two programs, buys from a bench
  // vendor below, and its liability cover runs out in twenty days. One
  // firm rather than six: the point is that each desk can be walked,
  // and six copies of the same eight people would be noise in every
  // list that counts people.
  //
  // Each holds the role's own permissions from `lib/company-defaults`,
  // so the AR desk cannot run payroll and the recruiter cannot see what
  // anybody costs — which is the whole reason for seating them.
  const SUPPLIER_TEAM: { desk: string; role: string; name: string }[] = [
    { desk: 'account',    role: 'Account Manager',     name: 'Marisa Delacroix' },
    { desk: 'recruiter',  role: 'Recruiter',           name: 'Tobias Ferrand' },
    { desk: 'resourcing', role: 'Resource Manager',    name: 'Nadia Oyelowo' },
    { desk: 'hr',         role: 'HR',                  name: 'Petra Kalnins' },
    { desk: 'contracts',  role: 'Contract Manager',    name: 'Geoffrey Alderton' },
    { desk: 'ar',         role: 'Accounts Receivable', name: 'Imelda Santoro' },
    { desk: 'payroll',    role: 'AP & Payroll',        name: 'Desmond Achebe' },
    { desk: 'finance',    role: 'Finance',             name: 'Rosalind Tay' },
    { desk: 'compliance', role: 'Compliance Officer',  name: 'Anneke Roosevelt' },
  ]
  let supplierDesks = 0
  const brightmoor = firmBySlug.get('brightmoor')
  if (brightmoor) {
    for (const [was, now] of Object.entries(RENAMED_ROLES)) {
      await db.role.updateMany({ where: { companyId: brightmoor.id, name: was }, data: { name: now } })
    }
    for (const seed of rolesFor('VENDOR')) {
      const existing = await db.role.findFirst({ where: { companyId: brightmoor.id, name: seed.name } })
      if (!existing) {
        await db.role.create({
          data: {
            companyId: brightmoor.id, name: seed.name,
            permissions: seed.permissions, isDefault: !!seed.isOwner,
          },
        })
      }
    }
    for (const d of SUPPLIER_TEAM) {
      const role = await db.role.findFirst({ where: { companyId: brightmoor.id, name: d.role }, select: { id: true } })
      if (!role) continue
      // The same address shape the client desks use: the firm's slug
      // with the desk after it. Nobody reads it — it is a sign-in
      // handle, and no screen prints one (lib/contacts).
      const email = `${PREFIX}brightmoor-${d.desk}@${DOMAIN}`
      const who = await db.person.upsert({
        where: { primaryEmail: email }, update: { name: d.name }, create: { name: d.name, primaryEmail: email },
      })
      if (!(await db.context.findFirst({ where: { personId: who.id, companyId: brightmoor.id } }))) {
        await db.context.create({
          data: {
            personId: who.id, companyId: brightmoor.id, roleId: role.id, type: 'EMPLOYEE',
            grantReason: `Seeded supplier desk — ${d.role}`,
          },
        })
      }
      supplierDesks++
    }
  }

  // ── A compliance desk a program office sits at ─────────────────────
  //
  // The second seat, and a different role from Aptiva's above on
  // purpose. Talvern Medical keeps its own program office and hands the
  // compliance of it — tenure across every supplier, work
  // authorization, whose insurance is current, and what is held about a
  // person — to Kestrel MSP, at Talvern's OWN Compliance Officer desk.
  //
  // It is the one seat where the privacy queue and the tenure ledger
  // are read by a firm that is not the client, which is exactly the
  // read a client would most want accounted for afterwards — and until
  // this existed there was nowhere on the demo to walk it.
  const talvern = firmBySlug.get('terumo-bct')
  const kestrel = firmBySlug.get('kestrel')
  const talvernOwner = seatBySlug.get('terumo-bct')
  if (talvern && kestrel && talvernOwner) {
    const coRole = await db.role.findFirst({
      where: { companyId: talvern.id, name: 'Compliance Officer' },
      select: { id: true },
    })
    const already = await db.programSeat.findFirst({
      where: { clientCompanyId: talvern.id, officeCompanyId: kestrel.id },
      select: { id: true },
    })
    if (coRole && !already) {
      await db.programSeat.create({
        data: {
          clientCompanyId: talvern.id,
          officeCompanyId: kestrel.id,
          roleId: coRole.id,
          grantedById: talvernOwner.personId,
          grantedAt: day(-150),
          validFrom: day(-150),
          reason:
            'Kestrel answers for compliance across our suppliers — tenure, work authorization and ' +
            'cover — so they sit at our own compliance desk under our rules, and every read of a ' +
            'contractor’s record is logged against them.',
        },
      })
    }
    // And somebody at Kestrel to sit in it. A program office with one
    // owner and nobody else cannot show a desk doing a desk's job.
    const kestrelRole =
      (await db.role.findFirst({ where: { companyId: kestrel.id, name: 'Compliance Officer' } })) ??
      (await db.role.create({
        data: {
          companyId: kestrel.id, name: 'Compliance Officer', isDefault: false,
          permissions: rolesFor('MSP').find((r) => r.name === 'Compliance Officer')!.permissions,
        },
      }))
    const email = `${PREFIX}kestrel-compliance@${DOMAIN}`
    const who = await db.person.upsert({
      where: { primaryEmail: email },
      update: { name: 'Yvonne Achterberg' },
      create: { name: 'Yvonne Achterberg', primaryEmail: email },
    })
    if (!(await db.context.findFirst({ where: { personId: who.id, companyId: kestrel.id } }))) {
      await db.context.create({
        data: {
          personId: who.id, companyId: kestrel.id, roleId: kestrelRole.id, type: 'EMPLOYEE',
          grantReason: 'Seeded program office desk — Compliance Officer',
        },
      })
    }
    supplierDesks++
  }

  // ── The last mile: the doors themselves ────────────────────────────
  //
  // Four people with a seat of their own and something waiting on it,
  // and the two firms whose door on /demo led to an empty book. Runs
  // last because two of the four are placed by the program seed above.
  const doors = await seedDoors({ firmBySlug, seatBySlug, domain: DOMAIN, prefix: PREFIX })

  // ── The layers above and below the placement ───────────────────────
  //
  // Everything to here is the spine: who trades with whom, who is placed,
  // the hours, the invoice. These three run last because every row in
  // them is read off the spine rather than invented beside it.
  //
  //   standing       where a firm sits, what it can prove, and the file
  //                  behind every proof
  //   order-to-cash  the order that authorized the spend, the project
  //                  that accumulates it, and the books it posts to
  //   pipeline       the CV, the thread, the seat being chased, the
  //                  course, and the placement winding down
  //
  // Order matters once: the orders need somewhere to ship to, so standing
  // writes the locations first.
  const ctx = { firmBySlug, seatBySlug, domain: DOMAIN, prefix: PREFIX }
  const standing = await seedStanding(ctx)
  const cash = await seedOrderToCash(ctx)
  const pipeline = await seedPipeline(ctx)
  // What each order asks for on paper. Last of all, because it hangs off
  // the orders `seedOrderToCash` raised a moment ago.
  const paperwork = await seedDocumentRequirements(ctx)

  // ── A firm with a seat took possession of itself ───────────────────
  //
  // `Company.claimedAt` is null for a shell — a firm on the register
  // that nobody at it has taken possession of. Every seeded firm was one
  // of those, because nothing here ever wrote the column, and yet every
  // one of them has a seat somebody signs in on, submits candidates and
  // answers threads from. So `/dashboard/purchase-orders` told Northbend
  // Athletic that "Pinnacle Resourcing is not on Etyme — they cannot see
  // this" about a firm that had answered its thread that morning, and it
  // reached a front-page screenshot.
  //
  // The rule, stated once here rather than at each of the twenty places
  // a company is written: a seat is possession. Somebody holds a context
  // at this firm, so somebody at this firm is here. A firm with no seat
  // — one a client recommended and nobody has joined yet — stays a
  // shell, which is what the column is actually for.
  //
  // Not the upsert above, because clients, program offices and doors are
  // written by three other files, and a sweep at the end catches all of
  // them and is a no-op on the second run.
  const unclaimed = await db.company.findMany({
    where: { slug: { startsWith: PREFIX }, claimedAt: null, contexts: { some: {} } },
    select: { id: true, createdAt: true },
  })
  for (const c of unclaimed) {
    await db.company.update({ where: { id: c.id }, data: { claimedAt: c.createdAt } })
  }

  return {
    firms: FIRMS.length,
    placements: placed.length + programs.placements + doors.placements,
    /// Employees of the two integrators, on payroll and on nobody's bench.
    onPayroll,
    /// Desks seated at a supplier and at a program office, one per job.
    supplierDesks,
    consultants: NAMES.length + LIVE.length + programs.people + doors.people,
    live: LIVE.length,
    /// Days off on every firm's calendar, so a due date can be shifted.
    holidays: calendar.days,
    /// Orders raised, project orders opened, postings and entries written.
    orders: cash.orders,
    postings: cash.postings,
    journalEntries: cash.journalEntries,
    /// Firms that hold a seat and were still on the register as shells.
    claimed: unclaimed.length,
    /// Orders carrying a required set of documents, and the rows on them.
    documentRequirementOrders: paperwork.orders,
    documentRequirements: paperwork.items,
    /// Petitions walked, backings recorded, CVs and threads on file.
    petitions: standing.petitions,
    backings: standing.backings,
    resumes: pipeline.resumes,
    threads: pipeline.threads,
    roster: FIRMS.map((f) => ({ kind: f.kind as string, name: f.name, slug: PREFIX + f.slug })),
  }
}
