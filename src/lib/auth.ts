import type { NextAuthOptions } from 'next-auth'
import type { Provider } from 'next-auth/providers/index'
import AzureADProvider from 'next-auth/providers/azure-ad'
import GoogleProvider from 'next-auth/providers/google'
import EmailProvider from 'next-auth/providers/email'
import CredentialsProvider from 'next-auth/providers/credentials'
import type { Door } from '@/lib/identity/policy'
import { emailLinkDoorOn } from '@/lib/readiness'
import { OAUTH_HTTP_TIMEOUT_MS } from '@/lib/identity/oidc'

export { OAUTH_HTTP_TIMEOUT_MS }

/**
 * What every OAuth and OpenID door is given to talk to its provider. The
 * OpenID client library waits 3.5 seconds per call by default; Google's
 * discovery, token and key calls each get ten (lib/identity/oidc).
 */
export const OAUTH_HTTP = { timeout: OAUTH_HTTP_TIMEOUT_MS } as const

/**
 * NextAuth configuration.
 *
 * Providers per CLAUDE.md / BUILD.md §3:
 *   - Microsoft (Azure AD) — primary for enterprise
 *   - Google — primary for small vendors
 *   - Email magic link — fallback, personal domains excluded
 *   - Email and password — the password door (founder, 2026-10-08), always
 *     offered; it needs only an email sender to confirm addresses, and
 *     says so on /ready when there is none (lib/password-door)
 *
 * The domain arrives verified from the OAuth tenant, so we skip
 * the 2017 EXCLUDED_DOMAINS check (BUILD.md §4.A).
 */

// Domains that cannot register a company (personal email providers)
const EXCLUDED_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'aol.com',
  'icloud.com',
  'mail.com',
  'protonmail.com',
  'rediffmail.com',
  'facebook.com',
])

export function isExcludedDomain(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase()
  return !domain || EXCLUDED_DOMAINS.has(domain)
}

/**
 * Ask the provider for its account chooser on every sign-in.
 *
 * The founder, 2026-10-20, signing in to Tapin as sharath@etyme.com while
 * a personal Gmail was signed in on the same browser: Google reused that
 * account and gave no way to switch, so he was seated as a candidate (a
 * consumer address is a person, by the domain rule). Microsoft does the
 * same without it. `prompt=select_account` makes both show the list of
 * accounts every time, so somebody signed in to a personal account can
 * pick their work one.
 */
export const ACCOUNT_CHOOSER = { params: { prompt: 'select_account' } } as const

/**
 * Only the ways in that actually work.
 *
 * Microsoft used to be commented out while the sign-in page still offered
 * a Microsoft button. Clicking it took an enterprise user — the population
 * this product is for — to an error page. A provider registered with empty
 * credentials is the same failure wearing a suit: the button renders, the
 * redirect happens, and the provider rejects it.
 *
 * So a provider appears here when its credentials do, and the sign-in page
 * asks NextAuth what is present rather than assuming.
 */
export function configuredProviders(): Provider[] {
  const providers: Provider[] = []

  if (process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET) {
    providers.push(
      AzureADProvider({
        clientId: process.env.AZURE_AD_CLIENT_ID,
        clientSecret: process.env.AZURE_AD_CLIENT_SECRET,
        // 'common' lets any Microsoft tenant in, which is what a platform
        // wants — Terumo BCT and Nike are different tenants.
        tenantId: process.env.AZURE_AD_TENANT_ID || 'common',
        authorization: { params: { ...ACCOUNT_CHOOSER.params } },
        httpOptions: OAUTH_HTTP,
      })
    )
  }

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push(
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        authorization: { params: { ...ACCOUNT_CHOOSER.params } },
        httpOptions: OAUTH_HTTP,
      })
    )
  }

  if (emailLinkDoorOn()) {
    providers.push(
      EmailProvider({
        server: process.env.EMAIL_SERVER,
        from: process.env.EMAIL_FROM || 'noreply@etyme.com',
      })
    )
  }

  // LinkedIn, for workers and one-person firms only (founder, 2026-11-11:
  // "Only the workers and solopreneurs can have Gmail or LinkedIn login").
  // LinkedIn's standard OpenID Connect sign-in; the profile URL stays a
  // field. A seat at a company with more than one person is refused to a
  // LinkedIn session in the one caller check (linkedInSeatRefusal).
  if (process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET) {
    providers.push(linkedInDoor(process.env.LINKEDIN_CLIENT_ID, process.env.LINKEDIN_CLIENT_SECRET))
  }

  providers.push(passwordDoor())
  providers.push(directoryDoor())

  return providers
}

/**
 * The password door, as a NextAuth Credentials provider.
 *
 * Always registered, because it has no key of its own: a person who
 * confirmed their email can sign in with it whether or not any identity
 * provider is set up. Two ways through it — an email and a password, or
 * the one-time link from the sign-up email, which proves the mailbox and
 * signs the person in once (`/verify/[token]`). Every refusal is thrown
 * as the sentence the page shows; the rules are lib/password-door.
 */
