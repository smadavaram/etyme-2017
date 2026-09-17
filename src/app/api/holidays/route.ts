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
    // A refusal leaves no row here, and that is a gap rather than a
    // decision — see the note at the foot of this file.
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

  return NextResponse.json({
    data: {
      deleted: true,
      message: `Removed "${holiday.name}"`,
      note: 'Cycle dates already generated keep their dates.',
    },
  })
}

/**
 * ── Why a refusal here leaves no trail, and what it would take ───────
 *
 * CLAUDE.md asks that a refusal be recorded, and neither ledger this
 * codebase has will take this one.
 *
 * `AccessLog` is the trail for reading a *person's* data: `subjectId` is
 * a required Person. A holiday calendar has no person in it, so filing a
 * refusal there would mean naming somebody as the subject of a read that
 * never happened — a fabricated row is worse than a missing one, because
 * a fabricated row is what somebody audits.
 *
 * `AutomationLog` would fit — this route already writes `HOLIDAYS_ADDED`
 * to it — but every action name it carries needs a rung in
 * `lib/autonomy.ts`, which belongs to the architect, and
 * `__tests__/invariants/autonomy.test.ts` fails on a name with no rung.
 * Three names want a home there and are asked for rather than invented:
 * `HOLIDAY_ADD_REFUSED` and `HOLIDAY_REMOVE_REFUSED` as ENFORCEMENT
 * (BLOCK — somebody asked and was refused), and `HOLIDAY_REMOVED` as
 * attributed, beside `HOLIDAYS_ADDED`, which is a person's own act.
 *
 * Until then the refusal is a sentence to the caller and nothing on the
 * record. Written down here rather than left as a silence.
 */
