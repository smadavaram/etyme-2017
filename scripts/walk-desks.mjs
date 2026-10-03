#!/usr/bin/env node
/**
 * Every desk, for every party, walked from its own menu.
 *
 * The founder finds navigation problems by clicking: a menu link that
 * opens a refusal, a date printed as 2026-09-30, a heading with nothing
 * under it. This does the clicking for every seated desk in the seeded
 * world at once, and hands him one list and a screenshot of every page.
 *
 *   npm run walk
 *
 * What it does:
 *   1. Builds the app and starts it on a fresh, freshly seeded database
 *      of its own (etyme_walk, port 3300) — or walks a running one given
 *      as WALK_URL, reading seats from DATABASE_URL.
 *   2. Reads every seat from the database: each company in the world,
 *      each role somebody holds there, one consultant per firm that
 *      lists consultants, and every person the /demo page seats by name.
 *      Nothing is a hand list, so a new desk is walked the day it is
 *      seeded.
 *   3. Signs in as each seat, reads the sidebar and the phone menu, and
 *      opens every link. Navigation only: nothing is clicked that writes.
 *   4. Checks each page (scripts/walk-checks.mjs), saves a full-page
 *      screenshot, and writes walk-output/report.md and report.json.
 *
 * Settings, all optional:
 *   WALK_URL          walk a running app instead of starting one
 *   WALK_PORT         port for the app it starts (3300)
 *   WALK_DB           database name for the app it starts (etyme_walk)
 *   WALK_SKIP_BUILD=1 reuse the existing .next build
 *   WALK_SKIP_SEED=1  with WALK_URL: do not seed
 *   WALK_CONCURRENCY  desks walked at once (8)
 *   WALK_ONLY         only desks whose company slug contains this text
 *   WALK_PHONE=0      skip the 390px pass
 *   WALK_OUT          output folder (walk-output)
 */

import { chromium } from 'playwright'
import { spawn, execSync } from 'node:child_process'
import { createHmac, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkPage, checkNav, comparePhoneNav, FIGURE } from './walk-checks.mjs'
import { buildJson, buildMarkdown, tally } from './walk-report.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, process.env.WALK_OUT ?? 'walk-output')
const PORT = Number(process.env.WALK_PORT ?? 3300)
const CONCURRENCY = Number(process.env.WALK_CONCURRENCY ?? 8)
const PHONE = process.env.WALK_PHONE !== '0'
const started = Date.now()

// ── Environment ────────────────────────────────────────────────────────

/** .env and .env.local as a map, without overriding what is already set. */
function dotenv() {
  const out = {}
  for (const f of ['.env', '.env.local']) {
    const p = join(ROOT, f)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line)
      if (m) out[m[1]] = m[2]
    }
  }
  return out
}
const fileEnv = dotenv()
const env = (k) => process.env[k] ?? fileEnv[k]

function withDatabase(url, name) {
  const u = new URL(url)
  u.pathname = '/' + name
  return u.toString()
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'home'

function chromePath() {
  const root = '/opt/pw-browsers'
  if (!existsSync(root)) return undefined
  const dirs = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()
  for (const d of dirs) {
    const bin = join(root, d, 'chrome-linux', 'chrome')
    if (existsSync(bin)) return bin
  }
  return undefined
}

// ── The app ────────────────────────────────────────────────────────────

let server = null
let BASE = process.env.WALK_URL?.replace(/\/$/, '')
let DATABASE_URL = env('DATABASE_URL')
let SECRET = env('NEXTAUTH_SECRET') ?? env('DEMO_SECRET')
let CRON = env('CRON_SECRET')

async function waitFor(url, ms) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    try {
      const r = await fetch(url)
      if (r.status < 500) return
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`${url} did not answer within ${ms / 1000}s`)
}

