import { prisma } from '@/lib/db'
import {
  buildPortfolio, pageIsLive,
  type Portfolio, type PortfolioInput, type Engagement, type Visibility,
} from '@/lib/consultant-portfolio'

/**
 * Loading a consultant's own page.
 *
 * The three rules from consultant-portfolio.ts, enforced here where the
 * data actually comes from:
 *
 *   Off until they turn it on. Visibility starts INTERNAL on every
 *   profile, so a page cannot appear by accident.
 *
 *   What they did, never who for. A client agreed to nothing, so their
 *   name never leaves this function — the sector does instead.
 *
 *   Theirs, not the agency's. Nothing here filters by which company
 *   currently represents them, so leaving one changes nothing.
 */

/**
 * A client's industry, without naming them.
 *
 * Guessed from the kind of company plus what the work was, because there is
 * no industry column. Where it cannot be worked out, nothing is said —
 * which is better than a wrong sector on somebody's portfolio.
 */
function sectorOf(clientName: string | null, kind: string | null): string | null {
  if (!clientName) return null
  // Deliberately coarse. Anything more specific starts identifying the
  // client, which is the thing this exists to avoid.
  if (kind === 'MSP') return 'Managed programme'
  if (kind === 'GSI') return 'Systems integrator'
  if (kind === 'VENDOR') return 'Staffing firm'
  return 'Enterprise'
}

/**
 * Checks named as what they say, never as the document behind them.
 *
 * "Right to work" is a fact about a person. The I-9 that proves it is
 * their private paperwork and never appears on a public page.
 */
const READABLE: Record<string, string> = {
  I9_EVERIFY: 'Right to work',
  BACKGROUND_CHECK: 'Background check',
  DRUG_SCREENING: 'Drug screening',
  EDUCATION_EVALUATION: 'Credentials evaluated',
  REFERENCE_CHECK: 'References',
}

