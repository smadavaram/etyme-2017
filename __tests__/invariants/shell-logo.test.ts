import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'

/**
 * The logo inside the product.
 *
 * Founder, 2026-09-26, on the dashboard: "the logo is missing from the
 * internal pages." It was not missing, it was the wrong one. The rail drew
 * the mark alone, 15 by 28 pixels of three thin strokes, beside "etyme"
 * set in Inter, while sign-in drew the full wordmark and every marketing
 * header drew it at 26px. A person signed in under the real logo and
 * landed under an icon and a word.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const SIDEBAR = read('src/components/shell/sidebar.tsx')
const HEADER = read('src/components/shell/header.tsx')
const MOBILE = read('src/components/shell/mobile-nav.tsx')
const FRAME = read('src/lib/public-site/frame.tsx')

/** The rail's brand block: from its comment to the nav below it. */
const railBrand = (() => {
  const start = SIDEBAR.indexOf('{/* Logo')
  const end = SIDEBAR.indexOf('{/* Nav sections */}')
  return SIDEBAR.slice(start, end)
})()

describe('the dashboard carries the same logo as the pages around it', () => {
  it('the dashboard rail carries the wordmark, not the mark beside plain text', () => {
    expect(railBrand.length).toBeGreaterThan(0)
    expect(railBrand).toContain('<EtymeLogo size="md" />')
    expect(railBrand).not.toContain('<EtymeMark')
    // No span, or any other element, spelling the brand name in type
    // beside the drawn logo.
    expect(railBrand).not.toMatch(/>\s*etyme\s*</i)
  })

  it('the rail draws the wordmark at the size the marketing header draws it', () => {
    expect(FRAME).toContain('<EtymeLogo size="md" />')
  })

  it('the logo on the rail takes the reader to their own console home', () => {
    expect(railBrand).toMatch(/<Link href=\{dashboardHref as any\}[\s\S]*<EtymeLogo/)
  })

  it('on a phone the wordmark is at the top of the menu sheet, because the sheet is the rail', () => {
    expect(MOBILE).toMatch(/<Sidebar[\s\S]*sheet/)
    expect(railBrand).toContain('<EtymeLogo size="md" />')
  })

  it('on a phone the header keeps the mark beside the company name, so the bar never shows two names', () => {
    expect(HEADER).toMatch(/className="md:hidden flex items-center gap-2\.5 min-w-0"[\s\S]*?<EtymeMark size=\{26\} \/>/)
    expect(HEADER).not.toContain('<EtymeLogo')
  })
})

/**
 * The tab. Founder, the same day: "the kit should have favicon as well,
 * and also just the Y icon must be there." The wordmark is the logo; the
 * mark is the icon. public/favicon.ico was dated 4 September, before the
 * kit, and browsers ask for /favicon.ico whatever the page links, so every
 * tab still showed the old logo.
 */
const ICON = read('src/app/icon.svg')
const KIT_STROKES = ['#5228FF', '#E16400', '#00C800']

describe('the browser tab carries the kit’s mark', () => {
  it('the tab shows the kit’s mark, not the logo that shipped before it', () => {
    expect(existsSync(join(process.cwd(), 'src/app/icon.svg'))).toBe(true)
    expect(existsSync(join(process.cwd(), 'src/app/apple-icon.png'))).toBe(true)
    expect(existsSync(join(process.cwd(), 'public/favicon.ico'))).toBe(true)
    const fills = [...ICON.matchAll(/fill="([^"]+)"/g)].map((m) => m[1].toUpperCase())
    expect(new Set(fills)).toEqual(new Set(KIT_STROKES))
    // The mark alone: no letters, no ground, no circle.
    expect(ICON).not.toMatch(/<circle|<rect|<text|currentColor/)
  })

  it('the icon is square, because a tab is, with the tall mark centred in it', () => {
    const vb = ICON.match(/viewBox="([^"]+)"/)![1].split(/\s+/).map(Number)
    expect(vb[2]).toBe(vb[3])
    // The mark's own box is 172 by 327; centred means equal margins.
    expect(vb[0] * -2 + 172).toBe(vb[2])
    expect(vb[1] * -2 + 327).toBe(vb[3])
  })

  it('the favicon is a fresh icon file holding PNG images at 16, 32 and 48 pixels', () => {
    const ico = readFileSync(join(process.cwd(), 'public/favicon.ico'))
    expect(ico.readUInt16LE(2)).toBe(1) // an icon, not a cursor
    const n = ico.readUInt16LE(4)
    const sizes = Array.from({ length: n }, (_, i) => ico[6 + i * 16] || 256)
    expect(sizes).toEqual([16, 32, 48])
    for (let i = 0; i < n; i++) {
      const off = ico.readUInt32LE(6 + i * 16 + 12)
      expect(ico.subarray(off + 1, off + 4).toString('latin1')).toBe('PNG')
    }
  })

  it('no logo from before the kit is left in public for anything to reach', () => {
    const left = readdirSync(join(process.cwd(), 'public')).filter((f) =>
      /logo|apple-touch|icon/i.test(f) && f !== 'favicon.ico'
    )
    expect(left).toEqual([])
  })
})