async function startApp() {
  if (!DATABASE_URL) throw new Error('No DATABASE_URL in the environment or .env, so there is no server to make a walk database on.')
  const dbName = process.env.WALK_DB ?? 'etyme_walk'
  if (!/walk/.test(dbName)) throw new Error(`WALK_DB "${dbName}" is reset before the walk, so its name must contain "walk".`)
  DATABASE_URL = withDatabase(DATABASE_URL, dbName)
  SECRET = randomBytes(24).toString('hex')
  CRON = randomBytes(24).toString('hex')
  BASE = `http://localhost:${PORT}`
  const childEnv = { ...process.env, DATABASE_URL, NEXTAUTH_SECRET: SECRET, CRON_SECRET: CRON, NEXTAUTH_URL: BASE }
  delete childEnv.DEV_BYPASS_AUTH

  console.log(`walk: resetting database ${dbName}`)
  execSync('npx prisma db push --force-reset --skip-generate', { cwd: ROOT, env: childEnv, stdio: 'ignore' })
  if (process.env.WALK_SKIP_BUILD !== '1' || !existsSync(join(ROOT, '.next', 'BUILD_ID'))) {
    console.log('walk: building the app (npm run build)')
    execSync('npm run build', { cwd: ROOT, env: childEnv, stdio: 'ignore' })
  }
  console.log(`walk: starting the app on ${BASE}`)
  server = spawn(process.execPath, [join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(PORT)], {
    cwd: ROOT, env: childEnv, stdio: ['ignore', 'ignore', 'pipe'],
  })
  server.stderr.on('data', () => {})
  await waitFor(BASE + '/', 90_000)
}

function stopApp() {
  // By its own pid, never by name: other people's servers run here too.
  if (server && server.exitCode === null) server.kill('SIGTERM')
}
process.on('exit', stopApp)
process.on('SIGINT', () => { stopApp(); process.exit(130) })

async function seedWorld() {
  if (!CRON) throw new Error('No CRON_SECRET, so the world cannot be seeded. Set it, or WALK_SKIP_SEED=1.')
  for (let i = 0; i < 60; i++) {
    const r = await fetch(BASE + '/api/seed-world', { method: 'POST', headers: { authorization: `Bearer ${CRON}` } })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(`Seeding answered ${r.status}: ${JSON.stringify(j).slice(0, 300)}`)
    if (j?.data?.done) return
  }
  throw new Error('The world was still not seeded after sixty calls.')
}

// ── The seats ──────────────────────────────────────────────────────────

/** The people the /demo page seats by name, read off its own list. */
function namedWorkers() {
  const src = readFileSync(join(ROOT, 'src', 'app', 'demo', 'seats.ts'), 'utf8')
  const start = src.indexOf('CANDIDATE_SEATS')
  return [...src.slice(start).matchAll(/email:\s*'([^']+)'/g)].map((m) => m[1])
}

/**
 * One seat per desk. A person sits where their newest live context is,
 * which is the seat the app itself resolves for them (lib/api-context).
 */
async function readSeats() {
  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } })
  try {
    const rows = await prisma.$queryRawUnsafe(`
      with eff as (
        select distinct on (x."personId") x.*
        from "Context" x
        where x."revokedAt" is null and x."suspendedAt" is null
        order by x."personId", x."grantedAt" desc
      )
      select p."primaryEmail" as email, p.name as person, e.type as "contextType",
             co.slug, co.name as company, co.kind, r.name as role,
             coalesce(r.permissions, '{}') as permissions, e."grantedAt"
      from eff e
      join "Person" p on p.id = e."personId"
      join "Company" co on co.id = e."companyId"
      left join "Role" r on r.id = e."roleId"
      where co.slug like 'world-%'
      order by co.slug, e."grantedAt", p."primaryEmail"`)
    const named = new Set(namedWorkers())
    const byDesk = new Map()
    for (const r of rows) {
      const worker = r.contextType === 'CONSULTANT'
      const deskName = worker ? 'Consultant' : r.role ?? r.contextType
      const key = `${r.slug}|${deskName}`
      const have = byDesk.get(key)
      // A named seat beats the first person found, so Karthik is walked as himself.
      if (!have || (named.has(r.email) && !named.has(have.email))) byDesk.set(key, { ...r, deskName, worker })
    }
    const seats = [...byDesk.values()]
    // Every person /demo seats by name, even where somebody else already sat at that desk.
    for (const r of rows) {
      if (named.has(r.email) && !seats.some((s) => s.email === r.email)) {
        seats.push({ ...r, deskName: `${r.contextType === 'CONSULTANT' ? 'Consultant' : r.role ?? r.contextType}`, worker: r.contextType === 'CONSULTANT' })
      }
    }
    const missing = [...named].filter((e) => !rows.some((r) => r.email === e))
    return {
      seats: seats.map((s) => ({
        email: s.email,
        person: s.person,
        party: s.company,
        slug: s.slug,
        kind: s.worker ? 'WORKER' : s.kind,
        companyKind: s.kind,
        desk: named.has(s.email) ? `${s.deskName} (named worker seat)` : s.deskName,
        permissions: s.permissions ?? [],
      })),
      missing,
    }
  } finally {
    await prisma.$disconnect()
  }
}

