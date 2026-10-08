import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  concentration, concentrationReport, dimensionsFor, type Exposure,
} from '@/lib/concentration'

/**
 * Round three of the sign-up walk, 2026-10-08 — the supply side's part.
 *
 * 18: a client's supplier scorecards drew "One client" concentration and
 * said "a first client is a hundred per cent of the revenue". A share
 * with one counterparty is arithmetic, not a finding, and a client has
 * no clients to concentrate on.
 *
 * 16: the rolloff and consultants pages passed a guessed kind into the
 * framing helpers, so a client read supplier words while its session
 * loaded.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const usd = (rows: [string, number][]): Exposure[] =>
  rows.map(([name, amountMinor], i) => ({ id: `e${i}`, name, amountMinor, currency: 'USD' }))

describe('18 · one counterparty is said in a sentence, never drawn as a concentration', () => {
  it('a supplier with one client is told so in a sentence, with no share and no warning', () => {
    const c = concentration({ dimension: 'CLIENT', unit: 'MONEY', exposures: usd([['Northbend Athletic', 120_000_00]]) })
    expect(c.topSharePct).toBeNull()
    expect(c.breach).toBeNull()
    expect(c.says).toBe(
      'One client. All of the revenue comes from Northbend Athletic. With a single client there is ' +
        'nothing to compare it with, so no share is drawn and nothing is flagged.'
    )
  })

  it('a client buying through one supplier is told so in a sentence, with no share and no warning', () => {
    const c = concentration({ dimension: 'SUPPLIER', unit: 'MONEY', exposures: usd([['Techpeple', 80_000_00]]) })
    expect(c.topSharePct).toBeNull()
    expect(c.breach).toBeNull()
    expect(c.says).toContain('All of the supply comes through Techpeple')
    expect(c.says).not.toMatch(/100|hundred/)
  })

  it('one supplier counted in people says it supplies everybody, not a share of money', () => {
    const c = concentration({ dimension: 'SUPPLIER', unit: 'PEOPLE', exposures: [{ id: 's', name: 'Techpeple', amountMinor: 4 }] })
    expect(c.says).toContain('Techpeple supplies everybody on the books')
    expect(c.breach).toBeNull()
  })

  it('a client reads only the supplier share, because it raises no bills of its own', () => {
    expect(dimensionsFor('CLIENT')).toEqual(['SUPPLIER'])
  })

  it('every firm that sells reads the client, supplier and person shares', () => {
    for (const k of ['VENDOR', 'GSI', 'MSP', 'CONSULTANT_CORP']) {
      expect(dimensionsFor(k)).toEqual(['CLIENT', 'SUPPLIER', 'PERSON'])
    }
  })

  it('a client with too few suppliers is told it has a short list, never a small book', () => {
    const report = concentrationReport([
      concentration({ dimension: 'SUPPLIER', unit: 'MONEY', exposures: usd([['Techpeple', 1_000_00]]) }),
    ])
    expect(report.says).toContain('Too few suppliers')
    expect(report.says).not.toContain('book')
  })

  it('a client whose suppliers are spread is told no single supplier is worth naming, and nothing about clients or people', () => {
    const report = concentrationReport([
      concentration({
        dimension: 'SUPPLIER', unit: 'MONEY',
        exposures: usd([['A', 20_00], ['B', 20_00], ['C', 20_00], ['D', 20_00], ['E', 20_00]]),
      }),
    ])
    expect(report.says).toBe('No single supplier is large enough to be worth naming.')
  })

  it('the concentration route drops the client and person shares for a client and says who it is written to', () => {
    const route = read('src/app/api/vendors/concentration/route.ts')
    expect(route).toContain('dimensionsFor(caller.company!.kind)')
    expect(route).toContain("reader: sells ? 'SELLER' : 'BUYER'")
  })

  it('the scorecards page writes "One supplier" to a client and draws no concentration heading until the reader is known', () => {
    const page = read('src/app/dashboard/scorecards/page.tsx')
    expect(page).toContain("{reader === 'BUYER' && (")
    expect(page).toContain("{reader === 'SELLER' && (")
    expect(page).toContain('One supplier</h2>')
  })

  it('the scorecards, the concentration rules and their route say percent, never per cent', () => {
    for (const f of [
      'src/app/dashboard/scorecards/page.tsx',
      'src/lib/concentration.ts',
      'src/app/api/vendors/concentration/route.ts',
    ]) {
      expect(read(f)).not.toMatch(/per cent/i)
    }
  })
})

describe('16 · rolloff and consultants say nothing about the reader until they know who it is', () => {
  it('the rolloff page never guesses the reader is a supplier', () => {
    const page = read('src/app/dashboard/rolloff/page.tsx')
    expect(page).not.toMatch(/\?\?\s*'VENDOR'/)
    // Since round seven the framing is also given the reader's own menu.
    expect(page).toContain("pageFraming(kind, 'rolloff', null, sidebarPropsFrom(session))")
  })

  it('the rolloff page draws no subtitle until the reader is known', () => {
    const page = read('src/app/dashboard/rolloff/page.tsx')
    expect(page).toContain('{kind != null && (')
  })

  it('the consultants page never guesses the reader is a supplier, and draws no eyebrow or subtitle until it knows', () => {
    const page = read('src/app/dashboard/consultants/page.tsx')
    expect(page).not.toMatch(/\?\?\s*'VENDOR'/)
    // Since round seven the eyebrow is the reader's own menu's section.
    expect(page).toContain("usePageSection('/dashboard/consultants')")
    expect(page.match(/\{readerKind != null && \(/g)?.length).toBe(2)
  })
})
