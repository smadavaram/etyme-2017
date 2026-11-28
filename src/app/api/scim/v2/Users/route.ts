import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { appUrl } from '@/lib/app-url'
import { EI_SELECT, SCIM_LIST, isOff, readFilter, scimCaller, scimError, scimJson, userResource } from '@/lib/identity/scim'
import { deprovision, provision } from '@/lib/identity/provision'

/**
 * GET  /scim/v2/Users — list, `filter=userName eq "…"` or `externalId eq "…"`, startIndex, count
 * POST /scim/v2/Users — provision a person: a seat with source SCIM, USER_PROVISIONED
 *
 * Served at /api/scim/v2 and at /scim/v2 (next.config). The bearer token
 * names the company (lib/identity/scim).
 */
const base = () => `${appUrl()}/scim/v2`

export async function GET(request: NextRequest) {
  const who = await scimCaller(request.headers.get('authorization'))
  if (!who.ok) return who.res
  const q = request.nextUrl.searchParams
  const f = readFilter(q.get('filter'))
  if (f === 'unsupported') return scimError(400, 'Only userName eq, externalId eq and id eq filters are supported.', 'invalidFilter')
  const where: Record<string, unknown> = { companyId: who.caller.companyId, issuer: who.caller.provider.issuer }
  if (f?.attr === 'username') where.email = f.value.trim().toLowerCase()
  if (f?.attr === 'externalid') where.subject = f.value
  if (f?.attr === 'id') where.id = f.value
  const startIndex = Math.max(1, Number(q.get('startIndex') ?? 1) || 1)
  const count = Math.min(200, Math.max(0, Number(q.get('count') ?? 100) || 100))
  const [total, rows] = await Promise.all([
    prisma.externalIdentity.count({ where }),
    prisma.externalIdentity.findMany({ where, select: EI_SELECT, orderBy: { createdAt: 'asc' }, skip: startIndex - 1, take: count }),
  ])
  return scimJson({ schemas: [SCIM_LIST], totalResults: total, startIndex, itemsPerPage: rows.length, Resources: rows.map((r) => userResource(r, base())) })
}

export async function POST(request: NextRequest) {
  const who = await scimCaller(request.headers.get('authorization'))
  if (!who.ok) return who.res
  const body = (await request.json().catch(() => null)) as Record<string, any> | null
  const userName = typeof body?.userName === 'string' ? body.userName.trim().toLowerCase() : ''
  if (!userName || !userName.includes('@')) return scimError(400, 'userName must be the person’s work email.', 'invalidValue')
  const subject = typeof body?.externalId === 'string' && body.externalId.trim() ? body.externalId.trim() : userName
  const exists = await prisma.externalIdentity.findUnique({ where: { issuer_subject: { issuer: who.caller.provider.issuer, subject } }, select: { id: true } })
  if (exists) return scimError(409, 'That person is already provisioned.', 'uniqueness')
  const name = String(body?.displayName ?? body?.name?.formatted ?? [body?.name?.givenName, body?.name?.familyName].filter(Boolean).join(' ') ?? '').trim() || null
  const made = await provision({
    companyId: who.caller.companyId, identityProviderId: who.caller.provider.id, issuer: who.caller.provider.issuer,
    subject, email: userName, name, source: 'SCIM', surface: 'SCIM',
  })
  if (!made.ok) return scimError(made.status, made.says, made.status === 409 ? 'uniqueness' : 'invalidValue')
  if (isOff(body?.active)) await deprovision({ externalIdentityId: made.externalIdentityId, surface: 'SCIM', why: 'provisioned inactive' })
  const ei = await prisma.externalIdentity.findUniqueOrThrow({ where: { id: made.externalIdentityId }, select: EI_SELECT })
  return scimJson(userResource(ei, base()), 201)
}
