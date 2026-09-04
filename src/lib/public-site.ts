import { prisma } from '@/lib/db'
import { reputationOf, type BuyerReputation } from '@/lib/buyer-reputation'
import { releasing, summarise, mayShow, type RollingOff } from '@/lib/releasing-soon'
import { writeFromRules, DEFAULT_HEADINGS, type SiteVoice } from '@/lib/site-voice'

/**
 * What the world sees at cloudepa.etyme.com.
 *
 * The first version of this was one page of facts for nobody in
 * particular. It was honest and inert: you read it and then you were done.
 *
 * There is no single audience. A buyer and a supplier want opposite pages,
 * and the same rule already applies to the dashboard — CLAUDE.md says the
 * eyebrow, nav and framing adapt to the viewer's company type while the
 * underlying data is shared. The public page follows it.
 *
 *   A client or delivery partner is talking to SUPPLIERS. Their page is
 *   "here is what we have open, and here is what we are like to work
 *   with" — including how fast they decide and whether they pay, which no
 *   VMS publishes because every VMS is bought by the buyer.
 *
 *   A staffing firm is talking to three people at once: CANDIDATES who
 *   might join their bench, CLIENTS who might hire from it, and PEER
 *   FIRMS who might borrow from it. So their page leads with who is
 *   coming free, which is the most valuable thing a staffing firm knows
 *   and the thing it currently tells nobody.
 *
 * Public means public. No rates anywhere — what a supplier may charge
 * lives on the invitation precisely so no recipient reads another's band,
 * and a public page is the most public recipient there is. No client
 * names, because a client list is theirs to publish. No consultant
 * identities without their agreement.
 */

export type Audience = 'SUPPLIERS' | 'TALENT_AND_BUYERS'

export interface OpenPosition {
  id: string
  title: string
  skills: string[]
  location: string | null
  heads: number
  postedAt: string
  /** How long it has been open, which says more than a date. */
  openFor: string
}

export interface ComingFree {
  headline: string | null
  skills: string[]
  location: string | null
  freeOn: string
  daysUntilFree: number
  /** No name. A public page is not a place to put somebody's identity. */
  provenAt: string | null
}

export interface Training {
  title: string
  category: string | null
  hours: number | null
  free: boolean
}

export interface PublicSite {
  name: string
  slug: string
  does: string
  kind: string
  audience: Audience
  locations: string[]
  track: { placements: number; activeNow: number; clients: number; isNew: boolean }
  skills: { skill: string; count: number }[]
  credentials: { what: string; until: string | null }[]
  verifiedDomain: string | null
  inNetwork: boolean
  liveSince: string

  /** The words on the page. Generated once, editable, never the facts. */
  tagline: string
  intro: string
  headings: Record<string, string>
  writtenBy: 'MODEL' | 'RULES' | 'PERSON'

  /** Buyer page: what a supplier can actually pick up. */
  openPositions: OpenPosition[]
  /** Buyer page: what they are like to work with. */
  reputation: BuyerReputation | null

  /** Supplier page: who is about to come free. */
  comingFree: ComingFree[]
  comingFreeSummary: string | null
  /** Supplier page: what a consultant joining them gets. */
  training: Training[]
}

const READABLE: Record<string, string> = {
  INSURANCE_GL: 'General liability insurance',
  INSURANCE_WC: "Workers' compensation",
  INSURANCE_EO: 'Errors and omissions cover',
  INSURANCE_CYBER: 'Cyber liability cover',
  BUSINESS_PARTNER: 'Business registration',
}

/**
 * One entry per kind of cover, keeping whichever runs longest.
 *
 * A renewal leaves the old certificate on file, so a company that has
 * renewed twice would otherwise show three lines of general liability
 * insurance with three different dates.
 */
function longestPerType(
  rows: { type: string; expiresAt: Date | null }[]
): { what: string; until: string | null }[] {
  const best = new Map<string, Date | null>()

  for (const v of rows) {
    if (!READABLE[v.type]) continue
    if (!best.has(v.type)) {
      best.set(v.type, v.expiresAt)
      continue
    }
    const current = best.get(v.type)!
    if (current === null) continue
    if (v.expiresAt === null || v.expiresAt > current) best.set(v.type, v.expiresAt)
  }

  return [...best.entries()].map(([type, until]) => ({
    what: READABLE[type],
    until: until?.toISOString().slice(0, 10) ?? null,
  }))
}

