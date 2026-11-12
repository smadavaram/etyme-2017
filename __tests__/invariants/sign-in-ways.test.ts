import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const read = (p: string) => readFileSync(join(__dirname, '../..', p), 'utf8')

/**
 * A sign-in button that cannot work is worse than a missing one.
 *
 * The Microsoft button used to render while the Azure provider was
 * commented out of the config. An enterprise user — the population this
 * product exists for — clicked it and landed on an error page, with no way
 * to tell whether they were locked out or the product was broken.
 *
 * These tests hold the rule in both directions: a way in appears when its
 * credentials do, and does not when they do not.
 *
 * The password door (2026-10-08) has no credentials of its own and is
 * always registered, so "nothing" below means nothing but it.
 */

const KEYS = [
  'AZURE_AD_CLIENT_ID',
  'AZURE_AD_CLIENT_SECRET',
  'AZURE_AD_TENANT_ID',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'EMAIL_SERVER',
  'EMAIL_FROM',
  'RESEND_API_KEY',
  'SENDGRID_API_KEY',
  'NOTIFY_FROM_EMAIL',
]

let saved: Record<string, string | undefined> = {}

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
  for (const k of KEYS) delete process.env[k]
})

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

async function providerIds(): Promise<string[]> {
  const mod = await import('@/lib/auth')
  return mod.configuredProviders().map((p: any) => p.id).filter((id: string) => id !== 'credentials')
}

describe('which ways in are offered', () => {
  it('offers no identity provider when no credentials are set, and the password door all the same', async () => {
    expect(await providerIds()).toEqual([])
    const mod = await import('@/lib/auth')
    // The password door, and the company directory's door (2026-11-11), which needs no key: it spends a ticket /api/sso/callback set.
    expect(mod.configuredProviders().map((p: any) => p.options?.id ?? p.id)).toEqual(['credentials', 'directory-oidc'])
  })

  it('offers Microsoft only when both the client id and the secret are set', async () => {
    process.env.AZURE_AD_CLIENT_ID = 'id'
    expect(await providerIds()).toEqual([])

    process.env.AZURE_AD_CLIENT_SECRET = 'secret'
    expect(await providerIds()).toContain('azure-ad')
  })

  it('offers Google only when both the client id and the secret are set', async () => {
    process.env.GOOGLE_CLIENT_SECRET = 'secret'
    expect(await providerIds()).toEqual([])

    process.env.GOOGLE_CLIENT_ID = 'id'
    expect(await providerIds()).toContain('google')
  })

  it('setting EMAIL_SERVER registers no emailed-link door, because without a database adapter that door refuses every sign-in through every door', async () => {
    expect(await providerIds()).not.toContain('email')

    process.env.EMAIL_SERVER = 'smtp://mail.example.com'
    expect(await providerIds()).not.toContain('email')
    const mod = await import('@/lib/readiness')
    expect(mod.emailLinkDoorOn({ EMAIL_SERVER: 'smtp://mail.example.com' })).toBe(false)
  })

  it('/ready tells the founder to set RESEND_API_KEY and NOTIFY_FROM_EMAIL for sign-in emails, never EMAIL_SERVER', async () => {
    const src = (await import('node:fs')).readFileSync('src/lib/readiness.ts', 'utf8')
    const advice = src.slice(src.indexOf("key: 'signin'"), src.indexOf('// ── A company that is not us'))
    expect(advice).not.toContain('EMAIL_SERVER')
    expect(advice).toContain('RESEND_API_KEY and NOTIFY_FROM_EMAIL')
  })

  it('lets an enterprise sign in from any Microsoft tenant, not one', async () => {
    process.env.AZURE_AD_CLIENT_ID = 'id'
    process.env.AZURE_AD_CLIENT_SECRET = 'secret'
    const mod = await import('@/lib/auth')
    const azure: any = mod.configuredProviders().find((p: any) => p.id === 'azure-ad')
    // Talvern Medical and Northbend Athletic are different tenants and both must get in.
    expect(azure.options?.tenantId ?? 'common').toBe('common')
  })

  it('offers Microsoft and Google when both are set up, and still no emailed-link door beside them', async () => {
    process.env.AZURE_AD_CLIENT_ID = 'id'
    process.env.AZURE_AD_CLIENT_SECRET = 'secret'
    process.env.GOOGLE_CLIENT_ID = 'id'
    process.env.GOOGLE_CLIENT_SECRET = 'secret'
    process.env.EMAIL_SERVER = 'smtp://mail.example.com'
    expect((await providerIds()).sort()).toEqual(['azure-ad', 'google'])
  })
})

