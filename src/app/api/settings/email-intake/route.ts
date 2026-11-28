import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCallerContext, type CallerContext } from '@/lib/api-context'
import { changeIntake, intakeLive, intakeStateFor, INTAKE_ROLES, INTAKE_DOMAIN, NOT_OPEN_YET } from '@/lib/email-intake'

/**
 * GET   /api/settings/email-intake — whether forwarded email is on for the
 *       caller's company, the address's last four characters, and who
 *       turned it on, off or replaced it, and when. Never the address.
 * PATCH /api/settings/email-intake { on?: boolean, replace?: true } — turn
 *       it on or off, and/or replace the address. The whole address is in
 *       this response only when this call made it, and nowhere else, ever.
 *
 * Nothing turns it on while the deployment has not opened it
 * (`EMAIL_INTAKE_LIVE` exactly "1"); turning it off is always allowed.
 *
 * Owner or Admin only (founder, 2026-10-22). A demo company cannot
 * receive email, and a machine key cannot turn it on.
 */
const NO_STORE = { 'cache-control': 'no-store' }

function refuse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status, headers: NO_STORE })
}

async function ownerOrAdmin(caller: CallerContext): Promise<boolean> {
  if (caller.isService || !caller.company || !caller.context.roleId) return false
  if (caller.context.companyId !== caller.company.id) return false
  const role = await prisma.role.findUnique({ where: { id: caller.context.roleId }, select: { name: true, companyId: true } })
  return !!role && role.companyId === caller.company.id && (INTAKE_ROLES as readonly string[]).includes(role.name)
}

const ONLY = 'Only the Owner or an Admin can see or change forwarded email for the company.'

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) return refuse('NO_COMPANY', 'Forwarded email is set for a company, and you are not signed in at one.', 403)
  if (!(await ownerOrAdmin(caller))) return refuse('FORBIDDEN', ONLY, 403)
  const state = await intakeStateFor(caller.company.id)
  return NextResponse.json({ data: { ...state, domain: INTAKE_DOMAIN, open: intakeLive() } }, { headers: NO_STORE })
}

export async function PATCH(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) return refuse('NO_COMPANY', 'Forwarded email is set for a company, and you are not signed in at one.', 403)
  if (!(await ownerOrAdmin(caller))) return refuse('FORBIDDEN', ONLY, 403)
  if (caller.company.isDemo) return refuse('DEMO', 'A demo company cannot receive email.', 403)

  const body = await request.json().catch(() => ({}))
  const on = typeof body?.on === 'boolean' ? body.on : undefined
  const replace = body?.replace === true
  if (on === undefined && !replace) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say on or off, or ask to replace the address.', field: 'on' } }, { status: 422, headers: NO_STORE })
  }
  if (on === true && !intakeLive()) return refuse('NOT_OPEN', NOT_OPEN_YET, 409)
  const out = await changeIntake(caller.company.id, caller.person.id, { on, replace })
  if (!out.ok) return refuse('VALIDATION', out.says, 422)
  return NextResponse.json({ data: { ...out.state, address: out.address, message: out.says } }, { headers: NO_STORE })
}
