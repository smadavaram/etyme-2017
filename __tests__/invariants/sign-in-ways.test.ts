import { describe, it, expect, beforeEach, afterEach } from 'vitest'

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
  return mod.configuredProviders().map((p: any) => p.id)
}

describe('which ways in are offered', () => {
  it('offers nothing at all when no credentials are set', async () => {
    expect(await providerIds()).toEqual([])
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
    // Terumo BCT and Nike are different tenants and both must get in.
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
