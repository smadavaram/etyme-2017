/**
 * Sites, read from the record and written with who and when.
 *
 * The rules and every sentence are `lib/site-rules`; this file is the
 * database half. Demand's job form and its distribute route call two
 * things here and nothing else:
 *
 *   - `jobSiteDefaults(companyId, locationId)` — the site a job is posted
 *     at (the primary site where none is given) and the suppliers it goes
 *     to by default, with the sentence the form shows;
 *   - `checkSiteSupplier(locationId, supplierId)` — whether a job at the
 *     site may go to that firm, and the refusal where it may not.
 *
 * `approvedSuppliersOf` is the one answer to "is this firm approved for
 * the company", read from the facts the purchase-order picker and the
 * VENDOR_TIER rule already read (`suppliersOf`, `rank`), never a list of
 * its own.
 */

import { prisma } from '@/lib/db'
import { suppliersOf } from '@/lib/suppliers-of'
import { REGION_UNIT_KIND } from '@/lib/region-scope'
import {
  approvedFrom, siteSuppliersFrom, mayFillAtSite, siteManagersFrom, notApprovedForCompany,
  HOLDS_A_SITE, ON_SITE, type SiteSuppliersVerdict, type SiteManager, type SiteSource,
} from '@/lib/site-rules'

export interface Firm { id: string; name: string }

/** The firms approved for this company, by name. */
export async function approvedSuppliersOf(companyId: string): Promise<Firm[]> {
  const trading = (await suppliersOf(companyId)).ids
  const ids = [...trading]
  if (ids.length === 0) return []
  const [register, agreements, firms] = await Promise.all([
    prisma.counterparty.findMany({
      where: { companyId, otherCompanyId: { in: ids }, relationship: { in: ['SUPPLIER', 'PRIME'] } },
      select: { otherCompanyId: true, tier: true },
    }),
    prisma.masterAgreement.findMany({ where: { clientId: companyId, vendorId: { in: ids } }, select: { vendorId: true } }),
    prisma.company.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
  ])
  // The strongest standing on any of the firm's rows, so a prime that is
  // also on the register as a supplier reads as its best.
  const tiers = new Map<string, string | null>()
  const order = ['PROBATION', 'APPROVED', 'PREFERRED']
  for (const r of register) {
    const had = tiers.get(r.otherCompanyId)
    if (had === undefined || order.indexOf(r.tier ?? '') > order.indexOf(had ?? '')) tiers.set(r.otherCompanyId, r.tier)
  }
  const approved = approvedFrom({ trading, tiers, agreements: new Set(agreements.map((a) => a.vendorId)) })
  return firms.filter((f) => approved.has(f.id)).sort((a, b) => a.name.localeCompare(b.name))
}

/** Whether a firm is approved for the company, and the sentence where it is not. */
export async function checkSupplierForCompany(companyId: string, supplierId: string): Promise<{ ok: true } | { ok: false; says: string }> {
  const [approved, firm, client] = await Promise.all([
    approvedSuppliersOf(companyId),
    prisma.company.findUnique({ where: { id: supplierId }, select: { name: true } }),
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
  ])
  if (approved.some((f) => f.id === supplierId)) return { ok: true }
  return { ok: false, says: notApprovedForCompany(firm?.name ?? 'That firm', client?.name ?? 'this company') }
}

interface SiteRow { id: string; companyId: string; name: string; city: string | null }

async function siteRow(locationId: string): Promise<SiteRow | null> {
  return prisma.companyLocation.findUnique({ where: { id: locationId }, select: { id: true, companyId: true, name: true, city: true } })
}

/** The suppliers a job at this site goes to by default, and the firms approved for its company. */
export async function siteSuppliers(locationId: string): Promise<(SiteSuppliersVerdict & { site: SiteRow; approved: Firm[] }) | null> {
  const site = await siteRow(locationId)
  if (!site) return null
  const [approved, named] = await Promise.all([
    approvedSuppliersOf(site.companyId),
    prisma.siteSupplier.findMany({ where: { locationId }, select: { supplierCompanyId: true } }),
  ])
  const verdict = siteSuppliersFrom({ named: named.map((n) => n.supplierCompanyId), approved: new Set(approved.map((f) => f.id)) })
  return { ...verdict, site, approved }
}

