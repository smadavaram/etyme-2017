import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

/**
 * GET /api/me
 *
 * Returns the authenticated person with their credentials, contexts,
 * and active context. Mirrors BUILD.md §3 — Auth and identity.
 *
 * Field filtering: payRate, billRate, and cost fields are stripped
 * unless the caller holds the required permission (BUILD.md §2).
 */
export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  // TODO: Look up Person + Credentials + Contexts from Prisma
  // For now, return the session user
  return NextResponse.json({
    data: {
      person: {
        id: (session.user as any).id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image,
      },
      credentials: [],
      contexts: [],
      activeContext: null,
    },
  })
}
