import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'

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
  const companyId = url.searchParams.get('companyId') ?? caller.company?.id
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
 * Add a holiday to a company's calendar.
 * Accepts single or bulk: { companyId, holidays: [{ date, name, isRecurring?, country? }] }
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const body = await request.json()
  const { companyId, holidays } = body

  if (!companyId || typeof companyId !== 'string') {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'companyId is required', field: 'companyId' } },
      { status: 422 }
    )
  }

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

  // Verify company exists
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
    console.error('Holiday creation failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Failed to add holidays' } },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/holidays
 *
 * Remove a holiday by ID: { id }
 */
export async function DELETE(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const body = await request.json()
  const { id } = body

  if (!id) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'id is required' } },
      { status: 422 }
    )
  }

  const holiday = await prisma.holiday.findUnique({
    where: { id },
    select: { id: true, name: true, companyId: true },
  })

  if (!holiday) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Holiday not found' } },
      { status: 404 }
    )
  }

  await prisma.holiday.delete({ where: { id } })

  return NextResponse.json({
    data: { deleted: true, message: `Removed "${holiday.name}"` },
  })
}
