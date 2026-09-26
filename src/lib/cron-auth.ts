import type { NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'

/**
 * Is this the scheduler calling?
 *
 * Twelve cron routes tested `header !== "Bearer " + process.env.CRON_SECRET`.
 * On a deployment with no CRON_SECRET that interpolates to the literal
 * string "Bearer undefined", and anybody who sends exactly that runs the
 * job. The seed route had already noticed and refused instead; the cron
 * routes had not caught up. Found on 2026-09-13 while making the daily
 * job leave a record, and fixed for all twelve at once here.
 *
 * A missing secret refuses everything. Development is the one exception,
 * so a job can be run by hand on a laptop with no secret set.
 */
export function cronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  const offered = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null
  if (!secret) return process.env.NODE_ENV === 'development'
  if (!offered) return false
  const a = Buffer.from(offered)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}
