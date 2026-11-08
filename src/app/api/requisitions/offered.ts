import { approvedSuppliersOf, siteSuppliers } from '@/lib/sites'

/**
 * The firms a job may go to, read once for the edit form's ticks, the
 * edit's narrow-only check and the job page's "Goes to … once approved":
 * the suppliers its site sends to, or every approved supplier where the
 * job names no site or the site names nobody. A prime's copy of a client's
 * job carries the client's site, whose list is not the prime's, so it is
 * read as having no site.
 */
export async function offeredFor(job: { companyId: string; locationId: string | null }): Promise<{
  offered: { id: string; name: string }[]
  everyApproved: boolean
  site: { name: string; city: string | null } | null
}> {
  const here = job.locationId ? await siteSuppliers(job.locationId) : null
  if (here && here.site.companyId === job.companyId) {
    const ids = new Set(here.ids)
    return {
      offered: here.approved.filter((f) => ids.has(f.id)),
      everyApproved: here.everyApproved,
      site: { name: here.site.name, city: here.site.city ?? null },
    }
  }
  return { offered: await approvedSuppliersOf(job.companyId), everyApproved: true, site: null }
}
