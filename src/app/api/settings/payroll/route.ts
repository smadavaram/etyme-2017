import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { paySettingsFor, setPaySettings, type PaySettings } from '@/lib/payroll-settings'

/**
 * GET   /api/settings/payroll — how often this company pays, and when pay is worked out and paid
 * PATCH /api/settings/payroll — change it
 *
 * The same shape and the same gate as /api/settings/week: any seat of the
 * company may read it, because a worker may ask when they are paid; only
 * the settings desk may change it. The rules are lib/payroll-settings;
 * this finds the caller's company and says the answer in a sentence.
 */

async function guard(request: NextRequest, doing: string, change = true) {
  const { caller, error } = await getCallerContext(request)
  if (error) return { caller: null, error }
  if (!caller.company) {
    return {
      caller: null,
      error: NextResponse.json(
        { error: { code: 'NO_COMPANY', message: 'Payroll belongs to a company.' } },
        { status: 403 }
      ),
    }
  }
  if (change && !hasPermission(caller.permissions, 'settings.manage')) {
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

/** The settings, with the name of whoever last set them, for the screen. */
async function withName(s: PaySettings) {
  const by = s.setById
    ? await prisma.person.findUnique({ where: { id: s.setById }, select: { name: true } })
    : null
  return { ...s, setByName: by?.name ?? null }
}

export async function GET(request: NextRequest) {
  const { caller, error } = await guard(request, 'Reading this company’s payroll', false)
  if (error) return error
  return NextResponse.json({ data: await withName(await paySettingsFor(caller!.company!.id)) })
}

export async function PATCH(request: NextRequest) {
  const { caller, error } = await guard(request, 'Changing this company’s payroll')
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const result = await setPaySettings(caller!.company!.id, caller!.person.id, {
    payPeriod: body.payPeriod,
    payCalcOffsetDays: body.payCalcOffsetDays,
    payDayOffsetDays: body.payDayOffsetDays,
    payDaysOfMonth: body.payDaysOfMonth,
    payCalcDaysBefore: body.payCalcDaysBefore,
  })
  if (!result.ok) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: result.message, field: result.field || undefined } },
      { status: 422 }
    )
  }
  return NextResponse.json({
    data: {
      settings: await withName(result.settings),
      changed: result.changed,
      message: 'Saved. Pay dates already set keep their dates; this applies from the next contract.',
    },
  })
}