describe('which senders can actually deliver', () => {
  async function status() {
    const mod = await import('@/lib/senders')
    return mod.senderStatus()
  }

  async function channels() {
    const mod = await import('@/lib/senders')
    return mod.configuredSenders().map((s) => s.channel)
  }

  it('reports email as not set up when there is no key', async () => {
    const email = (await status()).find((s) => s.channel === 'EMAIL')!
    expect(email.configured).toBe(false)
    expect(email.note).toMatch(/RESEND_API_KEY/)
  })

  it('does not count email as a sender when only the from address is set', async () => {
    process.env.NOTIFY_FROM_EMAIL = 'noreply@etyme.com'
    expect(await channels()).not.toContain('EMAIL')
  })

  it('does not count email as a sender when only the key is set', async () => {
    process.env.RESEND_API_KEY = 'key'
    expect(await channels()).not.toContain('EMAIL')
  })

  it('counts email as a sender when the key and the from address are both set', async () => {
    process.env.RESEND_API_KEY = 'key'
    process.env.NOTIFY_FROM_EMAIL = 'noreply@etyme.com'
    expect(await channels()).toContain('EMAIL')
  })

  it('accepts SendGrid in place of Resend', async () => {
    process.env.SENDGRID_API_KEY = 'key'
    process.env.NOTIFY_FROM_EMAIL = 'noreply@etyme.com'
    expect(await channels()).toContain('EMAIL')
  })

  it('always has a Teams sender, because the webhook belongs to the company and not the deployment', async () => {
    expect(await channels()).toContain('TEAMS')
  })
})

describe('Microsoft and Google, the alternative on both doors (founder, 2026-10-16)', () => {
  it('the sign-up page offers Microsoft and Google only when their keys are set', async () => {
    const { companyAccounts } = await import('@/lib/login-doors')
    // The list comes from NextAuth, which lists a provider only when its keys are set.
    expect(companyAccounts(new Set(['credentials']))).toEqual([])
    expect(companyAccounts(null)).toEqual([])
    expect(companyAccounts(new Set(['credentials', 'azure-ad', 'google']))).toEqual(['Microsoft', 'Google'])
    const doors = read('src/app/(auth)/account-doors.tsx')
    expect(doors).toContain('if (companyAccounts(available).length === 0) return null')
    expect(doors).toContain("offers(available, 'azure-ad') ? 'microsoft' : null")
    expect(doors).toContain("offers(available, 'google') ? 'google' : null")
    const form = read('src/app/(auth)/signup/form.tsx')
    expect(form).toContain('const available = useKnownDoors()')
    expect(form).toContain('{!claimToken && <AccountDoors available={available} callbackUrl="/start" />}')
    // No sentence about missing keys on sign-up.
    expect(form).not.toContain('not set up on this deployment')
  })

  it('the sign-in page and the sign-up page draw the same Microsoft and Google buttons through one shared press', () => {
    // Since 2026-11-12 the sign-in page draws Google above the password
    // (lib/login-doors orderDoors); the sign-up page keeps its form first.
    const login = read('src/app/(auth)/login/page.tsx')
    const form = read('src/app/(auth)/signup/form.tsx')
    for (const page of [login, form]) {
      expect(page).toContain("from '../account-doors'")
      expect(page).not.toContain("signIn('azure-ad'")
      expect(page).not.toContain("signIn('google'")
    }
    expect(login).toContain('<AccountDoorButton door={d}')
    expect(form.indexOf('</form>')).toBeLessThan(form.indexOf('<AccountDoors'))
    const doors = read('src/app/(auth)/account-doors.tsx')
    expect(doors).toContain('void signIn(providerOf(door), { callbackUrl }, chooserFor(email))')
    expect(doors).toContain('Continue with Microsoft')
    expect(doors).toContain('Continue with Google')
  })

  it('a Google sign-in is refused where Google has not confirmed the email, because the email is who the session is', async () => {
    const { oauthRefusal } = await import('@/lib/auth')
    expect(oauthRefusal('google', { email_verified: true }, 'sharath@etyme.com')).toBeNull()
    expect(oauthRefusal('google', { email_verified: false }, 'sharath@etyme.com')).toBe('EmailNotVerified')
    expect(oauthRefusal('google', {}, 'sharath@etyme.com')).toBe('EmailNotVerified')
    expect(oauthRefusal('google', { email_verified: true }, null)).toBe('NoEmail')
  })

  it('a Microsoft sign-in is refused where the email is missing or its domain owner is unverified', async () => {
    const { oauthRefusal } = await import('@/lib/auth')
    expect(oauthRefusal('azure-ad', { xms_edov: true }, 'dana@kestrelworks.test')).toBeNull()
    expect(oauthRefusal('azure-ad', {}, 'dana@kestrelworks.test')).toBeNull()
    expect(oauthRefusal('azure-ad', { xms_edov: false }, 'dana@kestrelworks.test')).toBe('EmailNotVerified')
    expect(oauthRefusal('azure-ad', {}, undefined)).toBe('NoEmail')
    // The password door is judged by its own lock, not this one.
    expect(oauthRefusal('credentials', {}, null)).toBeNull()
  })

  it('a refused Microsoft or Google sign-in comes back to the sign-in page with a sentence, never a code', async () => {
    const { signInRefusal } = await import('@/lib/login-doors')
    expect(signInRefusal('EmailNotVerified')).toContain('has not confirmed that email address')
    expect(signInRefusal('NoEmail')).toContain('did not share an email address')
    expect(signInRefusal('OAuthCallback')).toBe('That sign-in did not finish. Try again.')
    expect(signInRefusal(null)).toBeNull()
    expect(read('src/lib/auth.ts')).toContain('if (refused) return `/login?error=${refused}`')
  })

  it('a session carries one spelling of the email, so Sharath@Etyme.com and sharath@etyme.com are one person', async () => {
    const { sessionEmail, authOptions } = await import('@/lib/auth')
    expect(sessionEmail(' Sharath@Etyme.com ')).toBe('sharath@etyme.com')
    // The sign-in callback reads the session version first and hands it on (fault 4).
    const token = await authOptions.callbacks!.jwt!({ token: {}, user: { id: 'g-1', email: 'Sharath@Etyme.com', sv: 0 } } as any)
    expect(token.email).toBe('sharath@etyme.com')
    expect(read('src/lib/api-context.ts')).toContain('const email = session.user.email.trim().toLowerCase()')
  })
})

