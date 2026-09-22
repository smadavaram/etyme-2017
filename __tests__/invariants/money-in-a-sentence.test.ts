/**
 * Every figure a person reads goes through the formatter.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * The third release walk found an AP clerk being refused with
 *
 *     "$999999.00 exceeds outstanding balance of $11600.00"
 *
 * and then told "Payment recorded — $7600.00 remaining". Two things are
 * wrong with that and only one of them is cosmetic. The cosmetic half is
 * that no person writes eleven thousand six hundred dollars as
 * `11600.00`. The other half is the `$`: it is a literal character typed
 * into a template, in front of a figure read off `Invoice.total`, on an
 * invoice that carries its own `currency` column three lines above. An
 * invoice raised in rupees was refused in dollars, and the symbol is the
 * part a reader believes.
 *
 * The worst of the family was not in a payment at all. A contract's own
 * automation entry read
 *
 *     `A line for person ... at $${billRate}/hr`
 *
 * and `SellContract.billRate` is an integer of cents, so a $145/hr
 * placement was recorded as **$14500/hr** — a plausible-looking number
 * that is wrong by a hundred, which is the exact failure `money-units`
 * exists to stop one layer down.
 *
 * ── What is pinned here ──────────────────────────────────────────────
 *
 * Three things, and the third is the one that keeps the other two true.
 *
 * 1. The sentences themselves — a refusal, a confirmation, a diary
 *    entry — read as a person writes money, in the currency the document
 *    was raised in.
 * 2. Two amounts in different currencies are never added into one
 *    figure. `lib/money`'s `add` throws on a mismatch, which is right
 *    for arithmetic and wrong inside a payroll run, where it turns a
 *    sentence into a 500. `totals` is the display answer: group by
 *    currency, and say all of them.
 * 3. No route that moves money builds its own dollar sign. That is a
 *    grep over MONEY's own files, because a sentence written correctly
 *    today is rewritten by hand tomorrow and nothing would notice.
 */

import { describe, it, expect } from 'vitest'
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { amount, compact, fromUnits, rate, totals } from '@/lib/money-display'
import { assessRateChange } from '@/lib/contract-rate'
import { domainOf } from '@/lib/domains'

const ROOT = process.cwd()

describe('A refusal about money says the figures the way a person writes them', () => {

  it('a payment larger than the balance names both figures with a thousands separator', () => {
    // The walk's own numbers. `Invoice.total` and `Payment.amount` are
    // Decimal columns in WHOLE currency, not cents, so `fromUnits` is
    // the helper and picking `amount` here would be wrong by a hundred.
    expect(fromUnits(999999, 'USD')).toBe('$999,999')
    expect(fromUnits(11600, 'USD')).toBe('$11,600')
  })

  it('eleven thousand six hundred dollars never reads 11600.00', () => {
    expect(fromUnits(11600, 'USD')).not.toContain('11600')
  })

  it('a part payment says what is still owed, to the cent where there is one', () => {
    expect(fromUnits(7600, 'USD')).toBe('$7,600')
    expect(fromUnits(7600.5, 'USD')).toBe('$7,600.50')
  })

  it('an invoice raised in rupees is never refused with a dollar sign in front of it', () => {
    const says = fromUnits(11600, 'INR')
    expect(says).not.toContain('$')
    expect(says).toContain('₹')
  })

  it('a placement at a hundred and forty-five dollars an hour does not read fourteen thousand five hundred', () => {
    // SellContract.billRate is cents. This is the bug that was live in
    // the CONTRACT_CREATED diary entry.
    expect(rate(14_500, 'USD')).toBe('$145/hr')
    expect(rate(14_500, 'USD')).not.toContain('14500')
  })

  it('a rate carrying cents keeps them rather than being rounded to the dollar', () => {
    // `Math.round(cents / 100)` printed $145.50/hr as $146/hr.
    expect(rate(14_550, 'USD')).toBe('$145.50/hr')
  })

  it('a rate change is described in the currency of the contract it amends', () => {
    const inRupees = assessRateChange(10_000, 15_000, 'INR')
    expect(inRupees.reason).toContain('₹')
    expect(inRupees.reason).not.toContain('$')
    expect(inRupees.needsApproval).toBe(true)
  })
})

