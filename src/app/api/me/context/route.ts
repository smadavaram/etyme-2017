import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

/**
 * POST /api/me/context
 *
 * Switch active context. BUILD.md §3 — Auth and identity.
 *
 * A person may have multiple contexts:
 *   - EMPLOYEE at Company A (owner)
 *   - CONSULTANT at Company B (placed there)
 *   - PARTNER at Company C (network partnership)
 *
 * Switching context changes what they see and what permissions apply.
 * The active context is stored in the JWT and refreshed on switch.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.email) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  const body = await request.json()
  const { contextId } = body

  if (!contextId || typeof contextId !== 'string') {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'contextId is required',
          field: 'contextId',
        },
      },
      { status: 422 }
    )
  }

  // TODO: Verify this context belongs to the authenticated person
  // TODO: Verify context is not revoked (revokedAt is null)
  // TODO: Update session/JWT with the new active context
  // TODO: Write AccessLog for context switch

  return NextResponse.json({
    data: {
      activeContext: contextId,
      message: 'Context switched',
    },
  })
}
