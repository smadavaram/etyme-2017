import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * The sweep behind record 120 (pods): a member line of a sold team on outcome
 * work is never the client's to read. Every file that reads SellContract rows
 * either goes through the one filter (`clientLineWhere`, `visibleToReader`,
 * `endClientFilter`, `outcomeTeamLines`) or is named below with the reason it
 * may not. A new reader fails here until somebody says which side it reads.
 *
 * Reading by the seller's own company id, or by ids another reader already
 * chose, is not a client reader. The groups say which.
 */
const ROOT = join(__dirname, '..', '..')
const FILTERS = /clientLineWhere|visibleToReader|outcomeTeamLines|endClientFilter\(/
const READS = /\b(?:sellContract)\.(?:findMany|findFirst|findUnique|aggregate|groupBy|count)\b/

const SELLER = 'reads the firm’s own lines by its own company id: the seller reads its own member lines'
const BY_ID = 'reads lines by ids another reader, already filtered or the seller’s own, chose'
const DEAL = 'asks only whether two firms trade or what a firm holds of its own, never who or what rate'
const PAPERS = 'a hidden member still needs her papers: read by the firm that holds them, never printed to the client by this file'
const WORKER = 'a worker reading her own work'
const SEED = 'seed, demo or simulation data, never a request'

/** [path prefix or regex source, the reason it is not a client reader]. Every entry must still match a file. */
const NOT_A_CLIENT_READER: [string, string][] = [
  ['src/app/api/ar/', SELLER], ['src/app/api/ap/bills', DEAL],
  ['src/app/api/invoices/', SELLER], ['src/app/api/purchase-orders', SELLER], ['src/app/api/rolloff', SELLER],
  ['src/app/api/bench/', SELLER], ['src/app/api/money-loop/', SELLER], ['src/app/api/profitability', SELLER],
  ['src/app/api/today/', SELLER], ['src/app/api/payroll/', SELLER], ['src/app/api/cron/', SELLER],
  ['src/app/api/consultants/', SELLER], ['src/app/api/submissions/', SELLER], ['src/app/api/loose-ends', SELLER],
  ['src/app/api/releasing-soon', SELLER], ['src/app/api/outbound-pack', SELLER], ['src/app/api/packet', SELLER],
  ['src/app/api/records/', SELLER], ['src/app/api/requirements/', SELLER],
  ['src/app/api/program/milestones/[id]/decide', BY_ID],
  ['src/app/api/timesheets/', BY_ID], ['src/app/api/expenses', BY_ID], ['src/app/api/placements/', BY_ID],
  ['src/app/api/contracts/', BY_ID], ['src/app/api/conversations/', BY_ID],
  ['src/app/api/me/', WORKER],
  ['src/app/api/companies/', DEAL], ['src/app/api/suppliers/', DEAL], ['src/app/api/contacts', DEAL],
  ['src/app/api/counterparties', DEAL], ['src/app/api/settings/', DEAL], ['src/app/api/legal-holds', DEAL],
  ['src/app/api/data-requests', DEAL], ['src/app/api/access/', DEAL], ['src/app/api/blacklist/', DEAL],
  ['src/app/api/census/', SEED], ['src/app/api/vendors/', DEAL],
  ['src/app/api/compliance/', PAPERS], ['src/app/api/documents/', PAPERS], ['src/app/api/interviews', PAPERS],
  ['src/app/api/onboarding/', PAPERS],
  ['src/app/dashboard/layout.tsx', 'a signed-in seat’s own lines for the hat switch'],
  ['src/lib/document-stages/', PAPERS], ['src/lib/notify/', PAPERS], ['src/lib/contract-clearance', PAPERS],
  ['src/lib/credential-chase', PAPERS], ['src/lib/document-request', PAPERS], ['src/lib/document-requirements', PAPERS],
  ['src/lib/work-country', PAPERS], ['src/lib/erasure', 'erasing a person’s own record, never a read for a client'],
  ['src/lib/money/', SELLER],
  ['src/lib/work-chain-read', BY_ID], ['src/lib/invoice-match', BY_ID],
  ['src/lib/agents/', SELLER], ['src/lib/skills/', SELLER], ['src/lib/twin/', SELLER],
  ['src/lib/answers', SELLER], ['src/lib/own-seat', WORKER], ['src/lib/your-terms', WORKER],
  ['src/lib/agreement-term', DEAL], ['src/lib/award/', SELLER], ['src/lib/order-postings', SELLER],
  ['src/lib/contract-cycles', SELLER], ['src/lib/cycle-complete', SELLER], ['src/lib/expense-currency', BY_ID],
  ['src/lib/rate-line', BY_ID], ['src/lib/company-create', DEAL], ['src/lib/setup-checklist-state', DEAL],
  ['src/lib/suppliers-of', DEAL], ['src/lib/match-pool', DEAL], ['src/lib/sites', 'whether a site holds a placement, to refuse deleting it: a hidden line holds the site too'],
  ['src/lib/team-structure/', SELLER], ['src/lib/consultant-portfolio/', SELLER], ['src/lib/census-import', SEED], ['src/lib/data-request', 'sandbox erase'],
]

/**
 * Client-reachable readers still open, each reported to its owner. This list
 * may only shrink: fixing one means deleting its line here.
 */
const KNOWN_OPEN: [string, string][] = [
  ['src/lib/program-seat.ts', 'noteSeatRead lists every person on the client’s book for the access log, including a hidden member (the log row, not a screen); owner of lib/program-seat'],
  ['src/lib/api-context.ts', 'a refusal logs the people the client’s lines name, including a hidden member (the log row, not a screen); owner of lib/api-context'],
  ['src/lib/supplier-desks.ts', 'finds one line to read a supplier’s terms; no figure or name of a member is printed; owner of lib/supplier-desks'],
  ['src/lib/public-site.ts', 'counts the client’s live lines for a public page; a hidden member is counted; owner of lib/public-site'],
  ['src/app/api/vendors/scorecards/route.ts', 'counts who started from each supplier by the client’s lines, a hidden member among them; SUPPLY owns it, the change is clientLineWhere on line 89'],
  ['src/app/api/packets/examination.ts', 'a supplier reads the lines it holds at a buyer: seller side, listed for the owner to confirm'],
]

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(relative(ROOT, full))
  }
  return out
}

