/**
 * The panel that shows the product working, read against the seed.
 *
 * The founder said "Build it" on 2026-10-14 to a drawing of one compact
 * panel replacing the big live frame: the four steps — Job, Candidates,
 * Timesheets, Invoices — each an Ask Etyme question, an answer and a
 * decision card beside the table it changes. CLAUDE.md: "A test checks
 * every name and figure in it against the seed, so the page never shows
 * something the demo does not."
 *
 * ── Where the drawing and the seed disagreed, the seed won ────────────
 *
 * The drawing was a sketch with stand-in figures. Each of these is not
 * what the seeded Northbend Athletic program holds, and the panel says
 * the seed's instead:
 *
 *   drawing                              seed, and so the panel
 *   a Java developer job, $85–95         the HCM integration lead job, $120–140,
 *                                        12 months, to Computer Systems Inc,
 *                                        Brightmoor Staffing, Pinnacle Resourcing
 *   Omar Haddad, Helena Marsh, Ravi Iyer the job's candidates: Rajesh Iyer $134,
 *   as candidates; 86% match; 14 months  Mei-Lin Chao $128, Daniel Okafor $131;
 *                                        no match score (it is computed, not
 *                                        seeded) and no months here (none of
 *                                        them has been on site)
 *   2 timesheets waiting, dated Oct 5–11 3 waiting: Helena 40, Lucía 44, Omar 45;
 *                                        no dates (the seed counts them from
 *                                        the day the world was born)
 *   BR-2026-0417 for $21,120, VT-2026-   PR-2026-0441, 40 h × $98 = $3,920, and
 *   0108, $42,587 billed this month      PR-2026-0442, 41.5 h against 40; the
 *                                        month's total is computed from the
 *                                        seed's dates, so no total is shown
 *   7 contractors · 4 suppliers          the same, and counted below
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PROGRAMMES } from '@/lib/seed-programmes'
import { NORTHBEND_TWIN_RECEIPTS } from '@/lib/twin/seed-demo'
import { TENURE_DEMO } from '@/lib/twin/seed-tenure-demo'
import { RATE_CHANGE_PERSON } from '@/lib/seed-rate-change'
import { STORY, STORY_BAR, STEP_NAMES, storyCopy, storyIndex, type Cell } from '@/lib/public-site/story'
import { StoryPanel } from '@/lib/public-site/story-panel'
import { STEPS } from '@/lib/public-site/steps'
import { STEP_PAGES, stepEyebrow } from '@/lib/public-site/docs/process'
import { MENU } from '@/lib/public-site/nav'
import { MODULES } from '@/lib/public-site/modules'
import { PARTY_PAGES } from '@/lib/public-site/parties'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const nike = PROGRAMMES.find((p) => p.client === 'nike')!
const WORLD = read('src/lib/seed-world.ts')
/** A seeded firm's name, read off the world seed's firm list. */
const firm = (slug: string) => WORLD.match(new RegExp(`slug: '${slug}',\\s*name: '([^']+)'`))![1]
const dollars = (cents: number) => `$${cents / 100}`
const text = (c: Cell) => (typeof c === 'string' ? c : c.t)
const step = (chip: string) => STORY.find((s) => s.chip === chip)!
const said = (chip: string) => {
  const s = step(chip)
  return [...s.chat.flatMap((m) => [m.text, m.card?.t ?? '', m.card?.s ?? '']), ...s.table.rows.flat().map(text), s.sum.rest].join(' ')
}