/** Whether a job at this site may go to this firm. The refusal names the firm and the site. */
export async function checkSiteSupplier(locationId: string, supplierId: string): Promise<{ ok: true } | { ok: false; says: string }> {
  const at = await siteSuppliers(locationId)
  if (!at) return { ok: false, says: 'That site is not on the record.' }
  const [firm, client] = await Promise.all([
    prisma.company.findUnique({ where: { id: supplierId }, select: { id: true, name: true } }),
    prisma.company.findUnique({ where: { id: at.site.companyId }, select: { name: true } }),
  ])
  return mayFillAtSite({
    supplier: { id: supplierId, name: firm?.name ?? 'That firm' },
    site: at.site,
    client: client?.name ?? 'this company',
    approved: new Set(at.approved.map((f) => f.id)),
    atSite: at,
  })
}

/**
 * Where a job is posted and who it goes to by default. With no site
 * given, the primary site; where the company has no site at all, every
 * approved supplier and no site. The sentence is the one the form shows.
 */
export async function jobSiteDefaults(companyId: string, locationId: string | null | undefined): Promise<{
  site: SiteRow | null
  suppliers: Firm[]
  everyApproved: boolean
  says: string
}> {
  const site = locationId
    ? await prisma.companyLocation.findFirst({ where: { id: locationId, companyId }, select: { id: true, companyId: true, name: true, city: true } })
    : await prisma.companyLocation.findFirst({ where: { companyId, isPrimary: true }, select: { id: true, companyId: true, name: true, city: true } })
  if (!site) {
    const all = await approvedSuppliersOf(companyId)
    return { site: null, suppliers: all, everyApproved: true, says: 'No site is set up, so the job goes to every approved supplier.' }
  }
  const at = (await siteSuppliers(site.id))!
  const byId = new Map(at.approved.map((f) => [f.id, f]))
  const suppliers = at.ids.map((id) => byId.get(id)!).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name))
  const n = suppliers.length
  const says = at.everyApproved
    ? `${site.name} names no suppliers yet, so the job goes to every approved supplier.`
    : `${n} ${n === 1 ? 'supplier is' : 'suppliers are'} approved at ${site.name}.`
  return { site, suppliers, everyApproved: at.everyApproved, says: locationId ? says : `No site was picked, so the job is posted at ${site.name}. ${says}` }
}

// ── The screen's read ────────────────────────────────────────────────

export interface SiteView {
  id: string
  name: string
  address: string | null
  city: string | null
  state: string | null
  country: string
  timeZone: string | null
  region: string | null
  isPrimary: boolean
  isRemote: boolean
  source: SiteSource
  recordedBy: string | null
  recordedAt: Date | null
  contractors: number
  /** Placements that hold the site: a start on hold included. */
  placements: number
  managers: SiteManager[]
  /** Firms named here, in name order. */
  suppliers: { id: string; name: string; source: SiteSource; lapsed: boolean }[]
  everyApproved: boolean
}

export interface SitesRead {
  sites: SiteView[]
  /** The company's approved suppliers: what the ticks are drawn from. */
  approved: Firm[]
  /** Region label → the person whose seat reads it. */
  regionalManagers: Record<string, string>
}

/**
 * Every site of a company, with its managers, suppliers and contractors,
 * in one pass: five reads however many sites. `siteIds` narrows it to a
 * region seat's sites (lib/region-scope); absent, every site.
 */
