import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
 * these hold the new shape instead.
 *
 * The party pages kept one-screen bands (`lib/public-site/rhythm`) for one
 * more day, and a sentence here held their height against the header's.
 * On 2026-10-14 the founder put every product page and party door in the
 * home page's shape ("make sure even the sub pages and doors follow the
 * same structure"), so the bands, the file and that sentence went.
 * The panel, the band and the security line are drawn by the skeleton
 * the home page shares with those pages (`lib/public-site/skeleton`), and
 * are read here with the page.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const OWN = read('src/app/page.tsx')
const SKELETON = read('src/lib/public-site/skeleton.tsx')
const PAGE = [OWN, SKELETON].join('\n')
/** The panel that shows the product working, since it replaced the live frame (2026-10-14). */
const DEMO = read('src/lib/public-site/story-panel.tsx')

/** The opening tag of every section written on the page, in order. */
const sections = [...PAGE.matchAll(/<section[\s\S]*?>/g)].map((m) => m[0])

describe('The home page is three short sections in one column, at every width', () => {

  it('is one column with a 16px gutter on a phone, and every section sits inside it', () => {
    const main = OWN.slice(OWN.indexOf('<main'), OWN.indexOf('</main>'))
    expect(OWN).toContain('<main className="mx-auto max-w-6xl px-4 sm:px-6">')
    expect(sections.map((s) => s.match(/id="([\w-]+)"/)![1])).toEqual(['top', 'demo', 'sign-up'])
    // The hero is the page's own; the frame, the band and the security
    // line are the skeleton's, drawn inside the same column.
    expect(main).toContain(sections[0])
    expect(main).toMatch(/<LiveDemo>[\s\S]*<SignUpBand \/>[\s\S]*<SecurityLine \/>/)
    // Nothing is wider than the screen: the page clips any stray overflow
    // rather than scrolling sideways at 375.
    expect(PAGE).toContain('overflow-x-hidden')
  })

  it('sizes no section to a whole screen and never moves the reader’s scroll', () => {
    expect(PAGE).not.toContain('${SCREEN}')
    expect(PAGE).not.toMatch(/min-h-\[calc\(100svh/)
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
    const chips = DEMO.slice(DEMO.indexOf('role="group" aria-label={STORY_STEPS_LABEL}'))
    expect(chips).toMatch(/className="flex w-full flex-wrap/)
    expect(DEMO).not.toMatch(/overflow-x-(?:auto|scroll)/)
  })

  it('puts the chat over the table on a phone and beside it from md, so the table never scrolls sideways', () => {
    expect(DEMO).toContain('grid md:min-h-[300px] md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]')
    expect(DEMO).toContain('min-w-0 p-3.5')
  })

  it('never waits on anything: no frame, no request, every step written into the page', () => {
    expect(DEMO).not.toMatch(/<iframe|fetch\(|loading=/)
    expect(DEMO).toContain('hidden={i !== cur}')
    // The page itself is a server page with no data to wait for.
    expect(PAGE).not.toMatch(/export const dynamic|await /)
  })

  it('draws every color from the site’s tokens, so the page and the panel follow one theme', () => {
    for (const src of [PAGE, DEMO]) {
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
      expect(src).not.toMatch(/\b(?:bg|text|border)-(?:red|blue|green|gray|slate|zinc|neutral|white|black)-\d/)
    }
  })

  it('every product page and party door is the same one column, with no section sized to a screen', () => {
    const view = read('src/lib/public-site/sub-page.tsx')
    expect(view).toContain('<main className="mx-auto max-w-6xl px-4 sm:px-6">')
    expect(view).toContain('overflow-x-hidden')
    expect(gridsWithoutBreakpoint(view)).toEqual([])
    expect(view).not.toMatch(/min-h-\[calc\(100svh|SettleOnBands/)
  })
})
