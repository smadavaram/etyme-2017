import { NextResponse, type NextRequest } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { OWNER_ROLE } from '@/lib/owner-rules'
import { spendCheck } from '@/lib/identity/second-check'
import { recordSecurityEvent } from '@/lib/identity/security-ledger'
import { cleanRoute, mayBringOwnModel, secretStoreReady, SAYS } from '@/lib/model-gateway/tenant-routes'
import { readTenantRoutes, saveTenantRoute } from '@/lib/model-gateway/tenant-routes-db'

/**
 * The company's own model (record 125, level 2). Enterprise edition, Owner
 * only, after a fresh second check. Only the NAME of a key in the platform's
 * secret store is stored; no reply, row or log carries a key. Every refusal
 * is on the security log before it is sent.
 *
 * GET  — the routes and whether keys can be added yet.
 * POST — { tier, label, adapter, modelId, region, dpaSignedOn?, allowPlatformFallback?, proof? }
 */

const NO_STORE = { 'Cache-Control': 'no-store' }
const reply = (status: number, body: unknown) => NextResponse.json(body, { status, headers: NO_STORE })

async function seatIsOwner(roleId: string | null | undefined) {
  if (!roleId) return false
  const r = await prisma.role.findUnique({ where: { id: roleId }, select: { name: true } })
  return r?.name === OWNER_ROLE
}

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const company = caller.company
  if (!company) return reply(403, { error: { code: 'FORBIDDEN', message: SAYS.notOwner } })
  const c = await prisma.company.findUnique({ where: { id: company.id }, select: { edition: true } })
  const allowed = mayBringOwnModel({ edition: c?.edition ?? 'USER', isOwner: await seatIsOwner(caller.context.roleId) })
  if (!allowed.ok) return reply(allowed.status, { error: { code: 'FORBIDDEN', message: allowed.says } })
  const { rows } = await readTenantRoutes(company.id)
  return reply(200, { keysReady: secretStoreReady(), notReadySays: secretStoreReady() ? null : SAYS.storeNotReady, routes: rows })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const body = await request.json().catch(() => ({}))
  const personId = realPersonId(caller)
  const company = caller.company
  const refuse = async (status: number, code: string, message: string, why: string, extra: Record<string, unknown> = {}) => {
    await recordSecurityEvent({
      event: 'MODEL_ROUTE_REFUSED', surface: 'WEB',
      says: 'A request to set the company’s own model was refused.',
      companyId: company?.id ?? null, actorPersonId: personId ?? caller.person.id, subjectCompanyId: company?.id ?? null,
      targetKind: 'model.route', targetId: company?.id ?? 'none', facts: { why },
    })
    return reply(status, { error: { code, message, ...extra } })
  }
  if (!company || !personId || caller.isService || caller.readOnly) return refuse(403, 'FORBIDDEN', SAYS.notOwner, 'not a person at a company')
  const c = await prisma.company.findUnique({ where: { id: company.id }, select: { edition: true } })
  const allowed = mayBringOwnModel({ edition: c?.edition ?? 'USER', isOwner: await seatIsOwner(caller.context.roleId) })
  if (!allowed.ok) return refuse(allowed.status, 'FORBIDDEN', allowed.says, 'edition or seat')

  const clean = cleanRoute(body, company.id)
  if (!clean.ok) return refuse(clean.status, clean.status === 409 ? 'STORE_NOT_READY' : 'VALIDATION', clean.says, 'route refused')

  const act = 'model.route' as const
  const subjectId = company.id
  if (!body.proof) return refuse(403, 'SECOND_CHECK', SAYS.noProof, 'no second check yet', { act, subjectId })
  const spent = await spendCheck({ proof: body.proof, personId, companyId: company.id, act, subjectId })
  if (!spent.ok) return refuse(spent.status, spent.code, spent.says, 'second check refused')

  const saved = await saveTenantRoute(company.id, personId, clean.value)
  await recordSecurityEvent({
    event: 'MODEL_ROUTE_SET', surface: 'WEB',
    says: `${caller.person.name} set the company’s own ${clean.value.tier === 'LOW' ? 'low' : 'high'}-tier model, as Owner, after a second check.`,
    companyId: company.id, actorPersonId: personId, subjectCompanyId: company.id,
    targetKind: 'model.route', targetId: saved.id, facts: { tier: clean.value.tier, keyRef: clean.value.keyRef, platformFallback: clean.value.allowPlatformFallback },
  })
  return reply(200, { ok: true, id: saved.id })
}
