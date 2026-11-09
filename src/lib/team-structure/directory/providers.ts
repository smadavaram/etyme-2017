import type { DirectoryPerson } from './csv'

/**
 * Microsoft Entra ID and Google Workspace, read as the directory, read
 * only, with nothing but `fetch` (no new dependency). Each is behind a
 * connection the client's own IT admin approves once; until that approval
 * exists on this deployment the source says "not connected" and what the
 * admin has to approve, and nothing is read.
 *
 * What is not built, said once: where a company's approval is kept. The
 * Entra app's admin consent belongs to the client's tenant, and the
 * Google service account's domain-wide delegation to the client's domain;
 * neither has a column on the record yet, so no company can be connected
 * from the screen today. The readers are here so the connection is a
 * column and a consent screen away, not a rewrite.
 */

export type SourceKey = 'ENTRA' | 'GOOGLE' | 'CSV'

export interface SourceState {
  key: SourceKey
  label: string
  says: string
  connected: boolean
  /** What the client's IT admin approves before the source can be read. */
  adminApproves: string | null
}

/** The three sources and their state on this deployment, for one company. */
export function directorySources(env: Record<string, string | undefined> = process.env): SourceState[] {
  const entraApp = Boolean(env.ETYME_DIRECTORY_ENTRA_CLIENT_ID && env.ETYME_DIRECTORY_ENTRA_CLIENT_SECRET)
  const googleApp = Boolean(env.ETYME_DIRECTORY_GOOGLE_SERVICE_ACCOUNT)
  return [
    {
      key: 'ENTRA',
      label: 'Microsoft Entra ID',
      says: 'Active Directory in the cloud. Your admin approves read-only access once.',
      connected: false,
      adminApproves: entraApp
        ? 'Your Microsoft 365 admin grants Etyme the application permission User.Read.All (read every user’s profile, read only) with admin consent for your tenant. Etyme reads names, email, department, job title, office, country and manager, and writes nothing.'
        : 'Not set up on this deployment yet. Once it is, your Microsoft 365 admin grants Etyme the application permission User.Read.All (read only) with admin consent for your tenant.',
    },
    {
      key: 'GOOGLE',
      label: 'Google Workspace',
      says: 'The Google directory. Your admin approves read-only access once.',
      connected: false,
      adminApproves: googleApp
        ? 'Your Google Workspace super admin allows Etyme’s service account the scope admin.directory.user.readonly (read only) under domain-wide delegation. Etyme reads names, email, department, job title, office, country and manager, and writes nothing.'
        : 'Not set up on this deployment yet. Once it is, your Google Workspace super admin allows the scope admin.directory.user.readonly (read only) for Etyme.',
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

/** Every user in the Workspace, page by page, given a token with admin.directory.user.readonly. */
export async function readGoogle(token: string, f: Fetch = fetch, maxPages = 50): Promise<DirectoryPerson[]> {
  const out: DirectoryPerson[] = []
  let pageToken: string | null = null
  for (let page = 0; page < maxPages; page++) {
    const res: Response = await f(pageToken ? `${GOOGLE_USERS}&pageToken=${encodeURIComponent(pageToken)}` : GOOGLE_USERS, { headers: { authorization: `Bearer ${token}` } })
    const j: any = await res.json().catch(() => null)
    if (!res.ok) throw new Error('Google refused to read your directory. Ask your super admin whether admin.directory.user.readonly was allowed for Etyme.')
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