/** What they do, in a phrase somebody would use rather than an enum. */
export function whatTheyDo(kind: string, posture: string | null): string {
  if (kind === 'CLIENT') return 'hires contract staff'
  if (kind === 'MSP') return 'runs contingent workforce programmes'
  if (kind === 'GSI') return 'delivers projects and supplies people'
  return posture === 'BENCH'
    ? 'supplies consultants through other staffing firms'
    : 'supplies consultants to clients'
}

/**
 * Who this company's public page is talking to.
 *
 * A GSI is genuinely both — Infosys buys bench from three firms and sells
 * delivery to Nike in the same week — and it gets the supplier-facing page
 * because that is the side with something to offer a stranger. Their own
 * bench belongs on an internal marketplace, not on the open internet.
 */
export function audienceFor(kind: string): Audience {
  return kind === 'CLIENT' || kind === 'MSP' || kind === 'GSI' ? 'SUPPLIERS' : 'TALENT_AND_BUYERS'
}

/**
 * The words for this page.
 *
 * Whatever is stored wins, because somebody may have edited it and their
 * page is theirs. Where nothing is stored — a company that signed up
 * before this existed, or one whose generation failed — the rules write
 * something from the same facts rather than leaving a blank.
 */
function voiceFor(
  company: { siteTagline: string | null; siteIntro: string | null; siteHeadings: unknown; siteWrittenBy: string | null },
  facts: Parameters<typeof writeFromRules>[0]
): Pick<PublicSite, 'tagline' | 'intro' | 'headings' | 'writtenBy'> {
  const fallback = writeFromRules(facts)
  const stored = company.siteHeadings as Record<string, string> | null

  return {
    tagline: company.siteTagline ?? fallback.tagline,
    intro: company.siteIntro ?? fallback.intro,
    headings: { ...DEFAULT_HEADINGS, ...(stored ?? {}) },
    writtenBy:
      company.siteTagline === null
        ? 'RULES'
        : (company.siteWrittenBy as 'MODEL' | 'RULES' | 'PERSON' | null) ?? 'PERSON',
  }
}

