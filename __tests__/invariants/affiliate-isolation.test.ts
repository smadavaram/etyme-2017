import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

/**
 * Record 129: affiliates only refer. No affiliate figure reads a sell or buy
 * line, a margin, a placement or a placement commission, and no affiliate
 * file imports the files that do. Comments are stripped first: the files say
 * what they never read.
 */

const DIR = join(process.cwd(), 'src/lib/money')
const FILES = readdirSync(DIR).filter((f) => f.startsWith('affiliate-') && f.endsWith('.ts'))
const code = (f: string) => readFileSync(join(DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const PLACEMENT_WORDS = /sellContract|buyContract|contractCommission|\bmargin\b|\bplacement\b|assignment\b|workOrder|projectOrder|timesheet|vendorBill|\bpayroll/i
const PLACEMENT_FILES = /from '(\.\/|@\/lib\/money\/)(margin|commission|profitability|money-chain|order-ledger|pod-margin|bill-)|from '@\/lib\/(commission|profitability|pay-model|work-chain)/

describe('the affiliate engine never touches a placement', () => {
  it('has affiliate files to check', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(4)
  })

  it('reads no sell line, buy line, margin, placement or placement commission in any affiliate file', () => {
    for (const f of FILES) expect(code(f).match(PLACEMENT_WORDS)?.[0] ?? null, f).toBeNull()
  })

  it('imports nothing from the placement side of money in any affiliate file', () => {
    for (const f of FILES) expect(code(f).match(PLACEMENT_FILES)?.[0] ?? null, f).toBeNull()
  })

  it('reads the two subscription figures and no usage or consulting figure', () => {
    for (const f of FILES) expect(code(f).match(/usageCents|consultingCents|usageAfterPrepay/)?.[0] ?? null, f).toBeNull()
  })

  it('never holds or logs an account number: only the sealed column is written and no file reads it back', () => {
    const payout = code('affiliate-payout.ts')
    expect(payout).not.toMatch(/payoutSealed\b[^}]*csv/)
    expect(payout.match(/openTaxId|unseal/)).toBeNull()
  })
})