describe('Rupees and dollars are never added', () => {

  it('a payroll batch in one currency reports one total', () => {
    expect(totals([
      { minor: 640_000, currency: 'USD' },
      { minor: 600_000, currency: 'USD' },
    ])).toBe('$12,400.00')
  })

  it('a payroll batch spanning two currencies says both, and never one number', () => {
    const says = totals([
      { minor: 1_240_000, currency: 'USD' },
      { minor: 84_000_000, currency: 'INR' },
    ])
    expect(says).toBe('$12,400.00 and ₹840,000.00')
    // The sum of the two raw integers, printed as dollars, was the figure
    // this replaces. It must not appear.
    expect(says).not.toContain('852,400')
  })

  it('a batch spanning three currencies names all three', () => {
    expect(totals([
      { minor: 100, currency: 'USD' },
      { minor: 200, currency: 'INR' },
      { minor: 300, currency: 'GBP' },
    ])).toBe('$1.00, ₹2.00 and £3.00')
  })

  it('a run that paid nobody says so with a dash rather than zero dollars', () => {
    expect(totals([])).toBe('—')
  })

  it('an amount with no currency beside it is counted as the default rather than dropped', () => {
    // DEFAULT_CURRENCY is a documented, greppable gap. Silently dropping
    // the row would understate a payroll total, which is worse.
    expect(totals([{ minor: 5_000 }])).toBe(amount(5_000))
  })
})

describe('No route that moves money builds its own dollar sign', () => {

  /** Every .ts/.tsx file under src that the map gives to MONEY. */
  function moneyFiles(): string[] {
    const out: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) walk(full)
        else if (/\.tsx?$/.test(name)) out.push(relative(ROOT, full))
      }
    }
    walk(join(ROOT, 'src'))
    return out.filter((f) => domainOf(f)?.key === 'MONEY')
  }

  /**
   * A literal `$` glued to a template interpolation. Precise on purpose:
   * a legitimate divide by a hundred elsewhere does not match, and
   * `${amount(cents)}` does not either.
   */
  const HAND_ROLLED = /\$\$\{/

  function handRolled(files: string[]): string[] {
    const hits: string[] = []
    for (const f of files) {
      readFileSync(join(ROOT, f), 'utf8').split('\n').forEach((line, i) => {
        if (HAND_ROLLED.test(line)) hits.push(`${f}:${i + 1}`)
      })
    }
    return hits
  }

  it('finds the money domain to check', () => {
    expect(moneyFiles().length).toBeGreaterThan(50)
  })

  it('no API route under money writes a dollar sign of its own', () => {
    const routes = moneyFiles().filter((f) => f.startsWith('src/app/api/'))
    expect(routes.length).toBeGreaterThan(10)
    expect(
      handRolled(routes),
      'a figure a person reads must go through lib/money-display, which carries the currency'
    ).toEqual([])
  })

  it('the screens and libraries still formatting money by hand are counted, and the count does not grow', () => {
    // Fourteen local helpers left, each of which divides by a hundred
    // correctly and then hard-codes a dollar sign. They are not wrong
    // numbers — they are wrong currencies waiting for a client who bills
    // in something else, and converting them changes rendered strings on
    // fourteen screens, which is its own piece of work.
    //
    // A ratchet rather than a pass: this may fall and may never rise.
    const rest = moneyFiles().filter((f) => !f.startsWith('src/app/api/'))
    const hits = handRolled(rest)
    expect(hits.length, `still hand-rolling money:\n  ${hits.join('\n  ')}`).toBeLessThanOrEqual(14)
  })
})
