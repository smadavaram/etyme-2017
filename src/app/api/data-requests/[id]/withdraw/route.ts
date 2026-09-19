import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { withdrawRequest } from '@/lib/data-request'

/**
 * Stop a request before it runs.
 *
 * By the person it is about, and nobody else — not the company that
 * logged it. A firm that could withdraw somebody's erasure on their
 * behalf could quietly cancel every one it received.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const outcome = await withdrawRequest(params.id, caller.person.id)
  return NextResponse.json(
    outcome.ok ? { ok: true, says: outcome.says } : { error: outcome.says },
    { status: outcome.ok ? 200 : 403 }
  )
}
