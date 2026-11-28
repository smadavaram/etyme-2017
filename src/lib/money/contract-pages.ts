/**
 * The Contracts page reads every line the firm has, not the route's first
 * page (the fourth screen walk, 2026-11-03, M5).
 *
 * The page asked `GET /api/contracts?side=…` once, got its default 20 of
 * 28, and counted, totaled and paged only those: "All 20 · Active 20 ·
 * $2,441/hr · 1–20 of 20" where the firm had 28 lines, 26 running, at
 * $3,206/hr. A partial list shown as the whole one. So the page reads the
 * route's pages in turn, by its own `pagination.totalPages`, and every
 * count, the rate total and "1–20 of N" stand on the same rows.
 *
 * A later page that fails is a failure of the whole read, never a shorter
 * list: a count over part of the book is not the book's count.
 *
 * Pure: no database; the fetch is handed in, so it is safe in the browser
 * and testable without one.
 */

/** The largest page the route serves (`limit` is capped at 50 there). */
export const CONTRACTS_PAGE = 50

export type ContractsSide = 'sell' | 'buy'

/** The address of one page of one side of the list. */
export function contractsPageUrl(side: ContractsSide, page: number): string {
  return `/api/contracts?side=${side}&limit=${CONTRACTS_PAGE}&page=${page}`
}

/** One answer from the route, already read as JSON. */
export interface PageAnswer {
  ok: boolean
  status: number
  body: any
}

/** The pages still to read after the first, from the route's own count. */
export function contractPagesAfterFirst(totalPages: unknown): number[] {
  const n = typeof totalPages === 'number' && Number.isFinite(totalPages) ? Math.floor(totalPages) : 1
  const out: number[] = []
  for (let p = 2; p <= n; p++) out.push(p)
  return out
}

/**
 * Every page of one side, as one answer: the first page's body with
 * `data.contracts` holding every row (each line once, by id), and
 * `pagination` saying it is the whole list. A refusal or failure on any
 * page is returned as it came.
 */
export async function readEveryContractPage(
  side: ContractsSide,
  get: (url: string) => Promise<PageAnswer>
): Promise<PageAnswer> {
  const first = await get(contractsPageUrl(side, 1))
  if (!first.ok) return first
  const rows: any[] = [...(first.body?.data?.contracts ?? [])]
  for (const p of contractPagesAfterFirst(first.body?.data?.pagination?.totalPages)) {
    const next = await get(contractsPageUrl(side, p))
    if (!next.ok) return next
    rows.push(...(next.body?.data?.contracts ?? []))
  }
  const seen = new Set<string>()
  const every = rows.filter((r) => {
    const id = r?.id
    if (typeof id !== 'string') return true
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
  return {
    ...first,
    body: {
      ...first.body,
      data: {
        ...first.body?.data,
        contracts: every,
        pagination: { page: 1, limit: every.length, total: every.length, totalPages: 1 },
      },
    },
  }
}

/** The browser's fetch, read as a `PageAnswer`. */
export async function fetchPage(url: string): Promise<PageAnswer> {
  const res = await fetch(url)
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, body }
}
