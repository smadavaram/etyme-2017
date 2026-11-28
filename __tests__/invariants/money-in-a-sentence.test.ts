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
 * 4. No caveat on a money desk explains itself with a machine name. The
 *    AR page's own chip has read `no limit set` since it was written,
 *    and the caveat two files away said the customer "reads as
 *    NO_LIMIT_SET" — the same fact, once in the reader's words and once
 *    in the enum's, on one screen. CLAUDE.md: "Explain in a sentence,
 *    not a code. The code is for the machine; the sentence is the
 *    product." Pinned as a grep for the same reason the dollar sign is.
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

describe('A caveat on a money desk explains in a sentence, never in a code', () => {

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
   * The text handed to `gaps.push(...)` or `caveats.push(...)`, one entry
   * per call, with the parentheses balanced so a multi-line caveat comes
   * back whole.
   */
  function caveatCalls(source: string): string[] {
    const out: string[] = []
    const opener = /\b(?:gaps|caveats)\.push\(/g
    let m: RegExpExecArray | null
    while ((m = opener.exec(source)) !== null) {
      let depth = 1
      let i = m.index + m[0].length
      const from = i
      while (i < source.length && depth > 0) {
        if (source[i] === '(') depth++
        else if (source[i] === ')') depth--
        i++
      }
      out.push(source.slice(from, i - 1))
    }
    return out
  }

  /**
   * SCREAMING_SNAKE inside a string literal. Two literals are exempt and
   * both for the same reason — nobody reads them.
   *
   * A bare identifier argument, `gaps.push(BOTH_SIDES_WITHHELD)`, is a
   * constant holding a sentence, so only what is quoted is read at all.
   *
   * And a quoted literal that is only the enum — the census importer
   * raises `gaps.push({ kind: 'NOT_A_SPREADSHEET', says })` — is the
   * machine's half of exactly the split CLAUDE.md asks for: the code for
   * the machine, the sentence in `says` beside it. What must never happen
   * is the code turning up **inside** the sentence, so a literal counts
   * only when it is prose: a space, and a word in lower case.
   */
  const LITERAL = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g
  const ENUM = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/
  const IS_PROSE = /\s/

  /** Every machine name that turns up inside a caveat's prose, in one file's text. */
  function machineNamesInSource(source: string): string[] {
    const hits: string[] = []
    for (const call of caveatCalls(source)) {
      let lit: RegExpExecArray | null
      LITERAL.lastIndex = 0
      while ((lit = LITERAL.exec(call)) !== null) {
        const text = lit[2]
        if (!IS_PROSE.test(text) || !/[a-z]{3,}/.test(text)) continue
        const found = ENUM.exec(text)
        if (found) hits.push(`"${found[0]}" inside — ${text.trim().slice(0, 70)}`)
      }
    }
    return hits
  }

  function machineNamesInCaveats(files: string[]): string[] {
    return files.flatMap((f) =>
      machineNamesInSource(readFileSync(join(ROOT, f), 'utf8')).map((h) => `${f}: ${h}`)
    )
  }

  it('finds the caveats the money desks actually raise', () => {
    // AR, AP, invoices, credit, the AP float and the census import all
    // report their own gaps. If this ever falls to nothing the grep below
    // has stopped reading anything and passes for the wrong reason.
    const files = moneyFiles()
    const withCaveats = files.filter((f) => caveatCalls(readFileSync(join(ROOT, f), 'utf8')).length > 0)
    expect(withCaveats.length).toBeGreaterThanOrEqual(6)
  })

  it('no caveat on the receivables or payables desk prints an enum at the reader', () => {
    const desks = moneyFiles().filter(
      (f) => f.startsWith('src/app/api/ar') || f.startsWith('src/app/api/ap')
    )
    expect(desks.length).toBeGreaterThan(2)
    expect(
      machineNamesInCaveats(desks),
      'say it the way the chip on the row says it — "no limit set", not NO_LIMIT_SET'
    ).toEqual([])
  })

  it('no caveat anywhere under money prints an enum at the reader', () => {
    expect(
      machineNamesInCaveats(moneyFiles()),
      'a caveat is the product; the code behind it is not'
    ).toEqual([])
  })

  it('still catches the sentence the AR desk used to carry', () => {
    // Proof the guard would have failed on the real line rather than
    // passing because the regex never matches anything.
    const was =
      "gaps.push(`3 customers here have no credit limit set, so they read as ` +\n" +
      '  `NO_LIMIT_SET. That is not the same as being within a limit.`)'
    expect(machineNamesInSource(was).length).toBe(1)
  })

  it('leaves a caveat held in a named constant alone, because the name is not what is read', () => {
    expect(machineNamesInSource('if (!bothSides) gaps.push(BOTH_SIDES_WITHHELD)')).toEqual([])
  })

  it('leaves a code carried beside its sentence alone, which is the split it asks for', () => {
    // The census importer's own shape: the kind is the machine's, `says`
    // is the reader's. Flagging this would push a route to drop the code
    // it routes on, which is the opposite of the rule.
    const fine = "gaps.push({ line: 0, kind: 'NOT_A_SPREADSHEET', says: 'That file is not a spreadsheet we can read.' })"
    expect(machineNamesInSource(fine)).toEqual([])
  })
})