/** "3 weeks" reads better than a date somebody has to subtract from today. */
function howLong(since: Date, now: Date): string {
  const days = Math.floor((now.getTime() - since.getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days`
  if (days < 60) return `${Math.round(days / 7)} weeks`
  return `${Math.round(days / 30)} months`
}

export async function publicSite(slug: string): Promise<PublicSite | null> {
  const now = new Date()

  const company = await prisma.company.findFirst({
    where: {
      OR: [
        { slug },
        // An old address still resolves, so a link saved before a rebrand
        // keeps working here as well as in the app.
        { subdomainAliases: { some: { subdomain: slug } } },
        { customDomains: { some: { domain: slug, state: 'VERIFIED' } } },
      ],
    },
    select: {
      id: true, name: true, slug: true, kind: true, supplierPosture: true,
      siteLiveAt: true, networkVerifiedAt: true, domain: true, domainVerified: true,
      siteTagline: true, siteIntro: true, siteHeadings: true, siteWrittenBy: true,
      locations: {
        where: { isRemote: false },
        orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
        select: { city: true, state: true, country: true },
      },
    },
  })

  if (!company?.siteLiveAt) return null

  const audience = audienceFor(company.kind)

  const [placements, activeNow, clientRows, profiles, verifications] = await Promise.all([
    prisma.sellContract.count({ where: { companyId: company.id } }),
    prisma.sellContract.count({ where: { companyId: company.id, state: 'IN_PROGRESS' } }),
    prisma.sellContract.findMany({
      where: { companyId: company.id },
      select: { endClientCompanyId: true, clientCompanyId: true },
    }),
    prisma.consultantProfile.findMany({
      where: { listings: { some: { companyId: company.id, revokedAt: null } } },
      select: { skills: true },
    }),
    prisma.verification.findMany({
      where: {
        companyId: company.id,
        status: { in: ['CLEAR', 'CONDITIONAL'] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { type: true, expiresAt: true },
    }),
  ])

  const base = {
    name: company.name,
    slug: company.slug,
    does: whatTheyDo(company.kind, company.supplierPosture),
    kind: company.kind,
    audience,
    locations: [...new Set(
      company.locations.map((l) => [l.city, l.state ?? l.country].filter(Boolean).join(', ')).filter(Boolean)
    )].slice(0, 6),
    track: {
      placements,
      activeNow,
      clients: new Set(clientRows.map((r) => r.endClientCompanyId ?? r.clientCompanyId)).size,
      isNew: placements === 0,
    },
    skills: (() => {
      const counts = new Map<string, number>()
      for (const p of profiles) for (const s of p.skills) counts.set(s, (counts.get(s) ?? 0) + 1)
      return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
        .map(([skill, count]) => ({ skill, count }))
    })(),
    credentials: longestPerType(verifications),
    verifiedDomain: company.domainVerified ? company.domain : null,
    inNetwork: company.networkVerifiedAt !== null,
    liveSince: company.siteLiveAt.toISOString().slice(0, 10),
  }

  // ── Talking to suppliers ────────────────────────────────────────────
  if (audience === 'SUPPLIERS') {
    const [positions, submissions, invoices, supplierIds, tenures] = await Promise.all([
      // Only what they chose to open. A client's hiring plan is
      // commercially sensitive and publishing it is a decision.
      prisma.requirement.findMany({
        where: { companyId: company.id, openToNetwork: true, status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
        take: 25,
        select: { id: true, title: true, skills: true, location: true, headcount: true, createdAt: true },
      }),
      prisma.submission.findMany({
        where: { toCompanyId: company.id },
        select: { submittedAt: true, decidedAt: true },
      }),
      prisma.invoice.findMany({
        where: { engagement: { msa: { clientId: company.id } } },
        select: {
          dueAt: true, total: true, status: true,
          payments: { select: { receivedAt: true } },
        },
      }),
      prisma.sellContract.findMany({
        where: { clientCompanyId: company.id, state: 'IN_PROGRESS' },
        select: { companyId: true },
      }),
      prisma.sellContract.findMany({
        where: { clientCompanyId: company.id, endDate: { not: null } },
        select: { startDate: true, endDate: true },
      }),
    ])

    const months = tenures
      .map((t) => Math.round((t.endDate!.getTime() - t.startDate.getTime()) / (30 * 86_400_000)))
      .filter((m) => m > 0)
      .sort((a, b) => a - b)

    return {
      ...base,
      // Computed here rather than earlier, so a company with no stored
      // voice gets a fallback written from its real numbers rather than
      // from zeroes.
      ...voiceFor(company, {
        name: base.name, kind: base.kind, posture: company.supplierPosture,
        skills: base.skills.map((s) => s.skill),
        locations: base.locations,
        placements: base.track.placements,
        activeNow: base.track.activeNow,
        clients: base.track.clients,
        openPositions: positions.length,
        comingFree: 0,
        trainingCourses: 0,
      }),
      openPositions: positions.map((p) => ({
        id: p.id,
        title: p.title,
        skills: p.skills,
        location: p.location,
        heads: p.headcount,
        postedAt: p.createdAt.toISOString().slice(0, 10),
        openFor: howLong(p.createdAt, now),
      })),
      reputation: reputationOf(
        {
          submissions: submissions.map((s) => ({
            submittedAt: s.submittedAt,
            // A real column, stamped when the decision landed. Inferring
            // it from a row's last write would report every decision as
            // instant, which is the opposite of the truth for the buyers
            // this measure exists to describe.
            decidedAt: s.decidedAt,
          })),
          invoices: invoices.map((i) => ({
            dueAt: i.dueAt,
            // The last payment that settled it. An invoice marked paid with
            // no payment row cannot say when, so it is left unsettled
            // rather than dated to now and counted as punctual.
            paidAt: i.status === 'PAID'
              ? (i.payments.map((p) => p.receivedAt).sort((a, b) => b.getTime() - a.getTime())[0] ?? null)
              : null,
            amountCents: Math.round(Number(i.total) * 100),
          })),
          supplierCount: new Set(supplierIds.map((s) => s.companyId)).size,
          openPositions: positions.length,
          medianTenureMonths: months.length > 0 ? months[Math.floor(months.length / 2)] : null,
        },
        now
      ),
      comingFree: [],
      comingFreeSummary: null,
      training: [],
    }
  }

  // ── Talking to candidates, clients and peer firms ───────────────────
  const [rollingOff, courses] = await Promise.all([
    prisma.sellContract.findMany({
      where: {
        companyId: company.id,
        state: { in: ['IN_PROGRESS', 'PAUSED'] },
        endDate: { not: null, gte: now, lte: new Date(now.getTime() + 90 * 86_400_000) },
      },
      select: {
        id: true, endDate: true, companyId: true,
        company: { select: { id: true, name: true } },
        clientCompany: { select: { name: true, kind: true } },
        endClientCompany: { select: { name: true, kind: true } },
        person: {
          select: {
            id: true, name: true,
            consultant: {
              select: {
                headline: true, skills: true, location: true, rateFloor: true,
                listings: {
                  where: { revokedAt: null },
                  select: { companyId: true, showBeforeFree: true, revokedAt: true },
                },
              },
            },
          },
        },
        rolloff: { select: { outcome: true, claimedById: true } },
      },
    }),
    // Training a candidate can see before deciding to join. Already opt-in
    // per course, which is the right default for anything public.
    prisma.course.findMany({
      where: { companyId: company.id, isPublic: true },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { title: true, category: true, duration: true, price: true },
    }),
  ])

  const rows: RollingOff[] = []
  for (const c of rollingOff) {
    if (!c.endDate || !c.person.consultant) continue
    const listing = c.person.consultant.listings.find((l) => l.companyId === c.companyId)
    // The same consent gate as everywhere else. A contract end date is not
    // agreement to be advertised, least of all on the open internet.
    if (!mayShow({
      hasLiveListing: Boolean(listing),
      listingRevoked: listing ? listing.revokedAt !== null : false,
      consultantOptedOut: listing ? listing.showBeforeFree === false : false,
    }).mayShow) continue

    rows.push({
      contractId: c.id,
      personId: c.person.id,
      personName: c.person.name,
      vendorCompanyId: c.company.id,
      vendorName: c.company.name,
      endClientName: c.endClientCompany?.name ?? c.clientCompany?.name ?? null,
      endDate: c.endDate,
      consented: true,
      headline: c.person.consultant.headline,
      skills: c.person.consultant.skills,
      location: c.person.consultant.location,
      rateFloorCents: c.person.consultant.rateFloor,
      extensionLikely: c.rolloff?.outcome === 'REDEPLOYED' || Boolean(c.rolloff?.claimedById),
    })
  }

  const free = releasing(rows, now)

  return {
    ...base,
    ...voiceFor(company, {
      name: base.name, kind: base.kind, posture: company.supplierPosture,
      skills: base.skills.map((s) => s.skill),
      locations: base.locations,
      placements: base.track.placements,
      activeNow: base.track.activeNow,
      clients: base.track.clients,
      openPositions: 0,
      comingFree: free.length,
      trainingCourses: courses.length,
    }),
    openPositions: [],
    reputation: null,
    comingFree: free.map((r) => ({
      headline: r.headline,
      skills: r.skills,
      location: r.location,
      freeOn: r.freeOn,
      daysUntilFree: r.daysUntilFree,
      // Not the client's name — they agreed to nothing — and not a
      // fragment of it either. What is worth saying publicly is simply
      // that they are working rather than benched, which is the signal a
      // buyer actually reads.
      provenAt: r.proven ? 'Currently on assignment' : null,
    })),
    comingFreeSummary: free.length > 0 ? summarise(free).summary : null,
    training: courses.map((c) => ({
      title: c.title,
      category: c.category,
      hours: c.duration,
      free: c.price === null || c.price === 0,
    })),
  }
}
