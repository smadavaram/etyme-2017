/**
 * Reads and writes a company's own model routes. Only the reference to a
 * key is ever stored; there is no column that could hold a value.
 */
import { prisma } from '@/lib/db'
import { routeAsModel, type CleanRoute, type RouteRow } from './tenant-routes'
import type { RegisteredModel } from './register'

const SELECT = { tier: true, label: true, adapter: true, modelId: true, region: true, dpaSignedOn: true, keyRef: true, allowPlatformFallback: true, enabled: true } as const

/** The company's routes, only while it is on the Enterprise edition. A lapsed edition reads none. */
export async function readTenantRoutes(companyId: string): Promise<{ rows: RouteRow[]; models: RegisteredModel[] }> {
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { edition: true } })
  if (c?.edition !== 'ENTERPRISE') return { rows: [], models: [] }
  const rows = await prisma.tenantModelRoute.findMany({ where: { companyId, enabled: true }, select: SELECT, orderBy: { setAt: 'asc' } })
  return { rows, models: rows.map(routeAsModel).filter((m): m is RegisteredModel => m !== null) }
}

export async function saveTenantRoute(companyId: string, personId: string, r: CleanRoute) {
  const data = {
    label: r.label, adapter: r.adapter, region: r.region, keyRef: r.keyRef, allowPlatformFallback: r.allowPlatformFallback,
    dpaSignedOn: r.dpaSignedOn ? new Date(r.dpaSignedOn) : null, enabled: true, setByPersonId: personId, setAt: new Date(),
  }
  return prisma.tenantModelRoute.upsert({
    where: { companyId_tier_modelId: { companyId, tier: r.tier, modelId: r.modelId } },
    create: { companyId, tier: r.tier, modelId: r.modelId, ...data }, update: data, select: { id: true },
  })
}
