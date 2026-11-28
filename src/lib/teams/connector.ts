/**
 * Talking back to Teams: the Bot Connector's REST calls, and the token
 * they need.
 *
 * The bot answers on the serviceUrl the activity came from, with a token
 * Entra issues to our app registration for the Bot Framework. The token
 * is cached until five minutes before it runs out. Every call here
 * returns what happened rather than throwing, so a dead connector is a
 * sentence in a log and the fallback to email, never a 500 to Teams.
 */

import type { TeamsBotConfig } from '@/lib/teams/config'

const SCOPE = 'https://api.botframework.com/.default'

let token: { value: string; until: number; appId: string } | null = null

export async function connectorToken(config: TeamsBotConfig, fetcher: typeof fetch = fetch): Promise<string> {
  if (token && token.appId === config.appId && Date.now() < token.until) return token.value
  const res = await fetcher(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.appId,
      client_secret: config.password,
      scope: SCOPE,
    }).toString(),
  })
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number }
  if (!res.ok || !json.access_token) {
    throw new Error(`Entra refused the bot’s keys (HTTP ${res.status}). Check MICROSOFT_APP_ID, MICROSOFT_APP_PASSWORD and MICROSOFT_APP_TENANT_ID.`)
  }
  token = { value: json.access_token, until: Date.now() + Math.max(60, (json.expires_in ?? 3600) - 300) * 1000, appId: config.appId }
  return token.value
}

/** Only Microsoft's own connector hosts are ever called with our token. */
export function trustedServiceUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && (/\.botframework\.com$/i.test(u.hostname) || /\.teams\.microsoft\.com$/i.test(u.hostname) || /\.botframework\.azure\.us$/i.test(u.hostname))
  } catch {
    return false
  }
}

function base(serviceUrl: string): string {
  return serviceUrl.replace(/\/+$/, '')
}

export type Sent = { ok: true; id: string | null } | { ok: false; why: string }

async function call(
  config: TeamsBotConfig,
  serviceUrl: string,
  path: string,
  init: { method: string; body?: unknown },
  fetcher: typeof fetch = fetch,
): Promise<{ ok: true; json: any } | { ok: false; why: string }> {
  if (!trustedServiceUrl(serviceUrl)) return { ok: false, why: `Not a Microsoft connector address: ${serviceUrl}` }
  try {
    const bearer = await connectorToken(config, fetcher)
    const res = await fetcher(`${base(serviceUrl)}${path}`, {
      method: init.method,
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, why: `Teams answered HTTP ${res.status}` }
    return { ok: true, json }
  } catch (err) {
    return { ok: false, why: err instanceof Error ? err.message : String(err) }
  }
}

/** Post an activity into a conversation. */
export async function sendToConversation(config: TeamsBotConfig, serviceUrl: string, conversationId: string, activity: Record<string, unknown>): Promise<Sent> {
  const out = await call(config, serviceUrl, `/v3/conversations/${encodeURIComponent(conversationId)}/activities`, { method: 'POST', body: activity })
  return out.ok ? { ok: true, id: (out.json?.id as string) ?? null } : out
}

/** Replace a card the bot sent, so an answered card says it was answered. */
export async function updateActivity(config: TeamsBotConfig, serviceUrl: string, conversationId: string, activityId: string, activity: Record<string, unknown>): Promise<Sent> {
  const out = await call(config, serviceUrl, `/v3/conversations/${encodeURIComponent(conversationId)}/activities/${encodeURIComponent(activityId)}`, { method: 'PUT', body: { ...activity, id: activityId } })
  return out.ok ? { ok: true, id: activityId } : out
}

/** The member as Teams knows them: the Entra object id, the sign-in name and the address. */
export interface TeamsMember {
  id: string
  name?: string
  aadObjectId?: string
  email?: string
  userPrincipalName?: string
  tenantId?: string
}

export async function getMember(config: TeamsBotConfig, serviceUrl: string, conversationId: string, memberId: string): Promise<TeamsMember | null> {
  const out = await call(config, serviceUrl, `/v3/conversations/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(memberId)}`, { method: 'GET' })
  return out.ok && out.json?.id ? (out.json as TeamsMember) : null
}

/** Open (or reopen) a one-to-one chat with a person, for a message they did not ask for. */
export async function openPersonalChat(config: TeamsBotConfig, serviceUrl: string, args: { teamsUserId: string; tenantId: string }): Promise<string | null> {
  const out = await call(config, serviceUrl, `/v3/conversations`, {
    method: 'POST',
    body: {
      isGroup: false,
      bot: { id: `28:${config.appId}` },
      members: [{ id: args.teamsUserId }],
      tenantId: args.tenantId,
      channelData: { tenant: { id: args.tenantId } },
    },
  })
  return out.ok ? ((out.json?.id as string) ?? null) : null
}
