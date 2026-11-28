import { sealingKey } from './sealed'
import { redirectUri } from './google'
import type { EntraOutcome } from './outcome'
import type { DirectoryPerson } from './csv'

/**
 * Microsoft Entra ID as the directory, read only (CLAUDE.md, "Team
 * structure is one tree the Owner draws", 2026-11-09). The pattern is the
 * Google connection's, with one difference Microsoft's model makes: Etyme
 * is one multitenant app, and the client's own IT admin grants it the
 * application permission User.Read.All for their tenant, once, on
 * Microsoft's admin-consent screen. Etyme then asks Microsoft for an
 * app-only token for that tenant (client credentials) each time it reads.
 *
 * So nothing secret is kept per company: the DirectoryConnection holds the
 * tenant id and the verified domain, and the app's own secret lives only
 * in the deployment's environment. Every call is `fetch`; no new
 * dependency. Nothing is ever written to the directory.
 *
 * Off unless the deployment holds the app's id and secret, the key that
 * signs the consent's state, and the switch ETYME_DIRECTORY_LIVE=1, which
 * waits for the founder's yes on the privacy notice and DPA line.
 */

export const ENTRA_PERMISSION = 'User.Read.All'
export const ENTRA_LOGIN = 'https://login.microsoftonline.com'
export const GRAPH_DEFAULT_SCOPE = 'https://graph.microsoft.com/.default'

type Env = Record<string, string | undefined>
type Fetch = typeof fetch

export interface EntraReadiness {
  ready: boolean
  /** Plain words, never a setting's name: what this deployment still lacks. */
  missing: string[]
}

export function entraReadiness(env: Env = process.env): EntraReadiness {
  const missing: string[] = []
  if (!(env.ETYME_DIRECTORY_ENTRA_CLIENT_ID && env.ETYME_DIRECTORY_ENTRA_CLIENT_SECRET)) missing.push('Etyme has not turned on Microsoft Entra ID here')
  if (!sealingKey(env)) missing.push('the key that signs the connection is not set')
  if (env.ETYME_DIRECTORY_LIVE !== '1') missing.push('directory connections are not turned on yet, because the privacy notice that names them is waiting for approval')
  return { ready: missing.length === 0, missing }
}

/** A refusal from Microsoft's side, with the code the callback sends back to the screen. */
export class EntraSays extends Error {
  constructor(readonly code: EntraOutcome, says: string) {
    super(says)
  }
}

const TENANT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A Microsoft tenant id: a GUID, nothing else. */
export function isTenantId(s: string | null | undefined): s is string {
  return typeof s === 'string' && TENANT_ID.test(s)
}

/**
 * The admin-consent screen's address. The verified domain stands in the
 * path, so Microsoft opens the consent in the tenant that holds that
 * domain and no other; the redirect is this app's own directory route.
 */
export function adminConsentUrl(p: { clientId: string; origin: string; state: string; domain: string }): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    scope: GRAPH_DEFAULT_SCOPE,
    redirect_uri: redirectUri(p.origin),
    state: p.state,
  })
  return `${ENTRA_LOGIN}/${encodeURIComponent(p.domain)}/v2.0/adminconsent?${q.toString()}`
}

/**
 * The tenant that holds a domain, read from Microsoft's public sign-in
 * metadata for that domain (no permission needed, nothing about anybody
 * read). Microsoft resolves only a domain a tenant has verified, so this
 * is how Etyme knows the tenant that consented is the one that holds the
 * company's domain.
 */
export async function tenantForDomain(domain: string, f: Fetch = fetch): Promise<string> {
  const res = await f(`${ENTRA_LOGIN}/${encodeURIComponent(domain)}/v2.0/.well-known/openid-configuration`)
  const j: any = await res.json().catch(() => null)
  const m = typeof j?.issuer === 'string' ? j.issuer.match(/^https:\/\/login\.microsoftonline\.com\/([0-9a-f-]{36})\/v2\.0\/?$/i) : null
  if (!res.ok || !m || !isTenantId(m[1])) {
    throw new EntraSays('tenant', `Microsoft does not know ${domain} as a verified domain of any organization. Add and verify ${domain} in your Microsoft 365 admin center, then connect again.`)
  }
  return m[1].toLowerCase()
}

/** Only the connected domain's people: a connection reads its verified domain and nothing beside it. */
export function onlyDomain(people: DirectoryPerson[], domain: string): DirectoryPerson[] {
  const at = `@${domain.toLowerCase()}`
  return people
    .filter((p) => p.email.toLowerCase().endsWith(at))
    .map((p) => (p.manager && !p.manager.toLowerCase().endsWith(at) ? { ...p, manager: null } : p))
}
