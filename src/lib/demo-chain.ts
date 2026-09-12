import { prisma } from '@/lib/db'
import { rolesFor } from '@/lib/company-defaults'
import { defaultPostureFor } from '@/lib/walls'
import { completePlacement } from '@/lib/demo-placement'

/**
 * One supply chain, entered from whichever seat you actually occupy.
 *
 * ── The problem this fixes ───────────────────────────────────────────
 *
 * The demo had three doors — the company, the supplier, a candidate —
 * and the schema knows five kinds of company. An MSP and a GSI had no
 * way in at all, and a prime vendor and a bench vendor got the same
 * world despite sitting on opposite sides of the same trade.
 *
 * Worse, each door seeded a *two-party* world: a client and its
 * suppliers, or a vendor and its client. The business is five-party. A
 * demo that shows two of them is not a small version of the product, it
 * is a different product — the one where nothing is subcontracted and
 * nobody is invoiced by somebody who never met the worker.
 *
 * ── Why one chain and not six worlds ─────────────────────────────────
 *
 * Because the interesting thing about this business is that the same
 * placement looks completely different depending on where you stand. The
 * client sees a person on site. The MSP sees a line on an invoice. The
 * GSI sees a project margin. The prime sees a sub-vendor's bill. The
 * bench vendor sees the only person in the chain who actually met them.
 *
 * Six separate worlds could not show that. One chain seen from six
 * seats is the product.
 *
 * The firms and the shape come from the fixture the stress simulation
 * uses, which has run ten thousand transactions through this exact
 * chain, so it is known to hold together.
 */

const DEMO_DAYS = 14

/** Where the visitor sits in the chain. */
export type Seat = 'CLIENT' | 'MSP' | 'GSI' | 'PRIME' | 'BENCH'

interface Firm {
  seat: Seat
  name: string
  kind: 'CLIENT' | 'MSP' | 'GSI' | 'VENDOR'
  /** Who they buy from, by seat. */
  buysFrom: Seat | null
  /** What this seat is for, said to somebody who just arrived. */
  blurb: string
}

/**
 * The chain, top to bottom. Every hop is a real relationship and each
 * one has a different view of the same worker.
 */
export const CHAIN: Firm[] = [
  {
    seat: 'CLIENT',
    name: 'Oxford Corp',
    kind: 'CLIENT',
    buysFrom: 'MSP',
    blurb: 'You buy the work. You never learn who the sub-vendor is.',
  },
  {
    seat: 'MSP',
    name: 'Yoh Services',
    kind: 'MSP',
    buysFrom: 'GSI',
    blurb: 'You run the programme and are invoiced for it. You never touch a CV.',
  },
  {
    seat: 'GSI',
    name: 'Teleworld Solutions',
    kind: 'GSI',
    buysFrom: 'PRIME',
    blurb: 'You deliver a project with your own people and bought ones.',
  },
  {
    seat: 'PRIME',
    name: 'Insight Global',
    kind: 'VENDOR',
    buysFrom: 'BENCH',
    blurb: 'You hold the paper on somebody you did not source.',
  },
  {
    seat: 'BENCH',
    name: 'Consultis',
    kind: 'VENDOR',
    buysFrom: null,
    blurb: 'You sourced them, and you are furthest from the money.',
  },
]

export const seatFor = (s: Seat): Firm => CHAIN.find((f) => f.seat === s)!

export interface Seeded {
  companyId: string
  companyName: string
  seat: Seat
  counts: Record<string, number>
}

/**
 * Build the chain, and seat the visitor in it.
 *
 * Every company is created either way — a chain with four of its five
 * links missing is the two-party demo again. What varies is which one
 * the visitor owns, and therefore whose book they are looking at.
 */
