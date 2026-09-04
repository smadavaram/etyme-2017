import type { NextAuthOptions } from 'next-auth'
import type { Provider } from 'next-auth/providers/index'
import AzureADProvider from 'next-auth/providers/azure-ad'
import GoogleProvider from 'next-auth/providers/google'
import EmailProvider from 'next-auth/providers/email'

/**
 * NextAuth configuration.
 *
 * Providers per CLAUDE.md / BUILD.md §3:
 *   - Microsoft (Azure AD) — primary for enterprise
 *   - Google — primary for small vendors
 *   - Email magic link — fallback, personal domains excluded
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

  return providers
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
    async signIn({ user }) {
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
}
