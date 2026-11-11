import type { DirectoryPerson } from './csv'
import { googleReadiness, GOOGLE_DIRECTORY } from './google'

/**
 * Microsoft Entra ID and Google Workspace, read as the directory, read
 * only, with nothing but `fetch` (no new dependency). Each is behind a
 * connection the client's own IT admin approves once; until that approval
 * exists on this deployment the source says "not connected" and what the
 * admin has to approve, and nothing is read.
 *
 * Google Workspace connects from the screen (2026-11-11): the company's
 * Workspace administrator allows one read-only scope on Google's consent
 * screen, and the consent is kept per company as a DirectoryConnection
 * with the refresh token sealed (./google, ./sealed). Entra ID is not
 * built: its admin consent has nowhere to be kept yet, so it stays
 * "not connected".
 */

export type SourceKey = 'ENTRA' | 'GOOGLE' | 'CSV'

export interface SourceState {
  key: SourceKey
  label: string
  says: string
  connected: boolean
  /** What the client's IT admin approves before the source can be read. */
  adminApproves: string | null
  /** Google only: this deployment can connect it from the screen now. */
  connectable?: boolean
  /** Google only: the company's connection, where one is kept. Never the token. */
  connection?: GoogleConnectionView | null
}

/** What the card says about a kept connection. The token is never part of it. */
export interface GoogleConnectionView {
  domain: string
  connectedBy: string | null
  connectedAt: string
  lastReadAt: string | null
  lastReadCount: number | null
}

/** The three sources and their state on this deployment, for one company. */
export function directorySources(env: Record<string, string | undefined> = process.env, google: GoogleConnectionView | null = null): SourceState[] {
  const entraApp = Boolean(env.ETYME_DIRECTORY_ENTRA_CLIENT_ID && env.ETYME_DIRECTORY_ENTRA_CLIENT_SECRET)
  const g = googleReadiness(env)
  const googleConnected = g.ready && Boolean(google)
  return [
    {
      key: 'ENTRA',
      label: 'Microsoft Entra ID',
      says: 'Active Directory in the cloud. Your admin approves read-only access once.',
      connected: false,
      adminApproves: entraApp
        ? 'Your Microsoft 365 admin grants Etyme the application permission User.Read.All (read every user’s profile, read only) with admin consent for your tenant. Etyme reads names, email, department, job title, office, country and manager, and writes nothing.'
        : 'Not set up on this deployment yet: Etyme has not turned on Microsoft Entra ID here. Once it does, your Microsoft 365 admin approves read-only access to your users once.',
    },
    {
      key: 'GOOGLE',
      label: 'Google Workspace',
      says: googleConnected ? `Connected for ${google!.domain}. Read only.` : 'The Google directory. Your admin approves read-only access once.',
      connected: googleConnected,
      connectable: g.ready && !google,
      connection: google,
      adminApproves: googleConnected
        ? null
        : g.ready
          ? 'A Google Workspace administrator who can see users (a super admin can) presses Connect, signs in to Google, and allows Etyme to see the users on your domain, read only. Etyme reads names, email, department, job title, office, country and manager, and writes nothing.'
          // The switch is said as it is (a privacy notice waiting is a
          // reason a client can read); the app registration and the
          // sealing key are Etyme's own plumbing and are never named.
          : `Not set up on this deployment yet: ${g.missing.find((m) => m.startsWith('directory connections')) ?? 'Etyme has not turned on Google Workspace here'}. Once it is, your Google Workspace administrator connects it here and allows Etyme to see your users, read only.`,
    },
    {
      key: 'CSV',
      label: 'A file from Active Directory',
      says: 'An export from Active Directory on your own servers (CSV).',
      connected: true,
      adminApproves: null,
    },
  ]
}

// ── Microsoft Entra ID, through Microsoft Graph ───────────────────────

export const GRAPH_USERS =
  'https://graph.microsoft.com/v1.0/users?$select=displayName,mail,userPrincipalName,department,jobTitle,officeLocation,country&$expand=manager($select=mail,userPrincipalName)&$top=999'

type Fetch = typeof fetch

