/**
 * The map of the memory: one picture of how the system hangs together.
 *
 * The founder asked for it on 2026-10-08 so he sees the system instead of
 * reading reports. It is drawn from lib/domains and lib/matrix, and from
 * the sentences the test files hold. These sentences hold that it draws
 * what those files say and nothing else, in the palette's colors, and
 * that it stores nothing.
 */

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MATRIX, allProcesses, coverage } from '@/lib/matrix'
import { DOMAINS, READERS, domainOf } from '@/lib/domains'
import { STATUS } from '@/lib/chart-colors'
import { STEPS } from '@/lib/public-site/steps'
import { buildModel, stepFor, OWED_LINE } from '@/lib/system-map'
import { layout, hubsOf, search, STATUS_COLOR, TEST_COLOR } from '@/lib/system-map-layout'
import { readSentences, sentencesIn, testFilesOnDisk, ownedFilesOnDisk } from '@/lib/map-disk'
import { deliveryMatrixHtml } from '@/lib/delivery-matrix-html'
import { Panel } from '@/app/map/map-view'
import { namedCompanies, vendorManagementSystem, unverifiableClaims, priceClaims } from '@/lib/positioning'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const proving = [...new Set(allProcesses().flatMap((r) => r.l3.testedBy ?? []))]
const model = buildModel({
  sentences: readSentences(proving),
  filesOwned: ownedFilesOnDisk(),
  testFiles: testFilesOnDisk(),
})

const MAP_FILES = [
  'src/app/map/page.tsx', 'src/app/map/map-view.tsx', 'src/lib/system-map.ts',
  'src/lib/system-map-layout.ts', 'src/lib/map-disk.ts',
]