export function passwordDoor(): Provider {
  return CredentialsProvider({
    id: 'credentials',
    name: 'Email and password',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' },
      verifyToken: { label: 'Link', type: 'text' },
    },
    async authorize(credentials, req) {
      const door = await import('@/lib/password-door')
      if (credentials?.verifyToken) {
        // The company's sign-in policy is read inside verifyEmail, before
        // the link seats anybody (lib/identity).
        const v = await door.verifyEmail(credentials.verifyToken)
        // An already-confirmed address carries its code, so the link page offers Sign in.
        if (!v.ok) throw new Error(v.code ? `${v.code}:${v.says}` : v.says)
        await door.recordSignIn(v.personId, v.email)
        return { id: v.personId, email: v.email, verified: true, door: 'VERIFY_TOKEN' } as any
      }
      const fwd = (req?.headers as Record<string, string | undefined> | undefined)?.['x-forwarded-for']
      const ip = fwd ? String(fwd).split(',')[0].trim() : null
      const r = await door.checkPassword(credentials?.email, credentials?.password, ip)
      if (!r.ok) throw new Error(r.code === 'UNVERIFIED' ? door.unverifiedError(String(credentials?.email ?? '').trim().toLowerCase()) : r.says)
      return { id: r.personId, email: r.email, name: r.name, verified: true, door: 'PASSWORD' } as any
    },
  })
}

/** LinkedIn's OpenID Connect sign-in, by its published discovery document. No new dependency. */
export function linkedInDoor(clientId: string, clientSecret: string): Provider {
  return {
    id: 'linkedin',
    name: 'LinkedIn',
    type: 'oauth',
    wellKnown: 'https://www.linkedin.com/oauth/.well-known/openid-configuration',
    issuer: 'https://www.linkedin.com/oauth',
    jwks_endpoint: 'https://www.linkedin.com/oauth/openid/jwks',
    authorization: { params: { scope: 'openid profile email' } },
    idToken: true,
    checks: ['state'],
    client: { token_endpoint_auth_method: 'client_secret_post' },
    httpOptions: OAUTH_HTTP,
    clientId,
    clientSecret,
    profile(p: Record<string, any>) {
      return { id: String(p.sub), name: p.name ?? null, email: p.email ?? null, image: p.picture ?? null }
    },
  } as unknown as Provider
}

/**
 * A company's own directory, as a NextAuth door (founder, 2026-11-11). It
 * holds no key of its own: /api/sso/callback verifies the directory's id
 * token and sets a two-minute ticket as an http-only cookie, and this door
 * spends that ticket once (lib/identity/directory). Always registered, and
 * never drawn as a button: the sign-in page reaches it through the work
 * email.
 */
export function directoryDoor(): Provider {
  return CredentialsProvider({
    id: 'directory-oidc',
    name: 'Your company\'s directory',
    credentials: {},
    async authorize(_credentials, req) {
      const { spendTicket, cookieFrom, TICKET_COOKIE } = await import('@/lib/identity/directory')
      const headers = (req?.headers ?? {}) as Record<string, string | undefined>
      const who = await spendTicket(cookieFrom(headers.cookie ?? headers.Cookie, TICKET_COOKIE))
      if (!who) throw new Error('This sign-in was already used, or ran out. Start again from the sign-in page.')
      return { id: who.personId, email: who.email, verified: true, door: 'DIRECTORY', issuer: who.issuer } as any
    },
  })
}

/**
 * Why a Microsoft or Google sign-in is refused before it becomes a session,
 * or null when it may go on. Returned as the code the sign-in page reads
 * (`/login?error=…`, lib/login-doors says the sentence).
 *
 * Identity in Etyme is the email: a session is read as the person whose
 * primary email it carries (lib/api-context), so a password account and a
 * later Google sign-in on the same address are one person. That is only
 * safe where the identity provider vouches for the address:
 *   - Google says so in `email_verified`. A Google account on an address
 *     Google never confirmed is refused.
 *   - Microsoft does not by default. Any organization's administrator can
 *     put any address on a user in their own tenant, and the sign-in is
 *     open to every tenant, so an unproven address could sign in as
 *     somebody else here. Microsoft sends `xms_edov` (the email domain's
 *     owner is verified) when the app asks for it, and leaves the email out
 *     where the owner is unverified for apps registered since 2023. Both
 *     are honored: no email, or `xms_edov` false, is refused.
 */