/** An app-only token for a tenant that granted admin consent (client credentials). */
export async function entraToken(c: { tenantId: string; clientId: string; clientSecret: string }, f: Fetch = fetch): Promise<string> {
  const res = await f(`https://login.microsoftonline.com/${encodeURIComponent(c.tenantId)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
  })
  const j: any = await res.json().catch(() => null)
  if (!res.ok || !j?.access_token) throw new Error('Microsoft did not give Etyme access to your directory. Ask your admin to grant admin consent for User.Read.All.')
  return j.access_token as string
}

/** Every user in the tenant, page by page, as the directory's people. */
export async function readEntra(token: string, f: Fetch = fetch, maxPages = 50): Promise<DirectoryPerson[]> {
  const out: DirectoryPerson[] = []
  let url: string | null = GRAPH_USERS
  for (let page = 0; url && page < maxPages; page++) {
    const res: Response = await f(url, { headers: { authorization: `Bearer ${token}` } })
    const j: any = await res.json().catch(() => null)
    if (!res.ok) throw new Error('Microsoft refused to read your directory. Ask your admin whether User.Read.All was granted with admin consent.')
    for (const u of j?.value ?? []) {
      const email = String(u.mail ?? u.userPrincipalName ?? '').toLowerCase()
      if (!email.includes('@')) continue
      const boss = String(u.manager?.mail ?? u.manager?.userPrincipalName ?? '').toLowerCase()
      out.push({
        name: u.displayName ?? email, email,
        department: u.department ?? null, manager: boss.includes('@') ? boss : null,
        officeLocation: u.officeLocation ?? null, country: u.country ?? null, jobTitle: u.jobTitle ?? null,
      })
    }
    url = typeof j?.['@odata.nextLink'] === 'string' ? j['@odata.nextLink'] : null
  }
  return out
}

// ── Google Workspace, through the Admin SDK Directory API ─────────────

export const GOOGLE_USERS = 'https://admin.googleapis.com/admin/directory/v1/users?customer=my_customer&projection=full&maxResults=500'

/** The users list for one domain only, where a connection names it. */
export function googleUsersUrl(domain: string | null): string {
  return domain ? `${GOOGLE_DIRECTORY}?domain=${encodeURIComponent(domain)}&projection=full&maxResults=500` : GOOGLE_USERS
}

/**
 * Every user in the Workspace, page by page, given a token with
 * admin.directory.user.readonly. With a domain, only that domain's users:
 * a connection reads the company's verified domain and nothing beside it.
 */
export async function readGoogle(token: string, f: Fetch = fetch, maxPages = 50, domain: string | null = null): Promise<DirectoryPerson[]> {
  const out: DirectoryPerson[] = []
  const base = googleUsersUrl(domain)
  let pageToken: string | null = null
  for (let page = 0; page < maxPages; page++) {
    const res: Response = await f(pageToken ? `${base}&pageToken=${encodeURIComponent(pageToken)}` : base, { headers: { authorization: `Bearer ${token}` } })
    const j: any = await res.json().catch(() => null)
    if (!res.ok) throw new Error('Google refused to read your directory. Ask your Google super admin whether Etyme was allowed to see your users.')
    for (const u of j?.users ?? []) {
      const email = String(u.primaryEmail ?? '').toLowerCase()
      if (!email.includes('@')) continue
      const org = (u.organizations ?? []).find((o: any) => o.primary) ?? u.organizations?.[0] ?? {}
      const boss = String((u.relations ?? []).find((r: any) => r.type === 'manager')?.value ?? '').toLowerCase()
      const where = (u.locations ?? [])[0] ?? {}
      const address = (u.addresses ?? []).find((a: any) => a.primary) ?? u.addresses?.[0] ?? {}
      out.push({
        name: u.name?.fullName ?? email, email,
        department: org.department ?? null, manager: boss.includes('@') ? boss : null,
        officeLocation: where.buildingId ?? org.location ?? null, country: address.countryCode ?? address.country ?? null, jobTitle: org.title ?? null,
      })
    }
    pageToken = typeof j?.nextPageToken === 'string' ? j.nextPageToken : null
    if (!pageToken) break
  }
  return out
}
