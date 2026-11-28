/**
 * A line's paper set, read where the line's work is done.
 *
 * The founder, 2026-11-03: "Especially for the onsite jobs — offshore
 * jobs is fine." The work-authorization paper a start asks for is the
 * work country's (`workAuthorizationFor` in ./countries), read from where
 * the line's work is done (`lib/work-country`). A line whose country
 * nobody can read is asked what it was always asked, the US set: an
 * unknown country is never taken as offshore, because "offshore" is what
 * lets a start go without an I-9.
 *
 * Every reader of a line's set in regulatory's files reads it through
 * here (the start, the chase letters, the worker's own page, the
 * compliance page, the line's set on screen), so an offshore line is
 * asked for no I-9 anywhere and the sentence says why.
 */
import { prisma } from '@/lib/db'
import { requirementsFor, requirementsForLines, type LineRequirements } from '@/lib/document-requirements'
import { workAuthorizationFor, WORK_AUTHORIZATION_TYPES, type WorkAuthorizationRule } from '@/lib/document-stages/countries'
import { lineWorkCountry, workCountryOf, NO_SITE_COUNTRY } from '@/lib/work-country'

/** Where a line's work is done, as the clearance needs it. */
export interface LineWorkCountry {
  country: string
  offshore: boolean
}

/** The work-authorization finding for a line, or null where no country was read. */
export function workAuthorizationOf(workCountry: LineWorkCountry | null | undefined): WorkAuthorizationRule | null {
  return workCountry ? workAuthorizationFor(workCountry.country) : null
}

/** The authorization keys a start does not ask for, for work done in this country. */
export function notAskedHere(workCountry: LineWorkCountry | null | undefined): Set<string> {
  const rule = workAuthorizationOf(workCountry)
  if (!rule) return new Set()
  return new Set(WORK_AUTHORIZATION_TYPES.filter((k) => !rule.keys.includes(k)))
}

/**
 * A line's items with the work-authorization papers the work country does
 * not ask for taken out. Everything else the set asks (the NDA, the
 * background check consent) stays exactly as it was.
 */
export function forWorkCountry<T extends { key: string }>(items: readonly T[], workCountry: LineWorkCountry | null | undefined): T[] {
  const drop = notAskedHere(workCountry)
  return drop.size === 0 ? [...items] : items.filter((i) => !drop.has(i.key))
}

/** A line's set, read where the work is done, with the sentence where nothing is enforced. */
export type SetWhereWorkIsDone = LineRequirements & {
  workCountry: LineWorkCountry | null
  workAuthorization: WorkAuthorizationRule | null
}

/** `requirementsFor`, with the work-authorization papers of the work country. */
export async function requirementsWhereWorkIsDone(
  input: { sellContractId: string; buyContractId?: never } | { buyContractId: string; sellContractId?: never },
  db: typeof prisma = prisma
): Promise<SetWhereWorkIsDone | null> {
  const [set, wc] = await Promise.all([
    requirementsFor(input as Parameters<typeof requirementsFor>[0], db as never),
    lineWorkCountry(input as Parameters<typeof lineWorkCountry>[0], db as never).catch(() => null),
  ])
  if (!set) return null
  const workCountry = wc ? { country: wc.country, offshore: wc.offshore } : null
  return whereWorkIsDone(set, workCountry)
}


/** Where each of these sell lines' work is done, in one read. */
export async function workCountriesForSellLines(
  sellContractIds: readonly string[],
  db: typeof prisma = prisma
): Promise<Map<string, LineWorkCountry>> {
  const ids = [...new Set(sellContractIds.filter(Boolean))]
  if (ids.length === 0) return new Map()
  const rows = await db.sellContract.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      workLocation: { select: { country: true } },
      requirement: { select: { workMode: true, site: { select: { country: true } } } },
      person: { select: { consultant: { select: { country: true } } } },
    },
  })
  return new Map(rows.map((r) => {
    const wc = workCountryOf({
      workMode: r.requirement?.workMode ?? null,
      siteCountry: r.workLocation?.country ?? r.requirement?.site?.country ?? NO_SITE_COUNTRY,
      personCountry: r.person?.consultant?.country ?? null,
    })
    return [r.id, { country: wc.country, offshore: wc.offshore }]
  }))
}

/** `requirementsForLines` for sell lines, each read where its work is done. */
export async function requirementsWhereWorkIsDoneForSellLines(
  sellContractIds: readonly string[],
  db: typeof prisma = prisma
): Promise<Map<string, SetWhereWorkIsDone>> {
  const ids = [...new Set(sellContractIds.filter(Boolean))]
  if (ids.length === 0) return new Map()
  const [sets, countries] = await Promise.all([
    requirementsForLines({ sellContractIds: ids }, db),
    workCountriesForSellLines(ids, db),
  ])
  const out = new Map<string, SetWhereWorkIsDone>()
  for (const [id, set] of sets) {
    const workCountry = countries.get(id) ?? null
    out.set(id, whereWorkIsDone(set, workCountry))
  }
  return out
}

/**
 * A set read where its line's work is done: the authorization papers the
 * country does not ask for taken out, and its sentence at the top of the
 * set where nothing is enforced there, so a screen never shows silently
 * nothing.
 */
export function whereWorkIsDone(set: LineRequirements, workCountry: LineWorkCountry | null): SetWhereWorkIsDone {
  const workAuthorization = workAuthorizationOf(workCountry)
  const says = workAuthorization?.says ? `${set.says} ${workAuthorization.says}`.trim() : set.says
  return { ...set, says, items: forWorkCountry(set.items, workCountry), workCountry, workAuthorization }
}