describe('every sign-in door shows the account chooser (founder, 2026-10-20)', () => {
  const chooserOn = async (id: string) => {
    const mod = await import('@/lib/auth')
    const p: any = mod.configuredProviders().find((x: any) => x.id === id)
    return p?.options?.authorization?.params?.prompt
  }

  it('the Google door always shows the account chooser, so somebody signed in to a personal Gmail can pick their work account', async () => {
    process.env.GOOGLE_CLIENT_ID = 'g'
    process.env.GOOGLE_CLIENT_SECRET = 'g'
    expect(await chooserOn('google')).toBe('select_account')
    // The button asks for it too, so a sign-in started anywhere shows it.
    expect(read('src/app/(auth)/account-doors.tsx')).toContain('void signIn(providerOf(door), { callbackUrl }, chooserFor(email))')
    const { CHOOSE_ACCOUNT, chooserFor } = await import('@/lib/login-doors')
    expect(CHOOSE_ACCOUNT.prompt).toBe('select_account')
    expect(chooserFor('sharath@etyme.com')).toEqual({ prompt: 'select_account', login_hint: 'sharath@etyme.com' })
    expect(chooserFor('')).toEqual({ prompt: 'select_account' })
  })

  it('the Microsoft door always shows the account chooser, so somebody signed in to a personal Microsoft account can pick their work account', async () => {
    process.env.AZURE_AD_CLIENT_ID = 'm'
    process.env.AZURE_AD_CLIENT_SECRET = 'm'
    expect(await chooserOn('azure-ad')).toBe('select_account')
    const { providerOf } = await import('@/lib/login-doors')
    expect(providerOf('microsoft')).toBe('azure-ad')
    expect(read('src/app/(auth)/account-doors.tsx')).toContain('void signIn(providerOf(door), { callbackUrl }, chooserFor(email))')
  })

  it('the first screen after sign-in says who you are signed in as and offers another account', async () => {
    const { signedInAsSays, ANOTHER_ACCOUNT, AFTER_ANOTHER_ACCOUNT } = await import('@/lib/login-doors')
    expect(signedInAsSays('sharath@gmail.com')).toBe('You are signed in as sharath@gmail.com.')
    expect(signedInAsSays(null)).toBeNull()
    expect(ANOTHER_ACCOUNT).toBe('Not you? Use another account')
    const line = read('src/app/(auth)/another-account.tsx')
    // It signs the person out and reopens the sign-in page, where the chooser shows.
    expect(line).toContain('signOut({ callbackUrl: AFTER_ANOTHER_ACCOUNT })')
    expect(AFTER_ANOTHER_ACCOUNT).toBe('/login?another=1')
    expect(read('src/app/(auth)/start/page.tsx')).toMatch(/<AnotherAccount[ \/]/)
  })

  it('the sign-in page offers a signed-in browser Continue as and Use another account, and says so after signing out for one', async () => {
    // Since 2026-11-12 the sign-in page draws one card for a signed-in
    // browser, never the line beside a form (fault 2).
    const page = read('src/app/(auth)/login/page.tsx')
    expect(page).not.toMatch(/<AnotherAccount[ \/]/)
    expect(page).toContain('{continueAs(signedIn)}')
    expect(page).toContain('signOut({ callbackUrl: AFTER_ANOTHER_ACCOUNT })')
    expect(page).toContain("params.get('another') === '1'")
    const { PICK_ANOTHER_ACCOUNT } = await import('@/lib/login-doors')
    expect(PICK_ANOTHER_ACCOUNT).toMatch(/^You are signed out\. Sign in with the account you want\./)
  })
})

