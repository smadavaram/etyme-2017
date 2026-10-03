import { NextResponse } from 'next/server'
import { assess } from '@/lib/readiness'
import { gatherFacts } from '@/lib/readiness-facts'

/**
 * GET /api/ready
 *
 * Whether this deployment is ready for a real company, edge by edge.
 * /api/health says whether the machine is up; this says whether anybody
 * outside could use it. The two disagree on purpose — a site with a live
 * database and no sign-in provider is healthy and not ready.
 *
 * Always 200. It is a report, not a probe; an uptime check belongs on
 * /api/health. Names of environment variables appear; values never do.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const facts = await gatherFacts()
  const verdict = assess(facts)
  return NextResponse.json({ data: verdict })
}
