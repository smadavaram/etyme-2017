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

const DOMAIN = 'demo.etyme.local'          // the domain the signed demo cookie accepts
const PREFIX = 'world-'                    // marks a company as part of this world
/**
 * Whole days, anchored to midnight UTC.
 *
 * This was `Date.now() + n * 86_400_000`, which made every date carry the
 * time of day the seed happened to run at. A second run computed
 * different timestamps, so the "does this timesheet already exist" lookup
 * missed, fresh weeks were written, and their invoice collided with the
 * first run's number. The seed claimed to be idempotent and was not —
 * which only showed up on the second call.
 *
 * Normalised, a re-run on the same day is a true no-op, and a re-run
 * later adds that period rather than colliding with it.
 */
const day = (n: number): Date => {
  const d = new Date(Date.now() + n * 86_400_000)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/**
 * Onto a working day.
 *
 * The offsets are counted in whole days from whenever the seed runs, so
 * a screen booked "three days out" landed on a Saturday one run in seven,
 * and a screen recorded as held landed on a Sunday just as often. Nobody
 * interviews at the weekend, and a demo that says they did is one more
 * thing the founder has to explain away.
 *
 * Forward for a round still ahead, backward for one already held —
 * nudging a past round forward would move it into the future, where it
 * would read as upcoming.
 */
const weekday = (d: Date, back: boolean): Date => {
  const g = d.getUTCDay()
  if (g !== 0 && g !== 6) return d
  const days = g === 6 ? (back ? 1 : 2) : back ? 2 : 1
  return new Date(d.getTime() + days * (back ? -86_400_000 : 86_400_000))
}

/** An hour on a working day, absolute. Same normalisation as `day`. */
const at = (n: number, hourUtc: number): Date =>
  new Date(weekday(day(n), n < 0).getTime() + hourUtc * 3_600_000)

// ── The market ───────────────────────────────────────────────────────
//
// Four buyers, two programme offices, two delivery firms, six primes and
// six bench vendors. The shape of the contingent market, small enough to
// hold in your head and wide enough that every seat has somebody above
// and below it.
type Kind = 'CLIENT' | 'MSP' | 'GSI' | 'VENDOR'
interface Firm { slug: string; name: string; kind: Kind; seat: string }
const FIRMS: Firm[] = [
  { slug: 'harlow-health',    name: 'Harlow Health',        kind: 'CLIENT',  seat: 'Programme office' },
  { slug: 'meridian-bank',    name: 'Meridian Bank',        kind: 'CLIENT',  seat: 'Contingent programme' },
  { slug: 'corveldt',         name: 'Corveldt Aerospace',   kind: 'CLIENT',  seat: 'Engineering resourcing' },
  { slug: 'nordway',          name: 'Nordway Retail',       kind: 'CLIENT',  seat: 'Workforce office' },

  { slug: 'aptiva',           name: 'Aptiva Workforce',     kind: 'MSP',     seat: 'Programme manager' },
  { slug: 'kestrel',          name: 'Kestrel MSP',          kind: 'MSP',     seat: 'Programme manager' },

  { slug: 'teleworld',        name: 'Teleworld Solutions',  kind: 'GSI',     seat: 'Delivery manager' },
  { slug: 'sundara',          name: 'Sundara Systems',      kind: 'GSI',     seat: 'Delivery manager' },

  { slug: 'computer-systems', name: 'Computer Systems Inc', kind: 'VENDOR',  seat: 'Account manager' },
  { slug: 'brightmoor',       name: 'Brightmoor Staffing',  kind: 'VENDOR',  seat: 'Account manager' },
  { slug: 'vertex-global',    name: 'Vertex Global',        kind: 'VENDOR',  seat: 'Account manager' },
  { slug: 'halcyon',          name: 'Halcyon Talent',       kind: 'VENDOR',  seat: 'Account manager' },
  { slug: 'pinnacle',         name: 'Pinnacle Resourcing',  kind: 'VENDOR',  seat: 'Account manager' },
  { slug: 'arcadia',          name: 'Arcadia Tech Group',   kind: 'VENDOR',  seat: 'Account manager' },

  { slug: 'cloudepa',         name: 'CloudEPA',             kind: 'VENDOR',  seat: 'Bench sales' },
  { slug: 'consultis',        name: 'Consultis',            kind: 'VENDOR',  seat: 'Bench sales' },
  { slug: 'nimbus',           name: 'Nimbus Talent',        kind: 'VENDOR',  seat: 'Bench sales' },
  { slug: 'sahasra',          name: 'Sahasra Infotech',     kind: 'VENDOR',  seat: 'Bench sales' },
  { slug: 'orchid',           name: 'Orchid Systems',       kind: 'VENDOR',  seat: 'Bench sales' },
  { slug: 'bluecrest',        name: 'Bluecrest Staffing',   kind: 'VENDOR',  seat: 'Bench sales' },
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
  { role: 'SAP FICO consultant',        skills: ['SAP FICO', 'S/4HANA'],       loc: 'San Jose, CA',
    routedBy: 'aptiva',  via: ['harlow-health', 'computer-systems', 'cloudepa'], rates: [13800, 11200, 8600] },
  { role: 'Epic Ambulatory analyst',    skills: ['Epic', 'Ambulatory'],        loc: 'Madison, WI',
    via: ['harlow-health', 'computer-systems'],                                  rates: [11500, 8400] },
  { role: 'Java microservices engineer',skills: ['Java', 'Spring Boot', 'AWS'],loc: 'Charlotte, NC',
    via: ['meridian-bank', 'vertex-global', 'sahasra'],                          rates: [12600, 10200, 7900] },
  { role: 'Avionics test engineer',     skills: ['DO-178C', 'Embedded C'],     loc: 'Wichita, KS',
    via: ['corveldt', 'teleworld', 'nimbus'],                                    rates: [14200, 11600, 9100] },
  { role: 'Oracle Retail consultant',   skills: ['Oracle Retail', 'PL/SQL'],   loc: 'Columbus, OH',
    routedBy: 'kestrel', via: ['nordway', 'brightmoor', 'consultis'],            rates: [12900, 10400, 8100] },
  { role: 'Murex support analyst',      skills: ['Murex', 'FX'],               loc: 'Jersey City, NJ',
    via: ['meridian-bank', 'halcyon'],                                           rates: [13400, 9800] },
  { role: 'PLM systems engineer',       skills: ['Teamcenter', 'PLM'],         loc: 'Everett, WA',
    via: ['corveldt', 'sundara', 'orchid'],                                      rates: [13100, 10700, 8300] },
  { role: 'Workday integrations lead',  skills: ['Workday', 'Studio'],         loc: 'Minneapolis, MN',
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
  /// Chains still mid-flight — open requirements with rounds not yet held.
  live: number
  roster: { kind: string; name: string; slug: string }[]
  }> {
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
      // Never a demo company: reaped after a fortnight, and deleted
      // outright by the reset button. This world outlives both.
      isDemo: false,
    },
  })
  const role =
    (await db.role.findFirst({ where: { companyId: c.id, name: 'Owner' } })) ??
    (await db.role.create({ data: { companyId: c.id, name: 'Owner', permissions: ['*'], isDefault: true } }))
  const email = `${slug}@${DOMAIN}`
  const p = await db.person.upsert({
    where: { primaryEmail: email }, update: { name: f.seat }, create: { name: f.seat, primaryEmail: email },
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
  // Cost centres, a headcount plan, departments and a delegation of
  // authority. Without them the "which budget pays for it" list is
  // empty, every requisition clears itself, and the approval engine —
  // which is built and tested — can never be reached. The demo showed a
  // governance product with the governance switched off.
  if (f.kind === 'CLIENT') {
    const approverEmail = `${slug}-vp@${DOMAIN}`
    const approver = await db.person.upsert({
      where: { primaryEmail: approverEmail },
      update: {},
      create: { name: 'VP, ' + f.name.split(' ')[0], primaryEmail: approverEmail },
    })
    if (!(await db.context.findFirst({ where: { personId: approver.id, companyId: c.id } }))) {
      await db.context.create({
        data: {
          personId: approver.id, companyId: c.id, roleId: role.id,
          type: 'EMPLOYEE', grantReason: 'Seeded world — approver',
        },
      })
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

    if (!(await db.approvalRule.findFirst({ where: { companyId: c.id, name: 'Programme lead' } }))) {
      await db.approvalRule.create({
        data: {
          companyId: c.id, name: 'Programme lead', thresholdAmount: null,
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
  if (!(await db.benchListing.findFirst({ where: { consultantId: profile.id, companyId: employer.id } }))) {
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
  const employerSeat = seatBySlug.get(employerSlug)!.personId
  // Two on the person — the one that blocks and the one that warns — and
  // the supplier's cover, which is what lets it place anybody at all.
  const clearances: {
    personId?: string; companyId?: string
    type: 'I9_EVERIFY' | 'BACKGROUND_CHECK' | 'INSURANCE_GL' | 'INSURANCE_WC'
    provider: string; expiresAt: Date | null
  }[] = [
    { personId: person.id, type: 'I9_EVERIFY', provider: 'E-Verify', expiresAt: null },
    { personId: person.id, type: 'BACKGROUND_CHECK', provider: 'Sterling', expiresAt: day(250) },
    { companyId: employer.id, type: 'INSURANCE_GL', provider: 'Hartford', expiresAt: day(200) },
    { companyId: employer.id, type: 'INSURANCE_WC', provider: 'Hartford', expiresAt: day(200) },
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
  for (const sell of contracts) {
    const unbilled: any[] = []
    for (const t of sheets.slice(0, 3)) {
      if (await db.invoiceLine.findFirst({ where: { timesheetId: t.id, sellContractId: sell.id } })) continue
      unbilled.push(t)
    }
    if (unbilled.length === 0) continue
    const cents = unbilled.length * 40 * sell.billRate
    const inv = await db.invoice.create({
      data: {
        engagementId: sell.engagementId, // Per contract AND per period. Keyed on the contract alone, a
          // later run covering a new week collided with the first run's
          // invoice on Invoice.number, which is unique.
          number: `IN-${sell.id.slice(-6).toUpperCase()}-${unbilled[0].periodStart
            .toISOString()
            .slice(0, 10)
            .replace(/-/g, '')}`,
        periodStart: unbilled[0].periodStart, periodEnd: unbilled[unbilled.length - 1].periodEnd,
        currency: 'USD', total: cents / 100, paid: cents / 100,
        dueAt: day(20), issuedAt: day(-10), status: 'PAID',
      },
    })
    for (const t of unbilled) {
      await db.invoiceLine.create({
        data: {
          invoiceId: inv.id, timesheetId: t.id, sellContractId: sell.id, personId: person.id,
          hours: 40, rateCents: sell.billRate, amountCents: 40 * sell.billRate,
        },
      })
    }
    await db.payment.create({
      data: {
        invoiceId: inv.id, payerCompanyId: sell.clientCompanyId, receivedByCompanyId: sell.companyId,
        amount: cents / 100, currency: 'USD', method: 'ACH', receivedAt: day(-4), appliedAt: day(-4),
      },
    })
  }

  return { person, requirement }
  }

  // ── Build it ─────────────────────────────────────────────────────────

  for (const f of FIRMS) await firm(f)

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
  const benchVendors = ['cloudepa', 'consultis', 'nimbus', 'sahasra', 'orchid', 'bluecrest']
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


  return {
    firms: FIRMS.length,
    placements: placed.length,
    consultants: NAMES.length + LIVE.length,
    live: LIVE.length,
    roster: FIRMS.map((f) => ({ kind: f.kind as string, name: f.name, slug: PREFIX + f.slug })),
  }
}
