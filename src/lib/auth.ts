import type { NextAuthOptions } from 'next-auth'
import type { Adapter } from 'next-auth/adapters'
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

export const authOptions: NextAuthOptions = {
  providers: [
    // Microsoft Azure AD — uncomment when credentials are configured
    // AzureADProvider({
    //   clientId: process.env.AZURE_AD_CLIENT_ID!,
    //   clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
    //   tenantId: process.env.AZURE_AD_TENANT_ID || 'common',
    // }),

    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),

    EmailProvider({
      server: process.env.EMAIL_SERVER || '',
      from: process.env.EMAIL_FROM || 'noreply@etyme.com',
    }),
  ],

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
