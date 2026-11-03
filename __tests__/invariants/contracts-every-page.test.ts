import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  readEveryContractPage, contractsPageUrl, contractPagesAfterFirst, CONTRACTS_PAGE, type PageAnswer,
} from '@/lib/money/contract-pages'
import { activeRateTotals } from '@/lib/money/rate-totals'

/**
 * The fourth screen walk, 2026-11-03, M5: a supplier's Contracts page read
 * "All 20 · Active 20 · $2,441/hr · 1–20 of 20" against 28 lines, 26 of
 * them running at $3,206/hr, because it drew the route's first page as the
 * whole list. These stand the page's figures on a fake route that pages
 * exactly as the real one does.
 */

// 28 lines, newest first; 26 running, 2 ended. The running rates add to
// $3,206/hr: 25 at $120 and one at $206.
const BOOK = Array.from({ length: 28 }, (_, i) => ({
  id: `line-${String(i).padStart(2, '0')}`,
  side: 'sell',
  state: i < 26 ? 'IN_PROGRESS' : 'COMPLETED',
  billRate: i < 25 ? 12_000 : i === 25 ? 20_600 : 9_900,
  billCurrency: 'USD',
}))

/** A route that serves `limit` rows a page, capped at 50, like the real one. */
function route(book = BOOK, opts: { failOn?: number; defaultLimit?: number } = {}) {
  const asked: string[] = []
  const get = async (url: string): Promise<PageAnswer> => {
    asked.push(url)
    const u = new URL(url, 'http://x')
    const page = Math.max(1, Number(u.searchParams.get('page') ?? 1))
    const limit = Math.min(50, Math.max(1, Number(u.searchParams.get('limit') ?? opts.defaultLimit ?? 20)))
    if (opts.failOn === page) return { ok: false, status: 500, body: { error: { message: 'Something went wrong.' } } }
    return {
      ok: true, status: 200,
      body: {
        data: {
          contracts: book.slice((page - 1) * limit, page * limit),
          pagination: { page, limit, total: book.length, totalPages: Math.ceil(book.length / limit) },
          scope: 'firm',
        },
      },
    }
  }
  return { get, asked }
}

/** The same small fake, but serving pages of a given size whatever is asked. */
function routeOfPageSize(size: number) {
  return async (url: string): Promise<PageAnswer> => {
    const page = Math.max(1, Number(new URL(url, 'http://x').searchParams.get('page') ?? 1))
    return {
      ok: true, status: 200,
      body: { data: {
        contracts: BOOK.slice((page - 1) * size, page * size),
        pagination: { page, limit: size, total: BOOK.length, totalPages: Math.ceil(BOOK.length / size) },
      } },
    }
  }
}

const running = (rows: any[]) => rows.filter((r) => r.state === 'IN_PROGRESS')

describe('a supplier’s Contracts page counts every line, not the route’s first page', () => {
  it('a supplier with 28 lines reads All 28 and Active 26 whatever the page size', async () => {
    for (const size of [1, 5, 20, 27, 28, 50]) {
      const res = await readEveryContractPage('sell', routeOfPageSize(size))
      expect(res.ok).toBe(true)
      expect(res.body.data.contracts).toHaveLength(28)
      expect(running(res.body.data.contracts)).toHaveLength(26)
    }
  })

  it('the rate total is over every running line, never page one', async () => {
    const res = await readEveryContractPage('sell', routeOfPageSize(20))
    const totals = activeRateTotals(running(res.body.data.contracts).map((c: any) => ({
      rate: c.billRate, currency: c.billCurrency, withheld: false,
    })))
    expect(totals.lines).toBe(26)
    expect(totals.byCurrency).toEqual([{ currency: 'USD', cents: 320_600 }])
  })

  it('"1–20 of 28" says the whole: the answer says it is every line, and holds each line once', async () => {
    const res = await readEveryContractPage('sell', routeOfPageSize(20))
    expect(res.body.data.pagination).toEqual({ page: 1, limit: 28, total: 28, totalPages: 1 })
    expect(new Set(res.body.data.contracts.map((c: any) => c.id)).size).toBe(28)
    // What the first page's body said beyond the rows is kept.
    expect(res.body.data.contracts[0].id).toBe('line-00')
  })

  it('the page asks for the largest page the route serves, and reads the pages the route says it has', async () => {
    const r = route()
    await readEveryContractPage('buy', r.get)
    expect(CONTRACTS_PAGE).toBe(50)
    expect(r.asked).toEqual([contractsPageUrl('buy', 1)])
    expect(contractPagesAfterFirst(3)).toEqual([2, 3])
    expect(contractPagesAfterFirst(undefined)).toEqual([])
  })

  it('a later page that fails fails the whole read, never shows a shorter list as the whole', async () => {
    const big = Array.from({ length: 120 }, (_, i) => ({ ...BOOK[0], id: `l${i}` }))
    const res = await readEveryContractPage('sell', route(big, { failOn: 2 }).get)
    expect(res.ok).toBe(false)
    expect(res.status).toBe(500)
  })

  it('a refusal on the first page is passed on as it came, so the page draws the sentence and no figure', async () => {
    const res = await readEveryContractPage('sell', async () => ({ ok: false, status: 403, body: { error: { code: 'FORBIDDEN', message: 'No.' } } }))
    expect(res).toEqual({ ok: false, status: 403, body: { error: { code: 'FORBIDDEN', message: 'No.' } } })
  })

  it('the Contracts page reads the list and the client picker through every page, never one bare fetch', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/dashboard/contracts/page.tsx'), 'utf8')
    expect(page).toContain("readEveryContractPage(asked, fetchPage)")
    expect(page).toContain("readEveryContractPage('sell', fetchPage)")
    expect(page).not.toMatch(/fetch\(`\/api\/contracts\?side=/)
    expect(page).not.toContain("fetch('/api/contracts?side=sell&limit=100')")
  })
})
