import type { NextAuthOptions } from 'next-auth'
import type { Provider } from 'next-auth/providers/index'
import AzureADProvider from 'next-auth/providers/azure-ad'
import GoogleProvider from 'next-auth/providers/google'
import EmailProvider from 'next-auth/providers/email'
import CredentialsProvider from 'next-auth/providers/credentials'

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
      })
    )
  }

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push(
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      })
    )
  }

  if (process.env.EMAIL_SERVER) {
    providers.push(
      EmailProvider({
        server: process.env.EMAIL_SERVER,
        from: process.env.EMAIL_FROM || 'noreply@etyme.com',
      })
    )
  }

  providers.push(passwordDoor())

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
        const v = await door.verifyEmail(credentials.verifyToken)
        if (!v.ok) throw new Error(v.says)
        await door.recordSignIn(v.personId, v.email)
        return { id: v.personId, email: v.email, verified: true } as any
      }
      const fwd = (req?.headers as Record<string, string | undefined> | undefined)?.['x-forwarded-for']
      const ip = fwd ? String(fwd).split(',')[0].trim() : null
      const r = await door.checkPassword(credentials?.email, credentials?.password, ip)
      if (!r.ok) throw new Error(r.code === 'UNVERIFIED' ? door.unverifiedError(String(credentials?.email ?? '').trim().toLowerCase()) : r.says)
      return { id: r.personId, email: r.email, name: r.name, verified: true } as any
    },
  })
}

/** NextAuth's provider id, as the Credential row names it. */
const PROVIDER_ROW: Record<string, 'MICROSOFT' | 'GOOGLE' | 'EMAIL'> = {
  'azure-ad': 'MICROSOFT',
  google: 'GOOGLE',
  email: 'EMAIL',
}

export const authOptions: NextAuthOptions = {
  providers: configuredProviders(),

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  callbacks: {
    async signIn({ user, account }) {
      // The password door refuses an unconfirmed address inside authorize,
      // with the sentence and the code the page reads to offer the link
      // again. This is the second lock on the same door: nothing reaches a
      // session through it without a confirmed email.
      if (account?.provider === 'credentials' && !(user as any).verified) return false
      // Block personal email domains from company registration
      if (user.email && isExcludedDomain(user.email)) {
        // Allow sign-in but flag — they can be invited as candidates,
        // they just cannot register a company.
        // The company creation endpoint checks this separately.
      }
      return true
    },

    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.email = user.email
      }
      return token
    },

    async session({ session, token }) {
      if (session.user) {
        ;(session.user as any).id = token.id
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
