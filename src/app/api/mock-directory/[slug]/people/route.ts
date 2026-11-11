import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { mockCompany, mockPeople } from '@/lib/identity/mock-read'
import { deprovision, reprovision } from '@/lib/identity/provision'

/**
 * GET   /api/mock-directory/[slug]/people — who is in the mock directory
 * PATCH /api/mock-directory/[slug]/people — { id, enabled } turn somebody off or on
 *
 * The mock directory's own admin screen, read from Settings → Sign-in by
 * the demo company's Owner or Admin. Turning somebody off here is what a
 * real directory does by SCIM, through the same function
 * (lib/identity/provision): the seat paused, every session ended,
 * USER_DEPROVISIONED written. A mock; demo companies only.
 */
async function gate(request: NextRequest, slug: string) {
  const { caller, error } = await getCallerContext(request)
  if (error) return { error }
  const c = await mockCompany(slug)
  if (!c || caller.company?.id !== c.id) {
    return { error: NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No mock directory for this company.' } }, { status: 404 }) }
  }
  const role = caller.context.roleId ? await prisma.role.findFirst({ where: { id: caller.context.roleId, companyId: c.id }, select: { name: true } }) : null
  if (role?.name !== 'Owner' && role?.name !== 'Admin') {
    return { error: NextResponse.json({ error: { code: 'FORBIDDEN', message: `The mock directory is read by ${c.name}'s Owners and Admins.` } }, { status: 403 }) }
  }
  return { caller, c }
}

export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  const g = await gate(request, params.slug)
  if ('error' in g && g.error) return g.error
  const { c } = g as Exclude<typeof g, { error: NextResponse }>
  const people = await mockPeople(c.id, c.issuer)
  return NextResponse.json({ data: people.map((p) => ({ id: p.id, name: p.person.name, email: p.email, enabled: !p.disabledAt })) })
}

export async function PATCH(request: NextRequest, { params }: { params: { slug: string } }) {
  const g = await gate(request, params.slug)
  if ('error' in g && g.error) return g.error
  const { caller, c } = g as Exclude<typeof g, { error: NextResponse }>
  const body = await request.json().catch(() => ({}))
  if (typeof body.id !== 'string' || typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: { code: 'VALIDATION', field: 'id', message: 'Say who, and whether to turn them on or off.' } }, { status: 422 })
  }
  const ei = await prisma.externalIdentity.findFirst({ where: { id: body.id, companyId: c.id, issuer: c.issuer }, select: { id: true } })
  if (!ei) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Nobody by that id in the mock directory.' } }, { status: 404 })
  const r = body.enabled
    ? await reprovision({ externalIdentityId: ei.id, surface: 'DIRECTORY', actorPersonId: caller.person.id })
    : await deprovision({ externalIdentityId: ei.id, surface: 'DIRECTORY', actorPersonId: caller.person.id, why: 'turned off at the mock directory' })
  if (!r.ok) return NextResponse.json({ error: { code: 'OWNER_RULES', message: r.says } }, { status: r.status })
  return NextResponse.json({ data: { says: r.says } })
}
