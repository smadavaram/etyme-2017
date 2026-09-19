/**
 * Resolve the end client where the consultant actually works.
 *
 * BRD Addendum C "layer cake": paying customer (clientCompanyId) can be
 * an MSP, a prime SI, or another vendor. The end client (endClientCompanyId)
 * is the enterprise where the consultant physically works.
 *
 * When endClientCompanyId is null, the paying customer IS the end client
 * (the most common case — direct placement).
 *
 * Tenure (Addendum E) aggregates at the end client, not the paying customer.
 */

/** Returns the company ID where the consultant works. */
export function resolvedEndClientId(contract: {
  clientCompanyId: string
  endClientCompanyId?: string | null
}): string {
  return contract.endClientCompanyId ?? contract.clientCompanyId
}

/**
 * Prisma WHERE clause to find contracts at a given end client.
 * Matches contracts where:
 *   - endClientCompanyId equals the target, OR
 *   - clientCompanyId equals the target AND endClientCompanyId is null
 *     (direct placement — paying customer is the end client)
 */
export function endClientFilter(endClientId: string) {
  return {
    OR: [
      { endClientCompanyId: endClientId },
      { clientCompanyId: endClientId, endClientCompanyId: null },
    ],
  }
}
