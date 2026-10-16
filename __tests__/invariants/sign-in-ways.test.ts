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
    expect(mod.configuredProviders().map((p: any) => p.id)).toEqual(['credentials'])
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

  it('offers the magic link only when there is a mail server to send it', async () => {
    expect(await providerIds()).not.toContain('email')

    process.env.EMAIL_SERVER = 'smtp://mail.example.com'
    expect(await providerIds()).toContain('email')
  })

  it('lets an enterprise sign in from any Microsoft tenant, not one', async () => {
    process.env.AZURE_AD_CLIENT_ID = 'id'
    process.env.AZURE_AD_CLIENT_SECRET = 'secret'
    const mod = await import('@/lib/auth')
    const azure: any = mod.configuredProviders().find((p: any) => p.id === 'azure-ad')
    // Talvern Medical and Northbend Athletic are different tenants and both must get in.
    expect(azure.options?.tenantId ?? 'common').toBe('common')
  })

  it('offers all three when all three are set up', async () => {
    process.env.AZURE_AD_CLIENT_ID = 'id'
    process.env.AZURE_AD_CLIENT_SECRET = 'secret'
    process.env.GOOGLE_CLIENT_ID = 'id'
    process.env.GOOGLE_CLIENT_SECRET = 'secret'
    process.env.EMAIL_SERVER = 'smtp://mail.example.com'
    expect((await providerIds()).sort()).toEqual(['azure-ad', 'email', 'google'])
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
    expect(doors).toContain("offers(available, 'azure-ad') &&")
    expect(doors).toContain("offers(available, 'google') &&")
    const form = read('src/app/(auth)/signup/form.tsx')
    expect(form).toContain('const available = useKnownDoors()')
    expect(form).toContain('{!claimToken && <AccountDoors available={available} callbackUrl="/start" />}')
    // No sentence about missing keys on sign-up.
    expect(form).not.toContain('not set up on this deployment')
  })

  it('the sign-in page and the sign-up page draw the same Microsoft and Google buttons, under the password form', () => {
    const login = read('src/app/(auth)/login/page.tsx')
    const form = read('src/app/(auth)/signup/form.tsx')
    for (const page of [login, form]) {
      expect(page).toContain("from '../account-doors'")
      expect(page).not.toContain("signIn('azure-ad'")
      expect(page).not.toContain("signIn('google'")
    }
    expect(login.indexOf('onSubmit={signInWithPassword}')).toBeLessThan(login.indexOf('<AccountDoors'))
    expect(form.indexOf('</form>')).toBeLessThan(form.indexOf('<AccountDoors'))
    const doors = read('src/app/(auth)/account-doors.tsx')
    expect(doors).toContain("signIn('azure-ad', { callbackUrl })")
    expect(doors).toContain("signIn('google', { callbackUrl })")
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
    expect(signInRefusal('OAuthCallback')).toBe('That sign-in did not go through. Try again, or sign in with your email and password.')
    expect(signInRefusal(null)).toBeNull()
    expect(read('src/lib/auth.ts')).toContain('if (refused) return `/login?error=${refused}`')
  })

  it('a session carries one spelling of the email, so Sharath@Etyme.com and sharath@etyme.com are one person', async () => {
    const { sessionEmail, authOptions } = await import('@/lib/auth')
    expect(sessionEmail(' Sharath@Etyme.com ')).toBe('sharath@etyme.com')
    const token = await authOptions.callbacks!.jwt!({ token: {}, user: { id: 'g-1', email: 'Sharath@Etyme.com' } } as any)
    expect(token.email).toBe('sharath@etyme.com')
    expect(read('src/lib/api-context.ts')).toContain('return session.user.email.trim().toLowerCase()')
  })
})
