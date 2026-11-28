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

/** [one file, the reason it is not a client reader]. A whole folder is never named: a new file in it must say which side it reads. */
const NOT_A_CLIENT_READER: [string, string][] = [
  ['src/app/api/access/[contextId]/route.ts', DEAL],
  ['src/app/api/ap/bills/route.ts', DEAL],
  ['src/app/api/ar/collections/route.ts', SELLER],
  ['src/app/api/ar/route.ts', SELLER],
  ['src/app/api/bench/burn/route.ts', SELLER],
  ['src/app/api/bench/ours/flag/route.ts', SELLER],
  ['src/app/api/bench/ours/holds/[id]/place/route.ts', SELLER],
  ['src/app/api/bench/ours/holds/route.ts', SELLER],
  ['src/app/api/bench/ours/route.ts', SELLER],
  ['src/app/api/bench/profit/route.ts', SELLER],
  ['src/lib/outreach/pack.ts', 'reads one sell line by id to find the selling firm\u2019s own client for its own detection; the reader is the selling firm, never the client'],
  ['src/lib/outreach/tripwires.ts', 'the selling firm\u2019s own contracts ending, read by its own company id for its own detection; the reader is the selling firm, never the client'],
  ['src/app/api/bench/route.ts', SELLER],
  ['src/app/api/blacklist/known.ts', DEAL],
  ['src/app/api/census/import/route.ts', SEED],
  ['src/app/api/census/page/route.ts', SEED],
  ['src/app/api/census/review/route.ts', SEED],
  ['src/app/api/companies/dealings.ts', DEAL],
  ['src/app/api/companies/positions.ts', DEAL],
  ['src/app/api/compliance/adverse-action/route.ts', PAPERS],
  ['src/app/api/compliance/checklist-items/route.ts', PAPERS],
  ['src/app/api/compliance/clearance/ask.ts', PAPERS],
  ['src/app/api/compliance/clearance/route.ts', PAPERS],
  ['src/app/api/compliance/verifications/record.ts', PAPERS],
  ['src/app/api/compliance/verifications/route.ts', PAPERS],
  ['src/app/api/consultants/[id]/rate-progression/route.ts', SELLER],
  ['src/app/api/consultants/[id]/route.ts', SELLER],
  ['src/app/api/contacts/route.ts', DEAL],
  ['src/app/api/contracts/[id]/activate/route.ts', BY_ID],
  ['src/app/api/contracts/[id]/allocations/route.ts', BY_ID],
  ['src/app/api/contracts/[id]/commissions/route.ts', BY_ID],
  ['src/app/api/contracts/[id]/extend/route.ts', BY_ID],
  ['src/app/api/contracts/[id]/master-contract/route.ts', BY_ID],
  ['src/app/api/contracts/[id]/pay-line/route.ts', BY_ID],
  ['src/app/api/contracts/[id]/rolloff/route.ts', BY_ID],
  ['src/app/api/conversations/twin/billing.ts', BY_ID],
  ['src/app/api/conversations/twin/first-act-read.ts', BY_ID],
  ['src/app/api/conversations/twin/notices.ts', BY_ID],
  ['src/app/api/conversations/twin/worker-read.ts', BY_ID],
  ['src/app/api/counterparties/route.ts', DEAL],
  ['src/app/api/cron/auto-approve/route.ts', SELLER],
  ['src/app/api/cron/end-contracts/route.ts', SELLER],
  ['src/app/api/cron/freshness-ping/route.ts', SELLER],
  ['src/app/api/cron/loose-ends/route.ts', SELLER],
  ['src/app/api/cron/rolloff-scan/route.ts', SELLER],
  ['src/app/api/data-requests/route.ts', DEAL],
  ['src/app/api/documents/requirements/route.ts', PAPERS],
  ['src/app/api/documents/route.ts', PAPERS],
  ['src/app/api/expenses/route.ts', BY_ID],
  ['src/app/api/interviews/route.ts', PAPERS],
  ['src/app/api/invoices/[id]/coding/route.ts', SELLER],
  ['src/app/api/invoices/generate/route.ts', SELLER],
  ['src/app/api/legal-holds/route.ts', DEAL],
  ['src/app/api/loose-ends/route.ts', SELLER],
  ['src/app/api/me/benches/route.ts', WORKER],
  ['src/app/api/me/papers/route.ts', WORKER],
  ['src/app/api/me/scorecard/route.ts', WORKER],
  ['src/app/api/me/work/route.ts', WORKER],
  ['src/app/api/money-loop/periods/[month]/route.ts', SELLER],
  ['src/app/api/money-loop/placements/[id]/route.ts', SELLER],
  ['src/app/api/money-loop/read.ts', SELLER],
  ['src/app/api/money-loop/route.ts', SELLER],
  ['src/app/api/onboarding/confirm-start/route.ts', PAPERS],
  ['src/app/api/onboarding/readiness/route.ts', PAPERS],
  ['src/app/api/outbound-pack/route.ts', SELLER],
  ['src/app/api/packet/[token]/route.ts', SELLER],
  ['src/app/api/packets/route.ts', SELLER],
  ['src/app/api/payroll/off-cycle/route.ts', SELLER],
  ['src/app/api/payroll/window-repair/route.ts', SELLER],
  ['src/app/api/placements/[id]/cut-overtime/route.ts', BY_ID],
  ['src/app/api/placements/[id]/overtime-method/route.ts', BY_ID],
  ['src/app/api/placements/[id]/replace/route.ts', BY_ID],
  ['src/app/api/profitability/route.ts', SELLER],
  ['src/app/api/program/milestones/[id]/decide/route.ts', BY_ID],
  ['src/app/api/purchase-orders/route.ts', SELLER],
  ['src/app/api/records/lookup.ts', SELLER],
  ['src/app/api/releasing-soon/route.ts', SELLER],
  ['src/app/api/requirements/[id]/matches/route.ts', SELLER],
  ['src/app/api/rolloff/route.ts', SELLER],
  ['src/app/api/settings/kind.ts', DEAL],
  ['src/app/api/settings/site/route.ts', DEAL],
  ['src/app/api/submissions/[id]/award/route.ts', SELLER],
  ['src/app/api/submissions/[id]/convert/route.ts', SELLER],
  ['src/app/api/submissions/[id]/offer/route.ts', SELLER],
  ['src/app/api/submissions/[id]/terms/route.ts', SELLER],
  ['src/app/api/submissions/name-if-known.ts', SELLER],
  ['src/app/api/submissions/own-people/route.ts', SELLER],
  ['src/app/api/suppliers/direct.ts', DEAL],
  ['src/app/api/suppliers/join/route.ts', DEAL],
  ['src/app/api/timesheets/[id]/assert/route.ts', BY_ID],
  ['src/app/api/timesheets/ladder.ts', BY_ID],
  ['src/app/api/today/reads.ts', SELLER],
  ['src/app/api/today/route.ts', SELLER],
  ['src/app/dashboard/layout.tsx', 'a signed-in seat’s own lines for the hat switch'],
  ['src/lib/agents/census-keeper.ts', SELLER],
  ['src/lib/agents/contracts-checklist.ts', SELLER],
  ['src/lib/agreement-term.ts', DEAL],
  ['src/lib/answers.ts', SELLER],
  ['src/lib/award/terms-on-record.ts', SELLER],
  ['src/lib/census-import.ts', SEED],
  ['src/lib/company-create.ts', DEAL],
  ['src/lib/consultant-portfolio/margin-reach.ts', SELLER],
  ['src/lib/contract-clearance.ts', PAPERS],
  ['src/lib/contract-cycles.ts', SELLER],
  ['src/lib/credential-chase.ts', PAPERS],
  ['src/lib/cycle-complete.ts', SELLER],
  ['src/lib/data-request.ts', 'sandbox erase'],
  ['src/lib/document-request.ts', PAPERS],
  ['src/lib/document-requirements.ts', PAPERS],
  ['src/lib/document-stages/chain-firms.ts', PAPERS],
  ['src/lib/document-stages/degree-check.ts', PAPERS],
  ['src/lib/document-stages/degree-told.ts', PAPERS],
  ['src/lib/document-stages/line-paper-facts.ts', PAPERS],
  ['src/lib/document-stages/paper-record.ts', PAPERS],
  ['src/lib/document-stages/where-work-is-done.ts', PAPERS],
  ['src/lib/erasure.ts', 'erasing a person’s own record, never a read for a client'],
  ['src/lib/expense-currency.ts', BY_ID],
  ['src/lib/invoice-match.ts', BY_ID],
  ['src/lib/match-pool.ts', DEAL],
  ['src/lib/money/commission-write.ts', SELLER],
  ['src/lib/money/firm-today.ts', SELLER],
  ['src/lib/money/line-ties.ts', SELLER],
  ['src/lib/money/margin-reach.ts', SELLER],
  ['src/lib/money/margin.ts', SELLER],
  ['src/lib/money/milestone-only-lines.ts', SELLER],
  ['src/lib/money/money-chain.ts', SELLER],
  ['src/lib/money/payers-acceptance-read.ts', SELLER],
  ['src/lib/money/placement-pay-terms.ts', SELLER],
  ['src/lib/money/signed-unbilled.ts', SELLER],
  ['src/lib/money/supplier-bills.ts', SELLER],
  ['src/lib/money/week-bill.ts', SELLER],
  ['src/lib/money/weeks-read.ts', SELLER],
  ['src/lib/notify/documents.ts', PAPERS],
  ['src/lib/notify/timesheet-chase-agent.ts', PAPERS],
  ['src/lib/order-postings.ts', SELLER],
  ['src/lib/own-seat.ts', WORKER],
  ['src/lib/rate-line.ts', BY_ID],
  ['src/lib/setup-checklist-state.ts', DEAL],
  ['src/lib/sites.ts', 'whether a site holds a placement, to refuse deleting it: a hidden line holds the site too'],
  ['src/lib/proposals/facts-read.ts', 'the firm counts its own engagements and clients for its own public-sector bid: proposals are a supplier plugin that a client company is never offered, and the read returns counts only, never a member'],
  ['src/lib/skills/checkers/checklist-list.ts', SELLER],
  ['src/lib/skills/checkers/drift-flag.ts', SELLER],
  ['src/lib/suppliers-of.ts', DEAL],
  ['src/lib/team-structure/write.ts', SELLER],
  ['src/lib/twin/supplier-performers.ts', SELLER],
  ['src/lib/twin/supplier-run.ts', SELLER],
  ['src/lib/work-chain-read.ts', BY_ID],
  ['src/lib/work-country.ts', PAPERS],
  ['src/lib/your-terms.ts', WORKER],
  ['src/app/api/packets/examination.ts', 'seller side: the recording firm reads its own placement (companyId is the caller), and the buyer tie check returns only yes or no for the supplier, never a name, rate or member; a hidden member line is still the supplier\u2019s real tie to the client'],
]

