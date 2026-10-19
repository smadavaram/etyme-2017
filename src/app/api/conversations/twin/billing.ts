/**
 * What a firm bills today, for Ask Etyme's money line: "Three people are
 * billing: $59,680 a month at current rates."
 *
 * Read from the firm's own sell lines only — the contracts it issues its
 * bills from (`companyId` is the firm) — never from lines scoped by the
 * site it works at. A rate on a firm's own line is a rate it is party to;
 * a rung above or below it in a chain is another pair's, and is not read
 * here at all (CLAUDE.md, "A sub-vendor's name is the prime's to keep";
 * `lib/chain-top` for the client's side, which reads the contract it
 * pays). Kept apart from ./read so that no file of Ask Etyme's both scopes
 * contracts by a site and reads their rates.
 *
 * Reads only. A client's monthly figure is the program dashboard's, read
 * there (`pictureFor` in ./route).
 */

import { prisma } from '@/lib/db'
import type { CallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { accountFilterFor } from '@/lib/account-walls'
import { andAll } from '@/lib/walls'
import { programMonthlySpend } from '@/lib/program-spend'
import type { Billing } from './ask'

export async function firmBilling(caller: CallerContext): Promise<Billing | null> {
  const company = caller.company
  if (!company || company.kind === 'CLIENT' || !hasPermission(caller.permissions, 'invoices.read')) return null
  const wall = await accountFilterFor(caller)
  const lines = await prisma.sellContract.findMany({
    // The firm's own lines, live today: what it bills from.
    where: andAll({ companyId: company.id, state: 'IN_PROGRESS' }, wall.where),
    take: 2000,
    select: { personId: true, billRate: true, billCurrency: true, requirement: { select: { hoursPerWeek: true } } },
  })
  if (lines.length === 0) return null
  const people = new Set(lines.map((l) => l.personId)).size
  const currencies = [...new Set(lines.map((l) => (l.billCurrency ?? 'USD').toUpperCase()))]
  const spend = programMonthlySpend(lines.map((l) => ({ rateMinorPerHour: l.billRate ?? null, hoursPerWeek: l.requirement?.hoursPerWeek ?? null })))
  // A total of some lines presented as the total of all of them is the
  // plausible wrong number; where any line has no rate, or two currencies
  // would be added, the figure is left out.
  const priced = spend.unpriced === 0 && currencies.length === 1
  return { people, monthlyMinor: priced ? spend.totalMinor : null, currency: priced ? currencies[0] : null }
}
