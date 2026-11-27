import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { routeMatches } from '@/lib/nav-table'
import { trialOf, isReadOnly, type PricedEdition } from '@/lib/money/pricing'

/**
 * Day 61 unpaid (records 126, 127): the tenant is read-only. Nothing is
 * deleted, reads always stay, new work is refused, work already in progress
 * finishes so placed workers are paid, and the tenant's agents stop.
 *
 * ONE rule, in ONE place. The shared caller check asks `readOnlyRefusalFor`
 * for every write; the agent loop, the ledger wrapper and the skill runner
 * ask `tenantIsReadOnly`. The clock itself is `trialOf` in lib/money/pricing.
 *
 * The switch: `ETYME_DAY61_READ_ONLY=off` turns the whole rule off; unset or
 * anything else leaves it on. One name, read here and nowhere else.
 */
export function readOnlyRuleOn(env: Record<string, string | undefined> = process.env): boolean {
  return (env.ETYME_DAY61_READ_ONLY ?? '').trim().toLowerCase() !== 'off'
}

/** The sentence a refused write and a stopped agent both say. It names the step. */
export const READ_ONLY_SAYS = 'Your 60 days ended. The Owner can choose a plan in Settings.'

/**
 * The writes that stay open at day 61, each with its reason. A route not in
 * this list is new work and is refused. A write is never refused for a
 * person's work already under way: a worker must still be paid.
 */
export const OPEN_AT_DAY_61: Readonly<Record<string, string>> = {
  'timesheets': 'A week already worked is filed, so the worker is paid.',
  'timesheets/**': 'A week already worked is filed, so the worker is paid.',
  'week-approvals': 'The client signs the weeks already worked.',
  'week-approvals/**': 'The client signs the weeks already worked.',
  'approve-week/**': 'The client signs the weeks already worked, from the emailed link.',
  'expenses/**': 'An expense already incurred is accepted and paid like a week.',
  'invoices': 'A bill on an existing placement is issued.',
  'invoices/**': 'A bill on an existing placement is issued.',
  'ar/**': 'Bills already issued are followed to payment.',
  'ap/**': 'Invoice receipts for work already done are paid.',
  'payroll/**': 'A placed worker is paid for the hours already worked.',
  'settings/**': 'The Owner chooses a plan, and settings never start work.',
  'billing/**': 'The Owner chooses a plan and records a payment here.',
  'superadmin/**': 'Etyme staff tools are not a tenant act.',
  'auth/**': 'Signing in is never refused.',
}

const READS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Pure: does this write start new work at a read-only tenant. */
export function startsNewWork(method: string | undefined, path: string): boolean {
  if (READS.has((method ?? 'GET').toUpperCase())) return false
  const p = path.replace(/\/$/, '')
  if (!/^\/api(\/|$)/.test(p)) return false
  return !Object.keys(OPEN_AT_DAY_61).some((r) => routeMatches(p, r))
}

/** The firm's clock, read once. Null where the company is not found. */
export async function tenantIsReadOnly(companyId: string, now: Date = new Date(), env: Record<string, string | undefined> = process.env): Promise<boolean> {
  if (!readOnlyRuleOn(env)) return false
  const c = await prisma.company.findUnique({
    where: { id: companyId },
    select: { edition: true, activatedAt: true, paidThrough: true, billingExempt: true },
  })
  if (!c) return false
  return isReadOnly(trialOf({ ...c, edition: c.edition as PricedEdition, now }))
}

type Refusable = {
  person: { id: string }
  company: { id: string } | null
  context?: { id: string } | null
  readOnly?: boolean
}

/**
 * The shared caller check's question. Returns the 403 to send, or null.
 * Reads cost no query. The refusal row is written, and waited for, before
 * the 403 goes out (access-log invariant).
 */
export async function readOnlyRefusalFor(
  caller: Refusable,
  request: { method?: string; nextUrl?: { pathname: string } } | undefined,
  now: Date = new Date(),
): Promise<NextResponse | null> {
  if (!caller.company || !request?.nextUrl) return null
  if (!startsNewWork(request.method, request.nextUrl.pathname)) return null
  if (!(await tenantIsReadOnly(caller.company.id, now))) return null
  // Lazy: lib/access-log pulls the database client's whole surface.
  const { recordRefusal, accessActor } = await import('@/lib/access-log')
  await recordRefusal([{ companyId: caller.company.id }], {
    ...accessActor(caller),
    // The log has no name of its own for this yet (a request to regulatory); the reason says what happened.
    action: 'PLUGIN_OFF_REFUSED',
    reason: `Refused ${request.method} ${request.nextUrl.pathname}: the 60 days ended and nothing is paid, so the tenant is read-only.`,
  })
  return NextResponse.json({ error: { code: 'READ_ONLY', message: READ_ONLY_SAYS, href: '/dashboard/settings' } }, { status: 403 })
}
