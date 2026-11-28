import { prisma } from '@/lib/db'
import { isOn } from '@/lib/plugins'
import type { PluginKey } from '@/lib/plugin-registry'

/**
 * The one reader behind a plugin's signed-in micro-site (records 133, 134):
 * the firm a site address belongs to, or null where the firm does not exist
 * or its plugin is off. The two read the same, so a visitor learns nothing
 * about a firm. The site shows no data of its own: every screen asks the
 * plugin's own routes, which keep the seat's permissions and the gate.
 */
export async function pluginSiteTenant(key: PluginKey, slug: string): Promise<{ id: string; name: string; slug: string } | null> {
  const c = await prisma.company.findFirst({
    where: { OR: [{ slug }, { subdomainAliases: { some: { subdomain: slug } } }] },
    select: { id: true, name: true, slug: true, pluginsOn: true },
  })
  if (!c || !isOn(c.pluginsOn, key)) return null
  return { id: c.id, name: c.name, slug: c.slug }
}
