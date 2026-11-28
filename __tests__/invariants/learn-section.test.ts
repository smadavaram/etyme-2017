/**
 * The Learn section (record 133): one shared component for the door and the
 * home page, ten tiles each tied to lessons in the course map, played once.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  LEARN_TILES, LEARN_WORDS, LESSON_COUNT, JOIN_THE_BENCH_HREF, LEARN_TIMING, tileDelayMs, finaleDelayMs,
} from '@/lib/public-site/learn-tiles'

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
const SECTION = 'src/lib/public-site/learn-section.tsx'
const CSS = 'src/lib/public-site/learn-section.module.css'

describe('the Learn section: the ten tiles and their lessons', () => {
  it('there are ten tiles, in the order of the path', () => {
    expect(LEARN_TILES.map((t) => t.name)).toEqual([
      'LLMs', 'Agents', 'MCP', 'RAG + Data', 'Training', 'Compute', 'Cloud', 'Cost', 'Performance', 'Deploy',
    ])
    expect(LEARN_TILES.map((t) => t.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('every tile names at least one lesson, and a tile with none would fail here', () => {
    for (const t of LEARN_TILES) expect(t.lessons.length, `${t.name} has no lesson`).toBeGreaterThan(0)
  })

  it('every lesson number is a real lesson in the map of 33, and none is listed twice on a tile', () => {
    for (const t of LEARN_TILES) {
      expect(new Set(t.lessons).size, t.name).toBe(t.lessons.length)
      for (const l of t.lessons) expect(Number.isInteger(l) && l >= 1 && l <= LESSON_COUNT, `${t.name}: lesson ${l}`).toBe(true)
    }
  })

  it('every one of the 33 lessons is reached by some tile, so the grid leaves nothing the course teaches out', () => {
    const reached = new Set(LEARN_TILES.flatMap((t) => t.lessons))
    const missing = Array.from({ length: LESSON_COUNT }, (_, i) => i + 1).filter((n) => !reached.has(n))
    expect(missing).toEqual([])
  })

  it('the tiles name no tool that no lesson teaches, so Deploy says nothing about Docker or Kubernetes', () => {
    const all = LEARN_TILES.map((t) => t.name + ' ' + t.line).join(' ')
    expect(all).not.toMatch(/Docker|Kubernetes/)
    expect(read(SECTION)).not.toMatch(/Docker|Kubernetes/)
  })

  it('every tile has its own icon and its own line', () => {
    expect(new Set(LEARN_TILES.map((t) => t.key)).size).toBe(10)
    expect(new Set(LEARN_TILES.map((t) => t.line)).size).toBe(10)
    const icons = read('src/lib/public-site/learn-icons.tsx')
    for (const t of LEARN_TILES) expect(icons, t.key).toContain(`${t.key}:`)
  })
})

describe('the Learn section: what it says', () => {
  it('the headline is "AI from Zero in 3 Hours" and Free is said plainly beside it', () => {
    expect(LEARN_WORDS.headline).toBe('AI from Zero in 3 Hours.')
    expect(LEARN_WORDS.free).toBe('Free.')
  })

  it('it lands on "Course complete — on your record" and "Then: join the bench"', () => {
    expect(LEARN_WORDS.finaleDoneTitle).toBe('Course complete — on your record')
    expect(LEARN_WORDS.finaleJoinTitle).toBe('Then: join the bench →')
  })

  it('Join the bench goes to Tapin’s public page, where she says yes herself, and creates no seat', () => {
    expect(JOIN_THE_BENCH_HREF).toBe('/site/tapin')
    const src = read(SECTION)
    expect(src).toContain('href={JOIN_THE_BENCH_HREF}')
    expect(src).not.toMatch(/fetch\(|method: 'POST'|<form/)
  })

  it('it names no outside company and no price', () => {
    const words = Object.values(LEARN_WORDS).join(' ') + LEARN_TILES.map((t) => t.line).join(' ')
    expect(words).not.toMatch(/LinkedIn|Google|OpenAI|Anthropic|Microsoft|\$\s?\d/i)
  })
})

describe('the Learn section: how it plays', () => {
  it('the tiles light in order, 620 ms apart, starting at a quarter second, and the closing cards follow the last', () => {
    expect([tileDelayMs(0), tileDelayMs(1), tileDelayMs(9)]).toEqual([250, 870, 5830])
    expect(finaleDelayMs()).toBe(6750)
    expect(LEARN_TIMING.fill).toBe(7000)
  })

  it('it starts when it scrolls into view, once, and never loops', () => {
    const src = read(SECTION)
    expect(src).toContain('IntersectionObserver')
    expect(src).toContain('watch.disconnect()')
    expect(read(CSS)).not.toMatch(/infinite/)
  })

  it('a visitor who asks for less motion gets the finished picture and nothing moves', () => {
    const css = read(CSS)
    expect(read(SECTION)).toContain('prefers-reduced-motion: reduce')
    const reduce = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduce).toMatch(/\.tile, \.finale \{ opacity: 1; transform: none; \}/)
    expect(reduce).toMatch(/\.fill \{ width: 100%; \}/)
    // every animation lives inside the no-preference query
    const before = css.slice(0, css.indexOf('@media (prefers-reduced-motion: no-preference)'))
    expect(before).not.toMatch(/animation:/)
  })

  it('nothing below it moves when it plays: every tile and both closing cards are in the page from the start', () => {
    const css = read(CSS)
    expect(css).toMatch(/\.tile \{[^}]*opacity: \.22; transform: translateY\(8px\)/)
    expect(css).toMatch(/\.finale \{[^}]*opacity: 0; transform: translateY\(8px\)/)
    expect(css).not.toMatch(/display: none[^}]*\.tile|\.finale \{[^}]*display: none/)
    const src = read(SECTION)
    expect(src).toContain('LEARN_TILES.map')
    expect(src).not.toMatch(/lit > 0 &&|started && \(\s*<div className=\{s\.finale/)
  })

  it('without a script the finished picture is shown instead of ten faint tiles', () => {
    expect(read(SECTION)).toContain('<noscript>')
  })

  it('the button is the caller’s: its words and address come in as a prop', () => {
    const src = read(SECTION)
    expect(src).toContain('cta: { label: string; href: string }')
    expect(src).toContain('href={cta.href}')
  })

  it('it is a browser file and imports no server-only file', () => {
    const src = read(SECTION)
    expect(src.startsWith("'use client'")).toBe(true)
    expect(src).not.toMatch(/@\/lib\/db|from 'crypto'|public-site\/course-door'/)
  })

  it('it is drawn in the brand kit: cream, serif, Inter, violet, orange and green, 12px corners, no outside font link', () => {
    const css = read(CSS)
    for (const token of ['#F0EEE6', '#5228FF', '#E16400', '#2F7D3E', '#EDE9FF', 'border-radius: 12px', 'var(--font-inter)', 'Iowan Old Style']) {
      expect(css, token).toContain(token)
    }
    expect(css).not.toMatch(/Sora|Manrope|fonts\.googleapis/)
  })
})
