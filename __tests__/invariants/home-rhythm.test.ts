import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SCREEN, EDGE, PAD, COLUMN, BAND, H2, UNDER_HEADING } from '@/lib/public-site/rhythm'

/**
 * The home page's rhythm. The founder, 2026-09-30: "Symmetricize home
 * page blocks so the scrolls look neat and nice." The page settles on a
 * band when the reader stops scrolling (lib/public-site/settle); a settle
 * only looks right when every band is one whole screen under the header,
 * with the same padding, column and heading, so these hold the source to
 * that. Measured the same day at 1280 by 800: all five bands 731 pixels,
 * the screen less the 69-pixel header, and each settle landed exactly
 * under the header.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const PAGE = read('src/app/page.tsx')
const CLOSE = read('src/lib/public-site/close-band.tsx')
const FRAME = read('src/lib/public-site/frame.tsx')

/** The opening tag of every band written on the page, in order. */
const sections = [...PAGE.matchAll(/<section[^>]*>/g)]
  .map((m) => m[0].replace('${SCREEN}', SCREEN).replace('${EDGE}', EDGE))

describe('Every home page band is one whole screen, the same shape as the others', () => {

  it('every home page band uses the same padding and width, so each settles as one whole screen', () => {
    expect(sections).toHaveLength(4)
    for (const s of sections) {
      expect(s, 'a band that is not one screen').toContain(SCREEN)
      expect(s, 'a band with no hairline under it').toContain(EDGE)
    }
    // The column and its padding come from one place. The dark band
    // writes its column out for the mural's own tests; it is the same one.
    expect((PAGE.match(/className=\{BAND\}/g) ?? []).length).toBe(3)
    expect(PAGE).toContain('className={`w-full ${PAD}`}')
    expect(PAGE).toContain(`"${COLUMN} grid`)
    expect(BAND).toBe(`${COLUMN} ${PAD}`)
    // Nobody pads a band by hand again.
    expect(PAGE).not.toMatch(/\b(?:md:)?(?:py|pt|pb)-(?:16|20|24)\b/)
    // The close is a band of the page too, and the footer has the same padding.
    expect(PAGE).toContain('<CloseBand id="close" withForm>')
    expect(CLOSE).toContain('onHome ? `${SCREEN} bg-etyme-canvas`')
    expect(CLOSE).toContain('onHome ? BAND')
    expect(FRAME).toMatch(/<footer[\s\S]{0,400}py-10 sm:px-6 md:py-14/)
    expect(PAD).toBe('py-10 md:py-14')
  })

  it('a band is the screen less the sticky header, the same height the header scrolls a band under', () => {
    const phone = Number(FRAME.match(/\[html:has\(&\)\]:scroll-pt-\[(\d+)px\]/)![1])
    const wide = Number(FRAME.match(/lg:\[html:has\(&\)\]:scroll-pt-\[(\d+)px\]/)![1])
    expect(SCREEN).toContain(`min-h-[calc(100svh-${phone}px)]`)
    expect(SCREEN).toContain(`lg:min-h-[calc(100svh-${wide}px)]`)
    // Content centered, so a short band reads as a whole screen.
    expect(SCREEN).toMatch(/\bflex\b/)
    expect(SCREEN).toMatch(/\bflex-col\b/)
    expect(SCREEN).toMatch(/\bjustify-center\b/)
  })

  it('every section heading under the hero is one size, with the same space under it', () => {
    expect((PAGE.match(/className=\{H2\}/g) ?? []).length).toBe(2)
    expect(CLOSE).toContain('onHome ? H2')
    expect(H2).toMatch(/text-\[30px\]/)
    expect(H2).toMatch(/md:text-\[40px\]/)
    expect((PAGE.match(/\$\{UNDER_HEADING\}/g) ?? []).length).toBe(3)
    expect(CLOSE).toContain('onHome ? UNDER_HEADING')
    expect(UNDER_HEADING).toBe('mt-6 md:mt-10')
  })

  it('the backgrounds alternate plain and tinted, band by band, down to the footer', () => {
    const grounds = sections.map((s) => s.match(/bg-etyme-(\w+)/)?.[1] ?? 'canvas')
    const close = 'canvas'
    const footer = FRAME.match(/<footer[^>]*bg-etyme-(\w+)/)![1]
    const order = [...grounds, close, footer]
    expect(order).toEqual(['canvas', 'surface', 'canvas', 'ink', 'canvas', 'surface'])
    for (let i = 1; i < order.length; i++) {
      expect(order[i] === 'canvas', `bands ${i} and ${i + 1} share a ground`).not.toBe(order[i - 1] === 'canvas')
    }
  })

  it('there is exactly one hairline between two bands, and none doubled under the header', () => {
    expect(EDGE).toBe('border-b border-etyme-rule')
    for (const s of sections) expect(s).not.toMatch(/border-t\b/)
    // The close draws none of its own on the home page: the band above
    // ends in one and the footer begins with one.
    expect(CLOSE).not.toMatch(/onHome \? `[^`]*border/)
  })

  it('every side-by-side band splits into two equal halves, and every heading under the hero is one size', () => {
    // The founder, 2026-09-30: side by side "as long as it's symmetrical",
    // and the join band's heading matches the others.
    const spans = [...PAGE.matchAll(/(?:lg|md):col-span-(\d+)/g)].map((m) => Number(m[1]))
    expect(spans.length).toBeGreaterThan(0)
    for (const n of spans) expect(n, `a column spans ${n} of 12`).toBe(6)
    expect(PAGE).not.toMatch(/md:text-\[48px\]/)
  })
})
