import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SCREEN } from '@/lib/public-site/rhythm'
import { gridsWithoutBreakpoint } from '@/lib/positioning'

/**
 * The home page's shape, on a phone and a desktop.
 *
 * Until 2026-10-14 this file held eight bands of the home page to one
 * whole screen each, the same padding and heading, grounds alternating,
 * and a script that settled the scroll on the nearest band. The founder
 * approved a home page of three short sections that day ("Build it"): the
 * question and the category, the live product, the sign-up band, then one
 * line for security and the footer. Three short sections read in one or
 * two scrolls, so nothing on the page is sized to a screen and nothing
 * moves the scroll; the sentences about bands went with the bands, and
 * these hold the new shape instead. The party pages keep the one-screen
 * bands (`lib/public-site/rhythm`), held by the last sentence here.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const PAGE = read('src/app/page.tsx')
const DEMO = read('src/lib/public-site/home-demo.tsx')
const FRAME = read('src/lib/public-site/frame.tsx')

/** The opening tag of every section written on the page, in order. */
const sections = [...PAGE.matchAll(/<section[\s\S]*?>/g)].map((m) => m[0])

describe('The home page is three short sections in one column, at every width', () => {

  it('is one column with a 16px gutter on a phone, and every section sits inside it', () => {
    const main = PAGE.slice(PAGE.indexOf('<main'), PAGE.indexOf('</main>'))
    expect(PAGE).toContain('<main className="mx-auto max-w-6xl px-4 sm:px-6">')
    expect(sections.map((s) => s.match(/id="([\w-]+)"/)![1])).toEqual(['top', 'demo', 'sign-up'])
    for (const s of sections) expect(main).toContain(s)
    // Nothing is wider than the screen: the page clips any stray overflow
    // rather than scrolling sideways at 375.
    expect(PAGE).toContain('overflow-x-hidden')
  })

  it('sizes no section to a whole screen and never moves the reader’s scroll', () => {
    expect(PAGE).not.toContain('${SCREEN}')
    expect(PAGE).not.toContain(SCREEN)
    expect(PAGE).not.toContain('SettleOnBands')
    expect(PAGE).not.toMatch(/\bsnap-(?:y|mandatory|proximity|start)\b/)
  })

  it('stacks every split on a phone: the sign-up band beside its buttons only from md, its buttons side by side only from sm', () => {
    expect(gridsWithoutBreakpoint(PAGE)).toEqual([])
    expect(gridsWithoutBreakpoint(DEMO)).toEqual([])
    const band = sections.find((s) => s.includes('id="sign-up"'))!
    expect(band).toContain('md:grid-cols-[1fr_auto]')
    expect(PAGE).toContain('flex flex-col gap-2.5 sm:flex-row sm:flex-wrap')
  })

  it('wraps the four chips onto a second line on a phone rather than scrolling them sideways', () => {
    const chips = DEMO.slice(DEMO.indexOf('<nav aria-label="Move the demo to a step"'))
    expect(chips).toMatch(/className="flex flex-wrap/)
    expect(DEMO).not.toMatch(/overflow-x-(?:auto|scroll)/)
  })

  it('keeps the frame’s box before it loads, taller on a phone and wider from md, so nothing under it moves when it arrives', () => {
    expect(DEMO).toMatch(/relative aspect-\[3\/4\] w-full[^"]*md:aspect-\[16\/10\]/)
    expect(DEMO).toMatch(/className="absolute inset-0 h-full w-full border-0"/)
  })

  it('never waits on the frame: lazy as served, so a phone loads it under the fold, and eager on a desktop once the page is live', () => {
    expect(DEMO).toContain('loading="lazy"')
    expect(DEMO).toContain("const DESKTOP = '(min-width: 768px)'")
    expect(DEMO).toContain("if (f && window.matchMedia(DESKTOP).matches) f.loading = 'eager'")
    // The page itself is a server page with no data to wait for.
    expect(PAGE).not.toMatch(/export const dynamic|await /)
  })

  it('draws every color from the site’s tokens, so the page and the frame follow one theme', () => {
    for (const src of [PAGE, DEMO]) {
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
      expect(src).not.toMatch(/\b(?:bg|text|border)-(?:red|blue|green|gray|slate|zinc|neutral|white|black)-\d/)
    }
  })

  it('a band on a party page is still the screen less the sticky header, the height the header scrolls a band under', () => {
    const phone = Number(FRAME.match(/\[html:has\(&\)\]:scroll-pt-\[(\d+)px\]/)![1])
    const wide = Number(FRAME.match(/lg:\[html:has\(&\)\]:scroll-pt-\[(\d+)px\]/)![1])
    expect(SCREEN).toContain(`min-h-[calc(100svh-${phone}px)]`)
    expect(SCREEN).toContain(`lg:min-h-[calc(100svh-${wide}px)]`)
    expect(SCREEN).toMatch(/\bflex\b/)
    expect(SCREEN).toMatch(/\bflex-col\b/)
    expect(SCREEN).toMatch(/\bjustify-center\b/)
  })
})
