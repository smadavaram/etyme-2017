import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * Thirty seconds, so a provider given ten seconds per call (lib/auth
 * OAUTH_HTTP) is never cut off by the host first. The plan's own limit
 * still decides whether this takes effect.
 */
export const maxDuration = 30

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