function cookieFor(email) {
  const mac = createHmac('sha256', SECRET).update(email).digest('base64url')
  return `${Buffer.from(email).toString('base64url')}.${mac}`
}

// ── Reading a page ─────────────────────────────────────────────────────

/** The sidebar, as sections of links. Runs in the page. */
function readNavIn(rootSelector) {
  const root = document.querySelector(rootSelector)
  if (!root) return null
  const sections = []
  for (const sec of root.querySelectorAll(':scope > div')) {
    const label = sec.querySelector(':scope > .eyebrow')?.textContent?.trim() ?? '(no heading)'
    const links = [...sec.querySelectorAll('a[href]')].map((a) => {
      const spans = a.querySelectorAll('span')
      const text = (spans[1]?.textContent ?? a.textContent ?? '').trim()
      return { label: text, href: a.getAttribute('href') }
    })
    sections.push({ label, links })
  }
  return sections
}

/** What a person sees on the page. Runs in the page. */
function readFactsIn(figureSource) {
  const FIG = new RegExp(figureSource)
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) return false
    const s = getComputedStyle(el)
    return s.visibility !== 'hidden' && s.display !== 'none'
  }
  const main = document.querySelector('main') ?? document.body
  const mainText = main.innerText ?? ''
  const leaves = [...main.querySelectorAll('*')].filter((e) => e.children.length === 0 && visible(e))
  const buttons = [
    ...main.querySelectorAll('button, a[role="button"], a[class*="bg-etyme-action"]'),
  ].filter(visible).map((b) => (b.innerText ?? '').trim()).filter((t) => t && t.length <= 60)
  return {
    mainText,
    bodyText: document.body.innerText ?? '',
    denied: /^\s*not open to you\b/i.test(mainText),
    tabs: [...main.querySelectorAll('[role="tab"]')].filter(visible).length,
    tables: [...main.querySelectorAll('table')].filter(visible).length,
    figures: leaves.filter((e) => FIG.test((e.textContent ?? '').trim())).length,
    buttons,
    title: document.title,
  }
}

