/**
 * A rate movement prints the amount, not the source that would have
 * printed it.
 *
 * ── What was on the screen ───────────────────────────────────────────
 *
 * `/dashboard/rate-history` computed a rate change like this:
 *
 *     if (diff > 0) return { dollars: `+{compact(diff)}`, … }
 *
 * A template literal with a brace and no dollar sign is not an
 * expression — it is those characters. So **every rate increase in the
 * product printed the text "+{compact(diff)}"** in the column where the
 * amount belongs, for as long as the page has existed. The decrease
 * branch was a real number, which is exactly why nobody caught it: half
 * the column looked right, and a page renders green whether its strings
 * are money or source code.
 *
 * ── Why the arithmetic moved out of the page ─────────────────────────
 *
 * Nothing could have caught it where it lived. A helper inside a page
 * component is reachable only by rendering that page. Money arithmetic
 * belongs in a library, with a test around it — which is the rule, and
 * this is what breaking it costs.
 *
 * The scan at the bottom is the general form: a backtick followed by
 * `+{` or `-{` is always this mistake and never anything else.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative, sep } from 'path'
import { rateMovement } from '@/lib/money-display'

describe('a rate movement says how far a rate moved', () => {

  it('a rate increase shows the amount, never the code that would have printed it', () => {
    // $130.00 → $135.00 an hour.
    const up = rateMovement(13_500, 13_000)
    expect(up.dollars).toBe('+$5')
    expect(up.direction).toBe('up')
    expect(up.dollars).not.toContain('compact')
    expect(up.dollars).not.toContain('{')
  })

  it('a rate cut shows the amount too, to the same precision as a rise', () => {
    // A rise and a fall of the same size used to print differently —
    // "+$5" against "-$5.00" — because each branch formatted itself.
    expect(rateMovement(12_500, 13_000).dollars).toBe('-$5')
    expect(rateMovement(13_500, 13_000).dollars).toBe('+$5')
  })

  it('shows the cents where there are cents', () => {
    expect(rateMovement(13_250, 13_000).dollars).toBe('+$2.50')
    expect(rateMovement(12_750, 13_000).dollars).toBe('-$2.50')
  })

  it('says which way it went, so the row can be colored without re-reading the number', () => {
    expect(rateMovement(13_500, 13_000).direction).toBe('up')
    expect(rateMovement(12_500, 13_000).direction).toBe('down')
    expect(rateMovement(13_000, 13_000).direction).toBe('neutral')
  })

  it('gives the percentage a sign on the way up, because the minus carries itself on the way down', () => {
    expect(rateMovement(13_650, 13_000).pct).toBe('+5.0%')
    expect(rateMovement(12_350, 13_000).pct).toBe('-5.0%')
    expect(rateMovement(13_000, 13_000).pct).toBe('0.0%')
  })

  it('refuses to say how far a first rate moved, rather than dividing by zero', () => {
    // A rate with nothing before it has not moved. "+∞%" and "+$130" are
    // both figures nobody can stand behind.
    for (const nothing of [null, undefined, 0]) {
      const m = rateMovement(13_000, nothing)
      expect(m.dollars).toBe('—')
      expect(m.pct).toBe('—')
      expect(m.direction).toBe('neutral')
    }
  })

  it('brings the currency of the contract, not a dollar sign somebody typed', () => {
    // The old decrease branch hard-coded "$" and divided by a hundred,
    // so a placement priced in any other currency printed dollars.
    const eur = rateMovement(13_500, 13_000, 'EUR')
    expect(eur.dollars).not.toContain('$')
    expect(eur.dollars.startsWith('+')).toBe(true)
  })
})

describe('no screen prints the source of a number instead of the number', () => {
  const DASHBOARD = join(process.cwd(), 'src/app/dashboard')

  function walk(dir: string, found: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full, found)
      else if (/\.(ts|tsx)$/.test(entry)) found.push(full)
    }
    return found
  }

  it('has no template literal that opens a brace without a dollar sign in front of it', () => {
    // `+{` and `-{` after a backtick are the shape this bug takes: a
    // developer writes the interpolation and drops the sigil, and the
    // characters ship. There is no legitimate reason for either inside a
    // template literal, so the scan needs no exception list.
    const offenders: string[] = []
    for (const file of walk(DASHBOARD)) {
      const src = readFileSync(file, 'utf8')
      src.split('\n').forEach((line, i) => {
        if (/`[^`]*[+-]\{/.test(line)) {
          offenders.push(`${relative(process.cwd(), file).split(sep).join('/')}:${i + 1} — ${line.trim()}`)
        }
      })
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('reads enough of the dashboard for that scan to mean something', () => {
    expect(walk(DASHBOARD).length).toBeGreaterThan(40)
  })

  it('leaves the rate history page doing no money formatting of its own', () => {
    // The whole point of moving it: a page that divides by a hundred or
    // types a currency symbol is a page nobody can test.
    const page = readFileSync(join(DASHBOARD, 'rate-history/page.tsx'), 'utf8')
    expect(page).toContain('rateMovement(')
    expect(page, 'still dividing by a hundred on the screen').not.toMatch(/\/\s*100\)\.toFixed/)
  })
})