export async function sitesOf(companyId: string, siteIds?: readonly string[]): Promise<SitesRead> {
  const where = { companyId, ...(siteIds ? { id: { in: [...siteIds] } } : {}) }
  const rows = await prisma.companyLocation.findMany({
    where,
    orderBy: [{ region: 'asc' }, { isPrimary: 'desc' }, { name: 'asc' }],
    select: {
      id: true, name: true, address: true, city: true, state: true, country: true, timeZone: true, region: true,
      isPrimary: true, isRemote: true, source: true, recordedAt: true, recordedBy: { select: { name: true } },
      suppliers: { select: { supplierCompanyId: true, source: true, supplierCompany: { select: { name: true } } } },
      hiringManagers: { select: { personId: true, person: { select: { name: true } } } },
    },
  })
  const ids = rows.map((r) => r.id)
  const [approved, jobs, lines, regionSeats] = await Promise.all([
    approvedSuppliersOf(companyId),
    prisma.requirement.findMany({
      where: { companyId, locationId: { in: ids }, archivedAt: null },
      select: {
        locationId: true, status: true,
        owner: { select: { id: true, name: true } }, raisedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.sellContract.findMany({
      where: { clientCompanyId: companyId, workLocationId: { in: ids }, state: { in: HOLDS_A_SITE as never } },
      select: { workLocationId: true, state: true, hiringManager: { select: { id: true, name: true } } },
    }),
    prisma.context.findMany({
      where: { companyId, revokedAt: null, orgUnit: { kind: REGION_UNIT_KIND } },
      orderBy: { grantedAt: 'asc' },
      select: { person: { select: { name: true } }, orgUnit: { select: { name: true } } },
    }),
  ])
  const approvedIds = new Set(approved.map((f) => f.id))
  const regionalManagers: Record<string, string> = {}
  for (const s of regionSeats) if (s.orgUnit && !regionalManagers[s.orgUnit.name]) regionalManagers[s.orgUnit.name] = s.person.name

  const sites: SiteView[] = rows.map((r) => {
    const myJobs = jobs.filter((j) => j.locationId === r.id)
    const myLines = lines.filter((l) => l.workLocationId === r.id)
    const onSite = myLines.filter((l) => ON_SITE.includes(l.state))
    const managers = siteManagersFrom({
      jobs: myJobs.flatMap((j) => {
        const who = j.owner ?? j.raisedBy
        return who ? [{ personId: who.id, name: who.name, open: j.status === 'OPEN' }] : []
      }),
      placements: onSite.flatMap((l) => (l.hiringManager ? [{ personId: l.hiringManager.id, name: l.hiringManager.name }] : [])),
      named: r.hiringManagers.map((h) => ({ personId: h.personId, name: h.person.name })),
    })
    const verdict = siteSuppliersFrom({ named: r.suppliers.map((s) => s.supplierCompanyId), approved: approvedIds })
    return {
      id: r.id, name: r.name, address: r.address, city: r.city, state: r.state, country: r.country,
      timeZone: r.timeZone, region: r.region, isPrimary: r.isPrimary, isRemote: r.isRemote,
      source: r.source as SiteSource, recordedBy: r.recordedBy?.name ?? null, recordedAt: r.recordedAt,
      contractors: onSite.length, placements: myLines.length, managers,
      suppliers: r.suppliers
        .map((s) => ({ id: s.supplierCompanyId, name: s.supplierCompany.name, source: s.source as SiteSource, lapsed: verdict.lapsed.includes(s.supplierCompanyId) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      everyApproved: verdict.everyApproved,
    }
  })
  return { sites, approved, regionalManagers }
}

// ── Writing ──────────────────────────────────────────────────────────

/**
 * Set the firms a site names, all at once, as the ticks on the screen
 * read. Every firm must be approved for the company; the first that is
 * not is refused in a sentence and nothing is written. A firm already
 * named keeps who named it and when; a new one is named by `byId` now.
 */
export async function setSiteSuppliers(
  locationId: string,
  supplierIds: readonly string[],
  byId: string,
): Promise<{ ok: true; named: number } | { ok: false; says: string }> {
  const site = await siteRow(locationId)
  if (!site) return { ok: false, says: 'That site is not on the record.' }
  const wanted = [...new Set(supplierIds)]
  const approved = new Set((await approvedSuppliersOf(site.companyId)).map((f) => f.id))
  const stranger = wanted.find((id) => !approved.has(id))
  if (stranger) {
    const [firm, client] = await Promise.all([
      prisma.company.findUnique({ where: { id: stranger }, select: { name: true } }),
      prisma.company.findUnique({ where: { id: site.companyId }, select: { name: true } }),
    ])
    return { ok: false, says: notApprovedForCompany(firm?.name ?? 'That firm', client?.name ?? 'this company') }
  }
  await prisma.$transaction([
    prisma.siteSupplier.deleteMany({ where: { locationId, supplierCompanyId: { notIn: wanted } } }),
    prisma.siteSupplier.createMany({
      data: wanted.map((supplierCompanyId) => ({ locationId, supplierCompanyId, namedById: byId, source: 'PERSON' as const })),
      skipDuplicates: true,
    }),
  ])
  return { ok: true, named: wanted.length }
}

/** How many placements hold a site, and how many past ones were at it. */
export async function placementsAt(locationId: string): Promise<{ live: number; past: number }> {
  const [live, all] = await Promise.all([
    prisma.sellContract.count({ where: { workLocationId: locationId, state: { in: HOLDS_A_SITE as never } } }),
    prisma.sellContract.count({ where: { workLocationId: locationId } }),
  ])
  return { live, past: all - live }
}
