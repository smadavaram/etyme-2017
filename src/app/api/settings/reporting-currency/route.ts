import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { readReportingAsk } from '@/lib/reporting-currency-setting'

/**
 * GET   /api/settings/reporting-currency — the currency spend rolls up into, and the rates set
 * PATCH /api/settings/reporting-currency — set them; the settings role only
 *
 * The rollup in one currency is money's (lib/money/reporting-currency);
 * these are the company's own figures behind it, each recorded with who
 * set it and when (2026-10-27). The rules are lib/reporting-currency-setting.
 */

async function seat(request: NextRequest, change: boolean) {
  const { caller, error } = await getCallerContext(request)
  if (error) return { caller: null, error }
  if (!caller.company) {
    return { caller: null, error: NextResponse.json({ error: { code: 'NO_COMPANY', message: 'A reporting currency is set by a company, and you are not signed in at one.' } }, { status: 403 }) }
  }
  if (change && !hasPermission(caller.permissions, 'settings.manage')) {
    return {
      caller: null,
      error: NextResponse.json({
        error: { code: 'FORBIDDEN', message: askTheDesk({ doing: 'Setting the reporting currency and exchange rates', needs: 'settings.manage', kind: caller.company.kind, companyName: caller.company.name }) },
      }, { status: 403 }),
    }
  }
  return { caller, error: null }
}

async function current(companyId: string) {
  const [company, rates] = await Promise.all([
    prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { homeCurrency: true, reportingCurrency: true, reportingCurrencySetAt: true, reportingCurrencySetById: true },
    }),
    prisma.fxRate.findMany({
      where: { companyId },
      orderBy: [{ fromCurrency: 'asc' }, { effectiveOn: 'desc' }],
      select: { fromCurrency: true, toCurrency: true, rate: true, effectiveOn: true, source: true, createdAt: true, setBy: { select: { name: true } } },
    }),
  ])
  // Who set it is a recorded id, not a relation (lib/seed-rebuild deletes people before companies).
  const setBy = company.reportingCurrencySetById
    ? await prisma.person.findUnique({ where: { id: company.reportingCurrencySetById }, select: { name: true } })
    : null
  return {
    reportingCurrency: company.reportingCurrency ?? company.homeCurrency,
    homeCurrency: company.homeCurrency,
    setBy: setBy?.name ?? null,
    setAt: company.reportingCurrencySetAt,
    rates: rates.map((r) => ({ ...r, rate: Number(r.rate), setBy: r.setBy?.name ?? null })),
  }
}

export async function GET(request: NextRequest) {
  const { caller, error } = await seat(request, false)
  if (error) return error
  return NextResponse.json({ data: await current(caller!.company!.id) })
}

export async function PATCH(request: NextRequest) {
  const { caller, error } = await seat(request, true)
  if (error) return error
  const companyId = caller!.company!.id
  const personId = caller!.person.id
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { homeCurrency: true, reportingCurrency: true } })

  const read = readReportingAsk(await request.json().catch(() => ({})), company.reportingCurrency ?? company.homeCurrency)
  if (!read.ok) return NextResponse.json({ error: { code: 'VALIDATION', message: read.says } }, { status: 422 })

  const now = new Date()
  await prisma.$transaction([
    ...(read.ask.reportingCurrency !== undefined
      ? [prisma.company.update({
          where: { id: companyId },
          data: { reportingCurrency: read.ask.reportingCurrency, reportingCurrencySetById: personId, reportingCurrencySetAt: now },
        })]
      : []),
    ...read.ask.rates.map((r) =>
      prisma.fxRate.upsert({
        where: { companyId_fromCurrency_toCurrency_effectiveOn: { companyId, fromCurrency: r.from, toCurrency: read.into, effectiveOn: r.effectiveOn } },
        update: { rate: r.rate, source: r.source ?? 'manual', setById: personId },
        create: { companyId, fromCurrency: r.from, toCurrency: read.into, rate: r.rate, effectiveOn: r.effectiveOn, source: r.source ?? 'manual', setById: personId },
      })
    ),
  ])
  return NextResponse.json({ data: { ...(await current(companyId)), message: 'Saved. The rollup uses these from the day each applies.' } })
}
