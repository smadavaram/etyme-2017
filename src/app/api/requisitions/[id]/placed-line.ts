/**
 * The sell line a filled job request is priced from. Pure: no database.
 *
 * Sign-up walk, round six (2026-10-08), problem 2. In a chain every rung
 * writes a sell line carrying the client's requirement: Computer Systems
 * bills Northbend $145 for Helena Marsh, Techpeple bills Computer Systems
 * $118. The page mapped every line by person and the last one written
 * won, so Northbend read "Filled by Helena Marsh at $118/hr" — the rung
 * below the one it pays. The client sees the contract it pays and nothing
 * below it (`lib/chain-top`).
 *
 * So a submission's line is the one the submitting firm sells to the
 * firm it submitted to, and only where that buyer is the reader. A line
 * between two other firms is never the reader's figure; where none
 * qualifies the answer is null, never a neighbour's rate.
 */
export interface PlacedLine {
  id: string
  personId: string
  companyId: string
  clientCompanyId: string
  billRate: number
  createdAt: Date
}

export function lineTheReaderPays<T extends PlacedLine>(
  lines: readonly T[],
  sub: { personId: string; fromCompanyId: string; toCompanyId: string },
  readerCompanyId: string | null | undefined
): T | null {
  if (!readerCompanyId || sub.toCompanyId !== readerCompanyId) return null
  const mine = lines.filter((l) => l.personId === sub.personId && l.clientCompanyId === readerCompanyId)
  const exact = mine.filter((l) => l.companyId === sub.fromCompanyId)
  const pool = exact.length > 0 ? exact : mine
  if (pool.length === 0) return null
  // Two lines the reader pays for one person on one job (a replacement on
  // the same terms): the newest is the one standing.
  return [...pool].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
}
