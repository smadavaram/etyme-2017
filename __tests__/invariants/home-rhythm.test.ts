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
 * category and the question (the category on top since 2026-10-19), the
 * live product, the sign-up band, then one
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
 * those pages share (`lib/public-site/skeleton`).
 *
 * Since the founder's brief of 2026-11-13 the home page is six short
 * sections of its own — the hero, the Ask Etyme demo, the CFO view, one
 * record in three proofs, the strip, the last call — drawn by the page
 * and `lib/public-site/home-parts`, which are read here.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const OWN = read('src/app/page.tsx')
const SKELETON = read('src/lib/public-site/skeleton.tsx')
/** The home page's own pieces since the founder's brief of 2026-11-13: See it work, the demo and the CFO view. */
const PARTS = read('src/lib/public-site/home-parts.tsx')
const PAGE = [OWN, PARTS].join('\n')
/** The panel that shows the product working, since it replaced the live frame (2026-10-14). */
const DEMO = read('src/lib/public-site/story-panel.tsx')

/** The opening tag of every section written on the page, in order. */
const sections = [...PAGE.matchAll(/<section[\s\S]*?>/g)].map((m) => m[0])

describe('The home page is six short sections in one column, at every width', () => {

  it('is one column with a 16px gutter on a phone, and every section sits inside it, in the brief’s order: the hero, the demo, the CFO view, the record, the strip, the last call', () => {
    const main = OWN.slice(OWN.indexOf('<main'), OWN.indexOf('</main>'))
    expect(OWN).toContain('<main className="mx-auto max-w-6xl px-4 sm:px-6">')
    expect(sections.map((s) => s.match(/id="([\w-]+)"/)![1])).toEqual(['top', 'demo', 'cfo', 'record', 'strip', 'start'])
    for (const s of sections) expect(main).toContain(s)
    expect(OWN).not.toMatch(/<LiveDemo|<WhyBelow|<SignUpBand|CorvaneMapView/)
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

  it('stacks every split on a phone: the three proof cards side by side only from md, the hero’s buttons side by side only from sm', () => {
    expect(gridsWithoutBreakpoint(PAGE)).toEqual([])
    expect(gridsWithoutBreakpoint(DEMO)).toEqual([])
    // The three proof cards stack on a phone and sit three across from md.
    expect(OWN).toContain('mt-4 grid gap-3 md:grid-cols-3')
    expect(PAGE).toContain('flex flex-col gap-2.5 sm:flex-row sm:flex-wrap')
  })

  it('puts the four chips in one row on a phone that scrolls sideways with no scrollbar, and scrolls the row, never the page, to the step playing', () => {
    // Until 2026-10-19 they wrapped onto a second row, and the founder read
    // four rows of bar on his phone before any content. One row, sideways,
    // and only the row moves: a reader further down is not pulled back up.
    const chips = DEMO.slice(DEMO.indexOf('ref={chipRow}'), DEMO.indexOf('{STORY.map('))
    expect(chips).toContain('role="group"')
    expect(chips).toMatch(/className="[^"]*\bflex basis-full flex-nowrap\b[^"]*\boverflow-x-auto\b/)
    expect(chips).toContain('[scrollbar-width:none]')
    expect(chips).toContain('[&::-webkit-scrollbar]:hidden')
    expect(chips).toContain('md:ml-auto md:basis-auto md:overflow-visible')
    expect(DEMO.match(/shrink-0 items-center gap-1\.5 whitespace-nowrap rounded-full/g)).toHaveLength(2)
    expect(DEMO).toContain("row.querySelector<HTMLElement>('[aria-pressed=\"true\"]')")
    expect(DEMO).toContain('row.scrollTo(')
    expect(DEMO).not.toContain('scrollIntoView')
  })

  it('on a phone reads the bar as one line, the company and the person after a middle dot, and keeps the mark and the size of the program for md up', () => {
    const bar = DEMO.slice(DEMO.indexOf('data-story-bar=""'), DEMO.indexOf('ref={chipRow}'))
    expect(bar).toContain('<EtymeMark size={18} className="hidden shrink-0 md:block" />')
    expect(bar).toContain('<b className="shrink-0 whitespace-nowrap font-semibold text-etyme-ink">{story.bar.company}</b>')
    expect(bar).toContain('<span className="hidden md:inline">{story.bar.rest}</span>')
    expect(bar).toContain('<span aria-hidden="true" className="md:hidden">·</span>')
    // The small dot beside the person is for md up; on a phone the middle dot does its job.
    expect(bar).toContain('className="hidden h-1.5 w-1.5 shrink-0 rounded-full bg-etyme-verified md:block"')
    // A long title is cut with an ellipsis rather than pushing a second
    // line, as a guard only: since 2026-10-20 every story's phone line fits
    // at 375, a story's job alone where its name and job do not
    // (story-panel.test.ts measures which).
    expect(bar).toContain('<span className="truncate md:hidden">{steps[cur].phone ?? steps[cur].who}</span>')
    expect(bar).toContain('<span className="hidden truncate md:block">{steps[cur].who}</span>')
  })

  it('puts the chat over the table on a phone and beside it from md, so the table never scrolls sideways', () => {
    expect(DEMO).toContain('grid md:min-h-[300px] md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]')
    expect(DEMO).toContain('min-w-0 bg-etyme-surface p-3.5')
  })

  it('draws the chat and the table on one surface tone, so a short table leaves no white hole under its rows', () => {
    // The founder's desktop read, 2026-10-19: the chat ran long on step 1
    // and the white table column under four rows read as a hole. One tone
    // across both columns; the rows' borders carry the table.
    expect(DEMO).toContain('flex flex-col gap-2.5 border-b border-etyme-rule bg-etyme-surface p-3.5')
    expect(DEMO).toContain('<div className="min-w-0 bg-etyme-surface p-3.5">')
  })

  it('shows Start free with the brief’s line directly under it, and See it work beside it, stacked full width on a phone and side by side from sm; every button at least 44 pixels high', () => {
    const hero = OWN.slice(OWN.indexOf('id="top"'), OWN.indexOf('</section>', OWN.indexOf('id="top"')))
    expect(hero).toContain('className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-start"')
    expect(hero).toMatch(/\{START_FREE\.t\}<\/a>\s*<p[^>]*>\{UNDER_START\}<\/p>\s*<\/div>\s*<SeeItWork \/>/)
    expect(OWN).not.toContain('<PhoneButton')
    for (const b of ['FILLED', 'OUTLINE']) {
      // The shapes live in a file with no client marker, so the server page can read them (0575cc87c).
      expect(read('src/lib/public-site/home-buttons.ts')).toMatch(new RegExp(`export const ${b} =\\s*\`inline-flex min-h-11 `))
    }
    // The header's Start free is the header's 44-pixel tap target.
    expect(read('src/lib/public-site/frame.tsx')).toMatch(/className=\{`\$\{TAP\} ml-1 whitespace-nowrap bg-etyme-action/)
  })

  it('stays inside a 390-pixel screen: no fixed width, the demo’s table fixed to the column with its words wrapping', () => {
    expect(PAGE).not.toMatch(/(?<![\w-])(?:w|min-w)-\[\d+px\]/)
    expect(PARTS).toContain('w-full table-fixed')
    expect(PARTS).toContain('[overflow-wrap:anywhere]')
  })

  it('never waits on anything: no frame, no request, no await; the demo and the CFO view are written into the page', () => {
    expect(PAGE).not.toMatch(/<iframe|fetch\(|loading=/)
    expect(PAGE).not.toMatch(/export const dynamic/)
    expect(PAGE).not.toMatch(/\bawait /)
    expect(OWN).toContain('const DEMO = homeDemo()')
    expect(OWN).toContain('const CFO = homeCfoLines()')
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