export function oauthRefusal(provider: string | undefined, profile: Record<string, unknown> | undefined, email: string | null | undefined): 'NoEmail' | 'EmailNotVerified' | null {
  if (provider !== 'google' && provider !== 'azure-ad' && provider !== 'linkedin') return null
  if (!email || !String(email).includes('@')) return 'NoEmail'
  if (provider === 'google' || provider === 'linkedin') {
    const v = profile?.email_verified
    return v === true || v === 'true' ? null : 'EmailNotVerified'
  }
  const edov = profile?.xms_edov
  return edov === false || edov === 'false' || edov === 0 ? 'EmailNotVerified' : null
}

/** One spelling of an address, so a mixed-case Microsoft email is the same person. */
export function sessionEmail(email: string | null | undefined): string | null {
  const e = String(email ?? '').trim().toLowerCase()
  return e || null
}

/**
 * Which door a sign-in came through, by NextAuth's provider id (lib/identity
 * names the doors). The password door says which of its two ways on the
 * user it returns. A company's own directory is the second stage of pass
 * 1: its provider id begins `directory-`, and its issuer is the token's.
 */
export function doorOfSignIn(provider: string | undefined, user?: { door?: unknown } | null): Door | null {
  if (!provider) return null
  if (provider === 'azure-ad') return 'MICROSOFT_SOCIAL'
  if (provider === 'google') return 'GOOGLE_SOCIAL'
  if (provider === 'email') return 'EMAIL_LINK'
  if (provider === 'credentials') return user?.door === 'VERIFY_TOKEN' ? 'VERIFY_TOKEN' : 'PASSWORD'
  if (provider === 'linkedin') return 'LINKEDIN'
  if (provider.startsWith('directory-')) return 'DIRECTORY'
  return null
}

/** The issuer that vouched for a directory sign-in: the ticket's, said by the directory door. */
function directoryIssuer(user: unknown, profile: unknown): string | null {
  return String((user as any)?.issuer ?? (profile as any)?.iss ?? '') || null
}

/**
 * A person's session version, read once and once more if the first read
 * fails. Throws where both fail, so no session is ever signed in at a
 * guessed version (fault 4, 2026-11-12).
 */
export async function readSessionVersion(email: string): Promise<number> {
  const { sessionVersionOf } = await import('@/lib/identity/read')
  try {
    return await sessionVersionOf(email)
  } catch {
    return await sessionVersionOf(email)
  }
}

/** NextAuth's provider id, as the Credential row names it. */
const PROVIDER_ROW: Record<string, 'MICROSOFT' | 'GOOGLE' | 'EMAIL'> = {
  'azure-ad': 'MICROSOFT',
  google: 'GOOGLE',
  email: 'EMAIL',
}

/**
 * Why a sign-in failed, in a form Etyme's staff can read: the code, the
 * provider, and the inner message only. Never a token, a code, a cookie
 * or a whole address: an address is cut to its domain and anything long
 * enough to be a token is cut out. Pure.
 */
