import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { resolveOwnCompany } from '@/lib/resolve-client-company'
import { mayEditCalendar } from './who'

/**
 * GET /api/holidays
 *
 * Per-company holiday calendar. CLAUDE.md: "Load-bearing for cycle generation."
 *
 * Query params:
 *   companyId — required (whose calendar to view)
 *   year     — optional (filter to a specific year; default: current + next)
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const url = request.nextUrl
  // Same rule as payroll: the URL may name the caller's own company and
  // nothing else. A holiday calendar is not the most sensitive thing in
  // here, but it is business-day arithmetic for whoever owns it.
  const { companyId, error: notYours } = resolveOwnCompany(
    caller,
    url.searchParams.get('companyId')
  )
  if (notYours) return notYours
  const year = url.searchParams.get('year')

  if (!companyId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'companyId is required', field: 'companyId' } },
      { status: 422 }
    )
  }

  // Build date range
  const where: any = { companyId }
  if (year) {
    const y = parseInt(year, 10)
    where.date = {
      gte: new Date(`${y}-01-01`),
      lt: new Date(`${y + 1}-01-01`),
    }
  } else {
    // Current year + next year
    const now = new Date()
    const thisYear = now.getFullYear()
    where.date = {
      gte: new Date(`${thisYear}-01-01`),
      lt: new Date(`${thisYear + 2}-01-01`),
    }
  }

  const holidays = await prisma.holiday.findMany({
    where,
    orderBy: { date: 'asc' },
  })

  return NextResponse.json({
    data: {
      companyId,
      holidays: holidays.map((h) => ({
        id: h.id,
        date: h.date.toISOString().slice(0, 10),
        name: h.name,
        isRecurring: h.isRecurring,
        country: h.country,
      })),
      total: holidays.length,
    },
  })
}

/**
 * POST /api/holidays
 *
 * Add days off to your own company's calendar.
 * Accepts single or bulk: { holidays: [{ date, name, isRecurring?, country? }] }
 *
 * `companyId` in the body is accepted only when it names the caller's own
 * company, and is refused otherwise. It used to be written to as given,
 * which let anybody signed in anywhere add days to anybody's calendar —
 * and a day on a calendar moves the pay days behind it.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const body = await request.json()
  const { holidays } = body

  const verdict = mayEditCalendar(
    {
      companyId: caller.company?.id ?? null,
      companyName: caller.company?.name ?? null,
      permissions: caller.permissions,
    },
    typeof body.companyId === 'string' ? body.companyId : null
  )
  if (!verdict.ok) {
    // Written out here rather than passed to a helper, and the two
    // refusals below do not share one. A name handed to a function is a
    // name that is not at the `automationLog.create` that writes it, and
    // the whole reason this route had no refusal row until now is that a
    // name the ladder's reader cannot see is a name nobody gave a rung.
    // A dozen duplicated lines against that is a good trade.
    if (caller.company?.id) {
      await prisma.automationLog.create({
        data: {
          companyId: caller.company.id,
          action: 'HOLIDAY_ADD_REFUSED',
          summary: `${caller.person.name} tried to add a day off to a calendar that is not theirs to change`,
          reason: verdict.says,
          payload: { by: caller.person.id, aimedAt: typeof body.companyId === 'string' ? body.companyId : null },
          // Nothing happened, so there is nothing to put back.
          reversible: false,
        },
      })
    }
    return NextResponse.json(
      { error: { code: verdict.code, message: verdict.says } },
      { status: verdict.status }
    )
  }
  const companyId = verdict.companyId

  if (!Array.isArray(holidays) || holidays.length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'holidays must be a non-empty array', field: 'holidays' } },
      { status: 422 }
    )
  }

  // Validate each holiday
  for (const h of holidays) {
    if (!h.date || !h.name) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'Each holiday requires date and name' } },
        { status: 422 }
      )
    }
  }

  // The caller's own company, read for its name so the log reads as a
  // sentence. It is the caller's own by construction now — the id came
  // from the session, not from the body.
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  })

  if (!company) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Company not found' } },
      { status: 404 }
    )
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const created = []
      const skipped = []

      for (const h of holidays) {
        const date = new Date(h.date)
        if (isNaN(date.getTime())) {
          skipped.push({ date: h.date, name: h.name, reason: 'Invalid date' })
          continue
        }

        try {
          const holiday = await tx.holiday.create({
            data: {
              companyId,
              date,
              name: h.name.trim(),
              isRecurring: h.isRecurring ?? false,
              country: h.country ?? null,
            },
          })
          created.push({
            id: holiday.id,
            date: holiday.date.toISOString().slice(0, 10),
            name: holiday.name,
          })
        } catch (err: any) {
          if (err?.code === 'P2002') {
            skipped.push({ date: h.date, name: h.name, reason: 'Already exists' })
          } else {
            throw err
          }
        }
      }

      // AutomationLog
      await tx.automationLog.create({
        data: {
          companyId,
          action: 'HOLIDAYS_ADDED',
          summary: `Added ${created.length} holiday(s) to ${company.name}'s calendar`,
          reason: `Manual entry by ${caller.person.id}`,
          payload: {
            created: created.map((c) => c.name),
            skipped: skipped.map((s) => `${s.name} (${s.reason})`),
          },
          reversible: true,
        },
      })

      return { created, skipped }
    })

    return NextResponse.json({
      data: {
        created: result.created.length,
        skipped: result.skipped.length,
        holidays: result.created,
        message: `${result.created.length} holiday(s) added, ${result.skipped.length} skipped`,
      },
    })
  } catch (err: any) {
    reportError('Holiday creation failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Failed to add holidays' } },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/holidays
 *
 * Remove a day from your own company's calendar: { id }
 *
 * Scoped, not looked up. The id used to be taken as given and the row
 * deleted wherever it lived, so a holiday could be lifted off another
 * firm's calendar — which moves that firm's pay days as surely as adding
 * one does. A day that is not this company's reads as not being there.
 */
