import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import {
  proofFactsAt, proofStanding, mayBecomeOwner, waitsForVerifiedOwner, NOT_GATED_LINE, GATED_ACT_WORDS,
} from '@/lib/owner-proof'
import { becomeOwner } from './become'

/**
 * GET  /api/settings/owner-proof — the caller's two proofs at this company,
 *      what waits on them, and whether "Become Owner" is offered
 * POST /api/settings/owner-proof — { action: 'become-owner' }
 *
 * The first person is an Admin; Owner is earned by proof (founder,
 * 2026-11-11). The Owner and the Admin read it; it is about the caller's
 * own proofs, so nobody reads another person's here. The person proof is
 * recorded by a Superadmin from the provider's result
 * (/api/superadmin/owner-proof); the domain proof is read off the record
 * (the DNS proof, or the company's own directory set up and signed in
 * through by this person) and recorded with who and when on the press.
 */

async function door(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return { error }
  if (!caller.company) {
    return { error: NextResponse.json({ error: { code: 'NO_COMPANY', message: 'Proving ownership is done from a seat at the company.' } }, { status: 403 }) }
  }
  const personId = realPersonId(caller)
  if (!personId) {
    return { error: NextResponse.json({ error: { code: 'PERSON_REQUIRED', message: 'An integration cannot prove ownership. A person does.' } }, { status: 403 }) }
  }
  const seat = await prisma.context.findFirst({
    where: { id: caller.context.id, companyId: caller.company.id, revokedAt: null },
    select: { id: true, suspendedAt: true, role: { select: { name: true } } },
  })
  const role = seat?.role?.name ?? null
  if (role !== 'Owner' && role !== 'Admin') {
    return { error: NextResponse.json({ error: { code: 'FORBIDDEN', message: `Proving ownership of ${caller.company.name} is for its Owners and Admins.` } }, { status: 403 }) }
  }
  return { caller, company: caller.company, personId, seat: seat!, role }
}

export async function GET(request: NextRequest) {
  const d = await door(request)
  if (d.error) return d.error
  const { company, personId, seat, role } = d as Exclude<typeof d, { error: NextResponse }>
  const [c, facts, owners] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: company.id }, select: { name: true, ownerProofRequiredAt: true, ownerVerifiedAt: true } }),
    proofFactsAt(company.id, personId),
    prisma.context.count({ where: { companyId: company.id, revokedAt: null, suspendedAt: null, role: { name: 'Owner' } } }),
  ])
  const standing = proofStanding(facts)
  const may = mayBecomeOwner({ gate: c, standing, seatRole: role, seatLive: !seat.suspendedAt, liveOwners: owners, companyName: c.name })
  const gated = waitsForVerifiedOwner(c)
  return NextResponse.json({
    data: {
      company: c.name,
      gated,
      verified: c.ownerVerifiedAt !== null,
      line: gated
        ? `Until ${c.name} has a verified Owner, these wait: ${Object.values(GATED_ACT_WORDS).map((w) => w.toLowerCase()).join(', ')}.`
        : c.ownerProofRequiredAt === null ? NOT_GATED_LINE : `${c.name} has a verified Owner.`,
      domain: standing.domain,
      person: standing.person,
      needsDomain: standing.needsDomain,
      offer: may.ok ? (may.reseat ? 'Become Owner' : (c.ownerVerifiedAt ? null : 'Record my proofs')) : null,
      says: may.ok ? null : may.says,
    },
  })
}

export async function POST(request: NextRequest) {
  const d = await door(request)
  if (d.error) return d.error
  const { caller, company, personId } = d as Exclude<typeof d, { error: NextResponse }>
  const body = await request.json().catch(() => ({}))
  if (body.action !== 'become-owner') {
    return NextResponse.json({ error: { code: 'VALIDATION', field: 'action', message: "action is 'become-owner'." } }, { status: 422 })
  }
  const done = await becomeOwner({ companyId: company.id, contextId: caller!.context.id, personId, personName: caller!.person.name, byPersonId: personId })
  if (!done.ok) return NextResponse.json({ error: { code: 'REFUSED', message: done.says } }, { status: 422 })
  return NextResponse.json({ data: { message: done.says } })
}
