import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { holidaysFor } from '@/lib/holidays'
import { holidaysFrom } from '@/lib/pay-dates'
import { policyFrom } from '@/lib/cycle-shift'
import { holidaysAddedSays } from './says'

/**
 * POST   /api/settings/holidays        — add a day, or seed a country's year
 * DELETE /api/settings/holidays?id=    — remove one
 *
 * The holiday calendar is not decoration. Cycle dates shift off weekends
 * and off these days, so an empty calendar means every due date lands on a
 * public holiday roughly ten times a year and nobody notices until an
 * invoice run fires on Christmas Day.
 *
 * CLAUDE.md names cycle arithmetic as one of the three hardest things in
 * this system. This is its input.
 */

async function guard(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return { caller: null, error }
  if (!caller.company) {
    return {
      caller: null,
      error: NextResponse.json(
        { error: { code: 'NO_COMPANY', message: 'A holiday calendar is set by a company, and you are not signed in at one.' } },
        { status: 403 }
      ),
    }
  }
  if (!hasPermission(caller.permissions, 'settings.manage')) {
    return {
      caller: null,
      error: NextResponse.json(
        { error: { code: 'FORBIDDEN', message: askTheDesk({ doing: 'Changing the holiday calendar', needs: 'settings.manage', kind: caller.company?.kind, companyName: caller.company?.name }) } },
        { status: 403 }
      ),
    }
  }
  return { caller, error: null }
}

export async function POST(request: NextRequest) {
  const { caller, error } = await guard(request)
  if (error) return error
  const companyId = caller!.company!.id

  const body = await request.json().catch(() => ({}))

  // ── Seed a whole year ───────────────────────────────────────────────
  // Adding eleven public holidays one at a time is the kind of task that
  // does not get done, and the calendar stays empty because of it.
  if (body.seedYear) {
    const year = parseInt(String(body.seedYear), 10)
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'Give a year like 2027', field: 'seedYear' } },
        { status: 422 }
      )
    }
    const country = String(body.country ?? 'US').toUpperCase()
    const all = holidaysFor(country, year)
    // `from` (YYYY-MM-DD) adds only the days on or after it: the rest of
    // this year, so a November firm gets Christmas without typing it.
    const from = typeof body.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.from) ? body.from : null
    const days = all ? holidaysFrom(all, from) : null
    if (!days) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_AVAILABLE',
            message: `No built-in calendar for ${country}. Add its days one at a time — seeding another country's dates would look deliberate and nobody would check them again.`,
            field: 'country',
          },
        },
        { status: 422 }
      )
    }
    // Which of them are already on the calendar, read first, so the answer
    // names the days it added rather than a count (./says).
    const key = (d: Date) => d.toISOString().slice(0, 10)
    const there = new Set(
      days.length === 0
        ? []
        : (await prisma.holiday.findMany({
            where: { companyId, date: { in: days.map((h) => new Date(h.date + 'T00:00:00Z')) } },
            select: { date: true },
          })).map((h) => key(h.date))
    )
    const fresh = days.filter((h) => !there.has(h.date))
    const result = await prisma.holiday.createMany({
      data: fresh.map((h) => ({
        companyId,
        date: new Date(h.date + 'T00:00:00Z'),
        name: h.name,
        country,
      })),
      // Re-seeding the same year is a no-op rather than an error, because
      // somebody will click it twice — or twice at once.
      skipDuplicates: true,
    })

    // A pay day already written on one of this company's placements, not
    // yet paid, on a day just added. Said, never moved: the Owner decided
    // (2026-11-17, docs/decisions/92, answer 2) that a holiday added later
    // does not move pay days already written; only periods not yet written
    // take it.
    const onAdded = fresh.length === 0
      ? []
      : await prisma.cycle.findMany({
          where: {
            kind: 'SALARY_PAY',
            completedAt: null,
            // The whole day, whatever hour the date was stored at.
            OR: fresh.map((h) => ({
              dueOn: { gte: new Date(h.date + 'T00:00:00Z'), lt: new Date(Date.parse(h.date + 'T00:00:00Z') + 86_400_000) },
            })),
            buyContract: { companyId },
          },
          select: { dueOn: true, buyContract: { select: { candidates: { select: { person: { select: { name: true } } } } } } },
        })
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { cycleShiftHours: true, cycleShiftPay: true, cycleShiftBill: true, daysOff: true },
    })

    return NextResponse.json(
      {
        data: {
          year,
          country,
          added: result.count,
          skipped: days.length - result.count,
          message: holidaysAddedSays({
            year,
            rest: Boolean(from),
            offered: days,
            added: fresh,
            payDaysOnAdded: onAdded.flatMap((c) =>
              c.buyContract!.candidates.map((k) => ({ date: key(c.dueOn), person: k.person.name }))
            ),
            payMoves: policyFrom(company).pay !== 'NONE',
          }),
        },
      },
      { status: 201 }
    )
  }

  // ── One day ─────────────────────────────────────────────────────────
  const name = String(body.name ?? '').trim()
  const dateRaw = String(body.date ?? '').trim()
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'A holiday needs a name and a date like 2027-07-04',
          field: !name ? 'name' : 'date',
        },
      },
      { status: 422 }
    )
  }

  const date = new Date(dateRaw + 'T00:00:00Z')
  const clash = await prisma.holiday.findFirst({ where: { companyId, date } })
  if (clash) {
    return NextResponse.json(
      { error: { code: 'DUPLICATE', message: `${dateRaw} is already ${clash.name}` } },
      { status: 409 }
    )
  }

  const holiday = await prisma.holiday.create({
    data: {
      companyId,
      date,
      name,
      isRecurring: Boolean(body.isRecurring),
      country: body.country ? String(body.country).toUpperCase().slice(0, 2) : null,
    },
  })

  return NextResponse.json(
    {
      data: {
        holiday: { ...holiday, date: holiday.date.toISOString().slice(0, 10) },
        // Said out loud because it is not obvious: adding a holiday does
        // not move dates that were already generated.
        note: 'Cycle dates already generated keep their dates. This applies from the next contract.',
      },
    },
    { status: 201 }
  )
}

export async function DELETE(request: NextRequest) {
  const { caller, error } = await guard(request)
  if (error) return error

  const id = request.nextUrl.searchParams.get('id') ?? ''
  const existing = await prisma.holiday.findFirst({
    where: { id, companyId: caller!.company!.id },
    select: { id: true, name: true, date: true },
  })
  if (!existing) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such holiday here' } },
      { status: 404 }
    )
  }

  await prisma.holiday.delete({ where: { id } })

  return NextResponse.json({
    data: {
      removed: `${existing.name} on ${existing.date.toISOString().slice(0, 10)}`,
      note: 'Cycle dates already generated keep their dates.',
    },
  })
}