export function signInFailureReport(code: string, meta: unknown): { place: string; message: string } {
  const m = (meta ?? {}) as Record<string, any>
  const provider = typeof m.providerId === 'string' ? m.providerId : typeof m.provider === 'string' ? m.provider : null
  const inner =
    meta instanceof Error ? meta.message
      : typeof m.error?.message === 'string' ? m.error.message
        : typeof m.message === 'string' ? m.message
          : typeof meta === 'string' ? meta
            : ''
  const message = String(inner)
    .replace(/[^\s@<>"'(),;:]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '[address at $1]')
    .replace(/[A-Za-z0-9_\-.~+/=]{24,}/g, '[cut]')
    .slice(0, 300)
  return {
    place: `Sign-in did not finish (${code}${provider ? `, ${provider}` : ''})`,
    message: message || 'No reason was given.',
  }
}

export const authOptions: NextAuthOptions = {
  providers: configuredProviders(),

  /**
   * A sign-in that fails inside NextAuth (a provider that did not answer
   * in time, a state cookie that did not come back) goes to the incident
   * log with its real reason, so staff learn why (fault 3, 2026-11-12).
   * The alert email is sent at most once an hour per place (lib/alerts).
   */
  logger: {
    error(code, metadata) {
      const r = signInFailureReport(String(code), metadata)
      void import('@/lib/alerts')
        .then(({ reportError }) => reportError(r.place, r.message))
        // reportError writes the console line itself; a failed import has nowhere else to go.
        .catch(() => {})
    },
  },

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  callbacks: {
    async signIn({ user, account, profile }) {
      // Microsoft and Google only where the provider vouches for the email,
      // because the email is who the session is (oauthRefusal above).
      const refused = oauthRefusal(account?.provider, profile as Record<string, unknown> | undefined, user.email)
      if (refused) return `/login?error=${refused}`
      // The password door refuses an unconfirmed address inside authorize,
      // with the sentence and the code the page reads to offer the link
      // again. This is the second lock on the same door: nothing reaches a
      // session through it without a confirmed email.
      if (account?.provider === 'credentials' && !(user as any).verified) return false
      // The company's sign-in policy, at every door (founder, 2026-11-11):
      // an address on a directory-only company's verified domain comes in
      // through that company's directory and nothing else. The refusal's
      // ledger row is written before the answer goes back (lib/identity).
      const door = doorOfSignIn(account?.provider, user as any)
      if (door && user.email) {
        const { checkDoor } = await import('@/lib/identity/read')
        const v = await checkDoor({
          door, email: sessionEmail(user.email)!, surface: 'WEB',
          issuer: door === 'DIRECTORY' ? directoryIssuer(user, profile) : null,
        })
        if (!v.allowed) return '/login?error=DirectoryOnly'
      }
      // The session version this session is signed in under, read before
      // the session exists. Read twice; where both fail the sign-in ends
      // with one sentence, because a session stamped 0 for a person whose
      // version is above 0 is refused on its very next request and reads as
      // being signed out for no reason (fault 4, 2026-11-12).
      if (user.email) {
        try {
          ;(user as any).sv = await readSessionVersion(sessionEmail(user.email)!)
        } catch {
          return '/login?error=SessionUnread'
        }
      }
      // Personal email domains may sign in; they cannot register a company
      // (the company creation endpoint checks that separately).
      return true
    },

    async jwt({ token, user, account, profile }) {
      if (user) {
        token.id = user.id
        token.email = sessionEmail(user.email)
        // The door and the session version this session was signed in
        // under, read on every request below (lib/identity).
        const door = doorOfSignIn(account?.provider, user as any)
        token.door = door
        token.iss = door === 'DIRECTORY' ? directoryIssuer(user, profile) : null
        // When this sign-in began, for the one act that asks for a recent
        // sign-in: a first password (lib/password-door). Kept in the token
        // and never put on the session the browser reads.
        token.authAt = Date.now()
        // Read by the sign-in callback above; read here again only where
        // that did not run. Never guessed as 0: a read that fails twice ends
        // the sign-in (fault 4).
        const known = (user as any).sv
        token.sv = typeof known === 'number' ? known : token.email ? await readSessionVersion(String(token.email)) : 0
        return token
      }
      // Every request: a session that was ended ("sign out everywhere", a
      // directory that disabled the person), or signed in by a door the
      // address's own company no longer allows, ends here. Throwing makes
      // NextAuth answer with no session and clear the cookie.
      if (token.email) {
        let verdict: { stands: boolean } = { stands: true }
        try {
          const { liveSessionStands } = await import('@/lib/identity/read')
          verdict = await liveSessionStands({
            email: String(token.email),
            door: (token.door as Door | undefined) ?? null,
            issuer: (token.iss as string | undefined) ?? null,
            tokenVersion: token.sv as number | undefined,
          })
        } catch {
          // A read that failed is not a verdict. The seat read on the same
          // request fails with it, so nothing is served (KNOWN-LIMITS).
        }
        if (!verdict.stands) throw new Error('SESSION_ENDED')
      }
      return token
    },

    async session({ session, token }) {
      if (session.user) {
        ;(session.user as any).id = token.id
        // Read by getCallerContext to decide whether a directory-only
        // company's seat may be used from this session.
        ;(session.user as any).door = token.door ?? null
        ;(session.user as any).issuer = token.iss ?? null
      }
      return session
    },
  },

  events: {
    /**
     * A sign-in through Microsoft, Google or a magic link, written down so
     * /ready can count it. Nothing wrote a Credential row before
     * 2026-10-08, so the Sign-in edge could never reach proven however
     * many people came in. Recorded only where the person already exists:
     * somebody's very first sign-in is made a person by /start, and is
     * counted from their second. The password door records its own.
     */
    async signIn({ user, account }) {
      // The ledger first: who came in, through which door, under which
      // policy, and any invitation this first sign-in accepts.
      try {
        const { recordSignInLedger } = await import('@/lib/identity/sign-in')
        await recordSignInLedger({ email: user.email ?? null, door: doorOfSignIn(account?.provider, user as any) })
      } catch {
        // Writing the row is never a reason to refuse a sign-in that passed.
      }
      const provider = account ? PROVIDER_ROW[account.provider] : undefined
      if (!provider || !user.email) return
      try {
        const { prisma } = await import('@/lib/db')
        const email = user.email.trim().toLowerCase()
        const person = await prisma.person.findUnique({ where: { primaryEmail: email }, select: { id: true } })
        if (!person) return
        const providerId = account!.providerAccountId || email
        await prisma.credential.upsert({
          where: { provider_providerId: { provider, providerId } },
          update: { lastUsedAt: new Date(), personId: person.id },
          create: { personId: person.id, provider, providerId, email, lastUsedAt: new Date() },
        })
      } catch {
        // Counting a sign-in is never a reason to refuse one.
      }
    },
  },
}