export async function portfolioOf(slug: string): Promise<Portfolio | null> {
  const now = new Date()

  const profile = await prisma.consultantProfile.findFirst({
    where: { slug },
    select: {
      slug: true, pageLiveAt: true,
      headline: true, skills: true, location: true, visibility: true,
      availableFrom: true, bioHeadline: true, bioIntro: true,
      person: {
        select: {
          id: true, name: true,
          sellContracts: {
            // Work that happened. A draft or a cancelled contract is not
            // an engagement, and counting one would put years on somebody's
            // page they never worked.
            where: { state: { in: ['IN_PROGRESS', 'PAUSED', 'ENDED'] } },
            orderBy: { startDate: 'desc' },
            take: 20,
            select: {
              startDate: true, endDate: true,
              requirement: { select: { title: true, skills: true } },
              workLocation: { select: { city: true, state: true } },
              clientCompany: { select: { name: true, kind: true } },
              endClientCompany: { select: { name: true, kind: true } },
            },
          },
          enrollments: {
            where: { completedAt: { not: null } },
            orderBy: { completedAt: 'desc' },
            take: 10,
            select: { completedAt: true, course: { select: { title: true } } },
          },
          verifications: {
            where: {
              status: { in: ['CLEAR', 'CONDITIONAL'] },
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            select: { type: true },
          },
        },
      },
    },
  })

  if (!profile) return null

  // Off until they turn it on. A page nobody chose is a page nobody meant
  // to publish.
  if (!pageIsLive(profile)) return null

  const engagements: Engagement[] = profile.person.sellContracts.map((c) => ({
    role: c.requirement?.title ?? profile.headline ?? 'Contract engagement',
    skills: c.requirement?.skills ?? [],
    startedAt: c.startDate,
    endedAt: c.endDate,
    // The client's name never leaves this function.
    sector: sectorOf(
      c.endClientCompany?.name ?? c.clientCompany?.name ?? null,
      c.endClientCompany?.kind ?? c.clientCompany?.kind ?? null
    ),
    location: c.workLocation
      ? [c.workLocation.city, c.workLocation.state].filter(Boolean).join(', ')
      : null,
  }))

  const built = buildPortfolio(
    {
      name: profile.person.name,
      headline: profile.bioHeadline ?? profile.headline,
      skills: profile.skills,
      location: profile.location,
      visibility: profile.visibility as Visibility,
      availableFrom: profile.availableFrom,
      engagements,
      completedTraining: profile.person.enrollments.map((e) => ({
        title: e.course.title,
        completedAt: e.completedAt!,
      })),
      // Named as checks that passed, never the documents themselves.
      verified: [...new Set(
        profile.person.verifications.map((v) => READABLE[v.type]).filter(Boolean)
      )],
    },
    now
  )

  // Their own words win over anything written for them.
  return profile.bioIntro ? { ...built, intro: profile.bioIntro } : built
}

/**
 * Where an old address now points.
 *
 * An address they used before is never given to anybody else and never
 * simply stops working — a portfolio link on a CV from two years ago has
 * to land somewhere. It lands on them.
 */
export async function movedTo(slug: string): Promise<string | null> {
  const profile = await prisma.consultantProfile.findFirst({
    where: { previousSlugs: { has: slug } },
    select: { slug: true, pageLiveAt: true },
  })
  if (!profile?.slug) return null
  // A page that has since been turned off should not be findable through
  // an old address either.
  if (!pageIsLive(profile)) return null
  return profile.slug
}

/**
 * Whether an address is spoken for.
 *
 * Counts addresses in use and addresses that were once in use, because
 * neither is ever handed to somebody else.
 */
export async function addressTaken(value: string, exceptProfileId?: string): Promise<boolean> {
  const found = await prisma.consultantProfile.findFirst({
    where: {
      OR: [{ slug: value }, { previousSlugs: { has: value } }],
      ...(exceptProfileId ? { NOT: { id: exceptProfileId } } : {}),
    },
    select: { id: true },
  })
  return found !== null
}

/** A first suggestion, from their name. Theirs to change. */
export function suggestAddress(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
}

/**
 * Everything their words could honestly be written from.
 *
 * Loaded by person rather than by address, because this runs before they
 * have an address — the words come first, the page comes after.
 *
 * Note what is not in here: no client names, no rates, no documents. What
 * gets sent to a model to be written up is the same thing a stranger would
 * be allowed to read.
 */
export async function factsFor(personId: string): Promise<PortfolioInput | null> {
  const now = new Date()

  const profile = await prisma.consultantProfile.findFirst({
    where: { personId },
    select: {
      headline: true, skills: true, location: true, visibility: true, availableFrom: true,
      person: {
        select: {
          name: true,
          sellContracts: {
            where: { state: { in: ['IN_PROGRESS', 'PAUSED', 'ENDED'] } },
            orderBy: { startDate: 'desc' },
            take: 20,
            select: {
              startDate: true, endDate: true,
              requirement: { select: { title: true, skills: true } },
              workLocation: { select: { city: true, state: true } },
              clientCompany: { select: { name: true, kind: true } },
              endClientCompany: { select: { name: true, kind: true } },
            },
          },
          enrollments: {
            where: { completedAt: { not: null } },
            orderBy: { completedAt: 'desc' },
            take: 10,
            select: { completedAt: true, course: { select: { title: true } } },
          },
          verifications: {
            where: {
              status: { in: ['CLEAR', 'CONDITIONAL'] },
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            select: { type: true },
          },
        },
      },
    },
  })
  if (!profile) return null

  return {
    name: profile.person.name,
    headline: profile.headline,
    skills: profile.skills,
    location: profile.location,
    visibility: profile.visibility as Visibility,
    availableFrom: profile.availableFrom,
    engagements: profile.person.sellContracts.map((c) => ({
      role: c.requirement?.title ?? profile.headline ?? 'Contract engagement',
      skills: c.requirement?.skills ?? [],
      startedAt: c.startDate,
      endedAt: c.endDate,
      sector: sectorOf(
        c.endClientCompany?.name ?? c.clientCompany?.name ?? null,
        c.endClientCompany?.kind ?? c.clientCompany?.kind ?? null
      ),
      location: c.workLocation
        ? [c.workLocation.city, c.workLocation.state].filter(Boolean).join(', ')
        : null,
    })),
    completedTraining: profile.person.enrollments.map((e) => ({
      title: e.course.title,
      completedAt: e.completedAt!,
    })),
    verified: [...new Set(
      profile.person.verifications.map((v) => READABLE[v.type]).filter(Boolean)
    )],
  }
}