const readers = walk(join(ROOT, 'src')).filter((f) => {
  if (f === 'src/lib/money/team-lines.ts') return false
  if (/seed|demo|simulate/i.test(f)) return false
  return READS.test(readFileSync(join(ROOT, f), 'utf8'))
})
const unfiltered = readers.filter((f) => !FILTERS.test(readFileSync(join(ROOT, f), 'utf8')))
const reasonFor = (f: string) => NOT_A_CLIENT_READER.find(([p]) => f.startsWith(p))?.[1] ?? null
const openFor = (f: string) => KNOWN_OPEN.find(([p]) => f === p)?.[1] ?? null

describe('the member lines of a sold team on outcome work are hidden from every reader on the client’s side', () => {
  it('every file that reads sell lines goes through the client filter or says why it is not a client reader', () => {
    const unsaid = unfiltered.filter((f) => !reasonFor(f) && !openFor(f))
    expect(unsaid, `Say which side these read, in NOT_A_CLIENT_READER, or send them through clientLineWhere:\n${unsaid.join('\n')}`).toEqual([])
  })

  it('no allowlist entry names a file that no longer reads sell lines, or that now uses the filter', () => {
    const stale = [...NOT_A_CLIENT_READER, ...KNOWN_OPEN].filter(([p]) => !unfiltered.some((f) => f.startsWith(p))).map(([p]) => p)
    expect(stale).toEqual([])
  })

  it('the client readers that were fixed for pods still read through the filter', () => {
    const fixed = [
      'src/app/api/ap/cash-forecast.ts', 'src/lib/money/receipt-options.ts', 'src/lib/money/receipt-file-read.ts',
      'src/lib/money/paid-line.ts', 'src/lib/money/tenant-statement.ts', 'src/app/api/rate-history/route.ts',
      'src/app/api/contracts/route.ts', 'src/app/api/payroll/route.ts', 'src/app/api/placements/[id]/route.ts',
      'src/lib/twin/rules/tenure.ts', 'src/app/api/tenure/route.ts', 'src/app/api/program/view.ts',
    ]
    const loose = fixed.filter((f) => !FILTERS.test(readFileSync(join(ROOT, f), 'utf8')))
    expect(loose).toEqual([])
  })

  it('the open list names only files that still read through no filter, so it can only shrink', () => {
    for (const [p] of KNOWN_OPEN) expect(unfiltered, p).toContain(p)
    expect(KNOWN_OPEN.length).toBeLessThanOrEqual(6)
  })

  it('a client-facing reader of a hidden line is found by this sweep, not by a person reading a file', () => {
    expect(readers.length).toBeGreaterThan(100)
    expect(readers).toContain('src/app/api/ap/cash-forecast.ts')
  })
})
