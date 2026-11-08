import { prisma } from '@/lib/db'

/**
 * The currency a job's rate, budget, estimate and limit are said in.
 *
 * A job request carries no currency of its own; its figures are typed in
 * the client's own money, the company's `currency`. So a Vietnamese
 * client's job reads its band and its budget in dong and an Indian one's
 * in rupees, through regulatory's sentences (lib/requisition-approval),
 * and a client with no currency on record reads dollars, as before.
 *
 * Only what the sentences say moves. Which jobs need approval does not:
 * comparing a value against a limit written in another currency is a
 * separate decision (coordinator, 2026-11-08).
 */

/** The job's currency from the client's record; dollars where none is set. Pure. */
export function jobCurrencyOf(company: { currency?: string | null } | null | undefined): string {
  const c = company?.currency?.trim()
  return c ? c.toUpperCase() : 'USD'
}

/** Read the client's currency. Never throws: a read that fails says dollars, as every job did before. */
export async function jobCurrency(companyId: string): Promise<string> {
  const co = await prisma.company.findUnique({ where: { id: companyId }, select: { currency: true } }).catch(() => null)
  return jobCurrencyOf(co)
}
