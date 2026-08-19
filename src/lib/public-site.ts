import { prisma } from '@/lib/db'

/**
 * What the world sees at cloudepa.etyme.com.
 *
 * `siteLiveAt` has been set at sign-up since the beginning and nothing was
 * ever served on it. The ninety-second promise was recorded and not kept.
 *
 * Kept here rather than inside the route so the page can call it directly.
 * A server component fetching its own HTTP endpoint doubles the latency
 * and breaks the moment the public hostname does not resolve from inside
 * the container — which is exactly how it broke.
 *
 * This is deliberately not the dashboard with a logged-out banner. It is
 * public, which means the shape of what comes back is the shape of what we
 * are willing to say about a customer to anybody who types their name. So
 * it carries no rates, no margins, no client names, and no consultant
 * identities.
 *
 * Everything numeric is counted from real rows. A company with nothing yet
 * says so rather than showing a zero dressed up as a milestone.
 */

export interface PublicSite {
  name: string
  slug: string
  does: string
  kind: string
  locations: string[]
  track: { placements: number; activeNow: number; clients: number; isNew: boolean }
  skills: { skill: string; count: number }[]
  credentials: { what: string; until: string | null }[]
  verifiedDomain: string | null
  inNetwork: boolean
  liveSince: string
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
    // No expiry beats any expiry — it does not lapse at all.
    if (current === null) continue
    if (v.expiresAt === null || v.expiresAt > current) best.set(v.type, v.expiresAt)
  }

  return [...best.entries()].map(([type, until]) => ({
    what: READABLE[type],
    // A date, so this is a fact with a shelf life rather than a badge that
    // never comes off.
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

export async function publicSite(slug: string): Promise<PublicSite | null> {
  const company = await prisma.company.findFirst({
    where: {
      OR: [
        { slug },
        // An old address still resolves, so a link somebody saved before a
        // rebrand keeps working here as well as in the app.
        { subdomainAliases: { some: { subdomain: slug } } },
        { customDomains: { some: { domain: slug, state: 'VERIFIED' } } },
      ],
    },
    select: {
      id: true, name: true, slug: true, kind: true, supplierPosture: true,
      siteLiveAt: true, networkVerifiedAt: true, domain: true, domainVerified: true,
      locations: {
        where: { isRemote: false },
        orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
        select: { city: true, state: true, country: true },
      },
    },
  })

  if (!company?.siteLiveAt) return null

  const [placements, activeNow, clientRows, profiles, verifications] = await Promise.all([
    prisma.sellContract.count({ where: { companyId: company.id } }),
    prisma.sellContract.count({ where: { companyId: company.id, state: 'IN_PROGRESS' } }),
    // How many distinct clients, never which ones. A client list is theirs
    // to publish, not ours.
    prisma.sellContract.findMany({
      where: { companyId: company.id },
      select: { endClientCompanyId: true, clientCompanyId: true },
    }),
    // What they actually place, taken from the people on their bench
    // rather than from anything they typed about themselves.
    prisma.consultantProfile.findMany({
      where: { listings: { some: { companyId: company.id, revokedAt: null } } },
      select: { skills: true },
    }),
    // Only what is held and still in date.
    prisma.verification.findMany({
      where: {
        companyId: company.id,
        status: { in: ['CLEAR', 'CONDITIONAL'] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { type: true, expiresAt: true },
    }),
  ])

  const counts = new Map<string, number>()
  for (const p of profiles) for (const s of p.skills) counts.set(s, (counts.get(s) ?? 0) + 1)

  const where = company.locations
    .map((l) => [l.city, l.state ?? l.country].filter(Boolean).join(', '))
    .filter(Boolean)

  return {
    name: company.name,
    slug: company.slug,
    does: whatTheyDo(company.kind, company.supplierPosture),
    kind: company.kind,
    // Remote-only locations are left out, because "Remote" as a place
    // tells a reader nothing.
    locations: [...new Set(where)].slice(0, 6),
    track: {
      placements,
      activeNow,
      clients: new Set(clientRows.map((r) => r.endClientCompanyId ?? r.clientCompanyId)).size,
      // The honest version of an empty page.
      isNew: placements === 0,
    },
    skills: [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([skill, count]) => ({ skill, count })),
    // One line per kind of cover, not one per certificate. A company that
    // renewed keeps both rows, and listing them both reads as though they
    // hold two policies — the same longest-lasting-copy rule the packet
    // resolver already uses.
    credentials: longestPerType(verifications),
    // The one thing on the page a reader cannot fake for themselves.
    verifiedDomain: company.domainVerified ? company.domain : null,
    // Public site and private network are different things. Being here is
    // not a recommendation from us.
    inNetwork: company.networkVerifiedAt !== null,
    liveSince: company.siteLiveAt.toISOString().slice(0, 10),
  }
}
