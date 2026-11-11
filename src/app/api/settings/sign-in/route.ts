import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, getSessionIdentity, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { SIGN_IN_MODES, mayChangeMode, modeSays, effectiveMode, directoryOnlyLockout, type SignInMode } from '@/lib/identity/policy'
import { companyPolicy } from '@/lib/identity/read'
import { recordIdentityEvent } from '@/lib/identity/ledger'

/**
 * GET   /api/settings/sign-in — how this company's people sign in
 * PATCH /api/settings/sign-in — { mode, reason, jit?, scim?, requiredAssurance?, dataRegion?, requireDirectorySuppliers? }
 *
 * The company's sign-in policy (founder, 2026-11-11): directory only,
 * invitation only, or hybrid. Only an Owner changes it; an Admin reads it;
 * nobody else sees it. Every change is in the access log as
 * AUTH_POLICY_CHANGED, written in the same transaction as the change. No
 * screen yet: the settings screen is the second stage of pass 1.
 *
 * Directory-only needs a directory that is turned on, or nobody could sign
 * in at all, the Owner included; that is refused in a sentence.
 */

async function seat(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return { error }
  if (!caller.company) {
    return { error: NextResponse.json({ error: { code: 'NO_COMPANY', message: 'How people sign in is a company setting. Open it from a company seat.' } }, { status: 403 }) }
  }
  const role = caller.context.roleId
    ? await prisma.role.findFirst({ where: { id: caller.context.roleId, companyId: caller.company.id }, select: { name: true } })
    : null
  return { caller, company: caller.company, roleName: role?.name ?? null }
}

export async function GET(request: NextRequest) {
  const s = await seat(request)
  if ('error' in s && s.error) return s.error
  const { company, roleName } = s as Exclude<typeof s, { error: NextResponse }>
  if (roleName !== 'Owner' && roleName !== 'Admin') {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: `How ${company.name}'s people sign in is read by its Owners and Admins.` } },
      { status: 403 },
    )
  }
  const p = await companyPolicy(company.id)
  return NextResponse.json({
    data: {
      mode: p.policy.mode,
      effective: p.effective,
      says: modeSays(p.effective, company.name),
      directories: p.policy.issuers.length,
      jit: p.row?.jit ?? false,
      scim: p.row?.scim ?? false,
      requiredAssurance: p.row?.requiredAssurance ?? null,
      dataRegion: p.row?.dataRegion ?? null,
      requireDirectorySuppliers: p.row?.requireDirectorySuppliers ?? false,
      setBy: p.row?.setBy ?? null,
      setAt: p.row?.setAt ?? null,
      reason: p.row?.reason ?? null,
      mayChange: roleName === 'Owner',
    },
  })
}

const text = (v: unknown, max: number): string | null => {
  const t = typeof v === 'string' ? v.trim().slice(0, max) : ''
  return t || null
}

export async function PATCH(request: NextRequest) {
  const s = await seat(request)
  if ('error' in s && s.error) return s.error
  const { caller, company, roleName } = s as Exclude<typeof s, { error: NextResponse }>
  const by = realPersonId(caller)
  if (!by) {
    return NextResponse.json({ error: { code: 'PERSON_REQUIRED', message: 'An integration cannot change how people sign in. An Owner has to decide this.' } }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const to = String(body.mode ?? '') as SignInMode
  if (!(SIGN_IN_MODES as readonly string[]).includes(to)) {
    return NextResponse.json({ error: { code: 'VALIDATION', field: 'mode', message: 'Choose directory only (SSO_ONLY), invitation only (INVITE_ONLY) or hybrid (HYBRID).' } }, { status: 422 })
  }
  const reason = text(body.reason, 500)
  if (!reason) {
    return NextResponse.json({ error: { code: 'VALIDATION', field: 'reason', message: 'Say why, in a sentence. It is kept beside the change.' } }, { status: 422 })
  }

  const before = await companyPolicy(company.id)
  const may = mayChangeMode({ roleName, to, issuers: before.policy.issuers, companyName: company.name })
  if (!may.ok) return NextResponse.json({ error: { code: may.status === 403 ? 'FORBIDDEN' : 'VALIDATION', field: 'mode', message: may.says } }, { status: may.status })
  // Directory only closes every other door, the Owner's own included, so it
  // is chosen from a session the company's own directory signed in.
  const session = await getSessionIdentity()
  const lockout = directoryOnlyLockout({ to, door: session?.door ?? null, issuer: session?.issuer ?? null, issuers: before.policy.issuers, companyName: company.name })
  if (lockout) return NextResponse.json({ error: { code: 'VALIDATION', field: 'mode', message: lockout } }, { status: 422 })

  const data = {
    mode: to,
    jit: body.jit === true,
    scim: body.scim === true,
    requiredAssurance: text(body.requiredAssurance, 200),
    dataRegion: text(body.dataRegion, 100),
    requireDirectorySuppliers: body.requireDirectorySuppliers === true,
    setById: by,
    setAt: new Date(),
    reason,
  }
  const after = effectiveMode({ ...before.policy, mode: to })
  await prisma.$transaction(async (tx) => {
    await tx.companySignInPolicy.upsert({ where: { companyId: company.id }, create: { companyId: company.id, ...data }, update: data })
    await recordIdentityEvent({
      event: 'AUTH_POLICY_CHANGED', companyId: company.id, actorPersonId: by, subject: { companyId: company.id },
      policy: after, surface: 'WEB',
      says: `${caller.person.name} changed how ${company.name}'s people sign in from ${before.effective} to ${after}: ${reason}`,
    }, tx)
  })

  return NextResponse.json({ data: { mode: to, effective: after, says: modeSays(after, company.name) } })
}