describe('The map draws what the two files say, and nothing else', () => {

  it('the map draws every agent, every L2 group and every L3 row the matrix holds, and nothing the matrix does not', () => {
    const drawn = layout(model, 'owner').nodes
    const keys = (kind: string) => new Set(drawn.filter((n) => n.kind === kind).map((n) => n.key))

    const agents = [...DOMAINS.map((d) => d.agent), ...READERS.map((r) => r.agent)]
    expect(agents).toHaveLength(9)
    expect(keys('agent')).toEqual(new Set(agents))
    // The two readers are real agents with a definition, not names typed here.
    for (const a of agents) expect(existsSync(join(ROOT, '.claude/agents', `${a}.md`)), a).toBe(true)

    expect(keys('group')).toEqual(new Set(MATRIX.flatMap((l1) => l1.groups.map((g) => g.code))))
    expect(keys('row')).toEqual(new Set(allProcesses().map((r) => r.l3.code)))
    expect(keys('test')).toEqual(new Set(proving))
    expect(drawn.filter((n) => n.kind === 'row')).toHaveLength(allProcesses().length)
    expect(new Set(drawn.map((n) => n.kind))).toEqual(new Set(['agent', 'group', 'row', 'test']))

    // Every link joins two things that are drawn, and every row-to-test
    // link is one the matrix names.
    const ids = new Set(drawn.map((n) => n.id))
    const links = layout(model, 'owner').links
    for (const l of links) expect(ids.has(l.from) && ids.has(l.to), `${l.from} -> ${l.to}`).toBe(true)
    const named = allProcesses().reduce((k, r) => k + (r.l3.testedBy ?? []).length, 0)
    expect(links.filter((l) => l.kind === 'test')).toHaveLength(named)
  })

  it('a row’s node is colored by its status from the chart palette, never a color of its own', () => {
    const palette = new Set<string>(Object.values(STATUS))
    for (const s of model.statuses) expect(palette.has(STATUS_COLOR[s]), s).toBe(true)
    expect(palette.has(TEST_COLOR)).toBe(true)
    // Four statuses, four different colors: two that looked alike would
    // be a legend nobody can read.
    expect(new Set(model.statuses.map((s) => STATUS_COLOR[s])).size).toBe(model.statuses.length)

    for (const view of ['owner', 'status', 'steps'] as const) {
      for (const n of layout(model, view).nodes.filter((x) => x.kind === 'row')) {
        const row = model.rows.find((r) => r.code === n.key)!
        expect(n.color, `${view} ${n.key}`).toBe(STATUS_COLOR[row.status])
      }
      for (const n of layout(model, view).nodes) {
        expect(n.color === null || palette.has(n.color), `${view} ${n.id} ${n.color}`).toBe(true)
      }
    }
    for (const f of MAP_FILES) {
      expect(read(f).match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\(/g) ?? [], f).toEqual([])
    }
  })

  it('clicking a row shows its owner, its files and the sentences that prove it, read from the test files themselves', () => {
    const code = 'L3.6.3.5'
    const row = model.rows.find((r) => r.code === code)!
    const source = allProcesses().find((r) => r.l3.code === code)!
    expect(row.owner).toBe(source.l3.owner)
    expect(row.agent).toBe('etyme-architect')
    expect(row.files).toEqual(source.l3.implementedBy)

    // The sentences are the file's own words: this very sentence is read
    // off this very file.
    const here = '__tests__/invariants/map.test.ts'
    expect(row.tests).toContain(here)
    expect(model.sentences[here]).toEqual(sentencesIn(read(here)))
    expect(model.sentences[here]).toContain(
      'clicking a row shows its owner, its files and the sentences that prove it, read from the test files themselves')

    const node = layout(model, 'owner').nodes.find((n) => n.id === `row:${code}`)!
    const html = renderToStaticMarkup(createElement(Panel, { model, node, pick: () => {} }))
      .replace(/&#x27;/g, '’').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    expect(html).toContain(row.name)
    expect(html).toContain(row.owner)
    expect(html).toContain('etyme-architect')
    for (const f of row.files) expect(html).toContain(f)
    expect(html).toContain('the map stores nothing and reads nothing from the database')

    // What is still owed is the task lines that say so, and only those.
    const owedRow = model.rows.find((r) => r.owed.length > 0)!
    const raw = allProcesses().find((r) => r.l3.code === owedRow.code)!.l3.tasks
    expect(owedRow.owed).toEqual(raw.filter((t) => OWED_LINE.test(t)))
    const owedNode = layout(model, 'owner').nodes.find((n) => n.id === `row:${owedRow.code}`)!
    const owedHtml = renderToStaticMarkup(createElement(Panel, { model, node: owedNode, pick: () => {} }))
    expect(owedHtml).toContain('Still owed (' + owedRow.owed.length + ')')
  })

  it('a sentence is read in the words it was written in, whichever quote it was written with', () => {
    const src = [
      "it('a consultant cannot be submitted without an active bench listing', () => {})",
      'test("the client\'s own words", () => {})',
      'it(`twelve months is ${n} days`, () => {})',
      "it.skip('a skipped one still counts as written', () => {})",
      "describe('a heading is not a sentence', () => {})",
      "const split = 'x'.split(',')",
    ].join('\n')
    expect(sentencesIn(src)).toEqual([
      'a consultant cannot be submitted without an active bench listing',
      "the client's own words",
      'twelve months is ${n} days',
      'a skipped one still counts as written',
    ])
  })

  it('the counts at the top are computed from the matrix and the owner map', () => {
    const c = model.counts
    const cov = coverage()
    expect(c.rows).toBe(cov.total)
    expect(c.byStatus.BUILT).toBe(cov.built)
    expect(c.byStatus.PARTIAL).toBe(cov.partial)
    expect(c.byStatus.SPEC).toBe(cov.spec)
    expect(c.byStatus.NONE).toBe(cov.none)
    expect(c.groups).toBe(MATRIX.flatMap((l) => l.groups).length)
    expect(c.agents).toBe(DOMAINS.length + READERS.length)
    expect(c.testFiles).toBe(proving.length)
    expect(c.links).toBe(allProcesses().reduce((k, r) => k + (r.l3.testedBy ?? []).length, 0))
    expect(c.owedLines).toBe(allProcesses().reduce((k, r) => k + r.l3.tasks.filter((t) => OWED_LINE.test(t)).length, 0))
    expect(c.sentences).toBe(proving.reduce((k, t) => k + (existsSync(join(ROOT, t)) ? sentencesIn(read(t)).length : 0), 0))
    expect(c.filesOwned).toBeGreaterThan(100)
    // Owned means the owner map says so: a file with no owner is not counted.
    expect(domainOf('src/lib/system-map.ts')?.agent).toBe('etyme-architect')

    // The screen prints the model's counts and types none of its own.
    const view = read('src/app/map/map-view.tsx')
    const bar = view.slice(view.indexOf('data-counts'), view.indexOf('</p>', view.indexOf('data-counts')))
    expect(bar.match(/>\s*\d[\d,]*\s*</g) ?? []).toEqual([])
    expect(bar).toContain('c.filesOwned')
    expect(bar).toContain('c.sentences')

    // Where the disk is not there, a count is null rather than a zero.
    const bare = buildModel({ sentences: {}, filesOwned: null, testFiles: null })
    expect(bare.counts.sentences).toBeNull()
    expect(bare.counts.filesOwned).toBeNull()
    expect(bare.counts.testsProvingNothing).toBeNull()
  })

  it('the four-steps view places every row under a step or under Behind the steps', () => {
    const { hubs, hubOf } = hubsOf(model, 'steps')
    expect(hubs.map((h) => h.label)).toEqual([...STEPS.map((s) => `${s.n}. ${s.name}`), 'Behind the steps'])
    const keys = new Set(hubs.map((h) => h.key))
    for (const r of model.rows) expect(keys.has(hubOf(r)), r.code).toBe(true)

    const drawn = layout(model, 'steps')
    const rowNodes = drawn.nodes.filter((n) => n.kind === 'row')
    expect(rowNodes).toHaveLength(model.rows.length)
    // Each row is linked to exactly one group, and that group to exactly one hub.
    for (const n of rowNodes) {
      expect(drawn.links.filter((l) => l.to === n.id && l.kind === 'group'), n.key).toHaveLength(1)
    }

    // The steps' own process list decides it, not a guess.
    expect(stepFor('Source to contract', 'L2.1.1')).toBe(1)
    expect(stepFor('Source to contract', 'L2.1.2')).toBe(2)
    expect(stepFor('Contract to onboard', 'L2.2.1')).toBe(2)
    expect(stepFor('Work to approve', 'L2.3.1')).toBe(3)
    expect(stepFor('Approve to bill', 'L2.4.1')).toBe(4)
    expect(stepFor('Approve to pay', 'L2.5.1')).toBe(4)
    expect(stepFor('Record to report', 'L2.6.1')).toBeNull()
    expect(stepFor('Govern and protect', 'L2.7.1')).toBeNull()
    expect(model.rows.some((r) => r.step === null)).toBe(true)
    for (const n of [1, 2, 3, 4]) expect(model.rows.some((r) => r.step === n), `step ${n}`).toBe(true)
  })

  it('a search finds a node by a word in its title, its files or the sentences that prove it', () => {
    const nodes = layout(model, 'owner').nodes
    expect(search(model, nodes, '').size).toBe(nodes.length)
    expect(search(model, nodes, 'map of the system').has('row:L3.6.3.5')).toBe(true)
    expect(search(model, nodes, 'src/lib/system-map-layout.ts').has('row:L3.6.3.5')).toBe(true)
    expect(search(model, nodes, 'stores nothing and reads nothing').has('row:L3.6.3.5')).toBe(true)
    expect(search(model, nodes, 'stores nothing and reads nothing').has('test:__tests__/invariants/map.test.ts')).toBe(true)
    expect(search(model, nodes, 'zzqx-nothing-holds-this').size).toBe(0)
  })

  it('the map stores nothing and reads nothing from the database', () => {
    for (const f of MAP_FILES) {
      const src = read(f)
      expect(src, f).not.toMatch(/@\/lib\/db\b|@prisma\/client|prisma\./)
      expect(src, f).not.toMatch(/writeFile|appendFile|mkdir|unlink|localStorage|sessionStorage|document\.cookie/)
      expect(src, f).not.toMatch(/\bfetch\(/)
    }
    // Built with the deployment, while the test files are still there to read.
    expect(read('src/app/map/page.tsx')).toMatch(/export const dynamic = 'force-static'/)
  })
})

describe('The delivery matrix page and the login page say what is true now', () => {

  it('the delivery matrix page is generated from the matrix, never typed', () => {
    const committed = read('docs/delivery-matrix.html')
    expect(committed === deliveryMatrixHtml(),
      'docs/delivery-matrix.html differs from the matrix. Run npm run matrix and commit the result.').toBe(true)
    for (const r of allProcesses()) expect(committed).toContain(`<tr id="${r.l3.code}">`)
    expect(JSON.parse(read('package.json')).scripts.matrix).toContain('scripts/delivery-matrix.ts')
  })

  it('the login page says the category sentence and the home page\'s four steps, in the frame every door shares', () => {
    const src = read('src/app/(auth)/login/page.tsx')
    const frame = read('src/app/(auth)/door-frame.tsx')
    expect(src).toContain('<DoorFrame>')
    expect(frame).toContain('Enterprise contingent workforce management.')
    // The steps are the home page's own words, read from the one list.
    expect(frame).toContain('STEPS.map((s) => s.home)')
    expect(STEPS.map((s) => s.home)).toContain('Each supplier bills, and you pay what matched')
    for (const f of [src, frame]) {
      expect(f).not.toContain('Pay one matched invoice per supplier.')
      expect(f).not.toContain('everything after the hire')
      expect(f).not.toContain('Employ, track, pay, prove')
      expect(f).not.toMatch(/AI agents/)
    }

    const panel = 'Enterprise contingent workforce management. ' + STEPS.map((s) => s.home).join('. ')
    expect(namedCompanies(panel)).toEqual([])
    expect(vendorManagementSystem(panel)).toEqual([])
    expect(unverifiableClaims(panel)).toEqual([])
    expect(priceClaims(panel)).toEqual([])
  })
})

import { keyOpens, seatOpens, MAP_WHO, MAP_REFUSED } from '@/lib/map-gate'

describe('the map opens only for the people who run a real company, or for the map key', () => {
  it('an Owner or Admin of a company that is not seeded may open it, and nobody else', () => {
    expect(seatOpens([{ role: 'Owner', seed: false }])).toBe(true)
    expect(seatOpens([{ role: 'Admin', seed: false }])).toBe(true)
    expect(seatOpens([{ role: 'Member', seed: false }, { role: 'Recruiter', seed: false }])).toBe(false)
    expect(seatOpens([{ role: null, seed: false }])).toBe(false)
    expect(seatOpens([])).toBe(false)
  })

  it('a demo seat never opens it, whatever its role', () => {
    expect(seatOpens([{ role: 'Owner', seed: true }])).toBe(false)
    expect(seatOpens([{ role: 'Owner', seed: true }, { role: 'Admin', seed: false }])).toBe(true)
  })

  it('the map key opens it only when this deployment was given one, and only the exact key', () => {
    expect(keyOpens('a-long-map-key-123', 'a-long-map-key-123')).toBe(true)
    expect(keyOpens('a-long-map-key-124', 'a-long-map-key-123')).toBe(false)
    expect(keyOpens('a-long-map-key', 'a-long-map-key-123')).toBe(false)
    expect(keyOpens('', '')).toBe(false)
    expect(keyOpens('anything', undefined)).toBe(false)
    expect(keyOpens(null, 'a-long-map-key-123')).toBe(false)
  })

  it('the gate stands in front of /map, and the footer and the refusal both say who may see it', () => {
    const mw = readFileSync(join(process.cwd(), 'src/middleware.ts'), 'utf8')
    expect(mw).toContain("pathname === '/map'")
    expect(mw).toContain('/api/map/gate')
    expect(readFileSync(join(process.cwd(), 'src/app/map/page.tsx'), 'utf8')).toContain('{MAP_WHO}')
    const closed = readFileSync(join(process.cwd(), 'src/app/map/closed/page.tsx'), 'utf8')
    expect(closed).toContain('{MAP_WHO}')
    expect(closed).toContain('{MAP_REFUSED}')
    expect(MAP_WHO).toContain('Owner or Admin')
    expect(MAP_REFUSED).toBe('The map is for the people who run a company on Etyme. Sign in as its Owner or Admin to see it.')
  })
})
