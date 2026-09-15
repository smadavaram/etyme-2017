import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { globSync } from 'glob'
import { SEVERITY, SERIES, STATUS, AGE_BANDS, segmentStyle } from '@/lib/chart-colors'

/**
 * The colors on a chart are computable, so they are computed.
 *
 * Three real bugs shipped because nobody could compute them by eye: the
 * AR page drew two age bands in the identical clay, the invoices page
 * drew the same five bands in four unrelated reds, and the report put a
 * green segment beside a grey one at a separation below what normal
 * color vision resolves.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const SURFACE = '#FBFAF7'

/** WCAG relative luminance, so "is this darker" is arithmetic, not taste. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('the severity ramp', () => {
  it('reads light to dark, so a worse band is a darker band without anybody reading the legend', () => {
    const ls = SEVERITY.map(luminance)
    for (let i = 1; i < ls.length; i++) expect(ls[i], `step ${i} is not darker than ${i - 1}`).toBeLessThan(ls[i - 1])
  })
  it('every step is visible against the page, including the lightest', () => {
    for (const step of SEVERITY) expect(contrast(step, SURFACE), `${step} on the page`).toBeGreaterThanOrEqual(2)
  })
  it('carries the brand’s own clay rather than a palette from nowhere', () => {
    expect(SEVERITY).toContain('#C0622E')
  })
})

describe('the series order', () => {
  it('names no color twice — the bug that put two age bands in one clay', () => {
    expect(new Set(SERIES).size).toBe(SERIES.length)
    expect(new Set(SEVERITY).size).toBe(SEVERITY.length)
    expect(new Set(AGE_BANDS).size).toBe(AGE_BANDS.length)
  })
  it('opens on the brand’s blue and clay, so the common two-series chart is Etyme’s own pair', () => {
    expect(SERIES[0]).toBe('#2B47E5')
    expect(SERIES[1]).toBe('#C0622E')
  })
  it('every series color stands off the page at 3:1', () => {
    for (const c of SERIES) expect(contrast(c, SURFACE), `${c} on the page`).toBeGreaterThanOrEqual(3)
  })
  it('keeps the status colors out of the identity set — good is never "series four"', () => {
    expect(SERIES).not.toContain(STATUS.good)
    expect(SERIES).not.toContain(STATUS.serious)
  })
})

describe('the age bands, wherever they are drawn', () => {
  it('read as one healthy block and a darkening tail', () => {
    expect(AGE_BANDS[0]).toBe(STATUS.good)
    expect(AGE_BANDS.slice(1)).toEqual(SEVERITY.slice(0, 4))
  })
  it('are the same five colors on all three pages that draw a book — the same data cannot wear three palettes', () => {
    for (const page of ['src/app/dashboard/ar/page.tsx', 'src/app/dashboard/invoices/page.tsx', 'src/app/dashboard/reports/page.tsx']) {
      expect(read(page), `${page} does not use the shared bands`).toContain('AGE_BANDS')
    }
  })
})

describe('a stacked bar', () => {
  it('separates its fills with a gap in the surface, never a border that adds a line the data has not got', () => {
    expect(segmentStyle(0.4, '#C0622E', false)).toMatchObject({ width: '40%', background: '#C0622E', marginRight: '2px' })
  })
  it('ends where the data ends: the last segment carries no gap', () => {
    expect(segmentStyle(0.6, '#C0622E', true)).toEqual({ width: '60%', background: '#C0622E' })
  })
  it('never prints a number inside a segment, where a narrow band clips it — the counts sit in the legend', () => {
    const src = read('src/app/dashboard/reports/page.tsx')
    expect(src).not.toContain('text-white text-[10px] font-semibold')
    expect(src).toContain('The counts live in the legend below, never inside')
  })
})

describe('one palette, on every screen', () => {
  it('no screen reaches outside the brand for a color — the app had twenty-seven that did', () => {
    const offBrand = globSync('src/{app/dashboard,components}/**/*.tsx').flatMap((f) => {
      const hits = read(f).match(/bg-(red|amber|orange|emerald|green|blue|yellow|purple|indigo)-\d00/g) ?? []
      return hits.map((h) => `${f} — ${h}`)
    })
    expect(offBrand, `these reach outside the palette:\n  ${offBrand.join('\n  ')}`).toEqual([])
  })
})
