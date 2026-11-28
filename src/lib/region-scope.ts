import { prisma } from '@/lib/db'
import { descendants } from '@/lib/org-tree'

/**
 * A seat that reads one region of a client's program, and nothing else.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * The founder, 2026-10-27, "go ahead and build this", on the region map:
 * a client with plants in eight countries has a regional manager who
 * answers for the hiring managers in one region, and who has no business
 * reading another region's contractors, rates or weeks. "Nothing a
 * regional manager reads crosses regions" (CLAUDE.md).
 *
 * ── The shape, and where each half lives ─────────────────────────────
 *
 *   - A site carries its region as a plain label: `CompanyLocation.region`
 *     ("United States", "Latin America", "Vietnam").
 *   - The region is an org unit of kind REGION, named with the same label,
 *     and each plant is a unit of kind SITE under it. A job request is
 *     charged to its plant's unit (`Requirement.orgUnitId`), because a job
 *     request has no site column; a contract names its site
 *     (`SellContract.workLocationId`).
 *   - A seat is a region seat when its `Context.orgUnitId` is a REGION
 *     unit. The scope is then the sites carrying that unit's name, and the
 *     unit with everything under it.
 *
 * ── Fail closed, twice ───────────────────────────────────────────────
 *
 * The label joins the unit to its sites, and a label can drift: somebody
 * renames "Latin America" to "LATAM" on the unit and not on the sites.
 * Then the seat reads no site at all — never every site. A unit at
 * another company than the one being read is the same: an empty scope.
 *
 * And no route reads a region seat unless it says it narrows to a
 * region. `getCallerContext(request, { narrowsToRegion: true })` is that
 * declaration, made by the route that applies the fragments below; every
 * other route refuses a region seat in a sentence before it reads
 * anything (`regionDoor`). A route that forgot is a refusal, never a leak.
 *
 * Pure apart from `regionScopeFor`, which is the one read.
 */

/** The org unit kind that makes a seat a region seat. */
export const REGION_UNIT_KIND = 'REGION'
/** The org unit kind of a plant under a region. Read nowhere as a scope of its own. */
export const SITE_UNIT_KIND = 'SITE'

export interface RegionScope {
  /** The REGION unit the seat sits on. */
  unitId: string
  /** Its name, which is the label on its sites. */
  label: string
  /** The region unit and every unit under it: where its plants' job requests are charged. */
  unitIds: string[]
  /** The sites carrying the label. Empty means the seat reads nothing. */
  siteIds: string[]
}

interface UnitRow { id: string; parentId: string | null; name: string; kind: string; companyId: string }
interface SiteRow { id: string; region: string | null }

/**
 * The scope for a seat sitting on `unit`, or null where it is not a
 * region seat at all (no unit, or a unit of any other kind).
 *
 * `companyId` is the company being read. A REGION unit belonging to
 * another company reads nothing here.
 */
export function regionScopeFrom(input: {
  companyId: string
  unit: UnitRow | null
  units: readonly { id: string; parentId: string | null }[]
  sites: readonly SiteRow[]
}): RegionScope | null {
  const { unit } = input
  if (!unit || unit.kind !== REGION_UNIT_KIND) return null
  if (unit.companyId !== input.companyId) {
    return { unitId: unit.id, label: unit.name, unitIds: [], siteIds: [] }
  }
  return {
    unitId: unit.id,
    label: unit.name,
    unitIds: descendants(input.units, unit.id),
    siteIds: input.sites.filter((s) => s.region !== null && s.region === unit.name).map((s) => s.id),
  }
}

/**
 * The scope of a seat on `orgUnitId` at `companyId`, read from the
 * database: one read of the unit, one of the company's units, one of its
 * sites. Null where the seat is not a region seat.
 *
 * For a client's own seat, `companyId` is the client and `orgUnitId` is
 * `caller.orgUnitId`. For a program office in a seat the client granted
 * on a region unit, `companyId` is the client and `orgUnitId` is the
 * seat's.
 */
export async function regionScopeFor(companyId: string, orgUnitId: string | null | undefined): Promise<RegionScope | null> {
  if (!orgUnitId) return null
  const unit = await prisma.orgUnit.findUnique({
    where: { id: orgUnitId },
    select: { id: true, parentId: true, name: true, kind: true, companyId: true },
  })
  if (!unit || unit.kind !== REGION_UNIT_KIND) return null
  const [units, sites] = await Promise.all([
    prisma.orgUnit.findMany({ where: { companyId }, select: { id: true, parentId: true } }),
    prisma.companyLocation.findMany({ where: { companyId, region: unit.name }, select: { id: true, region: true } }),
  ])
  return regionScopeFrom({ companyId, unit, units, sites })
}

// ── What a route spreads into its query ─────────────────────────────
//
// Each is the scope as a Prisma `where` fragment for one model, so the
// rule is written once and the reads cannot drift apart. `andAll` in
// lib/walls joins them with whatever else a route already filters on.

/** Contracts at the region's sites. */
export function regionContracts(scope: RegionScope): { workLocationId: { in: string[] } } {
  return { workLocationId: { in: scope.siteIds } }
}

/** Job requests charged to the region or a plant under it. */
export function regionRequirements(scope: RegionScope): { orgUnitId: { in: string[] } } {
  return { orgUnitId: { in: scope.unitIds } }
}

/** Weeks filed on a contract at the region's sites. */
export function regionTimesheets(scope: RegionScope) {
  return { sellContract: regionContracts(scope) }
}

/** Invoice receipts with a line on a contract at the region's sites. */
export function regionReceipts(scope: RegionScope) {
  return { invoiceLines: { some: { sellContract: regionContracts(scope) } } }
}

// ── The door ─────────────────────────────────────────────────────────

/**
 * What a region seat may open without the route saying anything: who the
 * seat is, the demo door, and the setup check the shell asks on every
 * page. None of them reads another person's data.
 */
export const REGION_SHELL_READS: readonly string[] = ['me', 'me/context', 'onboarding/setup', 'demo']

export type RegionVerdict =
  | { open: true }
  | { open: false; says: string }

/**
 * Whether a region seat may open this route.
 *
 * Open where the seat is not a region seat, where the request is not an
 * API route, where the route is one of the shell's own reads, and where
 * the route said it narrows to a region. Refused everywhere else, in a
 * sentence that names the region and the page, and says where the seat's
 * own list is.
 */
export function regionDoor(ask: {
  path: string
  region: { label: string } | null | undefined
  /** The route applies the region scope to every read it makes. */
  narrows: boolean
  /** The page the route serves, in the reader's words, where one is known. */
  pageName?: string | null
}): RegionVerdict {
  if (!ask.region) return { open: true }
  const path = ask.path.replace(/\/$/, '')
  if (!/^\/api(\/|$)/.test(path)) return { open: true }
  if (ask.narrows) return { open: true }
  const route = path.replace(/^\/api\/?/, '')
  if (REGION_SHELL_READS.includes(route)) return { open: true }
  return { open: false, says: regionRefusal(ask.region.label, ask.pageName ?? null) }
}

/** The sentence a region seat reads on a page that does not narrow to its region. */
export function regionRefusal(label: string, pageName: string | null): string {
  const what = pageName ? `${pageName} reads every region` : 'This page reads every region'
  return `${what}, and your seat reads ${label} only. Open By region on Today for ${label}.`
}
