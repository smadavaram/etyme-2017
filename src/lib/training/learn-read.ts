import { prisma } from '@/lib/db'
import { lookFor, type SiteLook } from '@/lib/public-site/site-look'
import { learnOpen } from './learn-gate'

export interface LearnTenant { id: string; name: string; slug: string; look: SiteLook }

/**
 * The firm a learning address belongs to, with its own saved branding (as
 * the Owner approved it, never corrected). Null where the firm does not
 * exist or its plugin is off: the two read the same.
 */
export async function learnTenant(slug: string): Promise<LearnTenant | null> {
  const c = await prisma.company.findFirst({
    where: { OR: [{ slug }, { subdomainAliases: { some: { subdomain: slug } } }] },
    select: {
      id: true, name: true, slug: true, pluginsOn: true,
      siteTemplate: true, siteLogoRef: true, sitePrimaryColor: true, siteSecondaryColor: true, siteFontPairing: true,
      sitePages: true, siteBrandingApprovedAt: true, siteBrandingApprovedHash: true,
    },
  })
  if (!c || !learnOpen(c)) return null
  return { id: c.id, name: c.name, slug: c.slug, look: lookFor(c) }
}