describe('Every name and figure on the panel is the seeded demo’s', () => {

  it('the job step sends the seeded open job, at its rate band and months, to the three suppliers the seed releases it to', () => {
    const s = said('Job')
    expect(s).toContain(nike.open.title)
    expect(s).toContain(`Bill rate ${dollars(nike.open.band[0])} to ${dollars(nike.open.band[1])} an hour`)
    // The seed writes the open job for twelve months, at the program's own site.
    expect(read('src/lib/seed-programmes.ts')).toMatch(/billMin: p\.open\.band\[0\], billMax: p\.open\.band\[1\], months: 12/)
    expect(s).toContain(`12 months · ${nike.loc}`)
    const to = nike.open.to.map(firm)
    expect(step('Job').chat[1].card!.s).toBe(to.join(', '))
    expect(s).toContain(`Sent to your ${to.length} approved suppliers`)
    // Within the band, so it cleared by rule: the seed writes it AUTO_APPROVED.
    expect(read('src/lib/seed-programmes.ts')).toMatch(/status: 'OPEN', approvalState: 'AUTO_APPROVED'/)
    expect(nike.open.band[1]).toBeLessThanOrEqual(nike.governance.band[1])
    const [open, routed] = step('Job').table.rows
    expect(open.map(text)).toEqual([nike.open.title, String(to.length), `$${nike.open.band[0] / 100}–${nike.open.band[1] / 100}`, 'Open'])
    expect(routed.map(text)).toEqual([`Supply-planning consultants (${nike.routed.headcount})`, '—', `up to ${dollars(nike.routed.billMax)}`, 'Waiting for the VP'])
  })

  it('the candidates step lists the seeded job’s three candidates, each with the supplier, rate and interview state the seed gives them', () => {
    const rows = step('Candidates').table.rows.map((r) => r.map(text))
    expect(rows.map((r) => r[0])).toEqual(nike.open.candidates.map((c) => c.person))
    for (const [i, c] of nike.open.candidates.entries()) {
      expect(rows[i][1], c.person).toBe(firm(c.from))
      expect(rows[i][2], c.person).toBe(dollars(c.rate))
    }
    const status = Object.fromEntries(nike.open.candidates.map((c) => [c.person, c]))
    expect(status['Rajesh Iyer'].round?.state).toBe('CONFIRMED')
    expect(rows[0][3]).toBe('Interview booked')
    expect(status['Mei-Lin Chao'].status).toBe('SUBMITTED')
    expect(rows[1][3]).toBe('Submitted')
    expect(status['Daniel Okafor'].round).toMatchObject({ state: 'DONE', outcome: 'ADVANCE' })
    expect(rows[2][3]).toBe('Round 1 passed')
    const card = step('Candidates').chat[1].card!
    expect(card.s).toBe(`${firm('computer-systems')} · ${dollars(status['Daniel Okafor'].rate)} an hour · passed round one`)
    expect(said('Candidates')).toContain(`3 candidates from ${new Set(nike.open.candidates.map((c) => c.from)).size} suppliers`)
  })

  it('the timesheets step shows the three weeks the seed leaves waiting: Helena at 40, Lucía at 44 on a 40-hour week, Omar at 45', () => {
    const live = (person: string) => nike.placements.find((p) => p.person === person && p.state === 'IN_PROGRESS')!
    const helena = live('Helena Marsh'), lucia = live('Lucía Fernández'), omar = live('Omar Haddad')
    expect(helena.weeks?.awaiting).toBe(1)
    expect(helena.exceptionHours).toBeUndefined()
    expect(lucia.weeks?.awaiting).toBe(1)
    expect(lucia.exceptionHours).toBe(44)
    expect(omar.overtimeWeekHours).toBe(45)
    expect(omar.overtimeAfterHours).toBe(40)
    // The client sees the rung it pays: the first firm under it.
    const rows = step('Timesheets').table.rows.map((r) => r.map(text))
    expect(rows).toEqual([
      ['Helena Marsh', firm(helena.via[1]), '40', 'Approved'],
      ['Lucía Fernández', firm(lucia.via[1]), String(lucia.exceptionHours), `${lucia.exceptionHours! - 40} hours over`],
      ['Omar Haddad', firm(omar.via[1]), String(omar.overtimeWeekHours), `${omar.overtimeWeekHours! - 40} hours over`],
    ])
    expect(said('Timesheets')).toContain('3 timesheets are waiting for your approval. Two are over the hours on the contract.')
    expect(said('Timesheets')).toContain(`Lucía Fernández submitted 44 hours on a 40-hour contract. Check with ${firm('pinnacle')}`)
  })

  it('the invoices step is the twin’s two seeded receipts from Pinnacle, priced at the rate Pinnacle bills Northbend', () => {
    const [clean, held] = NORTHBEND_TWIN_RECEIPTS.filter((r) => r.number)
    expect(clean).toMatchObject({ number: 'PR-2026-0441', hoursBilled: 40, hoursAccepted: 40, expected: 'CLEAN', supplier: 'pinnacle' })
    expect(held).toMatchObject({ number: 'PR-2026-0442', hoursBilled: 41.5, hoursAccepted: 40, expected: 'MISMATCH', supplier: 'pinnacle' })
    const rate = nike.placements.find((p) => p.person === clean.person && p.via[1] === 'pinnacle' && p.state === 'IN_PROGRESS')!.rates[0]
    const total = (clean.hoursBilled * rate) / 100
    expect(step('Invoices').chat[1].card!.t).toBe(`Pay invoice ${clean.number} for $${total.toLocaleString('en-US')}?`)
    expect(step('Invoices').chat[1].card!.s).toContain(`${clean.hoursAccepted} approved hours × ${dollars(rate)}`)
    // The list a client reads for what suppliers send is invoice receipts (CLAUDE.md, 2026-09-28).
    expect(step('Invoices').table.title).toBe('Invoice receipts')
    expect(step('Invoices').table.head[0].t).toBe('Invoice receipt')
    expect(step('Invoices').table.rows.map((r) => r.map(text))).toEqual([
      [clean.number, `${clean.hoursBilled} h`, `${clean.hoursAccepted} h`, 'Paid'],
      [held.number, `${held.hoursBilled} h`, `${held.hoursAccepted} h`, `On hold: ${held.hoursBilled - held.hoursAccepted} h over`],
    ])
    expect(said('Invoices')).toContain(`it bills ${held.hoursBilled} hours, but ${held.hoursAccepted} were approved`)
    expect(said('Invoices')).toContain(firm('pinnacle'))
  })

  it('the bar’s 7 contractors and 4 suppliers are the people and firms the seed puts on site at Northbend today', () => {
    // On site: every seeded line at Northbend still running. Its program's
    // own lines, the time-limit demo's, the rate-change seed's, and the
    // integrator's two moves (read off its source: its lines are not
    // exported).
    const moves = read('src/lib/seed-internal-moves.ts')
    const onSite: { person: string; firm: string }[] = [
      ...nike.placements.filter((p) => p.state === 'IN_PROGRESS').map((p) => ({ person: p.person, firm: p.via[1] })),
      ...TENURE_DEMO.lines.filter((l) => l.state === 'IN_PROGRESS').map((l) => ({ person: TENURE_DEMO.person, firm: l.via })),
      { person: RATE_CHANGE_PERSON.name, firm: 'brightmoor' },
      ...[...moves.matchAll(/person: '([^']+)', client: 'nike'[\s\S]*?end: (-?\d+)/g)]
        .filter((m) => Number(m[2]) > 0).map((m) => ({ person: m[1], firm: 'teleworld' })),
    ]
    // The rate-change person is Brightmoor's own W2 at Northbend, still working.
    expect(read('src/lib/seed-rate-change.ts')).toMatch(/on Brightmoor Staffing's own payroll/)
    const people = new Set(onSite.map((o) => o.person))
    const firms = new Set(onSite.map((o) => o.firm))
    expect(people.size).toBe(7)
    expect(firms.size).toBe(4)
    expect(STORY_BAR).toEqual({ company: 'Northbend Athletic', rest: `a sample company · ${people.size} contractors · ${firms.size} suppliers` })
    expect(firm('nike')).toBe(STORY_BAR.company)
  })

  it('no stand-in figure from the drawing reached the panel', () => {
    const all = storyCopy().join(' ')
    for (const gone of ['Java developer', '$21,120', '$42,587', 'BR-2026-0417', 'VT-2026-0108', '86%', 'Ravi Iyer', 'Oct 5', 'Veritan Talent']) {
      expect(all, gone).not.toContain(gone)
    }
  })
})

describe('The panel plays the four steps and is never blank', () => {
  const panel = (start = 0) => renderToStaticMarkup(createElement(StoryPanel, { start }, createElement('a', { href: '/demo' }, 'Open the demo, no account')))

  it('every step is in the HTML the server sends, and the page’s own step is the one shown with no script', () => {
    for (const start of [0, 1, 2, 3]) {
      const html = panel(start)
      for (const s of STORY) expect(html, s.chip).toContain(`data-story-step="${s.n}"`)
      const shown = [...html.matchAll(/data-story-step="(\d)"( hidden="")?/g)].filter((m) => !m[2]).map((m) => Number(m[1]))
      expect(shown).toEqual([start + 1])
      // The whole conversation of that step, card included, with nothing to wait for.
      const s = STORY[start]
      for (const m of s.chat) expect(html).toContain(m.text.replace(/’/g, '’').slice(0, 30))
      expect(html).not.toMatch(/<iframe/)
      expect(html).toContain('Open the demo, no account')
    }
  })

  it('each page starts the panel at its own step: the home page at Job, a product page or door at the step it is about', () => {
    expect(storyIndex(undefined)).toBe(0)
    expect(storyIndex('overview')).toBe(0)
    expect(STORY.map((s) => storyIndex(s.embed))).toEqual([0, 1, 2, 3])
    for (const m of MODULES) expect(STORY[storyIndex(m.step)], m.route).toBeDefined()
    for (const p of PARTY_PAGES) expect(STORY[storyIndex(p.step)], p.route).toBeDefined()
    const skeleton = read('src/lib/public-site/skeleton.tsx')
    expect(skeleton).toContain('<StoryPanel start={storyIndex(step)}>{children}</StoryPanel>')
  })

  it('plays a step about every five seconds, presses the card itself and lights the changed row, and holds for a reader', () => {
    const src = read('src/lib/public-site/story-panel.tsx')
    expect(read('src/lib/public-site/story.ts')).toMatch(/STORY_STEP_MS = 5\d{3}\b/)
    expect(src).toContain('after(STORY_STEP_MS')
    expect(src).toContain('setPlayed((p) => ({ ...p, pressed: true }))')
    expect(src).toContain('setLit(true)')
    expect(src).toContain('onMouseEnter={() => { hold.current = true }}')
    expect(src).toContain('onFocus={() => { hold.current = true }}')
    // The chips jump to a step.
    expect(src).toContain('onClick={() => playStep(i)}')
    expect(src).toContain('aria-pressed={i === cur}')
  })

  it('never plays for a reader who asked for reduced motion', () => {
    const src = read('src/lib/public-site/story-panel.tsx')
    expect(src).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches")
    expect(src).toContain('if (!reduce.current) playStep(start)')
    expect(src).toMatch(/motion-reduce:transition-none/)
  })

  it('draws the real mark from the logo component, never a redrawn one', () => {
    const src = read('src/lib/public-site/story-panel.tsx')
    expect(src).toContain("import { EtymeMark } from '@/components/logo'")
    expect(src).not.toMatch(/<path|viewBox/)
  })

  it('on a phone the chat sits over the table, and a table keeps at most four columns with the wide one left off', () => {
    const src = read('src/lib/public-site/story-panel.tsx')
    expect(src).toContain('md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]')
    expect(src).toContain("h.wide ? 'hidden sm:table-cell' : ''")
    for (const s of STORY) {
      expect(s.table.head.length, s.chip).toBeLessThanOrEqual(4)
      expect(s.table.head.filter((h) => !h.wide).length, s.chip).toBeLessThanOrEqual(4)
    }
  })

  it('is about two thirds of the old frame’s height on a desktop', () => {
    // The frame was 16:10 at the page's width, about 690 pixels; the panel's
    // body is held at 300 and grows only with its words.
    expect(read('src/lib/public-site/story-panel.tsx')).toContain('md:min-h-[300px]')
  })
})

describe('The four steps are Job, Candidates, Timesheets and Invoices everywhere public', () => {

  it('the chips, the spine, the menu and the documentation say the same four names in the same order', () => {
    expect(STEP_NAMES).toEqual(['Job', 'Candidates', 'Timesheets', 'Invoices'])
    expect(STEPS.map((s) => s.name)).toEqual(STEP_NAMES)
    // The menu sheet's four cards (2026-10-15) and the step pages' eyebrows.
    expect(MENU.steps.map((s) => s.t)).toEqual(STEP_NAMES)
    expect(MODULES.map((m) => m.eyebrow)).toEqual(STEP_NAMES.map((n, i) => `Step ${i + 1} of 4 · ${n}`))
    // The documentation's step pages, one per step since 2026-10-15, each "Step n of 4".
    const docSteps = STEP_PAGES.filter((p) => p.n !== null)
    expect(docSteps.map((p) => p.title)).toEqual(STEP_NAMES)
    expect(docSteps.map(stepEyebrow)).toEqual(STEP_NAMES.map((_, i) => `Step ${i + 1} of 4`))
    // One page per step since 2026-10-15: Candidates is /submissions, where
    // who applied is read; /contracts folded into it and redirects there.
    expect(STEPS.map((s) => s.route)).toEqual(['/requisitions', '/submissions', '/timesheets', '/invoices'])
  })

  it('no public page draws the live frame any more; the sample screens it loaded are left in place, unlinked', () => {
    expect(existsSync(join(ROOT, 'src/lib/public-site/home-demo.tsx'))).toBe(false)
    for (const f of ['src/app/page.tsx', 'src/lib/public-site/skeleton.tsx', 'src/lib/public-site/sub-page.tsx', 'src/lib/public-site/party-page.tsx', 'src/lib/public-site/module-page.tsx']) {
      expect(read(f), f).not.toMatch(/<iframe|\/embed\/demo/)
    }
    expect(existsSync(join(ROOT, 'src/app/embed'))).toBe(true)
  })
})
