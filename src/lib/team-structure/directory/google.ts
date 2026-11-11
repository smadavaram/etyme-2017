import { sealingKey } from './sealed'
import type { GoogleOutcome } from './outcome'

/**
 * Google Workspace, connected by the company's own Workspace administrator
 * through Google's consent screen (founder, 2026-11-11: "Yes"). One scope,
 * read only: admin.directory.user.readonly. Nothing else is asked for: no
 * sign-in profile, no mail, no drive, no groups. Every call is `fetch`
 * against Google's REST endpoints; no new dependency.
 *
 * Off unless the deployment holds the Google app's id and secret, the key
 * the refresh token is sealed with, and the switch ETYME_DIRECTORY_LIVE=1,
 * which waits for the founder's yes on the privacy notice and DPA line.
 * What is missing is said in plain words to the Owner and the Admin, and
 * no setting's name is ever shown on a screen.
 */

export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/admin.directory.user.readonly'
export const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
export const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token'
export const GOOGLE_REVOKE = 'https://oauth2.googleapis.com/revoke'
export const GOOGLE_DIRECTORY = 'https://admin.googleapis.com/admin/directory/v1/users'

type Env = Record<string, string | undefined>
type Fetch = typeof fetch

export interface GoogleReadiness {
  ready: boolean
  /** Plain words, never a setting's name: what this deployment still lacks. */
  missing: string[]
}

export function googleReadiness(env: Env = process.env): GoogleReadiness {
  const missing: string[] = []
  if (!(env.ETYME_DIRECTORY_GOOGLE_CLIENT_ID && env.ETYME_DIRECTORY_GOOGLE_CLIENT_SECRET)) missing.push('Etyme’s Google app is not registered on this deployment')
  if (!sealingKey(env)) missing.push('the key that locks the stored access is not set')
  if (env.ETYME_DIRECTORY_LIVE !== '1') missing.push('directory connections are not turned on yet, because the privacy notice that names them is waiting for approval')
  return { ready: missing.length === 0, missing }
}

/** Where Google sends the administrator back: this app's own directory route, on this app's own address. */
export function redirectUri(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/api/settings/team-structure/directory`
}

/** The consent screen's address: one read-only scope, offline so a refresh token comes back, the domain as a hint. */
export function consentUrl(p: { clientId: string; origin: string; state: string; domain: string }): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: redirectUri(p.origin),
    response_type: 'code',
    scope: GOOGLE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state: p.state,
    hd: p.domain,
  })
  return `${GOOGLE_AUTH}?${q.toString()}`
}

/** A refusal from Google's side, with the code the callback sends back to the screen. */
export class GoogleSays extends Error {
  constructor(readonly code: GoogleOutcome, says: string) {
    super(says)
  }
}

/** The code Google sent back, traded for tokens. Refused unless exactly the one read-only scope came back with a refresh token. */
export async function exchangeCode(
  p: { code: string; clientId: string; clientSecret: string; origin: string },
  f: Fetch = fetch,
): Promise<{ accessToken: string; refreshToken: string; scope: string }> {
  const res = await f(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: p.code, client_id: p.clientId, client_secret: p.clientSecret, redirect_uri: redirectUri(p.origin), grant_type: 'authorization_code' }),
  })
  const j: any = await res.json().catch(() => null)
  if (!res.ok || typeof j?.access_token !== 'string') throw new GoogleSays('exchange', 'Google did not complete the connection. Start again from Connect.')
  const scopes = String(j.scope ?? '').split(/\s+/).filter(Boolean)
  if (scopes.length !== 1 || scopes[0] !== GOOGLE_SCOPE) {
    await revoke(j.refresh_token ?? j.access_token, f)
    throw new GoogleSays('scope', 'Google granted something other than read-only access to users, so Etyme kept nothing. Start again and allow only "See info about users on your domain".')
  }
  if (typeof j.refresh_token !== 'string' || !j.refresh_token) {
    await revoke(j.access_token, f)
    throw new GoogleSays('no-refresh', 'Google gave no lasting access, so nothing was kept. Start again from Connect.')
  }
  return { accessToken: j.access_token, refreshToken: j.refresh_token, scope: scopes[0] }
}

/**
 * The Workspace holds this domain: one user is read with the domain named,
 * and Google refuses a domain the Workspace does not hold. Returns
 * Google's customer id where it says one.
 */
export async function proveDomain(accessToken: string, domain: string, f: Fetch = fetch): Promise<{ customerId: string | null }> {
  const url = `${GOOGLE_DIRECTORY}?${new URLSearchParams({ domain, maxResults: '1', fields: 'users(customerId)' }).toString()}`
  const res = await f(url, { headers: { authorization: `Bearer ${accessToken}` } })
  const j: any = await res.json().catch(() => null)
  if (!res.ok) throw new GoogleSays('workspace', `Google says the account that allowed access cannot read users in ${domain}. Sign in to Google as an administrator of the Workspace that holds ${domain}.`)
  const id = j?.users?.[0]?.customerId
  return { customerId: typeof id === 'string' ? id : null }
}

/** A fresh access token from the sealed refresh token's plain value. */
export async function accessTokenFrom(p: { refreshToken: string; clientId: string; clientSecret: string }, f: Fetch = fetch): Promise<string> {
  const res = await f(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: p.refreshToken, client_id: p.clientId, client_secret: p.clientSecret, grant_type: 'refresh_token' }),
  })
  const j: any = await res.json().catch(() => null)
  if (!res.ok || typeof j?.access_token !== 'string') throw new GoogleSays('exchange', 'Google no longer gives Etyme access to your directory. Disconnect, then connect again as a Workspace administrator.')
  return j.access_token
}

/** Ask Google to forget a token. Best effort: a failure here never keeps a token Etyme was asked to drop. */
export async function revoke(token: string | null | undefined, f: Fetch = fetch): Promise<boolean> {
  if (!token) return false
  try {
    const res = await f(GOOGLE_REVOKE, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }) })
    return res.ok
  } catch {
    return false
  }
}
