import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { paySettingsFor, setPaySettings, payPeriodAt, PAY_CHANGE_FIELDS, type PaySettings } from '@/lib/payroll-settings'

/**
 * GET   /api/settings/payroll — how often this company pays, and when pay is worked out and paid
 * PATCH /api/settings/payroll — change it
 *
 * The same shape and the same gate as /api/settings/week: any seat of the
 * company may read it, because a worker may ask when they are paid; only
 * the settings desk may change it. The rules are lib/payroll-settings;
 * this finds the caller's company and says the answer in a sentence.
 *
 * The first pay period's Sunday (2026-11-14) is one more answer through
 * the same door and the same gate. The answer carries `firstPeriod`: the
 * period that Sunday starts, with its work-out day and pay day as the
 * product works them out (`payPeriodAt`), or null where none is set.
 */

async function guard(request: NextRequest, doing: string, change = true) {
  const { caller, error } = await getCallerContext(request)
  if (error) return { caller: null, error }
  if (!caller.company) {
    return {
      caller: null,
      error: NextResponse.json(
        { error: { code: 'NO_COMPANY', message: 'Payroll is set up by a company, and you are not signed in at one.' } },
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

/** The settings, with the name of whoever last set them and the first period, for the screen. */
async function withName(companyId: string, s: PaySettings) {
  const by = s.setById
    ? await prisma.person.findUnique({ where: { id: s.setById }, select: { name: true } })
    : null
  const firstPeriod = s.payFirstPeriodStart ? await payPeriodAt(companyId, s.payFirstPeriodStart) : null
  return { ...s, setByName: by?.name ?? null, firstPeriod }
}

export async function GET(request: NextRequest) {
  const { caller, error } = await guard(request, 'Reading this company’s payroll', false)
  if (error) return error
  const companyId = caller!.company!.id
  return NextResponse.json({ data: await withName(companyId, await paySettingsFor(companyId)) })
}

export async function PATCH(request: NextRequest) {
  const { caller, error } = await guard(request, 'Changing this company’s payroll')
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const companyId = caller!.company!.id
  // Every answer the door takes, by its one list, so the screen that
  // sends them and this route cannot ask for different fields.
  const changes = Object.fromEntries(PAY_CHANGE_FIELDS.map((f) => [f, body?.[f]]))
  const result = await setPaySettings(companyId, caller!.person.id, changes)
  if (!result.ok) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: result.message, field: result.field || undefined } },
      { status: 422 }
    )
  }
  return NextResponse.json({
    data: {
      settings: await withName(companyId, result.settings),
      changed: result.changed,
      message: 'Saved. Pay dates already set keep their dates; this applies from the next contract.',
    },
  })
}
