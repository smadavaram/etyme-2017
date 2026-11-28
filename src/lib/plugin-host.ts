import { PLUGIN_REGISTRY, PUBLIC_MICRO_SITES, type PluginKey } from './plugin-registry'

/**
 * Plugin sites live on subdomains (record 137, extending 133 and 134).
 *
 *   learn.etyme.com/tapin/x         Etyme's own training subdomain  -> /learn/tapin/x
 *   learn.tapin.etyme.com/x         a tenant's plugin subdomain     -> /learn/tapin/x
 *   learn.talent.firm.example/x     the same label on a tenant's own domain
 *
 * The label is the plugin's micro-site root in the registry ('/learn' ->
 * 'learn'), never a second list. Only the signed-in micro-sites get a label:
 * the Website plugin's site is already the tenant's own address (its root
 * rewrites to /site/<slug> in the middleware), which is the same model.
 *
 * Edge-safe: no database, no server-only import. The middleware reads it.
 *
 * Nothing here changes production today: production runs on
 * etyme2040.vercel.app, which is not under the platform host, so no host
 * there is ever read as a plugin site and the session cookie stays
 * host-only. It turns on when the owner points etyme.com at the project
 * and sets NEXTAUTH_URL to it (record 137, owner-only steps).
 */

export type PluginLabel = { key: PluginKey; label: string; root: string }

/** Every plugin that has a subdomain label, read from the registry. */
export function pluginLabels(): PluginLabel[] {
  return PLUGIN_REGISTRY
    .filter((p) => p.microSite && !PUBLIC_MICRO_SITES.includes(p.key))
    .map((p) => ({ key: p.key, label: (p.microSite as string).replace(/^\//, ''), root: p.microSite as string }))
}

/** Where a plugin host's tenant comes from. CUSTOM needs the database to name a slug, so the edge cannot rewrite it. */
export type PluginTenant =
  | { kind: 'PLATFORM' }
  | { kind: 'SUBDOMAIN'; slug: string }
  | { kind: 'CUSTOM'; domain: string }

export type PluginSite = PluginLabel & { tenant: PluginTenant }

function bare(host: string): string {
  return host.toLowerCase().split(':')[0].replace(/\.$/, '')
}

function isLocalOrHosted(host: string): boolean {
  return host === 'localhost' || host.endsWith('.localhost') || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.endsWith('.vercel.app')
}

/** Which plugin site, and whose, a host names. Null where it names none. */
export function pluginSiteOfHost(rawHost: string, platformHost: string): PluginSite | null {
  const host = bare(rawHost)
  const platform = bare(platformHost)
  const dot = host.indexOf('.')
  if (dot < 1) return null
  const first = host.slice(0, dot)
  const rest = host.slice(dot + 1)
  const plugin = pluginLabels().find((p) => p.label === first)
  if (!plugin) return null
  if (rest === platform) return { ...plugin, tenant: { kind: 'PLATFORM' } }
  if (rest.endsWith(`.${platform}`)) {
    const slug = rest.slice(0, -(platform.length + 1))
    // Only a single label is a tenant, as for a tenant's own address.
    return slug.includes('.') ? null : { ...plugin, tenant: { kind: 'SUBDOMAIN', slug } }
  }
  if (rest.includes('.') && !isLocalOrHosted(rest)) return { ...plugin, tenant: { kind: 'CUSTOM', domain: rest } }
  return null
}

/**
 * The existing path a plugin host's request is served from, or null where the
 * edge cannot name it (a custom domain). A path that already names the site
 * (a link the pages build as /learn/tapin/x) is kept as it is.
 */
export function pluginSitePath(site: PluginSite, path: string): string | null {
  const tail = path === '/' ? '' : path
  const base =
    site.tenant.kind === 'PLATFORM' ? site.root
    : site.tenant.kind === 'SUBDOMAIN' ? `${site.root}/${encodeURIComponent(site.tenant.slug)}`
    : null
  if (base === null) return null
  if (path === base || path.startsWith(`${base}/`)) return path
  if (site.tenant.kind === 'PLATFORM' && (path === site.root || path.startsWith(`${site.root}/`))) return path
  return `${base}${tail}`
}

/** The address of a tenant's plugin site: under its custom domain where given, else under the platform host. Null for a plugin with no label. */
export function pluginSiteUrl(
  key: PluginKey,
  tenant: { slug: string; customDomain?: string | null } | null,
  platformHost: string,
): string | null {
  const plugin = pluginLabels().find((p) => p.key === key)
  if (!plugin) return null
  const under = tenant ? (tenant.customDomain ? bare(tenant.customDomain) : `${tenant.slug}.${bare(platformHost)}`) : bare(platformHost)
  return `https://${plugin.label}.${under}`
}

function hostOf(url: string): string | null {
  try { return new URL(url).hostname.toLowerCase() } catch { return null }
}

/** Whether the configured app address is the platform host or under it, so a plugin subdomain shares its session cookie. */
export function subdomainsShareSession(appUrl: string, platformHost: string): boolean {
  const host = hostOf(appUrl)
  const platform = bare(platformHost)
  return !!host && !!platform && (host === platform || host.endsWith(`.${platform}`))
}

/**
 * The session cookie's domain: the parent of the platform host (".etyme.com")
 * only where the app lives on it or under it; otherwise undefined, and the
 * cookie stays host-only as before (etyme2040.vercel.app, localhost). A
 * tenant's custom domain can never share it; there the existing redirect to
 * the app's own address is the hand-off.
 */
export function sessionCookieDomain(appUrl: string, platformHost: string): string | undefined {
  return subdomainsShareSession(appUrl, platformHost) ? `.${bare(platformHost)}` : undefined
}

/** Where /learnai's links into the course point: the training subdomain once it shares the session, else today's path. */
export function courseEntryHref(appUrl: string, platformHost: string): string {
  const root = pluginLabels().find((p) => p.key === 'TRAIN_TO_BENCH')?.root ?? '/learn'
  return subdomainsShareSession(appUrl, platformHost) ? (pluginSiteUrl('TRAIN_TO_BENCH', null, platformHost) as string) : root
}
