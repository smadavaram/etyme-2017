import { prisma } from '@/lib/db'
import { isMine } from '@/lib/counterparty'
import { dealsWith } from '@/app/api/suppliers/direct'

/**
 * Whether the firm a supplier request names has taken part with the
 * client, so the client's last yes may write on it, and Finance's bank
 * check may read and stamp its own payment details.
 *
 * Naming a firm is not the firm agreeing (review, 2026-11-13): a match
 * or a typed domain finds it, and nobody there said yes. So it has taken
 * part only where one of these holds:
 *
 * - it is a company the client recorded itself and nobody has claimed:
 *   the client's own record, the client's to write on;
 * - somebody seated at it, holding the right to answer an ask to link,
 *   answered this request's link (`answeredBy`, written by the link);
 * - the two already deal with each other (`dealsWith`: the client's own
 *   register lists it as a supplier or prime, an agreement, the firm's
 *   register naming the client, an order, a contract, or a job either way).
 */
export async function firmTookPart(clientId: string, firmId: string, application: unknown): Promise<boolean> {
  const firm = await prisma.company.findUnique({ where: { id: firmId }, select: { claimedAt: true, listedById: true } })
  if (!firm) return false
  if (isMine(firm, clientId)) return true
  const answered = ((application ?? {}) as Record<string, any>).answeredBy as { firmId?: string } | null | undefined
  if (answered?.firmId === firmId) return true
  return (await dealsWith(clientId, [firmId], ['SUPPLIER', 'PRIME'])).has(firmId)
}
