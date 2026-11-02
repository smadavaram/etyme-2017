import type { CallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { endClientFilter } from '@/lib/resolve-end-client'
import { resolveProgram, unitsReachedBy } from '@/lib/resolve-client-company'
import { accountFilterFor } from '@/lib/account-walls'
import { andAll } from '@/lib/walls'
import { regionContracts } from '@/lib/region-scope'
import { reportingRatesFor } from '@/lib/money/reporting-currency'
import { readerScope } from './reader-scope'
import { topRungs, headcount, suppliersOnSite, needsReportingRates, spendFigures } from './figures'

/**
 * The program page's four headline figures, and nothing else: how many
 * people are on site, through how many suppliers, and what a month costs
 * and in which currency.
 *
 * For Ask Etyme's greeting, which says those figures in one line and read
 * the whole program page to get them: for Northbend's owner the page was
 * 77 of the greeting's 313 queries, most of them start paperwork worked
 * out for the same starts the decisions list works out in the same
 * request, a queue the greeting does not draw, names it does not print,
 * and today's activity (conversation's measurement, 2026-11-01). This
 * reads the same program the page reads, behind the same walls — the
 * client or the seat (`resolveProgram`), a seat's units, a region or a
 * plant's reach, the firm's account walls — and works the figures out
 * with the page's own arithmetic (`./figures`), so a figure here is the
 * page's figure.
 *
 * Start paperwork is not worked out here at all. The greeting's queue
 * (`GET /api/decisions`) works it out once for a client's held starts,
 * and a seat in a client's program reads the page's own queue, which is
 * the page's one working of it; so in one greeting it is worked out once.
 *
 * No name is selected and nothing about a person leaves this function but
 * a count, so it writes no access-log row, the same as the region
 * rollup's count (`regionsOwed`). The page, which names people, logs
 * every one of them as before.
 */

export interface ProgramSummary {
  client: { id: string; name: string }
  /** True where the reader is in a seat this client granted another company. */
  seated: boolean
  summary: {
    /** People working on site today. */
    activeContractors: number
    /** People with a live line here: on site, and signed but not started. */
    contractors: number
    notStarted: number
    /** Suppliers with somebody on site. */
    vendors: number
    monthlySpend: number | null
    monthlySpendCurrency: string | null
    monthlySpendByCurrency: { currency: string; minor: number }[]
    monthlySpendSays: string
  }
  /**
   * Every top rung, in the shape the greeting already reads off the page
   * (`pictureOf`): its state and the id of the firm this client pays.
   * No name, no rate, no person.
   */
  contractors: { contractId: string; state: string; vendor: { id: string } }[]
}

export async function programSummary(
  caller: CallerContext,
  requestedClientId: string | null
): Promise<{ error?: Awaited<ReturnType<typeof resolveProgram>>['error']; data?: ProgramSummary }> {
  const { client, seat, acting, error } = await resolveProgram(caller, requestedClientId)
  if (error) return { error }
  const now = new Date()

  // The same walls the page reads behind, read at once: a seat's units,
  // a region or a plant's reach, and the firm's account walls.
  const [seatUnits, reach, wall] = await Promise.all([
    unitsReachedBy(seat),
    readerScope(caller, client.id),
    accountFilterFor(acting),
  ])
  const unitWall: Record<string, unknown> = seatUnits ? { orgUnitId: { in: seatUnits } } : {}
  const reachWall: Record<string, unknown> = reach ? regionContracts(reach.scope) : {}

  // The page's own read of the program's live lines, the columns the
  // figures need and no others.
  const everyRung = await prisma.sellContract.findMany({
    where: andAll(endClientFilter(client.id), wall.where, unitWall, reachWall, {
      state: { in: ['IN_PROGRESS', 'DRAFT', 'PENDING_VERIFICATION', 'VERIFIED'] },
    }),
    select: {
      id: true, personId: true, companyId: true, clientCompanyId: true,
      state: true, billRate: true, billCurrency: true,
    },
    orderBy: { endDate: 'asc' },
  })

  const { contracts, onSite } = topRungs(everyRung)
  const rates = needsReportingRates(onSite) ? await reportingRatesFor(client.id, now) : null
  const money = spendFigures(onSite, rates, now)

  return {
    data: {
      client: { id: client.id, name: client.name },
      seated: seat != null,
      summary: {
        ...headcount(contracts, onSite),
        vendors: suppliersOnSite(onSite).length,
        ...money,
      },
      contractors: contracts.map((c) => ({ contractId: c.id, state: c.state, vendor: { id: c.companyId } })),
    },
  }
}
