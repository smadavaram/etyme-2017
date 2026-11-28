/**
 * The Teams bot's three keys, named once.
 *
 * The bot is Door 1 of the job twin (CLAUDE.md, "The job twin"): a route
 * inside this app, not a second service. It needs the Entra app
 * registration's id, its client secret and the tenant it was registered
 * in. All three, or the bot is off — and an off bot refuses every post in
 * a sentence, the way the inbound email route does with no signing
 * secret, rather than trusting a request it cannot check.
 *
 * Read on every call rather than at import, so a key added in Vercel
 * takes effect on the next request and a test can switch it off.
 */

export const TEAMS_BOT_ENV = {
  appId: 'MICROSOFT_APP_ID',
  password: 'MICROSOFT_APP_PASSWORD',
  tenantId: 'MICROSOFT_APP_TENANT_ID',
} as const

export interface TeamsBotConfig {
  appId: string
  password: string
  tenantId: string
}

/** The keys, or null where any one is missing. Never logs a value. */
export function teamsBotConfig(env: Record<string, string | undefined> = process.env): TeamsBotConfig | null {
  const appId = env[TEAMS_BOT_ENV.appId]?.trim()
  const password = env[TEAMS_BOT_ENV.password]?.trim()
  const tenantId = env[TEAMS_BOT_ENV.tenantId]?.trim()
  if (!appId || !password || !tenantId) return null
  return { appId, password, tenantId }
}

/** Which of the three are missing, by name, for the refusal and for /ready. */
export function missingTeamsKeys(env: Record<string, string | undefined> = process.env): string[] {
  return Object.values(TEAMS_BOT_ENV).filter((name) => !env[name]?.trim())
}

/** What a post is told when the bot has no keys. Names the keys, never a value. */
export function teamsBotOffSentence(missing: readonly string[]): string {
  const names = missing.length ? missing.join(', ') : Object.values(TEAMS_BOT_ENV).join(', ')
  return (
    `The Etyme bot for Teams is switched off on this deployment, so nothing sent here is read. ` +
    `Set ${names} in the deployment’s settings to turn it on (docs/teams-setup.md).`
  )
}
