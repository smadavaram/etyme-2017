import type { CallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { descendants } from '@/lib/org-tree'
import { regionScopeFor, SITE_UNIT_KIND, type RegionScope } from '@/lib/region-scope'

/**
 * How much of a client's program this reader's own seat reaches, where
 * its seat sits on a region or a plant.
 *
 * The founder, 2026-10-27, on the region map: three seats read one
 * record at three altitudes. A head of operations or a CFO sits on no
 * unit and reads every plant. A regional manager sits on a REGION unit
 * and reads that region's plants only (`lib/region-scope`, the
 * architect's). A hiring manager sits on a SITE unit, and their first
 * screen is their plant: "Only this plant is on this page."
 *
 * The plant is the same shape as the region, one level down: the sites
 * whose name is the unit's name, and the unit with everything under it.
 * So the architect's where-fragments (`regionContracts`,
 * `regionRequirements`, `regionTimesheets`, `regionReceipts`) apply to
 * either, and a route narrows both the same way.
 *
 * Fail closed, as the region does: a renamed plant reads no site, never
 * every site, and a seat at another company than the program being read
 * reads nothing.
 *
 * Null where the reader's seat reaches the whole program: no unit, a unit
 * of any other kind, or a reader who is not the client's own seat (a
 * program office in a granted seat is narrowed by its seat's own unit
 * wall, `unitsReachedBy`).
 */
export interface ReaderScope {
  kind: 'REGION' | 'SITE'
  /** The region's label, or the plant's name. */
  label: string
  scope: RegionScope
}

export async function readerScope(caller: CallerContext, clientId: string): Promise<ReaderScope | null> {
  const own = caller.company?.id === clientId
  if (caller.region) {
    // A region seat always narrows. Reading another company's program
    // from it is an empty scope, never the whole of it.
    const scope = own ? await regionScopeFor(clientId, caller.region.unitId) : null
    return {
      kind: 'REGION',
      label: caller.region.label,
      scope: scope ?? { unitId: caller.region.unitId, label: caller.region.label, unitIds: [], siteIds: [] },
    }
  }
  if (!own || !caller.orgUnitId) return null
  const unit = await prisma.orgUnit.findUnique({
    where: { id: caller.orgUnitId },
    select: { id: true, name: true, kind: true, companyId: true },
  })
  if (!unit || unit.kind !== SITE_UNIT_KIND) return null
  return { kind: 'SITE', label: unit.name, scope: await plantScope(clientId, unit) }
}

/** The sites named for a plant unit, and the unit with what is under it. */
async function plantScope(
  clientId: string,
  unit: { id: string; name: string; companyId: string }
): Promise<RegionScope> {
  if (unit.companyId !== clientId) return { unitId: unit.id, label: unit.name, unitIds: [], siteIds: [] }
  const [units, sites] = await Promise.all([
    prisma.orgUnit.findMany({ where: { companyId: clientId }, select: { id: true, parentId: true } }),
    prisma.companyLocation.findMany({ where: { companyId: clientId, name: unit.name }, select: { id: true } }),
  ])
  return { unitId: unit.id, label: unit.name, unitIds: descendants(units, unit.id), siteIds: sites.map((s) => s.id) }
}
