/**
 * The country a job's work is done in, and whether it is offshore.
 *
 * Decided by the founder, 2026-11-03 ("Work authorization is checked where
 * the work is done"): *"Especially for the onsite jobs — offshore jobs is
 * fine."* So the question is never "is this person authorized" in the
 * abstract; it is "authorized where this job's work is done". Three rules:
 *
 *  1. An onsite or hybrid job is done in its site's country. A job whose
 *     work mode nobody set reads as onsite.
 *  2. A remote job is done in the country the person works from, where
 *     the record knows it. Where it does not, it reads as the site's
 *     country: an unknown country is never assumed to be offshore, because
 *     "offshore" is what lets a start go without a US I-9.
 *  3. A remote job worked from the site's own country is onsite for this
 *     purpose: remote from Austin for a client in Ohio is US work.
 *
 * `offshore` is true only when the work country differs from the site's.
 * The pure rule is `workCountryOf`; the two readers fetch the three facts
 * (`Requirement.workMode`, the site's `CompanyLocation.country`,
 * `ConsultantProfile.country`) and call it. Nothing here decides what a
 * start needs in a country: that set is regulatory's, confirmed with a
 * source before it is enforced.
 */
import type { Prisma, PrismaClient } from '@prisma/client'

type Db = PrismaClient | Prisma.TransactionClient

/** Where no site is named, the site's country reads as the US: the
 *  column's own default (`CompanyLocation.country`). The reader says so
 *  through `siteKnown`, so a screen never states it as a fact. */
export const NO_SITE_COUNTRY = 'US'

/** Which fact the work country was read from. */
export type WorkCountryBasis =
  /** Onsite, hybrid, or no work mode: the site's country. */
  | 'SITE'
  /** Remote, from the country the person works from. */
  | 'PERSON'
  /** Remote, and nobody recorded where the person works from. */
  | 'SITE_DEFAULT'

export type WorkCountry = {
  /** ISO 3166 alpha-2, upper case. */
  country: string
  /** True only when the work is done outside the site's country. */
  offshore: boolean
  basis: WorkCountryBasis
}

export type WorkCountryFacts = {
  /** ONSITE · HYBRID · REMOTE, or null where the job did not say. */
  workMode: string | null | undefined
  /** The job's or the line's site country. */
  siteCountry: string
  /** The country the person works from, where known. */
  personCountry?: string | null
}

function code(country: string | null | undefined): string | null {
  const c = (country ?? '').trim().toUpperCase()
  return c.length > 0 ? c : null
}

/** The founder's three rules, with no database in it. */
export function workCountryOf(facts: WorkCountryFacts): WorkCountry {
  const site = code(facts.siteCountry) ?? NO_SITE_COUNTRY
  const mode = (facts.workMode ?? '').trim().toUpperCase()
  if (mode !== 'REMOTE') return { country: site, offshore: false, basis: 'SITE' }
  const person = code(facts.personCountry)
  if (!person) return { country: site, offshore: false, basis: 'SITE_DEFAULT' }
  return { country: person, offshore: person !== site, basis: 'PERSON' }
}

/** A reader's answer: the rule's, and whether a site was named at all. */
export type ReadWorkCountry = WorkCountry & {
  /** False where no site was named and the US default stood in. */
  siteKnown: boolean
}

/**
 * A job request's work country. A job has no person yet, so a remote job
 * reads as the site's country unless the caller passes the person it is
 * asking about (a put-forward, an interview). Null where the job does not
 * exist.
 */
export async function jobWorkCountry(
  requirementId: string,
  db: Db,
  opts: { personId?: string | null } = {},
): Promise<ReadWorkCountry | null> {
  const job = await db.requirement.findUnique({
    where: { id: requirementId },
    select: { workMode: true, site: { select: { country: true } } },
  })
  if (!job) return null
  const personCountry = opts.personId ? await personCountryOf(opts.personId, db) : null
  const siteCountry = job.site?.country ?? null
  return {
    ...workCountryOf({ workMode: job.workMode, siteCountry: siteCountry ?? NO_SITE_COUNTRY, personCountry }),
    siteKnown: siteCountry !== null,
  }
}

const SELL_SELECT = {
  workLocation: { select: { country: true } },
  requirement: { select: { workMode: true, site: { select: { country: true } } } },
  person: { select: { consultant: { select: { country: true } } } },
} as const

/**
 * A line's work country. A sell line reads its own site, then its job's
 * site; its job's work mode; and its person's country. A buy line reads
 * the sell line it funds (`sellLinks[0].sellContract`, as
 * lib/document-requirements does), because the work is done at the sell
 * line's site whoever pays for it. Null where the line does not exist or
 * a buy line funds no sell line.
 */
export async function lineWorkCountry(
  line: { sellContractId: string } | { buyContractId: string },
  db: Db,
): Promise<ReadWorkCountry | null> {
  let sell: {
    workLocation: { country: string } | null
    requirement: { workMode: string | null; site: { country: string } | null } | null
    person: { consultant: { country: string | null } | null } | null
  } | null = null
  if ('sellContractId' in line) {
    sell = await db.sellContract.findUnique({ where: { id: line.sellContractId }, select: SELL_SELECT })
  } else {
    const buy = await db.buyContract.findUnique({
      where: { id: line.buyContractId },
      select: { sellLinks: { select: { sellContract: { select: SELL_SELECT } }, take: 1 } },
    })
    sell = buy?.sellLinks[0]?.sellContract ?? null
  }
  if (!sell) return null
  const siteCountry = sell.workLocation?.country ?? sell.requirement?.site?.country ?? null
  return {
    ...workCountryOf({
      workMode: sell.requirement?.workMode ?? null,
      siteCountry: siteCountry ?? NO_SITE_COUNTRY,
      personCountry: sell.person?.consultant?.country ?? null,
    }),
    siteKnown: siteCountry !== null,
  }
}

async function personCountryOf(personId: string, db: Db): Promise<string | null> {
  const profile = await db.consultantProfile.findUnique({ where: { personId }, select: { country: true } })
  return profile?.country ?? null
}
