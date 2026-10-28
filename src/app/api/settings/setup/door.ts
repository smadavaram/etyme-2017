import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId, type CallerContext } from '@/lib/api-context'
import { hasPermission, askTheDesk } from '@/lib/permissions'

/**
 * The one door the setup checklist's routes go through: a seat at a
 * company holding `settings.manage` (the Owner and the Admin). Everybody
 * else is refused in a sentence that names who does it, before anything
 * is read.
 *
 * The founder, 2026-10-22: "only the Owner and Admin see the checklist".
 */

type Seated = CallerContext & { company: NonNullable<CallerContext['company']> }

export async function setupDoor(
  request: NextRequest,
  doing = 'Reading the setup checklist',
): Promise<{ caller: Seated; personId: string; error: null } | { caller: null; personId: null; error: NextResponse }> {
  const { caller, error } = await getCallerContext(request)
  if (error) return { caller: null, personId: null, error }
  if (!caller.company) {
    return {
      caller: null, personId: null,
      error: NextResponse.json({ error: { code: 'NO_COMPANY', message: 'Setup belongs to a company, and you are not seated at one.' } }, { status: 403 }),
    }
  }
  const personId = realPersonId(caller)
  if (!hasPermission(caller.permissions, 'settings.manage') || !personId) {
    return {
      caller: null, personId: null,
      error: NextResponse.json(
        { error: { code: 'FORBIDDEN', message: askTheDesk({ doing, needs: 'settings.manage', kind: caller.company.kind, companyName: caller.company.name }) } },
        { status: 403 },
      ),
    }
  }
  return { caller: caller as Seated, personId, error: null }
}

export function refused(says: string, status = 422) {
  return NextResponse.json({ error: { code: status === 403 ? 'FORBIDDEN' : 'VALIDATION', message: says } }, { status })
}
