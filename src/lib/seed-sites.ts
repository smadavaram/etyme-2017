/**
 * The three client programs' sites: their primary site names the
 * suppliers already approved for them, and their jobs name the site.
 *
 * Settings → Sites (founder, 2026-10-28) on a seeded client must never
 * read empty: Corvane's 31 plants are written with their suppliers in
 * lib/seed-corvane, and Northbend, Cavanaugh and Talvern each work at
 * one site. So, per program client:
 *
 *   - its primary site, which lib/seed-standing reads off its own jobs;
 *     where that step found none, the program's own town;
 *   - its jobs in that town name the site by id (`Requirement.locationId`),
 *     so the hiring managers are read from the jobs they posted rather
 *     than typed in (lib/site-rules);
 *   - every supplier approved for it (`approvedSuppliersOf` in lib/sites,
 *     the same answer the screen ticks from) named at that site, by the
 *     program's Procurement seat.
 *
 * Bulk writes with duplicates skipped: a second seeding writes nothing.
 */

import { prisma as db } from '@/lib/db'
import { PROGRAMMES } from '@/lib/seed-programmes'
import { approvedSuppliersOf } from '@/lib/sites'

interface Ctx { domain: string; prefix: string }

export async function seedProgramSites(ctx: Ctx): Promise<{ sites: number; named: number }> {
  let sites = 0
  let named = 0
  for (const p of PROGRAMMES) {
    const slug = ctx.prefix + p.client
    const co = await db.company.findUnique({ where: { slug }, select: { id: true } })
    if (!co) continue
    const [city, state] = p.loc.split(',').map((x) => x.trim())
    let site = await db.companyLocation.findFirst({ where: { companyId: co.id, isPrimary: true }, select: { id: true, city: true } })
    if (!site) {
      site = await db.companyLocation.create({
        data: { companyId: co.id, name: `${city} site`, city, state: state ?? null, country: 'US', isPrimary: true },
        select: { id: true, city: true },
      })
      sites++
    }
    const town = site.city ?? city
    await db.requirement.updateMany({
      where: { companyId: co.id, locationId: null, location: { startsWith: town } },
      data: { locationId: site.id },
    })
    const procurement = await db.person.findUnique({ where: { primaryEmail: `${slug}-procurement@${ctx.domain}` }, select: { id: true } })
    const approved = await approvedSuppliersOf(co.id)
    const written = await db.siteSupplier.createMany({
      data: approved.map((f) => ({ locationId: site!.id, supplierCompanyId: f.id, source: 'PERSON' as const, namedById: procurement?.id ?? null })),
      skipDuplicates: true,
    })
    named += written.count
  }
  return { sites, named }
}