/**
 * Client-reachable readers still open, each reported to its owner. This list
 * may only shrink: fixing one means deleting its line here.
 */
const KNOWN_OPEN: [string, string][] = [
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
const reasonFor = (f: string) => NOT_A_CLIENT_READER.find(([p]) => f === p)?.[1] ?? null
const openFor = (f: string) => KNOWN_OPEN.find(([p]) => f === p)?.[1] ?? null

describe('the member lines of a sold team on outcome work are hidden from every reader on the client’s side', () => {
  it('every file that reads sell lines goes through the client filter or says why it is not a client reader', () => {
    const unsaid = unfiltered.filter((f) => !reasonFor(f) && !openFor(f))
    expect(unsaid, `Say which side these read, in NOT_A_CLIENT_READER, or send them through clientLineWhere:\n${unsaid.join('\n')}`).toEqual([])
  })

  it('no allowlist entry names a file that no longer reads sell lines, or that now uses the filter', () => {
    const stale = [...NOT_A_CLIENT_READER, ...KNOWN_OPEN].filter(([p]) => !unfiltered.includes(p)).map(([p]) => p)
    expect(stale).toEqual([])
  })

  it('the allowlist names single files, never a whole folder', () => {
    const folders = NOT_A_CLIENT_READER.filter(([p]) => !/\.tsx?$/.test(p)).map(([p]) => p)
    expect(folders).toEqual([])
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

  it('a proposal’s facts count the firm’s own lines and never select a person, so a hidden member of outcome work cannot be named in a bid', () => {
    const text = readFileSync(join(ROOT, 'src/lib/proposals/facts-read.ts'), 'utf8')
    const lineReads = text.split('\n').filter((l) => /sellContract\.(count|groupBy)/.test(l))
    expect(lineReads).toHaveLength(2)
    for (const l of lineReads) expect(l).not.toMatch(/person|select|include/)
    expect(text).toMatch(/Counts and skills\s+\*?\s*only: never a name/)
  })

  it('the open list names only files that still read through no filter, so it can only shrink', () => {
    for (const [p] of KNOWN_OPEN) expect(unfiltered, p).toContain(p)
    expect(KNOWN_OPEN.length).toBeLessThanOrEqual(4)
  })

  it('a client-facing reader of a hidden line is found by this sweep, not by a person reading a file', () => {
    expect(readers.length).toBeGreaterThan(100)
    expect(readers).toContain('src/app/api/ap/cash-forecast.ts')
  })
})