describe('a sign-in is given time to finish, and a failure says why to staff (fault 3, 2026-11-12)', () => {
  const KEYS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'AZURE_AD_CLIENT_ID', 'AZURE_AD_CLIENT_SECRET', 'LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET']
  let saved: Record<string, string | undefined> = {}
  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
    for (const k of KEYS) process.env[k] = 'k'
  })
  afterEach(() => {
    for (const k of KEYS) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]))
  })
  const timeoutOf = async (id: string) => {
    const mod = await import('@/lib/auth')
    const p: any = mod.configuredProviders().find((x: any) => x.id === id)
    return p?.options?.httpOptions?.timeout ?? p?.httpOptions?.timeout
  }

  it('a Google sign-in is given ten seconds, not three and a half, to finish talking to Google', async () => {
    const { OAUTH_HTTP_TIMEOUT_MS } = await import('@/lib/auth')
    expect(OAUTH_HTTP_TIMEOUT_MS).toBe(10_000)
    expect(await timeoutOf('google')).toBe(10_000)
  })

  it('the Microsoft and LinkedIn sign-ins get the same ten seconds', async () => {
    expect(await timeoutOf('azure-ad')).toBe(10_000)
    expect(await timeoutOf('linkedin')).toBe(10_000)
  })

  it('a company directory’s calls wait the same ten seconds', () => {
    expect(read('src/lib/identity/directory.ts')).toContain('signal: AbortSignal.timeout(OAUTH_HTTP_TIMEOUT_MS)')
    expect(read('src/lib/identity/directory.ts')).not.toContain('AbortSignal.timeout(5000)')
  })

  it('the sign-in route and the directory’s two routes are given thirty seconds by the host', () => {
    for (const f of ['src/app/api/auth/[...nextauth]/route.ts', 'src/app/api/sso/callback/route.ts', 'src/app/api/sso/start/route.ts']) {
      expect(read(f), f).toContain('export const maxDuration = 30')
    }
  })

  it('a failed provider callback is written to the incident log with the provider and the reason, and with no token, code or address in it', async () => {
    const { signInFailureReport } = await import('@/lib/auth')
    const timedOut = signInFailureReport('OAUTH_CALLBACK_ERROR', { error: { message: 'outgoing request timed out after 3500ms' }, providerId: 'google' })
    expect(timedOut).toEqual({ place: 'Sign-in did not finish (OAUTH_CALLBACK_ERROR, google)', message: 'outgoing request timed out after 3500ms' })
    const leaky = signInFailureReport('OAUTH_CALLBACK_ERROR', {
      providerId: 'google',
      message: 'invalid_grant for sharath@etyme.com code 4/0AeanS0ZxQb8wYk3pQm1TzLr9vUu2cXyHq state eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0',
    })
    expect(leaky.message).toContain('invalid_grant')
    expect(leaky.message).toContain('[address at etyme.com]')
    expect(leaky.message).not.toContain('sharath@')
    expect(leaky.message).not.toContain('4/0AeanS0ZxQb8wYk3pQm1TzLr9vUu2cXyHq')
    expect(leaky.message).not.toContain('eyJhbGciOiJkaXIi')
    expect(signInFailureReport('SIGNIN_OAUTH_ERROR', new Error('state cookie was missing')).message).toBe('state cookie was missing')
  })

  it('NextAuth’s own errors go to the incident log through reportError, never a token beside them', () => {
    const src = read('src/lib/auth.ts')
    expect(src).toContain('const r = signInFailureReport(String(code), metadata)')
    expect(src).toContain('reportError(r.place, r.message)')
  })
})