export async function DELETE(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const body = await request.json()
  const { id } = body

  const verdict = mayEditCalendar(
    {
      companyId: caller.company?.id ?? null,
      companyName: caller.company?.name ?? null,
      permissions: caller.permissions,
    },
    typeof body.companyId === 'string' ? body.companyId : null
  )
  if (!verdict.ok) {
    if (caller.company?.id) {
      await prisma.automationLog.create({
        data: {
          companyId: caller.company.id,
          action: 'HOLIDAY_REMOVE_REFUSED',
          summary: `${caller.person.name} tried to take a day off a calendar that is not theirs to change`,
          reason: verdict.says,
          payload: { by: caller.person.id, aimedAt: typeof body.companyId === 'string' ? body.companyId : null },
          reversible: false,
        },
      })
    }
    return NextResponse.json(
      { error: { code: verdict.code, message: verdict.says } },
      { status: verdict.status }
    )
  }

  if (!id) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'id is required' } },
      { status: 422 }
    )
  }

  const holiday = await prisma.holiday.findFirst({
    where: { id, companyId: verdict.companyId },
    select: { id: true, name: true, companyId: true },
  })

  if (!holiday) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such day on this calendar.' } },
      { status: 404 }
    )
  }

  await prisma.holiday.delete({ where: { id: holiday.id } })

  // Removing a day moves a pay day back onto the day it was shifted off,
  // for everybody this company pays. Adding one was recorded from the
  // first; taking one away was not, so a calendar could be quietly walked
  // back to where it started with nothing on the record.
  await prisma.automationLog.create({
    data: {
      companyId: verdict.companyId,
      action: 'HOLIDAY_REMOVED',
      summary: `${caller.person.name} removed "${holiday.name}" from the calendar`,
      reason:
        'A day off was taken off this company’s calendar. Cycle dates already ' +
        'generated keep the dates they were given; dates generated from here on ' +
        'no longer shift off this day.',
      payload: { holidayId: holiday.id, name: holiday.name, by: caller.person.id },
      // Putting the day back is one POST away, and it is the same day.
      reversible: true,
    },
  })

  return NextResponse.json({
    data: {
      deleted: true,
      message: `Removed "${holiday.name}"`,
      note: 'Cycle dates already generated keep their dates.',
    },
  })
}

/**
 * ── Where a refusal here is filed, and where it is not ───────────────
 *
 * CLAUDE.md asks that a refusal be recorded, and only one of the two
 * ledgers this codebase has will take this one.
 *
 * Not `AccessLog`: that is the trail for reading a *person's* data, and
 * `subjectId` is a required Person. A holiday calendar has no person in
 * it, so filing a refusal there would mean naming somebody as the subject
 * of a read that never happened, and a fabricated row is worse than a missing one,
 * because a fabricated row is what somebody audits.
 *
 * `AutomationLog` fits, and this route now writes three names to it that
 * `src/lib/autonomy.ts` holds rungs for: `HOLIDAY_ADD_REFUSED` and
 * `HOLIDAY_REMOVE_REFUSED` as ENFORCEMENT (BLOCK — somebody asked and was
 * refused), and `HOLIDAY_REMOVED` beside `HOLIDAYS_ADDED`, which is a
 * person's own act. They were asked for rather than invented, because a
 * name with no rung fails `__tests__/invariants/autonomy.test.ts`, and
 * the route and the ladder had to change in one commit or neither.
 *
 * ── Whose log a refusal goes in ──────────────────────────────────────
 *
 * The caller's own company, never the one they aimed at. Filing it
 * against the target would be the same cross-tenant write the refusal
 * exists to stop: anybody could put rows in any firm's log by being
 * refused at it on purpose. The company they aimed at is on the payload,
 * which is where a fact about somebody else belongs.
 *
 * A sign-in at no company is the one refusal that still leaves nothing.
 * `AutomationLog.companyId` is required and there is no honest value for
 * it, and inventing one is the fabricated row above.
 *
 * ── Why the three writes are not one helper ──────────────────────────
 *
 * Because a name handed to a function is a name that is not at the
 * `automationLog.create` that writes it, and the reader in
 * `src/lib/autonomy.ts` — which is what gives a name a rung, and what
 * fails the build when a name has none — reads call sites. A helper
 * taking the name as a parameter was written here first and hid all
 * three again, which is the same defect that let a seat be suspended
 * under ACCESS_SUSPENDD for as long as that route existed. The
 * duplication is the price of a name a reader and a check can both
 * find.
 */