export async function seedChain(input: {
  personId: string
  personName: string
  seat: Seat
  slug: string
}): Promise<Seeded> {
  const now = new Date()
  const daysAhead = (n: number) => new Date(now.getTime() + n * 86_400_000)
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000)
  const expiresAt = daysAhead(DEMO_DAYS)

  // ── Every firm in the chain ─────────────────────────────────────────
  const made = new Map<Seat, { id: string; name: string; kind: string }>()
  for (const f of CHAIN) {
    const company = await prisma.company.create({
      data: {
        name: f.seat === input.seat ? f.name : `${f.name} (demo)`,
        slug: `${input.slug}-${f.seat.toLowerCase()}`,
        kind: f.kind,
        currency: 'USD',
        outsideAccess: defaultPostureFor(f.kind),
        isDemo: true,
        demoExpiresAt: expiresAt,
      },
    })
    made.set(f.seat, { id: company.id, name: company.name, kind: f.kind })
  }

  // ── Who trades with whom ────────────────────────────────────────────
  //
  // Both directions, because a counterparty row is one company's view of
  // another and each side keeps its own.
  for (const f of CHAIN) {
    if (!f.buysFrom) continue
    const buyer = made.get(f.seat)!
    const seller = made.get(f.buysFrom)!
    await prisma.counterparty.create({
      data: { companyId: buyer.id, otherCompanyId: seller.id, relationship: 'SUPPLIER' },
    })
    await prisma.counterparty.create({
      data: { companyId: seller.id, otherCompanyId: buyer.id, relationship: 'CLIENT' },
    })
  }

  // ── The visitor's own seat ──────────────────────────────────────────
  const mine = made.get(input.seat)!
  const roleSeeds = rolesFor(mine.kind as any)
  const roles = await Promise.all(
    roleSeeds.map((r) =>
      prisma.role.create({
        data: {
          companyId: mine.id,
          name: r.name,
          permissions: r.permissions as string[],
          isDefault: r.isOwner ?? false,
        },
      })
    )
  )
  const owner = roles.find((r) => r.name === roleSeeds.find((s) => s.isOwner)?.name) ?? roles[0]

  await prisma.context.create({
    data: {
      personId: input.personId,
      companyId: mine.id,
      roleId: owner.id,
      type: 'EMPLOYEE',
      grantReason: 'Demo workspace',
    },
  })

  // ── The people, held by the firm furthest from the money ────────────
  //
  // On the bench vendor, because that is where a consultant actually
  // is. Everybody above them in the chain sees the same person as a
  // line on a bill.
  const benchCo = made.get('BENCH')!
  const consultants: { personId: string; profileId: string; name: string }[] = []
  const PEOPLE = [
    { name: 'Ravi Patel', skills: ['SAP FICO', 'ABAP'], location: 'Dallas, Texas', rate: 9500 },
    { name: 'Meera Krishnan', skills: ['Java', 'Spring', 'AWS'], location: 'San Jose, California', rate: 11000 },
    { name: 'David Chen', skills: ['Business Analyst', 'SQL'], location: 'Chicago, Illinois', rate: 7800 },
    { name: 'Priya Sharma', skills: ['QA Automation', 'Selenium'], location: 'Atlanta, Georgia', rate: 8200 },
  ]

  for (const [i, p] of PEOPLE.entries()) {
    const person = await prisma.person.create({
      data: {
        name: p.name,
        primaryEmail: `${p.name.toLowerCase().replace(/\s+/g, '.')}@${input.slug}.demo`,
      },
    })
    const profile = await prisma.consultantProfile.create({
      data: {
        personId: person.id,
        headline: p.skills[0],
        skills: p.skills,
        location: p.location,
        rateFloor: p.rate,
        availableFrom: daysAgo(30 - i * 7),
        visibility: 'VERIFIED',
        confirmedAt: daysAgo(i * 5 + 2),
        confirmedVia: 'EMAIL',
      },
    })
    await prisma.benchListing.create({
      data: {
        consultantId: profile.id,
        companyId: benchCo.id,
        tier: i < 2 ? 'RETAINED' : 'MARKETING',
        // Granted, because these are the demo's existing bench and the
        // point of them is that they can be worked with. New listings
        // created during the demo start INVITED, which is where the
        // consent flow shows itself.
        state: 'GRANTED',
        grantedAt: daysAgo(40 - i * 6),
        rateMin: p.rate,
      },
    })
    consultants.push({ personId: person.id, profileId: profile.id, name: p.name })
  }

  // ── Work, so every seat has something on its screens ────────────────
  //
  // The requirement belongs to the client and travels down; the contract
  // pair belongs to the hop the visitor can actually see.
  const client = made.get('CLIENT')!
  const requirement = await prisma.requirement.create({
    data: {
      companyId: client.id,
      title: 'SAP FICO Consultant',
      skills: ['SAP FICO'],
      location: 'Dallas, Texas',
      description:
        'Finance is moving off ECC and the current team has done configuration ' +
        'but never a cutover. We need somebody who has taken a plant live on ' +
        'S/4 and can say what goes wrong in week two.',
      status: 'OPEN',
      billMin: 11000,
      billMax: 14000,
      startDate: daysAhead(21),
      // Older than the submission that answers it. This defaulted to now,
      // while completePlacement backdates the submission by two months —
      // so the demo's one honest placement was answered before it was
      // asked, and the volume tests caught it.
      createdAt: daysAgo(75),
    },
  })

  // ── The placement, papered at the visitor's own hop ─────────────────
  //
  // Whichever side of it they are on. Every seat but the last buys from
  // somebody below; the last one sells to whoever is above. Keying only
  // off `buysFrom` left the bench vendor — the seat this product is
  // being sold to first — with no placements at all, so the one visitor
  // whose day it most needed to show saw an empty book.
  const below = seatFor(input.seat).buysFrom
  const above = CHAIN.find((f) => f.buysFrom === input.seat)

  const sellerId = below ? made.get(below)!.id : mine.id
  const buyerId = below ? mine.id : above ? made.get(above.seat)!.id : null

  let contracts = 0
  if (buyerId) {
    const placement = await prisma.sellContract.create({
      data: {
        companyId: sellerId,
        personId: consultants[0].personId,
        clientCompanyId: buyerId,
        // Carried, so the placement can be read back to the work that
        // caused it — station one of the placement screen, and the first
        // question anybody asks about somebody on site.
        requirementId: requirement.id,
        endClientCompanyId: client.id,
        billRate: 12500,
        billCurrency: 'USD',
        startDate: daysAgo(45),
        // A year, started six weeks ago. Without an end the contract is
        // open-ended and has no due dates to show — which is what the
        // thread's timeline showed.
        endDate: daysAhead(320),
        state: 'IN_PROGRESS',
        paymentTerms: 45,
      },
    })
    contracts = 1

    // And a life behind it: the buy side, the clearances, four weeks of
    // hours signed by both companies, and an invoice that was paid.
    //
    // Without this the demo listed a placement and opening it showed
    // seven of eight stations reading "nothing recorded yet" — which is
    // how a working product comes across as an unfinished one.
    // A submission requires a live bench listing at the company that
    // sends it. The person sits on the bench vendor's list, but the
    // recorded hop is seller → buyer, and the seller is not always the
    // bench vendor — so the invariant held for the bench and not for the
    // sender. One granted listing at the sender, where it is missing.
    const soldBy = consultants[0]
    await prisma.benchListing.upsert({
      where: { consultantId_companyId: { consultantId: soldBy.profileId, companyId: sellerId } },
      update: {},
      create: {
        consultantId: soldBy.profileId,
        companyId: sellerId,
        tier: 'RETAINED',
        state: 'GRANTED',
        grantedAt: daysAgo(70),
      },
    })
    await completePlacement({
      sellContractId: placement.id,
      supplierCompanyId: sellerId,
      clientCompanyId: buyerId,
      personId: consultants[0].personId,
      billRateCents: 12500,
      payRateCents: 9400,
    })
  }

  return {
    companyId: mine.id,
    companyName: mine.name,
    seat: input.seat,
    counts: {
      firmsInChain: CHAIN.length,
      consultants: consultants.length,
      openRoles: 1,
      contracts,
    },
  }
}
