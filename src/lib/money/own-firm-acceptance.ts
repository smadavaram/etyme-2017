import { prisma } from '@/lib/db'
import { NOT_THE_SAMPLE_SEAT } from '@/lib/sample-seat'
import { acceptsOnlyForItself } from '@/app/api/timesheets/chain-turn'

/**
 * A one-person firm is never asked to accept its own week.
 *
 * ── The rule ─────────────────────────────────────────────────────────
 *
 * Decided 2026-10-20 and shipped 2026-10-21: where the firm that employs
 * the worker has nobody but the worker to accept hours — Colleen Byrne
 * at Byrne Critical Care LLC — the signature of the firm above stands as
 * her firm's acceptance, and she is never asked for it. The approve route
 * and the approve-by-email door already write it that way
 * (`acceptsOnlyForItself` in `api/timesheets/chain-turn`).
 *
 * ── The fault this exists for ────────────────────────────────────────
 *
 * The second production walk, 2026-10-26: Colleen's own page still read
 * "Then Halcyon Talent and Byrne Critical Care LLC accept them". The list
 * of who signs her week was built from her placement's rungs alone, so it
 * named her own firm as a signer the route will never ask. One rule, read
 * by the route and by every list of signers, so the two cannot disagree:
 * the employer's acceptance is dropped from a list exactly where the route
 * would stand the signature above in for it.
 *
 * Who may accept is the route's own reading: a live seat at the firm whose
 * role holds `timesheets.approve` (or everything), never the shared
 * sample seat. Read off the seats, not the company's kind, because a
 * one-person corporation that seats a bookkeeper has somebody else to
 * accept, and then she is not accepting her own.
 */

/** A signature a worker's week needs, as any list of signers carries it. */
export interface SignerLike {
  companyId: string
  role: string
}

/**
 * The signers the worker's week actually asks for: the same list, with
 * the employer's acceptance taken out where the employer is a firm that
 * accepts only for the worker herself. Pure; keeps the order and every
 * other signer.
 */
export function withoutOwnFirmAcceptance<S extends SignerLike>(
  signers: readonly S[],
  acceptsOnlyForWorker: ReadonlySet<string>
): S[] {
  return signers.filter((s) => !(s.role === 'EMPLOYER_ACCEPTANCE' && acceptsOnlyForWorker.has(s.companyId)))
}

/**
 * Of these firms, the ones where every seat that may accept hours is the
 * worker's own — the firms whose acceptance the route stands in for.
 * One read for all of them.
 */
export async function firmsAcceptingOnlyFor(
  workerId: string,
  companyIds: readonly string[]
): Promise<Set<string>> {
  const ids = [...new Set(companyIds)]
  if (ids.length === 0) return new Set()
  const seats = await prisma.context.findMany({
    where: {
      companyId: { in: ids },
      revokedAt: null,
      role: { permissions: { hasSome: ['timesheets.approve', '*'] } },
      ...NOT_THE_SAMPLE_SEAT,
    },
    select: { companyId: true, personId: true },
  })
  const byFirm = new Map<string, { personId: string }[]>()
  for (const s of seats) {
    if (!s.companyId) continue
    const list = byFirm.get(s.companyId) ?? []
    list.push({ personId: s.personId })
    byFirm.set(s.companyId, list)
  }
  return new Set(ids.filter((id) => acceptsOnlyForItself(byFirm.get(id) ?? [], workerId)))
}