async function walkDesk(browser, seat, log) {
  const deskDir = join(OUT, slug(seat.slug), slug(`${seat.desk}`))
  mkdirSync(deskDir, { recursive: true })
  const result = { party: seat.party, kind: seat.kind, company: seat.slug, desk: seat.desk, person: seat.person, email: seat.email, nav: [], navProblems: [], pages: [] }
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await ctx.addCookies([{ name: 'etyme_demo', value: cookieFor(seat.email), url: BASE, httpOnly: true, sameSite: 'Lax' }])
  // Belt and braces: a walk that writes is not a walk. Every request that
  // is not a read is refused before it leaves the browser.
  let writes = []
  await ctx.route('**/*', (route) => {
    const req = route.request()
    const m = req.method()
    if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return route.continue()
    writes.push(`${m} ${new URL(req.url()).pathname}`)
    return route.abort()
  })
  const page = await ctx.newPage()
  let apiFailures = []
  let consoleErrors = []
  const pending = []
  page.on('response', (res) => {
    const url = new URL(res.url())
    if (!url.pathname.startsWith('/api/') || res.status() < 400) return
    pending.push((async () => {
      let message = ''
      try { const j = await res.json(); message = j?.error?.message ?? j?.message ?? '' } catch {}
      apiFailures.push({ method: res.request().method(), url: url.pathname + url.search, status: res.status(), message })
    })())
  })
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const where = msg.location()?.url ?? ''
    const text = /^Failed to load resource/.test(msg.text()) && where ? `${msg.text()} — ${where.replace(BASE, '')}` : msg.text()
    // A failed /api call is reported as an API failure with its message.
    if (/^Failed to load resource/.test(text) && /\/api\//.test(msg.location()?.url ?? '')) return
    // A write the walk refused to send is reported as a write, not as noise.
    if (/net::ERR_FAILED/.test(text)) return
    consoleErrors.push(text)
  })
  page.on('pageerror', (e) => consoleErrors.push(`Uncaught: ${String(e?.message ?? e)}`))

  async function open(path) {
    apiFailures = []
    consoleErrors = []
    writes = []
    pending.length = 0
    let status = 0
    try {
      const res = await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 45_000 })
      status = res?.status() ?? 0
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
      await page.waitForTimeout(600)
    } catch (e) {
      return { status: 0, error: `Did not load: ${String(e?.message ?? e).split('\n')[0]}` }
    }
    await Promise.all(pending)
    return { status }
  }

  try {
    const first = await open('/dashboard')
    if (first.error) throw new Error(first.error)
    await page.waitForSelector('aside nav', { timeout: 15_000 }).catch(() => {})
    const nav = (await page.evaluate(readNavIn, 'aside nav')) ?? []
    result.nav = nav
    result.home = page.url().replace(BASE, '')
    result.navProblems.push(...checkNav(nav))
    if (nav.length === 0) result.navProblems.push({ kind: 'error-page', what: `No menu at all on ${result.home}.` })

    if (PHONE) {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.waitForTimeout(300)
      const menu = page.locator('button[aria-label="Open menu"]')
      if (await menu.count()) {
        await menu.first().click() // opens a sheet; writes nothing
        await page.waitForSelector('#mobile-nav nav', { timeout: 5_000 }).catch(() => {})
        const phoneNav = await page.evaluate(readNavIn, '#mobile-nav nav')
        if (phoneNav) result.navProblems.push(...comparePhoneNav(nav, phoneNav))
        else result.navProblems.push({ kind: 'nav-phone-differs', what: 'The phone menu button opened no menu.' })
        await page.keyboard.press('Escape')
      } else {
        result.navProblems.push({ kind: 'nav-phone-differs', what: 'No menu button at phone width.' })
      }
      await page.setViewportSize({ width: 1280, height: 900 })
    }

    // Every link once, in menu order; the home page too if the menu lacks it.
    const links = []
    const seen = new Set()
    for (const s of nav) for (const l of s.links) {
      if (!l.href || seen.has(l.href)) continue
      seen.add(l.href)
      links.push({ section: s.label, label: l.label, href: l.href })
    }
    if (result.home && !seen.has(result.home) && !seen.has('/dashboard')) links.unshift({ section: '', label: 'Home', href: '/dashboard' })

    for (const [i, link] of links.entries()) {
      const at = await open(link.href)
      const entry = { section: link.section, label: link.label, path: link.href, landed: null, shot: null, problems: [] }
      if (at.error) {
        entry.problems.push({ kind: 'error-page', what: at.error })
        result.pages.push(entry)
        continue
      }
      entry.landed = page.url().replace(BASE, '')
      const facts = await page.evaluate(readFactsIn, FIGURE.source)
      facts.path = link.href
      facts.status = at.status
      facts.apiFailures = apiFailures.slice()
      facts.consoleErrors = consoleErrors.slice()
      facts.writes = [...new Set(writes)]
      const file = join(deskDir, `${String(i + 1).padStart(2, '0')}-${slug(link.href.replace(/^\/dashboard\/?/, ''))}.png`)
      try {
        await page.screenshot({ path: file, fullPage: true, timeout: 30_000 })
        entry.shot = relative(OUT, file)
      } catch (e) {
        entry.problems.push({ kind: 'error-page', what: `No screenshot: ${String(e?.message ?? e).split('\n')[0]}` })
      }
      if (PHONE) {
        await page.setViewportSize({ width: 390, height: 844 })
        await page.waitForTimeout(250)
        facts.phone = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))
        await page.setViewportSize({ width: 1280, height: 900 })
      }
      if (entry.landed.split('?')[0] !== link.href.split('?')[0]) {
        facts.redirectedTo = entry.landed
      }
      entry.problems.push(...checkPage(facts, { permissions: seat.permissions }))
      if (facts.redirectedTo && /\/(login|signin|sign-in)|^\/$/.test(facts.redirectedTo)) {
        entry.problems.push({ kind: 'refused', what: `The link sent this desk to ${facts.redirectedTo}.` })
      }
      result.pages.push(entry)
    }
  } catch (e) {
    result.error = String(e?.message ?? e).split('\n')[0]
  } finally {
    await ctx.close()
  }
  const n = result.pages.reduce((a, p) => a + p.problems.length, 0) + result.navProblems.length
  log(`${seat.party} · ${seat.desk}: ${result.pages.length} pages, ${n} problems${result.error ? ` (${result.error})` : ''}`)
  return result
}

