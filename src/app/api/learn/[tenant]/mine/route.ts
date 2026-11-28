import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { learnTenant } from '@/lib/training/learn-read'
import { readMine } from '@/lib/training/progress/read'

/**
 * GET /api/learn/:tenant/mine
 *
 * The learner's own points, weekly streak, badges and, where the Owner
 * turned it on, her place in her own cohort. Hers alone: the person is
 * the session's, never a parameter.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { tenant } = await params
  const t = await learnTenant(tenant)
  if (!t) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'There is no learning site at this address.' } }, { status: 404 })
  return NextResponse.json({ data: await readMine(t.id, caller.person.id, new Date()) })
}
