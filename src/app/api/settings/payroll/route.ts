import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import {
  paySettingsFor, setPaySettings, payPeriodAt, recordFirstDayRefused, hasRunPayroll,
  PAY_CHANGE_FIELDS, type PaySettings,
} from '@/lib/payroll-settings'

/**
 * GET   /api/settings/payroll — how often this company pays, and when pay is worked out and paid
 * PATCH /api/settings/payroll — change it
 *
 * The same shape and the same gate as /api/settings/week: any seat of the
 * company may read it, because a worker may ask when they are paid; only
 * a seat that may change settings (by default the Owner or an Admin) may
 * change it. The rules are lib/payroll-settings; this finds the caller's
 * company and says the answer in a sentence.
 *
 * The first pay period's Sunday (2026-11-14) is one more answer through
 * the same door and the same gate. The answer carries `firstPeriod`: the
 * period that Sunday starts, with its work-out day and pay day as the
 * product works them out (`payPeriodAt`), or null where none is set.
 *
 * A moved first day is one row on the activity log, and so is a move
 * asked for by a seat that may not, written before the refusal is sent.
 * The answer also says whether the company has run payroll
 * (`payrollRun`), so the screen asks before moving the day under pay
 * already recorded.
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
    const message = askTheDesk({ doing, needs: 'settings.manage', kind: caller.company?.kind, companyName: caller.company?.name })
    return {
      caller: null,
      refused: { caller, message },
      error: NextResponse.json({ error: { code: 'FORBIDDEN', message } }, { status: 403 }),
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
  return { ...s, setByName: by?.name ?? null, firstPeriod, payrollRun: await hasRunPayroll(companyId) }
}

export async function GET(request: NextRequest) {
  const { caller, error } = await guard(request, 'Reading this company’s payroll', false)
  if (error) return error
  const companyId = caller!.company!.id
  return NextResponse.json({ data: await withName(companyId, await paySettingsFor(companyId)) })
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const g = await guard(request, 'Changing this company’s payroll')
  if (g.error) {
    // A move of the first day by a seat that may not is kept, with the
    // day as it stands and the day asked for, before the refusal is sent.
    if ('refused' in g && g.refused) {
      const { caller: who, message } = g.refused
      await recordFirstDayRefused(who.company!.id, { id: who.person.id, name: who.person.name }, body?.payFirstPeriodStart, message)
    }
    return g.error
  }
  const caller = g.caller
  const companyId = caller!.company!.id
  // Every answer the door takes, by its one list, so the screen that
  // sends them and this route cannot ask for different fields.
  const changes = Object.fromEntries(PAY_CHANGE_FIELDS.map((f) => [f, body?.[f]]))
  const result = await setPaySettings(companyId, { id: caller!.person.id, name: caller!.person.name }, changes)
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