// ── Main ───────────────────────────────────────────────────────────────

/** `--report-only`: rewrite report.md from report.json, walking nothing. */
function reportOnly() {
  const j = JSON.parse(readFileSync(join(OUT, 'report.json'), 'utf8'))
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(buildJson(j.desks, j.meta), null, 2))
  writeFileSync(join(OUT, 'report.md'), withMissing(buildMarkdown(j.desks, j.meta), j.meta?.missingNamedSeats ?? []))
  console.log(`walk: report rewritten at ${join(OUT, 'report.md')}`)
}

function withMissing(md, missing) {
  return missing.length
    ? md.replace('\n## Problems by kind', `\n**Named on /demo but not seated in this world:** ${missing.join(', ')}\n\n## Problems by kind`)
    : md
}

async function main() {
  if (process.argv.includes('--report-only')) return reportOnly()
  if (BASE) {
    console.log(`walk: walking ${BASE}`)
    if (!DATABASE_URL) throw new Error('WALK_URL needs DATABASE_URL too: the seats are read from the database the app uses.')
    if (!SECRET) throw new Error('WALK_URL needs NEXTAUTH_SECRET: it is what the demo cookie is signed with.')
    if (process.env.WALK_SKIP_SEED !== '1') await seedWorld()
  } else {
    await startApp()
    console.log('walk: seeding the world')
    await seedWorld()
  }

  let { seats, missing } = await readSeats()
  if (process.env.WALK_ONLY) seats = seats.filter((s) => s.slug.includes(process.env.WALK_ONLY))
  if (seats.length === 0) throw new Error('No seats found in the seeded world.')
  console.log(`walk: ${seats.length} desks across ${new Set(seats.map((s) => s.slug)).size} companies`)

  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })

  const browser = await chromium.launch({ executablePath: chromePath() })
  const results = new Array(seats.length)
  let next = 0
  let done = 0
  const log = (s) => console.log(`walk: [${++done}/${seats.length}] ${s}`)
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, seats.length) }, async () => {
    while (next < seats.length) {
      const i = next++
      results[i] = await walkDesk(browser, seats[i], log)
    }
  }))
  await browser.close()

  // Parties in a steady order: clients, program offices, integrators, suppliers, one-person firms, workers.
  const order = ['CLIENT', 'MSP', 'GSI', 'VENDOR', 'CONSULTANT_CORP', 'WORKER']
  results.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.party.localeCompare(b.party) || a.desk.localeCompare(b.desk))
  const seconds = (Date.now() - started) / 1000
  const meta = { url: BASE, startedAt: new Date(started).toISOString(), seconds, missingNamedSeats: missing }
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(buildJson(results, meta), null, 2))
  writeFileSync(join(OUT, 'report.md'), withMissing(buildMarkdown(results, meta), missing))
  const t = tally(results)
  console.log(`walk: ${t.desks} desks, ${t.pages} pages, ${t.shots} screenshots in ${Math.round(seconds)}s`)
  console.log('walk: problems by kind', t.byKind)
  console.log(`walk: report at ${join(OUT, 'report.md')}`)
}

main()
  .then(() => { stopApp(); process.exit(0) })
  .catch((e) => { console.error('walk: stopped —', e?.message ?? e); stopApp(); process.exit(1) })
