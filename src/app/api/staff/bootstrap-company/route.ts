import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cron-auth'
import { reportError } from '@/lib/alerts'
import { bootstrapCompany } from '@/lib/staff-bootstrap'

/**
 * POST /api/staff/bootstrap-company — staff only, behind the CRON_SECRET
 * bearer.
 *   { name, domain, kind, address, seats: [{ email, name?, role }] }
 *
 * For a deployment with no email key (founder, 2026-10-14, "Etyme runs on
 * Etyme"): sign-up confirms an address by email and an invitation is an
 * email, so neither works there. This makes a real company through the one
 * function sign-up uses, seats each person at the role named, and answers
 * with a one-time link per seat that sets a password on first use and
 * expires in seven days. Staff hand each person their own link. Run twice,
 * it adds nothing twice; a person who has signed in is never touched. The
 * response never carries a password. The rules are lib/staff-bootstrap.
 * Once the deployment can send email, seats are invited from Users &
 * permissions instead, and this route is not needed.
 */
export async function POST(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Send the company as JSON: name, domain, kind, address and seats.' } }, { status: 422 })
  }
  try {
    const out = await bootstrapCompany({
      name: String(body.name ?? ''),
      domain: String(body.domain ?? ''),
      kind: String(body.kind ?? 'VENDOR') as any,
      address: String(body.address ?? ''),
      seats: Array.isArray(body.seats) ? body.seats : [],
    })
    if (!out.ok) return NextResponse.json({ error: { code: 'REFUSED', message: out.says } }, { status: 422 })
    return NextResponse.json({ data: out })
  } catch (err) {
    await reportError('staff/bootstrap-company', err).catch(() => undefined)
    return NextResponse.json({ error: { code: 'FAILED', message: 'The company could not be finished. Staff have been told. Run it again: it finds what was already made and adds only what is missing.' } }, { status: 500 })
  }
}
