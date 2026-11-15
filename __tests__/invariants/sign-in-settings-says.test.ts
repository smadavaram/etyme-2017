import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { appUrl, fixedAppUrl } from '@/lib/app-url'
import {
  NO_VERIFIED_DOMAIN, PROVE_DOMAIN_HREF, PROVE_DOMAIN_LINK, SAML_NOT_AVAILABLE, scimSays, noScimTokenSays,
} from '@/components/settings/settings-says'

/**
 * Settings → Sign-in, from the tester's fix list of 2026-11-14 (G2). It
 * sent a person to "Verify one in Setup" with no link, offered SAML as
 * "(stored, not built)", and printed a SCIM address built from a
 * preview deployment's own host.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const page = read('src/app/dashboard/settings/sign-in/page.tsx')
const overview = read('src/app/api/settings/sign-in/overview/route.ts')
const scimRoute = read('src/app/api/settings/sign-in/scim/route.ts')

const ENV_KEYS = ['NEXTAUTH_URL', 'NEXT_PUBLIC_APP_URL', 'VERCEL_URL', 'VERCEL_ENV', 'VERCEL_PROJECT_PRODUCTION_URL'] as const
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
function env(set: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const k of ENV_KEYS) delete process.env[k]
  Object.assign(process.env, set)
}
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('Sign-in says where a domain is proved', () => {
  it('Sign-in links Prove your domain to the Your domain screen, not to Setup', () => {
    expect(NO_VERIFIED_DOMAIN).toBe('No verified domain yet. “Your company’s directory only” needs one.')
    expect(PROVE_DOMAIN_LINK).toBe('Prove your domain')
    expect(PROVE_DOMAIN_HREF).toBe('/dashboard/settings/domain')
    expect(page).toContain('<Link href={PROVE_DOMAIN_HREF as Route}')
    expect(page).not.toContain('Verify one in Setup')
  })

  it('the domain link goes to a page the same seats may open, because both routes ask for settings.manage', () => {
    expect(overview).toContain("hasPermission(caller.permissions, 'settings.manage')")
    expect(read('src/app/api/settings/domain/route.ts')).toContain('setupDoor(request')
    expect(read('src/app/api/settings/setup/door.ts')).toContain("hasPermission(caller.permissions, 'settings.manage')")
  })
})

describe('Sign-in never offers a choice that does nothing', () => {
  it('the directory Kind list does not offer SAML while SAML cannot be turned on', () => {
    expect(page).not.toContain('stored, not built')
    expect(page).toContain('{savedSaml && <option value="SAML">SAML 2.0 (not available yet)</option>}')
    expect(page).toContain("const savedSaml = o.directory?.type === 'SAML'")
  })

  it('a saved SAML directory still reads back, with a sentence saying nobody can sign in through it', () => {
    expect(SAML_NOT_AVAILABLE).toBe('SAML sign-in is not available yet, so nobody can sign in through this directory. Choose OpenID Connect, Microsoft Entra ID or Google Workspace instead.')
    expect(page).toContain('{isSaml && <p className="mb-3 text-[13px] text-etyme-attention">{SAML_NOT_AVAILABLE}</p>}')
  })
})

describe('the SCIM address is the deployment’s lasting one, given only where it can be used', () => {
  it('the SCIM address is never a preview deployment’s own address', () => {
    env({ VERCEL_URL: 'etyme-git-branch-abc.vercel.app', VERCEL_ENV: 'preview', VERCEL_PROJECT_PRODUCTION_URL: 'app.northwind-staffing.example' })
    expect(fixedAppUrl()).toBeNull()
    // Mailed links still have somewhere to go on a preview.
    expect(appUrl()).toBe('https://etyme-git-branch-abc.vercel.app')
  })

  it('on production with no address set, the SCIM address is the project’s production address, never the one-off deploy address', () => {
    env({ VERCEL_URL: 'etyme-abc123.vercel.app', VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'app.northwind-staffing.example' })
    expect(fixedAppUrl()).toBe('https://app.northwind-staffing.example')
  })

  it('on production with no address set, mailed links and the redirect keep the address the request came to, as before the SCIM fix', () => {
    env({ VERCEL_URL: 'etyme-abc123.vercel.app', VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'app.northwind-staffing.example' })
    expect(appUrl()).toBe('https://etyme-abc123.vercel.app')
  })

  it('the address set for sign-in comes first, with no trailing slash', () => {
    env({ NEXTAUTH_URL: 'https://app.harborline-tech.example/', VERCEL_URL: 'etyme-abc123.vercel.app', VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'other.example' })
    expect(fixedAppUrl()).toBe('https://app.harborline-tech.example')
    expect(appUrl()).toBe('https://app.harborline-tech.example')
  })

  it('both SCIM routes build the address from the lasting address reader', () => {
    for (const src of [overview, scimRoute]) {
      expect(src).toContain('fixedAppUrl() ? `${fixedAppUrl()}/scim/v2` : null')
      expect(src).not.toContain('${appUrl()}/scim/v2')
    }
  })

  it('the SCIM address is not shown before a token is issued, and the line says to issue one', () => {
    expect(scimSays({ base: 'https://app.northwind-staffing.example/scim/v2', hasToken: false, on: false }))
      .toBe('Your directory adds and removes people by SCIM. Issue a token to get the address to give it. Off: turn it on above.')
    expect(scimSays({ base: 'https://app.northwind-staffing.example/scim/v2', hasToken: true, on: true }))
      .toBe('Your directory adds and removes people at https://app.northwind-staffing.example/scim/v2. On.')
  })

  it('a deployment with no lasting address says so in a sentence, and offers no token it cannot give an address for', () => {
    expect(scimSays({ base: null, hasToken: false, on: false }))
      .toBe('This deployment has no lasting public address yet, so no SCIM address can be given here. Off: turn it on above.')
    expect(noScimTokenSays(true, false)).toBe('No token issued. A token can be issued once this deployment has a lasting public address.')
    expect(page).toContain('{can && (o.scimBase || o.scimToken) && (')
  })

  it('No token issued says what to do next for the Owner, and who does it for an Admin', () => {
    expect(noScimTokenSays(true, true)).toBe('No token issued. Press Issue a token, then give the token and the address to your directory.')
    expect(noScimTokenSays(false, true)).toBe('No token issued. An Owner issues one on this page.')
    expect(page).toContain('noScimTokenSays(can, Boolean(o.scimBase))')
    expect(page).not.toContain("'No token issued.'")
  })
})
