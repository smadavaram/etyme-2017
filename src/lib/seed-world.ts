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
    { round: 1, stage: 'SCREEN', mode: 'PHONE', at: -106, says: 'Passed.' },
    { round: 2, stage: 'TECHNICAL', mode: 'VIDEO', at: -101, says: 'Strong. Offer.' },
  ]) {
    if (await db.interview.findFirst({ where: { submissionId: sub.id, round: r.round } })) continue
    await db.interview.create({
      data: {
        submissionId: sub.id, companyId: client.id, vendorId: topSeller.id,
        round: r.round, stage: r.stage, mode: r.mode, state: 'DONE',
        proposedSlots: [], durationMins: 45,
        scheduledAt: day(r.at), decidedAt: day(r.at),
        clientConfirmedAt: day(r.at), vendorConfirmedAt: day(r.at),
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


  return {
    firms: FIRMS.length,
    placements: placed.length,
    consultants: NAMES.length,
    roster: FIRMS.map((f) => ({ kind: f.kind as string, name: f.name, slug: PREFIX + f.slug })),
  }
}
