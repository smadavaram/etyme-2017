import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { setWeekSettings, weekSettingsFor } from '@/lib/days-off'

/**
 * GET   /api/settings/week — the company's days off, and when its hours are due and approved
 * PATCH /api/settings/week — change them
 *
 * Beside the other company settings and behind the same permission,
 * because which days are off moves the same dates the weekend direction
 * does. The rules are `lib/days-off`; this only finds the caller's
 * company and says the answer in a sentence.
 */

async function guard(request: NextRequest, doing: string) {
  const { caller, error } = await getCallerContext(request)
  if (error) return { caller: null, error }
  if (!caller.company) {
    return {
      caller: null,
      error: NextResponse.json(
        { error: { code: 'NO_COMPANY', message: 'A working week belongs to a company.' } },
        { status: 403 }
      ),
    }
  }
  if (!hasPermission(caller.permissions, 'settings.manage')) {
    return {
      caller: null,
      error: NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: askTheDesk({ doing, needs: 'settings.manage', kind: caller.company?.kind, companyName: caller.company?.name }),
          },
        },
        { status: 403 }
      ),
    }
  }
  return { caller, error: null }
}

export async function GET(request: NextRequest) {
  const { caller, error } = await guard(request, 'Reading this company’s working week')
  if (error) return error
  return NextResponse.json({ data: await weekSettingsFor(caller!.company!.id) })
}

export async function PATCH(request: NextRequest) {
  const { caller, error } = await guard(request, 'Changing this company’s working week')
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const result = await setWeekSettings(caller!.company!.id, caller!.person.id, {
    daysOff: body.daysOff,
    hoursDueWeekday: body.hoursDueWeekday,
    approveByWeekday: body.approveByWeekday,
    approvalExtraWeeks: body.approvalExtraWeeks,
  })
  if (!result.ok) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: result.message, field: result.field || undefined } },
      { status: 422 }
    )
  }
  return NextResponse.json({
    data: {
      settings: result.settings,
      changed: result.changed,
      message: 'Saved. Dates already generated keep their dates; this applies from the next week and the next contract.',
    },
  })
}
